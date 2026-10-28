import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { NotificationEventProcessor } from './eventProcessor';
import { getAdminRecipients, getManagerRecipients, getFarmPreferences } from './roles';
import { buildMissedAttendanceTemplate, buildBackgroundJobFailureTemplate } from './templates';

export interface AttendanceDeadlineCheckResult {
    checkedAt: string;
    todayDate: string;
    currentTime: string;
    deadlineTime: string;
    isPastDeadline: boolean;
    activeWorkersCount: number;
    missedWorkersCount: number;
    alertsDispatched: number;
    details: Array<{ workerId: string; workerName: string; status: string }>;
}

/**
 * Helper to get current date and time formatted in a specific timezone
 */
export function getTimeInZone(date: Date, timezone: string): { dateStr: string; timeStr: string } {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(date);

        const map: Record<string, string> = {};
        for (const p of parts) {
            map[p.type] = p.value;
        }

        const dateStr = `${map.year}-${map.month}-${map.day}`;
        const timeStr = `${map.hour}:${map.minute}`;
        return { dateStr, timeStr };
    } catch (e) {
        // Fallback to UTC if timezone string is invalid
        const iso = date.toISOString();
        return {
            dateStr: iso.slice(0, 10),
            timeStr: iso.slice(11, 16)
        };
    }
}

/**
 * Core attendance deadline evaluation logic
 */
export async function runAttendanceDeadlineCheck(
    db: admin.firestore.Firestore,
    processor: NotificationEventProcessor,
    forceRun = false
): Promise<AttendanceDeadlineCheckResult> {
    const prefs = await getFarmPreferences(db);
    const timezone = prefs.timezone || 'Africa/Kampala';
    const now = new Date();
    const { dateStr: today, timeStr: currentTime } = getTimeInZone(now, timezone);
    const deadlineTime = prefs.attendanceTimeInEnd || '07:20';

    // Verify whether the morning clock-in window has elapsed
    const isPastDeadline = currentTime > deadlineTime;

    if (!isPastDeadline && !forceRun) {
        console.log(`[Attendance Monitor] Current time ${currentTime} is before deadline ${deadlineTime} in ${timezone}. No alerts dispatched.`);
        return {
            checkedAt: now.toISOString(),
            todayDate: today,
            currentTime,
            deadlineTime,
            isPastDeadline: false,
            activeWorkersCount: 0,
            missedWorkersCount: 0,
            alertsDispatched: 0,
            details: []
        };
    }

    if (!prefs.enableEmailAlerts || !prefs.notifyAttendanceDeadlines) {
        console.log('[Attendance Monitor] Attendance deadline notifications are disabled in settings.');
        return {
            checkedAt: now.toISOString(),
            todayDate: today,
            currentTime,
            deadlineTime,
            isPastDeadline,
            activeWorkersCount: 0,
            missedWorkersCount: 0,
            alertsDispatched: 0,
            details: []
        };
    }

    // 1. Fetch active workers from Firestore
    const workersSnap = await db.collection('workers')
        .where('status', '!=', 'Inactive')
        .get();

    const activeWorkers: Array<{ id: string; fullName: string; role?: string; department?: string }> = [];
    workersSnap.forEach(doc => {
        const w = doc.data();
        activeWorkers.push({
            id: w.workerId || doc.id,
            fullName: w.fullName || 'Farm Worker',
            role: w.role,
            department: w.department
        });
    });

    const managerRecipients = await getManagerRecipients(db);
    const adminRecipients = await getAdminRecipients(db);
    const notificationRecipients = [...managerRecipients, ...adminRecipients];

    let alertsDispatched = 0;
    const details: Array<{ workerId: string; workerName: string; status: string }> = [];

    // 2. Inspect today's attendance for each active worker
    for (const worker of activeWorkers) {
        const attendanceKey = `ATT-${worker.id}-${today}`;
        const attDoc = await db.collection('attendance').doc(attendanceKey).get();

        const hasClockedIn = attDoc.exists && Boolean(attDoc.data()?.timeIn);

        if (!hasClockedIn) {
            // Worker missed morning deadline
            const eventId = NotificationEventProcessor.generateEventId(['missed_attendance', worker.id, today]);

            const template = buildMissedAttendanceTemplate({
                workerId: worker.id,
                workerName: worker.fullName,
                date: today,
                scheduledShift: `Morning Shift (${prefs.attendanceTimeInStart || '07:00'} - ${prefs.attendanceTimeOutStart || '14:00'})`,
                timeInWindow: `${prefs.attendanceTimeInStart || '07:00'} - ${deadlineTime}`,
                notes: `No clock-in record found past the ${deadlineTime} cutoff in timezone ${timezone}.`
            });

            const result = await processor.processEvent({
                eventId,
                eventType: 'MISSED_ATTENDANCE_DEADLINE',
                category: 'Attendance Alert',
                subject: `[G&S Attendance] Missed Clock-in: ${worker.fullName} (${today})`,
                htmlContent: template.html,
                textContent: template.text,
                recipients: notificationRecipients,
                severity: 'warning',
                recordId: attendanceKey,
                module: 'Attendance',
                inApp: {
                    type: 'Attendance Alert',
                    title: `Missed Check-In: ${worker.fullName}`,
                    message: `Worker ${worker.fullName} (${worker.id}) did not scan in before ${deadlineTime}.`,
                    recipientLabel: 'Farm Managers'
                }
            });

            if (result.success && !result.skipped) {
                alertsDispatched++;
            }

            details.push({
                workerId: worker.id,
                workerName: worker.fullName,
                status: result.skipped ? 'ALREADY_ALERTED' : 'ALERT_SENT'
            });
        } else {
            details.push({
                workerId: worker.id,
                workerName: worker.fullName,
                status: 'PRESENT'
            });
        }
    }

    return {
        checkedAt: now.toISOString(),
        todayDate: today,
        currentTime,
        deadlineTime,
        isPastDeadline: true,
        activeWorkersCount: activeWorkers.length,
        missedWorkersCount: details.filter(d => d.status !== 'PRESENT').length,
        alertsDispatched,
        details
    };
}

/**
 * 1. Cloud Function PubSub Scheduled Job
 * Runs every 15 minutes during the farm operational window
 */
export function createScheduledAttendanceMonitor(
    db: admin.firestore.Firestore,
    processor: NotificationEventProcessor
) {
    return functions.pubsub
        .schedule('every 15 minutes')
        .timeZone('Africa/Kampala')
        .onRun(async () => {
            try {
                const res = await runAttendanceDeadlineCheck(db, processor, false);
                console.log(`[Scheduled Attendance Monitor] Checked at ${res.checkedAt}: Dispatched ${res.alertsDispatched} alerts.`);
            } catch (err: any) {
                console.error('[Scheduled Attendance Monitor] Execution failed:', err);

                // Notify admin of background job failure
                try {
                    const adminRecipients = await getAdminRecipients(db);
                    const template = buildBackgroundJobFailureTemplate({
                        jobName: 'Scheduled Attendance Deadline Monitor',
                        failureTime: new Date().toISOString(),
                        errorMessage: err?.message || String(err),
                        affectedRecords: 'Active Farm Workforce Attendance',
                        recommendedAction: 'Check Cloud Functions logs and Firestore attendance collection.'
                    });

                    await processor.processEvent({
                        eventId: NotificationEventProcessor.generateEventId(['job_failure_att', Date.now()]),
                        eventType: 'BACKGROUND_JOB_FAILURE',
                        category: 'System Error',
                        subject: '[G&S Failure Alert] Attendance Monitor Background Job Failed',
                        htmlContent: template.html,
                        textContent: template.text,
                        recipients: adminRecipients,
                        severity: 'critical',
                        module: 'Attendance'
                    });
                } catch (notifyErr) {
                    console.error('[Scheduled Attendance Monitor] Failed to report failure:', notifyErr);
                }
            }
        });
}

/**
 * 2. HTTPS Callable Function: checkAttendanceDeadlines
 * Allows authenticated managers/admins to trigger an on-demand deadline inspection
 */
export function createCheckAttendanceCallable(
    db: admin.firestore.Firestore,
    processor: NotificationEventProcessor
) {
    return functions.https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
        }

        const forceRun = Boolean(data?.forceRun);
        try {
            return await runAttendanceDeadlineCheck(db, processor, forceRun);
        } catch (e: any) {
            console.error('[Attendance Callable] Error checking attendance:', e);
            throw new functions.https.HttpsError('internal', e?.message || 'Attendance scan failed.');
        }
    });
}

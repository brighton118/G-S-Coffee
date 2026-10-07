import { db, AppNotification } from '../db';
import { format, differenceInDays, parseISO } from 'date-fns';

/**
 * G&S COOFFEE Farm Notification & Communication Engine
 * Manages In-App Alerts, SMS Mobile Dispatching, and Automated System Scans.
 */

export interface SystemScanSummary {
    newAlertsCount: number;
    lowStockFound: number;
    chamberOverdueFound: number;
    pendingOTFound: number;
    eodGenerated: boolean;
}

class NotificationService {
    /**
     * Dispatch and record a new notification
     */
    public async createNotification(
        type: AppNotification['type'],
        title: string,
        message: string,
        channel: 'In-App' | 'SMS' | 'Email' = 'In-App',
        recipient?: string
    ): Promise<number | undefined> {
        const today = format(new Date(), 'yyyy-MM-dd');

        // Prevent duplicate alerts with same title and date
        const existing = await db.notifications
            .where({ date: today, type })
            .filter(n => n.title === title)
            .first();

        if (existing) {
            return existing.id;
        }

        // Save in-app notification
        const notifId = await db.notifications.add({
            type,
            title,
            message,
            date: today,
            read: 0,
            channel,
            recipient: recipient || 'Farm Manager'
        });

        // Record communication audit log
        await db.notificationLogs.add({
            timestamp: new Date().toISOString(),
            channel,
            recipient: recipient || 'Farm Management',
            subject: title,
            message,
            status: 'Sent'
        });

        console.log(`Notification [${channel}] Dispatched: ${title}`);
        return notifId;
    }

    /**
     * Check inventory stock levels and create alerts for low items
     */
    public async checkLowStockAlerts(): Promise<number> {
        const items = await db.inventoryItems.where('status').equals('Active').toArray();
        let createdCount = 0;

        for (const item of items) {
            if (item.quantity <= (item.minStockLevel || 5)) {
                const title = `Low Stock Alert: ${item.name}`;
                const message = `Item "${item.name}" has reached low stock (${item.quantity} ${item.unit} remaining). Reorder threshold is ${item.minStockLevel} ${item.unit}. Location: ${item.location || 'Main Store'}.`;
                
                const id = await this.createNotification('Inventory Low', title, message, 'In-App');
                if (id) createdCount++;
            }
        }

        return createdCount;
    }

    /**
     * Check Coffee Clone batches for Humid Chamber overdue duration (> 30 days)
     */
    public async checkChamberOverdueAlerts(): Promise<number> {
        const batches = await db.cloneBatches
            .where('currentStage')
            .anyOf('Humid Chamber', 'Cutting')
            .toArray();

        let createdCount = 0;
        const now = new Date();

        for (const batch of batches) {
            if (batch.dateObtained) {
                const daysInStage = differenceInDays(now, parseISO(batch.dateObtained));
                if (daysInStage > 30) {
                    const title = `Chamber Overdue: Batch ${batch.batchId} (${batch.variety})`;
                    const message = `Clone Batch ${batch.batchId} (Variety ${batch.variety}, Quantity: ${batch.currentQuantity}) has been in Humid Chamber for ${daysInStage} days (Target: max 30 days). Ready for transition to First Hardening.`;
                    
                    const id = await this.createNotification('Chamber Overdue', title, message, 'In-App');
                    if (id) createdCount++;
                }
            }
        }

        return createdCount;
    }

    /**
     * Check for unapproved overtime attendance records
     */
    public async checkPendingOvertimeAlerts(): Promise<number> {
        const pendingOT = await db.attendance
            .where('overtimeStatus')
            .equals('Pending')
            .toArray();

        if (pendingOT.length > 0) {
            const totalHours = pendingOT.reduce((sum, a) => sum + (a.overtimeHours || 0), 0);
            const title = `Pending Overtime Approvals (${pendingOT.length} shifts)`;
            const message = `There are ${pendingOT.length} attendance records with unapproved overtime totaling ${totalHours.toFixed(1)} hrs awaiting supervisor verification for Payroll integration.`;
            
            const id = await this.createNotification('Pending Overtime', title, message, 'In-App');
            return id ? 1 : 0;
        }

        return 0;
    }

    /**
     * Check and generate End of Day (EOD) Attendance Summary Report (past 17:00)
     */
    public async checkEODAttendanceReport(): Promise<boolean> {
        const now = new Date();
        // Check if past 17:00 (5:00 PM)
        if (now.getHours() >= 17) {
            const today = format(now, 'yyyy-MM-dd');
            const existing = await db.notifications.where({ date: today, type: 'EOD_ATTENDANCE' }).first();

            if (!existing) {
                const allWorkers = await db.workers.where('status').equals('Active').toArray();
                const todayAttendance = await db.attendance.where('date').equals(today).toArray();

                const totalWorkers = allWorkers.length;
                const presentCount = todayAttendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
                const lateCount = todayAttendance.filter(a => a.status === 'Late').length;
                const absentCount = Math.max(0, totalWorkers - presentCount);

                await this.createNotification(
                    'EOD_ATTENDANCE',
                    `End of Day Attendance Summary - ${today}`,
                    `Shift Closed (17:00): Out of ${totalWorkers} active registered workers, ${presentCount} were present (${lateCount} late) and ${absentCount} were formally absent.`,
                    'In-App',
                    'Farm General Manager'
                );
                return true;
            }
        }
        return false;
    }

    /**
     * Run all system background checks and return summary
     */
    public async runAllNotificationChecks(): Promise<SystemScanSummary> {
        const lowStock = await this.checkLowStockAlerts();
        const chamberOverdue = await this.checkChamberOverdueAlerts();
        const pendingOT = await this.checkPendingOvertimeAlerts();
        const eod = await this.checkEODAttendanceReport();

        return {
            newAlertsCount: lowStock + chamberOverdue + pendingOT + (eod ? 1 : 0),
            lowStockFound: lowStock,
            chamberOverdueFound: chamberOverdue,
            pendingOTFound: pendingOT,
            eodGenerated: eod
        };
    }
}

export const notificationService = new NotificationService();

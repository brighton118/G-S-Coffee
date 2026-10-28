import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { BrevoService, BrevoEmailRequest, BrevoAttachment } from './brevoService';
import {
    buildAdminAlertTemplate,
    buildMissedAttendanceTemplate,
    buildPayrollRunTemplate,
    buildWorkerPayslipTemplate,
    buildSalesInvoiceTemplate,
    buildInventoryAlertTemplate,
    buildReportDeliveryTemplate
} from './templates';

admin.initializeApp();
const db = admin.firestore();

const brevoService = new BrevoService();

/**
 * 1. HTTPS Callable Function: sendBrevoEmail
 * Secured for authenticated users (Admins / Managers)
 */
export const sendBrevoEmail = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
    // 1. Verify Authentication
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Authentication required to dispatch transactional emails.'
        );
    }

    const {
        templateType,
        templateData,
        to,
        subject,
        htmlContent,
        textContent,
        attachment,
        category
    } = data;

    let finalHtml = htmlContent;
    let finalText = textContent;
    let finalSubject = subject;

    // Build from template if templateType is supplied
    if (templateType && templateData) {
        switch (templateType) {
            case 'adminAlert': {
                const built = buildAdminAlertTemplate(templateData);
                finalHtml = built.html;
                finalText = built.text;
                finalSubject = finalSubject || templateData.title;
                break;
            }
            case 'missedAttendance': {
                const built = buildMissedAttendanceTemplate(templateData);
                finalHtml = built.html;
                finalText = built.text;
                finalSubject = finalSubject || `[G&S FARMS Alert] Missed Attendance - ${templateData.workerName}`;
                break;
            }
            case 'payrollRun': {
                const built = buildPayrollRunTemplate(templateData);
                finalHtml = built.html;
                finalText = built.text;
                finalSubject = finalSubject || `[G&S FARMS Payroll] ${templateData.payrollMonth} Summary`;
                break;
            }
            case 'workerPayslip': {
                const built = buildWorkerPayslipTemplate(templateData);
                finalHtml = built.html;
                finalText = built.text;
                finalSubject = finalSubject || `[G&S FARMS] Payslip for ${templateData.payrollMonth}`;
                break;
            }
            case 'salesInvoice': {
                const built = buildSalesInvoiceTemplate(templateData);
                finalHtml = built.html;
                finalText = built.text;
                finalSubject = finalSubject || `[G&S FARMS Invoice] Receipt #${templateData.invoiceNumber}`;
                break;
            }
            case 'inventoryAlert': {
                const built = buildInventoryAlertTemplate(templateData);
                finalHtml = built.html;
                finalText = built.text;
                finalSubject = finalSubject || `[G&S FARMS Alert] ${templateData.alertType} - ${templateData.itemName}`;
                break;
            }
            case 'reportDelivery': {
                const built = buildReportDeliveryTemplate(templateData);
                finalHtml = built.html;
                finalText = built.text;
                finalSubject = finalSubject || `[G&S FARMS Report] ${templateData.reportName}`;
                break;
            }
            default:
                break;
        }
    }

    if (!finalHtml) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing email content or invalid template configuration.'
        );
    }

    // Format recipients
    let recipients: { email: string; name?: string }[] = [];
    if (Array.isArray(to)) {
        recipients = to.map(r => typeof r === 'string' ? { email: r } : r);
    } else if (typeof to === 'string') {
        recipients = [{ email: to }];
    } else {
        const defaultAdmin = process.env.ADMIN_NOTIFICATION_EMAIL || 'gs.farms.ug@gmail.com';
        recipients = [{ email: defaultAdmin }];
    }

    // Attachments validation
    let validAttachments: BrevoAttachment[] | undefined;
    if (attachment && Array.isArray(attachment)) {
        validAttachments = attachment
            .filter((a: any) => a && a.name && a.content)
            .map((a: any) => ({
                name: String(a.name),
                content: String(a.content)
            }));
    }

    const request: BrevoEmailRequest = {
        to: recipients,
        subject: finalSubject || 'G&S Coffee Farm Notification',
        htmlContent: finalHtml,
        textContent: finalText,
        attachment: validAttachments,
        tags: [category || 'general']
    };

    const result = await brevoService.sendEmail(request);

    // Audit log in Cloud Firestore
    try {
        await db.collection('mailLogs').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            callerUid: context.auth.uid,
            callerEmail: context.auth.token.email || 'authenticated-user',
            recipients: recipients.map(r => r.email),
            subject: request.subject,
            category: category || templateType || 'general',
            success: result.success,
            messageId: result.messageId || null,
            error: result.error || null,
            hasAttachments: Boolean(validAttachments && validAttachments.length > 0)
        });
    } catch (logErr) {
        console.warn('[Brevo] Failed to write mail log:', logErr);
    }

    if (!result.success) {
        throw new functions.https.HttpsError('internal', result.error || 'Failed to dispatch email via Brevo.');
    }

    return {
        success: true,
        messageId: result.messageId,
        recipients: recipients.map(r => r.email)
    };
});

/**
 * 2. Firestore Trigger: processMailQueue
 * Automatically processes documents created in Cloud Firestore `mail/{mailId}`
 */
export const processMailQueue = functions.firestore
    .document('mail/{mailId}')
    .onCreate(async (snap, context) => {
        const data = snap.data();
        if (!data) return;

        // Skip if already processed or has deliveryStatus
        if (data.deliveryStatus && data.deliveryStatus !== 'pending') {
            return;
        }

        const mailId = context.params.mailId;
        console.log(`[Brevo Queue] Processing mail document: ${mailId}`);

        try {
            let recipients: { email: string; name?: string }[] = [];
            if (Array.isArray(data.to)) {
                recipients = data.to.map((r: any) => typeof r === 'string' ? { email: r } : r);
            } else if (typeof data.to === 'string') {
                recipients = [{ email: data.to }];
            }

            const subject = data.message?.subject || data.subject || 'G&S Coffee Farm Alert';
            const htmlContent = data.message?.html || data.html;
            const textContent = data.message?.text || data.text;

            if (!htmlContent) {
                await snap.ref.update({
                    deliveryStatus: 'error',
                    deliveryError: 'Missing HTML content body in queued document.',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return;
            }

            let attachments: BrevoAttachment[] | undefined;
            if (data.attachments && Array.isArray(data.attachments)) {
                attachments = data.attachments;
            }

            const result = await brevoService.sendEmail({
                to: recipients,
                subject,
                htmlContent,
                textContent,
                attachment: attachments,
                tags: [data.metadata?.category || 'queued-mail']
            });

            if (result.success) {
                await snap.ref.update({
                    deliveryStatus: 'sent',
                    brevoMessageId: result.messageId,
                    sentAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await snap.ref.update({
                    deliveryStatus: 'failed',
                    deliveryError: result.error,
                    failedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (queueErr: any) {
            console.error(`[Brevo Queue] Error processing ${mailId}:`, queueErr);
            await snap.ref.update({
                deliveryStatus: 'failed',
                deliveryError: queueErr?.message || 'Unexpected queue processing failure',
                failedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });

/**
 * 3. HTTPS Callable Function: getBrevoServiceStatus
 * Lets admins check if Brevo is configured and ready without revealing the API key
 */
export const getBrevoServiceStatus = functions.https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const info = brevoService.getSenderInfo();
    return {
        isConfigured: info.isConfigured,
        senderEmail: info.email,
        senderName: info.name,
        adminEmail: process.env.ADMIN_NOTIFICATION_EMAIL || 'gs.farms.ug@gmail.com',
        provider: 'Brevo (Sendinblue) Transactional SMTP API v3'
    };
});

/**
 * -------------------------------------------------------------
 * Event-Driven Role-Based Triggers and Schedulers
 * -------------------------------------------------------------
 */
import { NotificationEventProcessor } from './eventProcessor';
import {
    createSalesOrderTrigger,
    createInventoryItemTrigger,
    createCloneBatchTrigger,
    createWorkerTrigger,
    createAttendanceTrigger,
    createSettingsAuditTrigger,
    createNurseryStageTrigger,
    createPayrollRecordTrigger
} from './triggers';
import {
    createScheduledAttendanceMonitor,
    createCheckAttendanceCallable
} from './attendanceScheduler';

const eventProcessor = new NotificationEventProcessor(db, brevoService);

// 1. Sales & Revenue Triggers
export const onSaleOrderWrite = createSalesOrderTrigger(db, eventProcessor);

// 2. Inventory Items & Stock Shortages / Expiry Triggers
export const onInventoryItemWrite = createInventoryItemTrigger(db, eventProcessor);

// 3. Nursery Management Triggers
export const onCloneBatchWrite = createCloneBatchTrigger(db, eventProcessor);
export const onHumidChamberCreate = createNurseryStageTrigger(db, eventProcessor, 'Humid Chamber', 'productionHumidChamber');
export const onFirstHardeningCreate = createNurseryStageTrigger(db, eventProcessor, 'First Hardening', 'productionFirstHardening');
export const onSecondHardeningCreate = createNurseryStageTrigger(db, eventProcessor, 'Second Hardening', 'productionSecondHardening');
export const onSortingCreate = createNurseryStageTrigger(db, eventProcessor, 'Sorting', 'productionSortings');

// 4. Worker Management Triggers
export const onWorkerWrite = createWorkerTrigger(db, eventProcessor);

// 5. Attendance & Overtime Triggers
export const onAttendanceWrite = createAttendanceTrigger(db, eventProcessor);

// 6. Payroll Triggers
export const onPayrollRecordWrite = createPayrollRecordTrigger(db, eventProcessor);

// 7. System Settings Audit Triggers
export const onSettingsAuditWrite = createSettingsAuditTrigger(db, eventProcessor);

// 8. Attendance Deadline Scheduled Monitor & Callable
export const scheduledAttendanceMonitor = createScheduledAttendanceMonitor(db, eventProcessor);
export const checkAttendanceDeadlines = createCheckAttendanceCallable(db, eventProcessor);


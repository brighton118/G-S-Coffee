import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { BrevoService, BrevoEmailRequest, BrevoAttachment } from './brevoService';
import { RecipientInfo } from './roles';

export interface DispatchNotificationEventOptions {
    eventId: string;
    eventType: string;
    category: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    recipients: RecipientInfo[];
    severity?: 'info' | 'warning' | 'critical';
    recordId?: string;
    module?: string;
    summary?: string;
    attachments?: BrevoAttachment[];
    inApp?: {
        type: string;
        title: string;
        message: string;
        recipientLabel?: string;
    };
}

export interface EventProcessingResult {
    success: boolean;
    skipped?: boolean;
    reason?: string;
    messageId?: string;
    recipientCount: number;
    eventId: string;
    error?: string;
}

export class NotificationEventProcessor {
    private db: admin.firestore.Firestore;
    private brevoService: BrevoService;

    // Collections that MUST NEVER trigger notification cascades
    private static readonly EXCLUDED_COLLECTIONS = new Set([
        'mail',
        'mailLogs',
        'processedEvents',
        'notificationLogs',
        'notifications'
    ]);

    constructor(db: admin.firestore.Firestore, brevoService: BrevoService) {
        this.db = db;
        this.brevoService = brevoService;
    }

    /**
     * Checks if a collection is excluded to prevent recursive loops
     */
    public static isExcludedCollection(collectionName: string): boolean {
        return NotificationEventProcessor.EXCLUDED_COLLECTIONS.has(collectionName);
    }

    /**
     * Generates a deterministic SHA256 event ID
     */
    public static generateEventId(parts: (string | number | undefined | null)[]): string {
        const payload = parts.map(p => (p === null || p === undefined ? '' : String(p))).join('::');
        return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
    }

    /**
     * Idempotently processes and dispatches a notification event.
     * Prevents duplicate emails, handles Firestore retries, and tracks states.
     */
    public async processEvent(options: DispatchNotificationEventOptions): Promise<EventProcessingResult> {
        const { eventId, eventType, category, subject, htmlContent, textContent, recipients, severity, recordId, module, summary, attachments, inApp } = options;

        if (!recipients || recipients.length === 0) {
            console.log(`[EventProcessor] No recipients specified for event ${eventId} (${eventType}). Skipping email dispatch.`);
            return {
                success: true,
                skipped: true,
                reason: 'NO_RECIPIENTS',
                recipientCount: 0,
                eventId
            };
        }

        const eventRef = this.db.collection('processedEvents').doc(eventId);

        // 1. Check idempotency state in Firestore
        const eventDoc = await eventRef.get();
        if (eventDoc.exists) {
            const data = eventDoc.data();
            if (data?.status === 'ACCEPTED_BY_BREVO' || data?.status === 'QUEUED') {
                console.log(`[EventProcessor] Duplicate event suppressed: ${eventId} (${eventType}) status: ${data?.status}`);
                return {
                    success: true,
                    skipped: true,
                    reason: 'DUPLICATE_SUPPRESSED',
                    messageId: data?.brevoMessageId,
                    recipientCount: recipients.length,
                    eventId
                };
            }
        }

        // 2. Mark event as RECORDED / PROCESSING
        await eventRef.set({
            eventId,
            eventType,
            category,
            subject,
            severity: severity || 'info',
            recordId: recordId || null,
            module: module || null,
            summary: summary || null,
            recipients: recipients.map(r => r.email),
            status: 'RECORDED',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            attempts: admin.firestore.FieldValue.increment(1)
        }, { merge: true });

        // 3. Coordinate in-app notification concurrently
        if (inApp) {
            try {
                const today = new Date().toISOString().split('T')[0];
                await this.db.collection('notifications').add({
                    type: inApp.type || 'Manager Entry',
                    title: inApp.title,
                    message: inApp.message,
                    date: today,
                    read: 0,
                    channel: 'Email',
                    recipient: inApp.recipientLabel || 'Farm Management',
                    severity: severity || 'info',
                    recordId: recordId || null,
                    module: module || null,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (inAppErr) {
                console.warn(`[EventProcessor] In-app notification creation note for ${eventId}:`, inAppErr);
            }
        }

        // 4. Dispatch Email via Brevo Service
        const emailRequest: BrevoEmailRequest = {
            to: recipients,
            subject,
            htmlContent,
            textContent,
            attachment: attachments,
            tags: [category || eventType || 'operational-alert']
        };

        const result = await this.brevoService.sendEmail(emailRequest);

        // 5. Update delivery state in processedEvents
        if (result.success) {
            await eventRef.update({
                status: 'ACCEPTED_BY_BREVO',
                brevoMessageId: result.messageId || null,
                deliveredAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Write audit record to mailLogs
            try {
                await this.db.collection('mailLogs').add({
                    eventId,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    recipients: recipients.map(r => r.email),
                    subject,
                    category,
                    success: true,
                    messageId: result.messageId || null,
                    error: null,
                    severity: severity || 'info',
                    recordId: recordId || null
                });
            } catch (logErr) {
                console.warn(`[EventProcessor] MailLog write note for ${eventId}:`, logErr);
            }

            return {
                success: true,
                messageId: result.messageId,
                recipientCount: recipients.length,
                eventId
            };
        } else {
            await eventRef.update({
                status: 'FAILED',
                error: result.error || 'Failed to dispatch via Brevo',
                failedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            try {
                await this.db.collection('mailLogs').add({
                    eventId,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    recipients: recipients.map(r => r.email),
                    subject,
                    category,
                    success: false,
                    messageId: null,
                    error: result.error || 'Brevo API call failed',
                    severity: severity || 'warning',
                    recordId: recordId || null
                });
            } catch (logErr) {
                console.warn(`[EventProcessor] MailLog failure write note:`, logErr);
            }

            return {
                success: false,
                error: result.error,
                recipientCount: recipients.length,
                eventId
            };
        }
    }
}

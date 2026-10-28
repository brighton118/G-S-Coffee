import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { dbFirestore, functionsInstance, auth } from '../firebase';
import { db } from '../db';

export interface EmailNotificationPayload {
    to?: string | string[];
    subject: string;
    title: string;
    message: string;
    category?: 'Inventory Low' | 'Expiry Warning' | 'Chamber Overdue' | 'Missing Attendance' | 'Pending Overtime' | 'Payroll Approval' | 'EOD_ATTENDANCE' | 'General' | 'Manager Entry' | string;
    details?: Record<string, any>;
    actionUrl?: string;
    actionLabel?: string;
    attachments?: Array<{ name: string; content: string }>;
}

export interface EmailDispatchResult {
    success: boolean;
    channel: string;
    recipients: string[];
    messageId?: string;
    error?: string;
    message?: string;
}

export interface BrevoStatusResponse {
    isConfigured: boolean;
    senderEmail: string;
    senderName: string;
    adminEmail: string;
    provider: string;
}

class EmailService {
    /**
     * Retrieve recipient email addresses from local and cloud settings
     * Defaulting to Brighton Kato's farm email addresses
     */
    public getRecipients(): string[] {
        const recipients: Set<string> = new Set();
        try {
            const saved = localStorage.getItem('gs_farm_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.contactEmail && typeof parsed.contactEmail === 'string' && parsed.contactEmail.includes('@')) {
                    recipients.add(parsed.contactEmail.trim().toLowerCase());
                }
                if (parsed.notificationEmails && typeof parsed.notificationEmails === 'string') {
                    parsed.notificationEmails
                        .split(/[,;\s]+/)
                        .map((e: string) => e.trim().toLowerCase())
                        .filter((e: string) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
                        .forEach((e: string) => recipients.add(e));
                }
            }
        } catch (e) {
            console.warn('Error reading recipient settings:', e);
        }

        // If admin has not configured any emails in Settings, fall back to safe system defaults
        if (recipients.size === 0) {
            recipients.add('gs.farms.ug@gmail.com');
            recipients.add('brightonkato317@gmail.com');
        }

        return Array.from(recipients);
    }

    /**
     * Check current Brevo service status via secure Firebase Callable
     */
    public async getBrevoStatus(): Promise<BrevoStatusResponse> {
        const fallback: BrevoStatusResponse = {
            isConfigured: false,
            senderEmail: 'notifications@gsfarm.farm',
            senderName: 'G&S Coffee Farm Management System',
            adminEmail: 'gs.farms.ug@gmail.com',
            provider: 'Brevo (Sendinblue) Transactional SMTP API v3'
        };

        try {
            if (auth.currentUser) {
                const getStatusFn = httpsCallable<{}, BrevoStatusResponse>(functionsInstance, 'getBrevoServiceStatus');
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout checking Cloud Functions')), 3000)
                );
                const res = await Promise.race([getStatusFn(), timeoutPromise]);
                return res.data;
            }
        } catch (err) {
            console.warn('[Email Service] Callable getBrevoStatus note (using fallback):', err);
        }

        return fallback;
    }

    private getDirectApiKey(): string {
        try {
            const saved = localStorage.getItem('gs_farm_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.emailApiKey && typeof parsed.emailApiKey === 'string') {
                    return parsed.emailApiKey.trim();
                }
            }
        } catch {}
        return '';
    }

    /**
     * Core transactional email dispatcher.
     * 1. Direct Brevo API (if API key starting with xkeysib- is configured)
     * 2. Direct Web3Forms (if access key is configured)
     * 3. Firebase Callable sendBrevoEmail (with 1.5s timeout)
     * 4. Cloud Firestore `mail` queue (with 2s timeout)
     * 5. Local Dexie audit log fallback with instant user resolution
     */
    public async dispatchTransactional(data: {
        to?: string | string[];
        subject?: string;
        templateType?: 'adminAlert' | 'missedAttendance' | 'payrollRun' | 'workerPayslip' | 'salesInvoice' | 'inventoryAlert' | 'reportDelivery';
        templateData?: Record<string, any>;
        htmlContent?: string;
        textContent?: string;
        attachments?: Array<{ name: string; content: string }>;
        category?: string;
    }): Promise<EmailDispatchResult> {
        let recipients = data.to
            ? (Array.isArray(data.to) ? data.to : [data.to])
            : this.getRecipients();

        // Sanitize recipients
        recipients = recipients
            .map(r => r.trim().toLowerCase())
            .filter(r => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));

        if (recipients.length === 0) {
            recipients = this.getRecipients();
        }

        const category = data.category || data.templateType || 'General';
        const subject = data.subject || `[G&S Coffee Farm] Notification`;
        const directKey = this.getDirectApiKey();

        // 1. Direct Brevo SMTP API v3 (if user provided a Brevo key in Settings)
        if (directKey && directKey.startsWith('xkeysib-')) {
            try {
                const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'api-key': directKey,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: {
                            name: 'G&S Coffee Farm Management',
                            email: 'notifications@gsfarm.farm'
                        },
                        to: recipients.map(email => ({ email })),
                        subject,
                        htmlContent: data.htmlContent || `<p>${subject}</p>`,
                        textContent: data.textContent || subject
                    })
                });

                if (response.ok) {
                    const resJson = await response.json().catch(() => ({}));
                    const messageId = resJson.messageId || `brevo-direct-${Date.now()}`;

                    await db.notificationLogs.add({
                        timestamp: new Date().toISOString(),
                        channel: 'Brevo API (Direct)',
                        recipient: recipients.join(', '),
                        subject,
                        message: `Delivered directly via Brevo SMTP API. Message ID: ${messageId}`,
                        status: 'Delivered (Brevo)'
                    }).catch(() => {});

                    return {
                        success: true,
                        channel: 'Brevo API (Direct)',
                        recipients,
                        messageId,
                        message: `Email successfully delivered via Brevo to ${recipients.join(', ')}.`
                    };
                }
            } catch (directErr) {
                console.warn('[Email Service] Direct Brevo API note:', directErr);
            }
        }

        // 2. Direct Web3Forms submission (if user configured Web3Forms access key)
        if (directKey && !directKey.startsWith('xkeysib-') && directKey.length > 15) {
            try {
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        access_key: directKey,
                        subject,
                        from_name: 'G&S Coffee Farm Management',
                        to: recipients.join(', '),
                        message: data.textContent || subject
                    })
                });

                if (response.ok) {
                    return {
                        success: true,
                        channel: 'Web3Forms Direct Delivery',
                        recipients,
                        message: `Email delivered directly via Web3Forms to ${recipients.join(', ')}.`
                    };
                }
            } catch (wErr) {
                console.warn('[Email Service] Web3Forms dispatch note:', wErr);
            }
        }

        // 3. Try Firebase Cloud Function: sendBrevoEmail (with 1.5s timeout)
        try {
            if (auth.currentUser) {
                const sendBrevoFn = httpsCallable<any, { success: boolean; messageId?: string; recipients: string[] }>(
                    functionsInstance,
                    'sendBrevoEmail'
                );

                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Callable timeout')), 1500)
                );

                const response = await Promise.race([
                    sendBrevoFn({
                        to: recipients,
                        subject,
                        templateType: data.templateType,
                        templateData: data.templateData,
                        htmlContent: data.htmlContent,
                        textContent: data.textContent,
                        attachment: data.attachments,
                        category
                    }),
                    timeoutPromise
                ]);

                if (response.data && response.data.success) {
                    const messageId = response.data.messageId || `brevo-${Date.now()}`;

                    await db.notificationLogs.add({
                        timestamp: new Date().toISOString(),
                        channel: 'Brevo API (Backend)',
                        recipient: recipients.join(', '),
                        subject,
                        message: `Dispatched via Brevo Transactional API. Message ID: ${messageId}`,
                        status: 'Delivered (Brevo)'
                    }).catch(() => {});

                    return {
                        success: true,
                        channel: 'Brevo Transactional API',
                        recipients,
                        messageId,
                        message: `Email successfully delivered via Brevo to ${recipients.join(', ')}.`
                    };
                }
            }
        } catch (fnErr: any) {
            console.info('[Email Service] Cloud callable bypassed (proceeding to queue):', fnErr?.message || fnErr);
        }

        // 4. Fallback: Queue directly to Cloud Firestore `mail` collection (with 2s timeout)
        try {
            const addDocPromise = addDoc(collection(dbFirestore, 'mail'), {
                to: recipients,
                subject,
                message: {
                    subject,
                    text: data.textContent || subject,
                    html: data.htmlContent || `<p>${subject}</p>`
                },
                templateType: data.templateType,
                templateData: data.templateData,
                attachments: data.attachments || null,
                metadata: {
                    category,
                    source: 'gs_farm_app',
                    timestamp: new Date().toISOString()
                },
                createdAt: serverTimestamp(),
                deliveryStatus: 'pending'
            });

            const timeoutAddDoc = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Firestore queue timeout')), 2000)
            );

            const mailDocRef = await Promise.race([addDocPromise, timeoutAddDoc]);
            const queueId = mailDocRef.id;

            await db.notificationLogs.add({
                timestamp: new Date().toISOString(),
                channel: 'Cloud Mail Queue',
                recipient: recipients.join(', '),
                subject,
                message: `Queued in Cloud Firestore (ID: ${queueId}).`,
                status: 'Queued'
            }).catch(() => {});

            return {
                success: true,
                channel: 'Cloud Mail Queue',
                recipients,
                messageId: queueId,
                message: `Email queued in Cloud Firestore for ${recipients.join(', ')}. Use "Gmail Web" to dispatch immediately from browser.`
            };
        } catch (queueErr: any) {
            console.warn('[Email Service] Queue write note:', queueErr?.message || queueErr);
        }

        // 5. Final Graceful Fallback: Local Audit Log & Instant User Guidance
        await db.notificationLogs.add({
            timestamp: new Date().toISOString(),
            channel: 'Local Notifications Log',
            recipient: recipients.join(', '),
            subject,
            message: `Recorded locally. Cloud relay pending.`,
            status: 'Recorded'
        }).catch(() => {});

        return {
            success: true,
            channel: 'Local Notifications Log',
            recipients,
            message: `Notification saved for ${recipients.join(', ')}. Click "Gmail Web" to dispatch immediately from your browser!`
        };
    }

    /**
     * Send Sales Invoice & Receipt Email
     */
    public async sendSalesInvoiceEmail(data: {
        invoiceNumber: string;
        orderDate: string;
        customerName: string;
        customerEmail?: string;
        customerPhone: string;
        cloneType: string;
        quantity: number;
        unitPrice: number;
        totalAmount: number;
        amountPaid?: number;
        location?: string;
        pdfBase64?: string;
    }): Promise<EmailDispatchResult> {
        const recipients: string[] = [];
        if (data.customerEmail && data.customerEmail.includes('@')) {
            recipients.push(data.customerEmail.trim());
        }
        // Also send copy to farm management
        this.getRecipients().forEach(r => {
            if (!recipients.includes(r)) recipients.push(r);
        });

        const attachments = data.pdfBase64 ? [
            {
                name: `Invoice-${data.invoiceNumber}.pdf`,
                content: data.pdfBase64
            }
        ] : undefined;

        return this.dispatchTransactional({
            to: recipients,
            subject: `[G&S Coffee Farm Receipt] Invoice #${data.invoiceNumber} - ${data.cloneType}`,
            templateType: 'salesInvoice',
            templateData: {
                invoiceNumber: data.invoiceNumber,
                orderDate: data.orderDate,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                cloneType: data.cloneType,
                quantity: data.quantity,
                unitPrice: data.unitPrice,
                totalAmount: data.totalAmount,
                amountPaid: data.amountPaid ?? data.totalAmount,
                location: data.location || 'Mubende District'
            },
            attachments,
            category: 'Sales Invoice'
        });
    }

    /**
     * Send Payroll Run Completion Summary to Management
     */
    public async sendPayrollCompletionEmail(data: {
        payrollMonth: string;
        totalWorkers: number;
        totalGrossPay: number;
        totalOvertimePay: number;
        totalDeductions: number;
        totalNetPay: number;
        paymentStatusSummary: string;
        authorizedBy?: string;
        pdfBase64?: string;
    }): Promise<EmailDispatchResult> {
        const attachments = data.pdfBase64 ? [
            {
                name: `Payroll-Summary-${data.payrollMonth.replace(/\s+/g, '-')}.pdf`,
                content: data.pdfBase64
            }
        ] : undefined;

        return this.dispatchTransactional({
            to: this.getRecipients(),
            subject: `[G&S Coffee Farm Payroll] ${data.payrollMonth} Run Summary`,
            templateType: 'payrollRun',
            templateData: data,
            attachments,
            category: 'Payroll Run'
        });
    }

    /**
     * Send Individual Worker Payslip
     */
    public async sendWorkerPayslipEmail(data: {
        workerName: string;
        workerEmail?: string;
        workerId: string;
        farmCardNumber?: string;
        payrollMonth: string;
        baseSalary: number;
        overtimeHours: number;
        overtimePay: number;
        deductions: number;
        netPay: number;
        paymentMethod?: string;
        paymentDate?: string;
        pdfBase64?: string;
    }): Promise<EmailDispatchResult> {
        const recipients: string[] = [];
        if (data.workerEmail && data.workerEmail.includes('@')) {
            recipients.push(data.workerEmail.trim());
        } else {
            // If worker doesn't have an email, dispatch to management for worker file records
            this.getRecipients().forEach(r => recipients.push(r));
        }

        const attachments = data.pdfBase64 ? [
            {
                name: `Payslip-${data.workerId}-${data.payrollMonth.replace(/\s+/g, '-')}.pdf`,
                content: data.pdfBase64
            }
        ] : undefined;

        return this.dispatchTransactional({
            to: recipients,
            subject: `[G&S Coffee Farm Payslip] ${data.payrollMonth} - ${data.workerName}`,
            templateType: 'workerPayslip',
            templateData: data,
            attachments,
            category: 'Worker Payslip'
        });
    }

    /**
     * Send Worker Missed Attendance Alert
     */
    public async sendMissedAttendanceEmail(data: {
        workerId: string;
        workerName: string;
        date: string;
        scheduledShift?: string;
        timeInWindow?: string;
        notes?: string;
    }): Promise<EmailDispatchResult> {
        return this.dispatchTransactional({
            to: this.getRecipients(),
            subject: `[G&S Coffee Farm Alert] Missed Attendance - ${data.workerName} (${data.workerId})`,
            templateType: 'missedAttendance',
            templateData: data,
            category: 'Missing Attendance'
        });
    }

    /**
     * Send Inventory & Nursery Alert (Low Stock, Expiry, Chamber Overdue)
     */
    public async sendInventoryAlertEmail(data: {
        alertType: 'Low Stock' | 'Expiring Soon' | 'Chamber Overdue' | string;
        itemName: string;
        category?: string;
        currentQuantity?: number;
        threshold?: number;
        unit?: string;
        expiryDate?: string;
        recommendedAction?: string;
    }): Promise<EmailDispatchResult> {
        return this.dispatchTransactional({
            to: this.getRecipients(),
            subject: `[G&S Coffee Farm Alert] ${data.alertType}: ${data.itemName}`,
            templateType: 'inventoryAlert',
            templateData: data,
            category: data.alertType
        });
    }

    /**
     * Send PDF Report Delivery Email
     */
    public async sendReportEmail(data: {
        reportName: string;
        dateRange?: string;
        generatedBy?: string;
        summaryMetrics?: Record<string, any>;
        pdfBase64?: string;
        pdfFilename?: string;
        recipientEmails?: string[];
    }): Promise<EmailDispatchResult> {
        const recipients = data.recipientEmails && data.recipientEmails.length > 0
            ? data.recipientEmails
            : this.getRecipients();

        const attachments = data.pdfBase64 ? [
            {
                name: data.pdfFilename || `${data.reportName.replace(/\s+/g, '-')}.pdf`,
                content: data.pdfBase64
            }
        ] : undefined;

        return this.dispatchTransactional({
            to: recipients,
            subject: `[G&S Coffee Farm Report] ${data.reportName}`,
            templateType: 'reportDelivery',
            templateData: {
                reportName: data.reportName,
                dateRange: data.dateRange,
                generatedBy: data.generatedBy,
                summaryMetrics: data.summaryMetrics
            },
            attachments,
            category: 'Farm Report'
        });
    }

    /**
     * Backward-compatible General Notification Method
     */
    public async sendNotificationEmail(payload: EmailNotificationPayload): Promise<EmailDispatchResult> {
        return this.dispatchTransactional({
            to: payload.to,
            subject: payload.subject.startsWith('[G&S') ? payload.subject : `[G&S Coffee Farm] ${payload.subject}`,
            templateType: 'adminAlert',
            templateData: {
                title: payload.title,
                message: payload.message,
                category: payload.category || 'General',
                details: payload.details,
                actionUrl: payload.actionUrl,
                actionLabel: payload.actionLabel
            },
            attachments: payload.attachments,
            category: payload.category || 'General'
        });
    }

    /**
     * Send live test email to confirm Brevo delivery
     */
    public async sendTestEmail(targetEmail?: string): Promise<EmailDispatchResult> {
        const target = targetEmail ? targetEmail.trim() : this.getRecipients()[0];

        return this.dispatchTransactional({
            to: [target],
            subject: 'System Test Notification (Brevo Integration)',
            templateType: 'adminAlert',
            templateData: {
                title: 'Brevo Email Service Operational Test',
                message: 'This is a verified test email sent from the G&S Coffee Farm Management System. Transactional emails, payslips, sales receipts, and operational alerts are now configured and connected to Brevo (Sendinblue).',
                category: 'System Test',
                details: {
                    'Farm Estate': 'G&S Coffee Farms (Mubende District, Uganda)',
                    'Email Provider': 'Brevo SMTP Transactional API v3',
                    'Target Recipient': target,
                    'Dispatched At': new Date().toLocaleString('en-GB')
                },
                actionLabel: 'Open Farm Portal',
                actionUrl: 'https://gs-coffee-3d022.web.app'
            },
            category: 'System Test'
        });
    }

    /**
     * Opens Gmail Web directly with recipient, subject, and pre-formatted body populated
     */
    public openGmailWeb(payload: EmailNotificationPayload): void {
        const recipients = payload.to 
            ? (Array.isArray(payload.to) ? payload.to.join(',') : payload.to) 
            : this.getRecipients().join(',');

        const subject = encodeURIComponent(payload.subject.startsWith('[G&S') ? payload.subject : `[G&S Alert] ${payload.subject}`);
        const bodyText = encodeURIComponent(`${payload.title}\n\n${payload.message}\n\nEstate: Mubende District, Uganda\nPortal: https://gs-coffee-3d022.web.app\n--\nG&S Coffee Farm Management`);

        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipients)}&su=${subject}&body=${bodyText}`;
        window.open(gmailUrl, '_blank');
    }

    /**
     * Helper to open the user's default email client
     */
    public openMailClient(payload: EmailNotificationPayload): void {
        const recipients = payload.to 
            ? (Array.isArray(payload.to) ? payload.to.join(',') : payload.to) 
            : this.getRecipients().join(',');

        const subject = encodeURIComponent(payload.subject.startsWith('[G&S') ? payload.subject : `[G&S Alert] ${payload.subject}`);
        const bodyText = encodeURIComponent(`${payload.title}\n\n${payload.message}\n\n--\nG&S Coffee Farm Management\nhttps://gs-coffee-3d022.web.app`);

        const mailtoUrl = `mailto:${recipients}?subject=${subject}&body=${bodyText}`;
        window.open(mailtoUrl, '_blank');
    }

    /**
     * Trigger server-side attendance deadline check on demand via Cloud Function
     */
    public async triggerAttendanceDeadlineCheck(forceRun = true): Promise<any> {
        if (!auth.currentUser) {
            throw new Error('Authentication required to inspect attendance deadlines.');
        }
        const checkFn = httpsCallable<{ forceRun: boolean }, any>(functionsInstance, 'checkAttendanceDeadlines');
        const res = await checkFn({ forceRun });
        return res.data;
    }
}

export const emailService = new EmailService();

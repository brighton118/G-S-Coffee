import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { dbFirestore } from '../firebase';
import { db } from '../db';

export interface EmailNotificationPayload {
    to?: string | string[];
    subject: string;
    title: string;
    message: string;
    category?: 'Inventory Low' | 'Expiry Warning' | 'Chamber Overdue' | 'Missing Attendance' | 'Pending Overtime' | 'Payroll Approval' | 'EOD_ATTENDANCE' | 'General' | string;
    details?: Record<string, string | number>;
    actionUrl?: string;
    actionLabel?: string;
}

export interface EmailDispatchResult {
    success: boolean;
    channel: 'Firebase Cloud Queue' | 'Web3Forms Direct' | 'Webhook' | 'Gmail Client' | string;
    recipients: string[];
    messageId?: string;
    error?: string;
    message?: string;
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

        // Standard default recipients for G&S FARMS Superadmin
        if (recipients.size === 0) {
            recipients.add('gs.farms.ug@gmail.com');
        }

        return Array.from(recipients);
    }

    /**
     * Generates a clean, branded HTML email template for G&S FARMS
     */
    public generateHtmlEmail(payload: EmailNotificationPayload): string {
        const timestamp = new Date().toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        const categoryColors: Record<string, { bg: string; text: string; icon: string }> = {
            'Inventory Low': { bg: '#fee2e2', text: '#991b1b', icon: '📦' },
            'Expiry Warning': { bg: '#ffedd5', text: '#9a3412', icon: '⚠️' },
            'Chamber Overdue': { bg: '#fef3c7', text: '#92400e', icon: '🌱' },
            'Pending Overtime': { bg: '#fef9c3', text: '#854d0e', icon: '⏰' },
            'EOD_ATTENDANCE': { bg: '#e0e7ff', text: '#3730a3', icon: '📋' },
            'Payroll Approval': { bg: '#dcfce7', text: '#166534', icon: '💵' },
            'General': { bg: '#f3f4f6', text: '#1f2937', icon: '🔔' }
        };

        const categoryKey = payload.category || 'General';
        const color = categoryColors[categoryKey] || categoryColors['General'];
        const actionUrl = payload.actionUrl || 'https://gsfarm.farm';
        const actionLabel = payload.actionLabel || 'Open Farm Portal';

        let detailsRows = '';
        if (payload.details && Object.keys(payload.details).length > 0) {
            detailsRows = `
                <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; background: #fbfcf9; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                    <tbody>
                        ${Object.entries(payload.details).map(([key, val]) => `
                            <tr style="border-bottom: 1px solid #edf2f7;">
                                <td style="padding: 10px 14px; font-weight: 600; color: #4a5568; width: 38%;">${key}</td>
                                <td style="padding: 10px 14px; color: #1a202c; font-weight: 500;">${val}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${payload.title}</title>
            </head>
            <body style="margin: 0; padding: 24px 12px; background-color: #f4f6f1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2c3328; line-height: 1.6;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
                    
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #1f3515, #2d4c1e); padding: 24px; text-align: center; color: #ffffff;">
                        <div style="display: inline-block; background: #ffffff; padding: 6px 12px; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
                            <span style="font-weight: 800; font-size: 18px; color: #2d4c1e; letter-spacing: 0.05em;">🌿 G&amp;S FARMS</span>
                        </div>
                        <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em;">Operations &amp; System Notification</h1>
                        <p style="margin: 6px 0 0; font-size: 13px; color: #d4e4b9;">Coffee Clone Production &amp; Farm Operations</p>
                    </div>

                    <!-- Body Content -->
                    <div style="padding: 28px 24px;">
                        
                        <!-- Category Badge -->
                        <div style="display: inline-block; padding: 4px 12px; border-radius: 999px; background: ${color.bg}; color: ${color.text}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 16px;">
                            ${color.icon} ${categoryKey}
                        </div>

                        <!-- Title -->
                        <h2 style="margin: 0 0 14px; font-size: 19px; color: #1f3515; font-weight: 700; line-height: 1.3;">
                            ${payload.title}
                        </h2>

                        <!-- Message -->
                        <div style="font-size: 15px; color: #374151; white-space: pre-line; line-height: 1.65; margin-bottom: 16px;">
                            ${payload.message}
                        </div>

                        ${detailsRows}

                        <!-- Action Button -->
                        <div style="margin: 28px 0 20px; text-align: center;">
                            <a href="${actionUrl}" style="display: inline-block; background: #2d4c1e; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 4px rgba(45,76,30,0.3);">
                                ${actionLabel} &rarr;
                            </a>
                        </div>

                        <!-- Context Meta -->
                        <div style="margin-top: 24px; padding-top: 18px; border-top: 1px dashed #e2e8f0; font-size: 12px; color: #6b7280; display: flex; justify-content: space-between;">
                            <span><strong>Generated:</strong> ${timestamp}</span>
                            <span><strong>Location:</strong> Mubende District, Uganda</span>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="background: #f8fafc; padding: 18px 24px; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #718096;">
                        <p style="margin: 0 0 6px;">You are receiving this automated alert because your email is configured as an authorized farm manager at <strong>G&amp;S FARMS</strong>.</p>
                        <p style="margin: 0;">Portal: <a href="https://gsfarm.farm" style="color: #2d4c1e; text-decoration: none; font-weight: 600;">gsfarm.farm</a> &bull; Secured with Cloud Firebase</p>
                    </div>

                </div>
            </body>
            </html>
        `;
    }

    /**
     * Send email notification to user emails via all available channels
     */
    public async sendNotificationEmail(payload: EmailNotificationPayload): Promise<EmailDispatchResult> {
        const recipients = payload.to 
            ? (Array.isArray(payload.to) ? payload.to : [payload.to]) 
            : this.getRecipients();

        if (recipients.length === 0) {
            return {
                success: false,
                channel: 'Firebase Cloud Queue',
                recipients: [],
                error: 'No recipient email addresses found in settings.'
            };
        }

        const subject = payload.subject.startsWith('[G&S FARMS]') 
            ? payload.subject 
            : `[G&S FARMS Alert] ${payload.subject}`;

        const html = this.generateHtmlEmail({ ...payload, subject });
        const plainText = `${payload.title}\n\n${payload.message}\n\nGenerated: ${new Date().toLocaleString()}\nPortal: https://gsfarm.farm`;

        let messageId: string | undefined;
        let directDelivered = false;

        // Check settings for Web3Forms or Webhook keys
        let emailApiKey = '';
        let emailWebhookUrl = '';
        try {
            const saved = localStorage.getItem('gs_farm_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                emailApiKey = parsed.emailApiKey || '';
                emailWebhookUrl = parsed.emailWebhookUrl || '';
            }
        } catch (e) {
            console.warn('Error reading email API settings:', e);
        }

        // 1. Direct Web3Forms API dispatch (if key is provided)
        if (emailApiKey) {
            try {
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        access_key: emailApiKey,
                        subject,
                        from_name: 'G&S FARMS Portal',
                        to: recipients.join(', '),
                        message: plainText,
                        html_message: html
                    })
                });

                if (response.ok) {
                    directDelivered = true;
                    console.log(`[Email Service] Direct email delivered via Web3Forms to ${recipients.join(', ')}`);
                }
            } catch (apiErr) {
                console.warn('[Email Service] Web3Forms dispatch note:', apiErr);
            }
        }

        // 2. Custom Webhook Dispatch (e.g., Google Apps Script, Zapier, Make)
        if (emailWebhookUrl && emailWebhookUrl.startsWith('http')) {
            try {
                await fetch(emailWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: recipients,
                        subject,
                        title: payload.title,
                        message: payload.message,
                        category: payload.category,
                        html,
                        timestamp: new Date().toISOString()
                    })
                });
                directDelivered = true;
            } catch (webhookErr) {
                console.warn('[Email Service] Custom webhook error:', webhookErr);
            }
        }

        // 3. Cloud Firestore Queue (Trigger Email Extension standard)
        try {
            const mailDocRef = await addDoc(collection(dbFirestore, 'mail'), {
                to: recipients,
                message: {
                    subject,
                    text: plainText,
                    html
                },
                metadata: {
                    category: payload.category || 'General',
                    title: payload.title,
                    source: 'gs_farm_app',
                    timestamp: new Date().toISOString()
                },
                createdAt: serverTimestamp()
            });

            messageId = mailDocRef.id;

            // Record communication audit log into Dexie
            await db.notificationLogs.add({
                timestamp: new Date().toISOString(),
                channel: 'Email',
                recipient: recipients.join(', '),
                subject,
                message: payload.message,
                status: directDelivered ? 'Sent (Direct)' : 'Queued (Cloud Mail)'
            });

            console.log(`[Email Service] Notification queued for ${recipients.join(', ')}: "${subject}" (Doc: ${messageId})`);

            return {
                success: true,
                channel: directDelivered ? 'Direct Email' : 'Firebase Cloud Queue',
                recipients,
                messageId,
                message: directDelivered 
                    ? `Email delivered directly to ${recipients.join(', ')}.`
                    : `Notification queued for ${recipients.join(', ')}. Also available via 1-click Gmail Web.`
            };
        } catch (err: any) {
            console.error('[Email Service] Failed to dispatch email notification:', err);

            await db.notificationLogs.add({
                timestamp: new Date().toISOString(),
                channel: 'Email',
                recipient: recipients.join(', '),
                subject,
                message: payload.message,
                status: 'Failed'
            }).catch(() => {});

            return {
                success: false,
                channel: 'Firebase Cloud Queue',
                recipients,
                error: err?.message || 'Error writing to email queue'
            };
        }
    }

    /**
     * Opens Gmail Web directly with recipient, subject, and pre-formatted body populated
     */
    public openGmailWeb(payload: EmailNotificationPayload): void {
        const recipients = payload.to 
            ? (Array.isArray(payload.to) ? payload.to.join(',') : payload.to) 
            : this.getRecipients().join(',');

        const subject = encodeURIComponent(payload.subject.startsWith('[G&S FARMS]') ? payload.subject : `[G&S FARMS Alert] ${payload.subject}`);
        const bodyText = encodeURIComponent(`${payload.title}\n\n${payload.message}\n\nLocation: Mubende District, Uganda\nPortal: https://gsfarm.farm\n--\nG&S FARMS Notifications`);

        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipients)}&su=${subject}&body=${bodyText}`;
        window.open(gmailUrl, '_blank');
    }

    /**
     * Helper to open the user's default email client (Outlook, Apple Mail, etc.)
     */
    public openMailClient(payload: EmailNotificationPayload): void {
        const recipients = payload.to 
            ? (Array.isArray(payload.to) ? payload.to.join(',') : payload.to) 
            : this.getRecipients().join(',');

        const subject = encodeURIComponent(payload.subject.startsWith('[G&S FARMS]') ? payload.subject : `[G&S FARMS Alert] ${payload.subject}`);
        const bodyText = encodeURIComponent(`${payload.title}\n\n${payload.message}\n\n--\nG&S FARMS Workspace\nhttps://gsfarm.farm`);

        const mailtoUrl = `mailto:${recipients}?subject=${subject}&body=${bodyText}`;
        window.open(mailtoUrl, '_blank');
    }

    /**
     * Send a live test notification email to confirm delivery
     */
    public async sendTestEmail(targetEmail?: string): Promise<EmailDispatchResult> {
        const recipients = targetEmail ? [targetEmail] : this.getRecipients();

        return this.sendNotificationEmail({
            to: recipients,
            subject: 'System Test Notification',
            title: 'Email Delivery Channel Verification',
            message: 'This is an automated test from G&S FARMS to confirm that operational email notifications and alerts are successfully reaching gs.farms.ug@gmail.com and authorized farm management.',
            category: 'General',
            details: {
                'Delivery System': 'G&S FARMS Cloud Communication Engine',
                'Farm Location': 'Mubende District, Uganda',
                'Status': 'Operational & Verified',
                'Recipient Email': recipients.join(', ')
            },
            actionLabel: 'Open Farm Portal',
            actionUrl: 'https://gsfarm.farm'
        });
    }
}

export const emailService = new EmailService();

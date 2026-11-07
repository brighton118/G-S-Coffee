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

export interface SystemEmailRecipientInfo {
    email: string;
    name?: string;
    role?: string;
    source: string;
}

export const SUPER_ADMIN_EMAILS: string[] = [
    'gs.farms.ug@gmail.com',
    'gsfarm@gmail.com',
    'brighton118@gmail.com',
    'brightonkato317@gmail.com'
];

class EmailService {
    /**
     * Retrieve verified Administrator recipients (Super Admins, Estate Admins, Primary Reporting)
     * Receives: Sales Invoices, Cash Receipts, Payroll Wage Bill, Manager Activity Audits, System Reports
     */
    public getAdminRecipients(): string[] {
        const recipients: Set<string> = new Set();
        try {
            const saved = localStorage.getItem('gs_farm_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.contactEmail && typeof parsed.contactEmail === 'string' && parsed.contactEmail.includes('@')) {
                    recipients.add(parsed.contactEmail.trim().toLowerCase());
                }
                if (parsed.adminEmail && typeof parsed.adminEmail === 'string' && parsed.adminEmail.includes('@')) {
                    recipients.add(parsed.adminEmail.trim().toLowerCase());
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
            console.warn('[EmailService] Error reading admin recipients:', e);
        }

        // Always include Super Admins
        for (const superEmail of SUPER_ADMIN_EMAILS) {
            recipients.add(superEmail.toLowerCase());
        }

        return Array.from(recipients);
    }

    /**
     * Retrieve Farm Manager recipients
     * Receives: Missed Attendance Cutoffs, Overtime Verifications, Nursery Alerts, Worker Payslips
     */
    public getManagerRecipients(): string[] {
        const recipients: Set<string> = new Set();
        try {
            const saved = localStorage.getItem('gs_farm_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.managerNotificationEmails && typeof parsed.managerNotificationEmails === 'string') {
                    parsed.managerNotificationEmails
                        .split(/[,;\s]+/)
                        .map((e: string) => e.trim().toLowerCase())
                        .filter((e: string) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
                        .forEach((e: string) => recipients.add(e));
                }
            }
        } catch (e) {
            console.warn('[EmailService] Error reading manager recipients:', e);
        }

        // Default to registered farm manager in the database
        if (recipients.size === 0) {
            recipients.add('ophinemanigaruhanga@gmail.com');
        }

        return Array.from(recipients);
    }

    /**
     * Retrieve all farm stakeholders (Union of Admins & Managers)
     */
    public getAllRecipients(): string[] {
        const set = new Set([...this.getAdminRecipients(), ...this.getManagerRecipients()]);
        return Array.from(set);
    }

    /**
     * Backward-compatible default recipient retriever
     */
    public getRecipients(): string[] {
        return this.getAllRecipients();
    }

    /**
     * Retrieves all system recipients logged in or registered in our system
     * (active session, Dexie users, settings routing, and super admins).
     */
    public async getSystemRecipientsAsync(): Promise<SystemEmailRecipientInfo[]> {
        const map = new Map<string, SystemEmailRecipientInfo>();

        // 1. Current logged-in user session
        if (auth.currentUser?.email) {
            const email = auth.currentUser.email.trim().toLowerCase();
            map.set(email, {
                email,
                name: auth.currentUser.displayName || 'Current User',
                role: 'Active Session',
                source: 'Logged-in Account'
            });
        }

        // 2. Local Dexie user accounts
        try {
            const localUsers = await db.users.toArray();
            for (const u of localUsers) {
                if (u.active !== false && u.email && typeof u.email === 'string') {
                    const email = u.email.trim().toLowerCase();
                    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        if (!map.has(email)) {
                            map.set(email, {
                                email,
                                name: u.name || u.username || 'Farm User',
                                role: u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : 'Staff',
                                source: 'Registered Farm Account'
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[EmailService] Note reading Dexie users:', e);
        }

        // 3. Configured emails in farm settings
        try {
            const saved = localStorage.getItem('gs_farm_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                const addIfValid = (raw: string | undefined, roleLabel: string, sourceLabel: string) => {
                    if (!raw) return;
                    const items = raw.split(/[,;\s]+/);
                    for (const item of items) {
                        const clean = item.trim().toLowerCase();
                        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) && !map.has(clean)) {
                            map.set(clean, {
                                email: clean,
                                name: parsed.contactPerson || roleLabel,
                                role: roleLabel,
                                source: sourceLabel
                            });
                        }
                    }
                };

                addIfValid(parsed.contactEmail, 'Primary Contact', 'Farm Settings');
                addIfValid(parsed.adminEmail, 'Estate Admin', 'Farm Settings');
                addIfValid(parsed.notificationEmails, 'Notification List', 'Settings Alert Routing');
                addIfValid(parsed.managerNotificationEmails, 'Manager Alerts', 'Settings Manager Routing');
            }
        } catch (e) {
            console.warn('[EmailService] Note reading settings recipients:', e);
        }

        // 4. System Super Administrators
        for (const superEmail of SUPER_ADMIN_EMAILS) {
            const clean = superEmail.toLowerCase();
            if (!map.has(clean)) {
                map.set(clean, {
                    email: clean,
                    name: 'Super Administrator',
                    role: 'Super Admin',
                    source: 'System Authority'
                });
            }
        }

        return Array.from(map.values());
    }

    /**
     * Sender identity configuration
     */
    public getSenderConfig(): { email: string; name: string } {
        let senderEmail = 'brightonkato317@gmail.com';
        let senderName = 'GS FARM Management';
        try {
            const saved = localStorage.getItem('gs_farm_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.brevoSenderEmail && typeof parsed.brevoSenderEmail === 'string' && parsed.brevoSenderEmail.includes('@')) {
                    senderEmail = parsed.brevoSenderEmail.trim();
                } else if (parsed.contactEmail && typeof parsed.contactEmail === 'string' && parsed.contactEmail.includes('@')) {
                    senderEmail = parsed.contactEmail.trim();
                }
                if (parsed.brevoSenderName && typeof parsed.brevoSenderName === 'string' && parsed.brevoSenderName.trim()) {
                    senderName = parsed.brevoSenderName.trim();
                }
            }
        } catch {}
        return { email: senderEmail, name: senderName };
    }

    /**
     * Check current Brevo service status via secure Firebase Callable
     */
    public async getBrevoStatus(): Promise<BrevoStatusResponse> {
        const sender = this.getSenderConfig();
        const fallback: BrevoStatusResponse = {
            isConfigured: false,
            senderEmail: sender.email,
            senderName: sender.name,
            adminEmail: 'gs.farms.ug@gmail.com',
            provider: 'Brevo (Sendinblue) Transactional SMTP API v3'
        };

        try {
            if (auth.currentUser) {
                const getStatusFn = httpsCallable<{}, BrevoStatusResponse>(functionsInstance, 'getBrevoServiceStatus');
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout checking Cloud Functions')), 5000)
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
                const key = parsed.emailApiKey || parsed.brevoApiKey;
                if (key && typeof key === 'string') {
                    return key.trim();
                }
            }
        } catch {}
        return '';
    }

    /**
     * Client-side HTML template renderer to guarantee high-quality branded email output
     */
    private renderTemplateHtml(type: string, data: Record<string, any>): { html: string; text: string } {
        const estateName = 'G&S COFFEE FARMS &amp; ESTATE';
        const location = 'BUBAARE, KASHARI MBARARA UGANDA';
        const appUrl = 'https://gs-coffee-3d022.web.app';

        switch (type) {
            case 'managerAudit': {
                const action = data.action || 'Data Entry / Modification';
                const module = data.module || 'Farm Operations';
                const manager = data.manager || data.sourceUser || 'Farm Manager';
                const message = data.message || `${action} was recorded in ${module}.`;

                let detailsHtml = '';
                if (data.details && typeof data.details === 'object') {
                    const rows = Object.entries(data.details).map(([k, v]) => `
                        <tr>
                            <td style="padding: 8px 12px; font-weight: bold; color: #475569; width: 38%; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${k}</td>
                            <td style="padding: 8px 12px; color: #1e293b; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${String(v)}</td>
                        </tr>
                    `).join('');
                    detailsHtml = `
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                            <tbody>${rows}</tbody>
                        </table>
                    `;
                }

                const actionHtml = `
                    <div style="text-align: center; margin: 24px 0 10px;">
                        <a href="${data.actionUrl || appUrl}" style="background: #1e3a29; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">
                            ${data.actionLabel || 'Open Farm Portal & Audit Records'}
                        </a>
                    </div>
                `;

                const html = `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
                        <div style="background: #1e3a29; color: #ffffff; padding: 22px; text-align: center;">
                            <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">${estateName}</h2>
                            <p style="margin: 4px 0 0; font-size: 13px; color: #a7f3d0;">Manager Operational Activity Audit</p>
                            <div style="margin-top: 10px; display: inline-block; background: #166534; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                                🚨 ${module} • ${action}
                            </div>
                        </div>
                        <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
                            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 6px; padding: 12px 16px; margin-bottom: 18px;">
                                <strong style="color: #166534; font-size: 14px;">Operational Data Change Recorded</strong>
                                <p style="margin: 4px 0 0; color: #15803d; font-size: 13px;">
                                    Farm Manager <strong>${manager}</strong> entered or updated records in the G&amp;S Coffee Farm portal.
                                </p>
                            </div>

                            <p style="margin: 0 0 14px; font-size: 14px; color: #334155;">${message}</p>

                            <h3 style="color: #0f172a; margin: 18px 0 10px; font-size: 15px;">Audit Specification &amp; Submitted Fields</h3>
                            ${detailsHtml}
                            ${actionHtml}
                        </div>
                        <div style="background: #f1f5f9; padding: 14px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #cbd5e1;">
                            ${estateName} • ${location} • Confidential Farm Administration Notification
                        </div>
                    </div>
                `;
                return { html, text: `Manager Activity Audit: ${action}\n\nSubmitted by: ${manager}\nModule: ${module}\n${message}` };
            }

            case 'salesInvoice': {
                const invNum = data.invoiceNumber || 'INV-000';
                const date = data.orderDate || new Date().toISOString().split('T')[0];
                const custName = data.customerName || 'Valued Customer';
                const custPhone = data.customerPhone || 'N/A';
                const total = Number(data.totalAmount || 0).toLocaleString();
                const paid = Number(data.amountPaid ?? data.totalAmount ?? 0).toLocaleString();
                const items: Array<{ variety: string; quantity: number; unitPrice: number; subtotal: number }> =
                    data.items && Array.isArray(data.items) ? data.items : [
                        { variety: data.cloneType || 'Coffee Clones', quantity: data.quantity || 1, unitPrice: data.unitPrice || 0, subtotal: data.totalAmount || 0 }
                    ];

                const rowsHtml = items.map(item => `
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b;">${item.variety}</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b; text-align: center;">${Number(item.quantity).toLocaleString()}</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b; text-align: right;">UGX ${Number(item.unitPrice).toLocaleString()}</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: bold; color: #166534; text-align: right;">UGX ${Number(item.subtotal).toLocaleString()}</td>
                    </tr>
                `).join('');

                const html = `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
                        <div style="background: #1e3a29; color: #ffffff; padding: 22px; text-align: center;">
                            <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">${estateName}</h2>
                            <p style="margin: 4px 0 0; font-size: 13px; color: #a7f3d0;">Official Cash Sale Receipt &amp; Tax Invoice</p>
                            <div style="margin-top: 10px; display: inline-block; background: #166534; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                                Receipt #${invNum}
                            </div>
                        </div>
                        <div style="padding: 24px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 18px; font-size: 13px; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                                <div><strong>Billed To:</strong> ${custName}<br><strong>Contact:</strong> ${custPhone}</div>
                                <div style="text-align: right;"><strong>Date:</strong> ${date}<br><strong>Location:</strong> ${data.location || location}</div>
                            </div>

                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
                                <thead>
                                    <tr style="background: #f1f5f9; text-align: left;">
                                        <th style="padding: 10px 12px; font-size: 12px; color: #475569; text-transform: uppercase;">Variety / Item</th>
                                        <th style="padding: 10px 12px; font-size: 12px; color: #475569; text-transform: uppercase; text-align: center;">Qty</th>
                                        <th style="padding: 10px 12px; font-size: 12px; color: #475569; text-transform: uppercase; text-align: right;">Unit Price</th>
                                        <th style="padding: 10px 12px; font-size: 12px; color: #475569; text-transform: uppercase; text-align: right;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="3" style="padding: 12px; text-align: right; font-weight: bold; font-size: 14px; color: #1e293b;">Total Amount:</td>
                                        <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 15px; color: #166534;">UGX ${total}</td>
                                    </tr>
                                    <tr>
                                        <td colspan="3" style="padding: 6px 12px; text-align: right; font-size: 13px; color: #475569;">Amount Paid:</td>
                                        <td style="padding: 6px 12px; text-align: right; font-weight: bold; font-size: 13px; color: #0284c7;">UGX ${paid}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 12px; color: #64748b; text-align: center;">
                                Thank you for partnering with ${estateName}. All nursery clones meet certified Uganda Coffee Development Authority (UCDA) standards.
                            </div>
                        </div>
                        <div style="background: #f1f5f9; padding: 12px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #cbd5e1;">
                            ${estateName} • ${location} • Portal: <a href="${appUrl}" style="color: #1e3a29; text-decoration: none;">gs-coffee-3d022.web.app</a>
                        </div>
                    </div>
                `;
                return { html, text: `Receipt #${invNum} for ${custName}. Total: UGX ${total}. Details: ${data.itemsSummary || ''}` };
            }

            case 'workerPayslip': {
                const worker = data.workerName || 'Farm Worker';
                const month = data.payrollMonth || 'Current Month';
                const net = Number(data.netPay || 0).toLocaleString();
                const base = Number(data.baseSalary || 0).toLocaleString();
                const otPay = Number(data.overtimePay || 0).toLocaleString();
                const deduct = Number(data.deductions || 0).toLocaleString();

                const html = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                        <div style="background: #1e3a29; color: #ffffff; padding: 20px; text-align: center;">
                            <h2 style="margin: 0; font-size: 18px;">${estateName}</h2>
                            <p style="margin: 4px 0 0; font-size: 13px; color: #a7f3d0;">Official Worker Payslip (${month})</p>
                        </div>
                        <div style="padding: 20px;">
                            <div style="margin-bottom: 16px; font-size: 13px; color: #334155;">
                                <strong>Employee:</strong> ${worker} (${data.workerId || 'N/A'})<br>
                                <strong>Farm Card:</strong> ${data.farmCardNumber || 'Standard'}<br>
                                <strong>Payment Method:</strong> ${data.paymentMethod || 'Cash / Mobile Money'}
                            </div>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
                                <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">Base Earnings:</td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">UGX ${base}</td></tr>
                                <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">Overtime (${data.overtimeHours || 0} hrs):</td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">UGX ${otPay}</td></tr>
                                <tr><td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #dc2626;">Deductions / Advances:</td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #dc2626;">- UGX ${deduct}</td></tr>
                                <tr style="font-weight: bold; font-size: 15px; color: #166534;"><td style="padding: 10px 0;">Net Take-Home Pay:</td><td style="text-align: right; padding: 10px 0;">UGX ${net}</td></tr>
                            </table>
                        </div>
                        <div style="background: #f8fafc; padding: 12px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
                            ${estateName} • Confidential Worker Compensation Record
                        </div>
                    </div>
                `;
                return { html, text: `Payslip for ${worker} (${month}). Net Pay: UGX ${net}` };
            }

            default: {
                // Admin alert / general template
                const title = data.title || 'System Alert';
                const message = data.message || 'Operational notification from G&S Coffee Farm Management System.';
                let detailsHtml = '';
                if (data.details && typeof data.details === 'object') {
                    const rows = Object.entries(data.details).map(([k, v]) => `
                        <tr>
                            <td style="padding: 6px 10px; font-weight: bold; color: #475569; width: 35%; border-bottom: 1px solid #e2e8f0;">${k}</td>
                            <td style="padding: 6px 10px; color: #1e293b; border-bottom: 1px solid #e2e8f0;">${String(v)}</td>
                        </tr>
                    `).join('');
                    detailsHtml = `
                        <table style="width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                            <tbody>${rows}</tbody>
                        </table>
                    `;
                }

                const actionHtml = data.actionUrl ? `
                    <div style="text-align: center; margin: 20px 0 10px;">
                        <a href="${data.actionUrl}" style="background: #1e3a29; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">
                            ${data.actionLabel || 'View in Farm Portal'}
                        </a>
                    </div>
                ` : '';

                const html = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                        <div style="background: #1e3a29; color: #ffffff; padding: 20px; text-align: center;">
                            <h2 style="margin: 0; font-size: 18px;">${estateName}</h2>
                            <p style="margin: 4px 0 0; font-size: 12px; color: #a7f3d0;">${data.category || 'Farm Management Notification'}</p>
                        </div>
                        <div style="padding: 22px; color: #1e293b; font-size: 14px; line-height: 1.6;">
                            <h3 style="color: #0f172a; margin-top: 0; font-size: 16px;">${title}</h3>
                            <p style="margin: 0 0 12px;">${message}</p>
                            ${detailsHtml}
                            ${actionHtml}
                        </div>
                        <div style="background: #f8fafc; padding: 12px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
                            ${estateName} • ${location} • <a href="${appUrl}" style="color: #1e3a29; text-decoration: none;">gs-coffee-3d022.web.app</a>
                        </div>
                    </div>
                `;
                return { html, text: `${title}\n\n${message}` };
            }
        }
    }

    /**
     * Core transactional email dispatcher.
     * 1. Direct Brevo API (if API key starting with xkeysib- is configured)
     * 2. Direct Web3Forms (if access key is configured)
     * 3. Firebase Callable sendBrevoEmail (with 15s timeout for cold start resilience)
     * 4. Cloud Firestore `mail` queue (with 10s timeout)
     * 5. Local Dexie audit log fallback
     */
    public async dispatchTransactional(data: {
        to?: string | string[];
        subject?: string;
        templateType?: 'adminAlert' | 'missedAttendance' | 'payrollRun' | 'workerPayslip' | 'salesInvoice' | 'inventoryAlert' | 'reportDelivery' | 'managerAudit';
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
        const sender = this.getSenderConfig();

        // Ensure rich HTML content is rendered
        let htmlContent = data.htmlContent;
        let textContent = data.textContent;

        if (!htmlContent && data.templateType && data.templateData) {
            const built = this.renderTemplateHtml(data.templateType, data.templateData);
            htmlContent = built.html;
            textContent = textContent || built.text;
        }

        if (!htmlContent) {
            const fallbackBuilt = this.renderTemplateHtml('adminAlert', {
                title: subject,
                message: data.textContent || subject,
                category
            });
            htmlContent = fallbackBuilt.html;
            textContent = textContent || fallbackBuilt.text;
        }

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
                            name: sender.name,
                            email: sender.email
                        },
                        to: recipients.map(email => ({ email })),
                        subject,
                        htmlContent,
                        textContent: textContent || subject,
                        attachment: data.attachments
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
                } else {
                    const errBody = await response.text().catch(() => '');
                    console.warn('[Email Service] Brevo API error response:', response.status, errBody);
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
                        from_name: sender.name,
                        to: recipients.join(', '),
                        message: textContent || subject
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

        // 3. Try Firebase Cloud Function: sendBrevoEmail (with 15s timeout for cold starts)
        try {
            if (auth.currentUser) {
                const sendBrevoFn = httpsCallable<any, { success: boolean; messageId?: string; recipients: string[] }>(
                    functionsInstance,
                    'sendBrevoEmail'
                );

                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Callable timeout (15s)')), 15000)
                );

                const response = await Promise.race([
                    sendBrevoFn({
                        to: recipients,
                        subject,
                        templateType: data.templateType,
                        templateData: data.templateData,
                        htmlContent,
                        textContent,
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
            console.info('[Email Service] Cloud callable note (proceeding to queue):', fnErr?.message || fnErr);
        }

        // 4. Fallback: Queue directly to Cloud Firestore `mail` collection (with 10s timeout)
        try {
            const addDocPromise = addDoc(collection(dbFirestore, 'mail'), {
                to: recipients,
                subject,
                message: {
                    subject,
                    text: textContent || subject,
                    html: htmlContent
                },
                htmlContent,
                textContent,
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
                setTimeout(() => reject(new Error('Firestore queue timeout (10s)')), 10000)
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
                message: `Email queued in Cloud Firestore for ${recipients.join(', ')}.`
            };
        } catch (queueErr: any) {
            console.warn('[Email Service] Queue write note:', queueErr?.message || queueErr);
        }

        // 5. Final Graceful Fallback: Local Dexie Audit Log
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
            message: `Notification recorded for ${recipients.join(', ')}. Use "Gmail Web" to dispatch directly if offline.`
        };
    }

    /**
     * Send Sales Invoice & Receipt Email to customer and Farm Administrators
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
        items?: Array<{ variety: string; quantity: number; unitPrice: number; subtotal: number }>;
        pdfBase64?: string;
    }): Promise<EmailDispatchResult> {
        const recipients: string[] = [];
        if (data.customerEmail && data.customerEmail.includes('@')) {
            recipients.push(data.customerEmail.trim().toLowerCase());
        }
        // Route specifically to Administrators for financial oversight and treasury audits
        this.getAdminRecipients().forEach(r => {
            const clean = r.trim().toLowerCase();
            if (!recipients.includes(clean)) recipients.push(clean);
        });

        const attachments = data.pdfBase64 ? [
            {
                name: `Invoice-${data.invoiceNumber}.pdf`,
                content: data.pdfBase64
            }
        ] : undefined;

        const items = data.items && data.items.length > 0
            ? data.items
            : [{ variety: data.cloneType, quantity: data.quantity, unitPrice: data.unitPrice, subtotal: data.totalAmount }];

        const itemsSummary = items.map(i => `${i.variety}: ${Number(i.quantity).toLocaleString()} @ UGX ${Number(i.unitPrice).toLocaleString()} = UGX ${Number(i.subtotal).toLocaleString()}`).join(' | ');

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
                location: data.location || 'BUBAARE, KASHARI MBARARA UGANDA',
                items,
                itemsSummary
            },
            attachments,
            category: 'Sales Invoice'
        });
    }

    /**
     * Send Payroll Run Completion Summary to Administrators for authorization
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

        // Route specifically to Administrators for wage bill oversight
        return this.dispatchTransactional({
            to: this.getAdminRecipients(),
            subject: `[G&S Coffee Farm Payroll] ${data.payrollMonth} Run Summary`,
            templateType: 'payrollRun',
            templateData: data,
            attachments,
            category: 'Payroll Run'
        });
    }

    /**
     * Send Individual Worker Payslip to Worker and Farm Manager
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
            recipients.push(data.workerEmail.trim().toLowerCase());
        }
        // Route specifically to Farm Manager for on-site payout and worker personnel files
        this.getManagerRecipients().forEach(r => {
            const clean = r.trim().toLowerCase();
            if (!recipients.includes(clean)) recipients.push(clean);
        });

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
     * Send Worker Missed Attendance Alert to Farm Manager
     */
    public async sendMissedAttendanceEmail(data: {
        workerId: string;
        workerName: string;
        date: string;
        scheduledShift?: string;
        timeInWindow?: string;
        notes?: string;
    }): Promise<EmailDispatchResult> {
        // Route specifically to Farm Manager for morning shift action on the ground
        return this.dispatchTransactional({
            to: this.getManagerRecipients(),
            subject: `[G&S Coffee Farm Alert] Missed Attendance - ${data.workerName} (${data.workerId})`,
            templateType: 'missedAttendance',
            templateData: data,
            category: 'Missing Attendance'
        });
    }

    /**
     * Send Inventory & Nursery Alert (Low Stock, Expiry, Chamber Overdue) to Managers & Admins
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
        // Route to both Managers & Admins for supply replenishment and nursery transitions
        return this.dispatchTransactional({
            to: this.getAllRecipients(),
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
     * Send dedicated Manager Activity Audit alert directly to Administrators.
     * Triggered whenever the farm manager enters new operational data or modifies existing records.
     */
    public async sendManagerActivityAlert(params: {
        module: string;
        action: string;
        description: string;
        recordId?: string | number;
        details?: Record<string, any>;
        sourceUser?: string;
    }): Promise<EmailDispatchResult> {
        // Exclusively targeted to Administrators
        const recipients = this.getAdminRecipients();
        const managerActor = params.sourceUser 
            || (auth.currentUser?.email ? `${auth.currentUser.displayName || auth.currentUser.email} (Farm Manager)` : 'Farm Manager (ophinemanigaruhanga@gmail.com)');

        const actionClean = params.action.replace(/^Manager Entry:\s*/i, '');
        const subject = `[G&S Manager Audit] ${actionClean} • ${params.module}`;

        return this.dispatchTransactional({
            to: recipients,
            subject,
            templateType: 'managerAudit',
            templateData: {
                title: `🚨 Manager Activity Audit: ${actionClean}`,
                action: actionClean,
                module: params.module,
                manager: managerActor,
                message: params.description,
                category: `Manager Audit • ${params.module}`,
                details: {
                    'Operational Module': params.module,
                    'Action Performed': actionClean,
                    'Submitted By': managerActor,
                    'Estate Location': 'BUBAARE, KASHARI MBARARA UGANDA',
                    'Dispatched At': new Date().toLocaleString('en-GB', { timeZone: 'Africa/Kampala' }),
                    ...(params.details || {})
                },
                actionLabel: 'Review Changes in Farm Portal',
                actionUrl: 'https://gs-coffee-3d022.web.app'
            },
            category: 'Manager Entry'
        });
    }

    /**
     * Backward-compatible General Notification Method with intelligent role targeting
     */
    public async sendNotificationEmail(payload: EmailNotificationPayload): Promise<EmailDispatchResult> {
        let targets = payload.to;
        if (!targets) {
            // Role targeting based on operational category
            if (payload.category === 'Manager Entry') {
                // Manager actions audited exclusively by Administrators
                targets = this.getAdminRecipients();
            } else if (payload.category === 'Missing Attendance' || payload.category === 'Pending Overtime') {
                // Shift & attendance operations routed to Farm Managers
                targets = this.getManagerRecipients();
            } else {
                // Critical shortages & chamber alerts routed to both Managers & Admins
                targets = this.getAllRecipients();
            }
        }

        return this.dispatchTransactional({
            to: targets,
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
        const recipients = target === 'all' ? this.getRecipients() : [target];

        return this.dispatchTransactional({
            to: recipients,
            subject: 'System Test Notification (Brevo Integration)',
            templateType: 'adminAlert',
            templateData: {
                title: 'Brevo Email Service Operational Test',
                message: 'This is a verified test email sent from the G&S Coffee Farm Management System. Transactional emails, payslips, sales receipts, and operational alerts are now configured and connected to Brevo (Sendinblue).',
                category: 'System Test',
                details: {
                    'Farm Estate': 'G&S Coffee Farms (BUBAARE, KASHARI MBARARA UGANDA)',
                    'Email Provider': 'Brevo SMTP Transactional API v3',
                    'Target Recipient(s)': recipients.join(', '),
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
        const bodyText = encodeURIComponent(`${payload.title}\n\n${payload.message}\n\nEstate: BUBAARE, KASHARI MBARARA UGANDA\nPortal: https://gs-coffee-3d022.web.app\n--\nG&S Coffee Farm Management`);

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

/**
 * Professional Responsive HTML & Text Email Templates for G&S Coffee Farm Management System
 * Primary Currency: UGX
 * Design: High-contrast, mobile-friendly, branded emerald aesthetic, sanitized inputs
 */

export function escapeHtml(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatUGX(amount: number): string {
    return `UGX ${Math.round(amount || 0).toLocaleString('en-US')}`;
}

export interface BaseTemplateOptions {
    title: string;
    preheader?: string;
    category?: string;
    portalUrl?: string;
}

function wrapBaseEmail(options: BaseTemplateOptions, bodyHtml: string): string {
    const portalUrl = options.portalUrl || process.env.FARM_PORTAL_URL || 'https://gs-coffee-3d022.web.app';
    const timestamp = new Date().toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${escapeHtml(options.title)}</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f4f6f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #222d1f; line-height: 1.6; }
        table { border-collapse: collapse; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f6f3; padding: 30px 10px; }
        .main-card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e1e7dc; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
        .header { background: linear-gradient(135deg, #1c3514 0%, #294c1f 100%); padding: 26px 24px; text-align: center; color: #ffffff; }
        .brand-badge { display: inline-block; background: #ffffff; color: #223e19; font-weight: 800; font-size: 15px; padding: 6px 14px; border-radius: 6px; letter-spacing: 0.5px; margin-bottom: 12px; }
        .content { padding: 30px 24px; }
        .category-pill { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 4px 10px; border-radius: 999px; margin-bottom: 14px; }
        .btn-cta { display: inline-block; background-color: #264b1c; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 26px; border-radius: 6px; box-shadow: 0 2px 6px rgba(38,75,28,0.25); }
        .data-table { width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #fbfcf9; border: 1px solid #e5ebe0; border-radius: 8px; overflow: hidden; }
        .data-table td { padding: 11px 14px; font-size: 14px; border-bottom: 1px solid #edf2e8; }
        .data-label { width: 40%; font-weight: 600; color: #4b5845; }
        .data-val { width: 60%; font-weight: 700; color: #162412; }
        .footer { background: #fafbf9; padding: 20px 24px; border-top: 1px solid #edf2e8; text-align: center; font-size: 12px; color: #6b7765; }
        @media only screen and (max-width: 600px) {
            .content { padding: 20px 16px; }
            .header { padding: 20px 16px; }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <table class="main-card" role="presentation" width="100%" align="center">
            <tr>
                <td class="header">
                    <div class="brand-badge">☕ G&amp;S COFFEE FARMS</div>
                    <h1 style="margin: 0; font-size: 21px; font-weight: 700; color: #ffffff;">Farm Management &amp; Operations</h1>
                    <div style="font-size: 13px; color: #d6e8c7; margin-top: 6px;">Mubende District, Uganda &bull; Elite Robusta Clone Propagation</div>
                </td>
            </tr>
            <tr>
                <td class="content">
                    ${options.category ? `
                    <div class="category-pill" style="background-color: #e8f3e1; color: #224317;">
                        ${escapeHtml(options.category)}
                    </div>
                    ` : ''}
                    ${bodyHtml}
                    <div style="margin-top: 26px; padding-top: 18px; border-top: 1px dashed #e2e8dc; font-size: 12px; color: #73826e;">
                        <span><strong>Timestamp:</strong> ${timestamp}</span> &bull; 
                        <span><strong>Estate Location:</strong> Mubende, Uganda</span>
                    </div>
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <p style="margin: 0 0 8px;">This is an automated operational alert dispatched by the <strong>G&amp;S Coffee Farm Management System</strong>.</p>
                    <p style="margin: 0;">Portal: <a href="${portalUrl}" style="color: #274b1c; font-weight: 600; text-decoration: none;">gsfarm.farm</a> &bull; Powered by Brevo</p>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// 1. GENERAL & ADMINISTRATIVE SYSTEM ALERTS
// -------------------------------------------------------------
export function buildAdminAlertTemplate(data: {
    title: string;
    message: string;
    category?: string;
    details?: Record<string, any>;
    actionUrl?: string;
    actionLabel?: string;
}): { html: string; text: string } {
    let rowsHtml = '';
    let textDetails = '';

    if (data.details && Object.keys(data.details).length > 0) {
        rowsHtml = `<table class="data-table" role="presentation"><tbody>${
            Object.entries(data.details).map(([k, v]) => `
                <tr>
                    <td class="data-label">${escapeHtml(k)}</td>
                    <td class="data-val">${escapeHtml(v)}</td>
                </tr>
            `).join('')
        }</tbody></table>`;

        textDetails = '\n\nDetails:\n' + Object.entries(data.details).map(([k, v]) => `- ${k}: ${v}`).join('\n');
    }

    const actionUrl = data.actionUrl || process.env.FARM_PORTAL_URL || 'https://gs-coffee-3d022.web.app';
    const actionLabel = data.actionLabel || 'Open Farm Management Portal';

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #1a3314; font-weight: 700;">${escapeHtml(data.title)}</h2>
        <div style="font-size: 15px; color: #33412f; line-height: 1.6; margin-bottom: 16px; white-space: pre-line;">
            ${escapeHtml(data.message)}
        </div>
        ${rowsHtml}
        <div style="text-align: center; margin: 26px 0 10px;">
            <a href="${actionUrl}" class="btn-cta">${escapeHtml(actionLabel)} &rarr;</a>
        </div>
    `;

    const html = wrapBaseEmail({ title: data.title, category: data.category || 'System Notice' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] [${data.category || 'System Notice'}] ${data.title}\n\n${data.message}${textDetails}\n\nPortal: ${actionUrl}`;

    return { html, text };
}

// -------------------------------------------------------------
// 2. WORKER MISSED ATTENDANCE ALERT
// -------------------------------------------------------------
export function buildMissedAttendanceTemplate(data: {
    workerId: string;
    workerName: string;
    date: string;
    scheduledShift?: string;
    timeInWindow?: string;
    notes?: string;
}): { html: string; text: string } {
    const title = `Missed Attendance Alert: ${data.workerName} (${data.workerId})`;

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #8f2214; font-weight: 700;">Worker Missed Attendance</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            Worker <strong>${escapeHtml(data.workerName)}</strong> did not log a required time-in scan for scheduled date <strong>${escapeHtml(data.date)}</strong> in accordance with the farm's active attendance policy.
        </p>
        <table class="data-table" role="presentation">
            <tbody>
                <tr>
                    <td class="data-label">Worker ID</td>
                    <td class="data-val">${escapeHtml(data.workerId)}</td>
                </tr>
                <tr>
                    <td class="data-label">Worker Full Name</td>
                    <td class="data-val">${escapeHtml(data.workerName)}</td>
                </tr>
                <tr>
                    <td class="data-label">Scheduled Date</td>
                    <td class="data-val">${escapeHtml(data.date)}</td>
                </tr>
                <tr>
                    <td class="data-label">Shift Policy</td>
                    <td class="data-val">${escapeHtml(data.scheduledShift || 'Standard Farm Shift (08:00 - 17:00)')}</td>
                </tr>
                <tr>
                    <td class="data-label">Time-in Window</td>
                    <td class="data-val">${escapeHtml(data.timeInWindow || '07:30 - 08:30')}</td>
                </tr>
                ${data.notes ? `
                <tr>
                    <td class="data-label">Observations</td>
                    <td class="data-val">${escapeHtml(data.notes)}</td>
                </tr>
                ` : ''}
            </tbody>
        </table>
        <p style="font-size: 13px; color: #6b7280;">Please verify with the nursery or field supervisor whether the worker requested approved leave or an excused absence.</p>
    `;

    const html = wrapBaseEmail({ title, category: 'Attendance Policy' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\n\nWorker ${data.workerName} (${data.workerId}) missed attendance on ${data.date}.\nShift: ${data.scheduledShift || 'Standard Farm Shift'}\nTime-in window: ${data.timeInWindow || '07:30 - 08:30'}`;

    return { html, text };
}

// -------------------------------------------------------------
// 3. PAYROLL RUN COMPLETION & SUMMARY
// -------------------------------------------------------------
export function buildPayrollRunTemplate(data: {
    payrollMonth: string;
    totalWorkers: number;
    totalGrossPay: number;
    totalOvertimePay: number;
    totalDeductions: number;
    totalNetPay: number;
    paymentStatusSummary: string;
    authorizedBy?: string;
}): { html: string; text: string } {
    const title = `Payroll Completed: ${data.payrollMonth}`;

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #164016; font-weight: 700;">Monthly Payroll Run Completed</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            The monthly payroll calculation and review for <strong>${escapeHtml(data.payrollMonth)}</strong> has been processed successfully. Below is the executive financial summary:
        </p>
        <table class="data-table" role="presentation">
            <tbody>
                <tr>
                    <td class="data-label">Payroll Period</td>
                    <td class="data-val">${escapeHtml(data.payrollMonth)}</td>
                </tr>
                <tr>
                    <td class="data-label">Total Active Workers</td>
                    <td class="data-val">${escapeHtml(data.totalWorkers)} workforce members</td>
                </tr>
                <tr>
                    <td class="data-label">Total Base Salaries</td>
                    <td class="data-val">${formatUGX(data.totalGrossPay)}</td>
                </tr>
                <tr>
                    <td class="data-label">Total Overtime Pay</td>
                    <td class="data-val" style="color: #ea580c;">${formatUGX(data.totalOvertimePay)}</td>
                </tr>
                <tr>
                    <td class="data-label">Total Deductions</td>
                    <td class="data-val" style="color: #dc2626;">-${formatUGX(data.totalDeductions)}</td>
                </tr>
                <tr style="background: #eef6ea;">
                    <td class="data-label" style="font-size: 15px;">TOTAL NET DISBURSEMENT</td>
                    <td class="data-val" style="font-size: 16px; color: #166534;">${formatUGX(data.totalNetPay)}</td>
                </tr>
                <tr>
                    <td class="data-label">Disbursement Status</td>
                    <td class="data-val">${escapeHtml(data.paymentStatusSummary)}</td>
                </tr>
                ${data.authorizedBy ? `
                <tr>
                    <td class="data-label">Verified By</td>
                    <td class="data-val">${escapeHtml(data.authorizedBy)}</td>
                </tr>
                ` : ''}
            </tbody>
        </table>
    `;

    const html = wrapBaseEmail({ title, category: 'Payroll & Finance' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\nPeriod: ${data.payrollMonth}\nWorkers: ${data.totalWorkers}\nBase: ${formatUGX(data.totalGrossPay)}\nOvertime: ${formatUGX(data.totalOvertimePay)}\nDeductions: -${formatUGX(data.totalDeductions)}\nTotal Net: ${formatUGX(data.totalNetPay)}`;

    return { html, text };
}

// -------------------------------------------------------------
// 4. INDIVIDUAL WORKER PAYSLIP SUMMARY
// -------------------------------------------------------------
export function buildWorkerPayslipTemplate(data: {
    workerName: string;
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
}): { html: string; text: string } {
    const title = `Official Payslip: ${data.payrollMonth} - ${data.workerName}`;

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #1e3a17; font-weight: 700;">Worker Monthly Payslip</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            Dear <strong>${escapeHtml(data.workerName)}</strong>, here is your official compensation slip for <strong>${escapeHtml(data.payrollMonth)}</strong> from G&amp;S Coffee Farms:
        </p>
        <table class="data-table" role="presentation">
            <tbody>
                <tr>
                    <td class="data-label">Worker ID</td>
                    <td class="data-val">${escapeHtml(data.workerId)} ${data.farmCardNumber ? `(${escapeHtml(data.farmCardNumber)})` : ''}</td>
                </tr>
                <tr>
                    <td class="data-label">Payroll Month</td>
                    <td class="data-val">${escapeHtml(data.payrollMonth)}</td>
                </tr>
                <tr>
                    <td class="data-label">Base Monthly Salary</td>
                    <td class="data-val">${formatUGX(data.baseSalary)}</td>
                </tr>
                <tr>
                    <td class="data-label">Overtime Hours (${data.overtimeHours} hrs)</td>
                    <td class="data-val" style="color: #ea580c;">+${formatUGX(data.overtimePay)}</td>
                </tr>
                <tr>
                    <td class="data-label">Attendance / Deductions</td>
                    <td class="data-val" style="color: #dc2626;">-${formatUGX(data.deductions)}</td>
                </tr>
                <tr style="background: #eef6ea;">
                    <td class="data-label" style="font-size: 15px;">NET TAKE-HOME PAY</td>
                    <td class="data-val" style="font-size: 16px; color: #166534;">${formatUGX(data.netPay)}</td>
                </tr>
                ${data.paymentMethod ? `
                <tr>
                    <td class="data-label">Payment Channel</td>
                    <td class="data-val">${escapeHtml(data.paymentMethod)} ${data.paymentDate ? `on ${escapeHtml(data.paymentDate)}` : ''}</td>
                </tr>
                ` : ''}
            </tbody>
        </table>
        <p style="font-size: 12px; color: #6b7280;">If you have any questions regarding your overtime hours or deductions, please consult the farm manager.</p>
    `;

    const html = wrapBaseEmail({ title, category: 'Confidential Payslip' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\nWorker: ${data.workerName} (${data.workerId})\nPeriod: ${data.payrollMonth}\nBase: ${formatUGX(data.baseSalary)}\nOvertime: +${formatUGX(data.overtimePay)}\nDeductions: -${formatUGX(data.deductions)}\nNet Pay: ${formatUGX(data.netPay)}`;

    return { html, text };
}

// -------------------------------------------------------------
// 5. SALES INVOICE & CUSTOMER RECEIPT
// -------------------------------------------------------------
export function buildSalesInvoiceTemplate(data: {
    invoiceNumber: string;
    orderDate: string;
    customerName: string;
    customerPhone: string;
    cloneType: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    amountPaid?: number;
    location?: string;
    salesAgent?: string;
}): { html: string; text: string } {
    const title = `Official Sales Receipt / Invoice ${data.invoiceNumber}`;
    const balanceDue = Math.max(0, data.totalAmount - (data.amountPaid ?? data.totalAmount));

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #163816; font-weight: 700;">Coffee Clone Sales Invoice</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            Thank you for purchasing certified elite Robusta coffee plantlets from <strong>G&amp;S Coffee Farms</strong>. Below are the verified details of your order:
        </p>
        <table class="data-table" role="presentation">
            <tbody>
                <tr>
                    <td class="data-label">Invoice Number</td>
                    <td class="data-val" style="color: #1f3f18;">${escapeHtml(data.invoiceNumber)}</td>
                </tr>
                <tr>
                    <td class="data-label">Transaction Date</td>
                    <td class="data-val">${escapeHtml(data.orderDate)}</td>
                </tr>
                <tr>
                    <td class="data-label">Customer Name</td>
                    <td class="data-val">${escapeHtml(data.customerName)} (${escapeHtml(data.customerPhone)})</td>
                </tr>
                ${data.location ? `
                <tr>
                    <td class="data-label">Delivery / Destination</td>
                    <td class="data-val">${escapeHtml(data.location)}</td>
                </tr>
                ` : ''}
                <tr>
                    <td class="data-label">Plantlet Variety</td>
                    <td class="data-val">${escapeHtml(data.cloneType)} (Elite Certified Clones)</td>
                </tr>
                <tr>
                    <td class="data-label">Quantity</td>
                    <td class="data-val">${Number(data.quantity).toLocaleString()} plantlets</td>
                </tr>
                <tr>
                    <td class="data-label">Unit Price</td>
                    <td class="data-val">${formatUGX(data.unitPrice)}</td>
                </tr>
                <tr style="background: #eef6ea;">
                    <td class="data-label" style="font-size: 15px;">TOTAL AMOUNT</td>
                    <td class="data-val" style="font-size: 17px; color: #166534;">${formatUGX(data.totalAmount)}</td>
                </tr>
                <tr>
                    <td class="data-label">Amount Paid</td>
                    <td class="data-val">${formatUGX(data.amountPaid ?? data.totalAmount)}</td>
                </tr>
                ${balanceDue > 0 ? `
                <tr>
                    <td class="data-label">Balance Outstanding</td>
                    <td class="data-val" style="color: #dc2626;">${formatUGX(balanceDue)}</td>
                </tr>
                ` : `
                <tr>
                    <td class="data-label">Payment Status</td>
                    <td class="data-val" style="color: #166534;">PAID IN FULL &bull; CASH SETTLED</td>
                </tr>
                `}
            </tbody>
        </table>
        <div style="background: #fbfbf9; padding: 14px 16px; border-radius: 8px; border-left: 4px solid #2d4c1e; margin-top: 20px; font-size: 13px; color: #475569;">
            <strong>Planting Recommendation:</strong> Keep newly delivered clonal plantlets in shaded conditions for 3-5 days before field planting. Ensure proper spacing (3m x 3m) and basal organic manure.
        </div>
    `;

    const html = wrapBaseEmail({ title, category: 'Sales Receipt' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\nInvoice: ${data.invoiceNumber}\nDate: ${data.orderDate}\nCustomer: ${data.customerName} (${data.customerPhone})\nVariety: ${data.cloneType}\nQuantity: ${data.quantity}\nUnit Price: ${formatUGX(data.unitPrice)}\nTotal: ${formatUGX(data.totalAmount)}\nStatus: Paid in Full`;

    return { html, text };
}

// -------------------------------------------------------------
// 6. INVENTORY & NURSERY ALERTS
// -------------------------------------------------------------
export function buildInventoryAlertTemplate(data: {
    alertType: 'Low Stock' | 'Expiring Soon' | 'Chamber Overdue' | string;
    itemName: string;
    category?: string;
    currentQuantity?: number;
    threshold?: number;
    unit?: string;
    expiryDate?: string;
    recommendedAction?: string;
}): { html: string; text: string } {
    const title = `Inventory Alert: ${data.alertType} - ${data.itemName}`;

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #991b1b; font-weight: 700;">${escapeHtml(data.alertType)} Warning</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            The automated farm inventory scanner has detected an item requiring operational attention:
        </p>
        <table class="data-table" role="presentation">
            <tbody>
                <tr>
                    <td class="data-label">Item / Batch Name</td>
                    <td class="data-val">${escapeHtml(data.itemName)}</td>
                </tr>
                ${data.category ? `
                <tr>
                    <td class="data-label">Category</td>
                    <td class="data-val">${escapeHtml(data.category)}</td>
                </tr>
                ` : ''}
                ${data.currentQuantity !== undefined ? `
                <tr>
                    <td class="data-label">Current Quantity</td>
                    <td class="data-val" style="color: #dc2626;">${escapeHtml(data.currentQuantity)} ${escapeHtml(data.unit || 'units')}</td>
                </tr>
                ` : ''}
                ${data.threshold !== undefined ? `
                <tr>
                    <td class="data-label">Reorder Threshold</td>
                    <td class="data-val">${escapeHtml(data.threshold)} ${escapeHtml(data.unit || 'units')}</td>
                </tr>
                ` : ''}
                ${data.expiryDate ? `
                <tr>
                    <td class="data-label">Expiry Date</td>
                    <td class="data-val" style="color: #b91c1c;">${escapeHtml(data.expiryDate)}</td>
                </tr>
                ` : ''}
                ${data.recommendedAction ? `
                <tr>
                    <td class="data-label">Recommended Action</td>
                    <td class="data-val">${escapeHtml(data.recommendedAction)}</td>
                </tr>
                ` : ''}
            </tbody>
        </table>
    `;

    const html = wrapBaseEmail({ title, category: 'Inventory Warning' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\nItem: ${data.itemName}\nType: ${data.alertType}\nQty: ${data.currentQuantity}\nExpiry: ${data.expiryDate || 'N/A'}\nAction: ${data.recommendedAction || 'Review store supply'}`;

    return { html, text };
}

// -------------------------------------------------------------
// 7. REPORT DELIVERY WITH PDF ATTACHMENT
// -------------------------------------------------------------
export function buildReportDeliveryTemplate(data: {
    reportName: string;
    dateRange?: string;
    generatedBy?: string;
    summaryMetrics?: Record<string, any>;
}): { html: string; text: string } {
    const title = `Official Farm Report: ${data.reportName}`;

    let metricsHtml = '';
    let textMetrics = '';
    if (data.summaryMetrics && Object.keys(data.summaryMetrics).length > 0) {
        metricsHtml = `<table class="data-table" role="presentation"><tbody>${
            Object.entries(data.summaryMetrics).map(([k, v]) => `
                <tr>
                    <td class="data-label">${escapeHtml(k)}</td>
                    <td class="data-val">${escapeHtml(v)}</td>
                </tr>
            `).join('')
        }</tbody></table>`;

        textMetrics = '\nSummary:\n' + Object.entries(data.summaryMetrics).map(([k, v]) => `- ${k}: ${v}`).join('\n');
    }

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #1a3814; font-weight: 700;">${escapeHtml(data.reportName)}</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            The requested official farm operations report has been generated. The certified PDF document is attached to this email for your records.
        </p>
        ${data.dateRange ? `<p style="font-size: 13px; color: #4b5563;"><strong>Period Covered:</strong> ${escapeHtml(data.dateRange)}</p>` : ''}
        ${metricsHtml}
        <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">
            📎 <em>Please find the official PDF report attached. Keep this report confidential in accordance with estate policies.</em>
        </p>
    `;

    const html = wrapBaseEmail({ title, category: 'Official Estate Report' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\nReport: ${data.reportName}\nPeriod: ${data.dateRange || 'Current'}${data.generatedBy ? `\nGenerated by: ${data.generatedBy}` : ''}${textMetrics}\n\nPlease find the attached PDF report.`;

    return { html, text };
}

// -------------------------------------------------------------
// 8. MANAGER DATA ENTRY NOTIFICATION TO ADMINISTRATOR
// -------------------------------------------------------------
export interface ManagerEntryTemplateData {
    module: string;
    action: 'Created' | 'Updated' | 'Approved' | 'Completed' | 'Cancelled' | string;
    recordId: string;
    actorName: string;
    actorEmail?: string;
    timestamp?: string;
    summary: string;
    details?: Record<string, any>;
    portalPath?: string;
}

export function buildManagerEntryTemplate(data: ManagerEntryTemplateData): { html: string; text: string } {
    const title = `[Manager Entry] ${data.action}: ${data.module} (#${data.recordId})`;
    const portalBase = process.env.FARM_PORTAL_URL || 'https://gs-coffee-3d022.web.app';
    const actionUrl = data.portalPath ? `${portalBase}${data.portalPath}` : portalBase;

    let detailsHtml = '';
    let detailsText = '';
    if (data.details && Object.keys(data.details).length > 0) {
        detailsHtml = `<table class="data-table" role="presentation"><tbody>${
            Object.entries(data.details).map(([k, v]) => `
                <tr>
                    <td class="data-label">${escapeHtml(k)}</td>
                    <td class="data-val">${escapeHtml(v)}</td>
                </tr>
            `).join('')
        }</tbody></table>`;

        detailsText = '\n\nDetails:\n' + Object.entries(data.details).map(([k, v]) => `- ${k}: ${v}`).join('\n');
    }

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #1c3514; font-weight: 700;">Manager Operational Entry</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            An authorized farm manager has performed a <strong>${escapeHtml(data.action)}</strong> operation in <strong>${escapeHtml(data.module)}</strong>.
        </p>
        <table class="data-table" role="presentation">
            <tbody>
                <tr>
                    <td class="data-label">Module / Area</td>
                    <td class="data-val">${escapeHtml(data.module)}</td>
                </tr>
                <tr>
                    <td class="data-label">Action Performed</td>
                    <td class="data-val"><span style="display: inline-block; background: #eef6ea; color: #166534; font-weight: bold; padding: 2px 8px; border-radius: 4px;">${escapeHtml(data.action)}</span></td>
                </tr>
                <tr>
                    <td class="data-label">Record Identifier</td>
                    <td class="data-val" style="font-family: monospace; color: #1f3f18; font-weight: bold;">${escapeHtml(data.recordId)}</td>
                </tr>
                <tr>
                    <td class="data-label">Responsible Actor</td>
                    <td class="data-val">${escapeHtml(data.actorName)} ${data.actorEmail ? `&lt;${escapeHtml(data.actorEmail)}&gt;` : ''}</td>
                </tr>
                <tr>
                    <td class="data-label">Summary</td>
                    <td class="data-val">${escapeHtml(data.summary)}</td>
                </tr>
            </tbody>
        </table>
        ${detailsHtml}
        <div style="text-align: center; margin: 26px 0 10px;">
            <a href="${actionUrl}" class="btn-cta">Review in Farm Portal &rarr;</a>
        </div>
    `;

    const html = wrapBaseEmail({ title, category: `Manager Entry: ${data.module}` }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\nAction: ${data.action}\nModule: ${data.module}\nRecord ID: ${data.recordId}\nActor: ${data.actorName} (${data.actorEmail || 'N/A'})\nSummary: ${data.summary}${detailsText}\n\nReview: ${actionUrl}`;

    return { html, text };
}

// -------------------------------------------------------------
// 9. NURSERY STAGE UPDATE & MORTALITY ALERT
// -------------------------------------------------------------
export interface NurseryUpdateTemplateData {
    batchId: string;
    variety: string;
    stage: string;
    action: string;
    quantityEntered?: number;
    retainedCount?: number;
    lossCount?: number;
    availableStock?: number;
    recordedBy: string;
    notes?: string;
}

export function buildNurseryUpdateTemplate(data: NurseryUpdateTemplateData): { html: string; text: string } {
    const title = `Nursery Update: ${data.batchId} (${data.variety}) - ${data.stage}`;
    const portalBase = process.env.FARM_PORTAL_URL || 'https://gs-coffee-3d022.web.app';

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #164016; font-weight: 700;">Nursery Operations Update</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            Stage progression and inventory adjustments have been recorded for Robusta nursery batch <strong>${escapeHtml(data.batchId)}</strong>:
        </p>
        <table class="data-table" role="presentation">
            <tbody>
                <tr>
                    <td class="data-label">Batch ID</td>
                    <td class="data-val" style="font-family: monospace;">${escapeHtml(data.batchId)}</td>
                </tr>
                <tr>
                    <td class="data-label">Coffee Variety / Clone</td>
                    <td class="data-val"><strong>${escapeHtml(data.variety)}</strong></td>
                </tr>
                <tr>
                    <td class="data-label">Nursery Stage</td>
                    <td class="data-val">${escapeHtml(data.stage)}</td>
                </tr>
                <tr>
                    <td class="data-label">Action Recorded</td>
                    <td class="data-val">${escapeHtml(data.action)}</td>
                </tr>
                ${data.quantityEntered !== undefined ? `
                <tr>
                    <td class="data-label">Quantity Processed</td>
                    <td class="data-val">${Number(data.quantityEntered).toLocaleString()} plantlets</td>
                </tr>
                ` : ''}
                ${data.retainedCount !== undefined ? `
                <tr>
                    <td class="data-label">Healthy Retained</td>
                    <td class="data-val" style="color: #166534; font-weight: bold;">${Number(data.retainedCount).toLocaleString()} plantlets</td>
                </tr>
                ` : ''}
                ${data.lossCount !== undefined && data.lossCount > 0 ? `
                <tr>
                    <td class="data-label">Loss / Mortality</td>
                    <td class="data-val" style="color: #dc2626; font-weight: bold;">-${Number(data.lossCount).toLocaleString()} plantlets</td>
                </tr>
                ` : ''}
                ${data.availableStock !== undefined ? `
                <tr>
                    <td class="data-label">Available Stage Stock</td>
                    <td class="data-val" style="font-weight: bold;">${Number(data.availableStock).toLocaleString()} plantlets</td>
                </tr>
                ` : ''}
                <tr>
                    <td class="data-label">Recorded By</td>
                    <td class="data-val">${escapeHtml(data.recordedBy)}</td>
                </tr>
                ${data.notes ? `
                <tr>
                    <td class="data-label">Observations</td>
                    <td class="data-val">${escapeHtml(data.notes)}</td>
                </tr>
                ` : ''}
            </tbody>
        </table>
        <div style="text-align: center; margin: 26px 0 10px;">
            <a href="${portalBase}/nursery" class="btn-cta">Open Nursery Workspace &rarr;</a>
        </div>
    `;

    const html = wrapBaseEmail({ title, category: 'Nursery Operations' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\nBatch: ${data.batchId}\nVariety: ${data.variety}\nStage: ${data.stage}\nAction: ${data.action}\nRetained: ${data.retainedCount || 'N/A'}\nLoss: ${data.lossCount || 0}\nRecorded by: ${data.recordedBy}`;

    return { html, text };
}

// -------------------------------------------------------------
// 10. BACKGROUND JOB / SYSTEM ERROR NOTIFICATION
// -------------------------------------------------------------
export interface BackgroundJobFailureData {
    jobName: string;
    failureTime: string;
    errorMessage: string;
    affectedRecords?: string;
    recommendedAction?: string;
}

export function buildBackgroundJobFailureTemplate(data: BackgroundJobFailureData): { html: string; text: string } {
    const title = `[Critical System Error] Background Job Failed: ${data.jobName}`;
    const portalBase = process.env.FARM_PORTAL_URL || 'https://gs-coffee-3d022.web.app';

    const bodyHtml = `
        <h2 style="margin: 0 0 14px; font-size: 19px; color: #991b1b; font-weight: 700;">Background Service Failure</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
            An automated background task encountered an unhandled exception or failed execution. Immediate administrative inspection is advised:
        </p>
        <table class="data-table" role="presentation">
            <tbody>
                <tr>
                    <td class="data-label">Job / Task Name</td>
                    <td class="data-val" style="color: #991b1b; font-weight: bold;">${escapeHtml(data.jobName)}</td>
                </tr>
                <tr>
                    <td class="data-label">Timestamp</td>
                    <td class="data-val">${escapeHtml(data.failureTime)}</td>
                </tr>
                <tr>
                    <td class="data-label">Error Details</td>
                    <td class="data-val" style="font-family: monospace; font-size: 13px; color: #7f1d1d; background: #fef2f2;">${escapeHtml(data.errorMessage)}</td>
                </tr>
                ${data.affectedRecords ? `
                <tr>
                    <td class="data-label">Scope / Affected Records</td>
                    <td class="data-val">${escapeHtml(data.affectedRecords)}</td>
                </tr>
                ` : ''}
                <tr>
                    <td class="data-label">Recommended Action</td>
                    <td class="data-val">${escapeHtml(data.recommendedAction || 'Inspect Cloud Functions logs in Google Cloud Console and verify data integrity.')}</td>
                </tr>
            </tbody>
        </table>
        <div style="text-align: center; margin: 26px 0 10px;">
            <a href="${portalBase}/settings" class="btn-cta">Open System Diagnostics &rarr;</a>
        </div>
    `;

    const html = wrapBaseEmail({ title, category: 'System Error Alert' }, bodyHtml);
    const text = `[G&S COFFEE FARMS] ${title}\nJob: ${data.jobName}\nTime: ${data.failureTime}\nError: ${data.errorMessage}\nAction: ${data.recommendedAction || 'Inspect logs'}`;

    return { html, text };
}


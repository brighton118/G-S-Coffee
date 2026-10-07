import jsPDF from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';
import { format } from 'date-fns';
import { Worker, AttendanceRecord, PayrollRecord, InventoryItem, InventoryTransaction, SalesOrder, CloneBatch, ProductionHumidChamber, ProductionSorting, ActivityLog } from '../db';
import { formatUGX } from './calculations';

// Color Palette for G&S COOFFEE Farm PDF Branding
const BRAND_PRIMARY: [number, number, number] = [46, 125, 50]; // #2E7D32 Forest Green
const BRAND_DARK: [number, number, number] = [27, 94, 32]; // #1B5E20 Dark Green
const BRAND_ACCENT: [number, number, number] = [139, 69, 19]; // Saddle Brown (Coffee)
const TEXT_DARK: [number, number, number] = [33, 33, 33];
const TEXT_MUTED: [number, number, number] = [100, 100, 100];

/**
 * Helper to apply common header and footer to any PDF report
 */
function applyHeaderAndFooter(
    doc: jsPDF,
    title: string,
    subtitle?: string,
    filterInfo?: string
) {
    const pageCount = (doc as any).internal.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Top Brand Header Banner
        if (i === 1) {
            doc.setFillColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
            doc.rect(0, 0, pageWidth, 28, 'F');

            // Top decorative bar
            doc.setFillColor(BRAND_ACCENT[0], BRAND_ACCENT[1], BRAND_ACCENT[2]);
            doc.rect(0, 28, pageWidth, 3, 'F');

            // Farm Title
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('G&S COOFFEE FARM MANAGEMENT SYSTEM', 14, 14);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text('High-Yield Clonal Coffee Nursery & Commercial Farm | Mubende, Uganda', 14, 21);

            // Report Meta Box
            doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(title, 14, 40);

            if (subtitle) {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
                doc.text(subtitle, 14, 46);
            }

            if (filterInfo) {
                doc.setFontSize(8.5);
                doc.setTextColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
                doc.text(`Scope: ${filterInfo}`, 14, 52);
            }
        } else {
            // Running header on page 2+
            doc.setFillColor(245, 245, 245);
            doc.rect(0, 0, pageWidth, 12, 'F');
            doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`G&S COOFFEE Farm — ${title}`, 14, 8);
            doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, pageWidth - 14, 8, { align: 'right' });
        }

        // Bottom Footer (all pages)
        doc.setDrawColor(220, 220, 220);
        doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);

        doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Confidential • Internal G&S COOFFEE Farm Operations Record', 14, pageHeight - 8);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
    }
}

/**
 * 1. WORKERS DIRECTORY REPORT
 */
export function generateWorkerListPDF(workers: Worker[], filterInfo?: string): void {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const startY = 58;

    const tableData: RowInput[] = workers.map((w, index) => [
        (index + 1).toString(),
        w.workerId,
        w.fullName,
        w.gender || 'N/A',
        w.phoneNumber,
        w.dateJoined,
        formatUGX(w.monthlySalary || 0),
        formatUGX(w.overtimeRate || 0),
        w.status
    ]);

    autoTable(doc, {
        startY,
        head: [['#', 'Worker ID', 'Full Name', 'Gender', 'Phone Number', 'Date Joined', 'Base Monthly Salary (UGX)', 'Overtime Rate / Hr (UGX)', 'Status']],
        body: tableData,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 25, fontStyle: 'bold' },
            6: { halign: 'right' },
            7: { halign: 'right' },
            8: { halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });

    applyHeaderAndFooter(
        doc,
        'WORKERS DIRECTORY & SALARY STRUCTURE REPORT',
        `Active & Inactive Farm Labor Force (${workers.length} Registered Workers)`,
        filterInfo || 'All Workers'
    );

    const fileScope = filterInfo ? filterInfo.replace(/[^0-9A-Za-z-]+/g, '_') : format(new Date(), 'yyyy-MM-dd');
    doc.save(`GS_Workers_Report_${fileScope}.pdf`);
}

/**
 * 2. ATTENDANCE MASTER REPORT
 */
export function generateAttendanceReportPDF(
    records: AttendanceRecord[],
    filterInfo?: string
): void {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const startY = 58;

    const tableData: RowInput[] = records.map((r, index) => [
        (index + 1).toString(),
        r.workerId,
        r.workerName || r.workerId,
        r.date,
        r.timeIn || '--:--',
        r.timeOut || '--:--',
        r.scheduledHours ? `${r.scheduledHours.toFixed(1)} hrs` : '8.0 hrs',
        r.actualHours ? `${r.actualHours.toFixed(2)} hrs` : '0.0 hrs',
        r.status,
        r.overtimeHours ? `${r.overtimeHours.toFixed(1)} hrs` : '0.0 hrs',
        r.overtimeStatus || 'None',
        r.notes || '-'
    ]);

    autoTable(doc, {
        startY,
        head: [['#', 'Worker ID', 'Name', 'Date', 'Clock-In', 'Clock-Out', 'Sched. Hrs', 'Actual Hrs', 'Status', 'OT Hours', 'OT Status', 'Exceptions / Notes']],
        body: tableData,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 22, fontStyle: 'bold' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'right' },
            7: { halign: 'right' },
            8: { halign: 'center' },
            9: { halign: 'right' },
            10: { halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });

    applyHeaderAndFooter(
        doc,
        'ATTENDANCE & TIME TRACKING MASTER REPORT',
        `Daily, Weekly & Monthly Worker Scans with Attendance Exceptions (${records.length} Logs)`,
        filterInfo
    );

    doc.save(`GS_Attendance_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/**
 * 3. OVERTIME AUDIT & APPROVAL REPORT
 */
export function generateOvertimeReportPDF(
    records: AttendanceRecord[],
    filterInfo?: string
): void {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const startY = 58;

    const otRecords = records.filter(r => (r.overtimeHours || 0) > 0 || r.overtimeStatus === 'Pending' || r.overtimeStatus === 'Approved');

    let totalOTClaimed = 0;
    let totalOTApproved = 0;

    const tableData: RowInput[] = otRecords.map((r, index) => {
        totalOTClaimed += r.overtimeHours || 0;
        totalOTApproved += r.overtimeStatus === 'Approved' ? (r.overtimeApprovedHours || r.overtimeHours || 0) : 0;

        return [
            (index + 1).toString(),
            r.workerId,
            r.workerName || r.workerId,
            r.date,
            r.timeIn,
            r.timeOut || '--:--',
            `${(r.overtimeHours || 0).toFixed(1)} hrs`,
            r.overtimeStatus === 'Approved' ? `${(r.overtimeApprovedHours || r.overtimeHours || 0).toFixed(1)} hrs` : '0.0 hrs',
            r.overtimeStatus || 'Pending',
            r.overtimeApprovedBy || '-',
            r.overtimeReason || r.notes || '-'
        ];
    });

    autoTable(doc, {
        startY,
        head: [['#', 'Worker ID', 'Name', 'Date', 'Time In', 'Time Out', 'Potential OT', 'Approved OT', 'Approval Status', 'Supervisor', 'Reason / Notes']],
        body: tableData,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.8 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 22, fontStyle: 'bold' },
            6: { halign: 'right' },
            7: { halign: 'right', fontStyle: 'bold' },
            8: { halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });

    applyHeaderAndFooter(
        doc,
        'OVERTIME EVALUATION & SUPERVISOR APPROVAL REPORT',
        `Claimed OT: ${totalOTClaimed.toFixed(1)} hrs | Approved OT: ${totalOTApproved.toFixed(1)} hrs (${otRecords.length} Records)`,
        filterInfo
    );

    doc.save(`GS_Overtime_Audit_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/**
 * 4. PAYROLL MASTER SHEET REPORT (5 Columns)
 */
export function generatePayrollMasterSheetPDF(
    payroll: PayrollRecord[],
    period: string
): void {
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const startY = 58;

    let totalBase = 0;
    let totalOT = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const tableData: RowInput[] = payroll.map(p => {
        totalBase += p.monthlySalary;
        totalOT += p.overtimeEarnings;
        totalDeductions += p.deductions;
        totalNet += p.netPay;

        return [
            p.serialNumber.toString(),
            p.workerName,
            formatUGX(p.monthlySalary),
            formatUGX(p.overtimeEarnings),
            formatUGX(p.netPay)
        ];
    });

    tableData.push([
        'TOTALS',
        `Workers: ${payroll.length}`,
        formatUGX(totalBase),
        formatUGX(totalOT),
        formatUGX(totalNet)
    ]);

    autoTable(doc, {
        startY,
        head: [['S/M', 'Name', 'Monthly Salary (UGX)', 'Overtime (UGX)', 'Net Pay (UGX)']],
        body: tableData,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3.5 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
            0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 60, fontStyle: 'bold' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
    });

    applyHeaderAndFooter(
        doc,
        'MONTHLY MASTER PAYROLL REPORT',
        `Net Payroll Disbursement: ${formatUGX(totalNet)} (Base: ${formatUGX(totalBase)} + OT: ${formatUGX(totalOT)} - Deductions: ${formatUGX(totalDeductions)})`,
        `Payroll Period: ${period}`
    );

    doc.save(`GS_Payroll_Master_${period.replace(/[^0-9A-Za-z-]+/g, '_')}.pdf`);
}

/**
 * 5. INDIVIDUAL PAYSLIP
 */
export function generateIndividualPayslipPDF(payroll: PayrollRecord): void {
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Border
    doc.setDrawColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
    doc.setLineWidth(0.8);
    doc.rect(10, 10, pageWidth - 20, 277);

    // Header
    doc.setFillColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
    doc.rect(10, 10, pageWidth - 20, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('G&S COOFFEE FARM', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('OFFICIAL EMPLOYEE MONTHLY PAYSLIP', pageWidth / 2, 26, { align: 'center' });
    doc.text(`Payroll Period: ${payroll.payrollMonth || payroll.payrollPeriod}`, pageWidth / 2, 32, { align: 'center' });

    // Worker Info Box
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');

    doc.setFillColor(245, 247, 245);
    doc.rect(14, 42, pageWidth - 28, 30, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(14, 42, pageWidth - 28, 30, 'S');

    doc.text(`Employee Serial No (S/M):`, 18, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(String(payroll.serialNumber), 75, 50);

    doc.setFont('helvetica', 'bold');
    doc.text(`Worker ID:`, 18, 57);
    doc.setFont('helvetica', 'normal');
    doc.text(payroll.workerId, 75, 57);

    doc.setFont('helvetica', 'bold');
    doc.text(`Worker Full Name:`, 18, 64);
    doc.setFont('helvetica', 'normal');
    doc.text(payroll.workerName, 75, 64);

    doc.setFont('helvetica', 'bold');
    doc.text(`Payment Status:`, 120, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(payroll.status, 160, 50);

    doc.setFont('helvetica', 'bold');
    doc.text(`Date Generated:`, 120, 57);
    doc.setFont('helvetica', 'normal');
    doc.text(payroll.generatedAt ? format(new Date(payroll.generatedAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'), 160, 57);

    // Earnings Table
    const earningsBody: RowInput[] = [
        ['Monthly Base Salary', formatUGX(payroll.monthlySalary)],
        [`Approved Overtime (${payroll.approvedOvertimeHours.toFixed(1)} hrs @ ${formatUGX(payroll.overtimeRate || 3500)}/hr)`, formatUGX(payroll.overtimeEarnings)],
        ['Total Gross Earnings', formatUGX(payroll.monthlySalary + payroll.overtimeEarnings)]
    ];

    autoTable(doc, {
        startY: 78,
        head: [['Earnings Description', 'Amount (UGX)']],
        body: earningsBody,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255 },
        styles: { fontSize: 9, cellPadding: 3.5 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;

    // Deductions Table
    const deductionsBody: RowInput[] = [
        ['Statutory & Farm Deductions', formatUGX(payroll.deductions)],
        ['Total Deductions', formatUGX(payroll.deductions)]
    ];

    autoTable(doc, {
        startY: finalY,
        head: [['Deductions Breakdown', 'Amount (UGX)']],
        body: deductionsBody,
        headStyles: { fillColor: BRAND_ACCENT, textColor: 255 },
        styles: { fontSize: 9, cellPadding: 3.5 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 }
    });

    const netY = (doc as any).lastAutoTable.finalY + 8;

    // Net Pay Banner
    doc.setFillColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
    doc.rect(14, netY, pageWidth - 28, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL NET PAYABLE AMOUNT:', 20, netY + 11);
    doc.setFontSize(13);
    doc.text(formatUGX(payroll.netPay), pageWidth - 20, netY + 11, { align: 'right' });

    // Formula
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Formula: Net Pay = Monthly Salary + Approved Overtime Earnings - Deductions', 14, netY + 24);

    // Signatures
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.line(14, netY + 55, 75, netY + 55);
    doc.text('Prepared by: Finance Officer', 14, netY + 60);

    doc.line(pageWidth - 75, netY + 55, pageWidth - 14, netY + 55);
    doc.text('Employee Signature & Date', pageWidth - 75, netY + 60);

    doc.save(`GS_Payslip_${payroll.workerId}_${payroll.payrollMonth || payroll.payrollPeriod}.pdf`);
}

/**
 * 6. INVENTORY MASTER & VALUATION REPORT
 */
export function generateInventoryReportPDF(
    items: InventoryItem[],
    transactions: InventoryTransaction[] = [],
    dateRange?: string
): void {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const startY = 58;

    let totalValuation = 0;
    const tableData: RowInput[] = items.map((i, index) => {
        const itemVal = (Number(i.quantity) || 0) * (Number(i.purchasePrice) || 0);
        totalValuation += itemVal;

        return [
            (index + 1).toString(),
            i.inventoryId,
            i.name,
            i.category,
            `${i.quantity} ${i.unit}`,
            `${i.minStockLevel} ${i.unit}`,
            formatUGX(i.purchasePrice),
            formatUGX(itemVal),
            i.supplier || 'N/A',
            i.condition || 'N/A',
            i.status
        ];
    });

    tableData.push([
        'TOTALS',
        `Items: ${items.length}`,
        '',
        '',
        '',
        '',
        '',
        formatUGX(totalValuation),
        '',
        '',
        ''
    ]);

    autoTable(doc, {
        startY,
        head: [['#', 'SKU / ID', 'Item Name', 'Category', 'Stock Qty', 'Min Stock', 'Unit Cost (UGX)', 'Valuation (UGX)', 'Supplier', 'Condition', 'Status']],
        body: tableData,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.8 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 25, fontStyle: 'bold' },
            4: { halign: 'right', fontStyle: 'bold' },
            5: { halign: 'right' },
            6: { halign: 'right' },
            7: { halign: 'right', fontStyle: 'bold' },
            10: { halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });

    if (dateRange) {
        const movementRows: RowInput[] = transactions.map((transaction, index) => [
            (index + 1).toString(),
            transaction.date,
            transaction.inventoryId,
            transaction.itemName || '',
            transaction.type,
            `${transaction.quantityChange > 0 ? '+' : ''}${transaction.quantityChange}`,
            transaction.user,
            transaction.reason
        ]);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 12,
            head: [['#', 'Date', 'Item ID', 'Item', 'Movement', 'Qty Change', 'Recorded By', 'Reason']],
            body: movementRows.length > 0 ? movementRows : [['', '', '', 'No stock movements in this date range.', '', '', '', '']],
            headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 2.8 },
            alternateRowStyles: { fillColor: [248, 249, 250] },
            columnStyles: {
                0: { cellWidth: 8, halign: 'center' },
                1: { cellWidth: 24 },
                2: { cellWidth: 24, fontStyle: 'bold' },
                5: { halign: 'right' }
            },
            margin: { left: 14, right: 14 }
        });
    }

    applyHeaderAndFooter(
        doc,
        'INVENTORY VALUATION & STOCK REGISTRY REPORT',
        `Current stock snapshot | 4 Categories (Fertilizers, Pesticides, Farm Tools, Nursery Supplies) | Total Valuation: ${formatUGX(totalValuation)}`,
        dateRange ? `Stock movements: ${dateRange}` : 'All Active & Archived Items'
    );

    const fileScope = dateRange ? dateRange.replace(/[^0-9A-Za-z-]+/g, '_') : format(new Date(), 'yyyy-MM-dd');
    doc.save(`GS_Inventory_Report_${fileScope}.pdf`);
}

/**
 * 7. CLONE PRODUCTION SUMMARY REPORT
 */
export function generateProductionStageReportPDF(
    batches: CloneBatch[],
    _humidChambers: ProductionHumidChamber[] = [],
    _sortings: ProductionSorting[] = [],
    selectedStage = 'All Stages'
): void {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const startY = 58;

    let totalClones = 0;

    const tableData: RowInput[] = batches.map((b, index) => {
        totalClones += b.currentQuantity;
        return [
            (index + 1).toString(),
            b.batchId,
            b.variety,
            b.currentStage,
            b.originalQuantity.toLocaleString(),
            b.currentQuantity.toLocaleString(),
            b.dateObtained,
            b.sourceFarm || 'G&S Mother Block',
            b.personResponsible || 'Supervisor'
        ];
    });

    tableData.push([
        'TOTALS',
        `Batches: ${batches.length}`,
        '',
        '',
        '',
        totalClones.toLocaleString(),
        '',
        '',
        ''
    ]);

    autoTable(doc, {
        startY,
        head: [['#', 'Batch ID', 'Variety (KR)', 'Current Stage', 'Initial Qty', 'Current Qty', 'Date Initiated', 'Mother Garden Source', 'Supervisor']],
        body: tableData,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 28, fontStyle: 'bold' },
            2: { cellWidth: 20, fontStyle: 'bold', halign: 'center' },
            4: { halign: 'right' },
            5: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
    });

    applyHeaderAndFooter(
        doc,
        'COFFEE NURSERY CLONE PRODUCTION TRACKING REPORT',
        `5-Stage Life Cycle (Cutting -> Humid Chamber -> 1st Hardening -> 2nd Hardening -> Sorting) | Varieties: KR1, KR3-KR10`,
        `Stage: ${selectedStage}`
    );

    doc.save(`GS_Clone_Production_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/**
 * 8. SALES ORDERS MASTER REPORT
 */
export function generateSalesOrdersReportPDF(
    orders: SalesOrder[],
    summaryOrFilter?: any
): void {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const startY = 58;

    let totalRevenue = 0;
    let totalQuantity = 0;

    const tableData: RowInput[] = orders.map((o, index) => {
        const total = o.totalAmount || 0;
        const qty = o.quantity || o.quantityOrdered || 0;
        const price = o.unitPrice || o.pricePerClone || 2500;

        totalRevenue += total;
        totalQuantity += qty;

        return [
            (index + 1).toString(),
            o.invoiceNumber || o.orderId || `GSF-INV-${index + 1}`,
            o.orderDate,
            o.customerName,
            o.customerPhone,
            o.variety || o.cloneType || 'KR1',
            qty.toLocaleString(),
            formatUGX(price),
            formatUGX(total)
        ];
    });

    tableData.push([
        'TOTALS',
        `Orders: ${orders.length}`,
        '',
        '',
        '',
        '',
        totalQuantity.toLocaleString(),
        '',
        '',
        formatUGX(totalRevenue)
    ]);

    autoTable(doc, {
        startY,
        head: [['#', 'Invoice #', 'Date', 'Customer', 'Phone', 'Variety', 'Qty', 'Unit Price', 'Cash Sale Total']],
        body: tableData,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 2.2 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 24, fontStyle: 'bold' },
            5: { cellWidth: 14, fontStyle: 'bold', halign: 'center' },
            6: { halign: 'right' },
            8: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
    });

    applyHeaderAndFooter(
        doc,
        'COFFEE CLONE CASH SALES REPORT',
        `Total Cash Sales: ${formatUGX(totalRevenue)} | Plantlets Sold: ${totalQuantity.toLocaleString()}`,
        typeof summaryOrFilter === 'string' ? summaryOrFilter : 'All Orders'
    );

    doc.save(`GS_Sales_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/**
 * 9. SALES INVOICE & RECEIPT
 */
export function generatePlantletReceiptPDF(order: SalesOrder): void {
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    const invNumber = order.invoiceNumber || order.orderId || 'GSF-INV-0001';
    const variety = order.variety || order.cloneType || 'KR1';
    const qty = order.quantity || order.quantityOrdered || 0;
    const price = order.unitPrice || order.pricePerClone || 2500;
    const total = order.totalAmount || (qty * price);

    // Outer Border
    doc.setDrawColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
    doc.setLineWidth(0.8);
    doc.rect(10, 10, pageWidth - 20, 277);

    // Header
    doc.setFillColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
    doc.rect(10, 10, pageWidth - 20, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('G&S COOFFEE FARM', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('COMMERCIAL COFFEE CLONE SALES INVOICE & RECEIPT', pageWidth / 2, 26, { align: 'center' });
    doc.text(`Invoice / Receipt #: ${invNumber}`, pageWidth / 2, 32, { align: 'center' });

    // Customer & Order Metadata
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');

    doc.setFillColor(245, 247, 245);
    doc.rect(14, 42, pageWidth - 28, 36, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(14, 42, pageWidth - 28, 36, 'S');

    doc.text(`Customer Name:`, 18, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(order.customerName, 65, 50);

    doc.setFont('helvetica', 'bold');
    doc.text(`Customer Contact:`, 18, 58);
    doc.setFont('helvetica', 'normal');
    doc.text(order.customerPhone, 65, 58);

    doc.setFont('helvetica', 'bold');
    doc.text(`Transaction Date:`, 18, 66);
    doc.setFont('helvetica', 'normal');
    doc.text(order.orderDate, 65, 66);

    // Items Table
    const tableRows: RowInput[] = [
        [
            `Certified High-Yield Coffee Clone (${variety})\nOrigin: G&S Certified Nursery Block`,
            qty.toLocaleString(),
            formatUGX(price),
            formatUGX(total)
        ]
    ];

    autoTable(doc, {
        startY: 85,
        head: [['Item Description / Clone Variety', 'Quantity', 'Unit Price (UGX)', 'Subtotal (UGX)']],
        body: tableRows,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 30, halign: 'center' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;

    // Financial Summary
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`CASH RECEIVED IN FULL:`, 120, finalY);
    doc.text(`${formatUGX(total)}`, pageWidth - 14, finalY, { align: 'right' });

    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    if (order.notes) {
        doc.text(`Notes: ${order.notes}`, 14, finalY + 15);
    }

    // Signatures
    doc.line(14, finalY + 40, 70, finalY + 40);
    doc.text('Issued by (G&S COOFFEE Farm)', 14, finalY + 44);

    doc.line(pageWidth - 70, finalY + 40, pageWidth - 14, finalY + 40);
    doc.text('Customer Received by', pageWidth - 70, finalY + 44);

    doc.save(`GS_Receipt_${invNumber}.pdf`);
}

/**
 * 10. SYSTEM AUDIT TRAIL REPORT
 */
export function generateUniversalFarmAuditPDF(logs: ActivityLog[], filterInfo?: string): void {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const startY = 58;

    const tableData: RowInput[] = logs.map((l, index) => [
        (index + 1).toString(),
        l.date ? format(new Date(l.date), 'yyyy-MM-dd HH:mm') : '-',
        l.user,
        l.module,
        l.action,
        l.recordIdentifier,
        l.description
    ]);

    autoTable(doc, {
        startY,
        head: [['#', 'Timestamp', 'User', 'Module', 'Action', 'Identifier', 'Description']],
        body: tableData,
        headStyles: { fillColor: BRAND_PRIMARY, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 32 },
            2: { cellWidth: 24, fontStyle: 'bold' },
            3: { cellWidth: 26 },
            4: { cellWidth: 24 }
        },
        margin: { left: 14, right: 14 }
    });

    applyHeaderAndFooter(
        doc,
        'SYSTEM AUDIT TRAIL & COMPLIANCE LOG',
        `User Actions & System Transactions (${logs.length} Logged Entries)`,
        filterInfo
    );

    doc.save(`GS_Audit_Trail_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/**
 * 11. WORKER FARM ID CARD
 */
export function generateWorkerIdCardPDF(worker: Worker): void {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [85.6, 54] // Standard ID-1 CR80 card size
    });

    // Background Card Styling
    doc.setFillColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
    doc.rect(0, 0, 85.6, 14, 'F');

    doc.setFillColor(BRAND_ACCENT[0], BRAND_ACCENT[1], BRAND_ACCENT[2]);
    doc.rect(0, 14, 85.6, 1.5, 'F');

    // Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('G&S COOFFEE FARM', 42.8, 6, { align: 'center' });

    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.text('OFFICIAL WORKER IDENTIFICATION', 42.8, 10, { align: 'center' });

    // Worker Details
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(worker.fullName.toUpperCase(), 42.8, 22, { align: 'center' });

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`ID: ${worker.workerId}`, 10, 28);
    doc.text(`Card: ${worker.farmCardNumber || worker.workerId}`, 10, 33);
    doc.text(`Phone: ${worker.phoneNumber}`, 10, 38);
    doc.text(`Status: ${worker.status}`, 10, 43);

    // QR Payload display
    doc.setDrawColor(200, 200, 200);
    doc.rect(54, 25, 24, 22);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text('SCAN QR CODE', 66, 33, { align: 'center' });
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.text(worker.workerId, 66, 39, { align: 'center' });

    // Footer
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 49, 85.6, 5, 'F');
    doc.setFontSize(4.5);
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text('Authorized by G&S COOFFEE Farm Management • Mubende, Uganda', 42.8, 52.5, { align: 'center' });

    doc.save(`GS_FarmCard_${worker.workerId}.pdf`);
}

// ==========================================
// EXPORT ALIASES FOR COMPATIBILITY
// ==========================================
export const generateWorkersMasterPDF = generateWorkerListPDF;
export const generateAttendancePDF = generateAttendanceReportPDF;
export const generateAttendanceMasterPDF = generateAttendanceReportPDF;
export const generateOvertimePDF = generateOvertimeReportPDF;
export const generateOvertimeMasterPDF = generateOvertimeReportPDF;
export const generatePayrollMasterPDF = generatePayrollMasterSheetPDF;
export const generatePayslipPDF = generateIndividualPayslipPDF;
export const generateInventoryPDF = generateInventoryReportPDF;
export const generateInventoryValuationPDF = (items: InventoryItem[]) => generateInventoryReportPDF(items, []);
export const generateCloneProductionSummaryPDF = (
    batches: CloneBatch[],
    chambers?: ProductionHumidChamber[],
    sortings?: ProductionSorting[],
    selectedStage?: string
) => generateProductionStageReportPDF(batches, chambers, sortings, selectedStage || 'All Stages');
export const generateProductionBatchMasterPDF = generateProductionStageReportPDF;
export const generateSalesMasterPDF = generateSalesOrdersReportPDF;
export const generateSalesReceiptPDF = generatePlantletReceiptPDF;
export const generateSalesSummaryPDF = generateSalesOrdersReportPDF;

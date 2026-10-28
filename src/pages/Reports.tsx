import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { format } from 'date-fns';
import { 
    FileText, 
    Download, 
    Users, 
    Calendar, 
    Clock, 
    DollarSign, 
    Layers, 
    Package, 
    TrendingUp, 
    ShieldCheck,
    Mail,
    CheckCircle2
} from 'lucide-react';
import {
    generateWorkersMasterPDF,
    generateAttendancePDF,
    generateOvertimePDF,
    generatePayrollMasterPDF,
    generateCloneProductionSummaryPDF,
    generateInventoryPDF,
    generateSalesMasterPDF,
    generateUniversalFarmAuditPDF
} from '../utils/pdfGenerator';
import { calculateInventoryValuation } from '../utils/calculations';
import { emailService } from '../services/emailService';
import { auth } from '../firebase';

const Reports: React.FC = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [startDate, setStartDate] = useState<string>(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState<string>(today);
    const [isExporting, setIsExporting] = useState<string | null>(null);
    const [isEmailing, setIsEmailing] = useState<string | null>(null);
    const [reportNotice, setReportNotice] = useState<string | null>(null);
    const [dateRangeError, setDateRangeError] = useState('');

    // Queries
    const workers = useLiveQuery(() => db.workers.toArray()) || [];
    const attendance = useLiveQuery(() => db.attendance.toArray()) || [];
    const payrollRecords = useLiveQuery(() => db.payrollRecords.toArray()) || [];
    const cloneBatches = useLiveQuery(() => db.cloneBatches.toArray()) || [];
    const humidChambers = useLiveQuery(() => db.productionHumidChamber.toArray()) || [];
    const sortings = useLiveQuery(() => db.productionSortings.toArray()) || [];
    const inventory = useLiveQuery(() => db.inventoryItems.toArray()) || [];
    const inventoryTransactions = useLiveQuery(() => db.inventoryTransactions.toArray()) || [];
    const sales = useLiveQuery(() => db.salesOrders.toArray()) || [];
    const activityLogs = useLiveQuery(() => db.activityLogs.toArray()) || [];

    const isInDateRange = (date?: string) => {
        if (!date) return false;
        const dateOnly = date.slice(0, 10);
        return dateOnly >= startDate && dateOnly <= endDate;
    };
    const rangeLabel = `${startDate} to ${endDate}`;
    const rangeStartMonth = startDate.slice(0, 7);
    const rangeEndMonth = endDate.slice(0, 7);
    const workersInRange = workers.filter(worker => isInDateRange(worker.dateJoined));
    const attendanceInRange = attendance.filter(record => isInDateRange(record.date));
    const payrollInRange = payrollRecords.filter(record => {
        const period = record.payrollMonth || record.payrollPeriod || '';
        return period >= rangeStartMonth && period <= rangeEndMonth;
    });
    const cloneBatchesInRange = cloneBatches.filter(batch => isInDateRange(batch.dateObtained));
    const inventoryMovementsInRange = inventoryTransactions.filter(transaction => isInDateRange(transaction.date));
    const salesInRange = sales.filter(order => isInDateRange(order.orderDate));
    const rangeStartTimestamp = new Date(`${startDate}T00:00:00`).getTime();
    const rangeEndTimestamp = new Date(`${endDate}T23:59:59.999`).getTime();
    const activityLogsInRange = activityLogs.filter(log => {
        const timestamp = new Date(log.date).getTime();
        return timestamp >= rangeStartTimestamp && timestamp <= rangeEndTimestamp;
    });

    const handleExport = async (type: string) => {
        if (!startDate || !endDate || startDate > endDate) {
            setDateRangeError('Choose a valid start and end date. The start date must be before or the same as the end date.');
            return;
        }

        setDateRangeError('');
        setIsExporting(type);
        try {
            switch (type) {
                case 'workers':
                    generateWorkersMasterPDF(workersInRange, `Date joined: ${rangeLabel}`);
                    break;
                case 'attendance': {
                    const enrichedAttendance = attendanceInRange.map(r => {
                        const worker = workers.find(w => w.workerId === r.workerId);
                        return {
                            ...r,
                            workerName: r.workerName || worker?.fullName || r.workerId
                        };
                    });
                    generateAttendancePDF(enrichedAttendance, `Attendance Report - ${rangeLabel}`);
                    break;
                }
                case 'overtime': {
                    const enrichedOT = attendanceInRange.map(r => {
                        const worker = workers.find(w => w.workerId === r.workerId);
                        return {
                            ...r,
                            workerName: r.workerName || worker?.fullName || r.workerId
                        };
                    });
                    generateOvertimePDF(enrichedOT, `Overtime & Shift Evaluation - ${rangeLabel}`);
                    break;
                }
                case 'payroll': {
                    generatePayrollMasterPDF(payrollInRange, rangeLabel);
                    break;
                }
                case 'clones':
                    generateCloneProductionSummaryPDF(
                        cloneBatchesInRange,
                        humidChambers,
                        sortings,
                        `All Stages - ${rangeLabel}`
                    );
                    break;
                case 'inventory':
                    generateInventoryPDF(inventory, inventoryMovementsInRange, rangeLabel);
                    break;
                case 'sales': {
                    generateSalesMasterPDF(salesInRange, `Sales Report - ${rangeLabel}`);
                    break;
                }
                case 'audit': {
                    generateUniversalFarmAuditPDF(activityLogsInRange, `Farm Operations Audit Trail - ${rangeLabel}`);
                    break;
                }
            }
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            alert('Failed to generate PDF. Check browser console for details.');
        } finally {
            setIsExporting(null);
        }
    };

    const handleEmailReport = async (type: string, title: string) => {
        if (!startDate || !endDate || startDate > endDate) {
            setDateRangeError('Choose a valid start and end date.');
            return;
        }

        setIsEmailing(type);
        setReportNotice(null);

        try {
            const summaryMetrics: Record<string, any> = {
                'Report Range': rangeLabel,
                'Generated By': auth.currentUser?.email || 'Farm Administrator'
            };

            switch (type) {
                case 'workers':
                    summaryMetrics['Total Workers Joined in Period'] = workersInRange.length;
                    break;
                case 'attendance':
                    summaryMetrics['Attendance Logs Recorded'] = attendanceInRange.length;
                    break;
                case 'overtime':
                    summaryMetrics['Overtime Shifts Recorded'] = attendanceInRange.filter(a => (a.overtimeHours || 0) > 0).length;
                    break;
                case 'payroll':
                    summaryMetrics['Payroll Runs in Period'] = payrollInRange.length;
                    summaryMetrics['Total Net Disbursed'] = `UGX ${payrollInRange.reduce((s, r) => s + (r.netPay || 0), 0).toLocaleString()}`;
                    break;
                case 'clones':
                    summaryMetrics['Clone Batches in Period'] = cloneBatchesInRange.length;
                    summaryMetrics['Active Humid Chambers'] = humidChambers.length;
                    break;
                case 'inventory':
                    summaryMetrics['Inventory Movements'] = inventoryMovementsInRange.length;
                    summaryMetrics['Total Stock Valuation'] = `UGX ${calculateInventoryValuation(inventory).toLocaleString()}`;
                    break;
                case 'sales':
                    summaryMetrics['Total Sales Orders'] = salesInRange.length;
                    summaryMetrics['Gross Cash Revenue'] = `UGX ${salesInRange.reduce((s, o) => s + (o.totalAmount || 0), 0).toLocaleString()}`;
                    break;
                case 'audit':
                    summaryMetrics['Audit Log Records'] = activityLogsInRange.length;
                    break;
            }

            const promptEmail = prompt(`Dispatch "${title}" to email (leave blank to send to management gs.farms.ug@gmail.com):`);
            let recipients: string[] | undefined;
            if (promptEmail && promptEmail.includes('@')) {
                recipients = [promptEmail.trim()];
            }

            const res = await emailService.sendReportEmail({
                reportName: title,
                dateRange: rangeLabel,
                generatedBy: auth.currentUser?.email || 'Farm Administrator',
                summaryMetrics,
                recipientEmails: recipients
            });

            if (res.success) {
                setReportNotice(`✅ "${title}" dispatched via Brevo to ${res.recipients.join(', ')}!`);
            } else {
                setReportNotice(`❌ Failed to send report: ${res.error || 'Check Brevo status'}`);
            }
        } catch (err: any) {
            setReportNotice(`❌ Error sending report: ${err?.message || err}`);
        } finally {
            setIsEmailing(null);
            setTimeout(() => setReportNotice(null), 6000);
        }
    };

    const reportCards = [
        {
            id: 'workers',
            title: 'Workers Directory & Salary Schedule',
            description: 'Comprehensive roster of all farm workers, contact numbers, base monthly salaries in UGX, and overtime hourly rates.',
            icon: Users,
            color: '#2563eb',
            count: `${workersInRange.length} workers joined in range`
        },
        {
            id: 'attendance',
            title: 'Attendance Timesheet & Exceptions',
            description: 'Full scan records with clock-in/out stamps, scheduled vs actual hours, missing scans, and attendance status flags.',
            icon: Calendar,
            color: '#0d9488',
            count: `${attendanceInRange.length} attendance logs in range`
        },
        {
            id: 'overtime',
            title: 'Overtime Ledger & Approval Audit',
            description: 'Calculated overtime hours, shift rule evaluations, supervisor approval decisions, reasons, and estimated earnings.',
            icon: Clock,
            color: '#f59e0b',
            count: `${attendanceInRange.filter(a => (a.overtimeHours || 0) > 0).length} overtime records in range`
        },
        {
            id: 'payroll',
            title: 'Monthly Master Payroll Report',
            description: 'Official 5-column payroll table (S/M, Name, Monthly Salary, Overtime Earnings, Net Pay) with deductions in UGX.',
            icon: DollarSign,
            color: '#16a34a',
            count: `${payrollInRange.length} payroll entries in range`
        },
        {
            id: 'clones',
            title: 'Coffee Clone Production & Nursery Report',
            description: 'Complete 5-stage tracking (Cutting -> Humid Chamber -> 1st Hardening -> 2nd Hardening -> Sorting) for all clone varieties.',
            icon: Layers,
            color: '#8b5cf6',
            count: `${cloneBatchesInRange.length} batches started in range`
        },
        {
            id: 'inventory',
            title: 'Inventory Valuation & Movements',
            description: 'Complete stock breakdown for Fertilizers, Pesticides, Farm Tools, and Nursery Supplies with total UGX valuation.',
            icon: Package,
            color: '#0284c7',
            count: `${inventoryMovementsInRange.length} movements in range · UGX ${calculateInventoryValuation(inventory).toLocaleString()} current valuation`
        },
        {
            id: 'sales',
            title: 'Plantlet Cash Sales Report',
            description: 'Customer sales ledger with clone varieties, quantities, unit pricing, and fully paid cash totals.',
            icon: TrendingUp,
            color: '#10b981',
            count: `${salesInRange.length} customer sales orders in range`
        },
        {
            id: 'audit',
            title: 'System Activity & Compliance Audit',
            description: 'Timestamped audit logs of all user actions, edits, status overrides, and operational adjustments across all modules.',
            icon: ShieldCheck,
            color: '#64748b',
            count: `${activityLogsInRange.length} activity audit entries in range`
        }
    ];

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Reports & Executive PDF Center</h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Generate and download production-grade, formatted PDF summaries with official farm headers and tables.
                    </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                    <label htmlFor="report-start-date" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-light)' }}>From:</label>
                    <input
                        id="report-start-date"
                        type="date"
                        className="form-input"
                        value={startDate}
                        max={endDate || undefined}
                        onChange={e => {
                            setStartDate(e.target.value);
                            setDateRangeError('');
                        }}
                        style={{ maxWidth: '170px' }}
                    />
                    <label htmlFor="report-end-date" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-light)' }}>To:</label>
                    <input
                        id="report-end-date"
                        type="date"
                        className="form-input"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={e => {
                            setEndDate(e.target.value);
                            setDateRangeError('');
                        }}
                        style={{ maxWidth: '170px' }}
                    />
                </div>
            </div>

            {dateRangeError && (
                <div role="alert" className="badge badge-danger" style={{ alignSelf: 'flex-start', padding: '0.5rem 0.75rem' }}>
                    {dateRangeError}
                </div>
            )}

            {reportNotice && (
                <div className="card" style={{ padding: '0.85rem 1.25rem', backgroundColor: reportNotice.startsWith('✅') ? '#f0fdf4' : '#fef2f2', borderLeft: `4px solid ${reportNotice.startsWith('✅') ? '#22c55e' : '#ef4444'}`, color: reportNotice.startsWith('✅') ? '#166534' : '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={18} />
                    <span>{reportNotice}</span>
                </div>
            )}

            {/* Reports Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {reportCards.map(card => {
                    const IconComponent = card.icon;
                    const loading = isExporting === card.id;
                    const emailing = isEmailing === card.id;

                    return (
                        <div key={card.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.5rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <div style={{
                                        width: '42px',
                                        height: '42px',
                                        borderRadius: '8px',
                                        background: `${card.color}15`,
                                        color: card.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <IconComponent size={22} />
                                    </div>
                                    <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                                        {card.count}
                                    </span>
                                </div>
                                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{card.title}</h3>
                                <p className="text-light" style={{ fontSize: '0.875rem', lineHeight: '1.4', margin: '0 0 1.25rem 0' }}>
                                    {card.description}
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                <button 
                                    className="btn btn-primary"
                                    style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                                    onClick={() => handleExport(card.id)}
                                    disabled={loading || emailing}
                                >
                                    {loading ? (
                                        <span>Generating...</span>
                                    ) : (
                                        <>
                                            <Download size={15} /> Download PDF
                                        </>
                                    )}
                                </button>
                                <button 
                                    className="btn btn-secondary"
                                    style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', backgroundColor: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}
                                    onClick={() => handleEmailReport(card.id, card.title)}
                                    disabled={loading || emailing}
                                    title={`Send official ${card.title} report via Brevo email`}
                                >
                                    <Mail size={15} /> {emailing ? 'Sending...' : 'Email'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Print Friendly Information Note */}
            <div className="card" style={{ background: 'var(--color-surface)', borderLeft: '4px solid var(--color-primary)', padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <FileText size={18} color="var(--color-primary)" />
                    <strong>Print-Ready Executive Reports:</strong>
                </div>
                <p className="text-light" style={{ margin: 0, fontSize: '0.875rem' }}>
                    All downloaded reports are compiled dynamically with vector graphics, auto-pagination, UGX currency formatting, and standard G&S FARM letterhead suitable for administrative filing, tax auditing, and bank reconciliation.
                </p>
            </div>
        </div>
    );
};

export default Reports;

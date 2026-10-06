import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
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
    ShieldCheck
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

const Reports: React.FC = () => {
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [isExporting, setIsExporting] = useState<string | null>(null);

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

    const handleExport = async (type: string) => {
        setIsExporting(type);
        try {
            switch (type) {
                case 'workers':
                    generateWorkersMasterPDF(workers);
                    break;
                case 'attendance':
                    generateAttendancePDF(attendance, `Monthly Attendance Report - ${selectedMonth}`);
                    break;
                case 'overtime':
                    generateOvertimePDF(attendance, `Overtime & Shift Evaluation - ${selectedMonth}`);
                    break;
                case 'payroll': {
                    const monthPayroll = payrollRecords.filter(p => p.payrollMonth === selectedMonth || p.payrollPeriod === selectedMonth);
                    generatePayrollMasterPDF(monthPayroll.length > 0 ? monthPayroll : payrollRecords, selectedMonth);
                    break;
                }
                case 'clones':
                    generateCloneProductionSummaryPDF(cloneBatches, humidChambers, sortings);
                    break;
                case 'inventory':
                    generateInventoryPDF(inventory, inventoryTransactions);
                    break;
                case 'sales': {
                    generateSalesMasterPDF(sales, `Sales Report - ${selectedMonth}`);
                    break;
                }
                case 'audit':
                    generateUniversalFarmAuditPDF(activityLogs, 'Farm Operations Audit Trail');
                    break;
            }
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            alert('Failed to generate PDF. Check browser console for details.');
        } finally {
            setIsExporting(null);
        }
    };

    const reportCards = [
        {
            id: 'workers',
            title: 'Workers Directory & Salary Schedule',
            description: 'Comprehensive roster of all farm workers, contact numbers, base monthly salaries in UGX, and overtime hourly rates.',
            icon: Users,
            color: '#2563eb',
            count: `${workers.length} registered workers`
        },
        {
            id: 'attendance',
            title: 'Attendance Timesheet & Exceptions',
            description: 'Full scan records with clock-in/out stamps, scheduled vs actual hours, missing scans, and attendance status flags.',
            icon: Calendar,
            color: '#0d9488',
            count: `${attendance.length} attendance logs`
        },
        {
            id: 'overtime',
            title: 'Overtime Ledger & Approval Audit',
            description: 'Calculated overtime hours, shift rule evaluations, supervisor approval decisions, reasons, and estimated earnings.',
            icon: Clock,
            color: '#f59e0b',
            count: `${attendance.filter(a => (a.overtimeHours || 0) > 0).length} overtime records`
        },
        {
            id: 'payroll',
            title: 'Monthly Master Payroll Report',
            description: 'Official 5-column payroll table (S/M, Name, Monthly Salary, Overtime Earnings, Net Pay) with deductions in UGX.',
            icon: DollarSign,
            color: '#16a34a',
            count: `${payrollRecords.length} payslip entries`
        },
        {
            id: 'clones',
            title: 'Coffee Clone Production & Nursery Report',
            description: 'Complete 5-stage tracking (Cutting -> Humid Chamber -> 1st Hardening -> 2nd Hardening -> Sorting) for KR1 & KR3-KR10.',
            icon: Layers,
            color: '#8b5cf6',
            count: `${cloneBatches.length} active clone batches`
        },
        {
            id: 'inventory',
            title: 'Inventory Valuation & Movements',
            description: 'Complete stock breakdown for Fertilizers, Pesticides, Farm Tools, and Nursery Supplies with total UGX valuation.',
            icon: Package,
            color: '#0284c7',
            count: `UGX ${calculateInventoryValuation(inventory).toLocaleString()} valuation`
        },
        {
            id: 'sales',
            title: 'Plantlet Cash Sales Report',
            description: 'Customer sales ledger with clone varieties, quantities, unit pricing, and fully paid cash totals.',
            icon: TrendingUp,
            color: '#10b981',
            count: `${sales.length} customer sales orders`
        },
        {
            id: 'audit',
            title: 'System Activity & Compliance Audit',
            description: 'Timestamped audit logs of all user actions, edits, status overrides, and operational adjustments across all modules.',
            icon: ShieldCheck,
            color: '#64748b',
            count: `${activityLogs.length} activity audit entries`
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-light)' }}>Reporting Month:</label>
                    <input 
                        type="month" 
                        className="form-input" 
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        style={{ maxWidth: '160px' }}
                    />
                </div>
            </div>

            {/* Reports Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {reportCards.map(card => {
                    const IconComponent = card.icon;
                    const loading = isExporting === card.id;

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

                            <button 
                                className="btn btn-primary"
                                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                onClick={() => handleExport(card.id)}
                                disabled={loading}
                            >
                                {loading ? (
                                    <span>Generating PDF...</span>
                                ) : (
                                    <>
                                        <Download size={16} /> Download {card.id.toUpperCase()} PDF
                                    </>
                                )}
                            </button>
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
                    All downloaded reports are compiled dynamically with vector graphics, auto-pagination, UGX currency formatting, and standard G&S Coffee Farm letterhead suitable for administrative filing, tax auditing, and bank reconciliation.
                </p>
            </div>
        </div>
    );
};

export default Reports;

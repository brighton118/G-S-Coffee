import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, PayrollRecord } from '../db';
import { 
    Banknote, 
    Search, 
    Download, 
    Clock, 
    Receipt, 
    CreditCard, 
    X, 
    Printer,
    History,
    ShieldCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { generatePayrollMasterPDF, generatePayslipPDF } from '../utils/pdfGenerator';
import { formatUGX } from '../utils/calculations';
import { syncPayrollMonth } from '../services/payrollSync';
import Overtime from './Overtime';

const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Other'];

const Payroll: React.FC = () => {
    const [activeSubTab, setActiveSubTab] = useState<'payments' | 'overtime' | 'breakdown'>('payments');
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [methodFilter, setMethodFilter] = useState<string>('All');
    const [searchTerm, setSearchTerm] = useState<string>('');

    // Modals
    const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
    const [selectedRecordForPayment, setSelectedRecordForPayment] = useState<PayrollRecord | null>(null);
    const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
    const [selectedRecordForHistory, setSelectedRecordForHistory] = useState<PayrollRecord | null>(null);
    const [showPayslipModal, setShowPayslipModal] = useState<boolean>(false);
    const [selectedRecordForPayslip, setSelectedRecordForPayslip] = useState<PayrollRecord | null>(null);
    const [showAdjustDeductionModal, setShowAdjustDeductionModal] = useState<boolean>(false);
    const [selectedRecordForDeduction, setSelectedRecordForDeduction] = useState<PayrollRecord | null>(null);

    // Form States
    const [paymentAmount, setPaymentAmount] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<string>('Mobile Money');
    const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [paymentReference, setPaymentReference] = useState<string>('');
    const [paymentNotes, setPaymentNotes] = useState<string>('');
    const [recordedBy, setRecordedBy] = useState<string>('Finance Officer');

    const [deductionAmount, setDeductionAmount] = useState<number>(0);
    const [deductionReason, setDeductionReason] = useState<string>('');

    // Queries
    const workers = useLiveQuery(() => db.workers.toArray()) || [];
    const attendanceRecords = useLiveQuery(() => db.attendance.toArray()) || [];
    const payrollRecords = useLiveQuery(() => db.payrollRecords.toArray()) || [];
    const payments = useLiveQuery(() => db.payrollPayments.toArray()) || [];

    // Auto-generate or synchronize monthly payroll records when month or workers change
    useEffect(() => {
        void syncPayrollMonth(selectedMonth).catch(error => {
            console.error(`Could not synchronize payroll for ${selectedMonth}.`, error);
        });
    }, [selectedMonth, workers.length, attendanceRecords.length]);

    // Current Month Payroll Records
    const currentMonthPayroll = payrollRecords.filter(p => p.payrollMonth === selectedMonth || p.payrollPeriod === selectedMonth);

    // Filter Records
    const filteredRecords = currentMonthPayroll.filter(record => {
        const matchesSearch = 
            record.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            record.workerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (record.farmCardNumber && record.farmCardNumber.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesStatus = statusFilter === 'All' || record.paymentStatus === statusFilter;
        const matchesMethod = methodFilter === 'All' || record.paymentMethod === methodFilter;

        return matchesSearch && matchesStatus && matchesMethod;
    });

    // KPI Aggregates
    const totalWorkers = currentMonthPayroll.length;
    const totalMonthlySalaries = currentMonthPayroll.reduce((sum, r) => sum + (r.monthlySalary || 0), 0);
    const totalApprovedOvertime = currentMonthPayroll.reduce((sum, r) => sum + (r.overtimeEarnings || 0), 0);
    const totalDeductions = currentMonthPayroll.reduce((sum, r) => sum + (r.deductions || 0), 0);
    const totalNetPayroll = currentMonthPayroll.reduce((sum, r) => sum + (r.netPay || 0), 0);
    const totalPaid = currentMonthPayroll.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
    const totalOutstanding = currentMonthPayroll.reduce((sum, r) => sum + (r.balance ?? (r.netPay - r.amountPaid)), 0);

    const paidCount = currentMonthPayroll.filter(r => r.paymentStatus === 'Paid').length;
    const partialCount = currentMonthPayroll.filter(r => r.paymentStatus === 'Partially Paid').length;
    const pendingCount = currentMonthPayroll.filter(r => r.paymentStatus === 'Pending').length;

    // Payment Methods Breakdown
    const monthPayments = payments.filter(p => p.payrollMonth === selectedMonth);
    const cashTotal = monthPayments.filter(p => p.paymentMethod === 'Cash').reduce((sum, p) => sum + p.amount, 0);
    const mmTotal = monthPayments.filter(p => p.paymentMethod === 'Mobile Money').reduce((sum, p) => sum + p.amount, 0);
    const bankTotal = monthPayments.filter(p => p.paymentMethod === 'Bank Transfer').reduce((sum, p) => sum + p.amount, 0);
    const otherTotal = monthPayments.filter(p => p.paymentMethod === 'Other').reduce((sum, p) => sum + p.amount, 0);

    // Open Record Payment Modal
    const handleOpenPayment = (record: PayrollRecord) => {
        setSelectedRecordForPayment(record);
        const currentBalance = record.balance ?? (record.netPay - (record.amountPaid || 0));
        setPaymentAmount(currentBalance > 0 ? currentBalance : 0);
        setPaymentMethod('Mobile Money');
        setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
        setPaymentReference('');
        setPaymentNotes('');
        setShowPaymentModal(true);
    };

    // Save Payment
    const handleSavePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRecordForPayment || !selectedRecordForPayment.id || paymentAmount <= 0) {
            alert('Please enter a valid payment amount greater than zero.');
            return;
        }

        const record = selectedRecordForPayment;
        const currentPaid = record.amountPaid || 0;
        const newPaid = currentPaid + Number(paymentAmount);
        const newBalance = Math.max(0, record.netPay - newPaid);

        let newStatus: 'Pending' | 'Partially Paid' | 'Paid' = 'Pending';
        if (newPaid >= record.netPay && record.netPay > 0) {
            newStatus = 'Paid';
        } else if (newPaid > 0) {
            newStatus = 'Partially Paid';
        }

        // 1. Add entry to payrollPayments
        await db.payrollPayments.add({
            payrollRecordId: record.id,
            workerId: record.workerId,
            workerName: record.workerName,
            payrollMonth: selectedMonth,
            amount: Number(paymentAmount),
            paymentMethod,
            paymentDate,
            paymentReference: paymentReference || undefined,
            recordedBy,
            notes: paymentNotes || undefined,
            createdAt: new Date().toISOString()
        });

        // 2. Update payrollRecord
        await db.payrollRecords.update(record.id, {
            amountPaid: newPaid,
            balance: newBalance,
            paymentStatus: newStatus,
            paymentDate,
            paymentMethod,
            paymentReference: paymentReference || record.paymentReference,
            paymentNotes: paymentNotes || record.paymentNotes,
            recordedBy,
            status: newStatus === 'Paid' ? 'Paid' : 'Approved'
        });

        // 3. Activity Audit Log
        await db.activityLogs.add({
            user: recordedBy,
            action: 'Payment Recorded',
            module: 'Payroll & Payments',
            recordIdentifier: `${record.workerId} (${selectedMonth})`,
            date: new Date().toISOString(),
            description: `Recorded payment of ${formatUGX(paymentAmount)} via ${paymentMethod} for ${record.workerName}. New Balance: ${formatUGX(newBalance)}`
        });

        setShowPaymentModal(false);
        setSelectedRecordForPayment(null);
    };

    // Open Adjustment/Deductions Modal
    const handleOpenDeduction = (record: PayrollRecord) => {
        setSelectedRecordForDeduction(record);
        setDeductionAmount(Math.max(0, (record.deductions || 0) - (record.attendanceDeduction || 0)));
        setDeductionReason(record.manualDeductionReason || (record.attendanceDeduction ? '' : record.deductionReason || ''));
        setShowAdjustDeductionModal(true);
    };

    // Save Deductions
    const handleSaveDeduction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRecordForDeduction || !selectedRecordForDeduction.id) return;

        const record = selectedRecordForDeduction;
        const manualDeduction = Math.max(0, Number(deductionAmount));
        const attendanceDeduction = record.attendanceDeduction || 0;
        const newDeduction = manualDeduction + attendanceDeduction;
        const missedDays = record.unrecordedWorkdays || 0;
        const attendanceReason = missedDays > 0
            ? `Attendance: ${missedDays} missed scheduled workday(s)`
            : '';
        const combinedReason = [deductionReason.trim(), attendanceReason].filter(Boolean).join('; ') || undefined;
        const netPay = Math.max(0, record.monthlySalary + (record.overtimeEarnings || 0) - newDeduction);
        const amountPaid = record.amountPaid || 0;
        const balance = Math.max(0, netPay - amountPaid);
        const paymentStatus = amountPaid >= netPay && netPay > 0 ? 'Paid' : amountPaid > 0 ? 'Partially Paid' : 'Pending';

        await db.payrollRecords.update(record.id, {
            deductions: newDeduction,
            deductionReason: combinedReason,
            manualDeductionReason: deductionReason.trim() || undefined,
            netPay,
            balance,
            paymentStatus
        });

        // Audit Log
        await db.activityLogs.add({
            user: 'Finance Officer',
            action: 'Deduction Adjusted',
            module: 'Payroll Management',
            recordIdentifier: `${record.workerId} (${selectedMonth})`,
            date: new Date().toISOString(),
            description: `Manual deductions set to ${formatUGX(manualDeduction)} for ${record.workerName}; automatic attendance deduction is ${formatUGX(attendanceDeduction)}; total deductions are ${formatUGX(newDeduction)}. Reason: ${deductionReason}`
        });

        setShowAdjustDeductionModal(false);
        setSelectedRecordForDeduction(null);
    };

    // View Payment History
    const handleOpenHistory = async (record: PayrollRecord) => {
        setSelectedRecordForHistory(record);
        setShowHistoryModal(true);
    };

    // View Payslip
    const handleOpenPayslip = (record: PayrollRecord) => {
        setSelectedRecordForPayslip(record);
        setShowPayslipModal(true);
    };

    const recordPaymentsList = selectedRecordForHistory
        ? payments.filter(p => p.payrollRecordId === selectedRecordForHistory.id || (p.workerId === selectedRecordForHistory.workerId && p.payrollMonth === selectedMonth))
        : [];

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Banknote size={28} color="var(--color-primary)" /> Payroll & Worker Payment Management
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Payroll updates with attendance. Missed Monday–Saturday workdays are deducted at monthly salary ÷ 30 after the configured time-out window.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-secondary" 
                        onClick={() => generatePayrollMasterPDF(currentMonthPayroll, selectedMonth)}
                    >
                        <Download size={16} /> Export Payroll PDF
                    </button>
                </div>
            </div>

            {/* Sub-tab Navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
                <button
                    className={`btn ${activeSubTab === 'payments' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setActiveSubTab('payments')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem' }}
                >
                    <Banknote size={16} /> Worker Payments & Salary
                </button>
                <button 
                    className={`btn ${activeSubTab === 'overtime' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setActiveSubTab('overtime')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem' }}
                >
                    <Clock size={16} /> Overtime Tracking & Approvals
                </button>
                <button 
                    className={`btn ${activeSubTab === 'breakdown' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setActiveSubTab('breakdown')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem' }}
                >
                    <CreditCard size={16} /> Payment Method Summary
                </button>
            </div>

            {activeSubTab === 'overtime' && (
                <Overtime embedded={true} />
            )}

            {activeSubTab !== 'overtime' && (
                <>
            {/* Top Payroll KPI Dashboard */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL PAYROLL</span>
                    </div>
                    <div className="stat-value" style={{ color: 'var(--color-primary)' }}>
                        {formatUGX(totalNetPayroll)}
                    </div>
                    <div className="stat-change text-light">Base: {formatUGX(totalMonthlySalaries)}</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL PAID</span>
                    </div>
                    <div className="stat-value" style={{ color: '#16a34a' }}>
                        {formatUGX(totalPaid)}
                    </div>
                    <div className="stat-change text-light">{paidCount} Paid • {partialCount} Partial</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL PENDING</span>
                    </div>
                    <div className="stat-value" style={{ color: totalOutstanding > 0 ? '#dc2626' : 'var(--color-text)' }}>
                        {formatUGX(totalOutstanding)}
                    </div>
                    <div className="stat-change text-light">{pendingCount} Unpaid workers</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL OVERTIME</span>
                    </div>
                    <div className="stat-value" style={{ color: '#ea580c' }}>
                        {formatUGX(totalApprovedOvertime)}
                    </div>
                    <div className="stat-change text-light">From approved timesheets</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL DEDUCTIONS</span>
                    </div>
                    <div className="stat-value">
                        {formatUGX(totalDeductions)}
                    </div>
                    <div className="stat-change text-light">Attendance, taxes & salary advances</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">WORKERS</span>
                    </div>
                    <div className="stat-value">
                        {totalWorkers}
                    </div>
                    <div className="stat-change text-light">Active workforce count</div>
                </div>
            </div>

            {/* Filter & Period Selector Bar */}
            <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-light)' }}>
                        Payroll Period:
                    </label>
                    <input 
                        type="month" 
                        className="form-input" 
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        style={{ minWidth: '150px' }}
                    />

                    <select 
                        className="form-input" 
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        style={{ minWidth: '140px' }}
                    >
                        <option value="All">All Statuses ({currentMonthPayroll.length})</option>
                        <option value="Pending">Pending ({pendingCount})</option>
                        <option value="Partially Paid">Partially Paid ({partialCount})</option>
                        <option value="Paid">Paid ({paidCount})</option>
                    </select>

                    <select 
                        className="form-input" 
                        value={methodFilter}
                        onChange={e => setMethodFilter(e.target.value)}
                        style={{ minWidth: '140px' }}
                    >
                        <option value="All">All Methods</option>
                        {PAYMENT_METHODS.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>

                <div style={{ minWidth: '260px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50)', color: 'var(--color-text-light)' }} />
                        <input 
                            type="text" 
                            className="form-input" 
                            style={{ paddingLeft: '2.25rem', width: '100%' }}
                            placeholder="Search by worker name, ID, card #..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Desktop Payroll Master Table */}
            <div className="card table-responsive desktop-only">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ width: '70px' }}>Number</th>
                            <th>Name</th>
                            <th>Monthly Salary</th>
                            <th>Overtime</th>
                            <th>Deductions</th>
                            <th>Net Pay</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRecords.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                    No payroll records found for {selectedMonth}.
                                </td>
                            </tr>
                        ) : (
                            filteredRecords.map((record, index) => {
                                const serial = record.serialNumber || (index + 1);

                                return (
                                    <tr key={record.id || index}>
                                        <td><strong>{serial}</strong></td>
                                        <td>
                                            <div><strong>{record.workerName}</strong></div>
                                            <div className="text-light" style={{ fontSize: '0.8rem' }}>
                                                {record.workerId} {record.farmCardNumber && `• ${record.farmCardNumber}`}
                                            </div>
                                        </td>
                                        <td>{formatUGX(record.monthlySalary)}</td>
                                        <td>
                                            <div style={{ color: (record.overtimeEarnings || 0) > 0 ? '#ea580c' : 'var(--color-text)' }}>
                                                <strong>{formatUGX(record.overtimeEarnings || 0)}</strong>
                                            </div>
                                            <div className="text-light" style={{ fontSize: '0.75rem' }}>
                                                {(record.approvedOvertimeHours || 0).toFixed(1)} approved hrs
                                            </div>
                                        </td>
                                        <td>
                                            <strong>{formatUGX(record.deductions || 0)}</strong>
                                            {(record.unrecordedWorkdays || 0) > 0 && (
                                                <div className="text-light" style={{ fontSize: '0.75rem' }}>
                                                    {record.unrecordedWorkdays} missed day(s): {formatUGX(record.attendanceDeduction || 0)}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <strong style={{ color: 'var(--color-primary)' }}>
                                                {formatUGX(record.netPay)}
                                            </strong>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                                <button 
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.3rem 0.55rem', fontSize: '0.8rem' }}
                                                    onClick={() => handleOpenDeduction(record)}
                                                    title="Adjust Deductions"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="btn btn-primary"
                                                    style={{ padding: '0.3rem 0.55rem', fontSize: '0.8rem' }}
                                                    onClick={() => handleOpenPayment(record)}
                                                    title="Record Worker Payment"
                                                >
                                                    <CreditCard size={14} /> Pay
                                                </button>
                                                <button 
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.3rem 0.55rem', fontSize: '0.8rem' }}
                                                    onClick={() => handleOpenHistory(record)}
                                                    title="View Payment History"
                                                >
                                                    <History size={14} />
                                                </button>
                                                <button 
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.3rem 0.55rem', fontSize: '0.8rem' }}
                                                    onClick={() => handleOpenPayslip(record)}
                                                    title="Generate & View Payslip"
                                                >
                                                    <Receipt size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Worker Cards Layout */}
            <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredRecords.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
                        No payroll records found for {selectedMonth}.
                    </div>
                ) : (
                    filteredRecords.map((record, index) => {
                        const serial = record.serialNumber || (index + 1);

                        return (
                            <div key={record.id || index} className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div>
                                    <div className="text-light" style={{ fontSize: '0.8rem' }}>Number: {serial}</div>
                                    <strong style={{ fontSize: '1.05rem' }}>{record.workerName}</strong>
                                    <div className="text-light" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                        {record.workerId} {record.farmCardNumber && `• ${record.farmCardNumber}`}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'var(--color-background)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                                    <div>
                                        <span className="text-light">Monthly Salary:</span>
                                        <div><strong>{formatUGX(record.monthlySalary)}</strong></div>
                                    </div>
                                    <div>
                                        <span className="text-light">Overtime (Approved):</span>
                                        <div style={{ color: '#ea580c' }}><strong>{formatUGX(record.overtimeEarnings || 0)}</strong></div>
                                    </div>
                                    <div>
                                        <span className="text-light">Net Pay:</span>
                                        <div style={{ color: 'var(--color-primary)' }}><strong>{formatUGX(record.netPay)}</strong></div>
                                    </div>
                                    <div>
                                        <span className="text-light">Deductions ({record.unrecordedWorkdays || 0} missed day(s)):</span>
                                        <div style={{ color: '#dc2626' }}><strong>{formatUGX(record.deductions || 0)}</strong></div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                                    <button 
                                        className="btn btn-secondary"
                                        style={{ flex: 1, minWidth: '90px', padding: '0.4rem', fontSize: '0.85rem' }}
                                        onClick={() => handleOpenDeduction(record)}
                                    >
                                        Edit Deduction
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        style={{ flex: 1, minWidth: '70px', padding: '0.4rem', fontSize: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem' }}
                                        onClick={() => handleOpenPayment(record)}
                                    >
                                        <CreditCard size={15} /> Record Payment
                                    </button>
                                    <button 
                                        className="btn btn-secondary"
                                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                                        onClick={() => handleOpenPayslip(record)}
                                        title="Payslip"
                                    >
                                        <Receipt size={15} /> Payslip
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Payment Summary & Method Totals */}
            <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                    <ShieldCheck size={20} color="var(--color-primary)" /> Disbursement Summary & Method Totals ({selectedMonth})
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div style={{ background: 'var(--color-background)', padding: '1rem', borderRadius: '6px' }}>
                        <div className="text-light" style={{ fontSize: '0.85rem' }}>Cash Disbursements</div>
                        <strong style={{ fontSize: '1.15rem' }}>{formatUGX(cashTotal)}</strong>
                    </div>
                    <div style={{ background: 'var(--color-background)', padding: '1rem', borderRadius: '6px' }}>
                        <div className="text-light" style={{ fontSize: '0.85rem' }}>Mobile Money (MTN / Airtel)</div>
                        <strong style={{ fontSize: '1.15rem', color: 'var(--color-primary)' }}>{formatUGX(mmTotal)}</strong>
                    </div>
                    <div style={{ background: 'var(--color-background)', padding: '1rem', borderRadius: '6px' }}>
                        <div className="text-light" style={{ fontSize: '0.85rem' }}>Bank Transfers</div>
                        <strong style={{ fontSize: '1.15rem' }}>{formatUGX(bankTotal)}</strong>
                    </div>
                    <div style={{ background: 'var(--color-background)', padding: '1rem', borderRadius: '6px' }}>
                        <div className="text-light" style={{ fontSize: '0.85rem' }}>Other Payment Channels</div>
                        <strong style={{ fontSize: '1.15rem' }}>{formatUGX(otherTotal)}</strong>
                    </div>
                </div>
            </div>
            </>
            )}

            {/* Record Payment Modal */}
            {showPaymentModal && selectedRecordForPayment && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '520px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>Record Worker Payment</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowPaymentModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSavePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'var(--color-background)', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                                <div><strong>{selectedRecordForPayment.workerName}</strong> ({selectedRecordForPayment.workerId})</div>
                                <div className="text-light">Payroll Month: {selectedMonth}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                                    <span>Net Pay: <strong>{formatUGX(selectedRecordForPayment.netPay)}</strong></span>
                                    <span>Already Paid: <strong style={{ color: '#16a34a' }}>{formatUGX(selectedRecordForPayment.amountPaid || 0)}</strong></span>
                                </div>
                                <div style={{ marginTop: '0.25rem', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                                    Outstanding Balance: {formatUGX(selectedRecordForPayment.balance ?? (selectedRecordForPayment.netPay - (selectedRecordForPayment.amountPaid || 0)))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Payment Amount (UGX) *</label>
                                <input 
                                    type="number" 
                                    required 
                                    min="1" 
                                    max={selectedRecordForPayment.netPay - (selectedRecordForPayment.amountPaid || 0)}
                                    className="form-input" 
                                    value={paymentAmount || ''}
                                    onChange={e => setPaymentAmount(Number(e.target.value))}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Payment Method *</label>
                                    <select 
                                        className="form-input" 
                                        value={paymentMethod}
                                        onChange={e => setPaymentMethod(e.target.value)}
                                    >
                                        {PAYMENT_METHODS.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Payment Date *</label>
                                    <input 
                                        type="date" 
                                        required 
                                        className="form-input" 
                                        value={paymentDate}
                                        onChange={e => setPaymentDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Reference / Transaction ID</label>
                                <input 
                                    type="text" 
                                    className="form-input" 
                                    placeholder="e.g. MM12345, Cheque #, Cash Voucher"
                                    value={paymentReference}
                                    onChange={e => setPaymentReference(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Recorded By *</label>
                                <input 
                                    type="text" 
                                    required 
                                    className="form-input" 
                                    value={recordedBy}
                                    onChange={e => setRecordedBy(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Payment Notes / Description</label>
                                <textarea 
                                    rows={2} 
                                    className="form-input" 
                                    placeholder="Optional payment notes..."
                                    value={paymentNotes}
                                    onChange={e => setPaymentNotes(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPaymentModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    Confirm Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment History Modal */}
            {showHistoryModal && selectedRecordForHistory && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '600px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>Payment History: {selectedRecordForHistory.workerName}</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowHistoryModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ background: 'var(--color-background)', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                            <div>Worker ID: <strong>{selectedRecordForHistory.workerId}</strong> • Period: <strong>{selectedMonth}</strong></div>
                            <div>Net Pay: <strong>{formatUGX(selectedRecordForHistory.netPay)}</strong> | Total Paid: <strong style={{ color: '#16a34a' }}>{formatUGX(selectedRecordForHistory.amountPaid || 0)}</strong> | Balance: <strong style={{ color: '#dc2626' }}>{formatUGX(selectedRecordForHistory.balance || 0)}</strong></div>
                        </div>

                        <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Amount</th>
                                        <th>Method</th>
                                        <th>Reference</th>
                                        <th>Recorded By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recordPaymentsList.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
                                                No payments recorded yet for this payroll period.
                                            </td>
                                        </tr>
                                    ) : (
                                        recordPaymentsList.map((p, idx) => (
                                            <tr key={p.id || idx}>
                                                <td>{p.paymentDate}</td>
                                                <td><strong style={{ color: '#16a34a' }}>{formatUGX(p.amount)}</strong></td>
                                                <td><span className="badge badge-secondary">{p.paymentMethod}</span></td>
                                                <td>{p.paymentReference || '-'}</td>
                                                <td>{p.recordedBy}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                            <button className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Adjust Deductions Modal */}
            {showAdjustDeductionModal && selectedRecordForDeduction && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '450px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>Adjust Deductions</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowAdjustDeductionModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveDeduction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'var(--color-background)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                                <div><strong>{selectedRecordForDeduction.workerName}</strong></div>
                                <div>Base Salary: {formatUGX(selectedRecordForDeduction.monthlySalary)} + OT: {formatUGX(selectedRecordForDeduction.overtimeEarnings || 0)}</div>
                                <div>Automatic attendance deduction: {formatUGX(selectedRecordForDeduction.attendanceDeduction || 0)} ({selectedRecordForDeduction.unrecordedWorkdays || 0} missed workdays)</div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Other / Manual Deduction Amount (UGX) *</label>
                                <input 
                                    type="number" 
                                    required 
                                    min="0"
                                    className="form-input" 
                                    value={deductionAmount}
                                    onChange={e => setDeductionAmount(Number(e.target.value))}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Deduction Reason / Notes</label>
                                <input 
                                    type="text" 
                                    className="form-input" 
                                    placeholder="e.g. Salary Advance, Tax deduction, Damage penalty"
                                    value={deductionReason}
                                    onChange={e => setDeductionReason(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAdjustDeductionModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    Save Deductions
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payslip Modal View */}
            {showPayslipModal && selectedRecordForPayslip && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '560px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>Worker Payslip</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowPayslipModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Payslip Document Preview */}
                        <div style={{ border: '2px solid var(--color-primary)', borderRadius: '6px', padding: '1.5rem', background: '#ffffff', color: '#1e293b' }}>
                            <div style={{ textAlign: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--color-primary)', fontSize: '1.3rem' }}>G&S COFFEE FARM</h3>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>OFFICIAL EMPLOYEE MONTHLY PAYSLIP</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.25rem' }}>Period: {selectedRecordForPayslip.payrollMonth || selectedMonth}</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem', marginBottom: '1rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '4px' }}>
                                <div><strong>Worker Name:</strong> {selectedRecordForPayslip.workerName}</div>
                                <div><strong>Worker ID:</strong> {selectedRecordForPayslip.workerId}</div>
                                <div><strong>Farm Card #:</strong> {selectedRecordForPayslip.farmCardNumber || selectedRecordForPayslip.workerId}</div>
                                <div><strong>S/M #:</strong> {selectedRecordForPayslip.serialNumber}</div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                        <th style={{ textAlign: 'left', padding: '0.4rem' }}>Earnings Breakdown</th>
                                        <th style={{ textAlign: 'right', padding: '0.4rem' }}>Amount (UGX)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.4rem' }}>Monthly Base Salary</td>
                                        <td style={{ textAlign: 'right', padding: '0.4rem' }}>{formatUGX(selectedRecordForPayslip.monthlySalary)}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.4rem' }}>
                                            Approved Overtime ({(selectedRecordForPayslip.approvedOvertimeHours || 0).toFixed(1)} hrs @ {formatUGX(selectedRecordForPayslip.overtimeRate || 3500)}/hr)
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '0.4rem', color: '#ea580c' }}>{formatUGX(selectedRecordForPayslip.overtimeEarnings || 0)}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.4rem' }}>Attendance Absence ({selectedRecordForPayslip.unrecordedWorkdays || 0} missed day(s))</td>
                                        <td style={{ textAlign: 'right', padding: '0.4rem', color: '#dc2626' }}>- {formatUGX(selectedRecordForPayslip.attendanceDeduction || 0)}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.4rem' }}>Other Deductions</td>
                                        <td style={{ textAlign: 'right', padding: '0.4rem', color: '#dc2626' }}>- {formatUGX(Math.max(0, (selectedRecordForPayslip.deductions || 0) - (selectedRecordForPayslip.attendanceDeduction || 0)))}</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>
                                        <td style={{ padding: '0.4rem' }}>Total Deductions</td>
                                        <td style={{ textAlign: 'right', padding: '0.4rem', color: '#dc2626' }}>- {formatUGX(selectedRecordForPayslip.deductions || 0)}</td>
                                    </tr>
                                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                                        <td style={{ padding: '0.5rem' }}>TOTAL NET PAY</td>
                                        <td style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--color-primary)' }}>{formatUGX(selectedRecordForPayslip.netPay)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '4px' }}>
                                <div><strong>Amount Paid:</strong> <span style={{ color: '#16a34a' }}>{formatUGX(selectedRecordForPayslip.amountPaid || 0)}</span></div>
                                <div><strong>Outstanding Balance:</strong> <span style={{ color: (selectedRecordForPayslip.balance || 0) > 0 ? '#dc2626' : '#64748b' }}>{formatUGX(selectedRecordForPayslip.balance || 0)}</span></div>
                                <div><strong>Payment Status:</strong> {selectedRecordForPayslip.paymentStatus}</div>
                                <div><strong>Payment Method:</strong> {selectedRecordForPayslip.paymentMethod || 'N/A'}</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                            <button 
                                className="btn btn-secondary" 
                                style={{ flex: 1 }}
                                onClick={() => generatePayslipPDF(selectedRecordForPayslip)}
                            >
                                <Download size={16} /> Download PDF Payslip
                            </button>
                            <button 
                                className="btn btn-primary" 
                                style={{ flex: 1 }}
                                onClick={() => window.print()}
                            >
                                <Printer size={16} /> Print Payslip
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Payroll;

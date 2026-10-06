import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, AttendanceRecord, OvertimeRuleConfig } from '../db';
import { 
    Clock, 
    CheckCircle2, 
    XCircle, 
    Download, 
    Settings as SettingsIcon, 
    AlertCircle, 
    UserCheck,
    Save
} from 'lucide-react';
import { format } from 'date-fns';
import { generateOvertimePDF } from '../utils/pdfGenerator';
import { DEFAULT_OVERTIME_RULES, formatUGX } from '../utils/calculations';

interface OvertimeProps {
    embedded?: boolean;
}

const Overtime: React.FC<OvertimeProps> = ({ embedded = false }) => {
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
    const [approvalModalRecord, setApprovalModalRecord] = useState<AttendanceRecord | null>(null);
    const [approvalAction, setApprovalAction] = useState<'Approve' | 'Reject'>('Approve');
    const [approvedHoursInput, setApprovedHoursInput] = useState<number>(0);
    const [approvalReason, setApprovalReason] = useState<string>('');
    const [supervisorName, setSupervisorName] = useState<string>('Farm Supervisor');

    // Queries
    const rulesConfig = useLiveQuery(async () => {
        const stored = await db.overtimeRules.filter(r => r.active !== false).first();
        return stored || DEFAULT_OVERTIME_RULES;
    }) || DEFAULT_OVERTIME_RULES;

    const workers = useLiveQuery(() => db.workers.toArray()) || [];
    const attendanceRecords = useLiveQuery(() => db.attendance.toArray()) || [];

    // Temporary config edit state
    const [configData, setConfigData] = useState<OvertimeRuleConfig>(DEFAULT_OVERTIME_RULES);

    // Filtered records for selected month with potential or approved overtime
    const overtimeRecords = attendanceRecords.filter(record => {
        const inMonth = record.date.startsWith(selectedMonth);
        const hasOvertime = (record.overtimeHours || 0) > 0 || record.overtimeStatus === 'Pending' || record.overtimeStatus === 'Approved' || record.overtimeStatus === 'Rejected';
        
        if (!inMonth || !hasOvertime) return false;

        const worker = workers.find(w => w.workerId === record.workerId);
        const workerName = record.workerName || worker?.fullName || '';
        const matchesSearch = workerName.toLowerCase().includes(searchTerm.toLowerCase()) || record.workerId.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All' || record.overtimeStatus === statusFilter;

        return matchesSearch && matchesStatus;
    });

    // Aggregates
    const pendingRecords = overtimeRecords.filter(r => r.overtimeStatus === 'Pending');
    const approvedRecords = overtimeRecords.filter(r => r.overtimeStatus === 'Approved');
    const rejectedRecords = overtimeRecords.filter(r => r.overtimeStatus === 'Rejected');

    const totalPotentialHours = overtimeRecords.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
    const totalApprovedHours = approvedRecords.reduce((sum, r) => sum + (r.overtimeApprovedHours || r.overtimeHours || 0), 0);
    
    const totalEstimatedEarnings = approvedRecords.reduce((sum, r) => {
        const worker = workers.find(w => w.workerId === r.workerId);
        const rate = worker?.overtimeRate || rulesConfig.hourlyRateUGX || 3500;
        const hours = r.overtimeApprovedHours || r.overtimeHours || 0;
        return sum + (hours * rate);
    }, 0);

    const handleOpenApproval = (record: AttendanceRecord, action: 'Approve' | 'Reject') => {
        setApprovalModalRecord(record);
        setApprovalAction(action);
        setApprovedHoursInput(record.overtimeHours || 0);
        setApprovalReason(action === 'Approve' ? 'Shift extension approved for nursery operations' : 'Unapproved late stay');
    };

    const handleSaveApproval = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!approvalModalRecord || !approvalModalRecord.id) return;

        const isApproved = approvalAction === 'Approve';
        const finalHours = isApproved ? Number(approvedHoursInput) : 0;
        const todayStr = format(new Date(), 'yyyy-MM-dd HH:mm');

        await db.attendance.update(approvalModalRecord.id, {
            overtimeStatus: isApproved ? 'Approved' : 'Rejected',
            overtimeApprovedHours: finalHours,
            overtimeApprovedBy: supervisorName,
            overtimeApprovalDate: todayStr,
            overtimeReason: approvalReason
        });

        // Audit Log
        await db.activityLogs.add({
            user: supervisorName,
            action: `Overtime ${approvalAction}`,
            module: 'Overtime Management',
            recordIdentifier: `${approvalModalRecord.workerId} (${approvalModalRecord.date})`,
            date: new Date().toISOString(),
            description: `${approvalAction} ${finalHours} overtime hours for ${approvalModalRecord.workerName || approvalModalRecord.workerId}. Reason: ${approvalReason}`
        });

        // Sync with existing payroll record if present for this worker & month
        const payrollRec = await db.payrollRecords
            .where({ payrollMonth: selectedMonth, workerId: approvalModalRecord.workerId })
            .first();

        if (payrollRec && payrollRec.id) {
            // Re-aggregate approved OT for this worker in this month
            const workerAttendance = await db.attendance
                .where({ workerId: approvalModalRecord.workerId })
                .filter(a => a.date.startsWith(selectedMonth) && a.overtimeStatus === 'Approved')
                .toArray();

            const sumApprovedOT = workerAttendance.reduce((sum, a) => {
                if (a.id === approvalModalRecord.id) {
                    return sum + finalHours;
                }
                return sum + (a.overtimeApprovedHours || a.overtimeHours || 0);
            }, 0);

            const worker = await db.workers.get(approvalModalRecord.workerId);
            const otRate = worker?.overtimeRate || payrollRec.overtimeRate || 3500;
            const otEarnings = Math.round(sumApprovedOT * otRate);
            const netPay = Math.round(payrollRec.monthlySalary + otEarnings - payrollRec.deductions);
            const balance = Math.max(0, netPay - (payrollRec.amountPaid || 0));
            const paymentStatus = (payrollRec.amountPaid || 0) >= netPay && netPay > 0 ? 'Paid' : (payrollRec.amountPaid || 0) > 0 ? 'Partially Paid' : 'Pending';

            await db.payrollRecords.update(payrollRec.id, {
                approvedOvertimeHours: sumApprovedOT,
                overtimeEarnings: otEarnings,
                netPay,
                balance,
                paymentStatus
            });
        }

        setApprovalModalRecord(null);
    };

    const handleSaveRulesConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        const existing = await db.overtimeRules.toCollection().first();
        if (existing?.id) {
            await db.overtimeRules.update(existing.id, { ...configData, active: true });
        } else {
            await db.overtimeRules.add({ ...configData, active: true });
        }
        setShowRulesModal(false);
        alert('Overtime & Shift rules updated successfully.');
    };

    return (
        <div className={embedded ? "" : "page-wrapper"} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            {!embedded && (
                <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            <Clock size={28} color="var(--color-primary)" /> Overtime Management & Approvals
                        </h1>
                        <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                            Evaluate clock-in/out timestamps, approve extra hours, and transfer verified overtime to Payroll.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button 
                            className="btn btn-secondary"
                            onClick={() => {
                                setConfigData({ ...rulesConfig });
                                setShowRulesModal(true);
                            }}
                        >
                            <SettingsIcon size={16} /> Multiplier & Threshold Rules
                        </button>
                        <button 
                            className="btn btn-secondary" 
                            onClick={() => generateOvertimePDF(overtimeRecords, `Overtime Report - ${selectedMonth}`)}
                        >
                            <Download size={16} /> Export Overtime PDF
                        </button>
                    </div>
                </div>
            )}

            {/* KPI Overview Cards */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Pending Approvals</span>
                        <AlertCircle className="stat-icon text-warning" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: pendingRecords.length > 0 ? '#ea580c' : 'var(--color-text)' }}>
                        {pendingRecords.length}
                    </div>
                    <div className="stat-change text-light">Requires supervisor decision</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Approved OT Hours</span>
                        <CheckCircle2 className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: '#16a34a' }}>
                        {totalApprovedHours.toFixed(1)} hrs
                    </div>
                    <div className="stat-change text-light">{approvedRecords.length} approved events</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Estimated OT Earnings</span>
                        <UserCheck className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--color-primary)' }}>
                        {formatUGX(totalEstimatedEarnings)}
                    </div>
                    <div className="stat-change text-light">Payable in {selectedMonth} Payroll</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Claimed OT Hours</span>
                        <Clock className="stat-icon text-muted" size={20} />
                    </div>
                    <div className="stat-value">
                        {totalPotentialHours.toFixed(1)} hrs
                    </div>
                    <div className="stat-change text-light">Total raw excess time logged</div>
                </div>
            </div>

            {/* Filter & Period Bar */}
            <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-light)' }}>
                        Payroll Month:
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
                        <option value="All">All Statuses ({overtimeRecords.length})</option>
                        <option value="Pending">Pending Review ({pendingRecords.length})</option>
                        <option value="Approved">Approved ({approvedRecords.length})</option>
                        <option value="Rejected">Rejected ({rejectedRecords.length})</option>
                    </select>
                </div>

                <div style={{ minWidth: '240px' }}>
                    <input 
                        type="text" 
                        className="form-input"
                        placeholder="Search worker name or ID..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Overtime Table */}
            <div className="card table-responsive">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Worker</th>
                            <th>Shift Stamps</th>
                            <th>Potential OT</th>
                            <th>Approved OT</th>
                            <th>Estimated Earnings</th>
                            <th>Status</th>
                            <th>Supervisor / Decision Note</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {overtimeRecords.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                    No overtime records found for {selectedMonth}. Worker scans exceeding shift end will appear here automatically.
                                </td>
                            </tr>
                        ) : (
                            overtimeRecords.map(record => {
                                const worker = workers.find(w => w.workerId === record.workerId);
                                const otRate = worker?.overtimeRate || rulesConfig.hourlyRateUGX || 3500;
                                const approvedHours = record.overtimeApprovedHours || (record.overtimeStatus === 'Approved' ? record.overtimeHours : 0) || 0;
                                const earnings = Math.round(approvedHours * otRate);

                                return (
                                    <tr key={record.id}>
                                        <td><strong>{record.date}</strong></td>
                                        <td>
                                            <div><strong>{record.workerName || worker?.fullName || record.workerId}</strong></div>
                                            <div className="text-light" style={{ fontSize: '0.8rem' }}>{record.workerId} • Rate: {formatUGX(otRate)}/hr</div>
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.85rem' }}>
                                                In: <strong>{record.timeIn || '--:--'}</strong> • Out: <strong>{record.timeOut || '--:--'}</strong>
                                            </div>
                                            <div className="text-light" style={{ fontSize: '0.75rem' }}>
                                                Actual: {record.actualHours || 0} hrs (Shift: {rulesConfig.shiftStartTime || '08:00'} - {rulesConfig.shiftEndTime || '17:00'})
                                            </div>
                                        </td>
                                        <td>
                                            <strong>{(record.overtimeHours || 0).toFixed(1)} hrs</strong>
                                        </td>
                                        <td>
                                            <strong style={{ color: record.overtimeStatus === 'Approved' ? '#16a34a' : 'var(--color-text)' }}>
                                                {approvedHours.toFixed(1)} hrs
                                            </strong>
                                        </td>
                                        <td>
                                            <strong style={{ color: 'var(--color-primary)' }}>
                                                {formatUGX(earnings)}
                                            </strong>
                                        </td>
                                        <td>
                                            <span 
                                                className={`badge ${
                                                    record.overtimeStatus === 'Approved' 
                                                        ? 'badge-success' 
                                                        : record.overtimeStatus === 'Rejected' 
                                                        ? 'badge-danger' 
                                                        : 'badge-warning'
                                                }`}
                                            >
                                                {record.overtimeStatus || 'Pending'}
                                            </span>
                                        </td>
                                        <td>
                                            {record.overtimeApprovedBy ? (
                                                <div style={{ fontSize: '0.85rem' }}>
                                                    <div><strong>{record.overtimeApprovedBy}</strong></div>
                                                    <div className="text-light" style={{ fontSize: '0.75rem' }}>{record.overtimeReason || 'No notes provided'}</div>
                                                </div>
                                            ) : (
                                                <span className="text-light" style={{ fontSize: '0.8rem' }}>Pending evaluation</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                                <button 
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: '#16a34a', borderColor: '#bbf7d0' }}
                                                    onClick={() => handleOpenApproval(record, 'Approve')}
                                                    title="Approve Overtime Hours"
                                                >
                                                    <CheckCircle2 size={14} /> Approve
                                                </button>
                                                <button 
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: '#dc2626', borderColor: '#fecaca' }}
                                                    onClick={() => handleOpenApproval(record, 'Reject')}
                                                    title="Reject Overtime Claim"
                                                >
                                                    <XCircle size={14} /> Reject
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

            {/* Approval Decision Modal */}
            {approvalModalRecord && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '500px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>
                                {approvalAction === 'Approve' ? 'Approve Overtime Hours' : 'Reject Overtime Claim'}
                            </h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setApprovalModalRecord(null)}>
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSaveApproval} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'var(--color-background)', padding: '0.75rem 1rem', borderRadius: '6px' }}>
                                <div><strong>{approvalModalRecord.workerName || approvalModalRecord.workerId}</strong></div>
                                <div className="text-light" style={{ fontSize: '0.85rem' }}>
                                    Date: {approvalModalRecord.date} • Recorded In: {approvalModalRecord.timeIn} | Out: {approvalModalRecord.timeOut}
                                </div>
                                <div className="text-light" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                    Logged Excess Time: <strong>{(approvalModalRecord.overtimeHours || 0).toFixed(1)} hours</strong>
                                </div>
                            </div>

                            {approvalAction === 'Approve' && (
                                <div className="form-group">
                                    <label className="form-label">Approved Overtime Hours to Pay *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        min="0.1" 
                                        step="0.25" 
                                        className="form-input"
                                        value={approvedHoursInput}
                                        onChange={e => setApprovedHoursInput(Number(e.target.value))}
                                    />
                                    <small className="text-light">Adjust if work was paused or agreed differently.</small>
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Supervisor Name *</label>
                                <input 
                                    type="text" 
                                    required 
                                    className="form-input"
                                    value={supervisorName}
                                    onChange={e => setSupervisorName(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Reason / Justification Notes *</label>
                                <textarea 
                                    rows={3} 
                                    required 
                                    className="form-input"
                                    placeholder="e.g., Extended watering, urgent clone bag transfer..."
                                    value={approvalReason}
                                    onChange={e => setApprovalReason(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setApprovalModalRecord(null)}>
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className={`btn ${approvalAction === 'Approve' ? 'btn-primary' : 'btn-danger'}`} 
                                    style={{ flex: 1 }}
                                >
                                    Confirm {approvalAction}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Shift Rules Configuration Modal */}
            {showRulesModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '600px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>Configure Shift & Overtime Rules</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowRulesModal(false)}>
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSaveRulesConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Normal Shift Start Time</label>
                                    <input 
                                        type="time" 
                                        required 
                                        className="form-input"
                                        value={configData.shiftStartTime || configData.normalStartTime || '08:00'}
                                        onChange={e => setConfigData({ ...configData, shiftStartTime: e.target.value, normalStartTime: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Normal Shift End Time</label>
                                    <input 
                                        type="time" 
                                        required 
                                        className="form-input"
                                        value={configData.shiftEndTime || configData.normalEndTime || '17:00'}
                                        onChange={e => setConfigData({ ...configData, shiftEndTime: e.target.value, normalEndTime: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Break Deduction (Minutes)</label>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        className="form-input"
                                        value={configData.breakDeductionMinutes || 60}
                                        onChange={e => setConfigData({ ...configData, breakDeductionMinutes: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Grace Period (Minutes)</label>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        className="form-input"
                                        value={configData.gracePeriodMinutes || 15}
                                        onChange={e => setConfigData({ ...configData, gracePeriodMinutes: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">OT Threshold (Mins after Shift)</label>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        className="form-input"
                                        value={configData.overtimeThresholdMinutes || 30}
                                        onChange={e => setConfigData({ ...configData, overtimeThresholdMinutes: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Rounding Increment</label>
                                    <select 
                                        className="form-input"
                                        value={configData.roundingRule || 'Round Down 15m'}
                                        onChange={e => setConfigData({ ...configData, roundingRule: e.target.value })}
                                    >
                                        <option value="Round Down 15m">15-minute intervals</option>
                                        <option value="Round 30m">30-minute intervals</option>
                                        <option value="Exact">Exact minutes</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRulesModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    <Save size={16} /> Save Configuration
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Overtime;

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Link } from 'react-router-dom';
import { 
    Calendar, 
    Search, 
    Download, 
    ScanLine, 
    Clock, 
    CheckCircle2, 
    AlertTriangle, 
    UserCheck,
    ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { generateAttendancePDF } from '../utils/pdfGenerator';
import { loadAttendanceScheduleSettings } from '../utils/attendanceSchedule';

const Attendance: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Late'>('All');

    const workers = useLiveQuery(() => db.workers.toArray()) || [];
    const attendanceRecords = useLiveQuery(() => db.attendance.toArray()) || [];
    const attendanceSchedule = loadAttendanceScheduleSettings();

    // Filter attendance records by selected date, search term, and status
    const dayRecords = attendanceRecords.filter(record => {
        const matchesDate = !selectedDate || record.date === selectedDate;
        const worker = workers.find(w => w.workerId === record.workerId);
        const workerName = record.workerName || worker?.fullName || '';
        const matchesSearch = 
            workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            record.workerId.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All' || record.status === statusFilter;

        return matchesDate && matchesSearch && matchesStatus;
    });

    const activeWorkers = workers.filter(w => w.status === 'Active');
    const presentToday = dayRecords.filter(r => r.status === 'Present' || r.status === 'Late').length;
    const lateToday = dayRecords.filter(r => r.status === 'Late' || r.isLate).length;
    const otEligibleCount = dayRecords.filter(r => (r.overtimeHours || 0) > 0 || r.overtimeStatus === 'Pending' || r.overtimeStatus === 'Approved').length;

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Worker Attendance Management</h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Track daily clock-in/out timestamps, tardiness flags, and shifts recorded via QR scan.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Link to="/scan" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <ScanLine size={18} /> Launch QR Scanner
                    </Link>
                    <Link to="/overtime" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={16} /> Overtime Approvals
                    </Link>
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => generateAttendancePDF(dayRecords.length > 0 ? dayRecords : attendanceRecords, `Attendance Timesheet - ${selectedDate}`)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Download size={16} /> Export PDF
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">PRESENT WORKERS</span>
                        <CheckCircle2 className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: '#16a34a' }}>
                        {presentToday}
                    </div>
                    <div className="stat-change text-light">Of {activeWorkers.length} active workers</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">LATE ARRIVALS</span>
                        <AlertTriangle className="stat-icon text-warning" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: lateToday > 0 ? '#ea580c' : 'var(--color-text)' }}>
                        {lateToday}
                    </div>
                    <div className="stat-change text-light">Clocked in after {attendanceSchedule.attendanceTimeInEnd}</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">POTENTIAL OVERTIME</span>
                        <Clock className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--color-primary)' }}>
                        {otEligibleCount}
                    </div>
                    <div className="stat-change text-light">Clocked out after {attendanceSchedule.attendanceTimeOutEnd}</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL ACTIVE ROSTER</span>
                        <UserCheck className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value">
                        {activeWorkers.length}
                    </div>
                    <div className="stat-change text-light">Registered farm workers</div>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
                        <input 
                            type="text" 
                            className="form-input" 
                            style={{ paddingLeft: '2.25rem', width: '100%' }}
                            placeholder="Search by worker name or ID..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={18} className="text-light" />
                        <input 
                            type="date" 
                            className="form-input" 
                            value={selectedDate} 
                            onChange={e => setSelectedDate(e.target.value)}
                        />
                    </div>
                    <select 
                        className="form-input" 
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value as any)}
                        style={{ minWidth: '130px' }}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Present">Present</option>
                        <option value="Late">Late</option>
                    </select>
                </div>
            </div>

            {/* Attendance Table */}
            <div className="card table-responsive">
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Date</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Worker ID</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Worker Name</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Time In</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Time Out</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Status</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Overtime Hours</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem', textAlign: 'center' }}>OT Approval</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dayRecords.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                    No attendance records found for {selectedDate || 'the selected filter'}. Scan worker QR codes to record check-in.
                                </td>
                            </tr>
                        ) : (
                            dayRecords.slice().reverse().map(record => {
                                const worker = workers.find(w => w.workerId === record.workerId);
                                const name = record.workerName || worker?.fullName || record.workerId;
                                const otHours = record.overtimeHours || 0;

                                return (
                                    <tr key={record.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            {record.date}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            <strong>{record.workerId}</strong>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ fontWeight: 600 }}>{name}</div>
                                            {worker?.farmCardNumber && (
                                                <div className="text-light" style={{ fontSize: '0.75rem' }}>{worker.farmCardNumber}</div>
                                            )}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            <span style={{ color: record.isLate ? '#ea580c' : 'var(--color-text)', fontWeight: 600 }}>
                                                {record.timeIn || '--:--'}
                                            </span>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            {record.timeOut || (
                                                <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>Working</span>
                                            )}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            <span className={`badge ${record.status === 'Present' ? 'badge-success' : 'badge-warning'}`}>
                                                {record.status}
                                            </span>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            {otHours > 0 ? (
                                                <strong style={{ color: 'var(--color-primary)' }}>{otHours.toFixed(1)} hrs</strong>
                                            ) : (
                                                <span className="text-light">-</span>
                                            )}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            {otHours > 0 ? (
                                                <Link 
                                                    to="/overtime" 
                                                    className="btn btn-secondary" 
                                                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                                >
                                                    {record.overtimeStatus || 'Pending'} <ArrowRight size={12} />
                                                </Link>
                                            ) : (
                                                <span className="text-light">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Attendance;

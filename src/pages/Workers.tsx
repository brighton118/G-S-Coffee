import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Worker } from '../db';
import {
    Users,
    Plus,
    Search,
    X,
    Printer,
    FileDown,
    CheckCircle2,
    Edit3
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { generateWorkersMasterPDF, generateWorkerIdCardPDF } from '../utils/pdfGenerator';

const Workers: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedWorkerForCard, setSelectedWorkerForCard] = useState<Worker | null>(null);
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

    // Simplified Registration Form State (Department, Position, Emergency Contact REMOVED as per Module 2 requirements)
    const [formData, setFormData] = useState({
        fullName: '',
        gender: 'Male' as 'Male' | 'Female',
        phoneNumber: '',
        monthlySalary: 500000,
        overtimeRate: 3500,
        status: 'Active' as 'Active' | 'Inactive'
    });

    const workers = useLiveQuery(() => db.workers.toArray()) || [];

    const filteredWorkers = workers.filter(w => {
        const matchesSearch =
            w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.workerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.farmCardNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.phoneNumber.includes(searchTerm);

        const matchesStatus = statusFilter === 'All' || w.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleAddOrEditWorker = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.fullName.trim()) {
            alert('Please enter worker full name.');
            return;
        }

        if (editingWorker) {
            // Update existing worker
            await db.workers.update(editingWorker.workerId, {
                fullName: formData.fullName.trim(),
                gender: formData.gender,
                phoneNumber: formData.phoneNumber.trim() || '+256 700 000000',
                monthlySalary: Number(formData.monthlySalary) || 0,
                overtimeRate: Number(formData.overtimeRate) || 0,
                status: formData.status
            });
            setEditingWorker(null);
        } else {
            // Add new worker
            const count = await db.workers.count();
            const newId = `GSF-W-${(count + 1).toString().padStart(4, '0')}`;
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const farmCardNum = `FC-${(1000 + count + 1)}`;

            const newWorker: Worker = {
                workerId: newId,
                fullName: formData.fullName.trim(),
                gender: formData.gender,
                phoneNumber: formData.phoneNumber.trim() || '+256 700 000000',
                dateJoined: todayStr,
                status: formData.status,
                farmCardNumber: farmCardNum,
                qrCode: newId,
                monthlySalary: Number(formData.monthlySalary) || 0,
                overtimeRate: Number(formData.overtimeRate) || 0
            };

            await db.workers.add(newWorker);
            setSelectedWorkerForCard(newWorker);
        }

        setShowAddModal(false);
        setFormData({
            fullName: '',
            gender: 'Male',
            phoneNumber: '',
            monthlySalary: 500000,
            overtimeRate: 3500,
            status: 'Active'
        });
    };

    const handleOpenEdit = (worker: Worker) => {
        setEditingWorker(worker);
        setFormData({
            fullName: worker.fullName,
            gender: worker.gender,
            phoneNumber: worker.phoneNumber,
            monthlySalary: worker.monthlySalary || 0,
            overtimeRate: worker.overtimeRate || 0,
            status: worker.status
        });
        setShowAddModal(true);
    };

    const handleToggleStatus = async (worker: Worker) => {
        const nextStatus = worker.status === 'Active' ? 'Inactive' : 'Active';
        if (window.confirm(`Change status for ${worker.fullName} (${worker.workerId}) to ${nextStatus}?`)) {
            await db.workers.update(worker.workerId, { status: nextStatus });
        }
    };

    const activeCount = workers.filter(w => w.status === 'Active').length;
    const totalPayrollLiability = workers.filter(w => w.status === 'Active').reduce((acc, curr) => acc + (curr.monthlySalary || 0), 0);

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Users size={28} color="var(--color-primary)" /> Worker Registry & Identification
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Manage certified farm workforce records, base salaries, overtime rates, and farm cards.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => generateWorkersMasterPDF(filteredWorkers, statusFilter)}
                    >
                        <FileDown size={18} /> Download Workforce PDF
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setEditingWorker(null);
                            setFormData({
                                fullName: '',
                                gender: 'Male',
                                phoneNumber: '',
                                monthlySalary: 500000,
                                overtimeRate: 3500,
                                status: 'Active'
                            });
                            setShowAddModal(true);
                        }}
                    >
                        <Plus size={18} /> Register Worker
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="card stat-card" style={{ borderLeft: '4px solid #16a34a' }}>
                    <span className="stat-label">Active Registered Workers</span>
                    <span className="stat-value text-success" style={{ fontSize: '1.6rem' }}>
                        {activeCount} <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#64748b' }}>/ {workers.length} Total</span>
                    </span>
                    <span className="text-light" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        Eligible for attendance and payroll
                    </span>
                </div>

                <div className="card stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
                    <span className="stat-label">Monthly Salary Base Liability</span>
                    <span className="stat-value text-primary" style={{ fontSize: '1.6rem' }}>
                        UGX {totalPayrollLiability.toLocaleString()}
                    </span>
                    <span className="text-light" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        Sum of active monthly salaries
                    </span>
                </div>

                <div className="card stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                    <span className="stat-label">Average Base Salary</span>
                    <span className="stat-value" style={{ fontSize: '1.6rem', color: '#8b5cf6' }}>
                        UGX {activeCount > 0 ? Math.round(totalPayrollLiability / activeCount).toLocaleString() : '0'}
                    </span>
                    <span className="text-light" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        Per active worker / month
                    </span>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 250px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                    <input
                        type="text"
                        placeholder="Search worker by name, ID (GSF-W-...), phone, or card #..."
                        className="form-input"
                        style={{ paddingLeft: '2.25rem' }}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#475569' }}>Status:</label>
                    <select
                        className="form-input"
                        style={{ width: 'auto' }}
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                    >
                        <option value="All">All Workers</option>
                        <option value="Active">Active Only</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>
            </div>

            {/* Workers Table */}
            <div className="table-responsive card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Worker ID</th>
                            <th>Full Name</th>
                            <th>Gender</th>
                            <th>Phone Number</th>
                            <th>Date Joined</th>
                            <th>Farm Card #</th>
                            <th>Monthly Salary (UGX)</th>
                            <th>OT Rate / Hr (UGX)</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredWorkers.length === 0 ? (
                            <tr>
                                <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                    No registered workers found.
                                </td>
                            </tr>
                        ) : (
                            filteredWorkers.map(w => (
                                <tr key={w.workerId}>
                                    <td>
                                        <strong style={{ color: 'var(--color-primary-dark)' }}>{w.workerId}</strong>
                                    </td>
                                    <td>
                                        <strong>{w.fullName}</strong>
                                    </td>
                                    <td>{w.gender}</td>
                                    <td>{w.phoneNumber}</td>
                                    <td>{w.dateJoined}</td>
                                    <td>
                                        <span style={{ padding: '0.15rem 0.4rem', backgroundColor: '#f1f5f9', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                                            {w.farmCardNumber}
                                        </span>
                                    </td>
                                    <td>
                                        <strong style={{ color: '#16a34a' }}>
                                            UGX {w.monthlySalary ? w.monthlySalary.toLocaleString() : '0'}
                                        </strong>
                                    </td>
                                    <td>
                                        UGX {w.overtimeRate ? w.overtimeRate.toLocaleString() : '0'} / hr
                                    </td>
                                    <td>
                                        <span
                                            onClick={() => handleToggleStatus(w)}
                                            style={{
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                backgroundColor: w.status === 'Active' ? '#dcfce7' : '#fee2e2',
                                                color: w.status === 'Active' ? '#15803d' : '#b91c1c'
                                            }}
                                            title="Click to toggle status"
                                        >
                                            {w.status === 'Active' ? <CheckCircle2 size={12} /> : null}
                                            {w.status}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                onClick={() => handleOpenEdit(w)}
                                                title="Edit Worker"
                                            >
                                                <Edit3 size={14} /> Edit
                                            </button>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                onClick={() => setSelectedWorkerForCard(w)}
                                                title="View & Print Farm Card"
                                            >
                                                <Printer size={14} /> Card
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal: Register / Edit Worker */}
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '520px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Users size={22} color="var(--color-primary)" />
                                {editingWorker ? 'Edit Worker Record' : 'Register New Worker'}
                            </h2>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem', border: 'none' }}
                                onClick={() => setShowAddModal(false)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddOrEditWorker} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">Full Name *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    required
                                    placeholder="e.g. John Kato"
                                    value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Gender *</label>
                                    <select
                                        className="form-input"
                                        value={formData.gender}
                                        onChange={e => setFormData({ ...formData, gender: e.target.value as 'Male' | 'Female' })}
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone Number *</label>
                                    <input
                                        type="tel"
                                        className="form-input"
                                        required
                                        placeholder="+256 700 000000"
                                        value={formData.phoneNumber}
                                        onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Monthly Salary (UGX) *</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        min="0"
                                        step="10000"
                                        required
                                        placeholder="500000"
                                        value={formData.monthlySalary}
                                        onChange={e => setFormData({ ...formData, monthlySalary: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Overtime Rate / Hr (UGX) *</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        min="0"
                                        step="500"
                                        required
                                        placeholder="3500"
                                        value={formData.overtimeRate}
                                        onChange={e => setFormData({ ...formData, overtimeRate: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Employment Status</label>
                                <select
                                    className="form-input"
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value as 'Active' | 'Inactive' })}
                                >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>

                            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowAddModal(false)}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingWorker ? 'Update Worker' : 'Save Worker'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Farm Card Preview & Print */}
            {selectedWorkerForCard && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '420px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Farm Identification Card</h2>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem', border: 'none' }}
                                onClick={() => setSelectedWorkerForCard(null)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Visual Card Component */}
                        <div
                            style={{
                                border: '2px solid var(--color-primary-dark)',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                backgroundColor: 'white',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                            }}
                        >
                            <div style={{ backgroundColor: 'var(--color-primary-dark)', color: 'white', padding: '0.75rem 1rem', textAlign: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', letterSpacing: '1px' }}>G&S COFFEE FARM</h3>
                                <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>OFFICIAL WORKER IDENTIFICATION CARD</span>
                            </div>

                            <div style={{ padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#0f172a' }}>
                                        {selectedWorkerForCard.fullName}
                                    </h4>
                                    <div style={{ fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <div><strong>ID:</strong> {selectedWorkerForCard.workerId}</div>
                                        <div><strong>Card No:</strong> {selectedWorkerForCard.farmCardNumber}</div>
                                        <div><strong>Gender:</strong> {selectedWorkerForCard.gender}</div>
                                        <div><strong>Phone:</strong> {selectedWorkerForCard.phoneNumber}</div>
                                        <div><strong>Status:</strong> {selectedWorkerForCard.status}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <QRCodeSVG value={selectedWorkerForCard.workerId} size={90} />
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: '4px' }}>
                                        {selectedWorkerForCard.workerId}
                                    </span>
                                </div>
                            </div>

                            <div style={{ backgroundColor: '#f1f5f9', padding: '0.5rem', textAlign: 'center', fontSize: '0.75rem', color: '#64748b', borderTop: '1px solid #e2e8f0' }}>
                                Mubende District, Uganda • Authorized Workforce Card
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => generateWorkerIdCardPDF(selectedWorkerForCard)}
                            >
                                <Printer size={18} /> Download Printable PDF Card
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setSelectedWorkerForCard(null)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Workers;

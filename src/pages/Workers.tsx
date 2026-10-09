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
    Edit3,
    QrCode,
    Banknote
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { generateWorkersMasterPDF, generateWorkerIdCardPDF } from '../utils/pdfGenerator';
import { formatUGX } from '../utils/calculations';
import './Workers.css';

const Workers: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedWorkerForCard, setSelectedWorkerForCard] = useState<Worker | null>(null);
    const [cardSide, setCardSide] = useState<'front' | 'back'>('front');
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

    // Simplified Registration Form State
    const [formData, setFormData] = useState({
        fullName: '',
        gender: 'Male' as 'Male' | 'Female',
        phoneNumber: '',
        monthlySalary: 500000,
        status: 'Active' as 'Active' | 'Inactive'
    });

    const workers = useLiveQuery(() => db.workers.toArray()) || [];

    const filteredWorkers = workers.filter(w => {
        const matchesSearch =
            w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.workerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (w.farmCardNumber && w.farmCardNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
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
                gender: formData.gender as 'Male' | 'Female',
                phoneNumber: formData.phoneNumber.trim() || '+256 700 000000',
                monthlySalary: Number(formData.monthlySalary) || 0,
                status: formData.status as 'Active' | 'Inactive'
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
                gender: formData.gender as 'Male' | 'Female',
                phoneNumber: formData.phoneNumber.trim() || '+256 700 000000',
                dateJoined: todayStr,
                status: formData.status as 'Active' | 'Inactive',
                farmCardNumber: farmCardNum,
                qrCode: newId,
                monthlySalary: Number(formData.monthlySalary) || 0
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
            status: 'Active'
        });
    };

    const handleOpenEdit = (worker: Worker) => {
        setEditingWorker(worker);
        setFormData({
            fullName: worker.fullName,
            gender: (worker.gender || 'Male') as 'Male' | 'Female',
            phoneNumber: worker.phoneNumber,
            monthlySalary: worker.monthlySalary || 0,
            status: (worker.status || 'Active') as 'Active' | 'Inactive'
        });
        setShowAddModal(true);
    };

    const activeCount = workers.filter(w => w.status === 'Active').length;
    const inactiveCount = workers.length - activeCount;
    const monthlyPayroll = workers
        .filter(w => w.status === 'Active')
        .reduce((total, worker) => total + (worker.monthlySalary || 0), 0);

    return (
        <div className="page-wrapper workers-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Users size={28} color="var(--color-primary)" /> Worker Directory &amp; ID Cards
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Register workers, manage workforce profiles, and generate QR ID cards. Overtime rates and payments are managed in Payroll.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => generateWorkersMasterPDF(filteredWorkers)}
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
                                status: 'Active'
                            });
                            setShowAddModal(true);
                        }}
                    >
                        <Plus size={18} /> Register Worker
                    </button>
                </div>
            </div>

            {/* Payroll overview */}
            <div className="workers-payroll-summary">
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">ESTIMATED MONTHLY BASE PAYROLL</span>
                        <Banknote className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value workers-payroll-total">{formatUGX(monthlyPayroll)}</div>
                    <div className="stat-change text-light">Active workers · excludes overtime and deductions</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">ACTIVE WORKERS</span>
                        <CheckCircle2 className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: '#16a34a' }}>{activeCount}</div>
                    <div className="stat-change text-light">Included in the base payroll estimate</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">INACTIVE WORKERS</span>
                        <X className="stat-icon text-warning" size={20} />
                    </div>
                    <div className="stat-value">
                        {inactiveCount}
                    </div>
                    <div className="stat-change text-light">Not included in the base payroll estimate</div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="card workers-payroll-toolbar">
                <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
                        <input
                            type="text"
                            placeholder="Search by worker name, ID, phone, or farm card..."
                            className="form-input"
                            style={{ paddingLeft: '2.25rem', width: '100%' }}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-light)' }}>Worker status</label>
                    <select
                        className="form-input"
                        style={{ minWidth: '140px' }}
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                    >
                        <option value="All">All Workers</option>
                        <option value="Active">Active Only</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>
            </div>

            {/* Worker pay schedule */}
            <div className="table-responsive card workers-payroll-table-wrap desktop-only">
                <table className="data-table workers-payroll-table">
                    <thead>
                        <tr>
                            <th>Worker</th>
                            <th>Phone Number</th>
                            <th>Status</th>
                            <th>Monthly base salary</th>
                            <th>Date joined</th>
                            <th className="workers-payroll-actions-heading">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredWorkers.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="workers-payroll-empty">
                                    No workers found matching these filters.
                                </td>
                            </tr>
                        ) : (
                            filteredWorkers.map(w => (
                                <tr key={w.workerId}>
                                    <td>
                                        <div className="workers-payroll-name">{w.fullName}</div>
                                        <div className="workers-payroll-id">{w.workerId}</div>
                                    </td>
                                    <td>
                                        <div>{w.phoneNumber || '-'}</div>
                                        <div className="workers-payroll-caption">{w.gender || 'Male'}</div>
                                    </td>
                                    <td>
                                        <span className={`workers-status-badge ${w.status === 'Active' ? 'is-active' : 'is-inactive'}`}>
                                            {w.status || 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <strong className="workers-payroll-salary">{formatUGX(w.monthlySalary || 0)}</strong>
                                        <div className="workers-payroll-caption">per month</div>
                                    </td>
                                    <td className="workers-payroll-date">{w.dateJoined}</td>
                                    <td className="workers-payroll-actions">
                                        <div className="workers-payroll-action-group">
                                            <button
                                                className="btn btn-primary"
                                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                                                onClick={() => setSelectedWorkerForCard(w)}
                                                title="View Official Farm Card & QR Code"
                                            >
                                                <QrCode size={14} /> Card
                                            </button>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem' }}
                                                onClick={() => handleOpenEdit(w)}
                                                title="Edit worker details"
                                                aria-label={`Edit ${w.fullName}`}
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile worker cards */}
            <div className="mobile-only workers-payroll-cards">
                {filteredWorkers.length === 0 ? (
                    <div className="card workers-payroll-empty">
                        No workers found matching these filters.
                    </div>
                ) : (
                    filteredWorkers.map((worker, index) => (
                        <article key={worker.workerId} className="card workers-payroll-card">
                            <div className="workers-payroll-card-heading">
                                <div className="workers-payroll-card-identity">
                                    <div className="workers-payroll-caption">Number: {index + 1}</div>
                                    <strong className="workers-payroll-card-name">{worker.fullName}</strong>
                                    <div className="workers-payroll-id">
                                        {worker.workerId}{worker.farmCardNumber ? ` • ${worker.farmCardNumber}` : ''}
                                    </div>
                                </div>
                                <span className={`workers-status-badge ${worker.status === 'Active' ? 'is-active' : 'is-inactive'}`}>
                                    {worker.status || 'Inactive'}
                                </span>
                            </div>

                            <div className="workers-payroll-card-details">
                                <div>
                                    <span className="workers-payroll-caption">Phone:</span>
                                    <strong>{worker.phoneNumber}</strong>
                                </div>
                                <div>
                                    <span className="workers-payroll-caption">Monthly Salary:</span>
                                    <strong>{formatUGX(worker.monthlySalary || 0)}</strong>
                                </div>
                                <div>
                                    <span className="workers-payroll-caption">Date Joined:</span>
                                    <strong>{worker.dateJoined}</strong>
                                </div>
                            </div>

                            <div className="workers-payroll-card-actions">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => handleOpenEdit(worker)}
                                >
                                    <Edit3 size={15} /> Edit Worker
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setSelectedWorkerForCard(worker)}
                                >
                                    <QrCode size={15} /> Farm Card
                                </button>
                            </div>
                        </article>
                    ))
                )}
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

                            <div className="form-group">
                                <label className="form-label">Monthly Base Salary (UGX) *</label>
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
                    <div className="modal-content card" style={{ maxWidth: '440px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Farm Identification Card</h2>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem', border: 'none' }}
                                onClick={() => setSelectedWorkerForCard(null)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Front / Back Side Switcher Tabs */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                            <button
                                type="button"
                                style={{
                                    flex: 1,
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    backgroundColor: cardSide === 'front' ? '#ffffff' : 'transparent',
                                    color: cardSide === 'front' ? 'var(--color-primary-dark)' : '#64748b',
                                    boxShadow: cardSide === 'front' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                                onClick={() => setCardSide('front')}
                            >
                                Front Side
                            </button>
                            <button
                                type="button"
                                style={{
                                    flex: 1,
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    backgroundColor: cardSide === 'back' ? '#ffffff' : 'transparent',
                                    color: cardSide === 'back' ? 'var(--color-primary-dark)' : '#64748b',
                                    boxShadow: cardSide === 'back' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                                onClick={() => setCardSide('back')}
                            >
                                Back Side
                            </button>
                        </div>

                        {/* Visual Card Component (Front or Back) */}
                        {cardSide === 'front' ? (
                            <div
                                style={{
                                    width: '100%',
                                    maxWidth: '420px',
                                    minHeight: '260px',
                                    margin: '0 auto',
                                    backgroundColor: '#ffffff',
                                    borderRadius: '16px',
                                    border: '1px solid #d1d5db',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
                                    display: 'flex'
                                }}
                            >
                                {/* Left Green Section */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: '56px',
                                        bottom: 0,
                                        width: '34%',
                                        backgroundColor: '#74a434',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'flex-end',
                                        alignItems: 'center',
                                        paddingBottom: '10px'
                                    }}
                                >
                                    {/* Official Farm Plant Emblem under QR */}
                                    <img
                                        src="/assets/card_plant_emblem.png"
                                        alt="G&S Plant Emblem"
                                        style={{
                                            width: '52px',
                                            height: 'auto',
                                            objectFit: 'contain',
                                            display: 'block'
                                        }}
                                    />
                                </div>

                                {/* Dark QR Code Box Container ("the black spot") */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: '5.5%',
                                        top: '14%',
                                        width: '23%',
                                        height: '45%',
                                        backgroundColor: '#373737',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '4px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                                        zIndex: 2
                                    }}
                                >
                                    <div style={{ backgroundColor: '#ffffff', padding: '3px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <QRCodeSVG value={selectedWorkerForCard.workerId} size={70} fgColor="#000000" bgColor="#ffffff" />
                                    </div>
                                </div>

                                {/* Right Card Information */}
                                <div
                                    style={{
                                        marginLeft: '34%',
                                        width: '66%',
                                        padding: '16px 18px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        textAlign: 'center'
                                    }}
                                >
                                    {/* Top Right Brand Logo */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                            <path d="M12 10a5 5 0 0 0-5-5H3v3a5 5 0 0 0 5 5h4" fill="#74a434" />
                                            <path d="M12 10a5 5 0 0 1 5-5h4v3a5 5 0 0 1-5 5h-4" fill="#74a434" />
                                            <path d="M5 17c2 3 5 3 7 3s5 0 7-3" stroke="#8a6642" strokeWidth="2.5" strokeLinecap="round" />
                                            <path d="M8 20c1.5 1.5 3 1.5 4 1.5s2.5 0 4-1.5" stroke="#8a6642" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                        <div style={{ textAlign: 'left', lineHeight: 1 }}>
                                            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#1f2937', letterSpacing: '-0.5px' }}>G&S</div>
                                            <div style={{ fontWeight: 800, fontSize: '0.7rem', color: '#1f2937', letterSpacing: '2px' }}>FARMS</div>
                                        </div>
                                    </div>

                                    {/* Role Title */}
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '3px' }}>
                                        {selectedWorkerForCard.position || selectedWorkerForCard.department || 'Company Employee'}
                                    </div>

                                    {/* Full Name */}
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px', wordBreak: 'break-word', maxWidth: '230px' }}>
                                        {selectedWorkerForCard.fullName}
                                    </div>

                                    {/* ID Badge Box */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', marginBottom: '10px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>ID:</span>
                                        <div
                                            style={{
                                                flex: 1,
                                                backgroundColor: '#e5e7eb',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontWeight: 800,
                                                fontSize: '0.95rem',
                                                color: '#1f2937',
                                                letterSpacing: '1px'
                                            }}
                                        >
                                            {(selectedWorkerForCard.farmCardNumber || selectedWorkerForCard.workerId.replace(/^GSF-W-0*/i, '') || selectedWorkerForCard.workerId).padStart(4, '0')}
                                        </div>
                                    </div>

                                    {/* Issued & Expiry Dates */}
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem', textAlign: 'left' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px' }}>
                                            <span style={{ fontWeight: 800, color: '#1e293b', minWidth: '55px' }}>Issued:</span>
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                {selectedWorkerForCard.dateJoined
                                                    ? format(new Date(selectedWorkerForCard.dateJoined), 'dd/MM/yyyy')
                                                    : '01/08/2026'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px' }}>
                                            <span style={{ fontWeight: 800, color: '#1e293b', minWidth: '55px' }}>Expires:</span>
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                {(() => {
                                                    try {
                                                        const baseD = selectedWorkerForCard.dateJoined ? new Date(selectedWorkerForCard.dateJoined) : new Date('2026-08-01');
                                                        const expD = new Date(baseD);
                                                        expD.setFullYear(expD.getFullYear() + 1);
                                                        expD.setDate(expD.getDate() - 1);
                                                        return format(expD, 'dd/MM/yyyy');
                                                    } catch {
                                                        return '31/07/2027';
                                                    }
                                                })()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Back Side of Card - Exactly matching the official G&S Farms design */
                            <div
                                style={{
                                    width: '100%',
                                    maxWidth: '420px',
                                    margin: '0 auto',
                                    backgroundColor: '#ffffff',
                                    borderRadius: '16px',
                                    border: '1px solid #d1d5db',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
                                    display: 'flex'
                                }}
                            >
                                <img
                                    src="/assets/id_card_back_full.png"
                                    alt="Official G&S Farms Card Back"
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        display: 'block',
                                        objectFit: 'cover'
                                    }}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => void generateWorkerIdCardPDF(selectedWorkerForCard)}
                            >
                                <Printer size={18} /> Download Printable Card (Front & Back)
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

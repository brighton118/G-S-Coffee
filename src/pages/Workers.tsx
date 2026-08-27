import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { QrCode, Plus, Search, X, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const Workers = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<any>(null);

    // Form State
    const [formData, setFormData] = useState({ fullName: '', gender: 'Male', phone: '', position: '', department: '', emergency: '' });

    const workers = useLiveQuery(() => db.workers.toArray()) || [];

    const filteredWorkers = workers.filter(w =>
        w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.workerId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newId = `GSF-W-${(workers.length + 1).toString().padStart(4, '0')}`;
        const today = new Date().toISOString().split('T')[0];

        await db.workers.add({
            workerId: newId,
            fullName: formData.fullName,
            gender: formData.gender,
            phoneNumber: formData.phone,
            position: formData.position,
            department: formData.department,
            dateJoined: today,
            status: 'Active',
            emergencyContact: formData.emergency,
            farmCardNumber: `FC-${(1000 + workers.length + 1)}`,
            qrCode: newId
        });

        await db.activityLogs.add({ user: 'System', action: 'Created Worker', module: 'Workers', recordIdentifier: newId, date: new Date().toISOString(), description: `Registered ${formData.fullName}` });

        setShowAddForm(false);
        setFormData({ fullName: '', gender: 'Male', phone: '', position: '', department: '', emergency: '' });
    };

    return (
        <div className="workers-wrapper">
            <div className="header-action">
                <div>
                    <h1>Workers & Attendance Registry</h1>
                    <p className="text-light">Manage farm workforce and generate digital farm cards.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddForm(true)}><Plus size={18} /> Register Worker</button>
            </div>

            <div className="filters-bar card">
                <div className="search-group">
                    <Search size={18} className="text-light" />
                    <input
                        type="text"
                        placeholder="Search Worker ID or Name..."
                        className="form-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-responsive card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Department</th>
                            <th>Position</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredWorkers.map(w => (
                            <tr key={w.workerId}>
                                <td><strong>{w.workerId}</strong></td>
                                <td>{w.fullName}</td>
                                <td>{w.department}</td>
                                <td>{w.position}</td>
                                <td>
                                    <span className={`badge ${w.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                                        {w.status === 'Active' ? 'Present' : w.status}
                                    </span>
                                </td>
                                <td>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setSelectedWorker(w)}><QrCode size={16} /> Farm Card</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showAddForm && (
                <div className="modal-overlay">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h2>Register New Worker</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowAddForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">Full Name *</label>
                                <input required type="text" className="form-input" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Gender *</label>
                                    <select className="form-input" value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })}>
                                        <option>Male</option>
                                        <option>Female</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Phone Number *</label>
                                    <input required type="text" className="form-input" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Department *</label>
                                    <input required type="text" className="form-input" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Position *</label>
                                    <input required type="text" className="form-input" value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Emergency Contact *</label>
                                <input required type="text" className="form-input" value={formData.emergency} onChange={e => setFormData({ ...formData, emergency: e.target.value })} />
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save Worker</button>
                        </form>
                    </div>
                </div>
            )}

            {selectedWorker && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '350px' }}>
                        <div className="modal-header" style={{ borderBottom: 'none', marginBottom: '0' }}>
                            <h2 style={{ color: 'transparent' }}>_</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setSelectedWorker(null)}><X size={18} /></button>
                        </div>

                        <div className="farm-card" style={{ textAlign: 'center', padding: '1rem', border: '2px solid var(--color-primary)', borderRadius: '12px', background: 'var(--color-surface)' }}>
                            <h2 style={{ color: 'var(--color-primary-dark)', letterSpacing: '2px', marginBottom: '1.5rem' }}>G$S COFFEE FARM</h2>
                            <div style={{ background: 'white', padding: '1rem', display: 'inline-block', borderRadius: '8px', marginBottom: '1rem' }}>
                                <QRCodeSVG value={`${window.location.origin}/worker/${selectedWorker.workerId}`} size={200} level="H" />
                            </div>
                            <h3 style={{ margin: '0', fontSize: '1.5rem' }}>{selectedWorker.fullName}</h3>
                            <p style={{ color: 'var(--color-text-light)', margin: '0 0 1rem 0' }}>{selectedWorker.workerId}</p>

                            <div style={{ background: 'var(--color-background)', padding: '0.5rem', borderRadius: '4px', textAlign: 'left', fontSize: '0.875rem' }}>
                                <p style={{ margin: '0' }}><strong>Position:</strong> {selectedWorker.position}</p>
                                <p style={{ margin: '0' }}><strong>Department:</strong> {selectedWorker.department}</p>
                                <p style={{ margin: '0' }}><strong>Card No:</strong> {selectedWorker.farmCardNumber}</p>
                            </div>
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => window.print()}><Printer size={18} /> Print Card</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Workers;

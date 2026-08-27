import React, { useState } from 'react';
import { Settings as SettingsIcon, Save, Trash2, ShieldCheck, Mail, Smartphone } from 'lucide-react';
import './Dashboard.css';

const Settings = () => {
    const [settings, setSettings] = useState({
        farmName: 'G$S Coffee Farm',
        farmLocation: 'Mubende District, Uganda',
        contactEmail: 'admin@gscoffee-farm.com',
        contactPhone: '+256 700 000 000',
        attendanceLateThreshold: '08:00',
        attendanceLockoutHours: '7',
        enableSMSAlerts: true,
        enableEmailAlerts: true,
    });

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        alert('System variables successfully updated securely in local memory.');
    };

    const handleClearData = () => {
        if (window.confirm('WARNING: This will purge local IndexedDB storage. Sync to cloud first! Proceed?')) {
            alert('Purge aborted in demo mode.');
        }
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1><SettingsIcon size={28} style={{ verticalAlign: 'text-bottom', marginRight: '8px' }} /> System Configuration</h1>
                    <p className="text-light">Manage global variables, communication channels, and security.</p>
                </div>
            </div>

            <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>

                {/* General Preferences */}
                <div className="card">
                    <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>General Information</h3>
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label className="form-label">Farm Organization Name</label>
                            <input type="text" className="form-input" value={settings.farmName} onChange={e => setSettings({ ...settings, farmName: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Physical Location Address</label>
                            <input type="text" className="form-input" value={settings.farmLocation} onChange={e => setSettings({ ...settings, farmLocation: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label className="form-label">System Admin Email</label>
                                <input type="email" className="form-input" value={settings.contactEmail} onChange={e => setSettings({ ...settings, contactEmail: e.target.value })} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="form-label">Support Phone</label>
                                <input type="text" className="form-input" value={settings.contactPhone} onChange={e => setSettings({ ...settings, contactPhone: e.target.value })} />
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}><Save size={18} /> Update General Info</button>
                    </form>
                </div>

                {/* Workflow Rules */}
                <div className="card">
                    <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>Operational Thresholds</h3>
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label className="form-label">Daily Attendance Registration Cutoff</label>
                            <input type="time" className="form-input" value={settings.attendanceLateThreshold} onChange={e => setSettings({ ...settings, attendanceLateThreshold: e.target.value })} />
                            <small style={{ color: 'var(--color-text-light)', display: 'block', marginTop: '0.25rem' }}>Workers checking in after this time will be globally flagged as LATE.</small>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Scanner Anti-Duplication Lock (Hours)</label>
                            <input type="number" className="form-input" value={settings.attendanceLockoutHours} onChange={e => setSettings({ ...settings, attendanceLockoutHours: e.target.value })} />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}><Save size={18} /> Apply Internal Thresholds</button>
                    </form>
                </div>

                {/* Automation & Comms */}
                <div className="card">
                    <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>Notifications & Comms Routing</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={settings.enableEmailAlerts} onChange={e => setSettings({ ...settings, enableEmailAlerts: e.target.checked })} style={{ width: '20px', height: '20px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={18} /> Broadcast Daily PDF Reports via Email</div>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={settings.enableSMSAlerts} onChange={e => setSettings({ ...settings, enableSMSAlerts: e.target.checked })} style={{ width: '20px', height: '20px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Smartphone size={18} /> Trigger Immediate SMS for Critical Low Stock Alert</div>
                        </label>
                    </div>
                </div>

                {/* Security and Danger Zone */}
                <div className="card" style={{ borderLeft: '4px solid var(--color-danger)' }}>
                    <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem', color: 'var(--color-primary-dark)' }}><ShieldCheck size={20} /> Security & Database Management</h3>
                    <p style={{ color: 'var(--color-text-light)', marginBottom: '1.5rem' }}>These actions affect hardware synchronization payloads and raw application storage metrics.</p>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn btn-secondary" onClick={() => alert('Firestore Sync initiated. Checking deltas against cloud...')}>Force Cloud Sync</button>
                        <button className="btn btn-secondary" style={{ background: '#fef2f2', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={handleClearData}><Trash2 size={18} /> Purge App Cache</button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Settings;

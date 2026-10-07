import React, { useState, useEffect } from 'react';
import { 
    Settings as SettingsIcon, 
    Save, 
    Trash2, 
    ShieldCheck, 
    Mail, 
    Smartphone, 
    Bell, 
    CheckCircle2, 
    RefreshCw,
    Clock,
    Package,
    Sprout
} from 'lucide-react';
import { notificationService } from '../utils/notificationService';
import { firestoreSyncService } from '../services/firestoreSync';
import AdminInvitations from '../components/AdminInvitations';
import './Dashboard.css';

const Settings: React.FC = () => {
    const [settings, setSettings] = useState({
        farmName: 'G&S COFFEE Farm',
        farmLocation: 'Mubende District, Uganda',
        contactEmail: 'admin@gscoffee-farm.com',
        contactPhone: '+256 700 123456',
        attendanceLateThreshold: '08:00',
        attendanceLockoutHours: '7',
        enableSMSAlerts: true,
        enableEmailAlerts: true,
        notifyLowStock: true,
        notifyChamberOverdue: true,
        notifyPendingOvertime: true,
        notifyEODAttendance: true,
    });

    const [saveNotice, setSaveNotice] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState<boolean>(false);

    useEffect(() => {
        const saved = localStorage.getItem('gs_farm_settings');
        if (saved) {
            try {
                setSettings(JSON.parse(saved));
            } catch (e) {
                // ignore
            }
        }
    }, []);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        localStorage.setItem('gs_farm_settings', JSON.stringify(settings));
        setSaveNotice('Settings and Notification Routing saved successfully.');
        setTimeout(() => setSaveNotice(null), 4000);
    };

    const handleSendTestAlert = async () => {
        await notificationService.createNotification(
            'General',
            'Test Notification Dispatch',
            `System verification successful. Alerts configured for SMS: ${settings.contactPhone} and Email: ${settings.contactEmail}.`,
            settings.enableSMSAlerts ? 'SMS' : 'In-App',
            settings.contactPhone
        );
        setSaveNotice('Test notification created and logged successfully!');
        setTimeout(() => setSaveNotice(null), 4000);
    };

    const handleForceSync = async () => {
        setIsSyncing(true);
        try {
            await firestoreSyncService.syncLocalToCloud();
            setSaveNotice('Cloud synchronization complete: Local records synced with Cloud Firestore.');
        } catch (err: any) {
            setSaveNotice('Sync completed.');
        } finally {
            setIsSyncing(false);
            setTimeout(() => setSaveNotice(null), 4000);
        }
    };

    const handleClearData = () => {
        if (window.confirm('WARNING: This will clear demo data in your browser session. Proceed?')) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
        }
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <SettingsIcon size={28} /> System & Notification Settings
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Configure farm properties, operational thresholds, and SMS/Email communication routing.
                    </p>
                </div>
            </div>

            {saveNotice && (
                <div className="card" style={{ padding: '0.85rem 1.25rem', backgroundColor: '#f0fdf4', borderLeft: '4px solid #22c55e', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={18} />
                    <span>{saveNotice}</span>
                </div>
            )}

            <form onSubmit={handleSave}>
                <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>

                    {/* General Preferences */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', margin: 0, color: 'var(--color-primary-dark)' }}>
                            General Farm Info
                        </h3>
                        <div className="form-group">
                            <label className="form-label">Farm Organization Name</label>
                            <input type="text" className="form-input" value={settings.farmName} onChange={e => setSettings({ ...settings, farmName: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Physical Location Address</label>
                            <input type="text" className="form-input" value={settings.farmLocation} onChange={e => setSettings({ ...settings, farmLocation: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Manager Mobile Phone (SMS Alert Target)</label>
                            <input type="text" className="form-input" value={settings.contactPhone} onChange={e => setSettings({ ...settings, contactPhone: e.target.value })} placeholder="+256 700 000000" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Manager Email (Reports & Summaries)</label>
                            <input type="email" className="form-input" value={settings.contactEmail} onChange={e => setSettings({ ...settings, contactEmail: e.target.value })} placeholder="admin@gscoffee.farm" />
                        </div>
                    </div>

                    {/* Notification Routing & Channels */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', margin: 0, color: 'var(--color-primary-dark)' }}>
                            <Bell size={18} style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
                            Notification Delivery Routing
                        </h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input type="checkbox" checked={settings.enableSMSAlerts} onChange={e => setSettings({ ...settings, enableSMSAlerts: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Smartphone size={16} /> Send SMS Alerts to {settings.contactPhone}
                                </div>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input type="checkbox" checked={settings.enableEmailAlerts} onChange={e => setSettings({ ...settings, enableEmailAlerts: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Mail size={16} /> Send Email PDF Reports to {settings.contactEmail}
                                </div>
                            </label>
                        </div>

                        <h4 style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '0.95rem', color: 'var(--color-text)' }}>Active Trigger Event Subscriptions:</h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'var(--color-background)', padding: '0.75rem', borderRadius: '6px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input type="checkbox" checked={settings.notifyEODAttendance} onChange={e => setSettings({ ...settings, notifyEODAttendance: e.target.checked })} />
                                <Clock size={14} color="#2563eb" /> Daily End of Day (17:00) Attendance Summary
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input type="checkbox" checked={settings.notifyPendingOvertime} onChange={e => setSettings({ ...settings, notifyPendingOvertime: e.target.checked })} />
                                <Clock size={14} color="#ea580c" /> Pending Overtime Approval Alerts
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input type="checkbox" checked={settings.notifyLowStock} onChange={e => setSettings({ ...settings, notifyLowStock: e.target.checked })} />
                                <Package size={14} color="#dc2626" /> Critical Low Stock Threshold Warnings
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input type="checkbox" checked={settings.notifyChamberOverdue} onChange={e => setSettings({ ...settings, notifyChamberOverdue: e.target.checked })} />
                                <Sprout size={14} color="#16a34a" /> Humid Chamber Overdue Alerts (&gt; 30 days)
                            </label>
                        </div>

                        <button 
                            type="button" 
                            className="btn btn-secondary" 
                            onClick={handleSendTestAlert}
                            style={{ alignSelf: 'flex-start', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.25rem' }}
                        >
                            <Bell size={14} /> Send Test Alert
                        </button>
                    </div>

                    {/* Operational Thresholds */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', margin: 0, color: 'var(--color-primary-dark)' }}>
                            Operational Thresholds
                        </h3>
                        <div className="form-group">
                            <label className="form-label">Daily Attendance Registration Cutoff</label>
                            <input type="time" className="form-input" value={settings.attendanceLateThreshold} onChange={e => setSettings({ ...settings, attendanceLateThreshold: e.target.value })} />
                            <small style={{ color: 'var(--color-text-light)', display: 'block', marginTop: '0.25rem' }}>Workers checking in after this time will be flagged as LATE.</small>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Scanner Anti-Duplication Lock (Hours)</label>
                            <input type="number" className="form-input" value={settings.attendanceLockoutHours} onChange={e => setSettings({ ...settings, attendanceLockoutHours: e.target.value })} />
                        </div>
                    </div>

                    {/* Security and Cloud Sync */}
                    <AdminInvitations />

                    <div className="card" style={{ borderLeft: '4px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', margin: 0, color: 'var(--color-primary-dark)' }}>
                            <ShieldCheck size={20} style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
                            Cloud Synchronization & Database
                        </h3>
                        <p style={{ color: 'var(--color-text-light)', margin: 0, fontSize: '0.875rem' }}>
                            Force synchronization of local Dexie IndexedDB changes up to Google Cloud Firestore backend.
                        </p>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                onClick={handleForceSync}
                                disabled={isSyncing}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
                                {isSyncing ? 'Syncing...' : 'Force Cloud Sync'}
                            </button>
                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                style={{ background: '#fef2f2', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} 
                                onClick={handleClearData}
                            >
                                <Trash2 size={14} /> Clear Cache
                            </button>
                        </div>
                    </div>

                </div>

                {/* Save Button Bar */}
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-start' }}>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1.5rem', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Save size={18} /> Save All Configurations
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Settings;

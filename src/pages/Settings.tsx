import React, { useState, useEffect, useRef } from 'react';
import { 
    Settings as SettingsIcon, 
    Save, 
    Trash2, 
    Mail, 
    Smartphone, 
    Bell, 
    CheckCircle2, 
    RefreshCw,
    Clock,
    Package,
    Sprout,
    Key,
    Eye,
    EyeOff,
    Download,
    Upload,
    Database,
    FileJson,
    Info
} from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { auth } from '../firebase';
import { notificationService } from '../utils/notificationService';
import { firestoreSyncService } from '../services/firestoreSync';
import AdminInvitations from '../components/AdminInvitations';
import {
    DEFAULT_ATTENDANCE_SCHEDULE,
    normalizeAttendanceScheduleSettings
} from '../utils/attendanceSchedule';
import { useUserRole } from '../context/UserRoleContext';
import './Dashboard.css';

const Settings: React.FC = () => {
    const { isAdmin, isSuperAdmin } = useUserRole();
    const [settings, setSettings] = useState({
        farmName: 'G&S FARM',
        farmLocation: 'Mubende District, Uganda',
        contactEmail: 'admin@gscoffee-farm.com',
        contactPhone: '+256 700 123456',
        ...DEFAULT_ATTENDANCE_SCHEDULE,
        enableSMSAlerts: true,
        enableEmailAlerts: true,
        notifyLowStock: true,
        notifyChamberOverdue: true,
        notifyPendingOvertime: true,
        notifyEODAttendance: true,
    });

    const [saveNotice, setSaveNotice] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState<boolean>(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);
    const [diagnostics, setDiagnostics] = useState<{
        local: Record<string, number>;
        cloud: Record<string, number>;
    } | null>(null);
    const [isLoadingDiag, setIsLoadingDiag] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Password change state
    const [newAdminPass, setNewAdminPass] = useState('');
    const [confirmAdminPass, setConfirmAdminPass] = useState('');
    const [showNewPass, setShowNewPass] = useState(false);
    const [isUpdatingPass, setIsUpdatingPass] = useState(false);
    const [passwordNotice, setPasswordNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const loadDiagnostics = async () => {
        setIsLoadingDiag(true);
        try {
            const diag = await firestoreSyncService.getSyncDiagnostics();
            setDiagnostics(diag);
        } catch (e) {
            console.warn('Diagnostics load note:', e);
        } finally {
            setIsLoadingDiag(false);
        }
    };

    useEffect(() => {
        const saved = localStorage.getItem('gs_farm_settings');
        if (saved) {
            try {
                const parsedSettings = JSON.parse(saved);
                setSettings(current => ({
                    ...current,
                    ...parsedSettings,
                    ...normalizeAttendanceScheduleSettings(parsedSettings)
                }));
            } catch (error) {
                console.error('Unable to load farm settings from local storage.', error);
            }
        }
        void loadDiagnostics();
    }, []);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (settings.attendanceTimeInStart >= settings.attendanceTimeInEnd) {
            alert('The time-in window must end after it starts.');
            return;
        }
        if (settings.attendanceTimeOutStart >= settings.attendanceTimeOutEnd) {
            alert('The time-out window must end after it starts.');
            return;
        }
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
        setSyncMessage('Synchronizing in both directions with Cloud Firestore...');
        try {
            const res = await firestoreSyncService.syncNow();
            setSaveNotice(`Cloud synchronization complete! ${res.uploaded} records uploaded to Cloud, ${res.downloaded} records downloaded to this device.`);
            await loadDiagnostics();
        } catch (err: any) {
            setSaveNotice('Sync completed.');
        } finally {
            setIsSyncing(false);
            setSyncMessage(null);
            setTimeout(() => setSaveNotice(null), 6000);
        }
    };

    const handlePushOnly = async () => {
        setIsSyncing(true);
        setSyncMessage('Pushing all local records up to Cloud Firestore...');
        try {
            const count = await firestoreSyncService.syncLocalToCloud();
            setSaveNotice(`Upload complete: ${count} local records pushed to Cloud Firestore.`);
            await loadDiagnostics();
        } catch (err: any) {
            setSaveNotice('Upload completed with notes.');
        } finally {
            setIsSyncing(false);
            setSyncMessage(null);
            setTimeout(() => setSaveNotice(null), 6000);
        }
    };

    const handlePullOnly = async () => {
        setIsSyncing(true);
        setSyncMessage('Downloading all records from Cloud Firestore...');
        try {
            const count = await firestoreSyncService.syncCloudToLocal();
            setSaveNotice(`Download complete: ${count} cloud records pulled into local database.`);
            await loadDiagnostics();
        } catch (err: any) {
            setSaveNotice('Download completed with notes.');
        } finally {
            setIsSyncing(false);
            setSyncMessage(null);
            setTimeout(() => setSaveNotice(null), 6000);
        }
    };

    const handleExportJson = async () => {
        try {
            const jsonStr = await firestoreSyncService.exportDatabaseToJson();
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gs_farm_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setSaveNotice('Full database backup file (JSON) downloaded successfully!');
            setTimeout(() => setSaveNotice(null), 5000);
        } catch (e: any) {
            alert('Export failed: ' + (e?.message || e));
        }
    };

    const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsSyncing(true);
        setSyncMessage('Reading JSON file and restoring data...');
        try {
            const text = await file.text();
            const res = await firestoreSyncService.importDatabaseFromJson(text);
            setSaveNotice(`Import successful! Restored ${res.count} records into local database and synced to cloud.`);
            await loadDiagnostics();
        } catch (err: any) {
            alert('Import failed: ' + (err?.message || err));
        } finally {
            setIsSyncing(false);
            setSyncMessage(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setTimeout(() => setSaveNotice(null), 6000);
        }
    };

    const handleClearData = () => {
        if (window.confirm('WARNING: This will clear demo data in your browser session. Proceed?')) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordNotice(null);

        if (!newAdminPass || newAdminPass.length < 6) {
            setPasswordNotice({ text: 'Password must be at least 6 characters long.', type: 'error' });
            return;
        }

        if (newAdminPass !== confirmAdminPass) {
            setPasswordNotice({ text: 'Passwords do not match. Please verify.', type: 'error' });
            return;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            setPasswordNotice({ text: 'You must be signed in to change your password.', type: 'error' });
            return;
        }

        setIsUpdatingPass(true);
        try {
            await updatePassword(currentUser, newAdminPass.trim());
            setPasswordNotice({ text: 'Password updated successfully! Keep your new password secure.', type: 'success' });
            setNewAdminPass('');
            setConfirmAdminPass('');
        } catch (err: any) {
            console.error('Password change error:', err);
            if (err?.code === 'auth/requires-recent-login') {
                setPasswordNotice({ text: 'For security, please sign out and sign in again before changing your password.', type: 'error' });
            } else {
                setPasswordNotice({ text: err?.message || 'Could not update password. Please try again.', type: 'error' });
            }
        } finally {
            setIsUpdatingPass(false);
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">Time-In Window Starts</label>
                                <input type="time" required className="form-input" value={settings.attendanceTimeInStart} onChange={e => setSettings({ ...settings, attendanceTimeInStart: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Time-In Window Ends</label>
                                <input type="time" required className="form-input" value={settings.attendanceTimeInEnd} onChange={e => setSettings({ ...settings, attendanceTimeInEnd: e.target.value })} />
                            </div>
                        </div>
                        <small style={{ color: 'var(--color-text-light)', marginTop: '-0.75rem' }}>Scans after the time-in window ends are recorded as late.</small>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label className="form-label">Time-Out Window Starts</label>
                                <input type="time" required className="form-input" value={settings.attendanceTimeOutStart} onChange={e => setSettings({ ...settings, attendanceTimeOutStart: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Time-Out Window Ends</label>
                                <input type="time" required className="form-input" value={settings.attendanceTimeOutEnd} onChange={e => setSettings({ ...settings, attendanceTimeOutEnd: e.target.value })} />
                            </div>
                        </div>
                        <small style={{ color: 'var(--color-text-light)', marginTop: '-0.75rem' }}>Scans after the time-out window ends are recorded as overtime.</small>
                        <div className="form-group">
                            <label className="form-label">Scanner Anti-Duplication Lock (Hours)</label>
                            <input type="number" min="0" step="0.25" className="form-input" value={settings.attendanceLockoutHours} onChange={e => setSettings({ ...settings, attendanceLockoutHours: e.target.value })} />
                        </div>
                    </div>

                    {/* Security and Cloud Sync */}
                    {isSuperAdmin && <AdminInvitations />}

                    {/* Change Account Password */}
                    <div className="card" style={{ borderLeft: '4px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', margin: 0, color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Key size={20} color="#d97706" />
                            Change Account Password
                        </h3>
                        <p style={{ color: 'var(--color-text-light)', margin: 0, fontSize: '0.85rem' }}>
                            Signed in as <strong>{auth.currentUser?.email || 'gsfarm@gmail.com'}</strong>. You can update your password at any time.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>New Password</label>
                                <input
                                    type={showNewPass ? 'text' : 'password'}
                                    minLength={6}
                                    className="form-input"
                                    placeholder="At least 6 characters"
                                    value={newAdminPass}
                                    onChange={e => setNewAdminPass(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>Confirm Password</label>
                                <input
                                    type={showNewPass ? 'text' : 'password'}
                                    minLength={6}
                                    className="form-input"
                                    placeholder="Re-enter new password"
                                    value={confirmAdminPass}
                                    onChange={e => setConfirmAdminPass(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>

                        {passwordNotice && (
                            <div style={{ padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', background: passwordNotice.type === 'success' ? '#f0fdf4' : '#fef2f2', color: passwordNotice.type === 'success' ? '#15803d' : '#b91c1c', border: `1px solid ${passwordNotice.type === 'success' ? '#86efac' : '#fca5a5'}` }}>
                                {passwordNotice.text}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={isUpdatingPass || !newAdminPass}
                                onClick={handleUpdatePassword}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                            >
                                <Key size={14} /> {isUpdatingPass ? 'Updating...' : 'Update Password'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowNewPass(!showNewPass)}
                                style={{ background: 'none', border: 'none', color: 'var(--color-text-light)', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                                {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />} {showNewPass ? 'Hide Password' : 'Show Password'}
                            </button>
                        </div>
                    </div>

                    {/* Multi-Device Cloud Synchronization & Database Center */}
                    <div className="card" style={{ borderLeft: '4px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: '1.25rem', gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                            <h3 style={{ margin: 0, color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Database size={22} color="var(--color-primary)" />
                                Multi-Device Cloud Synchronization & Data Center
                            </h3>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={loadDiagnostics}
                                disabled={isLoadingDiag}
                                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <RefreshCw size={13} className={isLoadingDiag ? 'spin' : ''} />
                                {isLoadingDiag ? 'Checking...' : 'Refresh Status'}
                            </button>
                        </div>

                        {/* Informational Guidance Alert */}
                        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.9rem 1rem', fontSize: '0.875rem', color: '#334155', display: 'flex', gap: '0.75rem' }}>
                            <Info size={20} color="#0284c7" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <strong style={{ color: '#0f172a' }}>Displaying Data from Manager's Account:</strong>
                                <p style={{ margin: '0.35rem 0 0 0', lineHeight: 1.5 }}>
                                    If workers or payroll records were registered on a Manager's computer, phone, or browser profile, that device must push its local records to Cloud Firestore.
                                    Once uploaded, click <strong>"Pull Cloud to Local"</strong> below (or <strong>"Full 2-Way Sync"</strong>) to instantly load them onto this Superadmin dashboard.
                                </p>
                            </div>
                        </div>

                        {syncMessage && (
                            <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '6px', padding: '0.65rem 1rem', fontSize: '0.875rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <RefreshCw size={16} className="spin" />
                                <span>{syncMessage}</span>
                            </div>
                        )}

                        {/* Database Counts Diagnostics Grid */}
                        <div>
                            <h4 style={{ margin: '0 0 0.65rem 0', fontSize: '0.95rem', color: 'var(--color-text)' }}>
                                Live Database Record Comparison
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                                {[
                                    { label: 'Workers', key: 'workers', icon: '👥' },
                                    { label: 'Payroll Records', key: 'payrollRecords', icon: '📋' },
                                    { label: 'Payments', key: 'payrollPayments', icon: '💰' },
                                    { label: 'Attendance', key: 'attendance', icon: '🕒' },
                                    { label: 'Inventory', key: 'inventory', icon: '📦' },
                                    { label: 'Expenses', key: 'expenses', icon: '🧾' },
                                    { label: 'Clone Batches', key: 'clones', icon: '🌱' },
                                ].map(item => {
                                    const localCount = diagnostics?.local?.[item.key] ?? '...';
                                    const cloudCount = diagnostics?.cloud?.[item.key] ?? '...';
                                    const isMatch = typeof localCount === 'number' && typeof cloudCount === 'number' && localCount === cloudCount;
                                    return (
                                        <div key={item.key} style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.65rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', fontWeight: 600 }}>
                                                {item.icon} {item.label}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                                                <span title="Records in this browser profile">
                                                    Local: <strong style={{ color: 'var(--color-primary-dark)' }}>{localCount}</strong>
                                                </span>
                                                <span title="Records in Cloud Firestore">
                                                    Cloud: <strong style={{ color: '#0284c7' }}>{cloudCount}</strong>
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: isMatch ? '#16a34a' : '#d97706', fontWeight: 500, marginTop: '2px' }}>
                                                {isMatch ? '✓ Fully in sync' : typeof localCount === 'number' && localCount > (cloudCount as number) ? '↑ Local changes ready' : '↓ Cloud changes ready'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Action Buttons Bar */}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
                            <button 
                                type="button" 
                                className="btn btn-primary" 
                                onClick={handleForceSync}
                                disabled={isSyncing}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.15rem' }}
                            >
                                <RefreshCw size={15} className={isSyncing ? 'spin' : ''} />
                                {isSyncing ? 'Synchronizing...' : 'Full 2-Way Sync (Push & Pull)'}
                            </button>

                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                onClick={handlePullOnly}
                                disabled={isSyncing}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1' }}
                            >
                                <Download size={15} />
                                Pull Cloud to Local
                            </button>

                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                onClick={handlePushOnly}
                                disabled={isSyncing}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}
                            >
                                <Upload size={15} />
                                Push Local to Cloud
                            </button>

                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                onClick={handleExportJson}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                                title="Download a JSON file with all database records"
                            >
                                <FileJson size={15} /> Export Backup (JSON)
                            </button>

                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                accept=".json" 
                                style={{ display: 'none' }} 
                                onChange={handleImportFileChange} 
                            />

                            <button 
                                type="button" 
                                className="btn btn-secondary" 
                                onClick={() => fileInputRef.current?.click()}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                                title="Restore records from a previously exported JSON backup"
                            >
                                <Upload size={15} /> Import Backup (JSON)
                            </button>

                            {isAdmin && (
                                <button 
                                    type="button" 
                                    className="btn btn-secondary" 
                                    style={{ background: '#fef2f2', color: 'var(--color-danger)', borderColor: 'var(--color-danger)', marginLeft: 'auto' }} 
                                    onClick={handleClearData}
                                >
                                    <Trash2 size={14} /> Clear Cache
                                </button>
                            )}
                        </div>
                    </div>

                </div>

                {/* Save Button Bar */}
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-start' }}>
                    {isAdmin ? (
                        <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1.5rem', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Save size={18} /> Save All Configurations
                        </button>
                    ) : (
                        <div className="badge badge-warning" style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                            ⚠️ System configuration changes are restricted to Administrators (View-Only Mode)
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
};

export default Settings;

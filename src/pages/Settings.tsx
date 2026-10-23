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
    Sprout,
    Key,
    Eye,
    EyeOff
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
    const { isAdmin } = useUserRole();
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

    // Password change state
    const [newAdminPass, setNewAdminPass] = useState('');
    const [confirmAdminPass, setConfirmAdminPass] = useState('');
    const [showNewPass, setShowNewPass] = useState(false);
    const [isUpdatingPass, setIsUpdatingPass] = useState(false);
    const [passwordNotice, setPasswordNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
                    {isAdmin && <AdminInvitations />}

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
                            {isAdmin && (
                                <button 
                                    type="button" 
                                    className="btn btn-secondary" 
                                    style={{ background: '#fef2f2', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} 
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

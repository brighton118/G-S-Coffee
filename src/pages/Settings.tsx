import React, { useState, useEffect } from 'react';
import { 
    Settings as SettingsIcon, 
    Save, 
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
    FileText, 
    MapPin, 
    Phone, 
    Building, 
    Navigation, 
    Globe, 
    User, 
    ShieldCheck, 
    DollarSign,
    ChevronDown,
    Layers,
    Users,
    UserCheck,
    Lock
} from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, dbFirestore } from '../firebase';
import { firestoreSyncService } from '../services/firestoreSync';
import AdminInvitations from '../components/AdminInvitations';
import { SUPER_ADMIN_EMAILS } from '../services/adminAccess';
import {
    DEFAULT_ATTENDANCE_SCHEDULE,
    normalizeAttendanceScheduleSettings
} from '../utils/attendanceSchedule';
import { useUserRole } from '../context/UserRoleContext';
import './Dashboard.css';
import './Settings.css';

type SettingsSectionKey = 'all' | 'farm_info' | 'notifications' | 'thresholds' | 'invitations' | 'security';

const Settings: React.FC = () => {
    const { role, isAdmin, isSuperAdmin, isManager } = useUserRole();
    const isSuperAdminEmail = Boolean(auth.currentUser?.email && SUPER_ADMIN_EMAILS.includes(auth.currentUser.email.toLowerCase().trim()));
    const isFullAdmin = isAdmin || isSuperAdmin || isSuperAdminEmail;

    // Determine active role mode
    const effectiveRole: 'admin' | 'manager' | 'staff' = isFullAdmin 
        ? 'admin' 
        : (isManager || role === 'manager') 
        ? 'manager' 
        : 'staff';

    // Role-specific access permissions
    // Admin: Full configuration privileges
    // Manager: Operational settings, manager notifications, shift thresholds, and password
    // Staff: Read-only farm reference & personal password management
    const canEditFarmInfo = effectiveRole === 'admin' || effectiveRole === 'manager';
    const canEditAllEmails = effectiveRole === 'admin';
    const canEditManagerEmails = effectiveRole === 'admin' || effectiveRole === 'manager';
    const canEditAlertToggles = effectiveRole === 'admin' || effectiveRole === 'manager';
    const canEditThresholds = effectiveRole === 'admin' || effectiveRole === 'manager';
    const canSaveFarmSettings = effectiveRole === 'admin' || effectiveRole === 'manager';
    const canManageTeam = effectiveRole === 'admin';


    // Dropdown section navigation & accordion collapse states
    const [activeSection, setActiveSection] = useState<SettingsSectionKey>(() => {
        const saved = localStorage.getItem('gs_settings_active_section');
        if (saved && ['all', 'farm_info', 'notifications', 'thresholds', 'invitations', 'security'].includes(saved)) {
            return saved as SettingsSectionKey;
        }
        return 'all';
    });
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

    const [settings, setSettings] = useState({
        farmName: 'G&S FARMS',
        farmLocation: 'Mubende District, Uganda',
        farmRegion: 'Central Region, Mubende District',
        farmLandmark: 'Main Farm Gate, G&S Coffee Estate',
        contactPerson: 'Farm Administrator',
        contactEmail: 'gs.farms.ug@gmail.com',
        notificationEmails: 'brightonkato317@gmail.com',
        contactPhone: '+256788945330',
        secondaryPhone: '',
        currency: 'UGX',
        ...DEFAULT_ATTENDANCE_SCHEDULE,
        timezone: 'Africa/Kampala',
        managerNotificationEmails: '',
        enableSMSAlerts: true,
        enableEmailAlerts: true,
        notifyLowStock: true,
        notifyChamberOverdue: true,
        notifyPendingOvertime: true,
        notifyEODAttendance: true,
        notifyManagerEntry: true,
        notifyNurseryEvents: true,
        notifyInventoryEvents: true,
        notifySalesEvents: true,
        notifyWorkerEvents: true,
        notifyPayrollEvents: true,
        notifyAttendanceDeadlines: true,
    });
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveNotice, setSaveNotice] = useState<string | null>(null);

    // Password change state
    const [newAdminPass, setNewAdminPass] = useState('');
    const [confirmAdminPass, setConfirmAdminPass] = useState('');
    const [showNewPass, setShowNewPass] = useState(false);
    const [isUpdatingPass, setIsUpdatingPass] = useState(false);
    const [passwordNotice, setPasswordNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const handleSelectSection = (key: SettingsSectionKey) => {
        setActiveSection(key);
        localStorage.setItem('gs_settings_active_section', key);
        if (key !== 'all') {
            setCollapsedSections(prev => ({ ...prev, [key]: false }));
        }
    };

    const toggleSection = (key: string) => {
        setCollapsedSections(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const isCollapsed = (key: string) => {
        if (activeSection !== 'all') return false;
        return Boolean(collapsedSections[key]);
    };

    const shouldRender = (key: SettingsSectionKey) => {
        if (activeSection === 'all') return true;
        return activeSection === key;
    };

    const expandAllSections = () => {
        setCollapsedSections({});
    };

    const collapseAllSections = () => {
        setCollapsedSections({
            farm_info: true,
            notifications: true,
            thresholds: true,
            invitations: true,
            security: true
        });
    };

    useEffect(() => {
        let isMounted = true;
        // 1. Initial load from local storage
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

        // 2. Fetch latest settings from Cloud Firestore to keep all devices in sync
        const loadCloudSettings = async () => {
            try {
                const docRef = doc(dbFirestore, 'settings', 'general');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && isMounted) {
                    const cloudData = docSnap.data();
                    setSettings(current => {
                        const merged = {
                            ...current,
                            ...cloudData,
                            ...normalizeAttendanceScheduleSettings(cloudData)
                        };
                        localStorage.setItem('gs_farm_settings', JSON.stringify(merged));
                        return merged;
                    });
                }
            } catch (err) {
                console.warn('Cloud settings fetch note:', err);
            }
        };

        void loadCloudSettings();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSaveFarmSettings) {
            alert('Staff accounts have read-only access to global farm configurations.');
            return;
        }
        if (settings.attendanceTimeInStart >= settings.attendanceTimeInEnd) {
            alert('The time-in window must end after it starts.');
            return;
        }
        if (settings.attendanceTimeOutStart >= settings.attendanceTimeOutEnd) {
            alert('The time-out window must end after it starts.');
            return;
        }

        setIsSaving(true);
        try {
            // If manager is saving, preserve admin-only notification emails
            let dataToSave = { ...settings };
            if (effectiveRole === 'manager') {
                try {
                    const docRef = doc(dbFirestore, 'settings', 'general');
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        const existingCloud = snap.data();
                        dataToSave = {
                            ...existingCloud,
                            ...settings,
                            contactEmail: existingCloud.contactEmail || settings.contactEmail,
                            notificationEmails: existingCloud.notificationEmails || settings.notificationEmails
                        };
                    }
                } catch (_) {}
            }

            localStorage.setItem('gs_farm_settings', JSON.stringify(dataToSave));
            await firestoreSyncService.saveSettings(dataToSave);
            const docRef = doc(dbFirestore, 'settings', 'general');
            await setDoc(docRef, {
                ...dataToSave,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.email || (effectiveRole === 'manager' ? 'Farm Manager' : 'Administrator'),
                updatedRole: effectiveRole
            }, { merge: true });

            setSaveNotice(
                effectiveRole === 'manager'
                    ? '✅ Operational settings, manager alerts, and attendance thresholds saved and synced across devices!'
                    : '✅ All farm settings, emails, phone numbers, and location saved and synced across all devices!'
            );
        } catch (err: any) {
            console.error('Error saving settings to cloud:', err);
            setSaveNotice('✅ Settings saved locally (Cloud sync will update when reconnected).');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveNotice(null), 5000);
        }
    };

    const handleUpdatePassword = async () => {
        setPasswordNotice(null);

        if (!newAdminPass || newAdminPass.length < 6) {
            setPasswordNotice({ text: 'New password must be at least 6 characters long.', type: 'error' });
            return;
        }

        if (newAdminPass !== confirmAdminPass) {
            setPasswordNotice({ text: 'Passwords do not match. Please re-enter carefully.', type: 'error' });
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
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <SettingsIcon size={28} /> System &amp; Farm Settings
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Configure farm properties, contact details, operational thresholds, and notification routing.
                    </p>
                </div>
                {effectiveRole === 'admin' ? (
                    <div className="settings-role-badge admin">
                        <ShieldCheck size={16} color="#16a34a" /> Administrator Configuration Mode (Full Edit Rights)
                    </div>
                ) : effectiveRole === 'manager' ? (
                    <div className="settings-role-badge manager">
                        <UserCheck size={16} color="#2563eb" /> Estate Manager Mode (Operational &amp; Threshold Edit Rights)
                    </div>
                ) : (
                    <div className="settings-role-badge staff">
                        <User size={16} color="#475569" /> Staff Account (Farm Reference &amp; Password Security)
                    </div>
                )}
            </div>

            {/* Notification alert */}
            {saveNotice && (
                <div className="card" style={{ padding: '0.85rem 1.25rem', backgroundColor: '#f0fdf4', borderLeft: '4px solid #22c55e', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={18} />
                    <span>{saveNotice}</span>
                </div>
            )}

            {/* Top Navigation & Dropdown Selector Bar */}
            <nav className="settings-nav-control-bar" aria-label="Settings Page Navigation">
                <div className="settings-nav-top-row">
                    <div className="settings-nav-dropdown-group">
                        <label htmlFor="settings-page-dropdown" className="settings-nav-label">
                            <Layers size={17} color="var(--color-primary)" />
                            <span>Settings Page:</span>
                        </label>
                        <div className="settings-select-wrapper">
                            <select
                                id="settings-page-dropdown"
                                className="settings-select-dropdown"
                                value={activeSection}
                                onChange={e => handleSelectSection(e.target.value as SettingsSectionKey)}
                            >
                                <option value="all">📂 All Pages (Full Settings Overview)</option>
                                <option value="farm_info">🏢 Farm Info, Location &amp; Contacts</option>
                                <option value="notifications">🔔 Notifications &amp; Alert Routing</option>
                                <option value="thresholds">⏰ Operational &amp; Attendance Thresholds</option>
                                {canManageTeam && (
                                    <option value="invitations">👥 Team Access &amp; Staff Invitations</option>
                                )}
                                <option value="security">🔑 Account Password &amp; Security</option>
                            </select>
                            <ChevronDown size={17} className="settings-select-chevron" />
                        </div>
                    </div>

                    {activeSection === 'all' && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                                onClick={expandAllSections}
                                title="Expand all section accordions"
                            >
                                Expand All
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                                onClick={collapseAllSections}
                                title="Collapse all section accordions"
                            >
                                Collapse All
                            </button>
                        </div>
                    )}
                </div>

                {/* Quick Desktop Pills for 1-Click Navigation */}
                <div className="settings-pills-row">
                    <button
                        type="button"
                        className={`settings-pill-btn ${activeSection === 'all' ? 'active' : ''}`}
                        onClick={() => handleSelectSection('all')}
                    >
                        All Pages
                    </button>
                    <button
                        type="button"
                        className={`settings-pill-btn ${activeSection === 'farm_info' ? 'active' : ''}`}
                        onClick={() => handleSelectSection('farm_info')}
                    >
                        <Building size={13} /> Farm Info &amp; Contacts
                    </button>
                    <button
                        type="button"
                        className={`settings-pill-btn ${activeSection === 'notifications' ? 'active' : ''}`}
                        onClick={() => handleSelectSection('notifications')}
                    >
                        <Bell size={13} /> Notifications
                    </button>
                    <button
                        type="button"
                        className={`settings-pill-btn ${activeSection === 'thresholds' ? 'active' : ''}`}
                        onClick={() => handleSelectSection('thresholds')}
                    >
                        <Clock size={13} /> Thresholds
                    </button>
                    {canManageTeam && (
                        <button
                            type="button"
                            className={`settings-pill-btn ${activeSection === 'invitations' ? 'active' : ''}`}
                            onClick={() => handleSelectSection('invitations')}
                        >
                            <ShieldCheck size={13} /> Team Access
                        </button>
                    )}
                    <button
                        type="button"
                        className={`settings-pill-btn ${activeSection === 'security' ? 'active' : ''}`}
                        onClick={() => handleSelectSection('security')}
                    >
                        <Key size={13} /> Password
                    </button>
                </div>
            </nav>

            <form onSubmit={handleSave}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                    {/* Section 1: General Farm Info, Location & Contacts */}
                    {shouldRender('farm_info') && (
                        <div className="settings-accordion-card">
                            <button
                                type="button"
                                className="settings-accordion-header"
                                onClick={() => toggleSection('farm_info')}
                                aria-expanded={!isCollapsed('farm_info')}
                            >
                                <div className="settings-accordion-title-wrap">
                                    <Building size={20} color="var(--color-primary)" />
                                    <h3 className="settings-accordion-title">
                                        Farm Info, Location &amp; Contacts
                                    </h3>
                                </div>
                                <div className="settings-accordion-meta">
                                    <span className="settings-accordion-badge">{settings.farmName || 'G&S FARMS'}</span>
                                    <img src="/assets/gs_farm_logo_transparent.png" alt="G&S FARMS" style={{ height: '24px', width: 'auto', objectFit: 'contain' }} />
                                    <ChevronDown size={18} className={`settings-chevron-icon ${!isCollapsed('farm_info') ? 'rotated' : ''}`} />
                                </div>
                            </button>

                            {!isCollapsed('farm_info') && (
                                <div className="settings-accordion-body">
                                    {effectiveRole === 'staff' ? (
                                        <div className="settings-role-badge staff" style={{ margin: '0.25rem 0 0.5rem 0', width: '100%' }}>
                                            <Lock size={14} /> Official estate details (Read-only reference for Staff accounts).
                                        </div>
                                    ) : effectiveRole === 'manager' ? (
                                        <div className="settings-role-badge manager" style={{ margin: '0.25rem 0 0.5rem 0', width: '100%' }}>
                                            <UserCheck size={14} /> Manager Edit Mode: Update contact person, operational phones, landmark, and estate location.
                                        </div>
                                    ) : null}

                                    <div className="form-group" style={{ marginTop: '0.25rem' }}>
                                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Building size={14} color="var(--color-primary)" /> Farm Organization Name
                                            {!canEditFarmInfo && <span className="settings-perm-pill staff-view">Staff View</span>}
                                        </label>
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            disabled={!canEditFarmInfo}
                                            value={settings.farmName} 
                                            onChange={e => setSettings({ ...settings, farmName: e.target.value })} 
                                            placeholder="G&S FARMS"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <MapPin size={14} color="#dc2626" /> Physical Location Address (District, Country)
                                            {!canEditFarmInfo && <span className="settings-perm-pill staff-view">Staff View</span>}
                                        </label>
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            disabled={!canEditFarmInfo}
                                            value={settings.farmLocation} 
                                            onChange={e => setSettings({ ...settings, farmLocation: e.target.value })} 
                                            placeholder="Mubende District, Uganda"
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                                                <Globe size={14} color="#0284c7" /> Sub-County / Region
                                                {!canEditFarmInfo && <span className="settings-perm-pill staff-view">Staff View</span>}
                                            </label>
                                            <input 
                                                type="text" 
                                                className="form-input" 
                                                disabled={!canEditFarmInfo}
                                                value={settings.farmRegion || ''} 
                                                onChange={e => setSettings({ ...settings, farmRegion: e.target.value })} 
                                                placeholder="Central Region, Mubende"
                                            />
                                        </div>

                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                                                <Navigation size={14} color="#16a34a" /> Landmark / Gate GPS
                                                {canEditFarmInfo ? (
                                                    <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </label>
                                            <input 
                                                type="text" 
                                                className="form-input" 
                                                disabled={!canEditFarmInfo}
                                                value={settings.farmLandmark || ''} 
                                                onChange={e => setSettings({ ...settings, farmLandmark: e.target.value })} 
                                                placeholder="Main Estate Gate / GPS"
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <User size={14} color="var(--color-primary)" /> Primary Contact Person / Manager
                                            {canEditFarmInfo ? (
                                                <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                            ) : (
                                                <span className="settings-perm-pill staff-view">Staff View</span>
                                            )}
                                        </label>
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            disabled={!canEditFarmInfo}
                                            value={settings.contactPerson || ''} 
                                            onChange={e => setSettings({ ...settings, contactPerson: e.target.value })} 
                                            placeholder="Farm Administrator / Brighton"
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                                                <Phone size={14} color="#16a34a" /> Primary Mobile (SMS &amp; WhatsApp)
                                                {canEditFarmInfo ? (
                                                    <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </label>
                                            <input 
                                                type="text" 
                                                className="form-input" 
                                                disabled={!canEditFarmInfo}
                                                value={settings.contactPhone} 
                                                onChange={e => setSettings({ ...settings, contactPhone: e.target.value })} 
                                                placeholder="+256788945330"
                                            />
                                        </div>

                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                                                <Smartphone size={14} color="#0284c7" /> Secondary / Operations Phone
                                                {canEditFarmInfo ? (
                                                    <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </label>
                                            <input 
                                                type="text" 
                                                className="form-input" 
                                                disabled={!canEditFarmInfo}
                                                value={settings.secondaryPhone || ''} 
                                                onChange={e => setSettings({ ...settings, secondaryPhone: e.target.value })} 
                                                placeholder="+256 700 000000"
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Mail size={14} color="var(--color-primary)" /> Primary Contact Email (System Reports)
                                            {!canEditAllEmails ? (
                                                <span className="settings-perm-pill admin-only">Admin Managed</span>
                                            ) : (
                                                <span className="settings-perm-pill admin-only">Admin Only</span>
                                            )}
                                        </label>
                                        <input 
                                            type="email" 
                                            className="form-input" 
                                            disabled={!canEditAllEmails}
                                            value={settings.contactEmail} 
                                            onChange={e => setSettings({ ...settings, contactEmail: e.target.value })} 
                                            placeholder="gs.farms.ug@gmail.com"
                                        />
                                        {!canEditAllEmails && (
                                            <span style={{ fontSize: '0.74rem', color: 'var(--color-text-light)' }}>
                                                Primary farm entity reporting email is managed by the Administrator.
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Section 2: Notification Routing & Delivery */}
                    {shouldRender('notifications') && (
                        <div className="settings-accordion-card">
                            <button
                                type="button"
                                className="settings-accordion-header"
                                onClick={() => toggleSection('notifications')}
                                aria-expanded={!isCollapsed('notifications')}
                            >
                                <div className="settings-accordion-title-wrap">
                                    <Bell size={20} color="#0284c7" />
                                    <h3 className="settings-accordion-title">
                                        Notification Delivery &amp; Alert Routing
                                    </h3>
                                </div>
                                <div className="settings-accordion-meta">
                                    <span className="settings-accordion-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                                        Automated Notifications Active
                                    </span>
                                    <ChevronDown size={18} className={`settings-chevron-icon ${!isCollapsed('notifications') ? 'rotated' : ''}`} />
                                </div>
                            </button>

                            {!isCollapsed('notifications') && (
                                <div className="settings-accordion-body">
                                    {effectiveRole === 'staff' ? (
                                        <div className="settings-role-badge staff" style={{ margin: '0.25rem 0 0.5rem 0', width: '100%' }}>
                                            <Lock size={14} /> Notification routing and alerts are configured by Administrators and Managers.
                                        </div>
                                    ) : effectiveRole === 'manager' ? (
                                        <div className="settings-role-badge manager" style={{ margin: '0.25rem 0 0.5rem 0', width: '100%' }}>
                                            <UserCheck size={14} /> Manager Alert Routing: Configure your manager email recipient and operational alert subscriptions.
                                        </div>
                                    ) : null}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.25rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.9rem' }}>
                                            <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.enableEmailAlerts} onChange={e => setSettings({ ...settings, enableEmailAlerts: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                                                <Mail size={16} color="var(--color-primary)" /> Enable Automatic Email Notifications
                                                {canEditAlertToggles ? (
                                                    <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </div>
                                        </label>

                                        <div className="form-group" style={{ marginBottom: '0.25rem' }}>
                                            <label className="form-label" style={{ fontSize: '0.85rem' }}>
                                                Primary Recipient Email
                                                {!canEditAllEmails && <span className="settings-perm-pill admin-only">Admin Managed</span>}
                                            </label>
                                            <input 
                                                type="email" 
                                                className="form-input" 
                                                disabled={!canEditAllEmails}
                                                value={settings.contactEmail} 
                                                onChange={e => setSettings({ ...settings, contactEmail: e.target.value })} 
                                                placeholder="gs.farms.ug@gmail.com" 
                                            />
                                        </div>

                                        <div className="form-group" style={{ marginBottom: '0.25rem' }}>
                                            <label className="form-label" style={{ fontSize: '0.85rem' }}>
                                                Additional Admin Emails (Comma-separated)
                                                {!canEditAllEmails && <span className="settings-perm-pill admin-only">Admin Managed</span>}
                                            </label>
                                            <input 
                                                type="text" 
                                                className="form-input" 
                                                disabled={!canEditAllEmails}
                                                value={settings.notificationEmails} 
                                                onChange={e => setSettings({ ...settings, notificationEmails: e.target.value })} 
                                                placeholder="gs.farms.ug@gmail.com, brightonkato317@gmail.com" 
                                            />
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                                                All listed administrator emails will automatically receive operational notifications, alerts, and system summaries.
                                            </span>
                                        </div>

                                        <div className="form-group" style={{ marginBottom: '0.25rem' }}>
                                            <label className="form-label" style={{ fontSize: '0.85rem' }}>
                                                Manager Notification Emails (Comma-separated)
                                                {canEditManagerEmails ? (
                                                    <span className="settings-perm-pill manager-access">Editable by Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </label>
                                            <input 
                                                type="text" 
                                                className="form-input" 
                                                disabled={!canEditManagerEmails}
                                                value={settings.managerNotificationEmails} 
                                                onChange={e => setSettings({ ...settings, managerNotificationEmails: e.target.value })} 
                                                placeholder="manager@gsfarms.farm, supervisor@gsfarms.farm" 
                                            />
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                                                Field and nursery managers who receive attendance exceptions, stock shortages, and operational updates.
                                            </span>
                                        </div>

                                        <div className="form-group" style={{ marginBottom: '0.25rem' }}>
                                            <label className="form-label" style={{ fontSize: '0.85rem' }}>
                                                Estate Timezone (for Attendance Deadlines &amp; Scheduled Monitors)
                                                {!canEditThresholds && <span className="settings-perm-pill staff-view">Staff View</span>}
                                            </label>
                                            <select 
                                                className="form-input"
                                                disabled={!canEditThresholds}
                                                value={settings.timezone}
                                                onChange={e => setSettings({ ...settings, timezone: e.target.value })}
                                            >
                                                <option value="Africa/Kampala">Africa/Kampala (Uganda / East Africa Time UTC+3 - Farm Default)</option>
                                                <option value="Africa/Nairobi">Africa/Nairobi (Kenya / EAT UTC+3)</option>
                                                <option value="Africa/Kigali">Africa/Kigali (Rwanda / CAT UTC+2)</option>
                                                <option value="UTC">UTC (Coordinated Universal Time)</option>
                                            </select>
                                        </div>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                            <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.enableSMSAlerts} onChange={e => setSettings({ ...settings, enableSMSAlerts: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                                                <Smartphone size={16} color="#16a34a" /> Send SMS &amp; Mobile Alerts to {settings.contactPhone}
                                            </div>
                                        </label>
                                    </div>

                                    {/* Active Event-Driven Alert Categories */}
                                    <div style={{ marginTop: '0.5rem', paddingTop: '0.85rem', borderTop: '1px solid var(--color-border)' }}>
                                        <h4 style={{ margin: '0 0 0.65rem 0', fontSize: '0.95rem', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FileText size={16} color="#2563eb" /> Active Event-Driven &amp; Automated Alert Categories
                                            {canEditAlertToggles ? (
                                                <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                            ) : (
                                                <span className="settings-perm-pill staff-view">Staff View</span>
                                            )}
                                        </h4>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyManagerEntry !== false} onChange={e => setSettings({ ...settings, notifyManagerEntry: e.target.checked })} />
                                                <FileText size={14} color="#2563eb" /> <strong>Automatic Manager Entry Alerts:</strong> Notifies Admin on every qualifying manager save
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyNurseryEvents !== false} onChange={e => setSettings({ ...settings, notifyNurseryEvents: e.target.checked })} />
                                                <Sprout size={14} color="#16a34a" /> <strong>Nursery Management:</strong> Batches, Chamber Transitions, Hardening &amp; Loss Reports
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyInventoryEvents !== false} onChange={e => setSettings({ ...settings, notifyInventoryEvents: e.target.checked })} />
                                                <Package size={14} color="#dc2626" /> <strong>Inventory Management:</strong> New Stock Items, Adjustments &amp; Expiry Warnings
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifySalesEvents !== false} onChange={e => setSettings({ ...settings, notifySalesEvents: e.target.checked })} />
                                                <DollarSign size={14} color="#16a34a" /> <strong>Sales &amp; Revenue:</strong> New Invoices, Cash Receipts &amp; Order Cancellations
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyWorkerEvents !== false} onChange={e => setSettings({ ...settings, notifyWorkerEvents: e.target.checked })} />
                                                <FileText size={14} color="#2563eb" /> <strong>Worker Registry:</strong> New Enrolled Workers &amp; Account Deactivations
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyPayrollEvents !== false} onChange={e => setSettings({ ...settings, notifyPayrollEvents: e.target.checked })} />
                                                <DollarSign size={14} color="#ea580c" /> <strong>Payroll &amp; Compensation:</strong> Completed Payroll Runs &amp; Approvals
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyAttendanceDeadlines !== false} onChange={e => setSettings({ ...settings, notifyAttendanceDeadlines: e.target.checked })} />
                                                <Clock size={14} color="#ea580c" /> <strong>Automatic Attendance Monitoring:</strong> Missed Morning Clock-in Cutoff ({settings.attendanceTimeInEnd})
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyEODAttendance} onChange={e => setSettings({ ...settings, notifyEODAttendance: e.target.checked })} />
                                                <Clock size={14} color="#2563eb" /> Daily End of Day (17:00) Attendance Summary
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyPendingOvertime} onChange={e => setSettings({ ...settings, notifyPendingOvertime: e.target.checked })} />
                                                <Clock size={14} color="#ea580c" /> Pending Overtime Approval Alerts
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyLowStock} onChange={e => setSettings({ ...settings, notifyLowStock: e.target.checked })} />
                                                <Package size={14} color="#dc2626" /> Critical Low Stock Threshold Warnings
                                            </label>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: canEditAlertToggles ? 'pointer' : 'default', fontSize: '0.85rem' }}>
                                                <input type="checkbox" disabled={!canEditAlertToggles} checked={settings.notifyChamberOverdue} onChange={e => setSettings({ ...settings, notifyChamberOverdue: e.target.checked })} />
                                                <Sprout size={14} color="#16a34a" /> Humid Chamber Overdue Alerts (&gt; 30 days)
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Section 3: Operational Thresholds */}
                    {shouldRender('thresholds') && (
                        <div className="settings-accordion-card">
                            <button
                                type="button"
                                className="settings-accordion-header"
                                onClick={() => toggleSection('thresholds')}
                                aria-expanded={!isCollapsed('thresholds')}
                            >
                                <div className="settings-accordion-title-wrap">
                                    <Clock size={20} color="#ea580c" />
                                    <h3 className="settings-accordion-title">
                                        Operational &amp; Attendance Thresholds
                                    </h3>
                                </div>
                                <div className="settings-accordion-meta">
                                    <span className="settings-accordion-badge">Cutoff {settings.attendanceTimeInEnd}</span>
                                    <ChevronDown size={18} className={`settings-chevron-icon ${!isCollapsed('thresholds') ? 'rotated' : ''}`} />
                                </div>
                            </button>

                            {!isCollapsed('thresholds') && (
                                <div className="settings-accordion-body">
                                    {effectiveRole === 'staff' ? (
                                        <div className="settings-role-badge staff" style={{ margin: '0.25rem 0 0.5rem 0', width: '100%' }}>
                                            <Lock size={14} /> Official estate attendance schedule &amp; shift cutoffs (Read-only reference for Staff accounts).
                                        </div>
                                    ) : effectiveRole === 'manager' ? (
                                        <div className="settings-role-badge manager" style={{ margin: '0.25rem 0 0.5rem 0', width: '100%' }}>
                                            <UserCheck size={14} /> Manager Shift Mode: Configure attendance scan windows and morning arrival cutoffs.
                                        </div>
                                    ) : null}

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.25rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Time-In Window Starts
                                                {canEditThresholds ? (
                                                    <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </label>
                                            <input 
                                                type="time" 
                                                required 
                                                className="form-input" 
                                                disabled={!canEditThresholds}
                                                value={settings.attendanceTimeInStart} 
                                                onChange={e => setSettings({ ...settings, attendanceTimeInStart: e.target.value })} 
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Time-In Window Ends (Morning Cutoff)
                                                {canEditThresholds ? (
                                                    <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </label>
                                            <input 
                                                type="time" 
                                                required 
                                                className="form-input" 
                                                disabled={!canEditThresholds}
                                                value={settings.attendanceTimeInEnd} 
                                                onChange={e => setSettings({ ...settings, attendanceTimeInEnd: e.target.value })} 
                                            />
                                        </div>
                                    </div>
                                    <small style={{ color: 'var(--color-text-light)', marginTop: '-0.5rem' }}>Scans after the morning time-in cutoff trigger automatic missed/late attendance notifications.</small>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Time-Out Window Starts
                                                {canEditThresholds ? (
                                                    <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </label>
                                            <input 
                                                type="time" 
                                                required 
                                                className="form-input" 
                                                disabled={!canEditThresholds}
                                                value={settings.attendanceTimeOutStart} 
                                                onChange={e => setSettings({ ...settings, attendanceTimeOutStart: e.target.value })} 
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Time-Out Window Ends
                                                {canEditThresholds ? (
                                                    <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                                ) : (
                                                    <span className="settings-perm-pill staff-view">Staff View</span>
                                                )}
                                            </label>
                                            <input 
                                                type="time" 
                                                required 
                                                className="form-input" 
                                                disabled={!canEditThresholds}
                                                value={settings.attendanceTimeOutEnd} 
                                                onChange={e => setSettings({ ...settings, attendanceTimeOutEnd: e.target.value })} 
                                            />
                                        </div>
                                    </div>
                                    <small style={{ color: 'var(--color-text-light)', marginTop: '-0.5rem' }}>Scans after the time-out window ends are recorded as overtime.</small>

                                    <div className="form-group">
                                        <label className="form-label">
                                            Scanner Anti-Duplication Lock (Hours)
                                            {canEditThresholds ? (
                                                <span className="settings-perm-pill manager-access">Manager &amp; Admin</span>
                                            ) : (
                                                <span className="settings-perm-pill staff-view">Staff View</span>
                                            )}
                                        </label>
                                        <input 
                                            type="number" 
                                            min="0" 
                                            step="0.25" 
                                            className="form-input" 
                                            disabled={!canEditThresholds}
                                            value={settings.attendanceLockoutHours} 
                                            onChange={e => setSettings({ ...settings, attendanceLockoutHours: e.target.value })} 
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Section 4: Security and Cloud Sync (Team Access & Admin Invitations - Admin Only) */}
                    {canManageTeam && shouldRender('invitations') && (
                        <div className="settings-accordion-card" style={{ borderLeft: '4px solid #16a34a' }}>
                            <button
                                type="button"
                                className="settings-accordion-header"
                                onClick={() => toggleSection('invitations')}
                                aria-expanded={!isCollapsed('invitations')}
                            >
                                <div className="settings-accordion-title-wrap">
                                    <Users size={20} color="#16a34a" />
                                    <h3 className="settings-accordion-title">
                                        Team Access &amp; Staff Account Management
                                    </h3>
                                </div>
                                <div className="settings-accordion-meta">
                                    <span className="settings-accordion-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                                        Administrator Control
                                    </span>
                                    <ChevronDown size={18} className={`settings-chevron-icon ${!isCollapsed('invitations') ? 'rotated' : ''}`} />
                                </div>
                            </button>

                            {!isCollapsed('invitations') && (
                                <div className="settings-accordion-body" style={{ padding: '0.5rem 1rem 1rem 1rem' }}>
                                    <AdminInvitations />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Section 5: Change Account Password & Security */}
                    {shouldRender('security') && (
                        <div className="settings-accordion-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                            <button
                                type="button"
                                className="settings-accordion-header"
                                onClick={() => toggleSection('security')}
                                aria-expanded={!isCollapsed('security')}
                            >
                                <div className="settings-accordion-title-wrap">
                                    <Key size={20} color="#d97706" />
                                    <h3 className="settings-accordion-title">
                                        Account Password &amp; Security
                                    </h3>
                                </div>
                                <div className="settings-accordion-meta">
                                    <span className="settings-accordion-badge">
                                        {effectiveRole === 'admin' ? 'Administrator' : effectiveRole === 'manager' ? 'Estate Manager' : 'Staff Member'}
                                    </span>
                                    <ChevronDown size={18} className={`settings-chevron-icon ${!isCollapsed('security') ? 'rotated' : ''}`} />
                                </div>
                            </button>

                            {!isCollapsed('security') && (
                                <div className="settings-accordion-body">
                                    <p style={{ color: 'var(--color-text-light)', margin: 0, fontSize: '0.85rem' }}>
                                        Signed in as <strong>{auth.currentUser?.email || 'gs.farms.ug@gmail.com'}</strong> ({effectiveRole.toUpperCase()}). You can update your login password at any time.
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
                            )}
                        </div>
                    )}

                </div>

                {/* Sticky / Floating Save Bar */}
                <div className="settings-save-bar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        {canSaveFarmSettings ? (
                            <button 
                                type="submit" 
                                className="btn btn-primary" 
                                disabled={isSaving}
                                style={{ padding: '0.6rem 1.6rem', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
                            >
                                <Save size={17} /> {isSaving ? 'Saving Configurations...' : effectiveRole === 'manager' ? 'Save Operational Settings' : 'Save All Configurations'}
                            </button>
                        ) : (
                            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                                <User size={15} color="#64748b" /> Staff Account: General farm parameters are managed by Admin &amp; Manager. You can update your login password above.
                            </div>
                        )}

                        {isSaving && (
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <RefreshCw size={13} className="spin" /> Syncing across devices...
                            </span>
                        )}
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
                        Viewing: <strong>{activeSection === 'all' ? 'All Sections' : activeSection === 'farm_info' ? 'Farm Info & Contacts' : activeSection === 'notifications' ? 'Notifications' : activeSection === 'thresholds' ? 'Operational Thresholds' : activeSection === 'invitations' ? 'Team Access' : 'Account Password'}</strong> ({effectiveRole.toUpperCase()})
                    </div>
                </div>
            </form>
        </div>
    );
};

export default Settings;

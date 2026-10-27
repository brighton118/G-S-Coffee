import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { LayoutDashboard, Users, ScanLine, Sprout, ShoppingCart, BarChart3, Bell, ScrollText, Settings, X, Banknote, CalendarDays, ChevronDown, ChevronRight, LogOut, RefreshCw } from 'lucide-react';
import { useUserRole } from '../context/UserRoleContext';
import { firestoreSyncService, type SyncStatus } from '../services/firestoreSync';
import './Sidebar.css';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (val: boolean) => void;
    adminEmail: string;
    onSignOut: () => void;
}

const Sidebar = ({ isOpen, setIsOpen, adminEmail, onSignOut }: SidebarProps) => {
    const { role } = useUserRole();
    const [isAttendanceExpanded, setIsAttendanceExpanded] = useState(false);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>({
        isOnline: navigator.onLine,
        isSyncing: false,
        lastSyncedAt: null,
        error: null
    });
    const location = useLocation();
    const handleClose = () => setIsOpen(false);
    const isAttendanceSectionActive = location.pathname === '/attendance' || location.pathname === '/scan';

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, setIsOpen]);

    useEffect(() => {
        const unsubscribe = firestoreSyncService.subscribeStatus(setSyncStatus);
        return () => unsubscribe();
    }, []);

    const handleSyncNow = async () => {
        await firestoreSyncService.syncNow();
    };

    const unreadCount = useLiveQuery(async () => {
        const unread = await db.notifications.filter(n => !n.read).toArray();
        return unread.length;
    }) || 0;

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.9rem 1rem 0.9rem 1.15rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img 
                        src="/assets/gs_farm_logo_transparent.png" 
                        alt="G&S FARMS" 
                        style={{ height: '36px', width: 'auto', objectFit: 'contain' }} 
                    />
                </div>
                <button className="sidebar-close-btn" onClick={handleClose} title="Close menu" aria-label="Close menu">
                    <X size={22} />
                </button>
            </div>
            <nav className="sidebar-nav">
                <NavLink to="/" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                    <LayoutDashboard size={20} /> Dashboard
                </NavLink>
                <NavLink to="/clones" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Sprout size={20} /> Coffee Clones
                </NavLink>
                <NavLink to="/workers" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Users size={20} /> Workers
                </NavLink>
                <button
                    type="button"
                    className={`nav-item attendance-toggle ${isAttendanceSectionActive ? 'active' : ''}`}
                    aria-expanded={isAttendanceExpanded}
                    aria-controls="attendance-subnav"
                    onClick={() => setIsAttendanceExpanded(expanded => !expanded)}
                >
                    <CalendarDays size={20} />
                    <span>Attendance</span>
                    {isAttendanceExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {isAttendanceExpanded && (
                    <div className="attendance-subnav" id="attendance-subnav">
                        <NavLink to="/attendance" onClick={handleClose} className={({ isActive }) => `nav-item attendance-subnav-item ${isActive ? 'active' : ''}`}>
                            <CalendarDays size={18} /> Attendance Records
                        </NavLink>
                        <NavLink to="/scan" onClick={handleClose} className={({ isActive }) => `nav-item attendance-subnav-item ${isActive ? 'active' : ''}`}>
                            <ScanLine size={18} /> Scan
                        </NavLink>
                    </div>
                )}
                <NavLink to="/inventory" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ShoppingCart size={20} /> Inventory
                </NavLink>
                <NavLink to="/sales" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <BarChart3 size={20} /> Sales
                </NavLink>
                <NavLink to="/payroll" onClick={handleClose} className={({ isActive }) => `nav-item payroll-nav-item ${isActive ? 'active' : ''}`}>
                    <Banknote size={20} /> Payroll
                </NavLink>
                <NavLink to="/reports" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ScrollText size={20} /> Reports
                </NavLink>
                <NavLink to="/notifications" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center' }}>
                    <Bell size={20} /> 
                    <span style={{ flex: 1 }}>Notifications</span>
                    {unreadCount > 0 && (
                        <span className="badge badge-warning" style={{ borderRadius: '12px', fontSize: '0.7rem', padding: '0.15rem 0.45rem', fontWeight: 700 }}>
                            {unreadCount}
                        </span>
                    )}
                </NavLink>
                <NavLink to="/settings" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Settings size={20} /> Settings
                </NavLink>
            </nav>
            <div className="sidebar-account">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                        <img src="/favicon.png" alt="Profile" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
                    </div>
                    <div className="sidebar-account-email" style={{ marginBottom: 0 }} title={adminEmail}>{adminEmail}</div>
                </div>
                <div className="sidebar-role-badge-wrap">
                    <span className={`sidebar-role-badge role-${role}`}>
                        {role === 'admin' ? '👑 Admin (Full Access)' : role === 'manager' ? '💼 Manager (Operations)' : '👁️ Staff (View Only)'}
                    </span>
                </div>
                <div style={{ padding: '0.5rem 0.65rem', margin: '0.4rem 0', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.06)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: syncStatus.isOnline ? '#4ade80' : '#f87171' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: syncStatus.isOnline ? '#4ade80' : '#f87171', display: 'inline-block' }} />
                        {syncStatus.isSyncing ? 'Syncing...' : syncStatus.isOnline ? 'Cloud Live' : 'Offline'}
                    </span>
                    <button
                        type="button"
                        onClick={handleSyncNow}
                        disabled={syncStatus.isSyncing}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: '#e2e8f0',
                            borderRadius: '4px',
                            padding: '0.18rem 0.45rem',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <RefreshCw size={11} className={syncStatus.isSyncing ? 'spin' : ''} />
                        Sync Data
                    </button>
                </div>

                <button type="button" className="nav-item sidebar-sign-out" onClick={() => { handleClose(); onSignOut(); }}>
                    <LogOut size={19} /> Sign out
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;

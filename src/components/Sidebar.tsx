import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { LayoutDashboard, Users, ScanLine, Sprout, ShoppingCart, BarChart3, Bell, ScrollText, Settings, X, Banknote, CalendarDays, ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (val: boolean) => void;
    adminEmail: string;
    onSignOut: () => void;
}

const Sidebar = ({ isOpen, setIsOpen, adminEmail, onSignOut }: SidebarProps) => {
    const [isAttendanceExpanded, setIsAttendanceExpanded] = useState(false);
    const location = useLocation();
    const handleClose = () => setIsOpen(false);
    const isAttendanceSectionActive = location.pathname === '/attendance' || location.pathname === '/scan';

    const unreadCount = useLiveQuery(async () => {
        const unread = await db.notifications.filter(n => !n.read).toArray();
        return unread.length;
    }) || 0;

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>G&S COOFFEE Farm</h2>
                <button className="mobile-close-btn" onClick={handleClose}>
                    <X size={24} />
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
                <div className="sidebar-account-email" title={adminEmail}>{adminEmail}</div>
                <button type="button" className="nav-item sidebar-sign-out" onClick={() => { handleClose(); onSignOut(); }}>
                    <LogOut size={19} /> Sign out
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;

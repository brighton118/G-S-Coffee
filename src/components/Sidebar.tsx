import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ScanLine, Sprout, ShoppingCart, BarChart3, Bell, ScrollText, Settings, X, Banknote, CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (val: boolean) => void;
}

const Sidebar = ({ isOpen, setIsOpen }: SidebarProps) => {
    const [isAttendanceExpanded, setIsAttendanceExpanded] = useState(false);
    const location = useLocation();
    const handleClose = () => setIsOpen(false);
    const isAttendanceSectionActive = location.pathname === '/attendance' || location.pathname === '/scan';

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>G$S Coffee Farm</h2>
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
                <NavLink to="/notifications" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Bell size={20} /> Notifications
                </NavLink>
                <NavLink to="/settings" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Settings size={20} /> Settings
                </NavLink>
            </nav>
        </aside>
    );
};

export default Sidebar;

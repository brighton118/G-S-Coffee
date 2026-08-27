import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ScanLine, Sprout, ShoppingCart, BarChart3, Bell, ScrollText, Settings, X } from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (val: boolean) => void;
}

const Sidebar = ({ isOpen, setIsOpen }: SidebarProps) => {
    const handleClose = () => setIsOpen(false);

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
                <NavLink to="/scan" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ScanLine size={20} /> Scan
                </NavLink>
                <NavLink to="/inventory" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ShoppingCart size={20} /> Inventory
                </NavLink>
                <NavLink to="/sales" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <BarChart3 size={20} /> Sales
                </NavLink>
                <NavLink to="/reports" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ScrollText size={20} /> Reports
                </NavLink>
                <NavLink to="/notifications" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Bell size={20} /> Notifications
                </NavLink>
                <NavLink to="/activity" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ScrollText size={20} /> Activity Logs
                </NavLink>
                <NavLink to="/settings" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Settings size={20} /> Settings
                </NavLink>
            </nav>
        </aside>
    );
};

export default Sidebar;

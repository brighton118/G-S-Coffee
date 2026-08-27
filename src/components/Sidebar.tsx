import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ScanLine, Sprout, ShoppingCart, BarChart3, Bell, ScrollText, Settings } from 'lucide-react';
import './Sidebar.css';

const Sidebar = () => {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <h2>G$S Coffee Farm</h2>
            </div>
            <nav className="sidebar-nav">
                <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                    <LayoutDashboard size={20} /> Dashboard
                </NavLink>
                <NavLink to="/clones" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Sprout size={20} /> Coffee Clones
                </NavLink>
                <NavLink to="/workers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Users size={20} /> Workers
                </NavLink>
                <NavLink to="/scan" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ScanLine size={20} /> Scan
                </NavLink>
                <NavLink to="/inventory" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ShoppingCart size={20} /> Inventory
                </NavLink>
                <NavLink to="/sales" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <BarChart3 size={20} /> Sales
                </NavLink>
                <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ScrollText size={20} /> Reports
                </NavLink>
                <NavLink to="/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Bell size={20} /> Notifications
                </NavLink>
                <NavLink to="/activity" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ScrollText size={20} /> Activity Logs
                </NavLink>
                <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Settings size={20} /> Settings
                </NavLink>
            </nav>
        </aside>
    );
};

export default Sidebar;

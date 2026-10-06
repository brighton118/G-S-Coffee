import { NavLink, useLocation } from 'react-router-dom';
import { 
    LayoutDashboard, 
    Users, 
    ScanLine, 
    Sprout, 
    ShoppingCart, 
    BarChart3, 
    Bell, 
    ScrollText, 
    Settings, 
    X,
    Calendar,
    Clock,
    Banknote,
    DollarSign
} from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (val: boolean) => void;
}

const Sidebar = ({ isOpen, setIsOpen }: SidebarProps) => {
    const handleClose = () => setIsOpen(false);
    const location = useLocation();
    const isPayrollSection = location.pathname.startsWith('/payroll') || location.pathname.startsWith('/overtime');

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
                <NavLink to="/attendance" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Calendar size={20} /> Attendance
                </NavLink>

                {/* Payroll Section & Subsections */}
                <div className="nav-group">
                    <NavLink 
                        to="/payroll" 
                        onClick={handleClose} 
                        className={`nav-item ${isPayrollSection ? 'active' : ''}`}
                    >
                        <Banknote size={20} /> Payroll
                    </NavLink>
                    <div className="nav-subitems">
                        <NavLink 
                            to="/payroll" 
                            onClick={handleClose} 
                            className={({ isActive }) => `nav-subitem ${isActive ? 'active' : ''}`}
                            end
                        >
                            <DollarSign size={15} /> Worker Payments
                        </NavLink>
                        <NavLink 
                            to="/overtime" 
                            onClick={handleClose} 
                            className={({ isActive }) => `nav-subitem ${isActive ? 'active' : ''}`}
                        >
                            <Clock size={15} /> Overtime Tracking
                        </NavLink>
                    </div>
                </div>

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
                <NavLink to="/settings" onClick={handleClose} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Settings size={20} /> Settings
                </NavLink>
            </nav>
        </aside>
    );
};

export default Sidebar;


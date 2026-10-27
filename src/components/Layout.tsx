import { ReactNode, useState } from 'react';
import Sidebar from './Sidebar.tsx';
import { Menu } from 'lucide-react';
import './MobileLayout.css';

interface LayoutProps {
    children: ReactNode;
    adminEmail: string;
    onSignOut: () => void;
}

const Layout = ({ children, adminEmail, onSignOut }: LayoutProps) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="app-container">
            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} adminEmail={adminEmail} onSignOut={onSignOut} />
            {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

            <main className="main-content">
                <header className="app-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <button 
                            type="button" 
                            className="menu-toggle-btn" 
                            onClick={() => setIsSidebarOpen(true)}
                            title="Open Menu"
                            aria-label="Open Menu"
                        >
                            <Menu size={20} />
                            <span>Menu</span>
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <img src="/assets/gs_farm_logo_transparent.png" alt="G&S FARMS" style={{ height: '34px', width: 'auto', objectFit: 'contain' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="farm-tagline" style={{ fontSize: '0.82rem', color: 'var(--color-text-light)', fontWeight: 500 }}>
                            Farm Operations Workspace
                        </span>
                    </div>
                </header>

                <div className="page-container">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;

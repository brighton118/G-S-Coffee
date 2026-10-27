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
                <header className="mobile-header">
                    <button className="btn btn-secondary mobile-menu-btn" style={{ padding: '0.25rem', border: 'none', background: 'transparent' }} onClick={() => setIsSidebarOpen(true)}>
                        <Menu size={28} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img src="/assets/gs_farm_logo_transparent.png" alt="G&S FARMS" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
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

import { ReactNode, useState } from 'react';
import Sidebar from './Sidebar.tsx';
import { Menu } from 'lucide-react';
import './MobileLayout.css';

interface LayoutProps {
    children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="app-container">
            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
            {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

            <main className="main-content">
                <header className="mobile-header">
                    <button className="btn btn-secondary mobile-menu-btn" style={{ padding: '0.25rem', border: 'none', background: 'transparent' }} onClick={() => setIsSidebarOpen(true)}>
                        <Menu size={28} />
                    </button>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-primary-dark)' }}>G$S Coffee Farm</h2>
                </header>

                <div className="page-container">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;

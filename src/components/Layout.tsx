import React, { ReactNode } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
    children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    return (
        <div className="app-container">
            <Sidebar />
            <main className="main-content">
                {/* Optional header could go here, if not just let children render */}
                <div className="page-container">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;

import React from 'react';
import { ScrollText, Download } from 'lucide-react';

// Normally here we would utilize recharts and heavy data aggregation.
const Reports = () => {
    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>System Reports</h1>
                    <p className="text-light">Generate insights for Production, Attendance, and Sales.</p>
                </div>
                <button className="btn btn-secondary"><Download size={18} /> Export PDF</button>
            </div>

            <div className="cards-grid">
                <div className="card stat-card" style={{ cursor: 'pointer' }}>
                    <span className="stat-label">Production Report</span>
                    <span className="stat-value text-success">View Details</span>
                </div>
                <div className="card stat-card" style={{ cursor: 'pointer' }}>
                    <span className="stat-label">Attendance Report</span>
                    <span className="stat-value text-info">View Details</span>
                </div>
                <div className="card stat-card" style={{ cursor: 'pointer' }}>
                    <span className="stat-label">Inventory Report</span>
                    <span className="stat-value text-warning">View Details</span>
                </div>
                <div className="card stat-card" style={{ cursor: 'pointer' }}>
                    <span className="stat-label">Sales Report</span>
                    <span className="stat-value text-primary">View Details</span>
                </div>
            </div>
        </div>
    );
};

export default Reports;

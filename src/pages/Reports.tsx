import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ScrollText, Download, X, Printer } from 'lucide-react';
import { format } from 'date-fns';

const Reports = () => {
    const [activeReport, setActiveReport] = useState<string | null>(null);

    // Queries
    const workers = useLiveQuery(() => db.workers.toArray()) || [];
    const attendance = useLiveQuery(() => db.attendance.toArray()) || [];
    const inventory = useLiveQuery(() => db.inventoryItems.toArray()) || [];
    const sales = useLiveQuery(() => db.plantletSales.toArray()) || [];

    const todayDateStr = format(new Date(), 'yyyy-MM-dd');
    const todayAttendance = attendance.filter(a => a.date === todayDateStr);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <style>
                {`
                @media print {
                    .hide-on-print, .sidebar { display: none !important; }
                    .report-container { border: none !important; margin: 0 !important; width: 100% !important; }
                    body { background: white !important; }
                }
                `}
            </style>
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="hide-on-print">
                    <h1>System Reports</h1>
                    <p className="text-light">Generate insights for Production, Attendance, and Sales.</p>
                </div>
                <div className="hide-on-print">
                    <button className="btn btn-primary" onClick={handlePrint}><Download size={18} /> Export PDF / Print</button>
                </div>
            </div>

            <div className="cards-grid hide-on-print">
                <div className="card stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveReport('attendance')}>
                    <span className="stat-label">Daily Attendance Report</span>
                    <span className="stat-value text-info">View Details</span>
                </div>
                <div className="card stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveReport('inventory')}>
                    <span className="stat-label">Live Inventory Report</span>
                    <span className="stat-value text-warning">View Details</span>
                </div>
                <div className="card stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveReport('sales')}>
                    <span className="stat-label">Historical Sales Report</span>
                    <span className="stat-value text-primary">View Details</span>
                </div>
            </div>

            {/* Print Friendly Report Section */}
            {activeReport && (
                <div className="card report-container" style={{ background: '#fff', border: '1px solid #ddd', minHeight: '500px' }}>
                    <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                        <h2 style={{ margin: 0, color: 'var(--color-primary-dark)' }}>
                            {activeReport === 'attendance' && 'Daily Attendance Logs'}
                            {activeReport === 'inventory' && 'Universal Stock Inventory'}
                            {activeReport === 'sales' && 'G$S Financial Sales Record'}
                        </h2>
                        <button className="btn btn-secondary btn-sm" onClick={() => setActiveReport(null)}><X size={16} /> Close Report</button>
                    </div>

                    <div className="print-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h1 style={{ letterSpacing: '2px', margin: '0 0 0.5rem 0' }}>G$S COFFEE FARM</h1>
                        <h3 style={{ textTransform: 'uppercase', margin: 0, color: '#555' }}>
                            {activeReport === 'attendance' && `Daily Attendance Report | ${todayDateStr}`}
                            {activeReport === 'inventory' && `Active Inventory Report | ${todayDateStr}`}
                            {activeReport === 'sales' && `Sales Revenue Report | All Time`}
                        </h3>
                    </div>

                    {activeReport === 'attendance' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #333' }}>
                                    <th style={{ padding: '0.75rem 0' }}>Worker ID</th>
                                    <th>Name</th>
                                    <th>Department</th>
                                    <th>Time In</th>
                                    <th>Time Out</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workers.map(w => {
                                    const rec = todayAttendance.find(a => a.workerId === w.workerId);
                                    return (
                                        <tr key={w.workerId} style={{ borderBottom: '1px solid #ddd' }}>
                                            <td style={{ padding: '0.75rem 0' }}>{w.workerId}</td>
                                            <td>{w.fullName}</td>
                                            <td>{w.department}</td>
                                            <td>{rec ? rec.timeIn : '—'}</td>
                                            <td>{rec?.timeOut ? rec.timeOut : '—'}</td>
                                            <td><strong>{rec ? rec.status : 'Absent'}</strong></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {activeReport === 'inventory' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #333' }}>
                                    <th style={{ padding: '0.75rem 0' }}>Item ID</th>
                                    <th>Asset Name</th>
                                    <th>Remaining Stock</th>
                                    <th>Status Threshold</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventory.map(i => (
                                    <tr key={i.inventoryId} style={{ borderBottom: '1px solid #ddd' }}>
                                        <td style={{ padding: '0.75rem 0' }}>{i.inventoryId}</td>
                                        <td>{i.name}</td>
                                        <td>{i.quantity} {i.unit}</td>
                                        <td>{i.quantity === 0 ? 'Depleted' : (i.quantity <= i.minStockLevel ? 'Low Stock' : 'Sufficient')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeReport === 'sales' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #333' }}>
                                    <th style={{ padding: '0.75rem 0' }}>Date</th>
                                    <th>Batch Ref</th>
                                    <th>Customer ID</th>
                                    <th>Quantity</th>
                                    <th>Total Yield Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map(s => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}>
                                        <td style={{ padding: '0.75rem 0' }}>{format(new Date(s.date), 'MM/dd/yyyy')}</td>
                                        <td>{s.batchId}</td>
                                        <td>{s.customer}</td>
                                        <td>{s.quantitySold} units</td>
                                        <td>${(s.quantitySold * s.pricePerPlantlet).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};

export default Reports;


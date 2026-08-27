import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { format } from 'date-fns';
import { Users, Sprout, ShoppingCart, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import './Dashboard.css';

const Dashboard = () => {
    const todayDateStr = format(new Date(), 'yyyy-MM-dd');

    // Queries
    const cloneBatches = useLiveQuery(() => db.cloneBatches.toArray()) || [];
    const workers = useLiveQuery(() => db.workers.toArray()) || [];
    const attendances = useLiveQuery(() => db.attendance.where('date').equals(todayDateStr).toArray()) || [];
    const inventory = useLiveQuery(() => db.inventoryItems.toArray()) || [];

    // Derived Clone Stats
    const activeBatches = cloneBatches.filter(b => b.currentStage !== 'Sorted');
    const totalCuttings = cloneBatches.reduce((acc, curr) => acc + curr.originalQuantity, 0);
    const humidChamber = cloneBatches.filter(b => b.currentStage === 'Humid Chamber').reduce((acc, curr) => acc + curr.currentQuantity, 0);
    const hardening = cloneBatches.filter(b => b.currentStage === 'Hardening').reduce((acc, curr) => acc + curr.currentQuantity, 0);

    // Workforce Stats
    const totalWorkers = workers.length;
    const presentToday = attendances.filter(a => a.status === 'Present' || a.status === 'Late').length;
    const absentToday = attendances.filter(a => a.status === 'Absent').length;
    const lateWorkers = attendances.filter(a => a.isLate).length;
    const attendancePercentage = totalWorkers > 0 ? ((presentToday / totalWorkers) * 100).toFixed(1) : '0.0';

    // Inventory Stats
    const totalItems = inventory.length;
    const lowStockItems = inventory.filter(i => i.quantity <= i.minStockLevel && i.quantity > 0).length;
    const outOfStockItems = inventory.filter(i => i.quantity === 0).length;

    return (
        <div className="dashboard-wrapper">
            <div className="dashboard-header">
                <h1>Dashboard</h1>
                <p className="text-light">{format(new Date(), 'EEEE, MMMM do yyyy')}</p>
            </div>

            <section className="dashboard-section">
                <h2><Sprout size={20} /> Coffee Production</h2>
                <div className="cards-grid">
                    <div className="card stat-card">
                        <span className="stat-label">Active Clone Batches</span>
                        <span className="stat-value">{activeBatches.length}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Total Cuttings Obtained</span>
                        <span className="stat-value">{totalCuttings}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Humid Chamber (Qty)</span>
                        <span className="stat-value text-info">{humidChamber}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Hardening (Qty)</span>
                        <span className="stat-value text-warning">{hardening}</span>
                    </div>
                </div>
            </section>

            <section className="dashboard-section">
                <h2><Users size={20} /> Workforce & Attendance</h2>
                <div className="cards-grid">
                    <div className="card stat-card">
                        <span className="stat-label">Total Workers</span>
                        <span className="stat-value">{totalWorkers}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Present Today</span>
                        <span className="stat-value text-success">{presentToday}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Absent Today</span>
                        <span className="stat-value text-danger">{absentToday}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Late Workers</span>
                        <span className="stat-value text-warning">{lateWorkers}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Attendance Rate</span>
                        <span className="stat-value">{attendancePercentage}%</span>
                    </div>
                </div>
            </section>

            <section className="dashboard-section">
                <h2><ShoppingCart size={20} /> Inventory Alerts</h2>
                <div className="cards-grid">
                    <div className="card stat-card">
                        <span className="stat-label">Total Item Types</span>
                        <span className="stat-value">{totalItems}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Low Stock</span>
                        <span className="stat-value text-warning">{lowStockItems}</span>
                    </div>
                    <div className="card stat-card">
                        <span className="stat-label">Out of Stock</span>
                        <span className="stat-value text-danger">{outOfStockItems}</span>
                    </div>
                </div>
            </section>

            {/* Charts would be integrated here using recharts */}
            <section className="dashboard-section">
                <h2><TrendingUp size={20} /> Analytics Hub</h2>
                <div className="charts-placeholder card">
                    <p>Charts module loading...</p>
                </div>
            </section>

        </div>
    );
};

export default Dashboard;

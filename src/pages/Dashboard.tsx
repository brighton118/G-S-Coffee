import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
    Users,
    Sprout,
    ShoppingCart,
    AlertTriangle,
    TrendingUp,
    Clock,
    DollarSign,
    Package,
    QrCode,
    FileText,
    ArrowRight
} from 'lucide-react';
import './Dashboard.css';

const Dashboard = () => {
    const todayDateStr = format(new Date(), 'yyyy-MM-dd');

    // Queries
    const workers = useLiveQuery(() => db.workers.toArray()) || [];
    const activeWorkers = workers.filter(w => w.status === 'Active');
    const todayAttendance = useLiveQuery(() => db.attendance.where('date').equals(todayDateStr).toArray()) || [];
    const allAttendance = useLiveQuery(() => db.attendance.toArray()) || [];
    const cloneBatches = useLiveQuery(() => db.cloneBatches.toArray()) || [];
    const humidChambers = useLiveQuery(() => db.productionHumidChamber.toArray()) || [];
    const sortings = useLiveQuery(() => db.productionSortings.toArray()) || [];
    const inventory = useLiveQuery(() => db.inventoryItems.toArray()) || [];
    const sales = useLiveQuery(() => db.salesOrders.toArray()) || [];
    const notifications = useLiveQuery(() => db.notifications.where('read').equals(0).toArray()) || [];

    // Workforce & Attendance Stats
    const totalWorkersCount = activeWorkers.length;
    const presentToday = todayAttendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
    const absentToday = totalWorkersCount > presentToday ? totalWorkersCount - presentToday : 0;
    const attendancePercentage = totalWorkersCount > 0 ? ((presentToday / totalWorkersCount) * 100).toFixed(1) : '0.0';

    // Overtime Stats
    const pendingOvertimeRecords = allAttendance.filter(a => a.overtimeStatus === 'Pending');
    const pendingOvertimeHours = pendingOvertimeRecords.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0);

    // Production 5-Stage Pipeline Stats
    const cuttingsBatches = cloneBatches.filter(b => b.currentStage === 'Cutting');
    const humidChamberBatches = cloneBatches.filter(b => b.currentStage === 'Humid Chamber');
    const firstHardeningBatches = cloneBatches.filter(b => b.currentStage === 'First Hardening');
    const secondHardeningBatches = cloneBatches.filter(b => b.currentStage === 'Second Hardening');

    const totalCuttingsQty = cloneBatches.reduce((acc, curr) => acc + curr.originalQuantity, 0);
    const humidChamberQty = humidChamberBatches.reduce((acc, curr) => acc + curr.currentQuantity, 0);
    const firstHardeningQty = firstHardeningBatches.reduce((acc, curr) => acc + curr.currentQuantity, 0);
    const secondHardeningQty = secondHardeningBatches.reduce((acc, curr) => acc + curr.currentQuantity, 0);

    // Overdue Humid Chamber check
    const overdueChamberBatches = humidChambers.filter(h => h.status === 'Overdue' || (h.status === 'In Chamber' && (h.targetExitDate || h.expectedCompletionDate || '') < todayDateStr));

    // Validated Commercial Stock available for sale
    const totalSortedForSale = sortings.reduce((acc, curr) => acc + (curr.readyForSale || curr.forSaleQuantity || 0), 0);
    const totalSoldDeducted = sales.filter(s => s.stockDeducted).reduce((acc, curr) => acc + (curr.quantityOrdered || curr.quantity || 0), 0);
    const liveAvailableClones = Math.max(0, totalSortedForSale - totalSoldDeducted);
    const liveClonesValuation = liveAvailableClones * 2500; // Standard UGX 2,500

    // Inventory Stats & Valuation
    const activeInventory = inventory.filter(i => i.status !== 'Archived');
    const totalInventoryValuation = activeInventory.reduce((acc, curr) => acc + (curr.quantity * curr.purchasePrice), 0);
    const lowStockItems = activeInventory.filter(i => i.quantity <= i.minStockLevel && i.quantity > 0);

    // Sales Financials
    const totalSalesRevenue = sales.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0);
    const totalOutstandingReceivables = sales.reduce((acc, curr) => acc + (curr.balanceDue || curr.outstandingBalance || 0), 0);

    return (
        <div className="dashboard-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Header */}
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.75rem' }}>G&S Coffee Farm Management System</h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        {format(new Date(), 'EEEE, MMMM do, yyyy')} • Enterprise Farm & Nursery Operations
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <Link to="/scan" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <QrCode size={18} /> Clock-In / Scan Attendance
                    </Link>
                    <Link to="/clones" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sprout size={18} /> New Clone Batch
                    </Link>
                </div>
            </div>

            {/* Alert Banner if any overdue humid chambers or low stock */}
            {(overdueChamberBatches.length > 0 || lowStockItems.length > 0 || notifications.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {overdueChamberBatches.length > 0 && (
                        <div className="card" style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b91c1c' }}>
                                <AlertTriangle size={18} />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                    {overdueChamberBatches.length} Humid Chamber Batch(es) have exceeded the 1-month threshold and are ready for First Hardening!
                                </span>
                            </div>
                            <Link to="/clones" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                View Chambers <ArrowRight size={14} />
                            </Link>
                        </div>
                    )}
                    {lowStockItems.length > 0 && (
                        <div className="card" style={{ padding: '0.75rem 1rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309' }}>
                                <Package size={18} />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                    Low Stock Alert: {lowStockItems.length} inventory item(s) are below minimum threshold (e.g. {lowStockItems.slice(0, 2).map(i => i.name).join(', ')}).
                                </span>
                            </div>
                            <Link to="/inventory" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                Manage Inventory <ArrowRight size={14} />
                            </Link>
                        </div>
                    )}
                </div>
            )}

            {/* Core Financial & Operational KPI Grid */}
            <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {/* 1. Workforce & Attendance */}
                <div className="card stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="stat-label">Today's Attendance</span>
                        <Users size={20} color="#3b82f6" />
                    </div>
                    <span className="stat-value text-primary" style={{ fontSize: '1.75rem' }}>
                        {attendancePercentage}%
                    </span>
                    <span className="text-light" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                        {presentToday} Present • {absentToday} Absent ({totalWorkersCount} Total Workers)
                    </span>
                </div>

                {/* 2. Overtime Approvals */}
                <div className="card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="stat-label">Pending Overtime</span>
                        <Clock size={20} color="#f59e0b" />
                    </div>
                    <span className="stat-value text-warning" style={{ fontSize: '1.75rem' }}>
                        {pendingOvertimeRecords.length} <span style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>requests</span>
                    </span>
                    <span className="text-light" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                        {pendingOvertimeHours.toFixed(1)} hrs awaiting supervisor review
                    </span>
                </div>

                {/* 3. Sales Revenue */}
                <div className="card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="stat-label">Sales Revenue (UGX)</span>
                        <ShoppingCart size={20} color="#10b981" />
                    </div>
                    <span className="stat-value text-success" style={{ fontSize: '1.75rem' }}>
                        UGX {totalSalesRevenue.toLocaleString()}
                    </span>
                    <span className="text-light" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                        Receivables: UGX {totalOutstandingReceivables.toLocaleString()}
                    </span>
                </div>

                {/* 4. Inventory Valuation */}
                <div className="card stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="stat-label">Inventory Valuation</span>
                        <Package size={20} color="#8b5cf6" />
                    </div>
                    <span className="stat-value" style={{ fontSize: '1.75rem', color: '#8b5cf6' }}>
                        UGX {totalInventoryValuation.toLocaleString()}
                    </span>
                    <span className="text-light" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                        {activeInventory.length} items across 4 categories
                    </span>
                </div>
            </div>

            {/* 5-Stage Coffee Clone Production Pipeline */}
            <section className="dashboard-section card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                            <Sprout size={24} color="var(--color-primary)" /> Coffee Clone 5-Stage Nursery Pipeline (KR1, KR3–KR10)
                        </h2>
                        <p className="text-light" style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                            End-to-end nursery advancement with automatic 1-month chamber timers and validated commercial stock reconciliation.
                        </p>
                    </div>
                    <Link to="/clones" className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.35rem 0.75rem' }}>
                        View Full Pipeline <ArrowRight size={14} />
                    </Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
                    {/* Stage 1: Cuttings */}
                    <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Stage 1</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.25rem 0', color: '#0f172a' }}>Cutting Stage</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                            {cuttingsBatches.length} <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'normal' }}>batches</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                            {totalCuttingsQty.toLocaleString()} cuttings obtained
                        </div>
                    </div>

                    {/* Stage 2: Humid Chamber */}
                    <div style={{ padding: '1rem', backgroundColor: overdueChamberBatches.length > 0 ? '#fef2f2' : '#f0f9ff', borderRadius: '8px', border: `1px solid ${overdueChamberBatches.length > 0 ? '#fca5a5' : '#bae6fd'}` }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: overdueChamberBatches.length > 0 ? '#b91c1c' : '#0369a1', textTransform: 'uppercase' }}>Stage 2 (1 Month)</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.25rem 0', color: '#0f172a' }}>Humid Chamber</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0284c7' }}>
                            {humidChamberQty.toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'normal' }}>plants</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: overdueChamberBatches.length > 0 ? '#b91c1c' : '#64748b', marginTop: '0.25rem' }}>
                            {humidChamberBatches.length} batches {overdueChamberBatches.length > 0 && `(${overdueChamberBatches.length} overdue!)`}
                        </div>
                    </div>

                    {/* Stage 3: First Hardening */}
                    <div style={{ padding: '1rem', backgroundColor: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a16207', textTransform: 'uppercase' }}>Stage 3</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.25rem 0', color: '#0f172a' }}>1st Hardening</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ca8a04' }}>
                            {firstHardeningQty.toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'normal' }}>plants</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                            {firstHardeningBatches.length} active batches
                        </div>
                    </div>

                    {/* Stage 4: Second Hardening */}
                    <div style={{ padding: '1rem', backgroundColor: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7e22ce', textTransform: 'uppercase' }}>Stage 4</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.25rem 0', color: '#0f172a' }}>2nd Hardening</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#9333ea' }}>
                            {secondHardeningQty.toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'normal' }}>plants</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                            {secondHardeningBatches.length} active batches
                        </div>
                    </div>

                    {/* Stage 5: Sorting & Ready for Sale */}
                    <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#15803d', textTransform: 'uppercase' }}>Stage 5 (Commercial)</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.25rem 0', color: '#0f172a' }}>Validated Ready Stock</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#16a34a' }}>
                            {liveAvailableClones.toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'normal' }}>plants</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '0.25rem', fontWeight: 600 }}>
                            Valuation: UGX {liveClonesValuation.toLocaleString()}
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick Actions & Recent Operational Logs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {/* Quick Actions Card */}
                <div className="card">
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <TrendingUp size={20} /> Operational Quick Actions
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <Link to="/scan" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                            <QrCode size={22} color="var(--color-primary)" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Scan QR Attendance</span>
                        </Link>
                        <Link to="/clones" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                            <Sprout size={22} color="#16a34a" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Clone Batch Registry</span>
                        </Link>
                        <Link to="/sales" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                            <ShoppingCart size={22} color="#2563eb" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Record Sales Order</span>
                        </Link>
                        <Link to="/inventory" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                            <Package size={22} color="#8b5cf6" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Inventory Stock-In</span>
                        </Link>
                        <Link to="/payroll" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                            <DollarSign size={22} color="#ea580c" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Monthly Payroll</span>
                        </Link>
                        <Link to="/reports" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                            <FileText size={22} color="#0284c7" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Export PDF Reports</span>
                        </Link>
                    </div>
                </div>

                {/* Today's Attendance Overview */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={20} /> Today's Live Attendance Stream
                        </h3>
                        <Link to="/scan" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                            View All
                        </Link>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                        {todayAttendance.length === 0 ? (
                            <div className="text-light" style={{ textAlign: 'center', padding: '2rem' }}>
                                No attendance scans recorded yet today.
                            </div>
                        ) : (
                            todayAttendance.slice(0, 6).map((att, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '0.6rem 0.75rem',
                                        backgroundColor: '#f8fafc',
                                        borderRadius: '6px',
                                        border: '1px solid #f1f5f9'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                            {att.workerName || att.workerId}
                                        </div>
                                        <div className="text-light" style={{ fontSize: '0.75rem' }}>
                                            In: {att.timeIn} • Out: {att.timeOut || 'Working...'}
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            padding: '0.15rem 0.5rem',
                                            borderRadius: '10px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            backgroundColor: att.status === 'Present' ? '#dcfce7' : att.status === 'Late' ? '#fef3c7' : '#fee2e2',
                                            color: att.status === 'Present' ? '#15803d' : att.status === 'Late' ? '#b45309' : '#b91c1c'
                                        }}
                                    >
                                        {att.status}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;


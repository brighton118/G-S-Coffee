import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
    Sprout,
    AlertTriangle,
    TrendingUp,
    Clock,
    Package,
    QrCode,
    ArrowRight,
    Briefcase,
    Eye,
    ShieldCheck,
    ArrowUpDown,
    CheckCircle2,
    UserPlus
} from 'lucide-react';
import { useUserRole } from '../context/UserRoleContext';
import AdminInvitations from '../components/AdminInvitations';
import './Dashboard.css';

const Dashboard = () => {
    const { isAdmin, isSuperAdmin, isManager, isStaff } = useUserRole();
    const todayDateStr = format(new Date(), 'yyyy-MM-dd');
    const [attendanceSortBy, setAttendanceSortBy] = useState<'recent' | 'name' | 'id'>('recent');
    const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'working' | 'present' | 'late' | 'completed'>('all');

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

    // Worker lookup map for resolving names and contact info
    const workerMap = useMemo(() => new Map(workers.map(w => [w.workerId, w])), [workers]);

    // Processed today's attendance with resolved worker names and details
    const processedTodayAttendance = useMemo(() => {
        return todayAttendance.map(att => {
            const worker = workerMap.get(att.workerId);
            const resolvedName = att.workerName || worker?.fullName || `Worker (${att.workerId})`;
            return {
                ...att,
                worker,
                workerName: resolvedName,
                workerNumber: att.workerId,
                phoneNumber: worker?.phoneNumber,
                farmCardNumber: worker?.farmCardNumber,
                position: worker?.position,
                department: worker?.department
            };
        });
    }, [todayAttendance, workerMap]);

    // Sorted today's attendance stream
    const sortedTodayAttendance = useMemo(() => {
        return [...processedTodayAttendance].sort((a, b) => {
            if (attendanceSortBy === 'name') {
                return a.workerName.localeCompare(b.workerName);
            }
            if (attendanceSortBy === 'id') {
                return a.workerNumber.localeCompare(b.workerNumber);
            }
            // 'recent': latest clock-out or clock-in first, then highest ID
            const timeA = a.timeOut || a.timeIn || '';
            const timeB = b.timeOut || b.timeIn || '';
            if (timeB !== timeA) {
                return timeB.localeCompare(timeA);
            }
            return (b.id || 0) - (a.id || 0);
        });
    }, [processedTodayAttendance, attendanceSortBy]);

    // Filtered attendance stream for manager view
    const displayTodayAttendance = useMemo(() => {
        return sortedTodayAttendance.filter(att => {
            if (attendanceFilter === 'working') {
                return !att.timeOut && (att.status === 'Present' || att.status === 'Late');
            }
            if (attendanceFilter === 'present') {
                return att.status === 'Present' || att.status === 'Late';
            }
            if (attendanceFilter === 'late') {
                return att.status === 'Late' || att.isLate;
            }
            if (attendanceFilter === 'completed') {
                return !!att.timeOut;
            }
            return true;
        });
    }, [sortedTodayAttendance, attendanceFilter]);

    // Workforce & Attendance Stats
    const totalWorkersCount = activeWorkers.length;
    const presentToday = todayAttendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
    const currentlyWorkingCount = todayAttendance.filter(a => !a.timeOut && (a.status === 'Present' || a.status === 'Late')).length;
    const lateTodayCount = todayAttendance.filter(a => a.status === 'Late' || a.isLate).length;
    const completedShiftCount = todayAttendance.filter(a => !!a.timeOut).length;
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
    const totalSalesRevenue = sales.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);

    return (
        <div className="dashboard-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Header */}
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.75rem' }}>G&S FARM Management System</h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        {format(new Date(), 'EEEE, MMMM do, yyyy')} • Enterprise Farm & Nursery Operations
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <Link to="/scan" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <QrCode size={18} /> Clock-In / Scan Attendance
                    </Link>
                    {!isStaff && (
                        <Link to="/clones" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Sprout size={18} /> New Clone Batch
                        </Link>
                    )}
                    {isAdmin && (
                        <a href="#team-accounts" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#fefce8', borderColor: '#fde047', color: '#854d0e', fontWeight: 600 }}>
                            <UserPlus size={18} /> Manage Team Accounts
                        </a>
                    )}
                </div>
            </div>

            {/* Operational Quick Actions - Appears First */}
            <section className="card">
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingUp size={20} /> Operational Quick Actions
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                    <Link to="/scan" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                        <QrCode size={20} color="var(--color-primary)" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Scan QR Attendance</span>
                    </Link>
                    <Link to="/clones" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                        <Sprout size={20} color="#15803d" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Clone Batch Registry</span>
                    </Link>
                    <Link to="/sales" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '1.25rem' }}>💰</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Record Sales Order</span>
                    </Link>
                    <Link to="/inventory" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                        <Package size={20} color="#b45309" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Inventory Stock-In</span>
                    </Link>
                    <Link to="/payroll" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '1.25rem' }}>💵</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Monthly Payroll</span>
                    </Link>
                    <Link to="/reports" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '1.25rem' }}>📊</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Export PDF Reports</span>
                    </Link>
                    {isSuperAdmin && (
                        <a href="#team-accounts" className="btn btn-secondary" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', textAlign: 'center', background: '#fefce8', borderColor: '#fde047' }}>
                            <UserPlus size={20} color="#854d0e" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#854d0e' }}>Team Accounts</span>
                        </a>
                    )}
                </div>
            </section>

            {/* Role Access Information Banner */}
            {isAdmin && (
                <div className="card" style={{ padding: '0.85rem 1.25rem', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <ShieldCheck size={24} color="#854d0e" />
                        <div>
                            <strong style={{ color: '#854d0e', fontSize: '0.95rem' }}>Administrator Master Session</strong>
                            <div style={{ color: '#713f12', fontSize: '0.82rem' }}>
                                Full access. All records entered by Managers and Staff are synchronized live to your dashboard.
                            </div>
                        </div>
                    </div>
                    <span className="badge badge-warning" style={{ fontWeight: 700, padding: '0.35rem 0.75rem' }}>
                        👑 ADMIN ACCESS
                    </span>
                </div>
            )}

            {/* Team & Staff User Management on Admin Dashboard (Super Admin only) */}
            {isSuperAdmin && (
                <div id="team-accounts" style={{ scrollMarginTop: '1.5rem' }}>
                    <AdminInvitations />
                </div>
            )}

            {isManager && (
                <div className="card" style={{ padding: '0.85rem 1.25rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Briefcase size={24} color="#15803d" />
                        <div>
                            <strong style={{ color: '#15803d', fontSize: '0.95rem' }}>Manager Operations Mode</strong>
                            <div style={{ color: '#166534', fontSize: '0.82rem' }}>
                                Operational data entry enabled (workers, clones, sales, stock). All entries you make are automatically visible to Administrators.
                            </div>
                        </div>
                    </div>
                    <span className="badge badge-success" style={{ fontWeight: 700, padding: '0.35rem 0.75rem' }}>
                        💼 MANAGER (DATA ENTRY)
                    </span>
                </div>
            )}

            {isStaff && (
                <div className="card" style={{ padding: '0.85rem 1.25rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Eye size={24} color="#1d4ed8" />
                        <div>
                            <strong style={{ color: '#1d4ed8', fontSize: '0.95rem' }}>Staff View-Only Session</strong>
                            <div style={{ color: '#1e40af', fontSize: '0.82rem' }}>
                                You have view-only access to browse farm metrics, records, and reports. Data entry and edits are reserved for Managers and Administrators.
                            </div>
                        </div>
                    </div>
                    <span className="badge badge-info" style={{ fontWeight: 700, padding: '0.35rem 0.75rem' }}>
                        👁️ STAFF (VIEW ONLY)
                    </span>
                </div>
            )}

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
                    </div>
                    <span className="stat-value text-success" style={{ fontSize: '1.75rem' }}>
                        UGX {totalSalesRevenue.toLocaleString()}
                    </span>
                </div>

                {/* 4. Inventory Valuation */}
                <div className="card stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="stat-label">Inventory Valuation</span>
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
                            <Sprout size={24} color="var(--color-primary)" /> Coffee Clone 5-Stage Nursery Pipeline
                        </h2>
                        <p className="text-light" style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
                            End-to-end nursery advancement with automatic 1-month chamber timers and validated sorting reconciliation.
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

            {/* Today's Operational Logs */}
            <div>
                {/* Today's Attendance Overview */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={20} /> Today's Live Attendance Stream
                            </h3>
                            <p className="text-light" style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem' }}>
                                Verified worker attendance records with names, IDs, shift times, and real-time status.
                            </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
                                <ArrowUpDown size={15} />
                                <span style={{ fontWeight: 600 }}>Sort:</span>
                                <select
                                    value={attendanceSortBy}
                                    onChange={(e) => setAttendanceSortBy(e.target.value as 'recent' | 'name' | 'id')}
                                    className="form-input"
                                    style={{ fontSize: '0.82rem', padding: '0.3rem 0.55rem', height: 'auto', minWidth: '150px' }}
                                    aria-label="Sort attendance roster"
                                >
                                    <option value="recent">⏱️ Most Recent First</option>
                                    <option value="name">🔤 Worker Name (A-Z)</option>
                                    <option value="id">🔢 Worker ID Number</option>
                                </select>
                            </div>
                            <Link to="/attendance" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                View Full Sheet <ArrowRight size={14} />
                            </Link>
                        </div>
                    </div>

                    {/* Filter Tabs for Quick Manager Auditing */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setAttendanceFilter('working')}
                            style={{
                                border: 'none',
                                borderRadius: '20px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                backgroundColor: attendanceFilter === 'working' ? '#15803d' : '#f0fdf4',
                                color: attendanceFilter === 'working' ? '#ffffff' : '#166534',
                                borderBottom: attendanceFilter === 'working' ? 'none' : '1px solid #bbf7d0'
                            }}
                        >
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: attendanceFilter === 'working' ? '#86efac' : '#16a34a' }}></span>
                            Present on Farm Now ({currentlyWorkingCount})
                        </button>

                        <button
                            type="button"
                            onClick={() => setAttendanceFilter('present')}
                            style={{
                                border: 'none',
                                borderRadius: '20px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                backgroundColor: attendanceFilter === 'present' ? 'var(--color-primary)' : '#f8fafc',
                                color: attendanceFilter === 'present' ? '#ffffff' : '#334155',
                                borderBottom: attendanceFilter === 'present' ? 'none' : '1px solid #e2e8f0'
                            }}
                        >
                            <CheckCircle2 size={14} />
                            All Present Today ({presentToday})
                        </button>

                        <button
                            type="button"
                            onClick={() => setAttendanceFilter('late')}
                            style={{
                                border: 'none',
                                borderRadius: '20px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                backgroundColor: attendanceFilter === 'late' ? '#c2410c' : '#fff7ed',
                                color: attendanceFilter === 'late' ? '#ffffff' : '#9a3412',
                                borderBottom: attendanceFilter === 'late' ? 'none' : '1px solid #fed7aa'
                            }}
                        >
                            <AlertTriangle size={14} />
                            Late Arrivals ({lateTodayCount})
                        </button>

                        <button
                            type="button"
                            onClick={() => setAttendanceFilter('completed')}
                            style={{
                                border: 'none',
                                borderRadius: '20px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                backgroundColor: attendanceFilter === 'completed' ? '#2563eb' : '#eff6ff',
                                color: attendanceFilter === 'completed' ? '#ffffff' : '#1e40af',
                                borderBottom: attendanceFilter === 'completed' ? 'none' : '1px solid #bfdbfe'
                            }}
                        >
                            Shift Completed ({completedShiftCount})
                        </button>

                        <button
                            type="button"
                            onClick={() => setAttendanceFilter('all')}
                            style={{
                                border: 'none',
                                borderRadius: '20px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                backgroundColor: attendanceFilter === 'all' ? '#334155' : '#f1f5f9',
                                color: attendanceFilter === 'all' ? '#ffffff' : '#475569',
                                borderBottom: attendanceFilter === 'all' ? 'none' : '1px solid #cbd5e1'
                            }}
                        >
                            All Scans ({sortedTodayAttendance.length})
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                        {displayTodayAttendance.length === 0 ? (
                            <div className="text-light" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                                <Clock size={36} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                                <div style={{ fontWeight: 600 }}>
                                    {attendanceFilter === 'working' ? 'No workers currently clocked in on site.' : 'No matching attendance records found for today.'}
                                </div>
                                <div style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
                                    When workers are clocked in via the QR scanner, their names will appear here live.
                                </div>
                                <div style={{ marginTop: '1rem' }}>
                                    <Link to="/scan" className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <QrCode size={16} /> Open Attendance Scanner
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            displayTodayAttendance.map((att, idx) => {
                                const isCurrentlyWorking = !att.timeOut && (att.status === 'Present' || att.status === 'Late');
                                const initials = att.workerName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

                                return (
                                    <div
                                        key={att.id || idx}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '0.85rem 1rem',
                                            backgroundColor: isCurrentlyWorking ? '#f0fdf4' : '#f8fafc',
                                            borderRadius: '8px',
                                            border: `1px solid ${isCurrentlyWorking ? '#bbf7d0' : '#e2e8f0'}`,
                                            gap: '0.75rem',
                                            flexWrap: 'wrap'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: '220px' }}>
                                            <div
                                                style={{
                                                    width: '38px',
                                                    height: '38px',
                                                    borderRadius: '50%',
                                                    backgroundColor: isCurrentlyWorking ? '#dcfce7' : '#e2e8f0',
                                                    color: isCurrentlyWorking ? '#15803d' : '#475569',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontWeight: 700,
                                                    fontSize: '0.85rem',
                                                    position: 'relative',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {initials || 'WK'}
                                                {isCurrentlyWorking && (
                                                    <span
                                                        style={{
                                                            position: 'absolute',
                                                            bottom: '0',
                                                            right: '0',
                                                            width: '10px',
                                                            height: '10px',
                                                            backgroundColor: '#22c55e',
                                                            borderRadius: '50%',
                                                            border: '2px solid white'
                                                        }}
                                                        title="Currently Present on Farm"
                                                    />
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                                                        {att.workerName}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: '0.74rem',
                                                            fontWeight: 600,
                                                            padding: '0.12rem 0.5rem',
                                                            borderRadius: '4px',
                                                            backgroundColor: '#e2e8f0',
                                                            color: '#334155'
                                                        }}
                                                    >
                                                        {att.workerNumber}
                                                    </span>
                                                    {att.position && (
                                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            • {att.position}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-light" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span>
                                                        In: <strong style={{ color: att.status === 'Late' ? '#c2410c' : '#15803d' }}>{att.timeIn}</strong>
                                                    </span>
                                                    <span>•</span>
                                                    <span>
                                                        Out: <strong style={{ color: att.timeOut ? '#2563eb' : '#15803d' }}>
                                                            {att.timeOut || 'Working on site'}
                                                        </strong>
                                                    </span>
                                                    {att.phoneNumber && (
                                                        <>
                                                            <span>•</span>
                                                            <span>Tel: {att.phoneNumber}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            {isCurrentlyWorking ? (
                                                <span
                                                    style={{
                                                        padding: '0.25rem 0.75rem',
                                                        borderRadius: '12px',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 700,
                                                        backgroundColor: '#dcfce7',
                                                        color: '#15803d',
                                                        border: '1px solid #86efac'
                                                    }}
                                                >
                                                    ● PRESENT & WORKING
                                                </span>
                                            ) : (
                                                <span
                                                    style={{
                                                        padding: '0.25rem 0.75rem',
                                                        borderRadius: '12px',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 700,
                                                        backgroundColor: att.status === 'Late' ? '#fef3c7' : '#f1f5f9',
                                                        color: att.status === 'Late' ? '#b45309' : '#475569'
                                                    }}
                                                >
                                                    {att.timeOut ? `Clocked Out (${att.status})` : att.status}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

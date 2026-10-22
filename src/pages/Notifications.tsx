import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
    Bell, 
    CheckSquare, 
    AlertTriangle, 
    Clock, 
    Package, 
    Sprout, 
    DollarSign, 
    RefreshCw, 
    Trash2, 
    CheckCircle2,
    Calendar,
    Radio
} from 'lucide-react';
import { notificationService } from '../utils/notificationService';
import './Dashboard.css';

const Notifications: React.FC = () => {
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [onlyUnread, setOnlyUnread] = useState<boolean>(false);
    const [isScanning, setIsScanning] = useState<boolean>(false);
    const [scanMessage, setScanMessage] = useState<string | null>(null);

    // Live Query for notifications sorted latest first
    const notifications = useLiveQuery(() => db.notifications.orderBy('id').reverse().toArray()) || [];

    // Trigger initial scan on page load
    useEffect(() => {
        notificationService.runAllNotificationChecks();
    }, []);

    const markAsRead = async (id: number) => {
        await db.notifications.update(id, { read: 1 });
    };

    const markAllAsRead = async () => {
        const unreadList = notifications.filter(n => !n.read);
        for (const notif of unreadList) {
            if (notif.id) {
                await db.notifications.update(notif.id, { read: 1 });
            }
        }
    };

    const clearAllRead = async () => {
        const readList = notifications.filter(n => !!n.read);
        for (const notif of readList) {
            if (notif.id) {
                await db.notifications.delete(notif.id);
            }
        }
    };

    const handleManualScan = async () => {
        setIsScanning(true);
        setScanMessage(null);
        try {
            const summary = await notificationService.runAllNotificationChecks();
            if (summary.newAlertsCount > 0) {
                setScanMessage(`Scan complete: Found ${summary.newAlertsCount} new alerts (Stock: ${summary.lowStockFound}, Clones: ${summary.chamberOverdueFound}, Overtime: ${summary.pendingOTFound}).`);
            } else {
                setScanMessage('System Scan Complete: All farm systems normal. No new alerts.');
            }
        } catch (err: any) {
            setScanMessage('Scan completed with current data.');
        } finally {
            setIsScanning(false);
            setTimeout(() => setScanMessage(null), 6000);
        }
    };

    // Filter Notifications
    const filteredNotifications = notifications.filter(n => {
        if (onlyUnread && n.read) return false;
        if (selectedCategory === 'All') return true;
        if (selectedCategory === 'Attendance' && n.type === 'EOD_ATTENDANCE') return true;
        if (selectedCategory === 'Inventory' && (n.type === 'Inventory Low' || n.type === 'Expiry Warning')) return true;
        if (selectedCategory === 'Overtime' && n.type === 'Pending Overtime') return true;
        if (selectedCategory === 'Clones' && n.type === 'Chamber Overdue') return true;
        if (selectedCategory === 'Payroll' && n.type === 'Payroll Approval') return true;
        return n.type === selectedCategory;
    });

    const unreadCount = notifications.filter(n => !n.read).length;

    // Helper for category icons & styling
    const getCategoryDetails = (type: string) => {
        switch (type) {
            case 'EOD_ATTENDANCE':
                return { icon: <Calendar size={20} color="#2563eb" />, bg: '#eff6ff', border: '#3b82f6', label: 'Attendance' };
            case 'Inventory Low':
            case 'Expiry Warning':
                return { icon: <Package size={20} color="#ea580c" />, bg: '#fff7ed', border: '#f97316', label: 'Inventory' };
            case 'Pending Overtime':
                return { icon: <Clock size={20} color="#ca8a04" />, bg: '#fefce8', border: '#eab308', label: 'Overtime' };
            case 'Chamber Overdue':
                return { icon: <Sprout size={20} color="#16a34a" />, bg: '#f0fdf4', border: '#22c55e', label: 'Clones' };
            case 'Payroll Approval':
                return { icon: <DollarSign size={20} color="#9333ea" />, bg: '#faf5ff', border: '#a855f7', label: 'Payroll' };
            default:
                return { icon: <Bell size={20} color="#475569" />, bg: '#f8fafc', border: '#64748b', label: 'General' };
        }
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header & Controls */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Bell size={28} /> Notifications & System Alerts
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Automated monitoring for Attendance, Overtime, Stock Levels, and Clone Propagation.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button 
                        className="btn btn-primary" 
                        onClick={handleManualScan} 
                        disabled={isScanning}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={16} className={isScanning ? 'spin' : ''} /> 
                        {isScanning ? 'Scanning...' : 'Scan System for Alerts'}
                    </button>
                    {unreadCount > 0 && (
                        <button className="btn btn-secondary" onClick={markAllAsRead} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <CheckSquare size={16} /> Mark All Read
                        </button>
                    )}
                    {notifications.some(n => !!n.read) && (
                        <button className="btn btn-secondary" onClick={clearAllRead} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Trash2 size={16} /> Clear Read
                        </button>
                    )}
                </div>
            </div>

            {/* Scan Feedback Banner */}
            {scanMessage && (
                <div className="card" style={{ padding: '0.85rem 1.25rem', backgroundColor: '#eff6ff', borderLeft: '4px solid #3b82f6', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={18} />
                    <span>{scanMessage}</span>
                </div>
            )}

            {/* KPI Summary Banner */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">UNREAD ALERTS</span>
                        <Bell className="stat-icon text-warning" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: unreadCount > 0 ? '#ea580c' : '#16a34a' }}>
                        {unreadCount}
                    </div>
                    <div className="stat-change text-light">Requires manager attention</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL LOGGED</span>
                        <Radio className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value">
                        {notifications.length}
                    </div>
                    <div className="stat-change text-light">System records retained</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">SYSTEM MONITOR</span>
                        <CheckCircle2 className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: '#16a34a', fontSize: '1.3rem' }}>
                        ACTIVE
                    </div>
                    <div className="stat-change text-light">Background scan running</div>
                </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['All', 'Attendance', 'Inventory', 'Overtime', 'Clones', 'Payroll'].map(cat => (
                        <button
                            key={cat}
                            className={`btn ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setSelectedCategory(cat)}
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                    <input 
                        type="checkbox" 
                        checked={onlyUnread} 
                        onChange={e => setOnlyUnread(e.target.checked)} 
                        style={{ width: '16px', height: '16px' }}
                    />
                    Only Show Unread ({unreadCount})
                </label>
            </div>

            {/* Notifications Feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredNotifications.length === 0 ? (
                    <div className="card text-center text-light" style={{ padding: '3rem' }}>
                        <AlertTriangle size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                        <div>No notifications found matching selected criteria.</div>
                    </div>
                ) : (
                    filteredNotifications.map(notif => {
                        const { icon, bg, border, label } = getCategoryDetails(notif.type);

                        return (
                            <div 
                                key={notif.id} 
                                className="card" 
                                style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'flex-start',
                                    padding: '1.25rem',
                                    backgroundColor: notif.read ? 'var(--color-surface)' : bg,
                                    borderLeft: `5px solid ${border}`,
                                    gap: '1rem',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1 }}>
                                    <div style={{ paddingTop: '0.2rem' }}>
                                        {icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                                            <span style={{ 
                                                fontSize: '0.75rem', 
                                                fontWeight: 700, 
                                                textTransform: 'uppercase', 
                                                padding: '0.15rem 0.45rem', 
                                                borderRadius: '4px',
                                                backgroundColor: 'rgba(0,0,0,0.06)',
                                                color: 'var(--color-text)'
                                            }}>
                                                {label}
                                            </span>
                                            <strong style={{ fontSize: '1.05rem', color: 'var(--color-primary-dark)' }}>
                                                {notif.title}
                                            </strong>
                                            {!notif.read && (
                                                <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>NEW</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem' }}>
                                            Date: {notif.date} • Recipient: {notif.recipient || 'Farm Management'} • Channel: {notif.channel || 'In-App'}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.925rem', lineHeight: 1.5, color: 'var(--color-text)' }}>
                                            {notif.message}
                                        </p>
                                    </div>
                                </div>

                                {!notif.read && (
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
                                        onClick={() => markAsRead(notif.id!)}
                                        title="Mark as Read"
                                    >
                                        <CheckSquare size={14} /> Mark Read
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Notifications;

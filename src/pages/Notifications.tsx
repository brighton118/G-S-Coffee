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
    Radio,
    Mail,
    Smartphone,
    MessageSquare,
    ExternalLink,
    FileText
} from 'lucide-react';
import { notificationService } from '../utils/notificationService';
import { emailService } from '../services/emailService';
import { smsService } from '../services/smsService';
import './Dashboard.css';

const Notifications: React.FC = () => {
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [onlyUnread, setOnlyUnread] = useState<boolean>(false);
    const [isScanning, setIsScanning] = useState<boolean>(false);
    const [scanMessage, setScanMessage] = useState<string | null>(null);
    const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);
    const [isSendingDigest, setIsSendingDigest] = useState<boolean>(false);
    const [emailNotice, setEmailNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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

    const handleSendSingleEmail = async (notif: typeof notifications[0]) => {
        if (!notif.id) return;
        setSendingEmailId(notif.id);
        setEmailNotice(null);

        try {
            const res = await emailService.sendNotificationEmail({
                subject: notif.title,
                title: notif.title,
                message: notif.message,
                category: notif.type,
                details: {
                    'Alert Type': notif.type,
                    'Date Logged': notif.date,
                    'Target Recipient': notif.recipient || 'Farm Management'
                }
            });

            if (res.success) {
                setEmailNotice({
                    type: 'success',
                    text: `Email dispatched successfully to: ${res.recipients.join(', ')} (Queued in Cloud Mail)`
                });
            } else {
                setEmailNotice({
                    type: 'error',
                    text: `Failed to queue email: ${res.error || 'Unknown error'}`
                });
            }
        } catch (err: any) {
            setEmailNotice({
                type: 'error',
                text: `Error sending email: ${err?.message || err}`
            });
        } finally {
            setSendingEmailId(null);
            setTimeout(() => setEmailNotice(null), 7000);
        }
    };

    const handleSendDigestEmail = async () => {
        const unreadList = notifications.filter(n => !n.read);
        if (unreadList.length === 0) {
            alert('There are no unread notifications to email.');
            return;
        }

        setIsSendingDigest(true);
        setEmailNotice(null);

        const summaryText = unreadList
            .map((n, i) => `${i + 1}. [${n.type}] ${n.title}\n   ${n.message}`)
            .join('\n\n');

        try {
            const res = await emailService.sendNotificationEmail({
                subject: `Operations Digest: ${unreadList.length} Active System Alerts`,
                title: `G&S FARMS Operational Digest (${unreadList.length} Alerts)`,
                message: `The following ${unreadList.length} unread operational alerts require attention:\n\n${summaryText}`,
                category: 'General',
                details: {
                    'Total Alerts': unreadList.length,
                    'Stock Alerts': unreadList.filter(n => n.type === 'Inventory Low').length,
                    'Chamber Alerts': unreadList.filter(n => n.type === 'Chamber Overdue').length,
                    'Overtime Alerts': unreadList.filter(n => n.type === 'Pending Overtime').length,
                    'Attendance Alerts': unreadList.filter(n => n.type === 'EOD_ATTENDANCE').length
                }
            });

            if (res.success) {
                setEmailNotice({
                    type: 'success',
                    text: `Operations digest containing ${unreadList.length} alerts successfully queued to: ${res.recipients.join(', ')}`
                });
            } else {
                setEmailNotice({
                    type: 'error',
                    text: `Failed to dispatch digest: ${res.error || 'Unknown error'}`
                });
            }
        } catch (err: any) {
            setEmailNotice({
                type: 'error',
                text: `Error dispatching digest: ${err?.message || err}`
            });
        } finally {
            setIsSendingDigest(false);
            setTimeout(() => setEmailNotice(null), 7000);
        }
    };

    // Filter Notifications
    const filteredNotifications = notifications.filter(n => {
        if (onlyUnread && n.read) return false;
        if (selectedCategory === 'All') return true;
        if (selectedCategory === 'Manager Entry' && n.type === 'Manager Entry') return true;
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
            case 'Manager Entry':
                return { icon: <FileText size={20} color="#2563eb" />, bg: '#eff6ff', border: '#3b82f6', label: 'Manager Entry' };
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
                        <button 
                            className="btn btn-primary" 
                            onClick={handleSendDigestEmail} 
                            disabled={isSendingDigest}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' }}
                            title="Send all active unread alerts as an email digest to managers"
                        >
                            <Mail size={16} /> 
                            {isSendingDigest ? 'Dispatching Digest...' : `Email Digest (${unreadCount})`}
                        </button>
                    )}
                    {unreadCount > 0 && (
                        <button className="btn btn-secondary" onClick={markAllAsRead} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <CheckSquare size={16} /> Mark All Read
                        </button>
                    )}
                    <button 
                        className="btn btn-secondary" 
                        onClick={async () => {
                            const granted = await smsService.requestNotificationPermission();
                            if (granted) {
                                smsService.showDevicePush('Live Alerts Active', 'Device screen notifications are enabled for G&S FARMS.');
                                setEmailNotice({ type: 'success', text: '✅ Device screen notifications successfully activated!' });
                                setTimeout(() => setEmailNotice(null), 5000);
                            } else {
                                alert('Please allow notifications in your browser permission prompt.');
                            }
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Enable screen notifications for this device"
                    >
                        <Bell size={16} /> Enable Device Push
                    </button>
                    {notifications.some(n => !!n.read) && (
                        <button className="btn btn-secondary" onClick={clearAllRead} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Trash2 size={16} /> Clear Read
                        </button>
                    )}
                </div>
            </div>

            {/* Email Dispatch Feedback Banner */}
            {emailNotice && (
                <div className="card" style={{ 
                    padding: '0.85rem 1.25rem', 
                    backgroundColor: emailNotice.type === 'success' ? '#f0fdf4' : '#fef2f2', 
                    borderLeft: `4px solid ${emailNotice.type === 'success' ? '#22c55e' : '#ef4444'}`, 
                    color: emailNotice.type === 'success' ? '#166534' : '#991b1b', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    fontSize: '0.92rem'
                }}>
                    <Mail size={18} />
                    <span>{emailNotice.text}</span>
                </div>
            )}

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
                    {['All', 'Manager Entry', 'Attendance', 'Inventory', 'Overtime', 'Clones', 'Payroll'].map(cat => (
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

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        <button 
                                            className="btn btn-secondary"
                                            style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                                            onClick={() => handleSendSingleEmail(notif)}
                                            disabled={sendingEmailId === notif.id}
                                            title="Send alert email to gs.farms.ug@gmail.com"
                                        >
                                            <Mail size={13} /> 
                                            {sendingEmailId === notif.id ? 'Sending...' : 'Email'}
                                        </button>

                                        <button 
                                            className="btn btn-secondary"
                                            style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                                            onClick={() => emailService.openGmailWeb({
                                                subject: notif.title,
                                                title: notif.title,
                                                message: notif.message,
                                                category: notif.type
                                            })}
                                            title="Open pre-filled in Gmail Web"
                                        >
                                            <ExternalLink size={13} /> Gmail
                                        </button>

                                        <button 
                                            className="btn btn-secondary"
                                            style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap', color: '#16a34a' }}
                                            onClick={() => smsService.openWhatsAppAlert({
                                                title: notif.title,
                                                message: notif.message,
                                                category: notif.type
                                            })}
                                            title="Send alert directly via WhatsApp to 0788945330"
                                        >
                                            <MessageSquare size={13} /> WhatsApp
                                        </button>

                                        <button 
                                            className="btn btn-secondary"
                                            style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                                            onClick={() => smsService.openNativeSMS({
                                                message: `[G&S FARMS Alert] ${notif.title}\n${notif.message}`
                                            })}
                                            title="Open native SMS message app for 0788945330"
                                        >
                                            <Smartphone size={13} /> SMS
                                        </button>
                                    </div>

                                    {!notif.read && (
                                        <button 
                                            className="btn btn-secondary" 
                                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
                                            onClick={() => markAsRead(notif.id!)}
                                            title="Mark as Read"
                                        >
                                            <CheckSquare size={13} /> Mark Read
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Notifications;

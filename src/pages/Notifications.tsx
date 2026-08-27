import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Bell, CheckSquare } from 'lucide-react';
import './Dashboard.css';

const Notifications = () => {
    const notifications = useLiveQuery(() => db.notifications.orderBy('id').reverse().toArray()) || [];

    const markAsRead = async (id: number) => {
        await db.notifications.update(id, { read: 1 });
    };

    return (
        <div className="dashboard-wrapper">
            <div className="dashboard-header">
                <h1>Notifications</h1>
                <p className="text-light">System alerts and End-of-Day reports</p>
            </div>

            <div className="cards-grid" style={{ gridTemplateColumns: '1fr' }}>
                {notifications.length === 0 ? (
                    <div className="card text-center text-light">No notifications available.</div>
                ) : (
                    notifications.map(notif => (
                        <div key={notif.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: notif.read ? 'var(--color-surface)' : '#fef3c7', borderLeft: notif.read ? '' : '4px solid var(--color-warning)' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ paddingTop: '0.25rem' }}>
                                    <Bell size={24} style={{ color: notif.read ? 'var(--color-text-light)' : 'var(--color-warning)' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--color-primary-dark)' }}>{notif.title}</h3>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--color-text-light)' }}>{notif.date}</p>
                                    <p style={{ margin: '0' }}>{notif.message}</p>
                                </div>
                            </div>
                            {!notif.read && (
                                <button className="btn btn-secondary" onClick={() => markAsRead(notif.id!)}>
                                    <CheckSquare size={18} /> Mark Read
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Notifications;

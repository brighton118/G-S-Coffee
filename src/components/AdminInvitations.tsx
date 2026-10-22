import { useEffect, useState } from 'react';
import { MailPlus, ShieldCheck, Users, Briefcase, Eye, Crown, RefreshCw } from 'lucide-react';
import { auth } from '../firebase';
import { 
    createAdminInvite, 
    listAdminInvites, 
    listAllFarmUsers, 
    updateUserRoleByAdmin,
    type FarmUserRecord,
    type UserRole 
} from '../services/adminAccess';

const AdminInvitations = () => {
    const [email, setEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>('manager');
    const [invites, setInvites] = useState<Array<{ email: string; role: UserRole; claimed: boolean }>>([]);
    const [usersList, setUsersList] = useState<FarmUserRecord[]>([]);
    const [message, setMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const refreshData = async () => {
        setIsLoading(true);
        try {
            const [fetchedInvites, fetchedUsers] = await Promise.all([
                listAdminInvites(),
                listAllFarmUsers()
            ]);
            setInvites(fetchedInvites as Array<{ email: string; role: UserRole; claimed: boolean }>);
            setUsersList(fetchedUsers);
        } catch (error) {
            console.error('Could not refresh accounts data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshData();
    }, []);

    const handleInviteSubmit = async () => {
        setMessage('');
        setIsSaving(true);
        try {
            const adminEmail = auth.currentUser?.email;
            if (!adminEmail) throw new Error('Your administrator session has expired. Sign in again.');
            await createAdminInvite(email, adminEmail, inviteRole);
            setEmail('');
            setMessage(`Invitation created for ${inviteRole.toUpperCase()}. The user can now register with this email.`);
            await refreshData();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not create the invitation.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRoleChange = async (user: FarmUserRecord, newRole: UserRole) => {
        try {
            await updateUserRoleByAdmin(user.uid, user.email, user.name, newRole);
            setMessage(`Updated ${user.email} to ${newRole.toUpperCase()} in Firestore.`);
            await refreshData();
        } catch (err: any) {
            setMessage(`Could not update user role: ${err?.message || err}`);
        }
    };

    return (
        <section className="card" aria-labelledby="admin-invitations-title" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                <h3 id="admin-invitations-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, color: 'var(--color-primary-dark)' }}>
                    <ShieldCheck size={20} color="var(--color-primary)" />
                    Database Tables & Role Access (Admin, Manager, Staff)
                </h3>
                <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={refreshData}
                    disabled={isLoading}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                    <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
                    Refresh Tables
                </button>
            </div>

            <p className="text-light" style={{ margin: 0, fontSize: '0.875rem' }}>
                Manage registered user accounts stored in Cloud Firestore (<code>admins</code>, <code>managers</code>, <code>staff</code>, and <code>users</code> tables).
            </p>

            {/* Current Users Database Table View */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={16} /> Registered Farm Accounts ({usersList.length})
                </strong>

                {usersList.length === 0 ? (
                    <div style={{ padding: '0.8rem', borderRadius: '6px', background: 'var(--color-background)', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                        No user accounts found in Firestore. Accounts will automatically appear here once users register or sign in.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {usersList.map(u => (
                            <div 
                                key={u.uid} 
                                style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    flexWrap: 'wrap', 
                                    gap: '0.75rem', 
                                    padding: '0.65rem 0.85rem', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-background)', 
                                    border: '1px solid var(--color-border)',
                                    fontSize: '0.85rem' 
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {u.email || u.uid}
                                        {u.email === auth.currentUser?.email && (
                                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', fontWeight: 600 }}>
                                                You
                                            </span>
                                        )}
                                    </strong>
                                    <span style={{ color: 'var(--color-text-light)', fontSize: '0.78rem' }}>
                                        UID: {u.uid.slice(0, 12)}... • Name: {u.name || 'Farm User'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <label htmlFor={`role-select-${u.uid}`} style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>Role:</label>
                                    <select
                                        id={`role-select-${u.uid}`}
                                        className="form-input"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.82rem', height: 'auto', minWidth: '130px' }}
                                        value={u.role}
                                        onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                                        disabled={u.email === auth.currentUser?.email}
                                    >
                                        <option value="admin">👑 Admin</option>
                                        <option value="manager">💼 Manager</option>
                                        <option value="staff">👁️ Staff</option>
                                    </select>
                                    
                                    <span 
                                        style={{ 
                                            padding: '0.2rem 0.6rem', 
                                            borderRadius: '999px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 700,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            background: u.role === 'admin' ? '#eff6ff' : u.role === 'manager' ? '#ecfdf5' : '#f8fafc',
                                            color: u.role === 'admin' ? '#1d4ed8' : u.role === 'manager' ? '#047857' : '#475569',
                                            border: `1px solid ${u.role === 'admin' ? '#93c5fd' : u.role === 'manager' ? '#6ee7b7' : '#cbd5e1'}`
                                        }}
                                    >
                                        {u.role === 'admin' ? <Crown size={12} /> : u.role === 'manager' ? <Briefcase size={12} /> : <Eye size={12} />}
                                        {u.role.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Invite New Account */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <strong style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
                    Pre-assign Account Role by Email Invitation
                </strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                    <input
                        className="form-input"
                        type="email"
                        required
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        placeholder="user@gsfarm.farm"
                        aria-label="Email address to invite"
                        style={{ flex: '1 1 200px' }}
                    />
                    <select
                        className="form-input"
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as UserRole)}
                        style={{ flex: '0 0 auto', minWidth: '130px' }}
                    >
                        <option value="admin">👑 1. Admin</option>
                        <option value="manager">💼 2. Manager</option>
                        <option value="staff">👁️ 3. Staff</option>
                    </select>
                    <button 
                        className="btn btn-primary" 
                        type="button" 
                        disabled={isSaving || !email.trim()} 
                        onClick={handleInviteSubmit}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                        <MailPlus size={16} /> {isSaving ? 'Saving...' : 'Invite Account'}
                    </button>
                </div>
            </div>

            {message && (
                <div 
                    role="status" 
                    style={{ 
                        padding: '0.6rem 0.85rem', 
                        borderRadius: '6px', 
                        background: '#ecfdf5', 
                        border: '1px solid #a7f3d0', 
                        color: '#065f46', 
                        fontSize: '0.85rem' 
                    }}
                >
                    {message}
                </div>
            )}

            {/* Pending Invitations */}
            {invites.length > 0 && (
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', fontWeight: 600 }}>Role Invitations:</span>
                    {invites.map(invite => (
                        <div 
                            key={invite.email} 
                            style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                gap: '1rem', 
                                padding: '0.45rem 0.75rem', 
                                borderRadius: '6px', 
                                background: 'var(--color-background)', 
                                fontSize: '0.82rem' 
                            }}
                        >
                            <span>{invite.email} ({invite.role || 'admin'})</span>
                            <strong style={{ color: invite.claimed ? 'var(--color-success)' : 'var(--color-text-light)' }}>
                                {invite.claimed ? 'Accepted' : 'Pending'}
                            </strong>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default AdminInvitations;

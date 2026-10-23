import React, { useEffect, useState } from 'react';
import { 
    ShieldCheck, 
    Users, 
    Briefcase, 
    Eye, 
    Crown, 
    RefreshCw, 
    UserPlus, 
    Lock, 
    Mail, 
    User, 
    Copy, 
    Check, 
    EyeOff, 
    Trash2, 
    CheckCircle2, 
    AlertCircle 
} from 'lucide-react';
import { auth } from '../firebase';
import { useUserRole } from '../context/UserRoleContext';
import { 
    createAccountByAdmin, 
    listAllFarmUsers, 
    updateUserRoleByAdmin, 
    toggleUserActiveByAdmin, 
    deleteUserByAdmin, 
    type FarmUserRecord, 
    type UserRole 
} from '../services/adminAccess';

const AdminInvitations: React.FC = () => {
    const { isAdmin } = useUserRole();

    // Hard guard: this panel is strictly admin-only
    if (!isAdmin) return null;

    // Form state for creating accounts
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('manager');
    const [showPassword, setShowPassword] = useState(false);
    const [createdCredential, setCreatedCredential] = useState<{ email: string; password: string; role: string; name: string } | null>(null);
    const [copied, setCopied] = useState(false);

    // List and loading states
    const [usersList, setUsersList] = useState<FarmUserRecord[]>([]);
    const [message, setMessage] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const refreshData = async () => {
        setIsLoading(true);
        try {
            const fetchedUsers = await listAllFarmUsers();
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

    const generateRandomPassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
        let pass = '';
        for (let i = 0; i < 10; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setNewPassword(pass);
    };

    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setErrorMsg('');
        setIsSubmitting(true);
        setCreatedCredential(null);

        try {
            const result = await createAccountByAdmin(newName, newEmail, newPassword, newRole);
            setCreatedCredential({
                name: newName.trim(),
                email: result.email,
                password: newPassword,
                role: newRole
            });
            setMessage(`Account for ${newName.trim()} (${newRole.toUpperCase()}) created successfully!`);
            setNewName('');
            setNewEmail('');
            setNewPassword('');
            await refreshData();
        } catch (err: any) {
            setErrorMsg(err?.message || 'Could not create account.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopyCredentials = () => {
        if (!createdCredential) return;
        const text = `G&S FARM Account Details:\nName: ${createdCredential.name}\nEmail: ${createdCredential.email}\nPassword: ${createdCredential.password}\nRole: ${createdCredential.role.toUpperCase()}\nLogin URL: https://gsfarm.farm/`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const handleRoleChange = async (user: FarmUserRecord, targetRole: UserRole) => {
        try {
            await updateUserRoleByAdmin(user.uid, user.email, user.name, targetRole);
            setMessage(`Updated ${user.email} to ${targetRole.toUpperCase()}.`);
            await refreshData();
        } catch (err: any) {
            setErrorMsg(`Could not update user role: ${err?.message || err}`);
        }
    };

    const handleToggleActive = async (user: FarmUserRecord) => {
        try {
            await toggleUserActiveByAdmin(user.uid, user.active, user.role);
            setMessage(`Account for ${user.email} is now ${user.active ? 'Deactivated' : 'Active'}.`);
            await refreshData();
        } catch (err: any) {
            setErrorMsg(`Could not toggle account status: ${err?.message || err}`);
        }
    };

    const handleDeleteUser = async (user: FarmUserRecord) => {
        if (user.email === auth.currentUser?.email) {
            alert('You cannot delete your own active administrator account.');
            return;
        }
        if (!window.confirm(`Are you sure you want to remove account ${user.email}? This cannot be undone.`)) {
            return;
        }
        try {
            await deleteUserByAdmin(user.uid, user.role);
            setMessage(`Removed account for ${user.email}.`);
            await refreshData();
        } catch (err: any) {
            setErrorMsg(`Could not delete user: ${err?.message || err}`);
        }
    };

    return (
        <section className="card" aria-labelledby="admin-user-mgmt-title" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.85rem' }}>
                <div>
                    <h3 id="admin-user-mgmt-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, color: 'var(--color-primary-dark)' }}>
                        <ShieldCheck size={22} color="var(--color-primary)" />
                        User & Staff Account Management
                    </h3>
                    <p className="text-light" style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem' }}>
                        Farm Administrators create and control access for Managers (data entry) and Staff members (view-only).
                    </p>
                </div>
                <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={refreshData}
                    disabled={isLoading}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                    <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
                    Refresh Accounts
                </button>
            </div>

            {/* Account Creation Form */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <UserPlus size={18} color="var(--color-primary)" />
                    <strong style={{ fontSize: '1rem', color: '#0f172a' }}>Create Manager or Staff Account</strong>
                </div>

                <form onSubmit={handleCreateAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', alignItems: 'end' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.3rem' }}>
                            Full Name
                        </label>
                        <div style={{ position: 'relative' }}>
                            <User size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="text"
                                className="form-input"
                                required
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g. John Mukasa"
                                style={{ paddingLeft: '2.1rem', width: '100%' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.3rem' }}>
                            Email Address
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="email"
                                className="form-input"
                                required
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                placeholder="e.g. jmukasa@gsfarm.farm"
                                style={{ paddingLeft: '2.1rem', width: '100%' }}
                            />
                        </div>
                    </div>

                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                                Temporary Password
                            </label>
                            <button
                                type="button"
                                onClick={generateRandomPassword}
                                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                            >
                                ⚡ Generate
                            </button>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input"
                                required
                                minLength={6}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Min 6 characters"
                                style={{ paddingLeft: '2.1rem', paddingRight: '2rem', width: '100%' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                            >
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.3rem' }}>
                            Role & Authority
                        </label>
                        <select
                            className="form-input"
                            value={newRole}
                            onChange={e => setNewRole(e.target.value as UserRole)}
                            style={{ width: '100%', height: 'auto', padding: '0.55rem' }}
                        >
                            <option value="manager">💼 Manager (Data Entry)</option>
                            <option value="staff">👁️ Staff (View Only)</option>
                            <option value="admin">👑 Co-Administrator (Full Access)</option>
                        </select>
                    </div>

                    <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isSubmitting || !newName.trim() || !newEmail.trim() || !newPassword}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.4rem' }}
                        >
                            <UserPlus size={16} />
                            {isSubmitting ? 'Creating Account...' : `Create ${newRole.toUpperCase()} Account`}
                        </button>
                    </div>
                </form>

                {/* Newly Created Credentials Modal Banner */}
                {createdCredential && (
                    <div style={{ marginTop: '1.25rem', padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <strong style={{ color: '#15803d', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <CheckCircle2 size={18} /> Account Created Successfully
                            </strong>
                            <button
                                type="button"
                                onClick={handleCopyCredentials}
                                className="btn btn-secondary"
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                {copied ? <Check size={14} color="#15803d" /> : <Copy size={14} />}
                                {copied ? 'Copied!' : 'Copy Login Details'}
                            </button>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#166534', lineHeight: 1.6 }}>
                            <div><strong>Name:</strong> {createdCredential.name}</div>
                            <div><strong>Email:</strong> {createdCredential.email}</div>
                            <div><strong>Temporary Password:</strong> <code style={{ background: '#dcfce7', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{createdCredential.password}</code></div>
                            <div><strong>Role:</strong> {createdCredential.role.toUpperCase()}</div>
                            <div style={{ marginTop: '0.4rem', color: '#15803d', fontStyle: 'italic' }}>
                                The user can now visit <strong>https://gsfarm.farm/</strong> and sign in immediately with these credentials.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Notifications */}
            {message && (
                <div style={{ padding: '0.65rem 1rem', borderRadius: '6px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} /> {message}
                </div>
            )}
            {errorMsg && (
                <div style={{ padding: '0.65rem 1rem', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} /> {errorMsg}
                </div>
            )}

            {/* Registered Users Roster */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Users size={18} /> Active System Users ({usersList.length})
                    </strong>
                    <span className="text-light" style={{ fontSize: '0.8rem' }}>
                        {usersList.filter(u => u.role === 'admin').length} Admins • {usersList.filter(u => u.role === 'manager').length} Managers • {usersList.filter(u => u.role === 'staff').length} Staff
                    </span>
                </div>

                {usersList.length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', borderRadius: '8px', background: '#f8fafc', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                        No user accounts found. Create your first Manager or Staff member account above.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {usersList.map(u => {
                            const isCurrentUser = u.email === auth.currentUser?.email;

                            return (
                                <div 
                                    key={u.uid} 
                                    style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        flexWrap: 'wrap', 
                                        gap: '0.75rem', 
                                        padding: '0.75rem 1rem', 
                                        borderRadius: '8px', 
                                        background: u.active ? '#ffffff' : '#f8fafc', 
                                        border: `1px solid ${u.active ? '#e2e8f0' : '#cbd5e1'}`,
                                        opacity: u.active ? 1 : 0.65
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div
                                            style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '50%',
                                                backgroundColor: u.role === 'admin' ? '#eff6ff' : u.role === 'manager' ? '#ecfdf5' : '#f8fafc',
                                                color: u.role === 'admin' ? '#1d4ed8' : u.role === 'manager' ? '#047857' : '#475569',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: 700,
                                                fontSize: '0.85rem',
                                                flexShrink: 0
                                            }}
                                        >
                                            {u.role === 'admin' ? <Crown size={18} /> : u.role === 'manager' ? <Briefcase size={18} /> : <Eye size={18} />}
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{u.name || u.email}</strong>
                                                {isCurrentUser && (
                                                    <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>
                                                        Current Session
                                                    </span>
                                                )}
                                                {!u.active && (
                                                    <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>
                                                        Deactivated
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
                                                {u.email}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                        <select
                                            className="form-input"
                                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.8rem', height: 'auto', minWidth: '130px' }}
                                            value={u.role}
                                            onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                                            disabled={isCurrentUser}
                                            aria-label={`Change role for ${u.email}`}
                                        >
                                            <option value="admin">👑 Administrator</option>
                                            <option value="manager">💼 Manager</option>
                                            <option value="staff">👁️ Staff</option>
                                        </select>

                                        {!isCurrentUser && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleActive(u)}
                                                    className="btn btn-secondary"
                                                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', color: u.active ? '#991b1b' : '#15803d' }}
                                                >
                                                    {u.active ? 'Deactivate' : 'Reactivate'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteUser(u)}
                                                    className="btn btn-secondary"
                                                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: '#dc2626' }}
                                                    title="Delete account"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};

export default AdminInvitations;

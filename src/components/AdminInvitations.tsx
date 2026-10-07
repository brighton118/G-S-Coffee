import { useEffect, useState } from 'react';
import { MailPlus, ShieldCheck } from 'lucide-react';
import { auth } from '../firebase';
import { createAdminInvite, listAdminInvites } from '../services/adminAccess';

const AdminInvitations = () => {
    const [email, setEmail] = useState('');
    const [invites, setInvites] = useState<Array<{ email: string; claimed: boolean }>>([]);
    const [message, setMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const refreshInvites = async () => {
        setInvites(await listAdminInvites());
    };

    useEffect(() => {
        refreshInvites().catch(error => {
            console.error('Could not load administrator invitations:', error);
            setMessage('Could not load invitations. Please try again.');
        });
    }, []);

    const handleSubmit = async () => {
        setMessage('');
        setIsSaving(true);
        try {
            const adminEmail = auth.currentUser?.email;
            if (!adminEmail) throw new Error('Your administrator session has expired. Sign in again.');
            await createAdminInvite(email, adminEmail);
            setEmail('');
            setMessage('Invitation created. The invited administrator can now sign up with this email.');
            await refreshInvites();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not create the invitation.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="card" aria-labelledby="admin-invitations-title">
            <h3 id="admin-invitations-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={19} color="var(--color-primary)" /> Administrator Accounts
            </h3>
            <p className="text-light" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                Invite administrators by email. Workers are managed in the Workers section and do not need sign-in accounts.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                <input
                    className="form-input"
                    type="email"
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="admin@example.com"
                    aria-label="Email address to invite as administrator"
                    style={{ flex: '1 1 240px' }}
                />
                <button className="btn btn-primary" type="button" disabled={isSaving || !email.trim()} onClick={handleSubmit}>
                    <MailPlus size={16} /> {isSaving ? 'Creating...' : 'Invite admin'}
                </button>
            </div>
            {message && <p role="status" className="text-light" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>{message}</p>}
            {invites.length > 0 && (
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem' }}>
                    {invites.map(invite => (
                        <div key={invite.email} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.55rem 0.7rem', borderRadius: '6px', background: 'var(--color-background)', fontSize: '0.85rem' }}>
                            <span>{invite.email}</span>
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

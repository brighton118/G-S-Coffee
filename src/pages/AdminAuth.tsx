import { FormEvent, useState } from 'react';
import {
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword
} from 'firebase/auth';
import { Banknote, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { auth } from '../firebase';
import { isSuperAdmin } from '../services/adminAccess';
import './AdminAuth.css';

interface AdminAuthProps {
    message: string;
    onClearMessage: () => void;
}

const AdminAuth = ({ message, onClearMessage }: AdminAuthProps) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formMessage, setFormMessage] = useState('');

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setIsSubmitting(true);
        setFormMessage('');
        onClearMessage();

        try {
            const cleanEmail = email.trim().toLowerCase();
            const cleanPassword = password.trim();

            try {
                await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            } catch (authErr: any) {
                const code = authErr?.code || '';
                // If designated superadmin and account not yet created, auto-bootstrap creation
                if (isSuperAdmin(cleanEmail) && (
                    code === 'auth/user-not-found' || 
                    code === 'auth/invalid-credential' || 
                    code === 'auth/invalid-login-credentials'
                )) {
                    try {
                        await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
                        return;
                    } catch (createErr: any) {
                        if (createErr?.code === 'auth/email-already-in-use') {
                            throw new Error('Email or password is incorrect. If you forgot your password, please click "Forgot password?" below.');
                        }
                        throw createErr;
                    }
                }
                throw authErr;
            }
        } catch (error: any) {
            console.error('Firebase Auth Error:', error);
            const code = error?.code || '';
            const messages: Record<string, string> = {
                'auth/user-not-found': 'No account found for this email address. Please contact your Super Administrator.',
                'auth/wrong-password': 'Email or password is incorrect.',
                'auth/invalid-credential': 'Email or password is incorrect. Please verify your credentials.',
                'auth/invalid-login-credentials': 'Email or password is incorrect. Please verify your credentials.',
                'auth/invalid-email': 'Enter a valid email address.',
                'auth/user-disabled': 'This account has been deactivated. Please contact your administrator.',
                'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
                'auth/network-request-failed': 'Connection blocked or offline. Please check your internet connection.',
                'auth/internal-error': 'Authentication server error. Please try again in a few moments.'
            };
            setFormMessage(messages[code] || error?.message || 'Authentication failed. Please check your credentials.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        setFormMessage('');
        onClearMessage();
        if (!email.trim()) {
            setFormMessage('Enter your email address first, then choose Forgot password.');
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email.trim().toLowerCase());
            setFormMessage('If an account exists for this email, a password reset link has been sent.');
        } catch {
            setFormMessage('Could not send the reset email. Check the address and try again.');
        }
    };

    return (
        <main className="admin-auth-page">
            <section className="admin-auth-panel" aria-labelledby="admin-auth-title">
                <div className="admin-auth-brand" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src="/assets/gs_farm_logo_transparent.png" alt="G&S FARMS" style={{ height: '48px', width: 'auto', objectFit: 'contain' }} />
                    <div>
                        <strong>G&S FARMS</strong>
                        <span>Farm operations workspace</span>
                    </div>
                </div>

                <div className="admin-auth-intro">
                    <span className="admin-auth-eyebrow"><Banknote size={15} /> G&S FARMS ACCESS</span>
                    <h1 id="admin-auth-title">Sign in to your account</h1>
                    <p>
                        Sign in to access farm operations, workforce, inventory, and records.
                    </p>
                </div>

                <form className="admin-auth-form" onSubmit={handleSubmit}>
                    <label htmlFor="admin-email">Email address</label>
                    <div className="admin-auth-input-wrap">
                        <Mail size={18} aria-hidden="true" />
                        <input
                            id="admin-email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={event => setEmail(event.target.value)}
                            placeholder="gs.farms.ug@gmail.com"
                        />
                    </div>

                    <label htmlFor="admin-password">Password</label>
                    <div className="admin-auth-input-wrap">
                        <LockKeyhole size={18} aria-hidden="true" />
                        <input
                            id="admin-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            minLength={6}
                            required
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            placeholder="Enter your password"
                        />
                        <button
                            type="button"
                            className="admin-auth-password-toggle"
                            onClick={() => setShowPassword(prev => !prev)}
                            title={showPassword ? 'Hide password' : 'Show password'}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                        </button>
                    </div>

                    {(formMessage || message) && (
                        <div className="admin-auth-message" role="alert">
                            {formMessage || message}
                        </div>
                    )}

                    <button className="btn btn-primary admin-auth-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                    <button type="button" className="admin-auth-reset" onClick={handlePasswordReset}>
                        Forgot password?
                    </button>
                </div>

                <p className="admin-auth-footnote">
                    Authorized personnel only. Managers and Staff accounts are created directly by the Super Administrator.
                </p>
            </section>
            <aside className="admin-auth-aside" aria-hidden="true">
                <div className="admin-auth-aside-content">
                    <span>GROW WITH CONFIDENCE</span>
                    <h2>Your farm.<br />Your records.<br />One secure place.</h2>
                    <p>Sign in to oversee your workforce, inventory, production and payroll.</p>
                </div>
            </aside>
        </main>
    );
};

export default AdminAuth;

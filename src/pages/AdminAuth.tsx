import { FormEvent, useState } from 'react';
import {
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword
} from 'firebase/auth';
import { Banknote, Coffee, LockKeyhole, Mail } from 'lucide-react';
import { auth } from '../firebase';
import './AdminAuth.css';

interface AdminAuthProps {
    message: string;
    onClearMessage: () => void;
}

const AdminAuth = ({ message, onClearMessage }: AdminAuthProps) => {
    const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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

            if (mode === 'signUp') {
                await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
                setFormMessage('Administrator account created successfully! Signing in...');
            } else {
                await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            }
        } catch (error: any) {
            console.error('Firebase Auth Error:', error);
            const code = error?.code || '';
            const messages: Record<string, string> = {
                'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
                'auth/operation-not-allowed': 'Email/password sign-in is not enabled for this Firebase project. Please enable it in Firebase Console.',
                'auth/invalid-credential': 'Email or password is incorrect.',
                'auth/invalid-email': 'Enter a valid email address.',
                'auth/weak-password': 'Use a password with at least 6 characters.',
                'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
                'auth/network-request-failed': 'Connection blocked or offline. Disable browser ad-blockers/shields for this site or try "Continue with Google".',
                'auth/internal-error': 'Authentication server error. Check email format or try "Continue with Google" for instant sign-in.'
            };
            setFormMessage(messages[code] || error?.message || 'Authentication failed. Please try again.');
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

    const switchMode = (nextMode: 'signIn' | 'signUp') => {
        setMode(nextMode);
        setFormMessage('');
        onClearMessage();
    };

    return (
        <main className="admin-auth-page">
            <section className="admin-auth-panel" aria-labelledby="admin-auth-title">
                <div className="admin-auth-brand">
                    <div className="admin-auth-brand-icon"><Coffee size={27} /></div>
                    <div>
                        <strong>G&S COFFEE Farm</strong>
                        <span>Farm operations workspace</span>
                    </div>
                </div>

                <div className="admin-auth-intro">
                    <span className="admin-auth-eyebrow"><Banknote size={15} /> ADMIN ACCESS</span>
                    <h1 id="admin-auth-title">{mode === 'signIn' ? 'Welcome back' : 'Create admin account'}</h1>
                    <p>
                        {mode === 'signIn'
                            ? 'Sign in to manage your farm operations and records.'
                            : 'The first account becomes the initial administrator. After setup, new admins must be invited.'}
                    </p>
                </div>

                <div className="admin-auth-tabs" role="tablist" aria-label="Administrator access">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'signIn'}
                        className={mode === 'signIn' ? 'is-active' : ''}
                        onClick={() => switchMode('signIn')}
                    >
                        Sign in
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'signUp'}
                        className={mode === 'signUp' ? 'is-active' : ''}
                        onClick={() => switchMode('signUp')}
                    >
                        Sign up
                    </button>
                </div>

                <form className="admin-auth-form" onSubmit={handleSubmit}>
                    <label htmlFor="admin-email">Administrator email</label>
                    <div className="admin-auth-input-wrap">
                        <Mail size={18} aria-hidden="true" />
                        <input
                            id="admin-email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={event => setEmail(event.target.value)}
                            placeholder="name@example.com"
                        />
                    </div>

                    <label htmlFor="admin-password">Password</label>
                    <div className="admin-auth-input-wrap">
                        <LockKeyhole size={18} aria-hidden="true" />
                        <input
                            id="admin-password"
                            type="password"
                            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                            minLength={6}
                            required
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            placeholder="At least 6 characters"
                        />
                    </div>

                    {(formMessage || message) && (
                        <div className="admin-auth-message" role="alert">
                            {formMessage || message}
                        </div>
                    )}

                    <button className="btn btn-primary admin-auth-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Please wait...' : mode === 'signIn' ? 'Sign in as admin' : 'Create admin account'}
                    </button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>OR</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                </div>

                <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.65rem' }}
                    onClick={async () => {
                        setIsSubmitting(true);
                        setFormMessage('');
                        try {
                            const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
                            const provider = new GoogleAuthProvider();
                            await signInWithPopup(auth, provider);
                        } catch (err: any) {
                            setFormMessage(err?.message || 'Google sign-in failed. Please try again.');
                        } finally {
                            setIsSubmitting(false);
                        }
                    }}
                    disabled={isSubmitting}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    Continue with Google
                </button>

                {mode === 'signIn' && (
                    <button type="button" className="admin-auth-reset" onClick={handlePasswordReset}>
                        Forgot password?
                    </button>
                )}

                <p className="admin-auth-footnote">
                    Administrator access only. Workers do not need accounts to be added to the system.
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

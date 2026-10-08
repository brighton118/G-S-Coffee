import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import Layout from './components/Layout';
import AdminAuth from './pages/AdminAuth';
import Dashboard from './pages/Dashboard';
import CloneProduction from './pages/CloneProduction';
import Workers from './pages/Workers';
import Inventory from './pages/Inventory';
import ScanAttendance from './pages/ScanAttendance';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import WorkerProfile from './pages/WorkerProfile';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Payroll from './pages/Payroll';
import Attendance from './pages/Attendance';
import { firestoreSyncService } from './services/firestoreSync';
import { clearSeededDemoData } from './clearDemoData';
import { notificationService } from './utils/notificationService';
import { auth } from './firebase';
import { ensureAdminAccess } from './services/adminAccess';

const App = () => {
    const [adminUser, setAdminUser] = useState<FirebaseUser | null>(null);
    const [authStatus, setAuthStatus] = useState<'loading' | 'signedOut' | 'checking' | 'authorized'>('loading');
    const [authMessage, setAuthMessage] = useState('');

    useEffect(() => {
        let isMounted = true;
        let authCheck = 0;
        const unsubscribe = onAuthStateChanged(auth, async user => {
            const currentCheck = ++authCheck;
            if (!user) {
                setAdminUser(null);
                setAuthStatus('signedOut');
                return;
            }

            setAuthStatus('checking');
            try {
                await ensureAdminAccess(user);
                if (isMounted && currentCheck === authCheck) {
                    setAuthMessage('');
                    setAdminUser(user);
                    setAuthStatus('authorized');
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'This account is not authorized as a farm administrator.';
                if (isMounted && currentCheck === authCheck) {
                    setAuthMessage(message);
                    setAdminUser(null);
                    setAuthStatus('signedOut');
                    await signOut(auth);
                }
            }
        }, error => {
            console.error('Could not check administrator sign-in:', error);
            if (isMounted) {
                setAuthMessage('Could not verify your sign-in. Check your connection and reload.');
                setAuthStatus('signedOut');
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (authStatus !== 'authorized' || !adminUser) return;
        let isMounted = true;

        const syncInterval = setInterval(() => {
            firestoreSyncService.syncLocalToCloud();
        }, 5 * 60 * 1000);

        const notificationInterval = setInterval(() => {
            notificationService.runAllNotificationChecks();
        }, 1000 * 60 * 60);

        const initializeData = async () => {
            try {
                await clearSeededDemoData();
                await firestoreSyncService.syncCloudToLocal();
                await firestoreSyncService.syncLocalToCloud();
                firestoreSyncService.startRealtimeSync();
                await notificationService.runAllNotificationChecks();
            } catch (error) {
                console.error('System data initialization failed:', error);
                if (isMounted) {
                    const message = error instanceof Error ? error.message : String(error);
                    window.alert(`System setup could not be completed. Cloud sync is paused to protect your data. Please check your connection and reload. Details: ${message}`);
                }
            }
        };

        void initializeData();
        return () => {
            isMounted = false;
            clearInterval(notificationInterval);
            clearInterval(syncInterval);
            firestoreSyncService.stopRealtimeSync();
        };
    }, [adminUser, authStatus]);

    if (authStatus === 'loading' || authStatus === 'checking') {
        return (
            <div className="admin-auth-loading" role="status">
                <span className="admin-auth-loading-spinner" />
                <span>{authStatus === 'checking' ? 'Verifying administrator access...' : 'Loading sign-in...'}</span>
            </div>
        );
    }

    if (authStatus !== 'authorized') {
        return <AdminAuth message={authMessage} onClearMessage={() => setAuthMessage('')} />;
    }

    return (
        <Router>
            <Layout adminEmail={adminUser?.email || ''} onSignOut={() => signOut(auth)}>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/clones" element={<CloneProduction />} />
                    <Route path="/workers" element={<Workers />} />
                    <Route path="/attendance" element={<Attendance />} />
                    <Route path="/worker/:workerId" element={<WorkerProfile />} />
                    <Route path="/scan" element={<ScanAttendance />} />
                    <Route path="/payroll" element={<Payroll />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/settings" element={<Settings />} />
                </Routes>
            </Layout>
        </Router>
    );
};

export default App;

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
import { firestoreSyncService, backfillAttendanceWorkerNames } from './services/firestoreSync';
import { clearSeededDemoData } from './clearDemoData';
import { notificationService } from './utils/notificationService';
import { ensureAdminAccess, getUserRole, isSuperAdmin } from './services/adminAccess';
import { auth } from './firebase';
import { syncPayrollMonth } from './services/payrollSync';
import { UserRoleContext, type UserRole } from './context/UserRoleContext';

const App = () => {
    const [adminUser, setAdminUser] = useState<FirebaseUser | null>(null);
    const [userRole, setUserRole] = useState<UserRole>('staff');
    const [authStatus, setAuthStatus] = useState<'loading' | 'signedOut' | 'checking' | 'authorized'>('loading');
    const [authMessage, setAuthMessage] = useState('');

    useEffect(() => {
        let isMounted = true;
        let authCheck = 0;
        const unsubscribe = onAuthStateChanged(auth, async user => {
            const currentCheck = ++authCheck;
            if (!user) {
                setAdminUser(null);
                setUserRole('staff');
                localStorage.removeItem('gs_user_role');
                setAuthStatus('signedOut');
                return;
            }

            try {
                const role = await getUserRole(user);
                if (isMounted) {
                    setUserRole(role);
                    localStorage.setItem(`gs_user_role_${user.uid}`, role);
                    localStorage.setItem('gs_user_role', role);
                }
            } catch (roleErr) {
                console.warn('Could not read user role:', roleErr);
            }

            if (isMounted && currentCheck === authCheck) {
                setAuthMessage('');
                setAdminUser(user);
                setAuthStatus('authorized');
            }

            try {
                await ensureAdminAccess(user);
            } catch (error) {
                console.warn('Admin profile background sync note:', error);
            }
        }, error => {
            console.error('Could not check administrator sign-in:', error);
            if (isMounted) {
                setAuthMessage('Could not verify your sign-in. Check your connection and reload.');
                setAuthStatus('signedOut');
            }
        });

        // Safety fallback: Never keep the user on the loading spinner for more than 3.5 seconds
        const safetyTimer = setTimeout(() => {
            if (isMounted && authStatus === 'loading') {
                if (!auth.currentUser) {
                    setAuthStatus('signedOut');
                } else {
                    setAdminUser(auth.currentUser);
                    setAuthStatus('authorized');
                }
            }
        }, 3500);

        return () => {
            isMounted = false;
            clearTimeout(safetyTimer);
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (authStatus !== 'authorized' || !adminUser) return;
        let isMounted = true;

        const syncInterval = setInterval(() => {
            void firestoreSyncService.syncNow();
        }, 60 * 1000);

        const handleFocus = () => {
            void firestoreSyncService.syncNow();
        };
        window.addEventListener('focus', handleFocus);

        const notificationInterval = setInterval(() => {
            notificationService.runAllNotificationChecks();
        }, 1000 * 60 * 60);
        const payrollInterval = setInterval(() => {
            const now = new Date();
            const payrollMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            void syncPayrollMonth(payrollMonth, now).catch(error => {
                console.error('Automatic payroll synchronization failed.', error);
            });
        }, 60 * 1000);

        const initializeData = async () => {
            try {
                await clearSeededDemoData();
                await firestoreSyncService.syncNow();
                await backfillAttendanceWorkerNames();
                const now = new Date();
                const payrollMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                try {
                    await syncPayrollMonth(payrollMonth, now);
                } catch (error) {
                    console.error('Could not calculate payroll during system startup.', error);
                }
                firestoreSyncService.startRealtimeSync();
                await notificationService.runAllNotificationChecks();
            } catch (error) {
                console.error('System data initialization failed:', error);
                if (isMounted) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.warn(`System setup note: ${message}`);
                }
            }
        };

        void initializeData();
        return () => {
            isMounted = false;
            window.removeEventListener('focus', handleFocus);
            clearInterval(notificationInterval);
            clearInterval(payrollInterval);
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
        <UserRoleContext.Provider
            value={{
                role: userRole,
                isAdmin: userRole === 'admin',
                isSuperAdmin: isSuperAdmin(adminUser?.email),
                isManager: userRole === 'manager',
                isStaff: userRole === 'staff',
                canEdit: userRole === 'admin' || userRole === 'manager',
                userEmail: adminUser?.email || '',
                userName: adminUser?.displayName || adminUser?.email?.split('@')[0] || ''
            }}
        >
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
        </UserRoleContext.Provider>
    );
};

export default App;

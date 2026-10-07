import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
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

const App = () => {
    useEffect(() => {
        let isMounted = true;
        let isInitialized = false;

        const syncInterval = setInterval(() => {
            if (isInitialized) {
                firestoreSyncService.syncLocalToCloud();
            }
        }, 5 * 60 * 1000); // Background cloud backup every 5 minutes

        const initializeData = async () => {
            try {
                await clearSeededDemoData();
                await firestoreSyncService.syncCloudToLocal();
                await firestoreSyncService.syncLocalToCloud();
                firestoreSyncService.startRealtimeSync();
                isInitialized = true;
                await notificationService.runAllNotificationChecks();
            } catch (error) {
                console.error('System data initialization failed:', error);
                if (isMounted) {
                    const message = error instanceof Error ? error.message : String(error);
                    window.alert(`Demo data cleanup could not be completed. Cloud sync is paused to prevent demo data from returning. Please check your connection and reload. Details: ${message}`);
                }
            }
        };

        void initializeData();

        // Run automated system notifications check (Low stock, chamber overdue, pending OT, EOD)
        const runSystemChecks = () => {
            notificationService.runAllNotificationChecks();
        };

        runSystemChecks();
        const notificationInterval = setInterval(runSystemChecks, 1000 * 60 * 60); // Check every hour

        return () => {
            isMounted = false;
            clearInterval(notificationInterval);
            clearInterval(syncInterval);
            firestoreSyncService.stopRealtimeSync();
        };
    }, []);

    return (
        <Router>
            <Layout>
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

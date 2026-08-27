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
import { seedDemoData } from './seed';
import { createFirestoreTables } from './seedFirestore';
import { format } from 'date-fns';
import { db } from './db';

const App = () => {
    useEffect(() => {
        seedDemoData();
        createFirestoreTables();

        const generateEODReport = async () => {
            const now = new Date();
            // Trigger EOD logic if past 5:00 PM (17:00)
            if (now.getHours() >= 17) {
                const today = format(now, 'yyyy-MM-dd');
                const existing = await db.notifications.where({ date: today, type: 'EOD_ATTENDANCE' }).first();

                if (!existing) {
                    const allWorkers = await db.workers.where('status').equals('Active').toArray();
                    const todayAttendance = await db.attendance.where('date').equals(today).toArray();

                    const totalWorkers = allWorkers.length;
                    const presentCount = todayAttendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
                    const absentCount = totalWorkers - presentCount;

                    await db.notifications.add({
                        type: 'EOD_ATTENDANCE',
                        title: 'End of Day Attendance Report',
                        message: `System Verification Complete: Out of ${totalWorkers} active workers, ${presentCount} attended their shift today and ${absentCount} were formally absent.`,
                        date: today,
                        read: 0
                    });
                }
            }
        };

        generateEODReport();
        const intervalId = setInterval(generateEODReport, 1000 * 60 * 60); // check strictly every hour

        return () => clearInterval(intervalId);
    }, []);

    return (
        <Router>
            <Layout>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/clones" element={<CloneProduction />} />
                    <Route path="/workers" element={<Workers />} />
                    <Route path="/worker/:workerId" element={<WorkerProfile />} />
                    <Route path="/scan" element={<ScanAttendance />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/activity" element={<div>Activity Logs Page</div>} />
                    <Route path="/settings" element={<div>Settings Page</div>} />
                </Routes>
            </Layout>
        </Router>
    );
};

export default App;

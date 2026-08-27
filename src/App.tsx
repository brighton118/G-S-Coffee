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
import { seedDemoData } from './seed';

const App = () => {
    useEffect(() => {
        seedDemoData();
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
                    <Route path="/notifications" element={<div>Notifications Page</div>} />
                    <Route path="/activity" element={<div>Activity Logs Page</div>} />
                    <Route path="/settings" element={<div>Settings Page</div>} />
                </Routes>
            </Layout>
        </Router>
    );
};

export default App;

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { UserCircle2, ArrowRight } from 'lucide-react';
import './ScanAttendance.css';

const WorkerProfile = () => {
    const { workerId } = useParams();
    const navigate = useNavigate();
    const [worker, setWorker] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWorker = async () => {
            if (workerId) {
                const found = await db.workers.get(workerId);
                setWorker(found);
            }
            setLoading(false);
        };
        fetchWorker();
    }, [workerId]);

    if (loading) {
        return (
            <div className="scan-wrapper">
                <div className="scanner-container card">
                    <div className="scan-feedback">
                        <div className="spinner"></div>
                        <p>Loading Worker Profile...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!worker) {
        return (
            <div className="scan-wrapper">
                <div className="scanner-container card">
                    <div className="scan-feedback error">
                        <div className="feedback-details">
                            <h3>WORKER NOT FOUND</h3>
                            <p>This G$S Coffee Farm worker profile could not be found.</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="scan-wrapper">
            <div className="scanner-container card" style={{ padding: '0', maxWidth: '500px', margin: '0 auto', width: '100%' }}>
                <div className="worker-profile-modal" style={{ border: 'none', borderRadius: '0' }}>
                    <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
                        <h4 style={{ color: 'var(--color-primary-dark)', letterSpacing: '2px', margin: 0 }}>G$S COFFEE FARM</h4>
                    </div>
                    <div className="worker-header" style={{ flexDirection: 'column', textAlign: 'center' }}>
                        <div className="worker-avatar">
                            <UserCircle2 size={100} className="text-light" />
                        </div>
                        <div>
                            <h2 style={{ textTransform: 'uppercase', fontSize: '2rem', margin: '0.5rem 0' }}>{worker.fullName}</h2>
                            {worker.status !== 'Active' ? (
                                <span className="badge badge-danger" style={{ display: 'inline-block', marginBottom: '0.5rem', fontSize: '1rem' }}>INACTIVE WORKER</span>
                            ) : (
                                <span className="badge badge-success" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>Active</span>
                            )}
                        </div>
                    </div>

                    <div className="worker-details-grid" style={{ fontSize: '1rem', padding: '2rem' }}>
                        <p><strong>Worker ID:</strong> {worker.workerId}</p>
                        <p><strong>Farm Card:</strong> {worker.farmCardNumber}</p>
                        <p><strong>Position:</strong> {worker.position}</p>
                        <p><strong>Department:</strong> {worker.department}</p>
                        <p><strong>Phone:</strong> {worker.phoneNumber}</p>
                        <p><strong>Date Joined:</strong> {worker.dateJoined}</p>
                    </div>

                    <div className="action-buttons" style={{ padding: '2rem', paddingTop: '0' }}>
                        <button className="btn btn-primary btn-lg" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate('/scan')}>
                            Record Attendance <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkerProfile;

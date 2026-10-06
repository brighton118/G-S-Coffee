import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db';
import { UserCircle2, ArrowRight, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { formatUGX } from '../utils/calculations';
import './ScanAttendance.css';

const WorkerProfile = () => {
    const { workerId } = useParams();
    const navigate = useNavigate();
    const [worker, setWorker] = useState<any>(null);
    const [currentPayroll, setCurrentPayroll] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWorker = async () => {
            if (workerId) {
                const found = await db.workers.get(workerId);
                setWorker(found);

                const currentMonth = format(new Date(), 'yyyy-MM');
                const payroll = await db.payrollRecords
                    .where({ workerId })
                    .filter(p => p.payrollMonth === currentMonth || p.payrollPeriod === currentMonth)
                    .first();
                setCurrentPayroll(payroll);
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
            <div className="scanner-container card" style={{ padding: '0', maxWidth: '550px', margin: '0 auto', width: '100%' }}>
                <div className="worker-profile-modal" style={{ border: 'none', borderRadius: '0' }}>
                    <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
                        <h4 style={{ color: 'var(--color-primary-dark)', letterSpacing: '2px', margin: 0 }}>G$S COFFEE FARM</h4>
                    </div>
                    <div className="worker-header" style={{ flexDirection: 'column', textAlign: 'center' }}>
                        <div className="worker-avatar">
                            <UserCircle2 size={90} className="text-light" />
                        </div>
                        <div>
                            <h2 style={{ textTransform: 'uppercase', fontSize: '1.8rem', margin: '0.5rem 0' }}>{worker.fullName}</h2>
                            {worker.status !== 'Active' ? (
                                <span className="badge badge-danger" style={{ display: 'inline-block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>INACTIVE WORKER</span>
                            ) : (
                                <span className="badge badge-success" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>Active</span>
                            )}
                        </div>
                    </div>

                    <div className="worker-details-grid" style={{ fontSize: '0.95rem', padding: '1.5rem 2rem' }}>
                        <p><strong>Worker ID:</strong> {worker.workerId}</p>
                        <p><strong>Farm Card:</strong> {worker.farmCardNumber}</p>
                        <p><strong>Phone:</strong> {worker.phoneNumber}</p>
                        <p><strong>Date Joined:</strong> {worker.dateJoined}</p>
                        <p><strong>Monthly Salary:</strong> {formatUGX(worker.monthlySalary || 0)}</p>
                        <p><strong>Overtime Rate:</strong> {formatUGX(worker.overtimeRate || 3500)}/hr</p>
                    </div>

                    {/* Financial Summary Card */}
                    <div style={{ margin: '0 1.5rem 1.5rem', padding: '1rem', background: 'var(--color-background)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--color-primary-dark)' }}>Current Month Payroll ({format(new Date(), 'MMMM yyyy')})</strong>
                            <span className={`badge ${currentPayroll?.status === 'Paid' ? 'badge-success' : currentPayroll?.status === 'Partially Paid' ? 'badge-warning' : 'badge-secondary'}`}>
                                {currentPayroll?.status || 'Pending'}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <div>
                                <span className="text-light">Net Pay:</span>
                                <div><strong>{formatUGX(currentPayroll?.netPay || worker.monthlySalary || 0)}</strong></div>
                            </div>
                            <div>
                                <span className="text-light">Paid:</span>
                                <div style={{ color: '#16a34a' }}><strong>{formatUGX(currentPayroll?.amountPaid || 0)}</strong></div>
                            </div>
                            <div>
                                <span className="text-light">Balance:</span>
                                <div style={{ color: (currentPayroll?.balance || 0) > 0 ? '#dc2626' : 'var(--color-text)' }}>
                                    <strong>{formatUGX(currentPayroll ? currentPayroll.balance : (worker.monthlySalary || 0))}</strong>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="action-buttons" style={{ padding: '0 1.5rem 1.5rem', display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
                        <button className="btn btn-primary btn-lg" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate('/payroll')}>
                            <Banknote size={18} /> Open Payroll Module
                        </button>
                        <button className="btn btn-secondary" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate('/scan')}>
                            Record Attendance Scan <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkerProfile;


import { useState, useEffect } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { db } from '../db';
import { format } from 'date-fns';
import { CheckCircle2, AlertTriangle, UserCircle2 } from 'lucide-react';
import './ScanAttendance.css';

const ScanAttendance = () => {
    const [scanState, setScanState] = useState<'scanning' | 'identifying' | 'identified' | 'success' | 'error' | 'inactive' | 'early_scan'>('scanning');
    const [scannedWorker, setScannedWorker] = useState<any>(null);
    const [todayAttendance, setTodayAttendance] = useState<any>(null);

    let html5QrcodeScanner: any = null;

    useEffect(() => {
        if (scanState === 'scanning') {
            const scannerId = "reader";
            html5QrcodeScanner = new Html5QrcodeScanner(scannerId, {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
            }, false);

            html5QrcodeScanner.render(
                async (decodedText: string) => {
                    html5QrcodeScanner.pause(true);
                    setScanState('identifying');
                    await handleIdentify(decodedText);
                },
                () => { } // ignore frequent scan errors
            );
        }

        return () => {
            if (html5QrcodeScanner) {
                html5QrcodeScanner.clear().catch(console.error);
            }
        };
    }, [scanState]);

    const handleIdentify = async (scannedText: string) => {
        const workerId = scannedText.split('/').pop() || scannedText;
        const worker = await db.workers.get(workerId);

        if (!worker) {
            setScanState('error');
            return;
        }

        setScannedWorker(worker);

        if (worker.status !== 'Active') {
            setScanState('inactive');
            return;
        }

        const today = format(new Date(), 'yyyy-MM-dd');
        const now = format(new Date(), 'HH:mm');
        const existingRecord = await db.attendance.where({ workerId, date: today }).first();

        let finalRecord = existingRecord;

        if (!existingRecord) {
            // Auto Time In
            const isLate = now > '08:00';
            await db.attendance.add({
                workerId: worker.workerId,
                date: today,
                timeIn: now,
                status: isLate ? 'Late' : 'Present',
                isLate
            });

            await db.activityLogs.add({
                user: 'System QR', action: 'Time In', module: 'Attendance',
                recordIdentifier: worker.workerId, date: new Date().toISOString(),
                description: `Auto Time In at ${now}`
            });
            finalRecord = await db.attendance.where({ workerId, date: today }).first();
            setTodayAttendance(finalRecord);
            setScanState('success');
        } else if (existingRecord && !existingRecord.timeOut) {
            // Auto Time Out protect against accidental immediate re-scans (7 hr minimum)
            const timeInDate = new Date(`${today}T${existingRecord.timeIn}:00`);
            const nowDate = new Date(`${today}T${now}:00`);
            const hoursDiff = (nowDate.getTime() - timeInDate.getTime()) / (1000 * 60 * 60);

            if (hoursDiff < 7) {
                setTodayAttendance(existingRecord);
                setScanState('early_scan');
            } else {
                await db.attendance.update(existingRecord.id!, { timeOut: now });
                await db.activityLogs.add({
                    user: 'System QR', action: 'Time Out', module: 'Attendance',
                    recordIdentifier: worker.workerId, date: new Date().toISOString(),
                    description: `Auto Time Out at ${now}`
                });
                finalRecord = await db.attendance.get(existingRecord.id!);
                setTodayAttendance(finalRecord);
                setScanState('success');
            }
        } else {
            setTodayAttendance(finalRecord);
            setScanState('success');
        }

        setTimeout(() => {
            setScannedWorker(null);
            setTodayAttendance(null);
            setScanState('scanning');
        }, 5000);
    };

    const resetScanner = () => {
        setScannedWorker(null);
        setTodayAttendance(null);
        setScanState('scanning');
    };

    return (
        <div className="scan-wrapper">
            <div className="header-action">
                <div>
                    <h1>Attendance Scanner</h1>
                    <p className="text-light">Scan worker Farm Card QR codes to record daily attendance.</p>
                </div>
            </div>

            <div className="scanner-container card">
                {scanState === 'scanning' && (
                    <div id="reader" style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}></div>
                )}

                {scanState === 'identifying' && (
                    <div className="scan-feedback">
                        <div className="spinner"></div>
                        <p>Identifying Worker...</p>
                    </div>
                )}

                {scanState === 'error' && (
                    <div className="scan-feedback error">
                        <AlertTriangle size={36} />
                        <div className="feedback-details">
                            <h3>Worker Not Found</h3>
                            <p>This QR code is not registered to a G$S Coffee Farm worker.</p>
                        </div>
                        <button className="btn btn-primary" onClick={resetScanner} style={{ marginTop: '1rem' }}>
                            Scan Again
                        </button>
                    </div>
                )}

                {(scanState === 'identified' || scanState === 'success' || scanState === 'inactive' || scanState === 'early_scan') && scannedWorker && (
                    <div className="worker-profile-modal">
                        {scanState === 'success' && (
                            <div className="success-banner">
                                <CheckCircle2 size={20} style={{ marginRight: '8px' }} />
                                {todayAttendance?.timeOut ? 'TIME OUT RECORDED' : 'ATTENDANCE RECORDED'}
                            </div>
                        )}
                        {scanState === 'early_scan' && (
                            <div className="success-banner" style={{ background: '#fef08a', color: '#854d0e', borderColor: '#eab308' }}>
                                <AlertTriangle size={20} style={{ marginRight: '8px' }} />
                                ALREADY TIMED IN (Requires full 7 hours to Time Out)
                            </div>
                        )}

                        <div style={{ textAlign: 'center', paddingTop: '1.5rem' }}>
                            <h4 style={{ color: 'var(--color-primary-dark)', letterSpacing: '2px', margin: 0 }}>G$S COFFEE FARM</h4>
                        </div>
                        <div className="worker-header" style={{ flexDirection: 'column', textAlign: 'center' }}>
                            <div className="worker-avatar">
                                <UserCircle2 size={80} className="text-light" />
                            </div>
                            <div>
                                <h2 style={{ textTransform: 'uppercase', fontSize: '1.8rem', margin: '0.5rem 0' }}>{scannedWorker.fullName}</h2>
                                {scanState === 'inactive' && <span className="badge badge-danger" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>Worker Account Inactive</span>}
                            </div>
                        </div>

                        <div className="worker-details-grid">
                            <p><strong>Worker ID:</strong> {scannedWorker.workerId}</p>
                            <p><strong>Farm Card:</strong> {scannedWorker.farmCardNumber}</p>
                            <p><strong>Position:</strong> {scannedWorker.position}</p>
                            <p><strong>Department:</strong> {scannedWorker.department}</p>
                            <p><strong>Phone:</strong> {scannedWorker.phoneNumber}</p>
                            <p><strong>Date Joined:</strong> {scannedWorker.dateJoined}</p>
                            <p><strong>Status:</strong> {todayAttendance?.status || 'Present'}</p>
                        </div>

                        <div className="attendance-status-box">
                            <h4>TODAY'S ATTENDANCE</h4>
                            {todayAttendance ? (
                                <div className="attendance-info">
                                    <p>Date: {todayAttendance.date}</p>
                                    <p>Time In: {todayAttendance.timeIn}</p>
                                    <p>Time Out: {todayAttendance.timeOut || '—'}</p>
                                    <p>Status: <strong>{todayAttendance.timeOut ? 'COMPLETED' : 'WORKING'}</strong></p>
                                </div>
                            ) : (
                                <div className="attendance-info">
                                    <p style={{ textAlign: 'center', margin: '1rem 0', fontWeight: 'bold' }}>Not Checked In</p>
                                </div>
                            )}
                        </div>

                        {(scanState === 'success' || scanState === 'early_scan') && (
                            <div className="action-buttons">
                                <button className="btn btn-secondary btn-lg" onClick={resetScanner}>Scan Next Now</button>
                            </div>
                        )}

                        {scanState === 'inactive' && (
                            <div className="action-buttons">
                                <button className="btn btn-secondary" onClick={resetScanner}>Scan Next</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
    );
};

export default ScanAttendance;

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { db, Worker, AttendanceRecord } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { 
    CheckCircle2, 
    AlertTriangle, 
    UserCircle2, 
    Clock, 
    QrCode, 
    Play, 
    Square, 
    ArrowRight, 
    Users, 
    Volume2,
    VolumeX,
    Sun,
    Sunset,
    Sparkles
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { loadAttendanceScheduleSettings } from '../utils/attendanceSchedule';
import { calculateWorkingHours, timeToMinutes } from '../utils/calculations';
import { syncPayrollMonth } from '../services/payrollSync';
import { firestoreSyncService } from '../services/firestoreSync';
import './ScanAttendance.css';

/**
 * Pleasant Web Audio API beeps for rapid physical card feedback
 */
function playBeep(type: 'success' | 'overtime' | 'info' | 'error') {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'success') {
            // Pleasant double-chime (A5 -> D6)
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'overtime') {
            // Chime for overtime logged
            osc.frequency.setValueAtTime(659.25, now);
            osc.frequency.setValueAtTime(880, now + 0.09);
            osc.frequency.setValueAtTime(1318.5, now + 0.18);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.32);
            osc.start(now);
            osc.stop(now + 0.32);
        } else if (type === 'info') {
            // Soft notice tone
            osc.frequency.setValueAtTime(587.33, now);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
            osc.start(now);
            osc.stop(now + 0.16);
        } else {
            // Low buzz for unknown card / inactive
            osc.frequency.setValueAtTime(260, now);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
            osc.start(now);
            osc.stop(now + 0.28);
        }
    } catch {
        // Safe ignore
    }
}

interface ScanResultFeedback {
    statusType: 
        | 'timeIn_present' 
        | 'timeIn_late' 
        | 'timeOut_ontime' 
        | 'timeOut_overtime' 
        | 'already_in' 
        | 'already_out' 
        | 'missing_clockin' 
        | 'inactive' 
        | 'error';
    worker: Worker | null;
    title: string;
    message: string;
    timestamp: string;
    record?: AttendanceRecord;
    overtimeHours?: number;
    hoursWorked?: number;
}

const ScanAttendance = () => {
    const navigate = useNavigate();
    const todayDateStr = format(new Date(), 'yyyy-MM-dd');
    const schedule = useMemo(() => loadAttendanceScheduleSettings(), []);

    // Mode: 'auto' (morning=timeIn, afternoon=timeOut & overtime threshold) | 'timeIn' | 'timeOut'
    const [scanMode, setScanMode] = useState<'auto' | 'timeIn' | 'timeOut'>('auto');
    const [isScanning, setIsScanning] = useState<boolean>(true);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [lastScanResult, setLastScanResult] = useState<ScanResultFeedback | null>(null);
    const [payrollSyncWarning, setPayrollSyncWarning] = useState('');

    // Active session counter
    const [sessionScanCount, setSessionScanCount] = useState<number>(0);

    // Track each card independently so a slow write for one worker cannot block the next scan.
    const processingCodesRef = useRef<Set<string>>(new Set());
    const lastScanRef = useRef<Map<string, number>>(new Map());

    // Live query for all of today's attendance records to display roster
    const todayAttendance = useLiveQuery(
        () => db.attendance.where('date').equals(todayDateStr).toArray(),
        [todayDateStr]
    ) || [];

    const workers = useLiveQuery(() => db.workers.toArray()) || [];
    const workerMap = useMemo(() => new Map(workers.map(w => [w.workerId, w])), [workers]);

    // Current time indicator
    const [currentTimeStr, setCurrentTimeStr] = useState<string>(format(new Date(), 'HH:mm:ss'));
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTimeStr(format(new Date(), 'HH:mm:ss'));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const nowHHmm = currentTimeStr.slice(0, 5);
    const isAfternoon = nowHHmm >= schedule.attendanceTimeOutStart;
    const isBeyondOvertimeThreshold = nowHHmm > schedule.attendanceTimeOutEnd;

    const syncPayrollAfterAttendance = useCallback(async (date: string) => {
        try {
            await syncPayrollMonth(date.slice(0, 7));
        } catch (error) {
            console.error('Attendance was saved, but its payroll calculation failed.', error);
            const message = error instanceof Error ? error.message : String(error);
            setPayrollSyncWarning(`Attendance saved, but payroll recalculation note: ${message}`);
        }
    }, []);

    const handleIdentify = useCallback(async (scannedText: string) => {
        const rawCode = scannedText.trim();
        const parsedKey = rawCode.split('/').pop()?.trim() || rawCode;
        let worker = await db.workers.get(parsedKey);
        if (!worker) {
            worker = await db.workers.where('phoneNumber').equals(parsedKey).first();
        }
        if (!worker) {
            worker = await db.workers.filter(w => w.farmCardNumber === parsedKey || w.qrCode === parsedKey).first();
        }

        const now = format(new Date(), 'HH:mm');
        const today = format(new Date(), 'yyyy-MM-dd');

        if (!worker) {
            if (soundEnabled) playBeep('error');
            setLastScanResult({
                statusType: 'error',
                worker: null,
                title: 'Unrecognized Farm Card',
                message: `Code "${parsedKey}" does not match any registered G&S FARM worker badge.`,
                timestamp: now
            });
            return;
        }

        if (worker.status !== 'Active') {
            if (soundEnabled) playBeep('error');
            setLastScanResult({
                statusType: 'inactive',
                worker,
                title: 'Worker Account Inactive',
                message: `${worker.fullName} (${worker.workerId}) is marked Inactive. Attendance was not logged.`,
                timestamp: now
            });
            return;
        }

        const workerId = worker.workerId;
        const existingRecord = await db.attendance.where({ workerId, date: today }).first();
        setPayrollSyncWarning('');

        // Effective mode:
        // In 'auto' mode: if current time is >= attendanceTimeOutStart (e.g. 14:00), we are in afternoon timeOut mode.
        // Otherwise, we are in morning timeIn mode.
        const currentIsAfternoon = now >= schedule.attendanceTimeOutStart;
        const effectiveMode = scanMode === 'auto' 
            ? (currentIsAfternoon ? 'timeOut' : 'timeIn') 
            : scanMode;

        if (effectiveMode === 'timeIn') {
            // ==========================================
            // MORNING / TIME-IN MODE
            // ==========================================
            if (!existingRecord) {
                // Workers arriving before or within threshold are Present.
                // Workers arriving after attendanceTimeInEnd are marked Late.
                const isLate = now > schedule.attendanceTimeInEnd;
                await db.attendance.add({
                    workerId: worker.workerId,
                    workerName: worker.fullName,
                    date: today,
                    timeIn: now,
                    status: isLate ? 'Late' : 'Present',
                    isLate
                });

                const finalRecord = await db.attendance.where({ workerId, date: today }).first();
                if (finalRecord) void firestoreSyncService.saveAttendance(finalRecord);
                void syncPayrollAfterAttendance(today);

                if (soundEnabled) playBeep(isLate ? 'info' : 'success');
                setSessionScanCount(c => c + 1);
                setLastScanResult({
                    statusType: isLate ? 'timeIn_late' : 'timeIn_present',
                    worker,
                    title: isLate ? 'Time-In Logged (Late Arrival)' : 'Time-In Logged (Present)',
                    message: isLate 
                        ? `${worker.fullName} clocked in at ${now}. Arrived after configured threshold (${schedule.attendanceTimeInEnd}).`
                        : `${worker.fullName} clocked in on time at ${now}. Ready for morning shift operations.`,
                    timestamp: now,
                    record: finalRecord
                });
            } else if (!existingRecord.timeOut) {
                // Already timed in this morning!
                if (soundEnabled) playBeep('info');
                setLastScanResult({
                    statusType: 'already_in',
                    worker,
                    title: 'Already Clocked In Today',
                    message: `${worker.fullName} is already clocked in at ${existingRecord.timeIn} (Working). Afternoon departure scans open at ${schedule.attendanceTimeOutStart}.`,
                    timestamp: now,
                    record: existingRecord
                });
            } else {
                // Already completed shift
                if (soundEnabled) playBeep('info');
                setLastScanResult({
                    statusType: 'already_out',
                    worker,
                    title: 'Shift Already Completed Today',
                    message: `${worker.fullName} has already completed their shift today (In: ${existingRecord.timeIn} • Out: ${existingRecord.timeOut}).`,
                    timestamp: now,
                    record: existingRecord
                });
            }
        } else {
            // ==========================================
            // AFTERNOON / TIME-OUT MODE
            // ==========================================
            if (existingRecord && !existingRecord.timeOut) {
                // Calculate hours worked
                const { actualHours } = calculateWorkingHours(existingRecord.timeIn, now, 60);

                // Check against set threshold (attendanceTimeOutEnd, e.g. 14:20)
                const isPastThreshold = now > schedule.attendanceTimeOutEnd;

                if (isPastThreshold) {
                    // BEYOND SET THRESHOLD -> RECORD OVERTIME!
                    const overtimeMinutes = Math.max(
                        0,
                        timeToMinutes(now) - timeToMinutes(schedule.attendanceTimeOutEnd)
                    );
                    const overtimeHours = Number((overtimeMinutes / 60).toFixed(2));

                    await db.attendance.update(existingRecord.id!, {
                        workerName: existingRecord.workerName || worker.fullName,
                        timeOut: now,
                        actualHours,
                        overtimeHours,
                        overtimeStatus: 'Pending',
                        overtimeReason: `Scanned out at ${now}, exceeding shift threshold of ${schedule.attendanceTimeOutEnd}.`
                    });

                    const finalRecord = await db.attendance.get(existingRecord.id!);
                    if (finalRecord) void firestoreSyncService.saveAttendance(finalRecord);
                    void syncPayrollAfterAttendance(today);

                    if (soundEnabled) playBeep('overtime');
                    setSessionScanCount(c => c + 1);
                    setLastScanResult({
                        statusType: 'timeOut_overtime',
                        worker,
                        title: 'Time-Out & Overtime Logged',
                        message: `${worker.fullName} clocked out at ${now}. ${actualHours.toFixed(1)} hrs worked · ${overtimeHours} hrs overtime submitted for review.`,
                        timestamp: now,
                        record: finalRecord,
                        overtimeHours,
                        hoursWorked: actualHours
                    });
                } else {
                    // WITHIN THRESHOLD -> REGULAR TIME-OUT (0 OVERTIME)
                    await db.attendance.update(existingRecord.id!, {
                        workerName: existingRecord.workerName || worker.fullName,
                        timeOut: now,
                        actualHours,
                        overtimeHours: 0,
                        overtimeStatus: 'None'
                    });

                    const finalRecord = await db.attendance.get(existingRecord.id!);
                    if (finalRecord) void firestoreSyncService.saveAttendance(finalRecord);
                    void syncPayrollAfterAttendance(today);

                    if (soundEnabled) playBeep('success');
                    setSessionScanCount(c => c + 1);
                    setLastScanResult({
                        statusType: 'timeOut_ontime',
                        worker,
                        title: 'Time-Out Logged (On Time)',
                        message: `${worker.fullName} clocked out on time at ${now} (${actualHours.toFixed(1)} hrs worked).`,
                        timestamp: now,
                        record: finalRecord,
                        hoursWorked: actualHours
                    });
                }
            } else if (!existingRecord) {
                // Worker did not scan in this morning, but scans in the afternoon
                const isPastThreshold = now > schedule.attendanceTimeOutEnd;
                const overtimeMinutes = isPastThreshold 
                    ? Math.max(0, timeToMinutes(now) - timeToMinutes(schedule.attendanceTimeOutEnd))
                    : 0;
                const overtimeHours = Number((overtimeMinutes / 60).toFixed(2));

                await db.attendance.add({
                    workerId: worker.workerId,
                    workerName: worker.fullName,
                    date: today,
                    timeIn: schedule.attendanceTimeInStart || '07:00',
                    timeOut: now,
                    status: 'Missing Clock-in',
                    notes: 'Scanned out in afternoon without morning check-in',
                    ...(overtimeHours > 0 ? {
                        overtimeHours,
                        overtimeStatus: 'Pending',
                        overtimeReason: `Afternoon departure scan at ${now} exceeding threshold ${schedule.attendanceTimeOutEnd}.`
                    } : {})
                });

                const finalRecord = await db.attendance.where({ workerId, date: today }).first();
                if (finalRecord) void firestoreSyncService.saveAttendance(finalRecord);
                void syncPayrollAfterAttendance(today);

                if (soundEnabled) playBeep('info');
                setSessionScanCount(c => c + 1);
                setLastScanResult({
                    statusType: 'missing_clockin',
                    worker,
                    title: 'Time-Out Logged (Missing Morning Clock-In)',
                    message: `${worker.fullName} scanned departure at ${now}. Flagged as "Missing Clock-in" for supervisor confirmation.`,
                    timestamp: now,
                    record: finalRecord,
                    overtimeHours: overtimeHours > 0 ? overtimeHours : undefined
                });
            } else {
                // Already completed shift
                if (soundEnabled) playBeep('info');
                setLastScanResult({
                    statusType: 'already_out',
                    worker,
                    title: 'Shift Already Completed Today',
                    message: `${worker.fullName} has already completed their shift today (In: ${existingRecord.timeIn} • Out: ${existingRecord.timeOut}).`,
                    timestamp: now,
                    record: existingRecord
                });
            }
        }
    }, [scanMode, schedule, soundEnabled, syncPayrollAfterAttendance]);

    // Fast decode dispatcher with a per-card 2.5s repeat throttle
    const onQrDecoded = useCallback(async (decodedText: string) => {
        const cleanCode = decodedText.trim();
        const now = Date.now();

        if (!cleanCode || processingCodesRef.current.has(cleanCode)) return;
        if (now - (lastScanRef.current.get(cleanCode) || 0) < 2500) {
            return;
        }

        processingCodesRef.current.add(cleanCode);
        lastScanRef.current.set(cleanCode, now);
        for (const [code, timestamp] of lastScanRef.current) {
            if (now - timestamp >= 2500) lastScanRef.current.delete(code);
        }

        try {
            await handleIdentify(cleanCode);
        } catch (err) {
            console.error('Unable to process attendance scan.', err);
            const message = err instanceof Error ? err.message : String(err);
            setLastScanResult({
                statusType: 'error',
                worker: null,
                title: 'Attendance Scan Failed',
                message: `The scan could not be recorded: ${message}`,
                timestamp: format(new Date(), 'HH:mm')
            });
        } finally {
            processingCodesRef.current.delete(cleanCode);
        }
    }, [handleIdentify]);

    const onQrDecodedRef = useRef(onQrDecoded);
    onQrDecodedRef.current = onQrDecoded;

    // Continuous camera scanner initialization
    useEffect(() => {
        if (!isScanning) return;

        let scanner: Html5QrcodeScanner | null = null;
        const scannerId = "reader";

        try {
            scanner = new Html5QrcodeScanner(scannerId, {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                rememberLastUsedCamera: true
            }, false);

            scanner.render(
                (decodedText: string) => {
                    void onQrDecodedRef.current(decodedText);
                },
                () => {
                    // Frame without QR - ignore quietly
                }
            );
        } catch (err) {
            console.error('Html5QrcodeScanner setup note:', err);
        }

        return () => {
            if (scanner) {
                try {
                    scanner.clear().catch(e => console.warn('Scanner clear note:', e));
                } catch (e) {
                    // Ignore
                }
            }
        };
    }, [isScanning]);

    // Sorted today attendance records for live session feed (most recent first)
    const sortedTodayAttendance = useMemo(() => {
        return [...todayAttendance].sort((a, b) => {
            const timeA = a.timeOut || a.timeIn || '';
            const timeB = b.timeOut || b.timeIn || '';
            if (timeB !== timeA) return timeB.localeCompare(timeA);
            return (b.id || 0) - (a.id || 0);
        });
    }, [todayAttendance]);

    return (
        <div className="scan-wrapper">
            {/* Header with real-time clock and mode status */}
            <div className="scanner-header-bar">
                <div>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <QrCode size={28} color="var(--color-primary)" /> Continuous Attendance Scanner
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Scan worker Farm Card QR codes. The camera remains active continuously for fast queue check-in.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 700, padding: '0.4rem 0.85rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                        <Clock size={16} /> {currentTimeStr}
                    </div>

                    <button
                        type="button"
                        onClick={() => setSoundEnabled(s => !s)}
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
                        title={soundEnabled ? 'Mute audio feedback' : 'Enable audio feedback'}
                    >
                        {soundEnabled ? <Volume2 size={16} color="#15803d" /> : <VolumeX size={16} color="#94a3b8" />}
                        {soundEnabled ? 'Beep On' : 'Muted'}
                    </button>

                    <Link to="/attendance" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
                        View Full Sheet
                    </Link>
                </div>
            </div>

            {/* Shift Mode Banner & Operational Threshold Guide */}
            <div 
                className={`scan-mode-indicator ${
                    scanMode === 'timeOut' || (scanMode === 'auto' && isBeyondOvertimeThreshold) 
                        ? 'overtime' 
                        : (scanMode === 'auto' && isAfternoon) 
                            ? 'afternoon' 
                            : 'morning'
                }`}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, flexWrap: 'wrap' }}>
                    {scanMode === 'auto' ? (
                        isAfternoon ? (
                            isBeyondOvertimeThreshold ? (
                                <>
                                    <Clock size={20} color="#854d0e" />
                                    <div>
                                        <strong>⏰ OVERTIME SCANNING ACTIVE (Past {schedule.attendanceTimeOutEnd})</strong>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                                            Departure scans taken now will record Time-Out with Overtime submitted for supervisor approval.
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Sunset size={20} color="#1d4ed8" />
                                    <div>
                                        <strong>🌇 AFTERNOON TIME-OUT ACTIVE (Window: {schedule.attendanceTimeOutStart} – {schedule.attendanceTimeOutEnd})</strong>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                                            Departure scans taken now will record on-time Time-Out.
                                        </div>
                                    </div>
                                </>
                            )
                        ) : (
                            <>
                                <Sun size={20} color="#15803d" />
                                <div>
                                    <strong>🌅 MORNING TIME-IN ACTIVE (Target: {schedule.attendanceTimeInStart} – {schedule.attendanceTimeInEnd})</strong>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                                        All cards scanned now will record Time-In. The scanner remains ready for the next card immediately.
                                    </div>
                                </div>
                            </>
                        )
                    ) : scanMode === 'timeIn' ? (
                        <>
                            <Sun size={20} color="#15803d" />
                            <div>
                                <strong>🌅 FORCED TIME-IN MODE ACTIVE</strong>
                                <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>All scans will be recorded as morning Time-In.</div>
                            </div>
                        </>
                    ) : (
                        <>
                            <Sunset size={20} color="#1d4ed8" />
                            <div>
                                <strong>🌇 FORCED TIME-OUT MODE ACTIVE</strong>
                                <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>All scans will be recorded as afternoon Time-Out (threshold: {schedule.attendanceTimeOutEnd}).</div>
                            </div>
                        </>
                    )}
                </div>

                {/* Mode Selector for Manager Override */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 600 }}>Shift Mode:</span>
                    <select
                        value={scanMode}
                        onChange={(e) => setScanMode(e.target.value as any)}
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    >
                        <option value="auto">⚡ Auto (By Schedule)</option>
                        <option value="timeIn">🌅 Force Time-In</option>
                        <option value="timeOut">🌇 Force Time-Out</option>
                    </select>
                </div>
            </div>

            {/* Main Interactive Grid: Camera Scanner & Real-time Scan Confirmation */}
            <div className="scan-main-grid">
                {/* 1. Camera Viewport */}
                <div className="card scanner-camera-card">
                    <div className="camera-controls-bar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            {isScanning ? (
                                <span className="camera-status-pill">
                                    <span className="live-pulse-dot" /> Scanner Active & Ready
                                </span>
                            ) : (
                                <span className="camera-status-pill paused">
                                    Scanner Paused
                                </span>
                            )}
                        </div>

                        <div>
                            {isScanning ? (
                                <button
                                    type="button"
                                    onClick={() => setIsScanning(false)}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#b91c1c' }}
                                >
                                    <Square size={14} /> Stop Scanning
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsScanning(true)}
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <Play size={14} /> Resume Scanning
                                </button>
                            )}
                        </div>
                    </div>

                    {isScanning ? (
                        <div>
                            <div id="reader"></div>
                            <p style={{ textAlign: 'center', color: 'var(--color-text-light)', fontSize: '0.82rem', margin: '0.75rem 0 0 0' }}>
                                💡 <strong>Continuous Scanning:</strong> Hold worker QR card in front of camera. When recorded, immediately present the next card.
                            </p>
                        </div>
                    ) : (
                        <div className="scanner-paused-box">
                            <Clock size={40} color="#94a3b8" />
                            <div>
                                <h3 style={{ margin: '0 0 0.25rem 0' }}>Attendance Scanner Stopped</h3>
                                <p className="text-light" style={{ margin: 0, fontSize: '0.85rem' }}>
                                    Session paused. {sessionScanCount} scan(s) recorded during this active run.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button className="btn btn-primary" onClick={() => setIsScanning(true)}>
                                    <Play size={16} /> Resume Camera Scanner
                                </button>
                                <button className="btn btn-secondary" onClick={() => navigate('/')}>
                                    Dashboard
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Latest Scan Confirmation (Non-blocking Card) */}
                <div className="card latest-result-card">
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sparkles size={18} /> Live Scan Confirmation
                    </h3>

                    {lastScanResult ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Status Banner */}
                            <div 
                                className={`result-banner ${
                                    lastScanResult.statusType === 'timeIn_present' || lastScanResult.statusType === 'timeOut_ontime'
                                        ? 'success'
                                        : lastScanResult.statusType === 'timeIn_late' || lastScanResult.statusType === 'already_in'
                                            ? 'warning'
                                            : lastScanResult.statusType === 'timeOut_overtime'
                                                ? 'overtime'
                                                : lastScanResult.statusType === 'already_out' || lastScanResult.statusType === 'missing_clockin'
                                                    ? 'info'
                                                    : 'danger'
                                }`}
                            >
                                {lastScanResult.statusType === 'timeIn_present' || lastScanResult.statusType === 'timeOut_ontime' ? (
                                    <CheckCircle2 size={20} />
                                ) : (
                                    <AlertTriangle size={20} />
                                )}
                                <span>{lastScanResult.title}</span>
                            </div>

                            {/* Worker Profile Card */}
                            {lastScanResult.worker && (
                                <div className="worker-quick-profile">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <UserCircle2 size={46} color="var(--color-primary)" />
                                        <div>
                                            <h2 className="worker-name-title">{lastScanResult.worker.fullName}</h2>
                                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                                                Worker ID: {lastScanResult.worker.workerId}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="scan-meta-grid">
                                        <div className="scan-meta-item">
                                            <span className="scan-meta-label">Position</span>
                                            <span className="scan-meta-val">{lastScanResult.worker.position || 'Farm Worker'}</span>
                                        </div>
                                        <div className="scan-meta-item">
                                            <span className="scan-meta-label">Department</span>
                                            <span className="scan-meta-val">{lastScanResult.worker.department || 'Operations'}</span>
                                        </div>
                                        <div className="scan-meta-item">
                                            <span className="scan-meta-label">Farm Card #</span>
                                            <span className="scan-meta-val">{lastScanResult.worker.farmCardNumber || lastScanResult.worker.workerId}</span>
                                        </div>
                                        <div className="scan-meta-item">
                                            <span className="scan-meta-label">Phone Contact</span>
                                            <span className="scan-meta-val">{lastScanResult.worker.phoneNumber || '—'}</span>
                                        </div>
                                        <div className="scan-meta-item">
                                            <span className="scan-meta-label">Time-In</span>
                                            <span className="scan-meta-val" style={{ color: '#15803d' }}>
                                                {lastScanResult.record?.timeIn || lastScanResult.timestamp}
                                            </span>
                                        </div>
                                        <div className="scan-meta-item">
                                            <span className="scan-meta-label">Time-Out</span>
                                            <span className="scan-meta-val" style={{ color: lastScanResult.record?.timeOut ? '#2563eb' : '#64748b' }}>
                                                {lastScanResult.record?.timeOut || 'Working...'}
                                            </span>
                                        </div>
                                    </div>

                                    {lastScanResult.overtimeHours !== undefined && lastScanResult.overtimeHours > 0 && (
                                        <div style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '0.65rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', color: '#854d0e', fontWeight: 600 }}>
                                            ⏰ Overtime Flagged: {lastScanResult.overtimeHours} hours past shift end ({schedule.attendanceTimeOutEnd}).
                                        </div>
                                    )}

                                    <div style={{ fontSize: '0.82rem', color: '#475569', fontStyle: 'italic' }}>
                                        {lastScanResult.message}
                                    </div>
                                </div>
                            )}

                            {/* Ready Prompt */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem', background: '#f0fdf4', borderRadius: '6px', color: '#15803d', fontSize: '0.85rem', fontWeight: 600 }}>
                                <span className="live-pulse-dot" /> Scanner Ready For Next Worker
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-light)', gap: '0.75rem' }}>
                            <QrCode size={48} style={{ opacity: 0.35 }} />
                            <div>
                                <strong style={{ color: 'var(--color-text)' }}>Ready for Worker QR Cards</strong>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem' }}>
                                    Hold any worker Farm Card QR code in front of the camera. Their full name, ID, and attendance timestamps will appear here instantly.
                                </p>
                            </div>
                        </div>
                    )}

                    {payrollSyncWarning && (
                        <div style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                            {payrollSyncWarning}
                        </div>
                    )}
                </div>
            </div>

            {/* Today's Scanned Attendance Live Roster */}
            <div className="card today-roster-card">
                <div className="roster-header">
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Users size={20} /> Today's Scanned Roster ({sortedTodayAttendance.length} Workers Recorded)
                        </h3>
                        <p className="text-light" style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem' }}>
                            Live stream of workers checked in today, ordered with most recent scans first.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link to="/attendance" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            Open Attendance Sheet <ArrowRight size={14} />
                        </Link>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="roster-table">
                        <thead>
                            <tr>
                                <th>Worker Name</th>
                                <th>Worker ID</th>
                                <th>Time In</th>
                                <th>Time Out</th>
                                <th>Status</th>
                                <th>Overtime</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTodayAttendance.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-text-light)' }}>
                                        No workers recorded yet today. Scan QR codes above to begin recording attendance.
                                    </td>
                                </tr>
                            ) : (
                                sortedTodayAttendance.map((rec, index) => {
                                    const worker = workerMap.get(rec.workerId);
                                    const displayName = rec.workerName || worker?.fullName || `Worker (${rec.workerId})`;
                                    const otHours = rec.overtimeHours || 0;

                                    return (
                                        <tr key={rec.id || index}>
                                            <td style={{ fontWeight: 600, color: '#0f172a' }}>
                                                {displayName}
                                                {worker?.position && (
                                                    <div className="text-light" style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>
                                                        {worker.position}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '0.78rem', background: '#e2e8f0', padding: '0.12rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>
                                                    {rec.workerId}
                                                </span>
                                            </td>
                                            <td>
                                                <strong style={{ color: rec.status === 'Late' ? '#c2410c' : 'inherit' }}>
                                                    {rec.timeIn || '--:--'}
                                                </strong>
                                            </td>
                                            <td>
                                                {rec.timeOut ? (
                                                    <strong style={{ color: '#2563eb' }}>{rec.timeOut}</strong>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: '#15803d', background: '#dcfce7', padding: '0.1rem 0.4rem', borderRadius: '10px', fontWeight: 600 }}>
                                                        Working
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span
                                                    style={{
                                                        padding: '0.15rem 0.5rem',
                                                        borderRadius: '10px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        backgroundColor: 
                                                            rec.status === 'Present' 
                                                                ? '#dcfce7' 
                                                                : rec.status === 'Late' 
                                                                    ? '#fef3c7' 
                                                                    : '#fee2e2',
                                                        color: 
                                                            rec.status === 'Present' 
                                                                ? '#15803d' 
                                                                : rec.status === 'Late' 
                                                                    ? '#b45309' 
                                                                    : '#b91c1c'
                                                    }}
                                                >
                                                    {rec.status}
                                                </span>
                                            </td>
                                            <td>
                                                {otHours > 0 ? (
                                                    <span style={{ fontWeight: 700, color: '#ca8a04', fontSize: '0.8rem' }}>
                                                        +{otHours.toFixed(1)} hrs ({rec.overtimeStatus || 'Pending'})
                                                    </span>
                                                ) : (
                                                    <span className="text-light" style={{ fontSize: '0.75rem' }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ScanAttendance;

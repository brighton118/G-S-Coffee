import { db, AttendanceRecord, PayrollRecord } from '../db';
import { loadAttendanceScheduleSettings } from '../utils/attendanceSchedule';
import { timeToMinutes } from '../utils/calculations';

function countMissedWorkdays(
    workerId: string,
    payrollMonth: string,
    dateJoined: string,
    attendanceByWorkerAndDate: Map<string, AttendanceRecord[]>,
    timeoutEnd: string,
    now: Date
): number {
    const [year, month] = payrollMonth.split('-').map(Number);
    const dayCount = new Date(year, month, 0).getDate();
    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
    const todayIsPastCutoff = now.getHours() * 60 + now.getMinutes() >
        timeToMinutes(timeoutEnd);
    let missedDays = 0;

    for (let day = 1; day <= dayCount; day++) {
        const date = `${payrollMonth}-${String(day).padStart(2, '0')}`;
        const weekday = new Date(year, month - 1, day).getDay();
        if (weekday === 0 || date < dateJoined || date > today) continue;
        if (date === today && !todayIsPastCutoff) continue;

        const records = attendanceByWorkerAndDate.get(`${workerId}:${date}`) || [];
        if (records.some(record => record.status === 'Leave' || record.status === 'Off Duty')) continue;
        if (records.length === 0 || records.every(record => record.status === 'Absent')) missedDays++;
    }

    return missedDays;
}

function getManualDeductionReason(record: PayrollRecord): string {
    if (record.manualDeductionReason !== undefined) return record.manualDeductionReason;
    return record.attendanceDeduction === undefined ? record.deductionReason || '' : '';
}

function buildDeductionReason(manualReason: string, missedDays: number, dailyRate: number): string | undefined {
    const reasons = [manualReason.trim()];
    if (missedDays > 0) {
        reasons.push(`Attendance: ${missedDays} missed scheduled workday(s) at ${dailyRate.toLocaleString()} UGX/day`);
    }
    return reasons.filter(Boolean).join('; ') || undefined;
}

const payrollSyncsInProgress = new Map<string, Promise<void>>();

export async function syncPayrollMonth(payrollMonth: string, now = new Date()): Promise<void> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payrollMonth)) {
        throw new Error(`Invalid payroll month: ${payrollMonth}`);
    }

    const inProgress = payrollSyncsInProgress.get(payrollMonth);
    if (inProgress) {
        await inProgress;
        return;
    }

    const sync = synchronizePayrollMonth(payrollMonth, now);
    payrollSyncsInProgress.set(payrollMonth, sync);
    try {
        await sync;
    } finally {
        if (payrollSyncsInProgress.get(payrollMonth) === sync) {
            payrollSyncsInProgress.delete(payrollMonth);
        }
    }
}

async function synchronizePayrollMonth(payrollMonth: string, now: Date): Promise<void> {
    const [workers, attendanceRecords, existingRecords] = await Promise.all([
        db.workers.where('status').equals('Active').toArray(),
        db.attendance.toArray(),
        db.payrollRecords.where('payrollMonth').equals(payrollMonth).toArray()
    ]);
    const recordsByWorker = new Map(existingRecords.map(record => [record.workerId, record]));
    const attendanceByWorkerAndDate = new Map<string, AttendanceRecord[]>();
    for (const record of attendanceRecords) {
        const key = `${record.workerId}:${record.date}`;
        const records = attendanceByWorkerAndDate.get(key) || [];
        records.push(record);
        attendanceByWorkerAndDate.set(key, records);
    }
    const schedule = loadAttendanceScheduleSettings();
    const serialNumbers = existingRecords.map(record => record.serialNumber || 0);
    let nextSerial = serialNumbers.length > 0 ? Math.max(...serialNumbers) + 1 : 1;

    await db.transaction('rw', db.payrollRecords, async () => {
        for (const worker of workers) {
            const existing = recordsByWorker.get(worker.workerId);
            const missedDays = countMissedWorkdays(
                worker.workerId,
                payrollMonth,
                worker.dateJoined || `${payrollMonth}-01`,
                attendanceByWorkerAndDate,
                schedule.attendanceTimeOutEnd,
                now
            );
            const monthlySalary = worker.monthlySalary || 0;
            const dailyRate = Math.round(monthlySalary / 30);
            const attendanceDeduction = dailyRate * missedDays;
            const manualDeduction = Math.max(
                0,
                (existing?.deductions || 0) - (existing?.attendanceDeduction || 0)
            );
            const manualReason = existing ? getManualDeductionReason(existing) : '';
            const deductions = manualDeduction + attendanceDeduction;
            const otRecords = attendanceRecords.filter(record =>
                record.workerId === worker.workerId &&
                record.date.startsWith(payrollMonth) &&
                record.overtimeStatus === 'Approved'
            );
            const approvedOTHours = otRecords.reduce(
                (sum, record) => sum + (record.overtimeApprovedHours || record.overtimeHours || 0),
                0
            );
            const overtimeRate = existing?.overtimeRate || worker.overtimeRate || 3500;
            const overtimeEarnings = Math.round(approvedOTHours * overtimeRate);
            const netPay = Math.max(0, Math.round(monthlySalary + overtimeEarnings - deductions));
            const amountPaid = existing?.amountPaid || 0;
            const balance = Math.max(0, netPay - amountPaid);
            const paymentStatus = amountPaid >= netPay && netPay > 0
                ? 'Paid'
                : amountPaid > 0 ? 'Partially Paid' : 'Pending';

            const payrollData: Omit<PayrollRecord, 'id'> = {
                payrollMonth,
                payrollPeriod: payrollMonth,
                workerId: worker.workerId,
                workerName: worker.fullName,
                farmCardNumber: worker.farmCardNumber || worker.workerId,
                serialNumber: existing?.serialNumber || nextSerial++,
                monthlySalary,
                approvedOvertimeHours: approvedOTHours,
                overtimeHours: approvedOTHours,
                overtimeRate,
                overtimeEarnings,
                deductions,
                attendanceDeduction,
                unrecordedWorkdays: missedDays,
                manualDeductionReason: manualReason || undefined,
                deductionReason: buildDeductionReason(manualReason, missedDays, dailyRate),
                netPay,
                amountPaid,
                balance,
                paymentStatus,
                status: existing?.status || 'Draft',
                generatedAt: existing?.generatedAt || now.toISOString()
            };

            if (existing?.id) {
                const changedFields = Object.keys(payrollData) as (keyof typeof payrollData)[];
                if (changedFields.some(field => existing[field] !== payrollData[field])) {
                    await db.payrollRecords.update(existing.id, payrollData);
                }
            } else {
                await db.payrollRecords.add(payrollData);
            }
        }
    });
}

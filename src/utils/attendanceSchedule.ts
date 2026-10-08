export interface AttendanceScheduleSettings {
    attendanceTimeInStart: string;
    attendanceTimeInEnd: string;
    attendanceTimeOutStart: string;
    attendanceTimeOutEnd: string;
    attendanceLockoutHours: string;
}

export const DEFAULT_ATTENDANCE_SCHEDULE: AttendanceScheduleSettings = {
    attendanceTimeInStart: '07:00',
    attendanceTimeInEnd: '07:20',
    attendanceTimeOutStart: '14:00',
    attendanceTimeOutEnd: '14:20',
    attendanceLockoutHours: '7'
};

const isTimeValue = (value: unknown): value is string =>
    typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function normalizeAttendanceScheduleSettings(value: unknown): AttendanceScheduleSettings {
    if (!value || typeof value !== 'object') return DEFAULT_ATTENDANCE_SCHEDULE;

    const stored = value as Record<string, unknown>;
    const legacyTimeInEnd = isTimeValue(stored.attendanceLateThreshold)
        ? stored.attendanceLateThreshold
        : DEFAULT_ATTENDANCE_SCHEDULE.attendanceTimeInEnd;

    return {
        attendanceTimeInStart: isTimeValue(stored.attendanceTimeInStart)
            ? stored.attendanceTimeInStart
            : DEFAULT_ATTENDANCE_SCHEDULE.attendanceTimeInStart,
        attendanceTimeInEnd: isTimeValue(stored.attendanceTimeInEnd)
            ? stored.attendanceTimeInEnd
            : legacyTimeInEnd,
        attendanceTimeOutStart: isTimeValue(stored.attendanceTimeOutStart)
            ? stored.attendanceTimeOutStart
            : DEFAULT_ATTENDANCE_SCHEDULE.attendanceTimeOutStart,
        attendanceTimeOutEnd: isTimeValue(stored.attendanceTimeOutEnd)
            ? stored.attendanceTimeOutEnd
            : DEFAULT_ATTENDANCE_SCHEDULE.attendanceTimeOutEnd,
        attendanceLockoutHours: typeof stored.attendanceLockoutHours === 'string' &&
            Number.isFinite(Number(stored.attendanceLockoutHours)) &&
            Number(stored.attendanceLockoutHours) >= 0
            ? stored.attendanceLockoutHours
            : DEFAULT_ATTENDANCE_SCHEDULE.attendanceLockoutHours
    };
}

export function loadAttendanceScheduleSettings(): AttendanceScheduleSettings {
    const saved = localStorage.getItem('gs_farm_settings');
    if (!saved) return DEFAULT_ATTENDANCE_SCHEDULE;

    try {
        return normalizeAttendanceScheduleSettings(JSON.parse(saved));
    } catch (error) {
        console.error('Unable to read attendance schedule settings.', error);
        return DEFAULT_ATTENDANCE_SCHEDULE;
    }
}

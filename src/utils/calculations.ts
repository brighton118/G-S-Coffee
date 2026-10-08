import { OvertimeRuleConfig, InventoryItem } from '../db';

export const DEFAULT_OVERTIME_RULES: OvertimeRuleConfig = {
    normalStartTime: '08:00',
    normalEndTime: '17:00',
    shiftStartTime: '08:00',
    shiftEndTime: '17:00',
    standardHoursPerDay: 8,
    requiredDailyHours: 8,
    breakDeductionMinutes: 60,
    gracePeriodMinutes: 15,
    overtimeThresholdMinutes: 30,
    roundingIncrementMinutes: 15,
    roundingRule: 'Round Down 15m',
    defaultHourlyRateMultiplier: 1.5,
    rateMultiplier: 1.5,
    hourlyRateUGX: 3500,
    supervisorApprovalRequired: true,
    requireApproval: true,
    active: true
};

/**
 * Format currency in Uganda Shillings (UGX)
 */
export function formatUGX(amount: number): string {
    return `UGX ${Math.round(amount || 0).toLocaleString('en-US')}`;
}

/**
 * Converts HH:mm time string into minutes since midnight
 */
export function timeToMinutes(timeStr: string): number {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Converts minutes since midnight back into HH:mm format
 */
export function minutesToTime(minutes: number): string {
    const hrs = Math.floor(minutes / 60) % 24;
    const mins = Math.floor(minutes % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Calculate Actual Working Hours between clock-in and clock-out with break deduction
 */
export function calculateWorkingHours(
    timeIn: string,
    timeOut: string | undefined,
    breakMinutes = 60
): {
    actualHours: number;
    rawMinutes: number;
    netMinutes: number;
} {
    if (!timeIn || !timeOut) {
        return { actualHours: 0, rawMinutes: 0, netMinutes: 0 };
    }

    const inMins = timeToMinutes(timeIn);
    const outMins = timeToMinutes(timeOut);

    let totalMins = outMins - inMins;
    if (totalMins < 0) {
        totalMins += 24 * 60;
    }

    const netMins = totalMins > 240 ? Math.max(0, totalMins - breakMinutes) : totalMins;
    const actualHours = parseFloat((netMins / 60).toFixed(2));

    return {
        actualHours,
        rawMinutes: totalMins,
        netMinutes: netMins
    };
}

/**
 * Calculate Potential Overtime Hours based on shift end time and farm rules
 */
export function calculateOvertime(
    timeIn: string,
    timeOut: string | undefined,
    rules: OvertimeRuleConfig = DEFAULT_OVERTIME_RULES
): {
    overtimeHours: number;
    isEligible: boolean;
    reason?: string;
} {
    if (!timeIn || !timeOut) {
        return { overtimeHours: 0, isEligible: false, reason: 'Incomplete attendance record' };
    }

    const outMins = timeToMinutes(timeOut);
    const endTimeStr = rules.shiftEndTime || rules.normalEndTime || '17:00';
    const shiftEndMins = timeToMinutes(endTimeStr);

    const thresholdMins = shiftEndMins + (rules.overtimeThresholdMinutes || 0);

    if (outMins <= thresholdMins) {
        return { overtimeHours: 0, isEligible: false, reason: 'Clocked out within regular shift/grace threshold' };
    }

    const excessMinutes = outMins - shiftEndMins;

    let roundedHours = 0;
    const rule = (rules.roundingRule || '').toLowerCase();

    if (rule.includes('exact')) {
        roundedHours = excessMinutes / 60;
    } else if (rule.includes('30') || rule.includes('half')) {
        roundedHours = Math.floor(excessMinutes / 30) * 0.5;
    } else {
        // Default: 15-minute increments
        roundedHours = Math.floor(excessMinutes / 15) * 0.25;
    }

    const finalHours = parseFloat(roundedHours.toFixed(2));

    return {
        overtimeHours: finalHours,
        isEligible: finalHours > 0,
        reason: finalHours > 0 ? `${finalHours} hrs past ${endTimeStr} threshold` : undefined
    };
}

/**
 * Calculate Net Pay according to Prompt Formula:
 * Net Pay = Monthly Salary + Approved Overtime Earnings - Applicable Deductions
 */
export function calculateNetPay(
    monthlySalary: number,
    approvedOvertimeHours: number,
    overtimeRate: number,
    deductions = 0
): {
    overtimeEarnings: number;
    netPay: number;
} {
    const salary = Math.max(0, Number(monthlySalary) || 0);
    const otHours = Math.max(0, Number(approvedOvertimeHours) || 0);
    const otRate = Math.max(0, Number(overtimeRate) || 0);
    const deduct = Math.max(0, Number(deductions) || 0);

    const overtimeEarnings = Math.round(otHours * otRate);
    const netPay = Math.round(Math.max(0, salary + overtimeEarnings - deduct));

    return {
        overtimeEarnings,
        netPay
    };
}

/**
 * Check if inventory quantity is at or below minimum reorder threshold
 */
export function isStockLow(quantity: number, minStockLevel: number): boolean {
    return Number(quantity || 0) <= Number(minStockLevel || 0);
}

/**
 * Check if an expiry date is within the alert window in days
 */
export function isExpiryNear(expiryDateStr: string | undefined, alertWindowDays = 60): boolean {
    if (!expiryDateStr) return false;
    const expiry = new Date(expiryDateStr);
    if (isNaN(expiry.getTime())) return false;
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= alertWindowDays;
}

/**
 * Calculate total valuation of active inventory items in UGX
 */
export function calculateInventoryValuation(items: InventoryItem[]): number {
    return items
        .filter(i => i.status !== 'Archived' && i.status !== 'Inactive')
        .reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.purchasePrice) || 0)), 0);
}

export function calculateSalesTotals(quantity: number, unitPrice: number) {
    const qty = Math.max(0, Number(quantity) || 0);
    const price = Math.max(0, Number(unitPrice) || 0);
    const totalAmount = qty * price;

    return {
        totalAmount,
        amountPaid: totalAmount
    };
}

/**
 * Reconcile clone sorting output
 * Rule: Total Received === Retained + Ready for Sale + Damaged/Lost
 */
export function reconcilePlantletSorting(
    totalReceived: number,
    retained: number,
    readyForSale: number,
    damagedLost: number
): {
    isValid: boolean;
    difference: number;
} {
    const sum = (Number(retained) || 0) + (Number(readyForSale) || 0) + (Number(damagedLost) || 0);
    const received = Number(totalReceived) || 0;
    return {
        isValid: sum === received,
        difference: received - sum
    };
}

export function validateSortingReconciliation(
    qtyReceived: number,
    retained: number,
    lost: number
): {
    isValid: boolean;
    difference: number;
    totalValidated: number;
} {
    const sum = (Number(retained) || 0) + (Number(lost) || 0);
    const received = Number(qtyReceived) || 0;
    return {
        isValid: sum === received,
        difference: received - sum,
        totalValidated: Number(retained) || 0
    };
}

import Dexie, { type EntityTable } from 'dexie';

// --- Types & Interfaces ---

export type CloneVarietyType = 'KR1' | 'KR3' | 'KR4' | 'KR5' | 'KR6' | 'KR7' | 'KR8' | 'KR9' | 'KR10';

export interface User {
    id?: number;
    username: string;
    role: 'Administrator' | 'Farm Manager' | 'Nursery Supervisor' | 'Store/Inventory Manager' | 'Attendance Officer' | 'Viewer';
    active: boolean;
}

export interface Worker {
    workerId: string; // e.g. GSF-W-0001
    fullName: string;
    gender: 'Male' | 'Female' | string;
    phoneNumber: string;
    dateJoined: string;
    status: 'Active' | 'Inactive' | string;
    monthlySalary: number; // Monthly Base Salary in UGX
    overtimeRate: number; // Hourly Overtime Rate in UGX
    farmCardNumber?: string;
    qrCode?: string;
    position?: string;
    department?: string;
    emergencyContact?: string;
}

export interface OvertimeRuleConfig {
    id?: number;
    shiftStartTime?: string;
    shiftEndTime?: string;
    normalStartTime?: string;
    normalEndTime?: string;
    standardHoursPerDay?: number;
    requiredDailyHours?: number;
    requiredWorkingHours?: number;
    breakDeductionMinutes?: number;
    breakDurationMinutes?: number;
    gracePeriodMinutes?: number;
    overtimeThresholdMinutes?: number;
    roundingIncrementMinutes?: number;
    roundingRule?: 'Exact' | 'Round Down 15m' | 'Round Up 15m' | 'Round 30m' | string;
    defaultHourlyRateMultiplier?: number;
    overtimeMultiplier?: number;
    rateMultiplier?: number;
    overtimeRatePerHour?: number;
    hourlyRateUGX?: number;
    supervisorApprovalRequired?: boolean;
    requireSupervisorApproval?: boolean;
    requireApproval?: boolean;
    active?: boolean;
}

export interface AttendanceRecord {
    id?: number;
    workerId: string;
    workerName?: string;
    date: string; // YYYY-MM-DD
    timeIn: string; // HH:mm
    timeOut?: string; // HH:mm
    scheduledHours?: number;
    actualHours?: number;
    status: 'Present' | 'Absent' | 'Late' | 'Leave' | 'Off Duty' | 'Missing Clock-out' | 'Missing Clock-in' | string;
    isLate?: boolean;
    overtimeHours?: number;
    overtimeApprovedHours?: number;
    overtimeStatus?: 'None' | 'Pending' | 'Approved' | 'Rejected' | string;
    overtimeApprovedBy?: string;
    overtimeApprovalDate?: string;
    overtimeReason?: string;
    notes?: string;
}

export interface PayrollRecord {
    id?: number;
    payrollMonth: string; // YYYY-MM
    payrollPeriod?: string;
    workerId: string;
    workerName: string;
    serialNumber: number; // S/M column
    monthlySalary: number; // Monthly base salary in UGX
    approvedOvertimeHours: number;
    overtimeHours?: number;
    overtimeRate?: number;
    overtimeEarnings: number; // UGX
    deductions: number; // UGX
    deductionReason?: string;
    netPay: number; // Monthly Salary + Overtime Earnings - Deductions
    status: 'Draft' | 'Approved' | 'Paid' | string;
    paymentDate?: string;
    approvedBy?: string;
    generatedAt?: string;
    notes?: string;
}

export interface CloneBatch {
    batchId: string; // GSF-CLONE-0001
    variety: CloneVarietyType | string; // Strictly no KR2
    sourceFarm: string;
    sourceMotherPlant: string;
    dateObtained: string;
    originalQuantity: number;
    currentQuantity: number;
    personResponsible: string;
    notes?: string;
    currentStage: 'Cutting' | 'Humid Chamber' | 'First Hardening' | 'Second Hardening' | 'Sorting' | 'Completed' | 'Obtained' | 'Hardening' | 'Ready for Sorting' | 'Sorted' | string;
    createdAt?: string;
}

export interface ProductionCutting {
    id?: number;
    batchId: string;
    variety?: string;
    date?: string;
    datePrepared?: string;
    cuttingQuantity?: number;
    initialQuantity?: number;
    quantityTransferred?: number;
    quantityLost?: number;
    lossReason?: string;
    motherGardenBed?: string;
    supervisor?: string;
    responsibleWorker?: string;
    status?: string;
    hormoneUsed?: string;
    mediaType?: string;
    notes?: string;
}

export interface ProductionHumidChamber {
    id?: number;
    batchId: string;
    variety?: string;
    chamberNumber?: string;
    entryDate?: string;
    dateIn?: string;
    targetExitDate?: string;
    expectedCompletionDate?: string;
    completionDate?: string;
    dateOut?: string;
    actualExitDate?: string;
    quantityEntering?: number;
    quantityReceived?: number;
    quantityIn?: number;
    quantityRetained?: number;
    quantityLost?: number;
    quantityOut?: number;
    lossReason?: string;
    humidityLevel?: string;
    temperature?: string;
    responsibleWorker?: string;
    status: 'In Chamber' | 'Overdue' | 'Exited' | 'Transferred' | string;
    notes?: string;
}

export interface ProductionFirstHardening {
    id?: number;
    batchId: string;
    variety?: string;
    shadeNetId?: string;
    entryDate?: string;
    dateIn?: string;
    targetExitDate?: string;
    expectedCompletionDate?: string;
    completionDate?: string;
    dateOut?: string;
    actualExitDate?: string;
    quantityReceived?: number;
    quantityIn?: number;
    quantityRetained?: number;
    quantityLost?: number;
    quantityOut?: number;
    lossReason?: string;
    wateringSchedule?: string;
    responsibleWorker?: string;
    section?: string;
    status: 'Active' | 'In Hardening' | 'Transferred' | 'Completed' | string;
    notes?: string;
}

export interface ProductionSecondHardening {
    id?: number;
    batchId: string;
    variety?: string;
    sunExposureArea?: string;
    entryDate?: string;
    dateIn?: string;
    targetExitDate?: string;
    expectedCompletionDate?: string;
    completionDate?: string;
    dateOut?: string;
    actualExitDate?: string;
    quantityReceived?: number;
    quantityIn?: number;
    quantityRetained?: number;
    quantityLost?: number;
    quantityOut?: number;
    lossReason?: string;
    responsibleWorker?: string;
    section?: string;
    status: 'Active' | 'In Hardening' | 'Transferred' | 'Completed' | string;
    notes?: string;
}

export interface ProductionSorting {
    id?: number;
    batchId: string;
    variety?: string;
    date?: string;
    sortingDate?: string;
    totalReceived?: number;
    quantityReceived?: number;
    retainedForMotherGarden?: number;
    retainedQuantity?: number;
    readyForSale?: number;
    forSaleQuantity?: number;
    damagedLost?: number;
    lostQuantity?: number;
    totalValidatedQuantity?: number;
    inspector?: string;
    responsibleWorker?: string;
    reconciliationValid?: boolean;
    status?: string;
    notes?: string;
}

export interface CloneStageHistory {
    id?: number;
    batchId: string;
    stageName: string;
    startDate: string;
    endDate?: string;
    quantityEntering: number;
    chamberOrSection?: string;
    notes?: string;
}

export interface InventoryItem {
    inventoryId: string;
    name: string;
    category: 'Fertilizers' | 'Pesticides' | 'Farm Tools' | 'Nursery Supplies' | string;
    type?: string;
    barcode?: string;
    brand?: string;
    unit: string;
    quantity: number;
    minStockLevel: number;
    supplier: string;
    purchasePrice: number;
    purchaseDate?: string;
    dateReceived?: string;
    expiryDate?: string;
    location?: string;
    condition?: 'New' | 'Good' | 'Fair' | 'Needs Repair' | 'Damaged' | string;
    availabilityStatus?: string;
    assignedWorkerId?: string;
    assignedWorkerName?: string;
    status: 'Active' | 'Archived' | 'Inactive' | string;
    notes?: string;
}

export interface InventoryTransaction {
    id?: number;
    inventoryId: string;
    itemName?: string;
    quantityChange: number;
    type: 'Purchase' | 'Stock addition' | 'Stock usage' | 'Transfer' | 'Adjustment' | 'Damaged' | 'Expired' | 'Disposal' | 'Sale Dispatch' | string;
    unitPrice?: number;
    totalCost?: number;
    date: string;
    user: string;
    reason: string;
    relatedBatchId?: string;
    notes?: string;
}

export interface SalesOrder {
    id?: number;
    invoiceNumber?: string;
    orderId?: string;
    orderDate: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerLocation?: string;
    variety?: CloneVarietyType | string;
    cloneType?: string;
    batchId?: string;
    quantity?: number;
    quantityOrdered?: number;
    unitPrice?: number;
    pricePerClone?: number;
    totalAmount: number;
    amountPaid: number;
    balanceDue?: number;
    outstandingBalance?: number;
    paymentStatus: 'Paid' | 'Partial' | 'Pending' | 'Fully Paid' | 'Partially Paid' | string;
    deliveryStatus?: 'Pending' | 'Dispatched' | 'Delivered' | 'Cancelled' | string;
    orderStatus?: string;
    stockDeducted?: boolean;
    stockDeductedDate?: string;
    createdAt?: string;
    soldBy?: string;
    notes?: string;
}

export interface PlantletSale {
    id?: number;
    batchId: string;
    customer: string;
    quantitySold: number;
    pricePerPlantlet: number;
    date: string;
}

export interface PlantletSort {
    batchId: string;
    date: string;
    totalQuantity: number;
    retainedQuantity: number;
    forSaleQuantity: number;
    rejectedQuantity: number;
    notes?: string;
}

export interface ActivityLog {
    id?: number;
    user: string;
    action: string;
    module: string;
    recordIdentifier: string;
    date: string;
    description: string;
}

export interface AppNotification {
    id?: number;
    type: 'Inventory Low' | 'Expiry Warning' | 'Chamber Overdue' | 'Missing Attendance' | 'Pending Overtime' | 'Payroll Approval' | 'General' | string;
    title: string;
    message: string;
    date: string;
    read: number;
    recipient?: string;
    channel?: 'In-App' | 'SMS' | 'Email' | string;
}

export interface NotificationLog {
    id?: number;
    timestamp: string;
    channel: 'SMS' | 'Email' | 'In-App' | string;
    recipient: string;
    subject?: string;
    message: string;
    status: 'Sent' | 'Failed' | 'Queued' | string;
}

export interface NotificationSettings {
    id?: number;
    smsEnabled: boolean;
    emailEnabled: boolean;
    adminPhone: string;
    adminEmail: string;
    lowStockAlerts: boolean;
    expiryAlerts: boolean;
    chamberOverdueAlerts: boolean;
    attendanceExceptionAlerts: boolean;
    pendingOvertimeAlerts: boolean;
}

// --- Database Configuration ---

const db = new Dexie('GS_Coffee_Farm_DB') as Dexie & {
    users: EntityTable<User, 'id'>;
    workers: EntityTable<Worker, 'workerId'>;
    overtimeRules: EntityTable<OvertimeRuleConfig, 'id'>;
    attendance: EntityTable<AttendanceRecord, 'id'>;
    payrollRecords: EntityTable<PayrollRecord, 'id'>;
    cloneBatches: EntityTable<CloneBatch, 'batchId'>;
    productionCuttings: EntityTable<ProductionCutting, 'id'>;
    productionHumidChamber: EntityTable<ProductionHumidChamber, 'id'>;
    productionFirstHardening: EntityTable<ProductionFirstHardening, 'id'>;
    productionSecondHardening: EntityTable<ProductionSecondHardening, 'id'>;
    productionSortings: EntityTable<ProductionSorting, 'id'>;
    cloneStageHistory: EntityTable<CloneStageHistory, 'id'>;
    inventoryItems: EntityTable<InventoryItem, 'inventoryId'>;
    inventoryTransactions: EntityTable<InventoryTransaction, 'id'>;
    salesOrders: EntityTable<SalesOrder, 'id'>;
    plantletSales: EntityTable<PlantletSale, 'id'>;
    plantletSorts: EntityTable<PlantletSort, 'batchId'>;
    activityLogs: EntityTable<ActivityLog, 'id'>;
    notifications: EntityTable<AppNotification, 'id'>;
    notificationLogs: EntityTable<NotificationLog, 'id'>;
    notificationSettings: EntityTable<NotificationSettings, 'id'>;
};

// Schema Definition with full indexes
db.version(2).stores({
    users: '++id, username, role, active',
    workers: 'workerId, fullName, phoneNumber, status, dateJoined',
    overtimeRules: '++id, active',
    attendance: '++id, workerId, date, status, overtimeStatus',
    payrollRecords: '++id, payrollMonth, workerId, status, serialNumber',
    cloneBatches: 'batchId, variety, currentStage, dateObtained',
    productionCuttings: '++id, batchId, date',
    productionHumidChamber: '++id, batchId, status, targetExitDate',
    productionFirstHardening: '++id, batchId, status',
    productionSecondHardening: '++id, batchId, status',
    productionSortings: '++id, batchId, date',
    cloneStageHistory: '++id, batchId, stageName, startDate',
    inventoryItems: 'inventoryId, name, category, status, expiryDate, minStockLevel',
    inventoryTransactions: '++id, inventoryId, type, date, user',
    salesOrders: '++id, invoiceNumber, customerPhone, variety, paymentStatus, deliveryStatus, orderDate',
    plantletSales: '++id, batchId, date',
    plantletSorts: 'batchId, date',
    activityLogs: '++id, user, module, date',
    notifications: '++id, type, date, read',
    notificationLogs: '++id, timestamp, channel, recipient',
    notificationSettings: '++id'
});

export { db };

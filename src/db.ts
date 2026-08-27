import Dexie, { type EntityTable } from 'dexie';

// --- Interfaces ---

export interface User {
    id?: number;
    username: string;
    role: 'Administrator' | 'Farm Manager' | 'Nursery Supervisor' | 'Store/Inventory Manager' | 'Attendance Officer' | 'Viewer';
    active: boolean;
}

export interface Worker {
    workerId: string; // The unique ID like GSF-W-0001
    fullName: string;
    gender: string;
    phoneNumber: string;
    position: string;
    department: string;
    dateJoined: string;
    status: 'Active' | 'Inactive';
    emergencyContact: string;
    farmCardNumber: string;
    qrCode: string; // Same as workerId for simplicity
}

export interface AttendanceRecord {
    id?: number;
    workerId: string;
    date: string; // YYYY-MM-DD
    timeIn: string; // HH:mm
    timeOut?: string;
    status: 'Present' | 'Absent' | 'Late' | 'Leave' | 'Off Duty';
    isLate: boolean;
    notes?: string;
}

export interface CloneBatch {
    batchId: string; // GSF-CLONE-0001
    variety: string;
    sourceFarm: string;
    sourceMotherPlant: string;
    dateObtained: string;
    originalQuantity: number;
    currentQuantity: number;
    personResponsible: string;
    notes?: string;
    currentStage: 'Obtained' | 'Humid Chamber' | 'Hardening' | 'Ready for Sorting' | 'Sorted';
}

export interface CloneStageHistory {
    id?: number;
    batchId: string;
    stageName: 'Obtained' | 'Humid Chamber' | 'Hardening' | 'Sorting';
    startDate: string;
    endDate?: string;
    quantityEntering: number;
    chamberOrSection?: string;
    notes?: string;
}

export interface InventoryItem {
    inventoryId: string;
    name: string;
    category: string;
    barcode: string;
    brand: string;
    unit: string;
    quantity: number;
    minStockLevel: number;
    supplier: string;
    purchasePrice: number;
    purchaseDate: string;
    expiryDate?: string;
    location: string;
    status: 'Active' | 'Inactive';
    notes?: string;
}

export interface InventoryTransaction {
    id?: number;
    inventoryId: string;
    quantityChange: number; // Negative for usage, positive for addition
    type: 'Purchase' | 'Stock addition' | 'Stock usage' | 'Transfer' | 'Adjustment' | 'Damaged' | 'Expired' | 'Disposal';
    date: string; // ISO String
    user: string;
    reason: string;
    relatedBatchId?: string;
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
    batchId: string; // One sorting per batch
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
    type: string;
    title: string;
    message: string;
    date: string;
    read: number;
}

// --- Database Configuration ---

const db = new Dexie('GS_CoffeeFarm_DB') as Dexie & {
    users: EntityTable<User, 'id'>,
    workers: EntityTable<Worker, 'workerId'>,
    attendance: EntityTable<AttendanceRecord, 'id'>,
    cloneBatches: EntityTable<CloneBatch, 'batchId'>,
    cloneStageHistory: EntityTable<CloneStageHistory, 'id'>,
    inventoryItems: EntityTable<InventoryItem, 'inventoryId'>,
    inventoryTransactions: EntityTable<InventoryTransaction, 'id'>,
    plantletSales: EntityTable<PlantletSale, 'id'>,
    plantletSortings: EntityTable<PlantletSort, 'batchId'>,
    activityLogs: EntityTable<ActivityLog, 'id'>,
    notifications: EntityTable<AppNotification, 'id'>
};

db.version(1).stores({
    users: '++id, username, role',
    workers: 'workerId, fullName, department, status',
    attendance: '++id, workerId, date, [workerId+date], status',
    cloneBatches: 'batchId, currentStage',
    cloneStageHistory: '++id, batchId, stageName',
    inventoryItems: 'inventoryId, barcode, category',
    inventoryTransactions: '++id, inventoryId, date, relatedBatchId',
    plantletSales: '++id, batchId, date',
    plantletSortings: 'batchId, date',
    activityLogs: '++id, module, date'
});

db.version(2).stores({
    notifications: '++id, date, read, type'
});

export { db };

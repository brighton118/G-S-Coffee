import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    runTransaction,
    serverTimestamp,
    Timestamp,
    writeBatch
} from 'firebase/firestore';
import { db } from './db';
import { dbFirestore } from './firebase';

const LOCAL_CLEANUP_KEY = 'gs_demo_local_cleared_v1';
const CLOUD_CLEANUP_KEY = 'gs_demo_cloud_cleared_v1';
const LOCAL_WORKER_RESET_KEY = 'gs_all_workers_cleared_v2';
const WORKER_RESET_MIGRATION = 'systemMigrations/workers-payroll-reset-v2';
const LOCAL_INVENTORY_RESET_KEY = 'gs_all_inventory_cleared_v3';
const INVENTORY_RESET_MIGRATION = 'systemMigrations/inventory-reset-v3';
const LOCAL_CLONES_RESET_KEY = 'gs_all_clones_cleared_v2';
const CLONES_RESET_MIGRATION = 'systemMigrations/clones-production-reset-v2';
const LOCAL_SALES_RESET_KEY = 'gs_all_sales_expenses_cleared_v1';
const SALES_RESET_MIGRATION = 'systemMigrations/sales-expenses-reset-v1';

const demoWorkerIds = [
    'GSF-W-0001',
    'GSF-W-0002',
    'GSF-W-0003',
    'GSF-W-0004',
    'GSF-W-0005'
];

const demoInventoryIds = [
    'INV-FERT-001',
    'INV-FERT-002',
    'INV-PEST-001',
    'INV-PEST-002',
    'INV-TOOL-001',
    'INV-TOOL-002',
    'INV-NUR-001',
    'INV-NUR-002',
    'INV-NUR-003',
    'INV-NUR-004',
    'INV-NUR-005',
    'INV-NUR-006',
    'INV-1001',
    'INV-1002',
    'INV-1003'
];

const demoBatchIds = [
    'GSF-CLONE-0001',
    'GSF-CLONE-0002',
    'GSF-CLONE-0003',
    'GSF-CLONE-0004',
    'GSF-CLONE-0005'
];

const isDemoAttendance = (record: {
    workerId: string;
    timeIn: string;
    timeOut?: string;
    status: string;
    overtimeStatus?: string;
    notes?: string;
}) => (
    (record.workerId === 'GSF-W-0001' && record.timeIn === '07:55' && record.timeOut === '19:15' &&
        record.status === 'Present' && record.notes === 'Supervised chamber soil fumigation') ||
    (record.workerId === 'GSF-W-0002' && record.timeIn === '08:05' && !record.timeOut &&
        record.status === 'Present' && !record.notes && !record.overtimeStatus) ||
    (record.workerId === 'GSF-W-0003' && record.timeIn === '08:25' && !record.timeOut &&
        record.status === 'Late' && !record.notes && !record.overtimeStatus) ||
    (record.workerId === 'GSF-W-0001' && record.timeIn === '07:50' && record.timeOut === '19:00' &&
        record.status === 'Present' && record.overtimeStatus === 'Approved' &&
        record.notes === undefined)
);

const isDemoPayrollRecord = (record: {
    workerId: string;
    serialNumber: number;
    monthlySalary: number;
    approvedOvertimeHours: number;
    overtimeRate?: number;
    overtimeEarnings: number;
    deductions: number;
    netPay: number;
    amountPaid: number;
    balance: number;
    paymentStatus: string;
}) => (
    (record.workerId === 'GSF-W-0001' && record.serialNumber === 1 && record.monthlySalary === 650000 &&
        record.approvedOvertimeHours === 12 && record.overtimeRate === 4000 &&
        record.overtimeEarnings === 48000 && record.deductions === 10000 &&
        record.netPay === 688000 && record.amountPaid === 688000 &&
        record.balance === 0 && record.paymentStatus === 'Paid') ||
    (record.workerId === 'GSF-W-0002' && record.serialNumber === 2 && record.monthlySalary === 550000 &&
        record.approvedOvertimeHours === 6 && record.overtimeRate === 3500 &&
        record.overtimeEarnings === 21000 && record.deductions === 0 &&
        record.netPay === 571000 && record.amountPaid === 0 &&
        record.balance === 571000 && record.paymentStatus === 'Pending')
);

async function clearLocalDemoData(): Promise<void> {
    await db.transaction(
        'rw',
        [
            db.users,
            db.workers,
            db.overtimeRules,
            db.attendance,
            db.payrollRecords,
            db.cloneBatches,
            db.productionSortings,
            db.inventoryItems,
            db.salesOrders
        ],
        async () => {
            await db.users.where('username').anyOf(['admin', 'manager', 'nursery_sup', 'store_mgr']).delete();
            await db.workers.bulkDelete(demoWorkerIds);
            await db.inventoryItems.bulkDelete(demoInventoryIds);
            await db.cloneBatches.bulkDelete(demoBatchIds);

            const demoRules = await db.overtimeRules.filter(rule =>
                rule.normalStartTime === '08:00' &&
                rule.normalEndTime === '17:00' &&
                rule.requiredWorkingHours === 8 &&
                rule.overtimeThresholdMinutes === 30 &&
                rule.breakDurationMinutes === 60 &&
                rule.gracePeriodMinutes === 15 &&
                rule.overtimeRatePerHour === 3500 &&
                rule.overtimeMultiplier === 1.5 &&
                rule.requireSupervisorApproval === true &&
                rule.roundingRule === 'quarter_hour'
            ).toArray();
            await db.overtimeRules.bulkDelete(demoRules.flatMap(rule => rule.id === undefined ? [] : [rule.id]));

            const demoAttendance = await db.attendance.filter(isDemoAttendance).toArray();
            await db.attendance.bulkDelete(demoAttendance.flatMap(record => record.id === undefined ? [] : [record.id]));

            const demoPayroll = await db.payrollRecords.filter(isDemoPayrollRecord).toArray();
            await db.payrollRecords.bulkDelete(demoPayroll.flatMap(record => record.id === undefined ? [] : [record.id]));

            const demoSortings = await db.productionSortings
                .where('batchId')
                .equals('GSF-CLONE-0001')
                .filter(record =>
                    record.sortingDate === '2026-09-28' &&
                    record.quantityReceived === 1420 &&
                    record.retainedQuantity === 400 &&
                    record.forSaleQuantity === 950 &&
                    record.lostQuantity === 70 &&
                    record.totalValidatedQuantity === 1350 &&
                    record.notes === 'Strict reconciliation validated: 400 + 950 + 70 = 1420'
                )
                .toArray();
            await db.productionSortings.bulkDelete(demoSortings.flatMap(record => record.id === undefined ? [] : [record.id]));

            const demoSales = await db.salesOrders.filter(order =>
                order.orderId === 'ORD-2026-0001' || order.orderId === 'ORD-2026-0002'
            ).toArray();
            await db.salesOrders.bulkDelete(demoSales.flatMap(order => order.id === undefined ? [] : [order.id]));
        }
    );
}

async function clearCloudDemoData(): Promise<void> {
    const batch = writeBatch(dbFirestore);
    const cloudDocuments: Array<[string, string[]]> = [
        ['workers', demoWorkerIds],
        ['inventoryItems', demoInventoryIds],
        ['cloneBatches', demoBatchIds],
        ['salesOrders', ['ORD-2026-0001', 'ORD-2026-0002']],
        ['overtimeRules', ['default_farm_overtime']],
        ['settings', ['system_preferences']],
        ['activityLogs', ['INIT-LOG']]
    ];

    for (const [collectionName, documentIds] of cloudDocuments) {
        for (const documentId of documentIds) {
            batch.delete(doc(collection(dbFirestore, collectionName), documentId));
        }
    }

    await batch.commit();
}

async function clearAllLocalWorkersAndPayroll(): Promise<void> {
    await db.transaction(
        'rw',
        [db.workers, db.attendance, db.payrollRecords, db.payrollPayments],
        async () => {
            await db.workers.clear();
            await db.attendance.clear();
            await db.payrollRecords.clear();
            await db.payrollPayments.clear();
        }
    );
}

async function clearAllLocalInventory(): Promise<void> {
    await db.transaction('rw', [db.inventoryItems, db.inventoryTransactions, db.notifications], async () => {
        await db.inventoryItems.clear();
        await db.inventoryTransactions.clear();
        await db.notifications.where('type').anyOf(['Inventory Low', 'Expiry Warning']).delete();
    });
}

async function clearAllLocalClonesAndProduction(): Promise<void> {
    await db.transaction(
        'rw',
        [
            db.cloneBatches,
            db.productionCuttings,
            db.productionHumidChamber,
            db.productionFirstHardening,
            db.productionSecondHardening,
            db.productionSortings,
            db.cloneStageHistory,
            db.plantletSales,
            db.plantletSorts,
            db.notifications
        ],
        async () => {
            await db.cloneBatches.clear();
            await db.productionCuttings.clear();
            await db.productionHumidChamber.clear();
            await db.productionFirstHardening.clear();
            await db.productionSecondHardening.clear();
            await db.productionSortings.clear();
            await db.cloneStageHistory.clear();
            await db.plantletSales.clear();
            await db.plantletSorts.clear();
            await db.notifications.where('type').equals('Chamber Overdue').delete();
        }
    );
}

async function clearCloudCollection(collectionName: string): Promise<void> {
    const snapshot = await getDocs(collection(dbFirestore, collectionName));
    const documents = snapshot.docs.filter(d => !d.id.startsWith('_') && !d.data()._isSystemSchema);
    const batchLimit = 450;

    for (let start = 0; start < documents.length; start += batchLimit) {
        const batch = writeBatch(dbFirestore);
        for (const document of documents.slice(start, start + batchLimit)) {
            batch.delete(document.ref);
        }
        await batch.commit();
    }
}

async function runCloudCollectionReset(migrationPath: string, collectionNames: string[]): Promise<void> {
    const migrationRef = doc(dbFirestore, migrationPath);
    const migrationState = await runTransaction(dbFirestore, async transaction => {
        const migrationSnapshot = await transaction.get(migrationRef);
        if (migrationSnapshot.exists() && migrationSnapshot.data().status === 'completed') {
            return 'completed';
        }

        if (migrationSnapshot.exists()) {
            const startedAt = migrationSnapshot.data().startedAt;
            if (startedAt instanceof Timestamp && Date.now() - startedAt.toMillis() < 10 * 60 * 1000) {
                return 'running';
            }
        }

        transaction.set(migrationRef, {
            status: 'running',
            startedAt: serverTimestamp()
        });
        return 'claimed';
    });

    if (migrationState === 'completed') {
        return;
    }
    if (migrationState === 'running') {
        throw new Error(`The reset (${migrationPath}) is already running on another device. Reload after it completes.`);
    }

    try {
        for (const collectionName of collectionNames) {
            await clearCloudCollection(collectionName);
        }
        await runTransaction(dbFirestore, async transaction => {
            transaction.set(migrationRef, {
                status: 'completed',
                completedAt: serverTimestamp()
            });
        });
    } catch (error) {
        try {
            await deleteDoc(migrationRef);
        } catch (cleanupError) {
            console.error('Could not release the worker reset lock after a failed cleanup:', cleanupError);
        }
        throw error;
    }
}

async function clearAllCloudWorkersAndPayroll(): Promise<void> {
    await runCloudCollectionReset(WORKER_RESET_MIGRATION, [
        'workers',
        'attendance',
        'payrollRecords',
        'payrollPayments'
    ]);
}

async function clearAllCloudInventory(): Promise<void> {
    await runCloudCollectionReset(INVENTORY_RESET_MIGRATION, [
        'inventoryItems',
        'inventoryTransactions'
    ]);
}

async function clearAllCloudClonesAndProduction(): Promise<void> {
    await runCloudCollectionReset(CLONES_RESET_MIGRATION, [
        'cloneBatches',
        'productionCuttings',
        'productionHumidChamber',
        'productionFirstHardening',
        'productionSecondHardening',
        'productionSortings',
        'cloneStageHistory',
        'plantletSales',
        'plantletSorts'
    ]);
}

async function clearAllLocalSalesAndExpenses(): Promise<void> {
    await db.transaction(
        'rw',
        [
            db.salesOrders,
            db.farmExpenses,
            db.plantletSales,
            db.plantletSorts,
            db.activityLogs,
            db.notificationLogs,
            db.notifications
        ],
        async () => {
            await db.salesOrders.clear();
            await db.farmExpenses.clear();
            await db.plantletSales.clear();
            await db.plantletSorts.clear();
            await db.activityLogs.clear();
            await db.notificationLogs.clear();
            await db.notifications.clear();
        }
    );
}

async function clearAllCloudSalesAndExpenses(): Promise<void> {
    await runCloudCollectionReset(SALES_RESET_MIGRATION, [
        'salesOrders',
        'farmExpenses',
        'plantletSales',
        'plantletSorts',
        'activityLogs',
        'notificationLogs'
    ]);
}

export async function clearSeededDemoData(): Promise<void> {
    if (localStorage.getItem(LOCAL_CLEANUP_KEY) !== 'true') {
        await clearLocalDemoData();
        localStorage.setItem(LOCAL_CLEANUP_KEY, 'true');
    }

    if (localStorage.getItem(CLOUD_CLEANUP_KEY) !== 'true') {
        try {
            await clearCloudDemoData();
            localStorage.setItem(CLOUD_CLEANUP_KEY, 'true');
        } catch (e) {
            console.warn('Cloud demo data cleanup deferred:', e);
        }
    }

    if (localStorage.getItem(LOCAL_WORKER_RESET_KEY) !== 'true') {
        await clearAllLocalWorkersAndPayroll();
        localStorage.setItem(LOCAL_WORKER_RESET_KEY, 'true');
    }

    try {
        await clearAllCloudWorkersAndPayroll();
    } catch (e) {
        console.warn('Cloud worker reset deferred:', e);
    }

    if (localStorage.getItem(LOCAL_INVENTORY_RESET_KEY) !== 'true') {
        await clearAllLocalInventory();
        localStorage.setItem(LOCAL_INVENTORY_RESET_KEY, 'true');
    }

    try {
        await clearAllCloudInventory();
    } catch (e) {
        console.warn('Cloud inventory reset deferred:', e);
    }

    if (localStorage.getItem(LOCAL_CLONES_RESET_KEY) !== 'true') {
        await clearAllLocalClonesAndProduction();
        localStorage.setItem(LOCAL_CLONES_RESET_KEY, 'true');
    }

    try {
        await clearAllCloudClonesAndProduction();
    } catch (e) {
        console.warn('Cloud clones reset deferred:', e);
    }

    if (localStorage.getItem(LOCAL_SALES_RESET_KEY) !== 'true') {
        await clearAllLocalSalesAndExpenses();
        localStorage.setItem(LOCAL_SALES_RESET_KEY, 'true');
    }

    try {
        await clearAllCloudSalesAndExpenses();
    } catch (e) {
        console.warn('Cloud sales reset deferred:', e);
    }
}

export async function deleteSingleWorkerSystemWide(workerId: string): Promise<void> {
    await db.transaction(
        'rw',
        [db.workers, db.attendance, db.payrollRecords, db.payrollPayments],
        async () => {
            await db.workers.delete(workerId);
            await db.attendance.where('workerId').equals(workerId).delete();
            await db.payrollRecords.where('workerId').equals(workerId).delete();
            await db.payrollPayments.where('workerId').equals(workerId).delete();
        }
    );

    try {
        await deleteDoc(doc(dbFirestore, 'workers', workerId));

        const attSnap = await getDocs(collection(dbFirestore, 'attendance'));
        const attDocs = attSnap.docs.filter(d => d.data().workerId === workerId);
        if (attDocs.length > 0) {
            const batch = writeBatch(dbFirestore);
            attDocs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        const paySnap = await getDocs(collection(dbFirestore, 'payrollRecords'));
        const payDocs = paySnap.docs.filter(d => d.data().workerId === workerId);
        if (payDocs.length > 0) {
            const batch = writeBatch(dbFirestore);
            payDocs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    } catch (e) {
        console.warn('Cloud single worker deletion note:', e);
    }
}

export async function deleteAllWorkersSystemWide(): Promise<void> {
    await clearAllLocalWorkersAndPayroll();
    try {
        await clearCloudCollection('workers');
        await clearCloudCollection('attendance');
        await clearCloudCollection('payrollRecords');
        await clearCloudCollection('payrollPayments');
    } catch (e) {
        console.warn('Cloud all workers deletion note:', e);
    }
}

export async function deleteSingleCloneBatchSystemWide(batchId: string): Promise<void> {
    await db.transaction(
        'rw',
        [
            db.cloneBatches,
            db.productionCuttings,
            db.productionHumidChamber,
            db.productionFirstHardening,
            db.productionSecondHardening,
            db.productionSortings,
            db.cloneStageHistory,
            db.plantletSales,
            db.plantletSorts
        ],
        async () => {
            await db.cloneBatches.delete(batchId);
            await db.productionCuttings.where('batchId').equals(batchId).delete();
            await db.productionHumidChamber.where('batchId').equals(batchId).delete();
            await db.productionFirstHardening.where('batchId').equals(batchId).delete();
            await db.productionSecondHardening.where('batchId').equals(batchId).delete();
            await db.productionSortings.where('batchId').equals(batchId).delete();
            await db.cloneStageHistory.where('batchId').equals(batchId).delete();
            await db.plantletSales.where('batchId').equals(batchId).delete();
            await db.plantletSorts.delete(batchId);
        }
    );

    try {
        await deleteDoc(doc(dbFirestore, 'cloneBatches', batchId));
    } catch (e) {
        console.warn('Cloud single clone batch deletion note:', e);
    }
}

export async function deleteAllClonesSystemWide(): Promise<void> {
    await clearAllLocalClonesAndProduction();
    try {
        await clearCloudCollection('cloneBatches');
        await clearCloudCollection('productionCuttings');
        await clearCloudCollection('productionHumidChamber');
        await clearCloudCollection('productionFirstHardening');
        await clearCloudCollection('productionSecondHardening');
        await clearCloudCollection('productionSortings');
        await clearCloudCollection('cloneStageHistory');
        await clearCloudCollection('plantletSales');
        await clearCloudCollection('plantletSorts');
    } catch (e) {
        console.warn('Cloud all clones deletion note:', e);
    }
}

export async function deleteSingleInventoryItemSystemWide(inventoryId: string): Promise<void> {
    await db.transaction('rw', [db.inventoryItems, db.inventoryTransactions], async () => {
        await db.inventoryItems.delete(inventoryId);
        await db.inventoryTransactions.where('inventoryId').equals(inventoryId).delete();
    });

    try {
        await deleteDoc(doc(dbFirestore, 'inventoryItems', inventoryId));
        const transSnap = await getDocs(collection(dbFirestore, 'inventoryTransactions'));
        const transDocs = transSnap.docs.filter(d => d.data().inventoryId === inventoryId);
        if (transDocs.length > 0) {
            const batch = writeBatch(dbFirestore);
            transDocs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    } catch (e) {
        console.warn('Cloud single inventory item deletion note:', e);
    }
}

export async function deleteAllInventorySystemWide(): Promise<void> {
    await clearAllLocalInventory();
    try {
        await clearCloudCollection('inventoryItems');
        await clearCloudCollection('inventoryTransactions');
    } catch (e) {
        console.warn('Cloud all inventory deletion note:', e);
    }
}

export async function deleteSingleSalesOrderSystemWide(orderIdOrInvoice: string, numericId?: number): Promise<void> {
    await db.transaction('rw', [db.salesOrders, db.activityLogs], async () => {
        if (numericId !== undefined) {
            await db.salesOrders.delete(numericId);
        }
        const matches = await db.salesOrders.filter(o => 
            o.invoiceNumber === orderIdOrInvoice || 
            o.orderId === orderIdOrInvoice ||
            `SALE-${o.id}` === orderIdOrInvoice
        ).toArray();
        for (const m of matches) {
            if (m.id !== undefined) {
                await db.salesOrders.delete(m.id);
            }
        }
    });

    try {
        await deleteDoc(doc(dbFirestore, 'salesOrders', orderIdOrInvoice));
        if (numericId !== undefined) {
            await deleteDoc(doc(dbFirestore, 'salesOrders', `SALE-${numericId}`));
        }
        const snap = await getDocs(collection(dbFirestore, 'salesOrders'));
        const docs = snap.docs.filter(d => {
            const data = d.data();
            return d.id === orderIdOrInvoice || data.invoiceNumber === orderIdOrInvoice || data.orderId === orderIdOrInvoice;
        });
        if (docs.length > 0) {
            const batch = writeBatch(dbFirestore);
            docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    } catch (e) {
        console.warn('Cloud single sale deletion note:', e);
    }
}

export async function deleteAllSalesSystemWide(): Promise<void> {
    await db.transaction('rw', [db.salesOrders, db.plantletSales, db.plantletSorts], async () => {
        await db.salesOrders.clear();
        await db.plantletSales.clear();
        await db.plantletSorts.clear();
    });
    try {
        await clearCloudCollection('salesOrders');
        await clearCloudCollection('plantletSales');
        await clearCloudCollection('plantletSorts');
    } catch (e) {
        console.warn('Cloud all sales deletion note:', e);
    }
}

export async function deleteSingleExpenseSystemWide(expenseId: string, numericId?: number): Promise<void> {
    await db.transaction('rw', [db.farmExpenses], async () => {
        if (numericId !== undefined) {
            await db.farmExpenses.delete(numericId);
        }
        await db.farmExpenses.where('expenseId').equals(expenseId).delete();
    });
    try {
        await deleteDoc(doc(dbFirestore, 'farmExpenses', expenseId));
    } catch (e) {
        console.warn('Cloud single expense deletion note:', e);
    }
}

export async function deleteAllExpensesSystemWide(): Promise<void> {
    await db.farmExpenses.clear();
    try {
        await clearCloudCollection('farmExpenses');
    } catch (e) {
        console.warn('Cloud all expenses deletion note:', e);
    }
}




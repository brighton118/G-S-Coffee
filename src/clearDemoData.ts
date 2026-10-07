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
const LOCAL_WORKER_RESET_KEY = 'gs_all_workers_cleared_v1';
const WORKER_RESET_MIGRATION = 'systemMigrations/workers-payroll-reset-v1';

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

async function clearCloudCollection(collectionName: string): Promise<void> {
    const snapshot = await getDocs(collection(dbFirestore, collectionName));
    const documents = snapshot.docs;
    const batchLimit = 450;

    for (let start = 0; start < documents.length; start += batchLimit) {
        const batch = writeBatch(dbFirestore);
        for (const document of documents.slice(start, start + batchLimit)) {
            batch.delete(document.ref);
        }
        await batch.commit();
    }
}

async function clearAllCloudWorkersAndPayroll(): Promise<void> {
    const migrationRef = doc(dbFirestore, WORKER_RESET_MIGRATION);
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
        throw new Error('The worker and payroll reset is already running on another device. Reload after it completes.');
    }

    try {
        for (const collectionName of ['workers', 'attendance', 'payrollRecords', 'payrollPayments']) {
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

export async function clearSeededDemoData(): Promise<void> {
    if (localStorage.getItem(LOCAL_CLEANUP_KEY) !== 'true') {
        await clearLocalDemoData();
        localStorage.setItem(LOCAL_CLEANUP_KEY, 'true');
    }

    if (localStorage.getItem(CLOUD_CLEANUP_KEY) !== 'true') {
        await clearCloudDemoData();
        localStorage.setItem(CLOUD_CLEANUP_KEY, 'true');
    }

    if (localStorage.getItem(LOCAL_WORKER_RESET_KEY) !== 'true') {
        await clearAllLocalWorkersAndPayroll();
        localStorage.setItem(LOCAL_WORKER_RESET_KEY, 'true');
    }

    await clearAllCloudWorkersAndPayroll();
}

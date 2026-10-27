import { 
    collection, 
    doc, 
    getDocs, 
    onSnapshot,
    serverTimestamp,
    setDoc,
    writeBatch
} from 'firebase/firestore';
import { dbFirestore } from '../firebase';
import { db } from '../db';

/**
 * Backend Cloud Firestore Synchronization Service
 * Handles instant real-time bi-directional syncing between Local Dexie IndexedDB and Cloud Firestore.
 */

export interface SyncStatus {
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncedAt: Date | null;
    error: string | null;
}

type SyncCallback = (status: SyncStatus) => void;

class FirestoreSyncService {
    private syncListeners: Array<() => void> = [];
    private statusListeners: Array<SyncCallback> = [];
    private isInitialized = false;
    private currentStatus: SyncStatus = {
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        isSyncing: false,
        lastSyncedAt: null,
        error: null
    };

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                this.updateStatus({ isOnline: true, error: null });
                void this.syncNow();
            });
            window.addEventListener('offline', () => {
                this.updateStatus({ isOnline: false });
            });
        }
    }

    public subscribeStatus(cb: SyncCallback): () => void {
        this.statusListeners.push(cb);
        cb(this.currentStatus);
        return () => {
            this.statusListeners = this.statusListeners.filter(l => l !== cb);
        };
    }

    private updateStatus(partial: Partial<SyncStatus>) {
        this.currentStatus = { ...this.currentStatus, ...partial };
        this.statusListeners.forEach(cb => cb(this.currentStatus));
    }

    /**
     * Instant real-time push methods to Cloud Firestore
     */
    public async saveWorker(worker: any): Promise<void> {
        try {
            if (!worker?.workerId) return;
            const docRef = doc(collection(dbFirestore, 'workers'), worker.workerId);
            await setDoc(docRef, { ...worker, updatedAt: serverTimestamp() }, { merge: true });
            console.log(`[Cloud Sync] Worker ${worker.workerId} saved to Firestore.`);
        } catch (e: any) {
            console.warn('[Cloud Sync] Live worker push note:', e?.message || e);
        }
    }

    public async saveAttendance(record: any): Promise<void> {
        try {
            if (!record?.workerId || !record?.date) return;
            let recordToSave = record;
            if (!recordToSave.workerName) {
                const worker = await db.workers.where('workerId').equals(record.workerId).first();
                if (worker?.fullName) {
                    recordToSave = { ...record, workerName: worker.fullName };
                }
            }
            const key = `ATT-${recordToSave.workerId}-${recordToSave.date}`;
            const docRef = doc(collection(dbFirestore, 'attendance'), key);
            await setDoc(docRef, { ...recordToSave, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live attendance push note:', e?.message || e);
        }
    }

    public async saveSale(sale: any): Promise<void> {
        try {
            const key = sale.invoiceNumber || sale.orderId || `SALE-${sale.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'salesOrders'), key);
            await setDoc(docRef, { ...sale, updatedAt: serverTimestamp() }, { merge: true });
            console.log(`[Cloud Sync] Sale ${key} saved to Firestore.`);
        } catch (e: any) {
            console.warn('[Cloud Sync] Live sale push note:', e?.message || e);
        }
    }

    public async saveInventoryItem(item: any): Promise<void> {
        try {
            if (!item?.inventoryId) return;
            const docRef = doc(collection(dbFirestore, 'inventoryItems'), item.inventoryId);
            await setDoc(docRef, { ...item, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live inventory push note:', e?.message || e);
        }
    }

    public async saveInventoryTransaction(tx: any): Promise<void> {
        try {
            if (!tx?.inventoryId) return;
            const key = `TX-${tx.inventoryId}-${tx.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'inventoryTransactions'), key);
            await setDoc(docRef, { ...tx, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live inventory tx push note:', e?.message || e);
        }
    }

    public async saveFarmExpense(expense: any): Promise<void> {
        try {
            const key = expense.expenseId || `EXP-${expense.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'farmExpenses'), key);
            await setDoc(docRef, { ...expense, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live expense push note:', e?.message || e);
        }
    }

    public async saveCloneBatch(batch: any): Promise<void> {
        try {
            if (!batch?.batchId) return;
            const docRef = doc(collection(dbFirestore, 'cloneBatches'), batch.batchId);
            await setDoc(docRef, { ...batch, updatedAt: serverTimestamp() }, { merge: true });
            console.log(`[Cloud Sync] Clone batch ${batch.batchId} saved to Firestore.`);
        } catch (e: any) {
            console.warn('[Cloud Sync] Live clone batch push note:', e?.message || e);
        }
    }

    public async saveProductionCutting(cutting: any): Promise<void> {
        try {
            if (!cutting?.batchId) return;
            const key = `CUT-${cutting.batchId}-${cutting.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'productionCuttings'), key);
            await setDoc(docRef, { ...cutting, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live cutting push note:', e?.message || e);
        }
    }

    public async savePayrollPayment(payment: any): Promise<void> {
        try {
            if (!payment?.workerId) return;
            const key = `PAY-${payment.id || payment.paymentDate + '_' + payment.workerId}`;
            const docRef = doc(collection(dbFirestore, 'payrollPayments'), key);
            await setDoc(docRef, { ...payment, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live payroll payment push note:', e?.message || e);
        }
    }

    public async savePayrollRecord(record: any): Promise<void> {
        try {
            if (!record?.workerId) return;
            const key = `${record.payrollMonth}_${record.workerId}`;
            const docRef = doc(collection(dbFirestore, 'payrollRecords'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live payroll record push note:', e?.message || e);
        }
    }

    public async saveHumidChamber(record: any): Promise<void> {
        try {
            if (!record?.batchId) return;
            const key = `HC-${record.batchId}-${record.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'productionHumidChamber'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live humid chamber push note:', e?.message || e);
        }
    }

    public async saveFirstHardening(record: any): Promise<void> {
        try {
            if (!record?.batchId) return;
            const key = `FH-${record.batchId}-${record.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'productionFirstHardening'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live first hardening push note:', e?.message || e);
        }
    }

    public async saveSecondHardening(record: any): Promise<void> {
        try {
            if (!record?.batchId) return;
            const key = `SH-${record.batchId}-${record.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'productionSecondHardening'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live second hardening push note:', e?.message || e);
        }
    }

    public async saveProductionSorting(record: any): Promise<void> {
        try {
            if (!record?.batchId) return;
            const key = `SORT-${record.batchId}-${record.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'productionSortings'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live sorting push note:', e?.message || e);
        }
    }

    public async saveCloneStageHistory(record: any): Promise<void> {
        try {
            if (!record?.batchId) return;
            const key = `CSH-${record.batchId}-${record.stageName}-${record.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'cloneStageHistory'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live clone stage history push note:', e?.message || e);
        }
    }

    public async savePlantletSale(record: any): Promise<void> {
        try {
            if (!record?.batchId) return;
            const key = `PS-${record.batchId}-${record.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'plantletSales'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live plantlet sale push note:', e?.message || e);
        }
    }

    public async savePlantletSort(record: any): Promise<void> {
        try {
            if (!record?.batchId) return;
            const docRef = doc(collection(dbFirestore, 'plantletSorts'), record.batchId);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live plantlet sort push note:', e?.message || e);
        }
    }

    public async saveOvertimeRule(record: any): Promise<void> {
        try {
            const key = `OT-RULE-${record.id || 'default'}`;
            const docRef = doc(collection(dbFirestore, 'overtimeRules'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live overtime rule push note:', e?.message || e);
        }
    }

    public async saveNotification(record: any): Promise<void> {
        try {
            const key = `NOTIF-${record.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'notifications'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e: any) {
            console.warn('[Cloud Sync] Live notification push note:', e?.message || e);
        }
    }

    /**
     * Upload local Dexie records up to Cloud Firestore in safe chunked batches
     */
    public async syncLocalToCloud(): Promise<void> {
        if (!navigator.onLine) {
            this.updateStatus({ isOnline: false });
            return;
        }

        try {
            const operations: Array<{ ref: any; data: any }> = [];

            // 1. Workers
            const workers = await db.workers.toArray();
            for (const worker of workers) {
                operations.push({
                    ref: doc(collection(dbFirestore, 'workers'), worker.workerId),
                    data: { ...worker, updatedAt: serverTimestamp() }
                });
            }

            // 2. Sales Orders
            const sales = await db.salesOrders.toArray();
            for (const sale of sales) {
                const key = sale.invoiceNumber || sale.orderId || `SALE-${sale.id}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'salesOrders'), key),
                    data: { ...sale, updatedAt: serverTimestamp() }
                });
            }

            // 3. Inventory Items
            const items = await db.inventoryItems.toArray();
            for (const item of items) {
                operations.push({
                    ref: doc(collection(dbFirestore, 'inventoryItems'), item.inventoryId),
                    data: { ...item, updatedAt: serverTimestamp() }
                });
            }

            // 4. Farm Expenses
            const farmExpenses = await db.farmExpenses.toArray();
            for (const expense of farmExpenses) {
                operations.push({
                    ref: doc(collection(dbFirestore, 'farmExpenses'), expense.expenseId),
                    data: { ...expense, updatedAt: serverTimestamp() }
                });
            }

            // 5. Payroll Records
            const payrolls = await db.payrollRecords.toArray();
            for (const pr of payrolls) {
                const key = `${pr.payrollMonth}_${pr.workerId}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'payrollRecords'), key),
                    data: { ...pr, updatedAt: serverTimestamp() }
                });
            }

            // 6. Payroll Payments
            const payments = await db.payrollPayments.toArray();
            for (const p of payments) {
                const key = `PAY-${p.id || p.paymentDate + '_' + p.workerId}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'payrollPayments'), key),
                    data: { ...p, updatedAt: serverTimestamp() }
                });
            }

            // 7. Clone Batches
            const batches = await db.cloneBatches.toArray();
            for (const b of batches) {
                operations.push({
                    ref: doc(collection(dbFirestore, 'cloneBatches'), b.batchId),
                    data: { ...b, updatedAt: serverTimestamp() }
                });
            }

            // 8. Attendance Records
            const attendanceList = await db.attendance.toArray();
            const workersList = await db.workers.toArray();
            const workerNameMap = new Map(workersList.map(w => [w.workerId, w.fullName]));
            for (const att of attendanceList) {
                const resolvedName = att.workerName || workerNameMap.get(att.workerId);
                const attData = resolvedName && !att.workerName ? { ...att, workerName: resolvedName } : att;
                const key = `ATT-${att.workerId}-${att.date}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'attendance'), key),
                    data: { ...attData, updatedAt: serverTimestamp() }
                });
            }

            // 9. Inventory Transactions
            const txList = await db.inventoryTransactions.toArray();
            for (const tx of txList) {
                const key = `TX-${tx.inventoryId}-${tx.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'inventoryTransactions'), key),
                    data: { ...tx, updatedAt: serverTimestamp() }
                });
            }

            // 10. Production Cuttings
            const cuttings = await db.productionCuttings.toArray();
            for (const c of cuttings) {
                const key = `CUT-${c.batchId}-${c.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'productionCuttings'), key),
                    data: { ...c, updatedAt: serverTimestamp() }
                });
            }

            // 11. Production Humid Chamber
            const humidChambers = await db.productionHumidChamber.toArray();
            for (const hc of humidChambers) {
                const key = `HC-${hc.batchId}-${hc.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'productionHumidChamber'), key),
                    data: { ...hc, updatedAt: serverTimestamp() }
                });
            }

            // 12. Production First Hardening
            const firstHardenings = await db.productionFirstHardening.toArray();
            for (const fh of firstHardenings) {
                const key = `FH-${fh.batchId}-${fh.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'productionFirstHardening'), key),
                    data: { ...fh, updatedAt: serverTimestamp() }
                });
            }

            // 13. Production Second Hardening
            const secondHardenings = await db.productionSecondHardening.toArray();
            for (const sh of secondHardenings) {
                const key = `SH-${sh.batchId}-${sh.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'productionSecondHardening'), key),
                    data: { ...sh, updatedAt: serverTimestamp() }
                });
            }

            // 14. Production Sortings
            const sortings = await db.productionSortings.toArray();
            for (const s of sortings) {
                const key = `SORT-${s.batchId}-${s.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'productionSortings'), key),
                    data: { ...s, updatedAt: serverTimestamp() }
                });
            }

            // 15. Clone Stage History
            const stageHistory = await db.cloneStageHistory.toArray();
            for (const csh of stageHistory) {
                const key = `CSH-${csh.batchId}-${csh.stageName}-${csh.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'cloneStageHistory'), key),
                    data: { ...csh, updatedAt: serverTimestamp() }
                });
            }

            // 16. Plantlet Sales
            const plantletSales = await db.plantletSales.toArray();
            for (const ps of plantletSales) {
                const key = `PS-${ps.batchId}-${ps.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'plantletSales'), key),
                    data: { ...ps, updatedAt: serverTimestamp() }
                });
            }

            // 17. Plantlet Sorts
            const plantletSorts = await db.plantletSorts.toArray();
            for (const pst of plantletSorts) {
                operations.push({
                    ref: doc(collection(dbFirestore, 'plantletSorts'), pst.batchId),
                    data: { ...pst, updatedAt: serverTimestamp() }
                });
            }

            // 18. Overtime Rules
            const overtimeRules = await db.overtimeRules.toArray();
            for (const or_ of overtimeRules) {
                const key = `OT-RULE-${or_.id || 'default'}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'overtimeRules'), key),
                    data: { ...or_, updatedAt: serverTimestamp() }
                });
            }

            // 19. Notifications (so all users see the same alerts)
            const notifications = await db.notifications.toArray();
            for (const notif of notifications) {
                const key = `NOTIF-${notif.id || Date.now()}`;
                operations.push({
                    ref: doc(collection(dbFirestore, 'notifications'), key),
                    data: { ...notif, updatedAt: serverTimestamp() }
                });
            }

            // Execute in chunks of 450 (below Firestore's 500 max limit)
            const chunkSize = 450;
            for (let i = 0; i < operations.length; i += chunkSize) {
                const chunk = operations.slice(i, i + chunkSize);
                const batch = writeBatch(dbFirestore);
                for (const op of chunk) {
                    batch.set(op.ref, op.data, { merge: true });
                }
                await batch.commit();
            }

            if (operations.length > 0) {
                console.log(`[Cloud Sync] Uploaded ${operations.length} records to Cloud Firestore.`);
            }
        } catch (error: any) {
            console.warn('[Cloud Sync] Upload note:', error?.message || error);
        }
    }

    /**
     * Download cloud records from Firestore into local Dexie database
     */
    public async syncCloudToLocal(): Promise<void> {
        if (!navigator.onLine) return;

        try {
            // 1. Pull Workers
            const workersSnap = await getDocs(collection(dbFirestore, 'workers'));
            for (const docSnap of workersSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                await db.workers.put(docSnap.data() as any);
            }

            // 2. Pull Inventory Items
            const invSnap = await getDocs(collection(dbFirestore, 'inventoryItems'));
            for (const docSnap of invSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                await db.inventoryItems.put(docSnap.data() as any);
            }

            // 3. Pull Sales Orders (safely avoiding primary key constraint errors)
            const salesSnap = await getDocs(collection(dbFirestore, 'salesOrders'));
            for (const docSnap of salesSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const s = docSnap.data();
                const invoiceNumber = s.invoiceNumber || s.orderId || docSnap.id;
                const existing = await db.salesOrders.where('invoiceNumber').equals(invoiceNumber).first();
                if (existing && existing.id !== undefined) {
                    await db.salesOrders.update(existing.id, { ...s, invoiceNumber });
                } else {
                    const { id: _ignore, ...cleanSale } = s;
                    await db.salesOrders.add({ ...cleanSale, invoiceNumber } as any);
                }
            }

            // 4. Pull Clone Batches
            const batchesSnap = await getDocs(collection(dbFirestore, 'cloneBatches'));
            for (const docSnap of batchesSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                await db.cloneBatches.put(docSnap.data() as any);
            }

            // 5. Pull Farm Expenses
            const expensesSnap = await getDocs(collection(dbFirestore, 'farmExpenses'));
            for (const expenseDoc of expensesSnap.docs) {
                if (expenseDoc.id.startsWith('_') || expenseDoc.data()._isSystemSchema) continue;
                const expense = expenseDoc.data();
                const expenseId = typeof expense.expenseId === 'string' ? expense.expenseId : expenseDoc.id;
                if (!expenseId) continue;
                const existing = await db.farmExpenses.where('expenseId').equals(expenseId).first();
                await db.farmExpenses.put({ ...expense, expenseId, id: existing?.id } as any);
            }

            // 6. Pull Attendance
            const attSnap = await getDocs(collection(dbFirestore, 'attendance'));
            for (const docSnap of attSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.workerId || !data.date) continue;
                let workerName = data.workerName;
                if (!workerName) {
                    const worker = await db.workers.where('workerId').equals(data.workerId).first();
                    if (worker?.fullName) workerName = worker.fullName;
                }
                const cleanData = workerName ? { ...data, workerName } : data;
                const existing = await db.attendance
                    .where('workerId').equals(data.workerId)
                    .filter(a => a.date === data.date)
                    .first();
                if (existing && existing.id !== undefined) {
                    await db.attendance.update(existing.id, cleanData as any);
                } else {
                    const { id: _ignore, ...cleanAtt } = cleanData;
                    await db.attendance.add(cleanAtt as any);
                }
            }

            // 7. Pull Payroll Records
            const paySnap = await getDocs(collection(dbFirestore, 'payrollRecords'));
            for (const docSnap of paySnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.payrollMonth || !data.workerId) continue;
                const existing = await db.payrollRecords
                    .where('payrollMonth').equals(data.payrollMonth)
                    .filter(r => r.workerId === data.workerId)
                    .first();
                if (existing && existing.id !== undefined) {
                    await db.payrollRecords.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...cleanPR } = data;
                    await db.payrollRecords.add(cleanPR as any);
                }
            }

            // 8. Pull Payroll Payments
            const payPaySnap = await getDocs(collection(dbFirestore, 'payrollPayments'));
            for (const docSnap of payPaySnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.workerId || !data.amount) continue;
                const existing = await db.payrollPayments
                    .where('workerId').equals(data.workerId)
                    .filter(p => p.payrollMonth === data.payrollMonth && p.paymentDate === data.paymentDate && p.amount === data.amount)
                    .first();
                if (existing && existing.id !== undefined) {
                    await db.payrollPayments.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...cleanPay } = data;
                    await db.payrollPayments.add(cleanPay as any);
                }
            }

            // 9. Pull Production Cuttings
            const cutSnap = await getDocs(collection(dbFirestore, 'productionCuttings'));
            for (const docSnap of cutSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.batchId) continue;
                const existing = await db.productionCuttings.where('batchId').equals(data.batchId).first();
                if (existing && existing.id !== undefined) {
                    await db.productionCuttings.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...cleanCut } = data;
                    await db.productionCuttings.add(cleanCut as any);
                }
            }

            // 10. Pull Production Humid Chamber
            const hcSnap = await getDocs(collection(dbFirestore, 'productionHumidChamber'));
            for (const docSnap of hcSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.batchId) continue;
                const existing = await db.productionHumidChamber.where('batchId').equals(data.batchId).first();
                if (existing && existing.id !== undefined) {
                    await db.productionHumidChamber.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...clean } = data;
                    await db.productionHumidChamber.add(clean as any);
                }
            }

            // 11. Pull Production First Hardening
            const fhSnap = await getDocs(collection(dbFirestore, 'productionFirstHardening'));
            for (const docSnap of fhSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.batchId) continue;
                const existing = await db.productionFirstHardening.where('batchId').equals(data.batchId).first();
                if (existing && existing.id !== undefined) {
                    await db.productionFirstHardening.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...clean } = data;
                    await db.productionFirstHardening.add(clean as any);
                }
            }

            // 12. Pull Production Second Hardening
            const shSnap = await getDocs(collection(dbFirestore, 'productionSecondHardening'));
            for (const docSnap of shSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.batchId) continue;
                const existing = await db.productionSecondHardening.where('batchId').equals(data.batchId).first();
                if (existing && existing.id !== undefined) {
                    await db.productionSecondHardening.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...clean } = data;
                    await db.productionSecondHardening.add(clean as any);
                }
            }

            // 13. Pull Production Sortings
            const sortSnap = await getDocs(collection(dbFirestore, 'productionSortings'));
            for (const docSnap of sortSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.batchId) continue;
                const existing = await db.productionSortings.where('batchId').equals(data.batchId).first();
                if (existing && existing.id !== undefined) {
                    await db.productionSortings.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...clean } = data;
                    await db.productionSortings.add(clean as any);
                }
            }

            // 14. Pull Clone Stage History
            const cshSnap = await getDocs(collection(dbFirestore, 'cloneStageHistory'));
            for (const docSnap of cshSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.batchId) continue;
                const existing = await db.cloneStageHistory.where('batchId').equals(data.batchId).first();
                if (existing && existing.id !== undefined) {
                    await db.cloneStageHistory.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...clean } = data;
                    await db.cloneStageHistory.add(clean as any);
                }
            }

            // 15. Pull Plantlet Sales
            const psSnap = await getDocs(collection(dbFirestore, 'plantletSales'));
            for (const docSnap of psSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.batchId) continue;
                const existing = await db.plantletSales.where('batchId').equals(data.batchId).first();
                if (existing && existing.id !== undefined) {
                    await db.plantletSales.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...clean } = data;
                    await db.plantletSales.add(clean as any);
                }
            }

            // 16. Pull Plantlet Sorts
            const pstSnap = await getDocs(collection(dbFirestore, 'plantletSorts'));
            for (const docSnap of pstSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                await db.plantletSorts.put(docSnap.data() as any);
            }

            // 17. Pull Overtime Rules
            const orSnap = await getDocs(collection(dbFirestore, 'overtimeRules'));
            for (const docSnap of orSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                const existing = await db.overtimeRules.toArray();
                if (existing.length > 0 && existing[0].id !== undefined) {
                    await db.overtimeRules.update(existing[0].id, data as any);
                } else {
                    const { id: _ignore, ...clean } = data;
                    await db.overtimeRules.add(clean as any);
                }
            }

            // 18. Pull Notifications (shared alerts across all users)
            const notifSnap = await getDocs(collection(dbFirestore, 'notifications'));
            for (const docSnap of notifSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                if (!data.type || !data.title) continue;
                // Use date+type+title as dedup key
                const existing = await db.notifications
                    .where('date').equals(data.date || '')
                    .filter(n => n.type === data.type && n.title === data.title)
                    .first();
                if (existing && existing.id !== undefined) {
                    await db.notifications.update(existing.id, data as any);
                } else {
                    const { id: _ignore, ...clean } = data;
                    await db.notifications.add(clean as any);
                }
            }

            console.log('[Cloud Sync] Download from Cloud Firestore complete.');
        } catch (error: any) {
            console.warn('[Cloud Sync] Download notice:', error?.message || error);
        }
    }

    /**
     * Bi-directional immediate sync
     */
    public async syncNow(): Promise<void> {
        this.updateStatus({ isSyncing: true, error: null });
        try {
            await this.syncLocalToCloud();
            await this.syncCloudToLocal();
            this.updateStatus({
                isSyncing: false,
                lastSyncedAt: new Date(),
                error: null
            });
        } catch (err: any) {
            this.updateStatus({
                isSyncing: false,
                error: err?.message || 'Sync error'
            });
        }
    }

    /**
     * Start real-time Firestore listeners for collaborative multi-device live sync
     */
    public startRealtimeSync(): void {
        if (this.isInitialized) return;
        this.isInitialized = true;

        try {
            // 1. Real-time Workers
            const unsubWorkers = onSnapshot(collection(dbFirestore, 'workers'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        await db.workers.put(change.doc.data() as any);
                    } else if (change.type === 'removed') {
                        await db.workers.delete(change.doc.id);
                    }
                });
            }, (err) => console.info('Firestore workers listener active:', err.message));

            // 2. Real-time Sales Orders
            const unsubSales = onSnapshot(collection(dbFirestore, 'salesOrders'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        const invoiceNum = data.invoiceNumber || data.orderId || change.doc.id;
                        const existing = await db.salesOrders.where('invoiceNumber').equals(invoiceNum).first();
                        if (existing && existing.id !== undefined) {
                            await db.salesOrders.update(existing.id, { ...data, invoiceNumber: invoiceNum });
                        } else {
                            const { id: _ignore, ...cleanData } = data;
                            await db.salesOrders.add({ ...cleanData, invoiceNumber: invoiceNum } as any);
                        }
                    } else if (change.type === 'removed') {
                        const docId = change.doc.id;
                        const orders = await db.salesOrders.toArray();
                        const matches = orders.filter(o =>
                            o.invoiceNumber === docId ||
                            o.orderId === docId ||
                            `SALE-${o.id}` === docId
                        );
                        for (const match of matches) {
                            if (match.id !== undefined) {
                                await db.salesOrders.delete(match.id);
                            }
                        }
                    }
                });
            }, (err) => console.info('Firestore sales listener active:', err.message));

            // 3. Real-time Farm Expenses
            const unsubFarmExpenses = onSnapshot(collection(dbFirestore, 'farmExpenses'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        const expenseId = typeof data.expenseId === 'string' ? data.expenseId : change.doc.id;
                        if (!expenseId) return;
                        const existing = await db.farmExpenses.where('expenseId').equals(expenseId).first();
                        await db.farmExpenses.put({ ...data, expenseId, id: existing?.id } as any);
                    } else if (change.type === 'removed') {
                        await db.farmExpenses.where('expenseId').equals(change.doc.id).delete();
                    }
                });
            }, (err) => console.info('Firestore farm expense listener active:', err.message));

            // 4. Real-time Clone Batches
            const unsubCloneBatches = onSnapshot(collection(dbFirestore, 'cloneBatches'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        await db.cloneBatches.put(change.doc.data() as any);
                    } else if (change.type === 'removed') {
                        await db.cloneBatches.delete(change.doc.id);
                    }
                });
            }, (err) => console.info('Firestore cloneBatches listener active:', err.message));

            // 5. Real-time Inventory Items
            const unsubInventory = onSnapshot(collection(dbFirestore, 'inventoryItems'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        await db.inventoryItems.put(change.doc.data() as any);
                    } else if (change.type === 'removed') {
                        await db.inventoryItems.delete(change.doc.id);
                    }
                });
            }, (err) => console.info('Firestore inventory listener active:', err.message));

            // 6. Real-time Attendance
            const unsubAttendance = onSnapshot(collection(dbFirestore, 'attendance'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.workerId || !data.date) return;
                        let workerName = data.workerName;
                        if (!workerName) {
                            const worker = await db.workers.where('workerId').equals(data.workerId).first();
                            if (worker?.fullName) workerName = worker.fullName;
                        }
                        const cleanData = workerName ? { ...data, workerName } : data;
                        const existing = await db.attendance
                            .where('workerId').equals(data.workerId)
                            .filter(a => a.date === data.date)
                            .first();
                        if (existing && existing.id !== undefined) {
                            await db.attendance.update(existing.id, cleanData as any);
                        } else {
                            const { id: _ignore, ...cleanDataNoId } = cleanData;
                            await db.attendance.add(cleanDataNoId as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore attendance listener active:', err.message));

            // 7. Real-time Payroll Records
            const unsubPayroll = onSnapshot(collection(dbFirestore, 'payrollRecords'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.payrollMonth || !data.workerId) return;
                        const existing = await db.payrollRecords
                            .where('payrollMonth').equals(data.payrollMonth)
                            .filter(r => r.workerId === data.workerId)
                            .first();
                        if (existing && existing.id !== undefined) {
                            await db.payrollRecords.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...cleanData } = data;
                            await db.payrollRecords.add(cleanData as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore payroll listener active:', err.message));

            // 7b. Real-time Payroll Payments
            const unsubPayrollPayments = onSnapshot(collection(dbFirestore, 'payrollPayments'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.workerId || !data.amount) return;
                        const existing = await db.payrollPayments
                            .where('workerId').equals(data.workerId)
                            .filter(p => p.payrollMonth === data.payrollMonth && p.paymentDate === data.paymentDate && p.amount === data.amount)
                            .first();
                        if (existing && existing.id !== undefined) {
                            await db.payrollPayments.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...cleanPay } = data;
                            await db.payrollPayments.add(cleanPay as any);
                        }
                        if (data.payrollMonth) {
                            import('./payrollSync').then(({ syncPayrollMonth }) => {
                                void syncPayrollMonth(data.payrollMonth);
                            }).catch(() => {});
                        }
                    }
                });
            }, (err) => console.info('Firestore payrollPayments listener active:', err.message));

            // 8. Real-time Production Humid Chamber
            const unsubHumidChamber = onSnapshot(collection(dbFirestore, 'productionHumidChamber'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.batchId) return;
                        const existing = await db.productionHumidChamber.where('batchId').equals(data.batchId).first();
                        if (existing && existing.id !== undefined) {
                            await db.productionHumidChamber.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...clean } = data;
                            await db.productionHumidChamber.add(clean as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore humidChamber listener active:', err.message));

            // 9. Real-time Production First Hardening
            const unsubFirstHardening = onSnapshot(collection(dbFirestore, 'productionFirstHardening'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.batchId) return;
                        const existing = await db.productionFirstHardening.where('batchId').equals(data.batchId).first();
                        if (existing && existing.id !== undefined) {
                            await db.productionFirstHardening.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...clean } = data;
                            await db.productionFirstHardening.add(clean as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore firstHardening listener active:', err.message));

            // 10. Real-time Production Second Hardening
            const unsubSecondHardening = onSnapshot(collection(dbFirestore, 'productionSecondHardening'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.batchId) return;
                        const existing = await db.productionSecondHardening.where('batchId').equals(data.batchId).first();
                        if (existing && existing.id !== undefined) {
                            await db.productionSecondHardening.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...clean } = data;
                            await db.productionSecondHardening.add(clean as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore secondHardening listener active:', err.message));

            // 11. Real-time Production Sortings
            const unsubSortings = onSnapshot(collection(dbFirestore, 'productionSortings'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.batchId) return;
                        const existing = await db.productionSortings.where('batchId').equals(data.batchId).first();
                        if (existing && existing.id !== undefined) {
                            await db.productionSortings.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...clean } = data;
                            await db.productionSortings.add(clean as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore sortings listener active:', err.message));

            // 12. Real-time Clone Stage History
            const unsubStageHistory = onSnapshot(collection(dbFirestore, 'cloneStageHistory'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.batchId) return;
                        const existing = await db.cloneStageHistory.where('batchId').equals(data.batchId).first();
                        if (existing && existing.id !== undefined) {
                            await db.cloneStageHistory.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...clean } = data;
                            await db.cloneStageHistory.add(clean as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore cloneStageHistory listener active:', err.message));

            // 13. Real-time Plantlet Sales
            const unsubPlantletSales = onSnapshot(collection(dbFirestore, 'plantletSales'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.batchId) return;
                        const existing = await db.plantletSales.where('batchId').equals(data.batchId).first();
                        if (existing && existing.id !== undefined) {
                            await db.plantletSales.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...clean } = data;
                            await db.plantletSales.add(clean as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore plantletSales listener active:', err.message));

            // 14. Real-time Plantlet Sorts
            const unsubPlantletSorts = onSnapshot(collection(dbFirestore, 'plantletSorts'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        await db.plantletSorts.put(change.doc.data() as any);
                    } else if (change.type === 'removed') {
                        await db.plantletSorts.delete(change.doc.id);
                    }
                });
            }, (err) => console.info('Firestore plantletSorts listener active:', err.message));

            // 15. Real-time Notifications (shared across all logged-in users)
            const unsubNotifications = onSnapshot(collection(dbFirestore, 'notifications'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if (!data.type || !data.title) return;
                        const existing = await db.notifications
                            .where('date').equals(data.date || '')
                            .filter(n => n.type === data.type && n.title === data.title)
                            .first();
                        if (existing && existing.id !== undefined) {
                            await db.notifications.update(existing.id, data as any);
                        } else {
                            const { id: _ignore, ...clean } = data;
                            await db.notifications.add(clean as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore notifications listener active:', err.message));

            this.syncListeners.push(
                unsubWorkers, 
                unsubSales, 
                unsubFarmExpenses, 
                unsubCloneBatches, 
                unsubInventory, 
                unsubAttendance,
                unsubPayroll,
                unsubPayrollPayments,
                unsubHumidChamber,
                unsubFirstHardening,
                unsubSecondHardening,
                unsubSortings,
                unsubStageHistory,
                unsubPlantletSales,
                unsubPlantletSorts,
                unsubNotifications
            );
        } catch (err: any) {
            console.info('Realtime sync setup completed:', err?.message || err);
        }
    }

    /**
     * Cleanup listeners on unmount
     */
    public stopRealtimeSync(): void {
        this.syncListeners.forEach(unsub => unsub());
        this.syncListeners = [];
        this.isInitialized = false;
    }
}

export const firestoreSyncService = new FirestoreSyncService();

/**
 * Repairs any existing attendance records in IndexedDB that are missing workerName
 * by looking up the worker's fullName using workerId.
 */
export async function backfillAttendanceWorkerNames(): Promise<number> {
    try {
        const attendanceRecords = await db.attendance.toArray();
        const recordsWithoutName = attendanceRecords.filter(r => !r.workerName);
        if (recordsWithoutName.length === 0) return 0;
        const workers = await db.workers.toArray();
        const workerMap = new Map(workers.map(w => [w.workerId, w.fullName]));
        let updatedCount = 0;
        for (const record of recordsWithoutName) {
            const fullName = workerMap.get(record.workerId);
            if (fullName && record.id !== undefined) {
                await db.attendance.update(record.id, { workerName: fullName });
                updatedCount++;
            }
        }
        if (updatedCount > 0) {
            console.log(`[Attendance] Backfilled worker names for ${updatedCount} existing record(s).`);
        }
        return updatedCount;
    } catch (e) {
        console.warn('Attendance workerName backfill note:', e);
        return 0;
    }
}

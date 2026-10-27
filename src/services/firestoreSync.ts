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
    public async syncLocalToCloud(): Promise<number> {
        if (!navigator.onLine) {
            this.updateStatus({ isOnline: false });
            return 0;
        }

        let totalUploaded = 0;
        try {
            const operations: Array<{ ref: any; data: any }> = [];

            // 1. Workers
            try {
                const workers = await db.workers.toArray();
                for (const worker of workers) {
                    if (!worker?.workerId) continue;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'workers'), worker.workerId),
                        data: { ...worker, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read workers note:', err);
            }

            // 2. Sales Orders
            try {
                const sales = await db.salesOrders.toArray();
                for (const sale of sales) {
                    const key = sale?.invoiceNumber || sale?.orderId || (sale?.id ? `SALE-${sale.id}` : null);
                    if (!key) continue;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'salesOrders'), key),
                        data: { ...sale, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read sales note:', err);
            }

            // 3. Inventory Items
            try {
                const items = await db.inventoryItems.toArray();
                for (const item of items) {
                    if (!item?.inventoryId) continue;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'inventoryItems'), item.inventoryId),
                        data: { ...item, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read inventory note:', err);
            }

            // 4. Farm Expenses
            try {
                const farmExpenses = await db.farmExpenses.toArray();
                for (const expense of farmExpenses) {
                    const key = expense?.expenseId || (expense?.id ? `EXP-${expense.id}` : null);
                    if (!key) continue;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'farmExpenses'), key),
                        data: { ...expense, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read expenses note:', err);
            }

            // 5. Payroll Records
            try {
                const payrolls = await db.payrollRecords.toArray();
                for (const pr of payrolls) {
                    if (!pr?.workerId || !pr?.payrollMonth) continue;
                    const key = `${pr.payrollMonth}_${pr.workerId}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'payrollRecords'), key),
                        data: { ...pr, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read payroll records note:', err);
            }

            // 6. Payroll Payments
            try {
                const payments = await db.payrollPayments.toArray();
                for (const p of payments) {
                    if (!p?.workerId) continue;
                    const key = p.id ? `PAY-${p.id}` : `PAY-${p.paymentDate || 'DATE'}_${p.workerId}_${p.amount || 0}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'payrollPayments'), key),
                        data: { ...p, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read payroll payments note:', err);
            }

            // 7. Clone Batches
            try {
                const batches = await db.cloneBatches.toArray();
                for (const b of batches) {
                    if (!b?.batchId) continue;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'cloneBatches'), b.batchId),
                        data: { ...b, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read batches note:', err);
            }

            // 8. Attendance Records
            try {
                const attendanceList = await db.attendance.toArray();
                const workersList = await db.workers.toArray();
                const workerNameMap = new Map(workersList.map(w => [w.workerId, w.fullName]));
                for (const att of attendanceList) {
                    if (!att?.workerId || !att?.date) continue;
                    const resolvedName = att.workerName || workerNameMap.get(att.workerId);
                    const attData = resolvedName && !att.workerName ? { ...att, workerName: resolvedName } : att;
                    const key = `ATT-${att.workerId}-${att.date}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'attendance'), key),
                        data: { ...attData, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read attendance note:', err);
            }

            // 9. Inventory Transactions
            try {
                const txList = await db.inventoryTransactions.toArray();
                for (const tx of txList) {
                    if (!tx?.inventoryId) continue;
                    const key = `TX-${tx.inventoryId}-${tx.id || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'inventoryTransactions'), key),
                        data: { ...tx, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read inventory tx note:', err);
            }

            // 10. Production Cuttings
            try {
                const cuttings = await db.productionCuttings.toArray();
                for (const c of cuttings) {
                    if (!c?.batchId) continue;
                    const key = `CUT-${c.batchId}-${c.id || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'productionCuttings'), key),
                        data: { ...c, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read cuttings note:', err);
            }

            // 11. Production Humid Chamber
            try {
                const humidChambers = await db.productionHumidChamber.toArray();
                for (const hc of humidChambers) {
                    if (!hc?.batchId) continue;
                    const key = `HC-${hc.batchId}-${hc.id || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'productionHumidChamber'), key),
                        data: { ...hc, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read humid chamber note:', err);
            }

            // 12. Production First Hardening
            try {
                const firstHardenings = await db.productionFirstHardening.toArray();
                for (const fh of firstHardenings) {
                    if (!fh?.batchId) continue;
                    const key = `FH-${fh.batchId}-${fh.id || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'productionFirstHardening'), key),
                        data: { ...fh, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read first hardening note:', err);
            }

            // 13. Production Second Hardening
            try {
                const secondHardenings = await db.productionSecondHardening.toArray();
                for (const sh of secondHardenings) {
                    if (!sh?.batchId) continue;
                    const key = `SH-${sh.batchId}-${sh.id || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'productionSecondHardening'), key),
                        data: { ...sh, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read second hardening note:', err);
            }

            // 14. Production Sortings
            try {
                const sortings = await db.productionSortings.toArray();
                for (const s of sortings) {
                    if (!s?.batchId) continue;
                    const key = `SORT-${s.batchId}-${s.id || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'productionSortings'), key),
                        data: { ...s, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read sortings note:', err);
            }

            // 15. Clone Stage History
            try {
                const stageHistory = await db.cloneStageHistory.toArray();
                for (const csh of stageHistory) {
                    if (!csh?.batchId) continue;
                    const key = `CSH-${csh.batchId}-${csh.stageName || 'stage'}-${csh.id || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'cloneStageHistory'), key),
                        data: { ...csh, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read stage history note:', err);
            }

            // 16. Plantlet Sales
            try {
                const plantletSales = await db.plantletSales.toArray();
                for (const ps of plantletSales) {
                    if (!ps?.batchId) continue;
                    const key = `PS-${ps.batchId}-${ps.id || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'plantletSales'), key),
                        data: { ...ps, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read plantlet sales note:', err);
            }

            // 17. Plantlet Sorts
            try {
                const plantletSorts = await db.plantletSorts.toArray();
                for (const pst of plantletSorts) {
                    if (!pst?.batchId) continue;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'plantletSorts'), pst.batchId),
                        data: { ...pst, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read plantlet sorts note:', err);
            }

            // 18. Overtime Rules
            try {
                const overtimeRules = await db.overtimeRules.toArray();
                for (const or_ of overtimeRules) {
                    const key = `OT-RULE-${or_.id || 'default'}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'overtimeRules'), key),
                        data: { ...or_, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read overtime rules note:', err);
            }

            // 19. Notifications (so all users see the same alerts)
            try {
                const notifications = await db.notifications.toArray();
                for (const notif of notifications) {
                    const key = `NOTIF-${notif.id || notif.date || Date.now()}`;
                    operations.push({
                        ref: doc(collection(dbFirestore, 'notifications'), key),
                        data: { ...notif, updatedAt: serverTimestamp() }
                    });
                }
            } catch (err) {
                console.warn('[Cloud Sync] Read notifications note:', err);
            }

            // Execute in chunks of 450 (below Firestore's 500 max limit)
            const chunkSize = 450;
            for (let i = 0; i < operations.length; i += chunkSize) {
                const chunk = operations.slice(i, i + chunkSize);
                const batch = writeBatch(dbFirestore);
                for (const op of chunk) {
                    batch.set(op.ref, op.data, { merge: true });
                }
                try {
                    await batch.commit();
                    totalUploaded += chunk.length;
                } catch (batchErr: any) {
                    console.warn('[Cloud Sync] Batch chunk commit warning, falling back to individual writes:', batchErr?.message || batchErr);
                    for (const op of chunk) {
                        try {
                            await setDoc(op.ref, op.data, { merge: true });
                            totalUploaded++;
                        } catch (indivErr) {
                            console.warn('[Cloud Sync] Fallback write skipped document:', op.ref?.path, indivErr);
                        }
                    }
                }
            }

            if (totalUploaded > 0) {
                console.log(`[Cloud Sync] Uploaded ${totalUploaded} records to Cloud Firestore.`);
            }
        } catch (error: any) {
            console.warn('[Cloud Sync] Upload note:', error?.message || error);
        }
        return totalUploaded;
    }

    /**
     * Download cloud records from Firestore into local Dexie database
     */
    public async syncCloudToLocal(): Promise<number> {
        if (!navigator.onLine) return 0;
        let downloadedCount = 0;

        try {
            // 1. Pull Workers
            try {
                const workersSnap = await getDocs(collection(dbFirestore, 'workers'));
                for (const docSnap of workersSnap.docs) {
                    if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                    const data = docSnap.data();
                    const workerId = data.workerId || docSnap.id;
                    if (!workerId) continue;
                    await db.workers.put({ ...data, workerId } as any);
                    downloadedCount++;
                }
            } catch (wErr) {
                console.warn('[Cloud Sync] Pull workers note:', wErr);
            }

            // 2. Pull Inventory Items
            try {
                const invSnap = await getDocs(collection(dbFirestore, 'inventoryItems'));
                for (const docSnap of invSnap.docs) {
                    if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                    const data = docSnap.data();
                    const inventoryId = data.inventoryId || docSnap.id;
                    if (!inventoryId) continue;
                    await db.inventoryItems.put({ ...data, inventoryId } as any);
                    downloadedCount++;
                }
            } catch (invErr) {
                console.warn('[Cloud Sync] Pull inventory note:', invErr);
            }

            // 3. Pull Sales Orders (safely avoiding primary key constraint errors)
            try {
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
                    downloadedCount++;
                }
            } catch (salesErr) {
                console.warn('[Cloud Sync] Pull sales note:', salesErr);
            }

            // 4. Pull Clone Batches
            try {
                const batchesSnap = await getDocs(collection(dbFirestore, 'cloneBatches'));
                for (const docSnap of batchesSnap.docs) {
                    if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                    const data = docSnap.data();
                    const batchId = data.batchId || docSnap.id;
                    if (!batchId) continue;
                    await db.cloneBatches.put({ ...data, batchId } as any);
                    downloadedCount++;
                }
            } catch (bErr) {
                console.warn('[Cloud Sync] Pull batches note:', bErr);
            }

            // 5. Pull Farm Expenses
            try {
                const expensesSnap = await getDocs(collection(dbFirestore, 'farmExpenses'));
                for (const expenseDoc of expensesSnap.docs) {
                    if (expenseDoc.id.startsWith('_') || expenseDoc.data()._isSystemSchema) continue;
                    const expense = expenseDoc.data();
                    const expenseId = typeof expense.expenseId === 'string' ? expense.expenseId : expenseDoc.id;
                    if (!expenseId) continue;
                    const existing = await db.farmExpenses.where('expenseId').equals(expenseId).first();
                    await db.farmExpenses.put({ ...expense, expenseId, id: existing?.id } as any);
                    downloadedCount++;
                }
            } catch (expErr) {
                console.warn('[Cloud Sync] Pull expenses note:', expErr);
            }

            // 6. Pull Attendance
            try {
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
                    downloadedCount++;
                }
            } catch (attErr) {
                console.warn('[Cloud Sync] Pull attendance note:', attErr);
            }

            // 7. Pull Payroll Records
            try {
                const paySnap = await getDocs(collection(dbFirestore, 'payrollRecords'));
                for (const docSnap of paySnap.docs) {
                    if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                    const data = docSnap.data();
                    const parts = docSnap.id.split('_');
                    const payrollMonth = data.payrollMonth || parts[0];
                    const workerId = data.workerId || parts[1];
                    if (!payrollMonth || !workerId) continue;
                    const recordData = { ...data, payrollMonth, workerId };
                    const existing = await db.payrollRecords
                        .where('payrollMonth').equals(payrollMonth)
                        .filter(r => r.workerId === workerId)
                        .first();
                    if (existing && existing.id !== undefined) {
                        await db.payrollRecords.update(existing.id, recordData as any);
                    } else {
                        const { id: _ignore, ...cleanPR } = recordData as any;
                        await db.payrollRecords.add(cleanPR as any);
                    }
                    downloadedCount++;
                }
            } catch (prErr) {
                console.warn('[Cloud Sync] Pull payroll records note:', prErr);
            }

            // 8. Pull Payroll Payments
            try {
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
                    downloadedCount++;
                }
            } catch (payErr) {
                console.warn('[Cloud Sync] Pull payroll payments note:', payErr);
            }

            // 9. Pull Production Cuttings
            try {
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
                    downloadedCount++;
                }
            } catch (cutErr) {
                console.warn('[Cloud Sync] Pull cuttings note:', cutErr);
            }

            // 10. Pull Production Humid Chamber
            try {
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
                    downloadedCount++;
                }
            } catch (hcErr) {
                console.warn('[Cloud Sync] Pull humid chamber note:', hcErr);
            }

            // 11. Pull Production First Hardening
            try {
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
                    downloadedCount++;
                }
            } catch (fhErr) {
                console.warn('[Cloud Sync] Pull first hardening note:', fhErr);
            }

            // 12. Pull Production Second Hardening
            try {
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
                    downloadedCount++;
                }
            } catch (shErr) {
                console.warn('[Cloud Sync] Pull second hardening note:', shErr);
            }

            // 13. Pull Production Sortings
            try {
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
                    downloadedCount++;
                }
            } catch (sortErr) {
                console.warn('[Cloud Sync] Pull sortings note:', sortErr);
            }

            // 14. Pull Clone Stage History
            try {
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
                    downloadedCount++;
                }
            } catch (cshErr) {
                console.warn('[Cloud Sync] Pull stage history note:', cshErr);
            }

            // 15. Pull Plantlet Sales
            try {
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
                    downloadedCount++;
                }
            } catch (psErr) {
                console.warn('[Cloud Sync] Pull plantlet sales note:', psErr);
            }

            // 16. Pull Plantlet Sorts
            try {
                const pstSnap = await getDocs(collection(dbFirestore, 'plantletSorts'));
                for (const docSnap of pstSnap.docs) {
                    if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                    const data = docSnap.data();
                    const batchId = data.batchId || docSnap.id;
                    if (!batchId) continue;
                    await db.plantletSorts.put({ ...data, batchId } as any);
                    downloadedCount++;
                }
            } catch (pstErr) {
                console.warn('[Cloud Sync] Pull plantlet sorts note:', pstErr);
            }

            // 17. Pull Overtime Rules
            try {
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
                    downloadedCount++;
                }
            } catch (orErr) {
                console.warn('[Cloud Sync] Pull overtime rules note:', orErr);
            }

            // 18. Pull Notifications (shared alerts across all users)
            try {
                const notifSnap = await getDocs(collection(dbFirestore, 'notifications'));
                for (const docSnap of notifSnap.docs) {
                    if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                    const data = docSnap.data();
                    if (!data.type || !data.title) continue;
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
                    downloadedCount++;
                }
            } catch (notifErr) {
                console.warn('[Cloud Sync] Pull notifications note:', notifErr);
            }

            // Trigger background calculation for active payroll month
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            import('./payrollSync').then(({ syncPayrollMonth }) => {
                void syncPayrollMonth(currentMonth, now).catch(() => {});
            }).catch(() => {});

            console.log(`[Cloud Sync] Download from Cloud Firestore complete (${downloadedCount} records processed).`);
        } catch (error: any) {
            console.warn('[Cloud Sync] Download notice:', error?.message || error);
        }
        return downloadedCount;
    }

    /**
     * Bi-directional immediate sync
     */
    public async syncNow(): Promise<{ downloaded: number; uploaded: number }> {
        this.updateStatus({ isSyncing: true, error: null });
        let downloaded = 0;
        let uploaded = 0;
        try {
            // 1. Pull down remote records from Cloud Firestore so existing workers/payroll appear immediately
            try {
                downloaded = await this.syncCloudToLocal();
            } catch (pullErr: any) {
                console.warn('[Cloud Sync] Cloud pull notice:', pullErr?.message || pullErr);
            }

            // 2. Push up any locally created records to Cloud Firestore
            try {
                uploaded = await this.syncLocalToCloud();
            } catch (pushErr: any) {
                console.warn('[Cloud Sync] Cloud push notice:', pushErr?.message || pushErr);
            }

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
        return { downloaded, uploaded };
    }

    /**
     * Diagnostic comparison between Local IndexedDB and Cloud Firestore
     */
    public async getSyncDiagnostics(): Promise<{
        local: {
            workers: number;
            payrollRecords: number;
            payrollPayments: number;
            attendance: number;
            inventory: number;
            expenses: number;
            clones: number;
        };
        cloud: {
            workers: number;
            payrollRecords: number;
            payrollPayments: number;
            attendance: number;
            inventory: number;
            expenses: number;
            clones: number;
        };
    }> {
        const local = {
            workers: await db.workers.count(),
            payrollRecords: await db.payrollRecords.count(),
            payrollPayments: await db.payrollPayments.count(),
            attendance: await db.attendance.count(),
            inventory: await db.inventoryItems.count(),
            expenses: await db.farmExpenses.count(),
            clones: await db.cloneBatches.count()
        };

        let cloud = {
            workers: 0,
            payrollRecords: 0,
            payrollPayments: 0,
            attendance: 0,
            inventory: 0,
            expenses: 0,
            clones: 0
        };

        if (typeof navigator !== 'undefined' && navigator.onLine) {
            try {
                const [wSnap, prSnap, ppSnap, attSnap, invSnap, expSnap, clSnap] = await Promise.all([
                    getDocs(collection(dbFirestore, 'workers')).catch(() => ({ docs: [] })),
                    getDocs(collection(dbFirestore, 'payrollRecords')).catch(() => ({ docs: [] })),
                    getDocs(collection(dbFirestore, 'payrollPayments')).catch(() => ({ docs: [] })),
                    getDocs(collection(dbFirestore, 'attendance')).catch(() => ({ docs: [] })),
                    getDocs(collection(dbFirestore, 'inventoryItems')).catch(() => ({ docs: [] })),
                    getDocs(collection(dbFirestore, 'farmExpenses')).catch(() => ({ docs: [] })),
                    getDocs(collection(dbFirestore, 'cloneBatches')).catch(() => ({ docs: [] }))
                ]);

                cloud = {
                    workers: (wSnap.docs || []).filter((d: any) => !d.id.startsWith('_') && !d.data()._isSystemSchema).length,
                    payrollRecords: (prSnap.docs || []).filter((d: any) => !d.id.startsWith('_') && !d.data()._isSystemSchema).length,
                    payrollPayments: (ppSnap.docs || []).filter((d: any) => !d.id.startsWith('_') && !d.data()._isSystemSchema).length,
                    attendance: (attSnap.docs || []).filter((d: any) => !d.id.startsWith('_') && !d.data()._isSystemSchema).length,
                    inventory: (invSnap.docs || []).filter((d: any) => !d.id.startsWith('_') && !d.data()._isSystemSchema).length,
                    expenses: (expSnap.docs || []).filter((d: any) => !d.id.startsWith('_') && !d.data()._isSystemSchema).length,
                    clones: (clSnap.docs || []).filter((d: any) => !d.id.startsWith('_') && !d.data()._isSystemSchema).length
                };
            } catch (diagErr) {
                console.warn('[Cloud Sync] Diagnostics query notice:', diagErr);
            }
        }

        return { local, cloud };
    }

    /**
     * Export full local database to a downloadable JSON string
     */
    public async exportDatabaseToJson(): Promise<string> {
        const payload = {
            exportedAt: new Date().toISOString(),
            farmName: 'G&S Coffee Farm Operations',
            version: '2.0',
            workers: await db.workers.toArray(),
            attendance: await db.attendance.toArray(),
            payrollRecords: await db.payrollRecords.toArray(),
            payrollPayments: await db.payrollPayments.toArray(),
            inventoryItems: await db.inventoryItems.toArray(),
            inventoryTransactions: await db.inventoryTransactions.toArray(),
            farmExpenses: await db.farmExpenses.toArray(),
            salesOrders: await db.salesOrders.toArray(),
            cloneBatches: await db.cloneBatches.toArray(),
            productionCuttings: await db.productionCuttings.toArray(),
            productionHumidChamber: await db.productionHumidChamber.toArray(),
            productionFirstHardening: await db.productionFirstHardening.toArray(),
            productionSecondHardening: await db.productionSecondHardening.toArray(),
            productionSortings: await db.productionSortings.toArray(),
            cloneStageHistory: await db.cloneStageHistory.toArray(),
            plantletSales: await db.plantletSales.toArray(),
            plantletSorts: await db.plantletSorts.toArray(),
            overtimeRules: await db.overtimeRules.toArray()
        };
        return JSON.stringify(payload, null, 2);
    }

    /**
     * Import full database from JSON and automatically push to Cloud Firestore
     */
    public async importDatabaseFromJson(jsonContent: string): Promise<{ count: number }> {
        const parsed = JSON.parse(jsonContent);
        let count = 0;

        if (Array.isArray(parsed.workers)) {
            for (const w of parsed.workers) {
                if (w?.workerId) {
                    await db.workers.put(w);
                    count++;
                }
            }
        }

        if (Array.isArray(parsed.payrollRecords)) {
            for (const pr of parsed.payrollRecords) {
                if (pr?.payrollMonth && pr?.workerId) {
                    const existing = await db.payrollRecords
                        .where('payrollMonth').equals(pr.payrollMonth)
                        .filter(r => r.workerId === pr.workerId)
                        .first();
                    if (existing && existing.id !== undefined) {
                        await db.payrollRecords.update(existing.id, pr);
                    } else {
                        const { id: _ignore, ...clean } = pr;
                        await db.payrollRecords.add(clean);
                    }
                    count++;
                }
            }
        }

        if (Array.isArray(parsed.payrollPayments)) {
            for (const p of parsed.payrollPayments) {
                if (p?.workerId && p?.amount) {
                    const existing = await db.payrollPayments
                        .where('workerId').equals(p.workerId)
                        .filter(pay => pay.payrollMonth === p.payrollMonth && pay.paymentDate === p.paymentDate && pay.amount === p.amount)
                        .first();
                    if (existing && existing.id !== undefined) {
                        await db.payrollPayments.update(existing.id, p);
                    } else {
                        const { id: _ignore, ...clean } = p;
                        await db.payrollPayments.add(clean);
                    }
                    count++;
                }
            }
        }

        if (Array.isArray(parsed.attendance)) {
            for (const att of parsed.attendance) {
                if (att?.workerId && att?.date) {
                    const existing = await db.attendance
                        .where('workerId').equals(att.workerId)
                        .filter(a => a.date === att.date)
                        .first();
                    if (existing && existing.id !== undefined) {
                        await db.attendance.update(existing.id, att);
                    } else {
                        const { id: _ignore, ...clean } = att;
                        await db.attendance.add(clean);
                    }
                    count++;
                }
            }
        }

        if (Array.isArray(parsed.inventoryItems)) {
            for (const item of parsed.inventoryItems) {
                if (item?.inventoryId) {
                    await db.inventoryItems.put(item);
                    count++;
                }
            }
        }

        if (Array.isArray(parsed.cloneBatches)) {
            for (const b of parsed.cloneBatches) {
                if (b?.batchId) {
                    await db.cloneBatches.put(b);
                    count++;
                }
            }
        }

        if (Array.isArray(parsed.farmExpenses)) {
            for (const exp of parsed.farmExpenses) {
                const expenseId = exp.expenseId || `EXP-${exp.id || Date.now()}`;
                const existing = await db.farmExpenses.where('expenseId').equals(expenseId).first();
                if (existing && existing.id !== undefined) {
                    await db.farmExpenses.update(existing.id, { ...exp, expenseId });
                } else {
                    const { id: _ignore, ...clean } = exp;
                    await db.farmExpenses.add({ ...clean, expenseId });
                }
                count++;
            }
        }

        // Trigger immediate cloud push so all imported records upload to Cloud Firestore
        void this.syncLocalToCloud();

        return { count };
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

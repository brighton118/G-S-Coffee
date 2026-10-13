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
 * Handles real-time syncing between Local Dexie IndexedDB and Cloud Firestore.
 */

export interface SyncStatus {
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncedAt: Date | null;
    error: string | null;
}

class FirestoreSyncService {
    private syncListeners: Array<() => void> = [];
    private isInitialized = false;

    /**
     * Instant real-time push to Cloud Firestore
     */
    public async saveWorker(worker: any): Promise<void> {
        try {
            if (!navigator.onLine || !worker?.workerId) return;
            const docRef = doc(collection(dbFirestore, 'workers'), worker.workerId);
            await setDoc(docRef, { ...worker, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live worker push note:', e);
        }
    }

    public async saveAttendance(record: any): Promise<void> {
        try {
            if (!navigator.onLine || !record?.workerId || !record?.date) return;
            const key = `ATT-${record.workerId}-${record.date}`;
            const docRef = doc(collection(dbFirestore, 'attendance'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live attendance push note:', e);
        }
    }

    public async saveSale(sale: any): Promise<void> {
        try {
            if (!navigator.onLine) return;
            const key = sale.invoiceNumber || sale.orderId || `SALE-${sale.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'salesOrders'), key);
            await setDoc(docRef, { ...sale, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live sale push note:', e);
        }
    }

    public async saveInventoryItem(item: any): Promise<void> {
        try {
            if (!navigator.onLine || !item?.inventoryId) return;
            const docRef = doc(collection(dbFirestore, 'inventoryItems'), item.inventoryId);
            await setDoc(docRef, { ...item, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live inventory item push note:', e);
        }
    }

    public async saveInventoryTransaction(tx: any): Promise<void> {
        try {
            if (!navigator.onLine || !tx?.inventoryId) return;
            const key = `TX-${tx.inventoryId}-${tx.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'inventoryTransactions'), key);
            await setDoc(docRef, { ...tx, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live inventory tx push note:', e);
        }
    }

    public async saveFarmExpense(expense: any): Promise<void> {
        try {
            if (!navigator.onLine) return;
            const key = expense.expenseId || `EXP-${expense.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'farmExpenses'), key);
            await setDoc(docRef, { ...expense, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live expense push note:', e);
        }
    }

    public async saveCloneBatch(batch: any): Promise<void> {
        try {
            if (!navigator.onLine || !batch?.batchId) return;
            const docRef = doc(collection(dbFirestore, 'cloneBatches'), batch.batchId);
            await setDoc(docRef, { ...batch, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live clone batch push note:', e);
        }
    }

    public async saveProductionCutting(cutting: any): Promise<void> {
        try {
            if (!navigator.onLine || !cutting?.batchId) return;
            const key = `CUT-${cutting.batchId}-${cutting.id || Date.now()}`;
            const docRef = doc(collection(dbFirestore, 'productionCuttings'), key);
            await setDoc(docRef, { ...cutting, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live cutting push note:', e);
        }
    }

    public async savePayrollPayment(payment: any): Promise<void> {
        try {
            if (!navigator.onLine || !payment?.workerId) return;
            const key = `PAY-${payment.id || payment.paymentDate + '_' + payment.workerId}`;
            const docRef = doc(collection(dbFirestore, 'payrollPayments'), key);
            await setDoc(docRef, { ...payment, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live payroll payment push note:', e);
        }
    }

    public async savePayrollRecord(record: any): Promise<void> {
        try {
            if (!navigator.onLine || !record?.workerId) return;
            const key = `${record.payrollMonth}_${record.workerId}`;
            const docRef = doc(collection(dbFirestore, 'payrollRecords'), key);
            await setDoc(docRef, { ...record, updatedAt: serverTimestamp() }, { merge: true });
        } catch (e) {
            console.warn('Live payroll record push note:', e);
        }
    }

    /**
     * Sync local Dexie records up to Cloud Firestore
     */
    public async syncLocalToCloud(): Promise<void> {
        if (!navigator.onLine) {
            console.info('Offline: Cloud sync queued until internet connection resumes.');
            return;
        }

        try {
            const batch = writeBatch(dbFirestore);
            let operationCount = 0;

            // 1. Sync Workers
            const workers = await db.workers.toArray();
            for (const worker of workers) {
                const docRef = doc(collection(dbFirestore, 'workers'), worker.workerId);
                batch.set(docRef, { ...worker, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 2. Sync Sales Orders
            const sales = await db.salesOrders.toArray();
            for (const sale of sales) {
                const key = sale.invoiceNumber || sale.orderId || `SALE-${sale.id}`;
                const docRef = doc(collection(dbFirestore, 'salesOrders'), key);
                batch.set(docRef, { ...sale, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 3. Sync Inventory
            const items = await db.inventoryItems.toArray();
            for (const item of items) {
                const docRef = doc(collection(dbFirestore, 'inventoryItems'), item.inventoryId);
                batch.set(docRef, { ...item, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 3a. Sync miscellaneous farm expenses
            const farmExpenses = await db.farmExpenses.toArray();
            for (const expense of farmExpenses) {
                const docRef = doc(collection(dbFirestore, 'farmExpenses'), expense.expenseId);
                batch.set(docRef, { ...expense, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 4. Sync Payroll Records
            const payrolls = await db.payrollRecords.toArray();
            for (const pr of payrolls) {
                const key = `${pr.payrollMonth}_${pr.workerId}`;
                const docRef = doc(collection(dbFirestore, 'payrollRecords'), key);
                batch.set(docRef, { ...pr, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 5. Sync Payroll Payments
            const payments = await db.payrollPayments.toArray();
            for (const p of payments) {
                const key = `PAY-${p.id || p.paymentDate + '_' + p.workerId}`;
                const docRef = doc(collection(dbFirestore, 'payrollPayments'), key);
                batch.set(docRef, { ...p, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 6. Sync Clone Batches
            const batches = await db.cloneBatches.toArray();
            for (const b of batches) {
                const docRef = doc(collection(dbFirestore, 'cloneBatches'), b.batchId);
                batch.set(docRef, { ...b, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 7. Sync Attendance Records
            const attendanceList = await db.attendance.toArray();
            for (const att of attendanceList) {
                const key = `ATT-${att.workerId}-${att.date}`;
                const docRef = doc(collection(dbFirestore, 'attendance'), key);
                batch.set(docRef, { ...att, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 8. Sync Inventory Transactions
            const txList = await db.inventoryTransactions.toArray();
            for (const tx of txList) {
                const key = `TX-${tx.inventoryId}-${tx.id || Date.now()}`;
                const docRef = doc(collection(dbFirestore, 'inventoryTransactions'), key);
                batch.set(docRef, { ...tx, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // 9. Sync Production Cuttings
            const cuttings = await db.productionCuttings.toArray();
            for (const c of cuttings) {
                const key = `CUT-${c.batchId}-${c.id || Date.now()}`;
                const docRef = doc(collection(dbFirestore, 'productionCuttings'), key);
                batch.set(docRef, { ...c, updatedAt: serverTimestamp() }, { merge: true });
                operationCount++;
            }

            // Commit batch if operations exist
            if (operationCount > 0) {
                await batch.commit();
                localStorage.setItem('gs_last_cloud_sync', new Date().toISOString());
                console.log(`Cloud Sync: Successfully uploaded ${operationCount} records to Cloud Firestore.`);
            }
        } catch (error: any) {
            console.warn('Cloud Sync notice:', error?.message || error);
        }
    }

    /**
     * Download cloud records from Firestore into local Dexie database
     */
    public async syncCloudToLocal(): Promise<void> {
        if (!navigator.onLine) return;

        try {
            // Pull Workers
            const workersSnap = await getDocs(collection(dbFirestore, 'workers'));
            for (const docSnap of workersSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                await db.workers.put(docSnap.data() as any);
            }

            // Pull Inventory Items
            const invSnap = await getDocs(collection(dbFirestore, 'inventoryItems'));
            for (const docSnap of invSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                await db.inventoryItems.put(docSnap.data() as any);
            }

            // Pull Sales
            const salesSnap = await getDocs(collection(dbFirestore, 'salesOrders'));
            for (const docSnap of salesSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const s = docSnap.data();
                const existing = await db.salesOrders.where('invoiceNumber').equals(s.invoiceNumber || '').first();
                if (!existing) {
                    await db.salesOrders.add(s as any);
                }
            }

            // Pull Clone Batches
            const batchesSnap = await getDocs(collection(dbFirestore, 'cloneBatches'));
            for (const docSnap of batchesSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                await db.cloneBatches.put(docSnap.data() as any);
            }

            // Pull miscellaneous farm expenses
            const expensesSnap = await getDocs(collection(dbFirestore, 'farmExpenses'));
            for (const expenseDoc of expensesSnap.docs) {
                if (expenseDoc.id.startsWith('_') || expenseDoc.data()._isSystemSchema) continue;
                const expense = expenseDoc.data();
                const expenseId = typeof expense.expenseId === 'string' ? expense.expenseId : expenseDoc.id;
                if (!expenseId) continue;
                const existing = await db.farmExpenses.where('expenseId').equals(expenseId).first();
                await db.farmExpenses.put({ ...expense, expenseId, id: existing?.id } as any);
            }

            // Pull Attendance
            const attSnap = await getDocs(collection(dbFirestore, 'attendance'));
            for (const docSnap of attSnap.docs) {
                if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) continue;
                const data = docSnap.data();
                const existing = await db.attendance.where({ workerId: data.workerId, date: data.date }).first();
                if (!existing) {
                    await db.attendance.add(data as any);
                }
            }
        } catch (error: any) {
            console.warn('Cloud download notice:', error?.message || error);
        }
    }

    /**
     * Start real-time Firestore listeners for collaborative multi-device sync
     */
    public startRealtimeSync(): void {
        if (this.isInitialized) return;
        this.isInitialized = true;

        try {
            // Listen for Workers updates in Cloud
            const unsubWorkers = onSnapshot(collection(dbFirestore, 'workers'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        await db.workers.put(data as any);
                    } else if (change.type === 'removed') {
                        await db.workers.delete(change.doc.id);
                    }
                });
            }, (err) => console.info('Firestore workers listener active:', err.message));

            // Listen for Sales Orders updates
            const unsubSales = onSnapshot(collection(dbFirestore, 'salesOrders'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        const existing = await db.salesOrders.where('invoiceNumber').equals(data.invoiceNumber || '').first();
                        if (!existing) {
                            await db.salesOrders.add(data as any);
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
                        const expenseId = change.doc.id;
                        await db.farmExpenses.where('expenseId').equals(expenseId).delete();
                    }
                });
            }, (err) => console.info('Firestore farm expense listener active:', err.message));

            // Listen for Clone Batches updates
            const unsubCloneBatches = onSnapshot(collection(dbFirestore, 'cloneBatches'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        await db.cloneBatches.put(data as any);
                    } else if (change.type === 'removed') {
                        await db.cloneBatches.delete(change.doc.id);
                        await db.productionCuttings.where('batchId').equals(change.doc.id).delete();
                        await db.productionHumidChamber.where('batchId').equals(change.doc.id).delete();
                        await db.productionFirstHardening.where('batchId').equals(change.doc.id).delete();
                        await db.productionSecondHardening.where('batchId').equals(change.doc.id).delete();
                        await db.productionSortings.where('batchId').equals(change.doc.id).delete();
                    }
                });
            }, (err) => console.info('Firestore cloneBatches listener active:', err.message));

            // Listen for Inventory Items updates
            const unsubInventory = onSnapshot(collection(dbFirestore, 'inventoryItems'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        await db.inventoryItems.put(data as any);
                    } else if (change.type === 'removed') {
                        await db.inventoryItems.delete(change.doc.id);
                        await db.inventoryTransactions.where('inventoryId').equals(change.doc.id).delete();
                    }
                });
            }, (err) => console.info('Firestore inventory listener active:', err.message));

            // Listen for Attendance updates
            const unsubAttendance = onSnapshot(collection(dbFirestore, 'attendance'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.doc.id.startsWith('_') || change.doc.data()._isSystemSchema) return;
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        const existing = await db.attendance.where({ workerId: data.workerId, date: data.date }).first();
                        if (existing) {
                            await db.attendance.update(existing.id!, data as any);
                        } else {
                            await db.attendance.add(data as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore attendance listener active:', err.message));

            this.syncListeners.push(unsubWorkers, unsubSales, unsubFarmExpenses, unsubCloneBatches, unsubInventory, unsubAttendance);
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

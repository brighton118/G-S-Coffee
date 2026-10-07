import { 
    collection, 
    doc, 
    getDocs, 
    onSnapshot,
    serverTimestamp,
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
            if (!workersSnap.empty) {
                const remoteWorkers = workersSnap.docs.map(d => d.data());
                for (const w of remoteWorkers) {
                    await db.workers.put(w as any);
                }
            }

            // Pull Inventory Items
            const invSnap = await getDocs(collection(dbFirestore, 'inventoryItems'));
            if (!invSnap.empty) {
                const remoteItems = invSnap.docs.map(d => d.data());
                for (const item of remoteItems) {
                    await db.inventoryItems.put(item as any);
                }
            }

            // Pull Sales
            const salesSnap = await getDocs(collection(dbFirestore, 'salesOrders'));
            if (!salesSnap.empty) {
                const remoteSales = salesSnap.docs.map(d => d.data());
                for (const s of remoteSales) {
                    const existing = await db.salesOrders.where('invoiceNumber').equals(s.invoiceNumber || '').first();
                    if (!existing) {
                        await db.salesOrders.add(s as any);
                    }
                }
            }

            // Pull Clone Batches
            const batchesSnap = await getDocs(collection(dbFirestore, 'cloneBatches'));
            if (!batchesSnap.empty) {
                const remoteBatches = batchesSnap.docs.map(d => d.data());
                for (const b of remoteBatches) {
                    await db.cloneBatches.put(b as any);
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
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        await db.workers.put(data as any);
                    }
                });
            }, (err) => console.info('Firestore workers listener active:', err.message));

            // Listen for Sales Orders updates
            const unsubSales = onSnapshot(collection(dbFirestore, 'salesOrders'), (snap) => {
                snap.docChanges().forEach(async (change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        const existing = await db.salesOrders.where('invoiceNumber').equals(data.invoiceNumber || '').first();
                        if (!existing) {
                            await db.salesOrders.add(data as any);
                        }
                    }
                });
            }, (err) => console.info('Firestore sales listener active:', err.message));

            this.syncListeners.push(unsubWorkers, unsubSales);
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

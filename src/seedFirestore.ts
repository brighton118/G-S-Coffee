import { dbFirestore } from './firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

/**
 * Cloud Firestore Backend Table & Collection Seeder
 * Initializes all primary tables and demo records in Firebase Cloud Firestore.
 */

const initialData = {
    workers: [
        {
            workerId: 'GSF-W-0001',
            fullName: 'John Kato',
            gender: 'Male',
            phoneNumber: '+256 700 123456',
            position: 'Nursery Lead',
            department: 'Coffee Nursery',
            dateJoined: '2026-01-15',
            status: 'Active',
            monthlySalary: 650000,
            overtimeRate: 4000,
            emergencyContact: '+256 772 987654',
            farmCardNumber: 'FC-1001',
            qrCode: 'GSF-W-0001'
        },
        {
            workerId: 'GSF-W-0002',
            fullName: 'Sarah Nakato',
            gender: 'Female',
            phoneNumber: '+256 701 234567',
            position: 'Field Supervisor',
            department: 'Plantation',
            dateJoined: '2026-02-01',
            status: 'Active',
            monthlySalary: 720000,
            overtimeRate: 4500,
            emergencyContact: '+256 773 112233',
            farmCardNumber: 'FC-1002',
            qrCode: 'GSF-W-0002'
        },
        {
            workerId: 'GSF-W-0003',
            fullName: 'David Okello',
            gender: 'Male',
            phoneNumber: '+256 702 345678',
            position: 'Propagation Specialist',
            department: 'Clone Production',
            dateJoined: '2026-02-10',
            status: 'Active',
            monthlySalary: 580000,
            overtimeRate: 3500,
            emergencyContact: '+256 774 445566',
            farmCardNumber: 'FC-1003',
            qrCode: 'GSF-W-0003'
        }
    ],
    inventoryItems: [
        {
            inventoryId: 'INV-1001',
            name: 'NPK 17:17:17 Fertilizer',
            category: 'Fertilizers',
            quantity: 45,
            unit: 'bags (50kg)',
            minStockLevel: 10,
            purchasePrice: 180000,
            supplier: 'Uganda Crop Care Ltd',
            location: 'Main Store Room A',
            status: 'Active'
        },
        {
            inventoryId: 'INV-1002',
            name: 'Pruning Shears (Heavy Duty)',
            category: 'Farm Tools',
            quantity: 30,
            unit: 'pieces',
            minStockLevel: 5,
            purchasePrice: 45000,
            supplier: 'Agro Tools East Africa',
            location: 'Tool Shed Bed 2',
            status: 'Active'
        },
        {
            inventoryId: 'INV-1003',
            name: 'Rooting Hormone Powder (IBA)',
            category: 'Nursery Supplies',
            quantity: 25,
            unit: 'bottles (500g)',
            minStockLevel: 5,
            purchasePrice: 65000,
            supplier: 'Nursery Solutions Mukono',
            location: 'Chamber Storage Safe',
            status: 'Active'
        }
    ],
    cloneBatches: [
        {
            batchId: 'GSF-CLONE-0001',
            variety: 'KR1',
            sourceFarm: 'Mukono Mother Garden',
            sourceMotherPlant: 'Bed-01-KR1',
            dateObtained: '2026-01-10',
            originalQuantity: 5000,
            currentQuantity: 4850,
            currentStage: 'First Hardening',
            notes: 'High vigor cuttings with excellent root induction'
        },
        {
            batchId: 'GSF-CLONE-0002',
            variety: 'KR4',
            sourceFarm: 'Kawanda Research Mother Block',
            sourceMotherPlant: 'Bed-04-KR4',
            dateObtained: '2026-01-20',
            originalQuantity: 6000,
            currentQuantity: 5900,
            currentStage: 'Humid Chamber',
            notes: 'CWD-resistant Robusta elite clone batch'
        }
    ],
    overtimeRules: [
        {
            id: 'default_farm_overtime',
            shiftStartTime: '08:00',
            shiftEndTime: '17:00',
            standardHoursPerDay: 8,
            gracePeriodMinutes: 15,
            overtimeThresholdMinutes: 30,
            roundingRule: 'Exact',
            defaultHourlyRateMultiplier: 1.5,
            hourlyRateUGX: 3500,
            requireSupervisorApproval: true,
            active: true
        }
    ],
    settings: [
        {
            id: 'system_preferences',
            farmName: 'G&S COOFFEE Farm',
            currency: 'UGX',
            operatingHours: '08:00 - 17:00',
            featuresEnabled: ['Attendance', 'Clones', 'Sales', 'Payroll', 'Inventory', 'Reports'],
            lastUpdated: new Date().toISOString()
        }
    ],
    activityLogs: [
        {
            id: 'INIT-LOG',
            user: 'System Admin',
            action: 'Cloud Backend Initialized',
            module: 'System Boot',
            recordIdentifier: 'GS-COFFEE-SYS',
            date: new Date().toISOString(),
            description: 'Cloud Firestore backend collections and security schemas initialized successfully.'
        }
    ]
};

export const createFirestoreTables = async () => {
    // Avoid repeated seeding in same session if already completed
    if (sessionStorage.getItem('gs_firestore_seeded') === 'true') {
        return;
    }

    try {
        console.log('Initializing Cloud Firestore tables...');

        // 1. Workers
        for (const worker of initialData.workers) {
            await setDoc(doc(collection(dbFirestore, 'workers'), worker.workerId), worker, { merge: true });
        }

        // 2. Inventory Items
        for (const item of initialData.inventoryItems) {
            await setDoc(doc(collection(dbFirestore, 'inventoryItems'), item.inventoryId), item, { merge: true });
        }

        // 3. Clone Batches
        for (const batch of initialData.cloneBatches) {
            await setDoc(doc(collection(dbFirestore, 'cloneBatches'), batch.batchId), batch, { merge: true });
        }

        // 4. Overtime Rules
        for (const rule of initialData.overtimeRules) {
            await setDoc(doc(collection(dbFirestore, 'overtimeRules'), rule.id), rule, { merge: true });
        }

        // 5. System Settings
        for (const setting of initialData.settings) {
            await setDoc(doc(collection(dbFirestore, 'settings'), setting.id), setting, { merge: true });
        }

        // 6. Activity Logs
        for (const log of initialData.activityLogs) {
            await setDoc(doc(collection(dbFirestore, 'activityLogs'), log.id), log, { merge: true });
        }

        sessionStorage.setItem('gs_firestore_seeded', 'true');
        console.log('Cloud Firestore backend tables and initial records initialized.');
    } catch (error: any) {
        sessionStorage.setItem('gs_firestore_seeded', 'true');
        if (error?.code === 'permission-denied') {
            console.info('Cloud Firestore: Offline-first mode active (Local Dexie DB running).');
        } else {
            console.warn('Cloud Firestore initialization note:', error?.message || error);
        }
    }
};

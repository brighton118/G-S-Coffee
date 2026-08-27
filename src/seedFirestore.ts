import { dbFirestore } from './firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

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
            emergencyContact: '+256 772 987654',
            farmCardNumber: 'FC-1001',
            qrCode: 'GSF-W-0001'
        }
    ],
    inventoryItems: [
        {
            itemId: 'INV-1001',
            name: 'Coffee Seedlings (Robusta)',
            category: 'Plants',
            quantity: 5000,
            unit: 'pieces',
            minimumStock: 1000,
            location: 'Main Nursery House'
        }
    ],
    settings: [
        {
            id: 'system_preferences',
            farmName: 'G$S Coffee Farm',
            currency: 'UGX',
            featuresEnabled: ['Attendance', 'Clones', 'Sales']
        }
    ]
};

export const createFirestoreTables = async () => {
    console.log('Seeding Firestore collections...');
    try {
        for (const worker of initialData.workers) {
            await setDoc(doc(collection(dbFirestore, 'workers'), worker.workerId), worker);
        }
        for (const item of initialData.inventoryItems) {
            await setDoc(doc(collection(dbFirestore, 'inventoryItems'), item.itemId), item);
        }
        for (const setting of initialData.settings) {
            await setDoc(doc(collection(dbFirestore, 'settings'), setting.id), setting);
        }
        console.log('Successfully created initial records (tables) in Firebase!');
    } catch (error) {
        console.error('Error seeding Firebase:', error);
    }
};

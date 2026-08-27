import { db } from './db';
import { format, subDays } from 'date-fns';

export async function seedDemoData() {
    const usersCount = await db.users.count();
    if (usersCount > 0) {
        console.log("Database already seeded");
        return;
    }

    console.log("Seeding Demo Data...");

    // Seed Users
    await db.users.bulkAdd([
        { username: 'admin', role: 'Administrator', active: true },
        { username: 'manager', role: 'Farm Manager', active: true },
    ]);

    // Seed Workers
    const today = format(new Date(), 'yyyy-MM-dd');
    await db.workers.bulkAdd([
        { workerId: 'GSF-W-0001', fullName: 'John Kato', gender: 'Male', phoneNumber: '0712345678', position: 'Nursery Supervisor', department: 'Nursery', dateJoined: '2025-01-10', status: 'Active', emergencyContact: 'Wife - 071112233', farmCardNumber: 'FC-1001', qrCode: 'GSF-W-0001' },
        { workerId: 'GSF-W-0002', fullName: 'Mary Nabirye', gender: 'Female', phoneNumber: '0712345679', position: 'Farm Hand', department: 'Hardening', dateJoined: '2025-02-15', status: 'Active', emergencyContact: 'Brother - 072223344', farmCardNumber: 'FC-1002', qrCode: 'GSF-W-0002' },
        { workerId: 'GSF-W-0003', fullName: 'Peter Ouma', gender: 'Male', phoneNumber: '0712345680', position: 'Farm Hand', department: 'Humid Chamber', dateJoined: '2025-03-20', status: 'Active', emergencyContact: 'Sister - 073334455', farmCardNumber: 'FC-1003', qrCode: 'GSF-W-0003' },
        { workerId: 'GSF-W-0004', fullName: 'Jane Namuli', gender: 'Female', phoneNumber: '0712345681', position: 'Attendance Officer', department: 'HR', dateJoined: '2025-04-25', status: 'Active', emergencyContact: 'Husband - 074445566', farmCardNumber: 'FC-1004', qrCode: 'GSF-W-0004' },
        { workerId: 'GSF-W-0005', fullName: 'David Lule', gender: 'Male', phoneNumber: '0712345682', position: 'Store Manager', department: 'Inventory', dateJoined: '2025-05-30', status: 'Active', emergencyContact: 'Wife - 075556677', farmCardNumber: 'FC-1005', qrCode: 'GSF-W-0005' },
    ]);

    // Seed Clone Batches
    await db.cloneBatches.bulkAdd([
        { batchId: 'GSF-CLONE-0001', variety: 'Robusta TR-14', sourceFarm: 'G$S Farm Block A', sourceMotherPlant: 'Row 4 Plant 12', dateObtained: subDays(new Date(), 90).toISOString(), originalQuantity: 1000, currentQuantity: 950, personResponsible: 'John Kato', currentStage: 'Humid Chamber' },
        { batchId: 'GSF-CLONE-0002', variety: 'Arabica SL-28', sourceFarm: 'G$S Farm Block B', sourceMotherPlant: 'Row 2 Plant 5', dateObtained: subDays(new Date(), 30).toISOString(), originalQuantity: 500, currentQuantity: 490, personResponsible: 'Mary Nabirye', currentStage: 'Obtained' },
        { batchId: 'GSF-CLONE-0003', variety: 'Robusta TR-14', sourceFarm: 'G$S Farm Block A', sourceMotherPlant: 'Row 5 Plant 2', dateObtained: subDays(new Date(), 140).toISOString(), originalQuantity: 800, currentQuantity: 750, personResponsible: 'John Kato', currentStage: 'Hardening' },
    ]);

    // Seed Inventory
    await db.inventoryItems.bulkAdd([
        { inventoryId: 'INV-001', name: 'Rooting Hormone', category: 'Nursery supplies', barcode: '8901234567890', brand: 'AgriGrowth', unit: 'Bottle (500ml)', quantity: 15, minStockLevel: 5, supplier: 'Agro Supplies Ltd', purchasePrice: 45000, purchaseDate: subDays(new Date(), 10).toISOString(), location: 'Store A-1', status: 'Active' },
        { inventoryId: 'INV-002', name: 'Coffee Fertilizer NPK 10:10:10', category: 'Fertilizers', barcode: '8901234567891', brand: 'FarmChem', unit: 'Bag (50kg)', quantity: 3, minStockLevel: 5, supplier: 'Agro Supplies Ltd', purchasePrice: 120000, purchaseDate: subDays(new Date(), 20).toISOString(), location: 'Store B-2', status: 'Active' },
        { inventoryId: 'INV-003', name: 'Polythene Pots (Small)', category: 'Planting materials', barcode: '8901234567892', brand: 'PolyPack', unit: 'Roll (1000 pcs)', quantity: 20, minStockLevel: 10, supplier: 'Plastics Corp', purchasePrice: 25000, purchaseDate: subDays(new Date(), 15).toISOString(), location: 'Store A-3', status: 'Active' },
        { inventoryId: 'INV-004', name: 'Watering Can', category: 'Farm tools', barcode: '8901234567893', brand: 'AgriTools', unit: 'Piece', quantity: 10, minStockLevel: 2, supplier: 'Hardware Express', purchasePrice: 15000, purchaseDate: subDays(new Date(), 30).toISOString(), location: 'Store C-1', status: 'Active' },
        { inventoryId: 'INV-005', name: 'Sprayer Knapsack', category: 'Farm tools', barcode: '8901234567894', brand: 'AgriTools', unit: 'Piece', quantity: 5, minStockLevel: 1, supplier: 'Hardware Express', purchasePrice: 85000, purchaseDate: subDays(new Date(), 30).toISOString(), location: 'Store C-2', status: 'Active' },
    ]);

    // Seed Activity Log
    await db.activityLogs.add({ user: 'admin', action: 'System Initialized', module: 'System', recordIdentifier: 'Seed', date: new Date().toISOString(), description: 'Demo data was successfully generated.' });

    console.log("Demo Data Seeded!");
}

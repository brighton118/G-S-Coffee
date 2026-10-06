import { db, Worker, CloneBatch, InventoryItem, SalesOrder, PayrollRecord, AttendanceRecord } from './db';
import { format, subDays } from 'date-fns';

export async function seedDemoData() {
    const workersCount = await db.workers.count();
    if (workersCount > 0) {
        console.log('Database already seeded');
        return;
    }

    console.log('Seeding Comprehensive G&S Coffee Farm Demo Data...');

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    // 1. Seed Users
    await db.users.bulkAdd([
        { username: 'admin', role: 'Administrator', active: true },
        { username: 'manager', role: 'Farm Manager', active: true },
        { username: 'nursery_sup', role: 'Nursery Supervisor', active: true },
        { username: 'store_mgr', role: 'Store/Inventory Manager', active: true }
    ]);

    // 2. Seed Workers with Salary & Overtime Configuration
    const seedWorkers: Worker[] = [
        {
            workerId: 'GSF-W-0001',
            fullName: 'John Kato',
            gender: 'Male',
            phoneNumber: '+256 712 345678',
            dateJoined: '2024-01-10',
            status: 'Active',
            farmCardNumber: 'FC-1001',
            qrCode: 'GSF-W-0001',
            monthlySalary: 650000,
            overtimeRate: 4000
        },
        {
            workerId: 'GSF-W-0002',
            fullName: 'Mary Nabirye',
            gender: 'Female',
            phoneNumber: '+256 712 345679',
            dateJoined: '2024-02-15',
            status: 'Active',
            farmCardNumber: 'FC-1002',
            qrCode: 'GSF-W-0002',
            monthlySalary: 550000,
            overtimeRate: 3500
        },
        {
            workerId: 'GSF-W-0003',
            fullName: 'Peter Ouma',
            gender: 'Male',
            phoneNumber: '+256 712 345680',
            dateJoined: '2024-03-20',
            status: 'Active',
            farmCardNumber: 'FC-1003',
            qrCode: 'GSF-W-0003',
            monthlySalary: 520000,
            overtimeRate: 3200
        },
        {
            workerId: 'GSF-W-0004',
            fullName: 'Jane Namuli',
            gender: 'Female',
            phoneNumber: '+256 712 345681',
            dateJoined: '2024-04-25',
            status: 'Active',
            farmCardNumber: 'FC-1004',
            qrCode: 'GSF-W-0004',
            monthlySalary: 580000,
            overtimeRate: 3600
        },
        {
            workerId: 'GSF-W-0005',
            fullName: 'David Lule',
            gender: 'Male',
            phoneNumber: '+256 712 345682',
            dateJoined: '2024-05-30',
            status: 'Active',
            farmCardNumber: 'FC-1005',
            qrCode: 'GSF-W-0005',
            monthlySalary: 600000,
            overtimeRate: 3800
        }
    ];
    await db.workers.bulkAdd(seedWorkers);

    // 3. Seed Shift & Overtime Rules
    await db.overtimeRules.add({
        normalStartTime: '08:00',
        normalEndTime: '17:00',
        requiredWorkingHours: 8,
        overtimeThresholdMinutes: 30,
        breakDurationMinutes: 60,
        gracePeriodMinutes: 15,
        overtimeRatePerHour: 3500,
        overtimeMultiplier: 1.5,
        requireSupervisorApproval: true,
        roundingRule: 'quarter_hour'
    });

    // 4. Seed 4 Categories of Inventory Items (including the 6 predefined Nursery Supplies)
    const seedInventory: InventoryItem[] = [
        // 4.1 Fertilizers
        {
            inventoryId: 'INV-FERT-001',
            name: 'NPK 17:17:17 Foliar Fertilizer',
            category: 'Fertilizers',
            type: 'Granular / Foliar',
            unit: 'Bags (50kg)',
            quantity: 25,
            minStockLevel: 5,
            purchasePrice: 145000,
            supplier: 'Uganda Agro Inputs Ltd',
            dateReceived: '2026-09-01',
            expiryDate: '2028-09-01',
            status: 'Active'
        },
        {
            inventoryId: 'INV-FERT-002',
            name: 'CAN Booster Fertilizer',
            category: 'Fertilizers',
            type: 'Nitrogen Rich',
            unit: 'Bags (50kg)',
            quantity: 12,
            minStockLevel: 4,
            purchasePrice: 130000,
            supplier: 'Balton Uganda',
            dateReceived: '2026-09-10',
            expiryDate: '2028-06-30',
            status: 'Active'
        },
        // 4.2 Pesticides
        {
            inventoryId: 'INV-PEST-001',
            name: 'Cypermethrin 5% EC (Twigathrin)',
            category: 'Pesticides',
            type: 'Broad Spectrum Insecticide',
            unit: 'Litres',
            quantity: 18,
            minStockLevel: 5,
            purchasePrice: 42000,
            supplier: 'Bukoola Chemical Industries',
            dateReceived: '2026-08-15',
            expiryDate: '2027-08-15',
            status: 'Active'
        },
        {
            inventoryId: 'INV-PEST-002',
            name: 'Mancozeb 80% WP Fungicide',
            category: 'Pesticides',
            type: 'Foliar Protectant',
            unit: 'Kg',
            quantity: 30,
            minStockLevel: 8,
            purchasePrice: 38000,
            supplier: 'Bukoola Chemical Industries',
            dateReceived: '2026-08-20',
            expiryDate: '2027-12-31',
            status: 'Active'
        },
        // 4.3 Farm Tools
        {
            inventoryId: 'INV-TOOL-001',
            name: 'Bypass Secateurs / Pruning Shears (Felco #2)',
            category: 'Farm Tools',
            type: 'Cutting Tool',
            unit: 'Pieces',
            quantity: 14,
            minStockLevel: 4,
            purchasePrice: 65000,
            supplier: 'Hardware World Kampala',
            dateReceived: '2026-07-10',
            condition: 'Good',
            availabilityStatus: 'Available',
            status: 'Active'
        },
        {
            inventoryId: 'INV-TOOL-002',
            name: 'Knapsack Sprayer (16 Litres)',
            category: 'Farm Tools',
            type: 'Spray Equipment',
            unit: 'Pieces',
            quantity: 6,
            minStockLevel: 2,
            purchasePrice: 110000,
            supplier: 'Agro Machinery Ltd',
            dateReceived: '2026-07-15',
            condition: 'Good',
            availabilityStatus: 'Available',
            status: 'Active'
        },
        // 4.4 Dedicated Nursery Supplies (The 6 required items)
        {
            inventoryId: 'INV-NUR-001',
            name: 'Black soil',
            category: 'Nursery Supplies',
            type: 'Sterilized Organic Topsoil',
            unit: 'Tonnes',
            quantity: 18,
            minStockLevel: 5,
            purchasePrice: 85000,
            supplier: 'Mubende Quarry Supplies',
            dateReceived: '2026-09-01',
            status: 'Active'
        },
        {
            inventoryId: 'INV-NUR-002',
            name: 'Sand',
            category: 'Nursery Supplies',
            type: 'Washed River Sand',
            unit: 'Tonnes',
            quantity: 12,
            minStockLevel: 4,
            purchasePrice: 70000,
            supplier: 'Mubende Quarry Supplies',
            dateReceived: '2026-09-02',
            status: 'Active'
        },
        {
            inventoryId: 'INV-NUR-003',
            name: 'Metal rods',
            category: 'Nursery Supplies',
            type: 'Chamber Framework Rods (8mm)',
            unit: 'Pieces',
            quantity: 60,
            minStockLevel: 15,
            purchasePrice: 22000,
            supplier: 'Roofings Uganda Ltd',
            dateReceived: '2026-08-01',
            status: 'Active'
        },
        {
            inventoryId: 'INV-NUR-004',
            name: 'UV polythene paper',
            category: 'Nursery Supplies',
            type: '1000 Gauge UV-Treated Sheeting',
            unit: 'Rolls',
            quantity: 8,
            minStockLevel: 2,
            purchasePrice: 280000,
            supplier: 'Luuka Plastics Ltd',
            dateReceived: '2026-08-10',
            status: 'Active'
        },
        {
            inventoryId: 'INV-NUR-005',
            name: 'Shade nets',
            category: 'Nursery Supplies',
            type: '75% Agronet Shade Mesh',
            unit: 'Rolls (50m)',
            quantity: 6,
            minStockLevel: 2,
            purchasePrice: 320000,
            supplier: 'Balton Uganda',
            dateReceived: '2026-08-12',
            status: 'Active'
        },
        {
            inventoryId: 'INV-NUR-006',
            name: 'Potting bags',
            category: 'Nursery Supplies',
            type: 'Perforated Seedling Tubes (5x8)',
            unit: 'Bundles (10,000 pcs)',
            quantity: 15,
            minStockLevel: 3,
            purchasePrice: 95000,
            supplier: 'Luuka Plastics Ltd',
            dateReceived: '2026-09-05',
            status: 'Active'
        }
    ];
    await db.inventoryItems.bulkAdd(seedInventory);

    // 5. Seed Coffee Clone Batches (KR1, KR3-KR10 - Strictly NO KR2)
    const seedBatches: CloneBatch[] = [
        {
            batchId: 'GSF-CLONE-0001',
            variety: 'KR1',
            sourceFarm: 'G&S Mother Garden Block A',
            sourceMotherPlant: 'Row 2 Plant 5',
            dateObtained: '2026-07-01',
            originalQuantity: 1500,
            currentQuantity: 1420,
            personResponsible: 'John Kato',
            currentStage: 'Sorting',
            notes: 'High vigor batch ready for commercial sorting'
        },
        {
            batchId: 'GSF-CLONE-0002',
            variety: 'KR3',
            sourceFarm: 'G&S Mother Garden Block B',
            sourceMotherPlant: 'Row 1 Plant 12',
            dateObtained: '2026-08-10',
            originalQuantity: 2000,
            currentQuantity: 1880,
            personResponsible: 'Mary Nabirye',
            currentStage: 'Second Hardening',
            notes: 'Advancing well through hardening'
        },
        {
            batchId: 'GSF-CLONE-0003',
            variety: 'KR4',
            sourceFarm: 'G&S Mother Garden Block A',
            sourceMotherPlant: 'Row 4 Plant 8',
            dateObtained: '2026-08-25',
            originalQuantity: 1200,
            currentQuantity: 1150,
            personResponsible: 'Peter Ouma',
            currentStage: 'First Hardening',
            notes: 'Transferred from humid chamber'
        },
        {
            batchId: 'GSF-CLONE-0004',
            variety: 'KR5',
            sourceFarm: 'G&S Mother Garden Block C',
            sourceMotherPlant: 'Row 3 Plant 1',
            dateObtained: '2026-09-01',
            originalQuantity: 1800,
            currentQuantity: 1720,
            personResponsible: 'Jane Namuli',
            currentStage: 'Humid Chamber',
            notes: 'In Chamber 1. Due for exit: 2026-10-01'
        },
        {
            batchId: 'GSF-CLONE-0005',
            variety: 'KR6',
            sourceFarm: 'G&S Mother Garden Block B',
            sourceMotherPlant: 'Row 6 Plant 4',
            dateObtained: '2026-09-20',
            originalQuantity: 1000,
            currentQuantity: 1000,
            personResponsible: 'David Lule',
            currentStage: 'Cutting',
            notes: 'Fresh nodal cuttings prepared'
        }
    ];
    await db.cloneBatches.bulkAdd(seedBatches);

    // 6. Seed Sorting Production Records (Reconciliation: 1420 = 400 retained + 950 for sale + 70 lost)
    await db.productionSortings.add({
        batchId: 'GSF-CLONE-0001',
        variety: 'KR1',
        sortingDate: '2026-09-28',
        quantityReceived: 1420,
        retainedQuantity: 400,
        forSaleQuantity: 950,
        lostQuantity: 70,
        totalValidatedQuantity: 1350,
        responsibleWorker: 'John Kato',
        status: 'Validated',
        notes: 'Strict reconciliation validated: 400 + 950 + 70 = 1420'
    });

    // 7. Seed Sales Orders (KR1, KR3-KR10 @ UGX 2,500)
    const seedSales: SalesOrder[] = [
        {
            orderId: 'ORD-2026-0001',
            customerName: 'Kibaale Coffee Farmers Cooperative',
            customerPhone: '+256 772 889900',
            orderDate: '2026-09-29',
            cloneType: 'KR1',
            quantityOrdered: 500,
            pricePerClone: 2500,
            totalAmount: 1250000,
            amountPaid: 1250000,
            outstandingBalance: 0,
            paymentStatus: 'Fully Paid',
            orderStatus: 'Fulfilled',
            batchId: 'GSF-CLONE-0001',
            stockDeducted: true,
            stockDeductedDate: '2026-09-29',
            notes: 'Delivered to Kibaale pickup truck',
            createdAt: '2026-09-29T10:00:00Z'
        },
        {
            orderId: 'ORD-2026-0002',
            customerName: 'Robert Ssempala',
            customerPhone: '+256 782 112233',
            orderDate: todayStr,
            cloneType: 'KR1',
            quantityOrdered: 200,
            pricePerClone: 2500,
            totalAmount: 500000,
            amountPaid: 300000,
            outstandingBalance: 200000,
            paymentStatus: 'Partially Paid',
            orderStatus: 'Confirmed',
            batchId: 'GSF-CLONE-0001',
            stockDeducted: false,
            notes: 'Balance due upon farm gate loading',
            createdAt: new Date().toISOString()
        }
    ];
    await db.salesOrders.bulkAdd(seedSales);

    // 8. Seed Attendance & Overtime
    const seedAttendance: AttendanceRecord[] = [
        {
            workerId: 'GSF-W-0001',
            workerName: 'John Kato',
            date: todayStr,
            timeIn: '07:55',
            timeOut: '19:15',
            scheduledHours: 8,
            actualHours: 10.33,
            status: 'Present',
            isLate: false,
            overtimeHours: 2.25,
            overtimeStatus: 'Pending',
            notes: 'Supervised chamber soil fumigation'
        },
        {
            workerId: 'GSF-W-0002',
            workerName: 'Mary Nabirye',
            date: todayStr,
            timeIn: '08:05',
            scheduledHours: 8,
            status: 'Present',
            isLate: false
        },
        {
            workerId: 'GSF-W-0003',
            workerName: 'Peter Ouma',
            date: todayStr,
            timeIn: '08:25',
            scheduledHours: 8,
            status: 'Late',
            isLate: true
        },
        {
            workerId: 'GSF-W-0001',
            workerName: 'John Kato',
            date: yesterdayStr,
            timeIn: '07:50',
            timeOut: '19:00',
            scheduledHours: 8,
            actualHours: 10.17,
            status: 'Present',
            isLate: false,
            overtimeHours: 2.0,
            overtimeStatus: 'Approved',
            overtimeApprovedHours: 2.0,
            overtimeApprovedBy: 'Farm Manager',
            overtimeApprovalDate: yesterdayStr
        }
    ];
    await db.attendance.bulkAdd(seedAttendance);

    // 9. Seed Payroll Records (5 required columns: S/M, Name, Monthly Salary, Overtime, Net Pay)
    const currentPeriod = format(new Date(), 'yyyy-MM');
    const seedPayroll: PayrollRecord[] = [
        {
            payrollMonth: currentPeriod,
            payrollPeriod: currentPeriod,
            serialNumber: 1,
            workerId: 'GSF-W-0001',
            workerName: 'John Kato',
            monthlySalary: 650000,
            approvedOvertimeHours: 12.0,
            overtimeRate: 4000,
            overtimeEarnings: 48000,
            deductions: 10000,
            netPay: 688000, // 650000 + 48000 - 10000
            amountPaid: 688000,
            balance: 0,
            paymentStatus: 'Paid',
            status: 'Approved',
            approvedBy: 'Farm Director',
            generatedAt: new Date().toISOString()
        },
        {
            payrollMonth: currentPeriod,
            payrollPeriod: currentPeriod,
            serialNumber: 2,
            workerId: 'GSF-W-0002',
            workerName: 'Mary Nabirye',
            monthlySalary: 550000,
            approvedOvertimeHours: 6.0,
            overtimeRate: 3500,
            overtimeEarnings: 21000,
            deductions: 0,
            netPay: 571000, // 550000 + 21000 - 0
            amountPaid: 0,
            balance: 571000,
            paymentStatus: 'Pending',
            status: 'Approved',
            approvedBy: 'Farm Director',
            generatedAt: new Date().toISOString()
        }
    ];
    await db.payrollRecords.bulkAdd(seedPayroll);

    console.log('G&S Coffee Farm Demo Data successfully initialized!');
}

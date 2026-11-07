import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, SalesOrder, SalesOrderItem } from '../db';
import { 
    Plus, 
    Search, 
    Download, 
    CheckCircle2, 
    DollarSign, 
    Layers, 
    X, 
    Receipt, 
    Banknote, 
    ShoppingCart,
    Trash2,
    AlertTriangle,
    Mail,
    PlusCircle
} from 'lucide-react';
import { generateSalesReceiptPDF, generateSalesSummaryPDF, getSalesOrderItems } from '../utils/pdfGenerator';
import { formatUGX } from '../utils/calculations';
import { deleteAllSalesSystemWide, deleteSingleSalesOrderSystemWide } from '../clearDemoData';
import { firestoreSyncService } from '../services/firestoreSync';
import { notificationService } from '../utils/notificationService';
import { emailService } from '../services/emailService';
import { auth } from '../firebase';
import { useUserRole } from '../context/UserRoleContext';
import './Sales.css';

type SaleVariety = 'KR1' | 'KR3' | 'KR4' | 'KR5' | 'KR6' | 'KR7' | 'KR8' | 'KR9' | 'KR10' | 'A' | 'C' | 'D';

const VARIETIES: SaleVariety[] = [
    'KR1', 'KR3', 'KR4', 'KR5', 'KR6', 'KR7', 'KR8', 'KR9', 'KR10', 'A', 'C', 'D'
];

interface VarietyInputRow {
    variety: SaleVariety;
    quantity: number;
    unitPrice: number;
}

function consolidateItems(rows: VarietyInputRow[]): SalesOrderItem[] {
    const map = new Map<string, SalesOrderItem>();
    for (const row of rows) {
        const qty = Number(row.quantity) || 0;
        if (qty <= 0) continue;
        const price = Number(row.unitPrice) || 0;
        const key = `${row.variety}__${price}`;
        const existing = map.get(key);
        if (existing) {
            existing.quantity += qty;
            existing.subtotal = existing.quantity * existing.unitPrice;
        } else {
            map.set(key, {
                variety: row.variety,
                quantity: qty,
                unitPrice: price,
                subtotal: qty * price
            });
        }
    }
    return Array.from(map.values());
}

const Sales: React.FC = () => {
    const { isAdmin, canEdit } = useUserRole();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVariety, setSelectedVariety] = useState<string>('All');
    const [showNewOrderModal, setShowNewOrderModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
    const [appendToExistingOrder, setAppendToExistingOrder] = useState(true);
    const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<SalesOrder | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [emailingOrderId, setEmailingOrderId] = useState<number | string | null>(null);
    const [salesNotice, setSalesNotice] = useState<string | null>(null);

    const [formData, setFormData] = useState<{
        customerName: string;
        customerPhone: string;
        customerEmail: string;
        customerLocation: string;
        varietyItems: VarietyInputRow[];
    }>({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerLocation: '',
        varietyItems: [{ variety: 'KR1', quantity: 0, unitPrice: 2500 }]
    });

    const orders = useLiveQuery(() => db.salesOrders.toArray()) || [];

    // Check if an individual already has an order today when typing in the modal (if not explicitly editing)
    const todayStr = new Date().toISOString().split('T')[0];
    const matchingExistingOrder = useMemo(() => {
        if (editingOrder) return editingOrder;
        const nameClean = formData.customerName.trim().toLowerCase();
        const phoneClean = formData.customerPhone.trim().replace(/\s+/g, '');
        if (!nameClean && !phoneClean) return null;

        return orders.find(o => {
            if (o.orderDate !== todayStr) return false;
            const oName = (o.customerName || '').trim().toLowerCase();
            const oPhone = (o.customerPhone || '').trim().replace(/\s+/g, '');
            if (nameClean && oName === nameClean && (!phoneClean || !oPhone || oPhone === phoneClean)) {
                return true;
            }
            if (phoneClean && phoneClean.length >= 7 && oPhone === phoneClean && (!nameClean || oName === nameClean)) {
                return true;
            }
            return false;
        }) || null;
    }, [editingOrder, formData.customerName, formData.customerPhone, orders, todayStr]);

    // Detect if there are duplicate/separate rows for the same individual on the same date that can be consolidated
    const duplicateCustomerGroups = useMemo(() => {
        const groups = new Map<string, SalesOrder[]>();
        for (const o of orders) {
            const key = `${(o.customerName || '').trim().toLowerCase()}__${(o.customerPhone || '').trim().replace(/\s+/g, '')}__${o.orderDate || ''}`;
            const list = groups.get(key) || [];
            list.push(o);
            groups.set(key, list);
        }
        return Array.from(groups.values()).filter(g => g.length > 1);
    }, [orders]);

    const handleConsolidateDuplicateCustomerOrders = async () => {
        if (duplicateCustomerGroups.length === 0) return;
        let consolidatedCount = 0;
        for (const group of duplicateCustomerGroups) {
            const primary = group[0];
            const combinedRows: VarietyInputRow[] = [];
            for (const o of group) {
                const oItems = getSalesOrderItems(o);
                for (const item of oItems) {
                    combinedRows.push({
                        variety: (item.variety as SaleVariety) || 'KR1',
                        quantity: item.quantity,
                        unitPrice: item.unitPrice
                    });
                }
            }
            const mergedItems = consolidateItems(combinedRows);
            const totalQty = mergedItems.reduce((sum, i) => sum + i.quantity, 0);
            const totalAmount = mergedItems.reduce((sum, i) => sum + i.subtotal, 0);
            const varietiesSummary = Array.from(new Set(mergedItems.map(i => i.variety))).join(', ');
            const unitPrice = mergedItems.length === 1 ? mergedItems[0].unitPrice : (mergedItems[0]?.unitPrice || 2500);

            const updatedPrimary: SalesOrder = {
                ...primary,
                variety: varietiesSummary,
                cloneType: varietiesSummary,
                items: mergedItems,
                quantity: totalQty,
                quantityOrdered: totalQty,
                unitPrice,
                pricePerClone: unitPrice,
                totalAmount,
                amountPaid: totalAmount
            };

            if (primary.id !== undefined) {
                await db.salesOrders.put({ ...updatedPrimary, id: primary.id });
            }
            void firestoreSyncService.saveSale(updatedPrimary);

            // Remove the secondary split rows
            for (let i = 1; i < group.length; i++) {
                const dup = group[i];
                const inv = dup.invoiceNumber || dup.orderId || `SALE-${dup.id}`;
                await deleteSingleSalesOrderSystemWide(inv, dup.id);
            }
            consolidatedCount++;
        }
        setSalesNotice(`✅ Consolidated ${consolidatedCount} customer(s)' separate variety records into single receipts!`);
        setTimeout(() => setSalesNotice(null), 5000);
    };

    const handleOpenNewSaleModal = () => {
        setEditingOrder(null);
        setAppendToExistingOrder(true);
        setFormData({
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            customerLocation: '',
            varietyItems: [{ variety: 'KR1', quantity: 0, unitPrice: 2500 }]
        });
        setShowNewOrderModal(true);
    };

    const handleOpenAddVarietyToOrder = (order: SalesOrder) => {
        const existingItems = getSalesOrderItems(order);
        const usedVarieties = new Set(existingItems.map(i => i.variety));
        const nextVariety = VARIETIES.find(v => !usedVarieties.has(v)) || 'KR1';
        const defaultPrice = existingItems[0]?.unitPrice || 2500;

        setEditingOrder(order);
        setAppendToExistingOrder(true);
        setFormData({
            customerName: order.customerName || '',
            customerPhone: order.customerPhone || '',
            customerEmail: order.customerEmail || '',
            customerLocation: order.customerLocation || '',
            varietyItems: [
                ...existingItems.map(i => ({
                    variety: (VARIETIES.includes(i.variety as SaleVariety) ? i.variety : 'KR1') as SaleVariety,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice
                })),
                { variety: nextVariety, quantity: 0, unitPrice: defaultPrice }
            ]
        });
        setShowNewOrderModal(true);
    };

    const handleAddVarietyRow = () => {
        const usedVarieties = new Set(formData.varietyItems.map(i => i.variety));
        const nextVariety = VARIETIES.find(v => !usedVarieties.has(v)) || 'KR1';
        const lastPrice = formData.varietyItems[formData.varietyItems.length - 1]?.unitPrice || 2500;
        setFormData(prev => ({
            ...prev,
            varietyItems: [
                ...prev.varietyItems,
                { variety: nextVariety, quantity: 0, unitPrice: lastPrice }
            ]
        }));
    };

    const handleRemoveVarietyRow = (index: number) => {
        if (formData.varietyItems.length <= 1) return;
        setFormData(prev => ({
            ...prev,
            varietyItems: prev.varietyItems.filter((_, i) => i !== index)
        }));
    };

    const handleUpdateVarietyRow = (index: number, patch: Partial<VarietyInputRow>) => {
        setFormData(prev => ({
            ...prev,
            varietyItems: prev.varietyItems.map((row, i) => i === index ? { ...row, ...patch } : row)
        }));
    };

    const handleIssueReceiptForOrder = async (order: SalesOrder) => {
        if (!order.receiptIssued && order.id !== undefined) {
            const updated: SalesOrder = {
                ...order,
                receiptIssued: true,
                receiptIssuedAt: new Date().toISOString()
            };
            await db.salesOrders.update(order.id, {
                receiptIssued: true,
                receiptIssuedAt: updated.receiptIssuedAt
            });
            void firestoreSyncService.saveSale(updated);
            generateSalesReceiptPDF(updated);
        } else {
            generateSalesReceiptPDF(order);
        }
    };

    const handleEmailReceipt = async (order: SalesOrder) => {
        const orderKey = order.id || order.invoiceNumber || 'order';
        setEmailingOrderId(orderKey);
        try {
            const inv = order.invoiceNumber || order.orderId || 'GSF-INV';
            const items = getSalesOrderItems(order);
            const varName = items.length > 1
                ? items.map(i => `${i.variety} (${i.quantity.toLocaleString()})`).join(', ')
                : (items[0]?.variety || order.variety || order.cloneType || 'KR1');
            const qty = items.reduce((sum, i) => sum + i.quantity, 0) || order.quantity || order.quantityOrdered || 0;
            const unitPrice = items[0]?.unitPrice || order.unitPrice || order.pricePerClone || 2500;
            let targetEmail = order.customerEmail;

            if (!targetEmail || !targetEmail.includes('@')) {
                const entered = prompt(`Enter recipient email to send invoice #${inv}:`);
                if (!entered || !entered.includes('@')) {
                    setSalesNotice('Email canceled or invalid address.');
                    setTimeout(() => setSalesNotice(null), 4000);
                    return;
                }
                targetEmail = entered.trim();
            }

            const res = await emailService.sendSalesInvoiceEmail({
                invoiceNumber: inv,
                orderDate: order.orderDate || new Date().toISOString().split('T')[0],
                customerName: order.customerName,
                customerEmail: targetEmail,
                customerPhone: order.customerPhone || '',
                cloneType: varName,
                quantity: qty,
                unitPrice: unitPrice,
                totalAmount: order.totalAmount,
                amountPaid: order.amountPaid ?? order.totalAmount,
                location: order.customerLocation || 'Bubaare, Kashari, Mbarara, Uganda',
                items
            });

            if (res.success) {
                setSalesNotice(`✅ Invoice #${inv} receipt sent via Brevo to ${res.recipients.join(', ')}!`);
            } else {
                setSalesNotice(`❌ Could not dispatch invoice receipt: ${res.error || 'Check Brevo configuration'}`);
            }
        } catch (err: any) {
            setSalesNotice(`❌ Error sending invoice: ${err?.message || err}`);
        } finally {
            setEmailingOrderId(null);
            setTimeout(() => setSalesNotice(null), 6000);
        }
    };

    // Filter orders
    const filteredOrders = orders.filter(order => {
        const items = getSalesOrderItems(order);
        const varietyStr = items.map(i => i.variety).join(', ');
        const matchesSearch = 
            (order.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.invoiceNumber || order.orderId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.customerPhone || '').includes(searchTerm) ||
            varietyStr.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesVariety =
            selectedVariety === 'All' ||
            items.some(i => i.variety === selectedVariety) ||
            (order.variety || order.cloneType) === selectedVariety;

        return matchesSearch && matchesVariety;
    });

    // Aggregates (100% Cash Paid, Zero Dues)
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalPlantletsSold = orders.reduce((sum, o) => {
        const items = getSalesOrderItems(o);
        const itemQty = items.reduce((s, i) => s + i.quantity, 0);
        return sum + (itemQty || o.quantity || o.quantityOrdered || 0);
    }, 0);
    const totalTransactions = orders.length;

    const validModalItems = useMemo(() => consolidateItems(formData.varietyItems), [formData.varietyItems]);
    const modalTotalQuantity = useMemo(() => validModalItems.reduce((sum, i) => sum + i.quantity, 0), [validModalItems]);
    const modalTotalAmount = useMemo(() => validModalItems.reduce((sum, i) => sum + i.subtotal, 0), [validModalItems]);

    const saveOrderRecord = async (issueReceiptNow: boolean) => {
        if (!formData.customerName.trim() || !formData.customerPhone.trim() || validModalItems.length === 0) {
            alert('Please enter customer name, phone number, and at least one variety with a valid quantity.');
            return;
        }

        const targetExisting = editingOrder || (appendToExistingOrder ? matchingExistingOrder : null);
        let finalItems = validModalItems;

        // If appending to an existing order that wasn't pre-loaded into editingOrder, merge its existing items with the new ones
        if (targetExisting && !editingOrder) {
            const existingItems = getSalesOrderItems(targetExisting).map(i => ({
                variety: (VARIETIES.includes(i.variety as SaleVariety) ? i.variety : 'KR1') as SaleVariety,
                quantity: i.quantity,
                unitPrice: i.unitPrice
            }));
            finalItems = consolidateItems([...existingItems, ...formData.varietyItems]);
        }

        const totalQuantity = finalItems.reduce((sum, i) => sum + i.quantity, 0);
        const totalAmount = finalItems.reduce((sum, i) => sum + i.subtotal, 0);
        const varietiesLabel = Array.from(new Set(finalItems.map(i => i.variety))).join(', ');
        const varietiesDetailedLabel = finalItems.map(i => `${i.variety} (${i.quantity.toLocaleString()})`).join(', ');
        const primaryUnitPrice = finalItems[0]?.unitPrice || 2500;
        const today = targetExisting?.orderDate || new Date().toISOString().split('T')[0];
        const invoiceNum = targetExisting?.invoiceNumber || targetExisting?.orderId || `GSF-INV-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, '0')}`;

        const orderPayload: SalesOrder = {
            ...(targetExisting || {}),
            invoiceNumber: invoiceNum,
            orderId: invoiceNum,
            orderDate: today,
            customerName: formData.customerName.trim(),
            customerPhone: formData.customerPhone.trim(),
            customerEmail: formData.customerEmail.trim() || targetExisting?.customerEmail || undefined,
            customerLocation: formData.customerLocation.trim() || targetExisting?.customerLocation || undefined,
            variety: varietiesLabel,
            cloneType: varietiesLabel,
            items: finalItems,
            quantity: totalQuantity,
            quantityOrdered: totalQuantity,
            unitPrice: primaryUnitPrice,
            pricePerClone: primaryUnitPrice,
            totalAmount,
            amountPaid: totalAmount,
            receiptIssued: issueReceiptNow ? true : (targetExisting?.receiptIssued ?? false),
            receiptIssuedAt: issueReceiptNow ? new Date().toISOString() : targetExisting?.receiptIssuedAt,
            soldBy: 'Sales Officer'
        };

        let savedOrder: SalesOrder;
        if (targetExisting && targetExisting.id !== undefined) {
            savedOrder = { ...orderPayload, id: targetExisting.id };
            await db.salesOrders.put(savedOrder);
        } else {
            const id = await db.salesOrders.add(orderPayload);
            savedOrder = { ...orderPayload, id };
        }

        void firestoreSyncService.saveSale(savedOrder);

        // Notify Superadmin and Manager email about new/updated sale
        void notificationService.notifyManagerDataEntry({
            module: 'Sales & Revenue',
            action: targetExisting ? 'Customer Varieties Updated on Receipt' : 'New Cash Sale Recorded',
            description: `Sales invoice #${invoiceNum} for customer "${savedOrder.customerName}" — ${finalItems.length} ${finalItems.length === 1 ? 'variety' : 'varieties'} (${varietiesDetailedLabel}), total ${totalQuantity.toLocaleString()} plantlets totaling UGX ${totalAmount.toLocaleString()}.`,
            details: {
                'Invoice #': invoiceNum,
                'Customer': savedOrder.customerName,
                'Customer Phone': savedOrder.customerPhone || 'N/A',
                'Varieties Recorded': varietiesDetailedLabel,
                'Total Quantity': `${totalQuantity.toLocaleString()} plantlets`,
                'Total Revenue': `UGX ${totalAmount.toLocaleString()}`,
                'Receipt Status': issueReceiptNow ? 'Issued' : 'Recording in Progress',
                'Location': savedOrder.customerLocation || 'Farm Gate'
            },
            sourceUser: auth.currentUser?.email || 'Farm Sales Manager'
        });

        // Dispatch official Brevo transactional email invoice receipt when receipt is issued
        if (issueReceiptNow) {
            void emailService.sendSalesInvoiceEmail({
                invoiceNumber: invoiceNum,
                orderDate: today,
                customerName: savedOrder.customerName,
                customerEmail: savedOrder.customerEmail,
                customerPhone: savedOrder.customerPhone,
                cloneType: varietiesDetailedLabel,
                quantity: totalQuantity,
                unitPrice: primaryUnitPrice,
                totalAmount,
                amountPaid: totalAmount,
                location: savedOrder.customerLocation || 'Bubaare, Kashari, Mbarara, Uganda',
                items: finalItems
            }).then(res => {
                if (res.success) {
                    console.log(`[Sales] Brevo invoice dispatched for ${invoiceNum}`);
                }
            }).catch(err => {
                console.warn('[Sales] Brevo invoice dispatch note:', err);
            });
        }

        // Activity log
        await db.activityLogs.add({
            user: 'Sales Officer',
            action: issueReceiptNow ? 'Cash Sale & Consolidated Receipt Issued' : 'Customer Variety Sale Recorded',
            module: 'Sales & Invoices',
            recordIdentifier: invoiceNum,
            date: new Date().toISOString(),
            description: `Recorded ${finalItems.length} ${finalItems.length === 1 ? 'variety' : 'varieties'} (${varietiesDetailedLabel} — ${totalQuantity.toLocaleString()} plantlets) for ${savedOrder.customerName} totaling UGX ${totalAmount.toLocaleString()}`
        });

        setShowNewOrderModal(false);
        setEditingOrder(null);
        setFormData({
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            customerLocation: '',
            varietyItems: [{ variety: 'KR1', quantity: 0, unitPrice: 2500 }]
        });

        if (issueReceiptNow) {
            generateSalesReceiptPDF(savedOrder);
            setSalesNotice(`✅ Receipt #${invoiceNum} issued for ${savedOrder.customerName} with ${finalItems.length} ${finalItems.length === 1 ? 'variety' : 'varieties'} (${varietiesDetailedLabel}).`);
        } else {
            setSalesNotice(`✅ Recorded ${varietiesDetailedLabel} for ${savedOrder.customerName} on Invoice #${invoiceNum}. Click "+ Variety" to add more or "Issue Receipt" when done.`);
        }
        setTimeout(() => setSalesNotice(null), 6000);
    };

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        await saveOrderRecord(true);
    };

    const handleConfirmDeleteAll = async () => {
        setIsDeleting(true);
        setDeleteError('');
        try {
            await deleteAllSalesSystemWide();
            setShowDeleteAllModal(false);
        } catch (err: any) {
            console.error('Failed to delete all sales:', err);
            setDeleteError(err?.message || 'Failed to delete all sales. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleConfirmDeleteSingle = async () => {
        if (!orderToDelete) return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            const inv = orderToDelete.invoiceNumber || orderToDelete.orderId || `SALE-${orderToDelete.id}`;
            const deleted = { ...orderToDelete };
            await deleteSingleSalesOrderSystemWide(inv, orderToDelete.id);
            setOrderToDelete(null);

            void notificationService.notifyManagerDataEntry({
                module: 'Sales & Revenue',
                action: `Sale Invoice Deleted: #${inv}`,
                description: `Sales invoice #${inv} for customer "${deleted.customerName}" (Total: UGX ${(deleted.totalAmount || 0).toLocaleString()}) was deleted/voided.`,
                details: {
                    'Invoice #': inv,
                    'Customer': deleted.customerName,
                    'Customer Contact': deleted.customerPhone || 'N/A',
                    'Total Amount': `UGX ${(deleted.totalAmount || 0).toLocaleString()}`,
                    'Receipt Status': deleted.receiptIssued ? 'Issued' : 'Pending'
                },
                sourceUser: auth.currentUser?.email || 'Farm Sales Manager'
            });
        } catch (err: any) {
            console.error('Failed to delete sale:', err);
            setDeleteError(err?.message || 'Failed to delete sale. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Banknote size={28} color="var(--color-primary)" /> Plantlet Sales & Cash Invoicing
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Record all coffee clone varieties per individual customer on a single consolidated cash receipt.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {canEdit && duplicateCustomerGroups.length > 0 && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ backgroundColor: '#eff6ff', borderColor: '#93c5fd', color: '#1d4ed8', fontWeight: 600 }}
                            onClick={handleConsolidateDuplicateCustomerOrders}
                        >
                            <Layers size={16} /> Combine Split Customer Records ({duplicateCustomerGroups.length})
                        </button>
                    )}
                    {isAdmin && orders.length > 0 && (
                        <button 
                            type="button" 
                            className="btn btn-outline-danger" 
                            onClick={() => {
                                setDeleteError('');
                                setShowDeleteAllModal(true);
                            }}
                        >
                            <Trash2 size={16} /> Delete All Sales
                        </button>
                    )}
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => generateSalesSummaryPDF(orders)}
                    >
                        <Download size={16} /> Export Sales Summary (PDF)
                    </button>
                    {canEdit ? (
                        <button className="btn btn-primary" onClick={handleOpenNewSaleModal}>
                            <Plus size={18} /> Record Cash Sale
                        </button>
                    ) : (
                        <span className="badge badge-info" style={{ alignSelf: 'center', padding: '0.45rem 0.85rem', fontWeight: 600 }}>
                            Staff View-Only
                        </span>
                    )}
                </div>
            </div>

            {salesNotice && (
                <div className="card" style={{ padding: '0.85rem 1.25rem', backgroundColor: salesNotice.startsWith('✅') ? '#f0fdf4' : '#fef2f2', borderLeft: `4px solid ${salesNotice.startsWith('✅') ? '#22c55e' : '#ef4444'}`, color: salesNotice.startsWith('✅') ? '#166534' : '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={18} />
                    <span>{salesNotice}</span>
                </div>
            )}

            {/* KPI Cards (No Dues) */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL SALES VOLUME</span>
                        <DollarSign className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--color-primary)' }}>
                        {formatUGX(totalRevenue)}
                    </div>
                    <div className="stat-change text-light">Total cash volume</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">CASH RECEIVED</span>
                        <CheckCircle2 className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: '#16a34a' }}>
                        {formatUGX(totalRevenue)}
                    </div>
                    <div className="stat-change text-light">100% Cash Settled</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">CUSTOMER RECEIPTS</span>
                        <ShoppingCart className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value">
                        {totalTransactions}
                    </div>
                    <div className="stat-change text-light">Consolidated customer sales</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">PLANTLETS SOLD</span>
                        <Layers className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value">
                        {totalPlantletsSold.toLocaleString()}
                    </div>
                    <div className="stat-change text-light">Coffee clones across all varieties</div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '260px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
                        <input 
                            type="text" 
                            className="form-input" 
                            style={{ paddingLeft: '2.25rem', width: '100%' }}
                            placeholder="Search by customer name, phone, variety, or invoice #..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select 
                        className="form-input" 
                        value={selectedVariety} 
                        onChange={e => setSelectedVariety(e.target.value)}
                        style={{ minWidth: '160px' }}
                    >
                        <option value="All">All Clone Varieties</option>
                        {VARIETIES.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Orders Table (Cash Only, No Dues) */}
            <div className="card table-responsive desktop-only">
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Invoice #</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Date</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Varieties Recorded</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Total Qty</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Unit Price</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Cash Paid (UGX)</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Receipt & Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                    No sales records found matching criteria.
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.slice().reverse().map(order => {
                                const inv = order.invoiceNumber || order.orderId || 'GSF-INV';
                                const items = getSalesOrderItems(order);
                                const qty = items.reduce((sum, i) => sum + i.quantity, 0) || order.quantity || order.quantityOrdered || 0;
                                const uniquePrices = Array.from(new Set(items.map(i => i.unitPrice)));
                                const unitPriceDisplay = uniquePrices.length === 1
                                    ? formatUGX(uniquePrices[0])
                                    : `${uniquePrices.length} rates`;

                                return (
                                    <tr key={order.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            <strong style={{ color: 'var(--color-primary)' }}>{inv}</strong>
                                            <div style={{ marginTop: '0.2rem' }}>
                                                {order.receiptIssued === false ? (
                                                    <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                                                        Recording Varieties
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                                                        {items.length} {items.length === 1 ? 'Variety' : 'Varieties'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            {order.orderDate}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{order.customerName}</div>
                                            <div className="text-light" style={{ fontSize: '0.8rem' }}>{order.customerPhone}</div>
                                            {order.customerLocation && (
                                                <div className="text-light" style={{ fontSize: '0.75rem' }}>Location: {order.customerLocation}</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                {items.map((item, idx) => (
                                                    <span
                                                        key={`${item.variety}-${idx}`}
                                                        className="badge badge-primary"
                                                        title={`${item.variety}: ${item.quantity.toLocaleString()} plantlets @ ${formatUGX(item.unitPrice)} = ${formatUGX(item.subtotal)}`}
                                                    >
                                                        {item.variety}: {item.quantity.toLocaleString()}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            <strong>{qty.toLocaleString()}</strong>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            {unitPriceDisplay}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            <strong style={{ color: '#16a34a' }}>{formatUGX(order.totalAmount)}</strong>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534' }}
                                                        title="Record another variety on this customer's receipt"
                                                        onClick={() => handleOpenAddVarietyToOrder(order)}
                                                    >
                                                        <PlusCircle size={14} /> + Variety
                                                    </button>
                                                )}
                                                <button 
                                                    className="btn btn-secondary" 
                                                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                                    title="Issue Official Consolidated Cash Receipt for All Recorded Varieties"
                                                    onClick={() => handleIssueReceiptForOrder(order)}
                                                >
                                                    <Receipt size={14} /> {order.receiptIssued === false ? 'Issue Receipt' : 'Cash Receipt'}
                                                </button>
                                                <button 
                                                    className="btn btn-primary" 
                                                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#15803d', borderColor: '#15803d' }}
                                                    title="Email Official Sales Receipt via Brevo"
                                                    disabled={emailingOrderId === (order.id || order.invoiceNumber)}
                                                    onClick={() => handleEmailReceipt(order)}
                                                >
                                                    <Mail size={14} /> {emailingOrderId === (order.id || order.invoiceNumber) ? 'Sending...' : 'Email'}
                                                </button>
                                                <button 
                                                    className="btn btn-outline-danger" 
                                                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center' }}
                                                    title="Delete Sale"
                                                    aria-label={`Delete sale ${inv}`}
                                                    onClick={() => {
                                                        setDeleteError('');
                                                        setOrderToDelete(order);
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mobile-only sales-order-cards">
                {filteredOrders.length === 0 ? (
                    <div className="card sales-empty-state">
                        No sales records found matching criteria.
                    </div>
                ) : (
                    filteredOrders.slice().reverse().map(order => {
                        const inv = order.invoiceNumber || order.orderId || 'GSF-INV';
                        const items = getSalesOrderItems(order);
                        const qty = items.reduce((sum, i) => sum + i.quantity, 0) || order.quantity || order.quantityOrdered || 0;
                        const uniquePrices = Array.from(new Set(items.map(i => i.unitPrice)));
                        const unitPriceDisplay = uniquePrices.length === 1
                            ? formatUGX(uniquePrices[0])
                            : `${uniquePrices.length} rates`;

                        return (
                            <article key={order.id} className="card sales-order-card">
                                <div className="sales-order-heading">
                                    <div>
                                        <strong className="sales-invoice">{inv}</strong>
                                        <div className="text-light sales-order-date">{order.orderDate}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                        {items.map((item, idx) => (
                                            <span key={`${item.variety}-${idx}`} className="badge badge-primary">
                                                {item.variety}: {item.quantity.toLocaleString()}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="sales-customer">
                                    <strong>{order.customerName}</strong>
                                    <span className="text-light">{order.customerPhone}</span>
                                    {order.customerLocation && (
                                        <span className="text-light">{order.customerLocation}</span>
                                    )}
                                </div>

                                <div className="sales-order-summary">
                                    <div>
                                        <span className="text-light">Total Qty ({items.length} var.)</span>
                                        <strong>{qty.toLocaleString()}</strong>
                                    </div>
                                    <div>
                                        <span className="text-light">Unit price</span>
                                        <strong>{unitPriceDisplay}</strong>
                                    </div>
                                    <div>
                                        <span className="text-light">Cash paid</span>
                                        <strong className="sales-cash-paid">{formatUGX(order.totalAmount)}</strong>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ flex: 1, margin: 0, minWidth: '110px', borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534' }}
                                            onClick={() => handleOpenAddVarietyToOrder(order)}
                                        >
                                            <PlusCircle size={15} /> + Variety
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-secondary sales-receipt-button"
                                        style={{ flex: 1, margin: 0, minWidth: '120px' }}
                                        onClick={() => handleIssueReceiptForOrder(order)}
                                    >
                                        <Receipt size={15} /> {order.receiptIssued === false ? 'Issue Receipt' : 'Cash Receipt'}
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        style={{ flex: 1, margin: 0, minWidth: '120px', backgroundColor: '#15803d', borderColor: '#15803d', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                        disabled={emailingOrderId === (order.id || order.invoiceNumber)}
                                        onClick={() => handleEmailReceipt(order)}
                                    >
                                        <Mail size={15} /> {emailingOrderId === (order.id || order.invoiceNumber) ? 'Sending...' : 'Email Receipt'}
                                    </button>
                                    {isAdmin && (
                                        <button
                                            className="btn btn-outline-danger"
                                            style={{ padding: '0.5rem 0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                            title="Delete Sale"
                                            aria-label={`Delete sale ${inv}`}
                                            onClick={() => {
                                                setDeleteError('');
                                                setOrderToDelete(order);
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </article>
                        );
                    })
                )}
            </div>

            {/* New / Edit Order Modal (Multi-Variety Consolidated Receipt per Individual) */}
            {showNewOrderModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '640px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div>
                                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Banknote size={22} color="var(--color-primary)" />
                                    {editingOrder
                                        ? `Record Varieties for ${editingOrder.customerName} (${editingOrder.invoiceNumber || editingOrder.orderId})`
                                        : 'Record Customer Cash Sale'}
                                </h2>
                                <span className="text-light" style={{ fontSize: '0.85rem' }}>
                                    Record all clone varieties for this individual on one receipt, then issue when complete
                                </span>
                            </div>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem', border: 'none' }}
                                onClick={() => {
                                    setShowNewOrderModal(false);
                                    setEditingOrder(null);
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Customer Name *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        className="form-input" 
                                        placeholder="e.g., Mukasa David"
                                        value={formData.customerName}
                                        onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone Number *</label>
                                    <input 
                                        type="tel" 
                                        required 
                                        className="form-input" 
                                        placeholder="+256 700 000000"
                                        value={formData.customerPhone}
                                        onChange={e => setFormData({ ...formData, customerPhone: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Location / Farm</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        placeholder="District / Town"
                                        value={formData.customerLocation}
                                        onChange={e => setFormData({ ...formData, customerLocation: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email (Optional)</label>
                                    <input 
                                        type="email" 
                                        className="form-input" 
                                        placeholder="customer@email.com"
                                        value={formData.customerEmail}
                                        onChange={e => setFormData({ ...formData, customerEmail: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Notice if customer already has an order today */}
                            {!editingOrder && matchingExistingOrder && (
                                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#1e40af', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <div>
                                        <strong>Existing customer receipt found today ({matchingExistingOrder.invoiceNumber}):</strong>{' '}
                                        {appendToExistingOrder
                                            ? 'New varieties will be added to this individual’s existing receipt.'
                                            : 'Creating a separate receipt for this entry.'}
                                    </div>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
                                        <input
                                            type="checkbox"
                                            checked={appendToExistingOrder}
                                            onChange={e => setAppendToExistingOrder(e.target.checked)}
                                        />
                                        Combine onto 1 receipt
                                    </label>
                                </div>
                            )}

                            {/* Multi-Variety Recording Section */}
                            <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0.9rem', backgroundColor: '#fafafa' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div>
                                        <strong style={{ fontSize: '0.95rem', color: 'var(--color-text)' }}>
                                            Varieties on this Receipt ({formData.varietyItems.length})
                                        </strong>
                                        <div className="text-light" style={{ fontSize: '0.78rem' }}>
                                            Add every variety purchased by this individual before issuing the receipt
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f0fdf4', borderColor: '#86efac', color: '#166534', fontWeight: 600 }}
                                        onClick={handleAddVarietyRow}
                                    >
                                        <Plus size={15} /> Add Another Variety
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    {formData.varietyItems.map((row, idx) => {
                                        const rowSubtotal = (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
                                        return (
                                            <div
                                                key={idx}
                                                className="sales-variety-row"
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1.1fr 1fr 1.1fr auto',
                                                    gap: '0.6rem',
                                                    alignItems: 'end',
                                                    background: '#ffffff',
                                                    padding: '0.6rem',
                                                    borderRadius: '6px',
                                                    border: '1px solid #e5e7eb'
                                                }}
                                            >
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label" style={{ fontSize: '0.78rem' }}>
                                                        Variety #{idx + 1} *
                                                    </label>
                                                    <select
                                                        className="form-input"
                                                        value={row.variety}
                                                        onChange={e => handleUpdateVarietyRow(idx, { variety: e.target.value as SaleVariety })}
                                                    >
                                                        {VARIETIES.map(v => (
                                                            <option key={v} value={v}>{v}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label" style={{ fontSize: '0.78rem' }}>
                                                        Quantity *
                                                    </label>
                                                    <input
                                                        type="number"
                                                        required
                                                        min="1"
                                                        className="form-input"
                                                        placeholder="0"
                                                        value={row.quantity || ''}
                                                        onChange={e => handleUpdateVarietyRow(idx, { quantity: Number(e.target.value) })}
                                                    />
                                                </div>

                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label className="form-label" style={{ fontSize: '0.78rem' }}>
                                                        Unit Price (UGX) *
                                                    </label>
                                                    <input
                                                        type="number"
                                                        required
                                                        min="0"
                                                        className="form-input"
                                                        value={row.unitPrice || ''}
                                                        onChange={e => handleUpdateVarietyRow(idx, { unitPrice: Number(e.target.value) })}
                                                    />
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: '0.15rem' }}>
                                                    <div style={{ textAlign: 'right', minWidth: '85px' }}>
                                                        <div className="text-light" style={{ fontSize: '0.7rem' }}>Subtotal</div>
                                                        <strong style={{ fontSize: '0.82rem', color: '#166534' }}>
                                                            {formatUGX(rowSubtotal)}
                                                        </strong>
                                                    </div>
                                                    {formData.varietyItems.length > 1 && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-outline-danger"
                                                            style={{ padding: '0.4rem', display: 'inline-flex', alignItems: 'center' }}
                                                            title="Remove this variety"
                                                            onClick={() => handleRemoveVarietyRow(idx)}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Total Cash Settlement & Varieties Breakdown Banner */}
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div>
                                        <div className="text-light" style={{ fontSize: '0.85rem' }}>
                                            Consolidated Receipt Total ({validModalItems.length} {validModalItems.length === 1 ? 'Variety' : 'Varieties'} • {modalTotalQuantity.toLocaleString()} Plantlets)
                                        </div>
                                        <strong style={{ fontSize: '1.35rem', color: '#166534' }}>
                                            {formatUGX(modalTotalAmount)}
                                        </strong>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.35rem 0.75rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.85rem' }}>
                                            1 Receipt per Individual
                                        </span>
                                    </div>
                                </div>
                                {validModalItems.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingTop: '0.4rem', borderTop: '1px dashed #bbf7d0' }}>
                                        {validModalItems.map((item, idx) => (
                                            <span key={idx} className="badge badge-primary" style={{ fontSize: '0.78rem' }}>
                                                {item.variety}: {item.quantity.toLocaleString()} × {formatUGX(item.unitPrice)} = {formatUGX(item.subtotal)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setShowNewOrderModal(false);
                                        setEditingOrder(null);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ flex: 1, borderColor: '#86efac', backgroundColor: '#f0fdf4', color: '#166534', fontWeight: 600 }}
                                    onClick={() => void saveOrderRecord(false)}
                                >
                                    Save Recording (Issue Receipt Later)
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1.3 }}>
                                    <Receipt size={16} /> Complete All & Issue 1 Receipt
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Confirm Delete All Sales */}
            {showDeleteAllModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '480px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ background: '#fee2e2', borderRadius: '50%', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle size={24} color="#dc2626" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, color: '#dc2626' }}>Delete All Sales Records</h3>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Permanent System-wide Removal</p>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.92rem', color: 'var(--color-text)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                            Are you sure you want to delete <strong>all {orders.length} sales orders & invoices</strong>? This will clear all historical sales records, invoice logs, and plantlet sales from both local storage and the cloud database.
                        </p>

                        {deleteError && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                                {deleteError}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    setShowDeleteAllModal(false);
                                    setDeleteError('');
                                }}
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleConfirmDeleteAll}
                                disabled={isDeleting}
                                style={{ minWidth: '130px' }}
                            >
                                {isDeleting ? 'Deleting...' : 'Yes, Delete All'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Confirm Delete Single Sale */}
            {orderToDelete && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '440px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ background: '#fee2e2', borderRadius: '50%', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Trash2 size={22} color="#dc2626" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, color: '#dc2626' }}>Delete Sales Record</h3>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                                    {orderToDelete.invoiceNumber || orderToDelete.orderId || 'Invoice'}
                                </p>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.92rem', color: 'var(--color-text)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                            Are you sure you want to delete the sale for <strong>{orderToDelete.customerName}</strong> ({formatUGX(orderToDelete.totalAmount)})? This record will be permanently deleted from the database.
                        </p>

                        {deleteError && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                                {deleteError}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    setOrderToDelete(null);
                                    setDeleteError('');
                                }}
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleConfirmDeleteSingle}
                                disabled={isDeleting}
                                style={{ minWidth: '110px' }}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Sale'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;

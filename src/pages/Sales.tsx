import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, SalesOrder } from '../db';
import { 
    Plus, 
    Search, 
    Download, 
    CheckCircle2, 
    AlertCircle,
    DollarSign,
    Layers,
    X,
    Receipt,
    Banknote
} from 'lucide-react';
import { generateSalesReceiptPDF, generateSalesSummaryPDF } from '../utils/pdfGenerator';
import { calculateSalesTotals, formatUGX } from '../utils/calculations';

const VARIETIES: Array<'KR1' | 'KR3' | 'KR4' | 'KR5' | 'KR6' | 'KR7' | 'KR8' | 'KR9' | 'KR10'> = [
    'KR1', 'KR3', 'KR4', 'KR5', 'KR6', 'KR7', 'KR8', 'KR9', 'KR10'
];

const Sales: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVariety, setSelectedVariety] = useState<string>('All');
    const [selectedStatus, setSelectedStatus] = useState<string>('All');
    const [showNewOrderModal, setShowNewOrderModal] = useState(false);

    // Form state (Cash Only, Delivery removed)
    const [formData, setFormData] = useState<{
        customerName: string;
        customerPhone: string;
        customerEmail: string;
        customerLocation: string;
        variety: 'KR1' | 'KR3' | 'KR4' | 'KR5' | 'KR6' | 'KR7' | 'KR8' | 'KR9' | 'KR10';
        quantity: number;
        unitPrice: number;
        amountPaid: number;
        paymentStatus: 'Paid' | 'Partial' | 'Pending';
        notes: string;
        deductFromInventory: boolean;
        inventoryItemId: string;
    }>({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerLocation: '',
        variety: 'KR1',
        quantity: 100,
        unitPrice: 2500, // Master Default Price
        amountPaid: 250000,
        paymentStatus: 'Paid',
        notes: '',
        deductFromInventory: true,
        inventoryItemId: ''
    });

    const orders = useLiveQuery(() => db.salesOrders.toArray()) || [];
    const inventoryItems = useLiveQuery(() => db.inventoryItems.filter(i => i.status === 'Active').toArray()) || [];

    // Filter orders
    const filteredOrders = orders.filter(order => {
        const matchesSearch = 
            (order.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.invoiceNumber || order.orderId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.customerPhone || '').includes(searchTerm);
        
        const varietyVal = order.variety || order.cloneType;
        const matchesVariety = selectedVariety === 'All' || varietyVal === selectedVariety;
        const matchesStatus = selectedStatus === 'All' || order.paymentStatus === selectedStatus;

        return matchesSearch && matchesVariety && matchesStatus;
    });

    // Aggregates
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalCollected = orders.reduce((sum, o) => sum + (o.amountPaid || 0), 0);
    const totalOutstanding = orders.reduce((sum, o) => sum + (o.balanceDue || o.outstandingBalance || 0), 0);
    const totalPlantletsSold = orders.reduce((sum, o) => sum + (o.quantity || o.quantityOrdered || 0), 0);

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.customerName || !formData.customerPhone || formData.quantity <= 0) {
            alert('Please enter a valid customer name, phone number, and positive quantity.');
            return;
        }

        const totals = calculateSalesTotals(formData.quantity, formData.unitPrice, formData.amountPaid);
        const invoiceNum = `GSF-INV-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, '0')}`;
        const today = new Date().toISOString().split('T')[0];

        const newOrder: SalesOrder = {
            invoiceNumber: invoiceNum,
            orderId: invoiceNum,
            orderDate: today,
            customerName: formData.customerName,
            customerPhone: formData.customerPhone,
            customerEmail: formData.customerEmail || undefined,
            customerLocation: formData.customerLocation || undefined,
            variety: formData.variety,
            cloneType: formData.variety,
            quantity: formData.quantity,
            quantityOrdered: formData.quantity,
            unitPrice: formData.unitPrice,
            pricePerClone: formData.unitPrice,
            totalAmount: totals.totalAmount,
            amountPaid: formData.amountPaid,
            balanceDue: totals.balanceDue,
            outstandingBalance: totals.balanceDue,
            paymentStatus: totals.paymentStatus,
            deliveryStatus: 'Delivered',
            orderStatus: 'Delivered',
            soldBy: 'Sales Officer',
            notes: formData.notes
        };

        const id = await db.salesOrders.add(newOrder);
        const createdOrder = { ...newOrder, id };

        // Stock deduction if enabled
        if (formData.deductFromInventory && formData.inventoryItemId) {
            const item = await db.inventoryItems.get(formData.inventoryItemId);
            if (item) {
                const newQty = Math.max(0, item.quantity - formData.quantity);
                await db.inventoryItems.update(item.inventoryId, { quantity: newQty });
                await db.inventoryTransactions.add({
                    inventoryId: item.inventoryId,
                    itemName: item.name,
                    quantityChange: -formData.quantity,
                    type: 'Sale Dispatch',
                    unitPrice: formData.unitPrice,
                    totalCost: totals.totalAmount,
                    date: new Date().toISOString(),
                    user: 'Sales Officer',
                    reason: `Customer Sale ${invoiceNum}`,
                    notes: `Sold ${formData.quantity} plantlets to ${formData.customerName}`
                });
            }
        }

        // Activity log
        await db.activityLogs.add({
            user: 'Sales Officer',
            action: 'Sale Recorded',
            module: 'Sales & Invoices',
            recordIdentifier: invoiceNum,
            date: new Date().toISOString(),
            description: `Sold ${formData.quantity} ${formData.variety} plantlets to ${formData.customerName} for cash UGX ${totals.totalAmount.toLocaleString()}`
        });

        setShowNewOrderModal(false);
        generateSalesReceiptPDF(createdOrder);
        setFormData({
            customerName: '',
            customerPhone: '',
            customerEmail: '',
            customerLocation: '',
            variety: 'KR1',
            quantity: 100,
            unitPrice: 2500,
            amountPaid: 250000,
            paymentStatus: 'Paid',
            notes: '',
            deductFromInventory: true,
            inventoryItemId: ''
        });
    };

    const handleUpdatePaymentStatus = async (orderId: number, status: 'Paid' | 'Partial' | 'Pending') => {
        const order = await db.salesOrders.get(orderId);
        if (!order) return;

        let paid = order.amountPaid;
        if (status === 'Paid') paid = order.totalAmount;
        if (status === 'Pending') paid = 0;

        const balance = Math.max(0, order.totalAmount - paid);
        await db.salesOrders.update(orderId, {
            paymentStatus: status,
            amountPaid: paid,
            balanceDue: balance,
            outstandingBalance: balance
        });
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
                        Track commercial coffee clone sales, cash payments in UGX, and official customer receipts.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => generateSalesSummaryPDF(orders, { totalRevenue, totalCollected, totalOutstanding, totalQuantity: totalPlantletsSold })}
                    >
                        <Download size={16} /> Export Sales Summary (PDF)
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowNewOrderModal(true)}>
                        <Plus size={18} /> Record Cash Sale
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">TOTAL SALES VALUE</span>
                        <DollarSign className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--color-primary)' }}>
                        {formatUGX(totalRevenue)}
                    </div>
                    <div className="stat-change text-light">Total invoice volume</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">CASH RECEIVED</span>
                        <CheckCircle2 className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: '#16a34a' }}>
                        {formatUGX(totalCollected)}
                    </div>
                    <div className="stat-change text-light">Total cash settled</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">CASH OUTSTANDING</span>
                        <AlertCircle className="stat-icon text-danger" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: totalOutstanding > 0 ? '#dc2626' : 'var(--color-text)' }}>
                        {formatUGX(totalOutstanding)}
                    </div>
                    <div className="stat-change text-light">Pending cash balances</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">PLANTLETS SOLD</span>
                        <Layers className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value">
                        {totalPlantletsSold.toLocaleString()}
                    </div>
                    <div className="stat-change text-light">KR1, KR3–KR10 Clones</div>
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
                            placeholder="Search by customer name, phone, or invoice #..."
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
                        style={{ minWidth: '140px' }}
                    >
                        <option value="All">All Varieties</option>
                        {VARIETIES.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>

                    <select 
                        className="form-input" 
                        value={selectedStatus} 
                        onChange={e => setSelectedStatus(e.target.value)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="All">All Payments</option>
                        <option value="Paid">Paid</option>
                        <option value="Partial">Partial</option>
                        <option value="Pending">Pending</option>
                    </select>
                </div>
            </div>

            {/* Orders Table */}
            <div className="card table-responsive">
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Invoice #</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Date</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Customer</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Variety</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Quantity</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Unit Price</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Total Amount</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Cash Payment Status</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Receipt</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                    No sales records found matching criteria.
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.slice().reverse().map(order => {
                                const inv = order.invoiceNumber || order.orderId || 'GSF-INV';
                                const varName = order.variety || order.cloneType || 'KR1';
                                const qty = order.quantity || order.quantityOrdered || 0;
                                const unitPrice = order.unitPrice || order.pricePerClone || 2500;
                                const balance = order.balanceDue ?? order.outstandingBalance ?? Math.max(0, order.totalAmount - order.amountPaid);
                                const isFullyPaid = order.paymentStatus === 'Paid' || order.paymentStatus === 'Fully Paid';
                                const isPartial = order.paymentStatus === 'Partial' || order.paymentStatus === 'Partially Paid';

                                return (
                                    <tr key={order.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            <strong style={{ color: 'var(--color-primary)' }}>{inv}</strong>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            {order.orderDate}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{order.customerName}</div>
                                            <div className="text-light" style={{ fontSize: '0.8rem' }}>{order.customerPhone}</div>
                                            {order.customerLocation && (
                                                <div className="text-light" style={{ fontSize: '0.75rem' }}>📍 {order.customerLocation}</div>
                                            )}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            <span className="badge badge-primary">{varName}</span>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            <strong>{qty.toLocaleString()}</strong>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            {formatUGX(unitPrice)}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            <strong style={{ color: 'var(--color-primary)' }}>{formatUGX(order.totalAmount)}</strong>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <select 
                                                        value={order.paymentStatus}
                                                        onChange={e => handleUpdatePaymentStatus(order.id!, e.target.value as any)}
                                                        style={{
                                                            padding: '0.25rem 0.5rem',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--color-border)',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 600,
                                                            background: isFullyPaid ? '#dcfce7' : isPartial ? '#fef9c3' : '#fee2e2',
                                                            color: isFullyPaid ? '#166534' : isPartial ? '#854d0e' : '#991b1b',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <option value="Paid">Paid</option>
                                                        <option value="Partial">Partial</option>
                                                        <option value="Pending">Pending</option>
                                                    </select>
                                                    <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>
                                                        {formatUGX(order.amountPaid)}
                                                    </span>
                                                </div>
                                                {balance > 0 ? (
                                                    <div style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>
                                                        Balance: {formatUGX(balance)}
                                                    </div>
                                                ) : (
                                                    <div style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
                                                        Fully Cleared (Cash)
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            <button 
                                                className="btn btn-secondary" 
                                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                                title="Print Receipt"
                                                onClick={() => generateSalesReceiptPDF(order)}
                                            >
                                                <Receipt size={14} /> Receipt
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* New Order Modal (Cash Only) */}
            {showNewOrderModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Banknote size={22} color="var(--color-primary)" /> Record Customer Cash Sale
                                </h2>
                                <span className="text-light" style={{ fontSize: '0.85rem' }}>Payment accepted: Cash only</span>
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowNewOrderModal(false)}>
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
                                    <label className="form-label">Customer Location / Farm</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        placeholder="District / Town / Sub-county"
                                        value={formData.customerLocation}
                                        onChange={e => setFormData({ ...formData, customerLocation: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Customer Email</label>
                                    <input 
                                        type="email" 
                                        className="form-input" 
                                        placeholder="Optional email"
                                        value={formData.customerEmail}
                                        onChange={e => setFormData({ ...formData, customerEmail: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Coffee Variety *</label>
                                    <select 
                                        className="form-input" 
                                        value={formData.variety}
                                        onChange={e => setFormData({ ...formData, variety: e.target.value as any })}
                                    >
                                        {VARIETIES.map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Quantity *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        min="1" 
                                        className="form-input" 
                                        value={formData.quantity || ''}
                                        onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Unit Price (UGX) *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        min="0" 
                                        className="form-input" 
                                        value={formData.unitPrice || ''}
                                        onChange={e => setFormData({ ...formData, unitPrice: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            {/* Order Total preview */}
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="text-light" style={{ fontSize: '0.85rem' }}>Total Sales Amount</div>
                                    <strong style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
                                        {formatUGX((formData.quantity || 0) * (formData.unitPrice || 0))}
                                    </strong>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="text-light" style={{ fontSize: '0.85rem' }}>Cash Balance Due</div>
                                    <strong style={{ fontSize: '1.1rem', color: Math.max(0, (formData.quantity * formData.unitPrice) - formData.amountPaid) > 0 ? '#dc2626' : '#16a34a' }}>
                                        {formatUGX(Math.max(0, (formData.quantity * formData.unitPrice) - formData.amountPaid))}
                                    </strong>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Cash Amount Received Now (UGX) *</label>
                                <input 
                                    type="number" 
                                    min="0" 
                                    className="form-input" 
                                    value={formData.amountPaid || ''}
                                    onChange={e => {
                                        const paid = Number(e.target.value);
                                        const total = formData.quantity * formData.unitPrice;
                                        const status = paid >= total ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
                                        setFormData({ ...formData, amountPaid: paid, paymentStatus: status });
                                    }}
                                />
                                <span className="text-light" style={{ fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                                    💵 Payment Method: <strong>Cash Only</strong>
                                </span>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Link Inventory Item (Optional Stock Auto-Deduct)</label>
                                <select 
                                    className="form-input" 
                                    value={formData.inventoryItemId}
                                    onChange={e => setFormData({ ...formData, inventoryItemId: e.target.value })}
                                >
                                    <option value="">None / Manual Management</option>
                                    {inventoryItems.map(item => (
                                        <option key={item.inventoryId} value={item.inventoryId}>
                                            {item.name} ({item.quantity} available - {item.category})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Order Notes / Details</label>
                                <textarea 
                                    className="form-input" 
                                    rows={2} 
                                    placeholder="e.g. Farm gate collection, inspection confirmed..."
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewOrderModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    Confirm Cash Sale & Print Receipt
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;

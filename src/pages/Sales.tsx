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
    Receipt
} from 'lucide-react';
import { generateSalesReceiptPDF, generateSalesSummaryPDF } from '../utils/pdfGenerator';
import { calculateSalesTotals } from '../utils/calculations';

const VARIETIES: Array<'KR1' | 'KR3' | 'KR4' | 'KR5' | 'KR6' | 'KR7' | 'KR8' | 'KR9' | 'KR10'> = [
    'KR1', 'KR3', 'KR4', 'KR5', 'KR6', 'KR7', 'KR8', 'KR9', 'KR10'
];

const Sales: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVariety, setSelectedVariety] = useState<string>('All');
    const [selectedStatus, setSelectedStatus] = useState<string>('All');
    const [showNewOrderModal, setShowNewOrderModal] = useState(false);

    // Form state
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
        deliveryStatus: 'Pending' | 'Dispatched' | 'Delivered' | 'Cancelled';
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
        deliveryStatus: 'Delivered',
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
        const matchesStatus = selectedStatus === 'All' || order.paymentStatus === selectedStatus || order.deliveryStatus === selectedStatus;

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
            deliveryStatus: formData.deliveryStatus,
            orderStatus: formData.deliveryStatus,
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
            description: `Sold ${formData.quantity} ${formData.variety} plantlets to ${formData.customerName} for UGX ${totals.totalAmount.toLocaleString()}`
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
            deliveryStatus: 'Delivered',
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

    const handleUpdateDeliveryStatus = async (orderId: number, status: 'Pending' | 'Dispatched' | 'Delivered' | 'Cancelled') => {
        await db.salesOrders.update(orderId, { deliveryStatus: status, orderStatus: status });
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Plantlet Sales & Invoicing</h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Manage customer plantlet orders, pricing (UGX), invoices, dispatch status, and official receipts.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => generateSalesSummaryPDF(orders, { totalRevenue, totalCollected, totalOutstanding, totalQuantity: totalPlantletsSold })}
                    >
                        <Download size={16} /> Export Sales Summary (PDF)
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowNewOrderModal(true)}>
                        <Plus size={18} /> Record New Order
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Total Revenue</span>
                        <DollarSign className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--color-primary)' }}>
                        UGX {totalRevenue.toLocaleString()}
                    </div>
                    <div className="stat-change text-light">Cumulative sales amount</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Cash Collected</span>
                        <CheckCircle2 className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: '#16a34a' }}>
                        UGX {totalCollected.toLocaleString()}
                    </div>
                    <div className="stat-change text-light">Received payments</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Outstanding Balance</span>
                        <AlertCircle className="stat-icon text-danger" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: totalOutstanding > 0 ? '#dc2626' : 'var(--color-text)' }}>
                        UGX {totalOutstanding.toLocaleString()}
                    </div>
                    <div className="stat-change text-light">Unpaid invoices</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Plantlets Sold</span>
                        <Layers className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value">
                        {totalPlantletsSold.toLocaleString()}
                    </div>
                    <div className="stat-change text-light">KR1, KR3–KR10 Clones</div>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
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

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <select 
                        className="form-input" 
                        value={selectedVariety} 
                        onChange={e => setSelectedVariety(e.target.value)}
                        style={{ minWidth: '130px' }}
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
                        style={{ minWidth: '140px' }}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Paid">Paid</option>
                        <option value="Partial">Partial</option>
                        <option value="Pending">Pending</option>
                        <option value="Dispatched">Dispatched</option>
                        <option value="Delivered">Delivered</option>
                    </select>
                </div>
            </div>

            {/* Orders Table */}
            <div className="card table-responsive">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Invoice #</th>
                            <th>Date</th>
                            <th>Customer Info</th>
                            <th>Variety</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Total (UGX)</th>
                            <th>Paid / Balance</th>
                            <th>Payment</th>
                            <th>Delivery</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                    No sales orders found matching criteria.
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.slice().reverse().map(order => {
                                const inv = order.invoiceNumber || order.orderId || 'GSF-INV';
                                const varName = order.variety || order.cloneType || 'KR1';
                                const qty = order.quantity || order.quantityOrdered || 0;
                                const unitPrice = order.unitPrice || order.pricePerClone || 2500;
                                const balance = order.balanceDue ?? order.outstandingBalance ?? Math.max(0, order.totalAmount - order.amountPaid);

                                return (
                                    <tr key={order.id}>
                                        <td>
                                            <strong style={{ color: 'var(--color-primary)' }}>{inv}</strong>
                                        </td>
                                        <td>{order.orderDate}</td>
                                        <td>
                                            <div><strong>{order.customerName}</strong></div>
                                            <div className="text-light" style={{ fontSize: '0.8rem' }}>{order.customerPhone}</div>
                                            {order.customerLocation && (
                                                <div className="text-light" style={{ fontSize: '0.75rem' }}>📍 {order.customerLocation}</div>
                                            )}
                                        </td>
                                        <td>
                                            <span className="badge badge-primary">{varName}</span>
                                        </td>
                                        <td><strong>{qty.toLocaleString()}</strong></td>
                                        <td>UGX {unitPrice.toLocaleString()}</td>
                                        <td><strong>UGX {order.totalAmount.toLocaleString()}</strong></td>
                                        <td>
                                            <div style={{ color: '#16a34a', fontSize: '0.85rem' }}>Paid: UGX {order.amountPaid.toLocaleString()}</div>
                                            {balance > 0 ? (
                                                <div style={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>Due: UGX {balance.toLocaleString()}</div>
                                            ) : (
                                                <div style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>Cleared</div>
                                            )}
                                        </td>
                                        <td>
                                            <select 
                                                value={order.paymentStatus}
                                                onChange={e => handleUpdatePaymentStatus(order.id!, e.target.value as any)}
                                                style={{
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid var(--color-border)',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    background: order.paymentStatus === 'Paid' || order.paymentStatus === 'Fully Paid' ? '#dcfce7' : order.paymentStatus === 'Partial' || order.paymentStatus === 'Partially Paid' ? '#fef9c3' : '#fee2e2',
                                                    color: order.paymentStatus === 'Paid' || order.paymentStatus === 'Fully Paid' ? '#166534' : order.paymentStatus === 'Partial' || order.paymentStatus === 'Partially Paid' ? '#854d0e' : '#991b1b'
                                                }}
                                            >
                                                <option value="Paid">Paid</option>
                                                <option value="Partial">Partial</option>
                                                <option value="Pending">Pending</option>
                                            </select>
                                        </td>
                                        <td>
                                            <select 
                                                value={order.deliveryStatus || 'Delivered'}
                                                onChange={e => handleUpdateDeliveryStatus(order.id!, e.target.value as any)}
                                                style={{
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid var(--color-border)',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                <option value="Pending">Pending</option>
                                                <option value="Dispatched">Dispatched</option>
                                                <option value="Delivered">Delivered</option>
                                                <option value="Cancelled">Cancelled</option>
                                            </select>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                                <button 
                                                    className="btn btn-secondary" 
                                                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                                                    title="Print Invoice / Receipt"
                                                    onClick={() => generateSalesReceiptPDF(order)}
                                                >
                                                    <Receipt size={14} /> Receipt PDF
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

            {/* New Order Modal */}
            {showNewOrderModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '600px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>Create Customer Plantlet Order</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowNewOrderModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Customer Full Name *</label>
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
                                    <label className="form-label">Delivery Location</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        placeholder="District / Town / Farm"
                                        value={formData.customerLocation}
                                        onChange={e => setFormData({ ...formData, customerLocation: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Customer Email</label>
                                    <input 
                                        type="email" 
                                        className="form-input" 
                                        placeholder="optional"
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
                                    <label className="form-label">Quantity (Plantlets) *</label>
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
                            <div style={{ background: 'var(--color-background)', padding: '1rem', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="text-light" style={{ fontSize: '0.85rem' }}>Calculated Total Order Value</div>
                                    <strong style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
                                        UGX {((formData.quantity || 0) * (formData.unitPrice || 0)).toLocaleString()}
                                    </strong>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="text-light" style={{ fontSize: '0.85rem' }}>Balance Remaining</div>
                                    <strong style={{ fontSize: '1.1rem', color: Math.max(0, (formData.quantity * formData.unitPrice) - formData.amountPaid) > 0 ? '#dc2626' : '#16a34a' }}>
                                        UGX {Math.max(0, (formData.quantity * formData.unitPrice) - formData.amountPaid).toLocaleString()}
                                    </strong>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Amount Paid Now (UGX) *</label>
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
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Delivery / Dispatch Status</label>
                                    <select 
                                        className="form-input" 
                                        value={formData.deliveryStatus}
                                        onChange={e => setFormData({ ...formData, deliveryStatus: e.target.value as any })}
                                    >
                                        <option value="Delivered">Delivered</option>
                                        <option value="Dispatched">Dispatched</option>
                                        <option value="Pending">Pending Dispatch</option>
                                    </select>
                                </div>
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
                                <label className="form-label">Order Notes / Specifications</label>
                                <textarea 
                                    className="form-input" 
                                    rows={2} 
                                    placeholder="e.g. Special transport arrangement, potting bag inspection..."
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewOrderModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    Confirm & Generate Invoice
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

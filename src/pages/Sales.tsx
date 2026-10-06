import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, SalesOrder } from '../db';
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
    ShoppingCart 
} from 'lucide-react';
import { generateSalesReceiptPDF, generateSalesSummaryPDF } from '../utils/pdfGenerator';
import { formatUGX } from '../utils/calculations';
import './Sales.css';

const VARIETIES: Array<'KR1' | 'KR3' | 'KR4' | 'KR5' | 'KR6' | 'KR7' | 'KR8' | 'KR9' | 'KR10'> = [
    'KR1', 'KR3', 'KR4', 'KR5', 'KR6', 'KR7', 'KR8', 'KR9', 'KR10'
];

const Sales: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVariety, setSelectedVariety] = useState<string>('All');
    const [showNewOrderModal, setShowNewOrderModal] = useState(false);

    // Sales are recorded as fully paid cash transactions.
    const [formData, setFormData] = useState<{
        customerName: string;
        customerPhone: string;
        customerEmail: string;
        customerLocation: string;
        variety: 'KR1' | 'KR3' | 'KR4' | 'KR5' | 'KR6' | 'KR7' | 'KR8' | 'KR9' | 'KR10';
        quantity: number;
        unitPrice: number;
    }>({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerLocation: '',
        variety: 'KR1',
        quantity: 100,
        unitPrice: 2500 // Master Default Price
    });

    const orders = useLiveQuery(() => db.salesOrders.toArray()) || [];

    // Filter orders
    const filteredOrders = orders.filter(order => {
        const matchesSearch = 
            (order.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.invoiceNumber || order.orderId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.customerPhone || '').includes(searchTerm);
        
        const varietyVal = order.variety || order.cloneType;
        const matchesVariety = selectedVariety === 'All' || varietyVal === selectedVariety;

        return matchesSearch && matchesVariety;
    });

    // Aggregates (100% Cash Paid, Zero Dues)
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalPlantletsSold = orders.reduce((sum, o) => sum + (o.quantity || o.quantityOrdered || 0), 0);
    const totalTransactions = orders.length;

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.customerName.trim() || !formData.customerPhone.trim() || formData.quantity <= 0) {
            alert('Please enter customer name, phone number, and a valid quantity.');
            return;
        }

        const totalAmount = (formData.quantity || 0) * (formData.unitPrice || 0);
        const invoiceNum = `GSF-INV-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, '0')}`;
        const today = new Date().toISOString().split('T')[0];

        const newOrder: SalesOrder = {
            invoiceNumber: invoiceNum,
            orderId: invoiceNum,
            orderDate: today,
            customerName: formData.customerName.trim(),
            customerPhone: formData.customerPhone.trim(),
            customerEmail: formData.customerEmail.trim() || undefined,
            customerLocation: formData.customerLocation.trim() || undefined,
            variety: formData.variety,
            cloneType: formData.variety,
            quantity: formData.quantity,
            quantityOrdered: formData.quantity,
            unitPrice: formData.unitPrice,
            pricePerClone: formData.unitPrice,
            totalAmount,
            amountPaid: totalAmount,
            soldBy: 'Sales Officer'
        };

        const id = await db.salesOrders.add(newOrder);
        const createdOrder = { ...newOrder, id };

        // Activity log
        await db.activityLogs.add({
            user: 'Sales Officer',
            action: 'Cash Sale Recorded',
            module: 'Sales & Invoices',
            recordIdentifier: invoiceNum,
            date: new Date().toISOString(),
            description: `Sold ${formData.quantity} ${formData.variety} plantlets to ${formData.customerName} for cash UGX ${totalAmount.toLocaleString()}`
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
            unitPrice: 2500
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
                        onClick={() => generateSalesSummaryPDF(orders)}
                    >
                        <Download size={16} /> Export Sales Summary (PDF)
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowNewOrderModal(true)}>
                        <Plus size={18} /> Record Cash Sale
                    </button>
                </div>
            </div>

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
                        <span className="stat-title">SALES TRANSACTIONS</span>
                        <ShoppingCart className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value">
                        {totalTransactions}
                    </div>
                    <div className="stat-change text-light">Completed cash sales</div>
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
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Variety</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Quantity</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Unit Price</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Cash Paid (UGX)</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Receipt</th>
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
                                const varName = order.variety || order.cloneType || 'KR1';
                                const qty = order.quantity || order.quantityOrdered || 0;
                                const unitPrice = order.unitPrice || order.pricePerClone || 2500;

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
                                            <strong style={{ color: '#16a34a' }}>{formatUGX(order.totalAmount)}</strong>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>
                                            <button 
                                                className="btn btn-secondary" 
                                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                                title="Print Official Cash Receipt"
                                                onClick={() => generateSalesReceiptPDF(order)}
                                            >
                                                <Receipt size={14} /> Cash Receipt
                                            </button>
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
                        const varName = order.variety || order.cloneType || 'KR1';
                        const qty = order.quantity || order.quantityOrdered || 0;
                        const unitPrice = order.unitPrice || order.pricePerClone || 2500;

                        return (
                            <article key={order.id} className="card sales-order-card">
                                <div className="sales-order-heading">
                                    <div>
                                        <strong className="sales-invoice">{inv}</strong>
                                        <div className="text-light sales-order-date">{order.orderDate}</div>
                                    </div>
                                    <span className="badge badge-primary">{varName}</span>
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
                                        <span className="text-light">Quantity</span>
                                        <strong>{qty.toLocaleString()}</strong>
                                    </div>
                                    <div>
                                        <span className="text-light">Unit price</span>
                                        <strong>{formatUGX(unitPrice)}</strong>
                                    </div>
                                    <div>
                                        <span className="text-light">Cash paid</span>
                                        <strong className="sales-cash-paid">{formatUGX(order.totalAmount)}</strong>
                                    </div>
                                </div>

                                <button
                                    className="btn btn-secondary sales-receipt-button"
                                    onClick={() => generateSalesReceiptPDF(order)}
                                >
                                    <Receipt size={15} /> Cash Receipt
                                </button>
                            </article>
                        );
                    })
                )}
            </div>

            {/* New Order Modal (Cash Only, No Dues) */}
            {showNewOrderModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Banknote size={22} color="var(--color-primary)" /> Record Customer Cash Sale
                                </h2>
                                <span className="text-light" style={{ fontSize: '0.85rem' }}>100% Cash Paid on Issuance</span>
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

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Variety *</label>
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

                            {/* Total Cash Settlement Banner */}
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="text-light" style={{ fontSize: '0.85rem' }}>Total Cash Payment (Paid in Full)</div>
                                    <strong style={{ fontSize: '1.35rem', color: '#166534' }}>
                                        {formatUGX((formData.quantity || 0) * (formData.unitPrice || 0))}
                                    </strong>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.35rem 0.75rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.85rem' }}>
                                        💵 Cash Payment
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewOrderModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    Confirm Cash Sale & Generate Receipt
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

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, InventoryItem } from '../db';
import { 
    Plus, 
    Search, 
    Download, 
    AlertTriangle, 
    DollarSign, 
    RefreshCw,
    X,
    ArrowDownRight,
    ArrowUpRight,
    Wrench,
    Bug,
    Sparkles,
    Sprout
} from 'lucide-react';
import { generateInventoryPDF } from '../utils/pdfGenerator';
import { isStockLow, calculateInventoryValuation } from '../utils/calculations';

const CATEGORIES = [
    { name: 'Fertilizers', icon: Sparkles, color: '#16a34a' },
    { name: 'Pesticides', icon: Bug, color: '#ea580c' },
    { name: 'Farm Tools', icon: Wrench, color: '#2563eb' },
    { name: 'Nursery Supplies', icon: Sprout, color: '#0d9488' }
];

const PREDEFINED_NURSERY_SUPPLIES = [
    'Black soil',
    'Sand',
    'Metal rods',
    'UV polythene paper',
    'Shade nets',
    'Potting bags'
];

const Inventory: React.FC = () => {
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showStockModal, setShowStockModal] = useState(false);
    const [selectedItemForStock, setSelectedItemForStock] = useState<InventoryItem | null>(null);
    const [stockAction, setStockAction] = useState<'IN' | 'OUT'>('IN');
    const [stockChangeAmount, setStockChangeAmount] = useState<number>(10);
    const [stockReason, setStockReason] = useState<string>('Routine Stock Purchase');

    // Add form state
    const [formData, setFormData] = useState<{
        name: string;
        category: string;
        type: string;
        unit: string;
        quantity: number;
        purchasePrice: number;
        supplier: string;
        minStockLevel: number;
        condition: string;
        location: string;
        notes: string;
    }>({
        name: '',
        category: 'Fertilizers',
        type: '',
        unit: 'kg',
        quantity: 50,
        purchasePrice: 25000,
        supplier: 'Uganda Crop Care Ltd',
        minStockLevel: 10,
        condition: 'New',
        location: 'Main Store Shelf A',
        notes: ''
    });

    const items = useLiveQuery(() => db.inventoryItems.toArray()) || [];
    const transactions = useLiveQuery(() => db.inventoryTransactions.toArray()) || [];

    // Filter items
    const filteredItems = items.filter(item => {
        const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
        const matchesSearch = 
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.inventoryId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.supplier && item.supplier.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    // Valuation and Stats
    const totalValuation = calculateInventoryValuation(items);
    const lowStockCount = items.filter(i => isStockLow(i.quantity, i.minStockLevel) && i.status === 'Active').length;
    const totalActiveItems = items.filter(i => i.status === 'Active').length;

    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            alert('Please specify an item name.');
            return;
        }

        const count = await db.inventoryItems.count();
        const categoryCode = formData.category.substring(0, 3).toUpperCase();
        const newId = `GSF-INV-${categoryCode}-${(count + 1).toString().padStart(4, '0')}`;
        const today = new Date().toISOString();

        const newItem: InventoryItem = {
            inventoryId: newId,
            name: formData.name.trim(),
            category: formData.category,
            type: formData.type || undefined,
            unit: formData.unit,
            quantity: Number(formData.quantity) || 0,
            minStockLevel: Number(formData.minStockLevel) || 5,
            supplier: formData.supplier || 'Direct Farm Purchase',
            purchasePrice: Number(formData.purchasePrice) || 0,
            purchaseDate: today.split('T')[0],
            dateReceived: today.split('T')[0],
            condition: formData.category === 'Farm Tools' ? (formData.condition as any) : undefined,
            location: formData.location || 'Central Store',
            status: 'Active',
            notes: formData.notes
        };

        await db.inventoryItems.add(newItem);

        // Initial Transaction Record
        await db.inventoryTransactions.add({
            inventoryId: newId,
            itemName: newItem.name,
            quantityChange: newItem.quantity,
            type: 'Purchase',
            unitPrice: newItem.purchasePrice,
            totalCost: newItem.quantity * newItem.purchasePrice,
            date: today,
            user: 'Store Manager',
            reason: 'Initial Stocking',
            notes: formData.notes
        });

        setShowAddModal(false);
        setFormData({
            name: '',
            category: 'Fertilizers',
            type: '',
            unit: 'kg',
            quantity: 50,
            purchasePrice: 25000,
            supplier: 'Uganda Crop Care Ltd',
            minStockLevel: 10,
            condition: 'New',
            location: 'Main Store Shelf A',
            notes: ''
        });
    };

    const handleStockAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItemForStock || stockChangeAmount <= 0) return;

        const isStockOut = stockAction === 'OUT';
        if (isStockOut && selectedItemForStock.quantity < stockChangeAmount) {
            alert(`Cannot issue ${stockChangeAmount} ${selectedItemForStock.unit}. Current stock is only ${selectedItemForStock.quantity} ${selectedItemForStock.unit}.`);
            return;
        }

        const delta = isStockOut ? -stockChangeAmount : stockChangeAmount;
        const newQuantity = selectedItemForStock.quantity + delta;
        const today = new Date().toISOString();

        await db.inventoryItems.update(selectedItemForStock.inventoryId, {
            quantity: newQuantity
        });

        await db.inventoryTransactions.add({
            inventoryId: selectedItemForStock.inventoryId,
            itemName: selectedItemForStock.name,
            quantityChange: delta,
            type: isStockOut ? 'Stock usage' : 'Stock addition',
            unitPrice: selectedItemForStock.purchasePrice,
            totalCost: Math.abs(delta) * selectedItemForStock.purchasePrice,
            date: today,
            user: 'Store Manager',
            reason: stockReason,
            notes: `${isStockOut ? 'Issued for' : 'Received into'} nursery operations`
        });

        setShowStockModal(false);
        setSelectedItemForStock(null);
        setStockChangeAmount(10);
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Farm & Nursery Inventory</h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Track Fertilizers, Pesticides, Farm Tools, and Nursery Supplies with live valuation in UGX.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button 
                        className="btn btn-secondary" 
                        onClick={() => generateInventoryPDF(items, transactions)}
                    >
                        <Download size={16} /> Export Inventory PDF
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={18} /> Add Inventory Item
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Inventory Valuation</span>
                        <DollarSign className="stat-icon text-success" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: 'var(--color-primary)' }}>
                        UGX {totalValuation.toLocaleString()}
                    </div>
                    <div className="stat-change text-light">{totalActiveItems} Active SKUs</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Low Stock Alerts</span>
                        <AlertTriangle className="stat-icon text-warning" size={20} />
                    </div>
                    <div className="stat-value" style={{ color: lowStockCount > 0 ? '#ea580c' : 'var(--color-text)' }}>
                        {lowStockCount}
                    </div>
                    <div className="stat-change text-light">Items at or below reorder level</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-title">Stock Movements</span>
                        <RefreshCw className="stat-icon text-primary" size={20} />
                    </div>
                    <div className="stat-value">
                        {transactions.length}
                    </div>
                    <div className="stat-change text-light">Audited stock transactions</div>
                </div>
            </div>

            {/* Category Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                <button 
                    className={`btn ${selectedCategory === 'All' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSelectedCategory('All')}
                    style={{ padding: '0.4rem 0.85rem' }}
                >
                    All Categories ({items.length})
                </button>
                {CATEGORIES.map(cat => {
                    const count = items.filter(i => i.category === cat.name).length;
                    const IconComponent = cat.icon;
                    return (
                        <button 
                            key={cat.name}
                            className={`btn ${selectedCategory === cat.name ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setSelectedCategory(cat.name)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem' }}
                        >
                            <IconComponent size={16} />
                            {cat.name} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
                    <input 
                        type="text" 
                        className="form-input" 
                        style={{ paddingLeft: '2.25rem', width: '100%' }}
                        placeholder="Search by name, SKU, or supplier..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Items Table */}
            <div className="card table-responsive">
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Item</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Category</th>
                            <th style={{ whiteSpace: 'nowrap', padding: '0.75rem 1rem' }}>Stock Level</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Unit Cost</th>
                            <th style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0.75rem 1rem' }}>Total Valuation</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Supplier / Location</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                    No inventory items found. Click "Add Inventory Item" to register supplies.
                                </td>
                            </tr>
                        ) : (
                            filteredItems.map(item => {
                                const isLow = isStockLow(item.quantity, item.minStockLevel);

                                return (
                                    <tr key={item.inventoryId} style={{ opacity: item.status === 'Archived' ? 0.6 : 1 }}>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div><strong>{item.name}</strong></div>
                                            <div className="text-light" style={{ fontSize: '0.8rem' }}>{item.inventoryId} {item.type && `• ${item.type}`}</div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                            <span className="badge badge-primary">{item.category}</span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <strong style={{ fontSize: '1rem', color: isLow ? '#ea580c' : 'var(--color-text)' }}>
                                                    {item.quantity.toLocaleString()} {item.unit}
                                                </strong>
                                                {isLow && item.status === 'Active' && (
                                                    <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Low</span>
                                                )}
                                            </div>
                                            <div className="text-light" style={{ fontSize: '0.75rem' }}>Min: {item.minStockLevel} {item.unit}</div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            UGX {item.purchasePrice.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <strong>UGX {(item.quantity * item.purchasePrice).toLocaleString()}</strong>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div>{item.supplier || 'N/A'}</div>
                                            <div className="text-light" style={{ fontSize: '0.75rem' }}>📍 {item.location || 'Store'}</div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Item Modal */}
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '600px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>Register New Inventory Item</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowAddModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Category *</label>
                                    <select 
                                        className="form-input"
                                        value={formData.category}
                                        onChange={e => {
                                            const cat = e.target.value;
                                            setFormData({ 
                                                ...formData, 
                                                category: cat,
                                                unit: cat === 'Fertilizers' || cat === 'Nursery Supplies' ? 'kg' : cat === 'Pesticides' ? 'Litres' : 'Pieces'
                                            });
                                        }}
                                    >
                                        <option value="Fertilizers">Fertilizers</option>
                                        <option value="Pesticides">Pesticides</option>
                                        <option value="Farm Tools">Farm Tools</option>
                                        <option value="Nursery Supplies">Nursery Supplies</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Item Name *</label>
                                    {formData.category === 'Nursery Supplies' ? (
                                        <div>
                                            <input 
                                                type="text" 
                                                required 
                                                list="nursery-supplies-suggestions"
                                                className="form-input" 
                                                placeholder="e.g. Black soil, Sand..."
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            />
                                            <datalist id="nursery-supplies-suggestions">
                                                {PREDEFINED_NURSERY_SUPPLIES.map(s => (
                                                    <option key={s} value={s} />
                                                ))}
                                            </datalist>
                                        </div>
                                    ) : (
                                        <input 
                                            type="text" 
                                            required 
                                            className="form-input" 
                                            placeholder="e.g. NPK 17:17:17, Pruning Shears..."
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Unit of Measure *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        className="form-input" 
                                        placeholder="kg, Litres, Bags, Pieces"
                                        value={formData.unit}
                                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Initial Quantity *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        min="0"
                                        className="form-input" 
                                        value={formData.quantity || ''}
                                        onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Min Stock Threshold *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        min="0"
                                        className="form-input" 
                                        value={formData.minStockLevel || ''}
                                        onChange={e => setFormData({ ...formData, minStockLevel: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Purchase Unit Price (UGX) *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        min="0"
                                        className="form-input" 
                                        value={formData.purchasePrice || ''}
                                        onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Supplier Name</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        placeholder="e.g. Uganda Crop Care Ltd"
                                        value={formData.supplier}
                                        onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                {formData.category === 'Farm Tools' && (
                                    <div className="form-group">
                                        <label className="form-label">Tool Condition</label>
                                        <select 
                                            className="form-input"
                                            value={formData.condition}
                                            onChange={e => setFormData({ ...formData, condition: e.target.value })}
                                        >
                                            <option value="New">New</option>
                                            <option value="Good">Good</option>
                                            <option value="Fair">Fair</option>
                                            <option value="Needs Repair">Needs Repair</option>
                                        </select>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label className="form-label">Storage Location</label>
                                    <input 
                                        type="text" 
                                        className="form-input" 
                                        placeholder="e.g. Store Section 2"
                                        value={formData.location}
                                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    Save Inventory Item
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Stock In / Out Modal */}
            {showStockModal && selectedItemForStock && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '480px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0 }}>Record Stock Movement</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowStockModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleStockAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'var(--color-background)', padding: '0.75rem 1rem', borderRadius: '4px' }}>
                                <div><strong>{selectedItemForStock.name}</strong></div>
                                <div className="text-light" style={{ fontSize: '0.85rem' }}>
                                    Current Stock: <strong>{selectedItemForStock.quantity} {selectedItemForStock.unit}</strong> • Valuation: UGX {(selectedItemForStock.quantity * selectedItemForStock.purchasePrice).toLocaleString()}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Movement Type *</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    <button 
                                        type="button" 
                                        className={`btn ${stockAction === 'IN' ? 'btn-primary' : 'btn-secondary'}`}
                                        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}
                                        onClick={() => setStockAction('IN')}
                                    >
                                        <ArrowDownRight size={18} /> Stock In (Receive)
                                    </button>
                                    <button 
                                        type="button" 
                                        className={`btn ${stockAction === 'OUT' ? 'btn-danger' : 'btn-secondary'}`}
                                        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}
                                        onClick={() => setStockAction('OUT')}
                                    >
                                        <ArrowUpRight size={18} /> Stock Out (Issue)
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Quantity ({selectedItemForStock.unit}) *</label>
                                <input 
                                    type="number" 
                                    required 
                                    min="1"
                                    className="form-input" 
                                    value={stockChangeAmount || ''}
                                    onChange={e => setStockChangeAmount(Number(e.target.value))}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Reason / Destination *</label>
                                <input 
                                    type="text" 
                                    required 
                                    className="form-input" 
                                    placeholder={stockAction === 'IN' ? 'e.g. New Supplier Batch, Return' : 'e.g. Nursery Bed 4 Application, Spraying'}
                                    value={stockReason}
                                    onChange={e => setStockReason(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowStockModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                                    Commit Movement
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Inventory;

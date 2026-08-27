import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ShoppingCart, Plus, Search, AlertTriangle, QrCode, X } from 'lucide-react';
import './Inventory.css';

const Inventory = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [showAddForm, setShowAddForm] = useState(false);

    const [formData, setFormData] = useState({ name: '', category: 'Nursery supplies', barcode: '', unit: '', quantity: 0, minStock: 0, supplier: '', location: '' });

    const inventory = useLiveQuery(() => db.inventoryItems.toArray()) || [];
    const categories = Array.from(new Set(inventory.map(i => i.category)));

    const filteredInventory = inventory.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.inventoryId.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newId = `INV-${Math.floor(Math.random() * 9000) + 1000}`;
        const today = new Date().toISOString();

        await db.inventoryItems.add({
            inventoryId: newId,
            name: formData.name,
            category: formData.category,
            barcode: formData.barcode,
            brand: 'Internal',
            unit: formData.unit,
            quantity: Number(formData.quantity),
            minStockLevel: Number(formData.minStock),
            supplier: formData.supplier,
            purchasePrice: 0,
            purchaseDate: today,
            location: formData.location,
            status: 'Active'
        });

        await db.inventoryTransactions.add({
            inventoryId: newId,
            quantityChange: Number(formData.quantity),
            type: 'Purchase',
            date: today,
            user: 'Admin',
            reason: 'Initial Registration',
            notes: ''
        });

        setShowAddForm(false);
    };

    return (
        <div className="inventory-wrapper">
            <div className="header-action">
                <div>
                    <h1>Inventory Management</h1>
                    <p className="text-light">Manage nursery supplies, fertilizers, and assets.</p>
                </div>
                <div className="actions-group">
                    <button className="btn btn-secondary"><QrCode size={18} /> Scan Barcode</button>
                    <button className="btn btn-primary" onClick={() => setShowAddForm(true)}><Plus size={18} /> New Item</button>
                </div>
            </div>

            <div className="filters-bar card">
                <div className="search-group">
                    <Search size={18} className="text-light" />
                    <input
                        type="text"
                        placeholder="Search items..."
                        className="form-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    className="form-input filter-select"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                >
                    <option value="All">All Categories</option>
                    {categories.map(cat => <option key={cat!} value={cat}>{cat}</option>)}
                </select>
            </div>

            <div className="table-responsive card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Quantity/Unit</th>
                            <th>Stock Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInventory.map(item => {
                            const isOut = item.quantity === 0;
                            const isLow = !isOut && item.quantity <= item.minStockLevel;
                            return (
                                <tr key={item.inventoryId}>
                                    <td><strong>{item.inventoryId}</strong></td>
                                    <td>{item.name}</td>
                                    <td>{item.quantity} {item.unit}</td>
                                    <td>
                                        {isOut ? <span className="badge badge-danger">Out of Stock</span> :
                                            isLow ? <span className="badge badge-warning"><AlertTriangle size={12} /> Low Stock</span> :
                                                <span className="badge badge-success">Sufficient</span>}
                                    </td>
                                    <td>
                                        <button className="btn btn-secondary btn-sm">Edit / Use</button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {showAddForm && (
                <div className="modal-overlay">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h2>Add New Inventory Item</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowAddForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAddSubmit}>
                            <div className="form-group">
                                <label className="form-label">Item Name *</label>
                                <input required type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Category *</label>
                                    <select className="form-input" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                        <option>Nursery supplies</option>
                                        <option>Fertilizers</option>
                                        <option>Crop protection</option>
                                        <option>Planting materials</option>
                                        <option>Farm tools</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Barcode / QR</label>
                                    <input type="text" className="form-input" value={formData.barcode} onChange={e => setFormData({ ...formData, barcode: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Initial Quantity *</label>
                                    <input required type="number" min="0" className="form-input" value={formData.quantity || ''} onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Unit (e.g. Kg, roll) *</label>
                                    <input required type="text" className="form-input" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Min Stock Level *</label>
                                    <input required type="number" min="0" className="form-input" value={formData.minStock || ''} onChange={e => setFormData({ ...formData, minStock: Number(e.target.value) })} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Storage Location</label>
                                    <input type="text" className="form-input" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save Item</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Inventory;


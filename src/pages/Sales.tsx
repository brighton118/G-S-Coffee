import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Plus, X } from 'lucide-react';

const Sales = () => {
    const [showSaleForm, setShowSaleForm] = useState(false);
    const [formData, setFormData] = useState({ batchId: '', customer: '', quantity: 0, price: 0 });

    const sales = useLiveQuery(() => db.plantletSales.toArray()) || [];

    // Only allow adding sales from batches that have "Sorted" status (or specifically grab inventory that are plantlets)
    const availableInventory = useLiveQuery(() => db.inventoryItems.filter(i => i.inventoryId.startsWith('INV-RET-')).toArray()) || [];

    const handleSaleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const inventoryItem = await db.inventoryItems.get(formData.batchId);
        if (!inventoryItem || inventoryItem.quantity < formData.quantity) {
            alert(`Insufficient stock. Available: ${inventoryItem?.quantity || 0}`);
            return;
        }

        const today = new Date().toISOString();

        await db.plantletSales.add({
            batchId: inventoryItem.barcode.replace('RET-', ''), // Extract real batch ID
            customer: formData.customer,
            quantitySold: Number(formData.quantity),
            pricePerPlantlet: Number(formData.price),
            date: today
        });

        await db.inventoryItems.update(inventoryItem.inventoryId, {
            quantity: inventoryItem.quantity - Number(formData.quantity)
        });

        await db.inventoryTransactions.add({
            inventoryId: inventoryItem.inventoryId,
            quantityChange: -Number(formData.quantity),
            type: 'Stock usage',
            date: today,
            user: 'Sales Admin',
            reason: 'Plantlet Sale',
            notes: `Sold to ${formData.customer}`
        });

        setShowSaleForm(false);
        setFormData({ batchId: '', customer: '', quantity: 0, price: 0 });
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>Plantlet Sales</h1>
                    <p className="text-light">Manage and record the sale of sorted plantlets.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowSaleForm(true)}><Plus size={18} /> New Sale</button>
            </div>

            <div className="table-responsive card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Batch ID</th>
                            <th>Customer</th>
                            <th>Quantity</th>
                            <th>Price/Plantlet</th>
                            <th>Total Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sales.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>No sales recorded yet.</td></tr>
                        ) : (
                            sales.slice().reverse().map(s => (
                                <tr key={s.id}>
                                    <td>{s.date.split('T')[0]}</td>
                                    <td><strong>{s.batchId}</strong></td>
                                    <td>{s.customer}</td>
                                    <td>{s.quantitySold}</td>
                                    <td>UGX {s.pricePerPlantlet.toLocaleString()}</td>
                                    <td><strong>UGX {(s.quantitySold * s.pricePerPlantlet).toLocaleString()}</strong></td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showSaleForm && (
                <div className="modal-overlay">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h2>Record New Sale</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowSaleForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaleSubmit}>
                            <div className="form-group">
                                <label className="form-label">Select Available Clone Batch *</label>
                                <select required className="form-input" value={formData.batchId} onChange={e => setFormData({ ...formData, batchId: e.target.value })}>
                                    <option value="" disabled>Select plantlets...</option>
                                    {availableInventory.map(item => (
                                        <option key={item.inventoryId} value={item.inventoryId}>
                                            {item.name} ({item.quantity} available)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Customer Name *</label>
                                <input required type="text" className="form-input" value={formData.customer} onChange={e => setFormData({ ...formData, customer: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Quantity Sold *</label>
                                    <input required type="number" min="1" className="form-input" value={formData.quantity || ''} onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Price per Plantlet (UGX) *</label>
                                    <input required type="number" min="0" className="form-input" value={formData.price || ''} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} />
                                </div>
                            </div>

                            <div style={{ background: 'var(--color-background)', padding: '1rem', borderRadius: '4px', marginBottom: '1rem', textAlign: 'right' }}>
                                <strong>Total Revenue: </strong>
                                UGX {((Number(formData.quantity) || 0) * (Number(formData.price) || 0)).toLocaleString()}
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Confirm Sale</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;


import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, CloneBatch, CloneStageHistory } from '../db';
import { Sprout, Plus, ArrowRight, Activity, Search, X } from 'lucide-react';
import './CloneProduction.css';
import { format } from 'date-fns';

const CloneProduction = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStage, setFilterStage] = useState('All');
    const [showObtainForm, setShowObtainForm] = useState(false);
    const [advancingBatch, setAdvancingBatch] = useState<CloneBatch | null>(null);

    // Form states
    const [obtainFormData, setObtainFormData] = useState({ variety: '', sourceFarm: '', sourceMotherPlant: '', quantity: 0, person: '', notes: '' });
    const [advanceFormData, setAdvanceFormData] = useState({ chamberOrSection: '', currentQuantity: 0, healthy: 0, weak: 0, lost: 0, notes: '', retained: 0, sale: 0, rejected: 0, rejectedReason: '' });

    const batches = useLiveQuery(() => db.cloneBatches.toArray()) || [];

    const filteredBatches = batches.filter(batch => {
        const matchesSearch = batch.batchId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            batch.variety.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStage = filterStage === 'All' || batch.currentStage === filterStage;
        return matchesSearch && matchesStage;
    });

    const handleObtainSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newId = `GSF-CLONE-${(batches.length + 1).toString().padStart(4, '0')}`;
        const today = new Date().toISOString();

        await db.cloneBatches.add({
            batchId: newId,
            variety: obtainFormData.variety,
            sourceFarm: obtainFormData.sourceFarm,
            sourceMotherPlant: obtainFormData.sourceMotherPlant,
            dateObtained: today,
            originalQuantity: Number(obtainFormData.quantity),
            currentQuantity: Number(obtainFormData.quantity),
            personResponsible: obtainFormData.person,
            notes: obtainFormData.notes,
            currentStage: 'Obtained'
        });

        await db.cloneStageHistory.add({
            batchId: newId,
            stageName: 'Obtained',
            startDate: today,
            quantityEntering: Number(obtainFormData.quantity),
        });

        await db.activityLogs.add({ user: 'System', action: 'Created', module: 'Clone', recordIdentifier: newId, date: today, description: 'Obtained cuttings' });

        setShowObtainForm(false);
        setObtainFormData({ variety: '', sourceFarm: '', sourceMotherPlant: '', quantity: 0, person: '', notes: '' });
    };

    const handleAdvanceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!advancingBatch) return;

        let nextStage: any = '';
        let quantityEntering = 0;

        const today = new Date().toISOString();

        if (advancingBatch.currentStage === 'Obtained') {
            nextStage = 'Humid Chamber';
            quantityEntering = Number(advanceFormData.currentQuantity);
        } else if (advancingBatch.currentStage === 'Humid Chamber') {
            nextStage = 'Hardening';
            quantityEntering = Number(advanceFormData.currentQuantity);
        } else if (advancingBatch.currentStage === 'Hardening') {
            nextStage = 'Ready for Sorting';
            quantityEntering = advancingBatch.currentQuantity;
        } else if (advancingBatch.currentStage === 'Ready for Sorting') {
            const total = Number(advanceFormData.retained) + Number(advanceFormData.sale) + Number(advanceFormData.rejected);
            if (total !== advancingBatch.currentQuantity) {
                alert(`Validation Error: Retained (${advanceFormData.retained}) + Sale (${advanceFormData.sale}) + Rejected (${advanceFormData.rejected}) must equal Total (${advancingBatch.currentQuantity}). Current sum is ${total}.`);
                return;
            }
            nextStage = 'Sorted';

            // Record Sort
            await db.plantletSortings.add({
                batchId: advancingBatch.batchId,
                date: today,
                totalQuantity: advancingBatch.currentQuantity,
                retainedQuantity: Number(advanceFormData.retained),
                forSaleQuantity: Number(advanceFormData.sale),
                rejectedQuantity: Number(advanceFormData.rejected),
                notes: advanceFormData.notes
            });

            // Create inventory items automatically for Retained and Sale
            if (Number(advanceFormData.retained) > 0) {
                await db.inventoryItems.add({
                    inventoryId: `INV-RET-${advancingBatch.batchId}`,
                    name: `Retained Plantlets: ${advancingBatch.variety}`,
                    category: 'Planting materials',
                    barcode: `RET-${advancingBatch.batchId}`,
                    brand: 'G$S Internal',
                    unit: 'Plantlet',
                    quantity: Number(advanceFormData.retained),
                    minStockLevel: 0,
                    supplier: 'Internal',
                    purchasePrice: 0,
                    purchaseDate: today,
                    location: 'Nursery A',
                    status: 'Active'
                });
            }
        }

        // Update current history end date
        const lastHistory = await db.cloneStageHistory.where({ batchId: advancingBatch.batchId }).reverse().first();
        if (lastHistory && lastHistory.id) {
            await db.cloneStageHistory.update(lastHistory.id, { endDate: today });
        }

        if (nextStage !== 'Sorted' && nextStage !== 'Ready for Sorting') {
            await db.cloneStageHistory.add({
                batchId: advancingBatch.batchId,
                stageName: nextStage,
                startDate: today,
                quantityEntering,
                chamberOrSection: advanceFormData.chamberOrSection,
                notes: advanceFormData.notes
            });
        }

        await db.cloneBatches.update(advancingBatch.batchId, {
            currentStage: nextStage,
            currentQuantity: nextStage === 'Sorted' ? 0 : (nextStage === 'Ready for Sorting' ? advancingBatch.currentQuantity : quantityEntering)
        });

        await db.activityLogs.add({ user: 'System', action: 'Stage Advance', module: 'Clone', recordIdentifier: advancingBatch.batchId, date: today, description: `Moved to ${nextStage}` });

        setAdvancingBatch(null);
        setAdvanceFormData({ chamberOrSection: '', currentQuantity: 0, healthy: 0, weak: 0, lost: 0, notes: '', retained: 0, sale: 0, rejected: 0, rejectedReason: '' });
    };

    return (
        <div className="clones-wrapper">
            <div className="header-action">
                <div>
                    <h1>Coffee Clone Production</h1>
                    <p className="text-light">Manage plantlet lifecycle from cuttings to sale.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowObtainForm(true)}><Plus size={18} /> Obtain Cuttings</button>
            </div>

            <div className="filters-bar card">
                <div className="search-group">
                    <Search size={18} className="text-light" />
                    <input
                        type="text"
                        placeholder="Search Batch ID or Variety..."
                        className="form-input search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    className="form-input filter-select"
                    value={filterStage}
                    onChange={(e) => setFilterStage(e.target.value)}
                >
                    <option value="All">All Stages</option>
                    <option value="Obtained">Obtained</option>
                    <option value="Humid Chamber">Humid Chamber</option>
                    <option value="Hardening">Hardening</option>
                    <option value="Ready for Sorting">Ready for Sorting</option>
                    <option value="Sorted">Sorted</option>
                </select>
            </div>

            <div className="batches-grid">
                {filteredBatches.map(batch => (
                    <div key={batch.batchId} className="card batch-card">
                        <div className="batch-header">
                            <h3>{batch.batchId}</h3>
                            <span className={`badge badge-primary`}>{batch.currentStage}</span>
                        </div>

                        <div className="batch-info">
                            <p><strong>Variety:</strong> {batch.variety}</p>
                            <p><strong>Source:</strong> {batch.sourceFarm}</p>
                            <p><strong>Quantity:</strong> {batch.currentQuantity} / {batch.originalQuantity}</p>
                            <p>
                                <strong>Survival Rate:</strong>{' '}
                                <span className={batch.currentQuantity / batch.originalQuantity >= 0.8 ? 'text-success' : 'text-danger'}>
                                    {((batch.currentQuantity / batch.originalQuantity) * 100).toFixed(1)}%
                                </span>
                            </p>
                        </div>

                        <div className="batch-timeline-preview">
                            <Activity size={16} className="text-light" /> Timeline Started: {format(new Date(batch.dateObtained), 'dd MMM yyyy')}
                        </div>

                        <div className="batch-actions">
                            {batch.currentStage !== 'Sorted' && (
                                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setAdvancingBatch(batch)}>
                                    {batch.currentStage === 'Ready for Sorting' ? 'Sort Batch' : 'Advance Stage'} <ArrowRight size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Obtain Cuttings Form Modal */}
            {showObtainForm && (
                <div className="modal-overlay">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h2>Obtain Cuttings</h2>
                            <button className="btn btn-secondary" onClick={() => setShowObtainForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleObtainSubmit}>
                            <div className="form-group">
                                <label className="form-label">Coffee clone/variety *</label>
                                <input required type="text" className="form-input" value={obtainFormData.variety} onChange={e => setObtainFormData({ ...obtainFormData, variety: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Source farm *</label>
                                <input required type="text" className="form-input" value={obtainFormData.sourceFarm} onChange={e => setObtainFormData({ ...obtainFormData, sourceFarm: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Source mother plant/block</label>
                                <input type="text" className="form-input" value={obtainFormData.sourceMotherPlant} onChange={e => setObtainFormData({ ...obtainFormData, sourceMotherPlant: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Quantity obtained *</label>
                                <input required type="number" min="1" className="form-input" value={obtainFormData.quantity || ''} onChange={e => setObtainFormData({ ...obtainFormData, quantity: Number(e.target.value) })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Supervisor / Responsible</label>
                                <input type="text" className="form-input" value={obtainFormData.person} onChange={e => setObtainFormData({ ...obtainFormData, person: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notes</label>
                                <textarea className="form-input" rows={2} value={obtainFormData.notes} onChange={e => setObtainFormData({ ...obtainFormData, notes: e.target.value })}></textarea>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save Batch</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Advance Stage Modal */}
            {advancingBatch && (
                <div className="modal-overlay">
                    <div className="modal-content card">
                        <div className="modal-header">
                            <h2>{advancingBatch.currentStage === 'Ready for Sorting' ? 'Sort Plantlets' : `Advance from ${advancingBatch.currentStage}`}</h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setAdvancingBatch(null)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAdvanceSubmit}>
                            <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }} className="text-light">
                                Batch: <strong>{advancingBatch.batchId}</strong> ({advancingBatch.currentQuantity} internally available)
                            </p>

                            {advancingBatch.currentStage === 'Obtained' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Entering Humid Chamber Quantity *</label>
                                        <input required max={advancingBatch.currentQuantity} min="0" type="number" className="form-input" value={advanceFormData.currentQuantity || ''} onChange={e => setAdvanceFormData({ ...advanceFormData, currentQuantity: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Chamber Number *</label>
                                        <input required type="text" className="form-input" value={advanceFormData.chamberOrSection} onChange={e => setAdvanceFormData({ ...advanceFormData, chamberOrSection: e.target.value })} />
                                    </div>
                                </>
                            )}

                            {advancingBatch.currentStage === 'Humid Chamber' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Survival Quantity entering Hardening *</label>
                                        <input required max={advancingBatch.currentQuantity} min="0" type="number" className="form-input" value={advanceFormData.currentQuantity || ''} onChange={e => setAdvanceFormData({ ...advanceFormData, currentQuantity: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Hardening Section *</label>
                                        <input required type="text" className="form-input" value={advanceFormData.chamberOrSection} onChange={e => setAdvanceFormData({ ...advanceFormData, chamberOrSection: e.target.value })} />
                                    </div>
                                </>
                            )}

                            {advancingBatch.currentStage === 'Hardening' && (
                                <>
                                    <p className="text-info" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                                        Readying for Sort. Hardening typically takes 2-3 weeks. No quantity deductions until Sort.
                                    </p>
                                </>
                            )}

                            {advancingBatch.currentStage === 'Ready for Sorting' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Retained Quantity</label>
                                        <input required min="0" type="number" className="form-input" value={advanceFormData.retained || ''} onChange={e => setAdvanceFormData({ ...advanceFormData, retained: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">For Sale Quantity</label>
                                        <input required min="0" type="number" className="form-input" value={advanceFormData.sale || ''} onChange={e => setAdvanceFormData({ ...advanceFormData, sale: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Rejected / Lost Quantity</label>
                                        <input required min="0" type="number" className="form-input" value={advanceFormData.rejected || ''} onChange={e => setAdvanceFormData({ ...advanceFormData, rejected: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Total Validated (Must equal {advancingBatch.currentQuantity})</label>
                                        <input readOnly type="number" className="form-input" value={(Number(advanceFormData.retained) || 0) + (Number(advanceFormData.sale) || 0) + (Number(advanceFormData.rejected) || 0)} style={{ background: '#eee' }} />
                                    </div>
                                </>
                            )}

                            <div className="form-group">
                                <label className="form-label">Supervisor Notes</label>
                                <textarea className="form-input" rows={2} value={advanceFormData.notes} onChange={e => setAdvanceFormData({ ...advanceFormData, notes: e.target.value })}></textarea>
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                                {advancingBatch.currentStage === 'Ready for Sorting' ? 'Finalize Sort' : 'Move to Next Stage'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CloneProduction;

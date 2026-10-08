import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    db,
    CloneBatch,
    CloneVarietyType
} from '../db';
import {
    Sprout,
    Plus,
    ArrowRight,
    Search,
    AlertTriangle,
    FileDown,
    X,
    Layers,
    ChevronRight
} from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { generateProductionBatchMasterPDF } from '../utils/pdfGenerator';
import { validateSortingReconciliation } from '../utils/calculations';
import './CloneProduction.css';

const ALLOWED_VARIETIES: CloneVarietyType[] = ['KR1', 'KR3', 'KR4', 'KR5', 'KR6', 'KR7', 'KR8', 'KR9', 'KR10', 'A', 'C', 'D'];

const CloneProduction: React.FC = () => {
    const [selectedVariety, setSelectedVariety] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Modals
    const [showNewBatchModal, setShowNewBatchModal] = useState(false);
    const [advancingBatch, setAdvancingBatch] = useState<CloneBatch | null>(null);

    // Form state for New Batch
    const [newBatchData, setNewBatchData] = useState({
        variety: 'KR1' as CloneVarietyType,
        sourceFarm: 'G&S Mother Garden Block A',
        sourceMotherPlant: 'Row 1 Plant 1',
        originalQuantity: 1000,
        notes: ''
    });

    // Form state for Stage Advancement
    const [advanceData, setAdvanceData] = useState({
        quantityReceived: 0,
        quantityRetained: 0, // In sorting: nursery stock; In other stages: advancing quantity
        quantityLost: 0,
        lossReason: 'Normal desiccation / fungal infection',
        responsibleWorker: 'John Kato',
        chamberNumber: 'Chamber 1',
        section: 'Section A',
        notes: ''
    });

    // Queries
    const batches = useLiveQuery(() => db.cloneBatches.toArray()) || [];
    const cuttings = useLiveQuery(() => db.productionCuttings.toArray()) || [];
    const humidChambers = useLiveQuery(() => db.productionHumidChamber.toArray()) || [];
    const firstHardenings = useLiveQuery(() => db.productionFirstHardening.toArray()) || [];
    const secondHardenings = useLiveQuery(() => db.productionSecondHardening.toArray()) || [];
    const sortings = useLiveQuery(() => db.productionSortings.toArray()) || [];

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Filter Batches
    const filteredBatches = batches
        .filter(b => {
            const matchesVariety = selectedVariety === 'all' || b.variety === selectedVariety;
            const matchesSearch =
                b.batchId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                b.variety.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (b.personResponsible || '').toLowerCase().includes(searchTerm.toLowerCase());
            return matchesVariety && matchesSearch;
        })
        .sort((a, b) =>
            b.dateObtained.localeCompare(a.dateObtained) ||
            (b.createdAt || '').localeCompare(a.createdAt || '') ||
            b.batchId.localeCompare(a.batchId)
        );

    // Handle Creating a New Batch
    const handleCreateBatch = async (e: React.FormEvent) => {
        e.preventDefault();

        const count = await db.cloneBatches.count();
        const batchId = `GSF-CLONE-${(count + 1).toString().padStart(4, '0')}`;
        const dateObtained = todayStr;

        const newBatch: CloneBatch = {
            batchId,
            variety: newBatchData.variety,
            sourceFarm: newBatchData.sourceFarm,
            sourceMotherPlant: newBatchData.sourceMotherPlant,
            dateObtained,
            originalQuantity: Number(newBatchData.originalQuantity),
            currentQuantity: Number(newBatchData.originalQuantity),
            currentStage: 'Cutting',
            notes: newBatchData.notes,
            createdAt: new Date().toISOString()
        };

        await db.cloneBatches.add(newBatch);

        // Add Stage 1 (Cutting) record
        await db.productionCuttings.add({
            batchId,
            variety: newBatchData.variety,
            datePrepared: dateObtained,
            initialQuantity: Number(newBatchData.originalQuantity),
            quantityTransferred: 0,
            quantityLost: 0,
            status: 'In Progress'
        });

        setShowNewBatchModal(false);
        setNewBatchData({
            variety: 'KR1',
            sourceFarm: 'G&S Mother Garden Block A',
            sourceMotherPlant: 'Row 1 Plant 1',
            originalQuantity: 1000,
            notes: ''
        });
    };

    // Open Advance Stage Modal
    const handleOpenAdvance = (batch: CloneBatch) => {
        setAdvancingBatch(batch);
        setAdvanceData({
            quantityReceived: batch.currentQuantity,
            quantityRetained: batch.currentQuantity,
            quantityLost: 0,
            lossReason: '',
            responsibleWorker: batch.personResponsible || '',
            chamberNumber: 'Chamber 1',
            section: 'Section A',
            notes: ''
        });
    };

    // Submit Stage Advancement
    const handleSubmitAdvance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!advancingBatch) return;

        const qtyReceived = Number(advanceData.quantityReceived);
        const qtyLost = Number(advanceData.quantityLost) || 0;

        if (advancingBatch.currentStage === 'Cutting') {
            const advancingQty = Number(advanceData.quantityRetained);
            if (advancingQty + qtyLost !== qtyReceived) {
                alert(`Reconciliation error: Advancing (${advancingQty}) + Lost (${qtyLost}) must equal Current (${qtyReceived}).`);
                return;
            }

            // Update Cutting record
            const cuttingRecord = cuttings.find(c => c.batchId === advancingBatch.batchId);
            if (cuttingRecord?.id) {
                await db.productionCuttings.update(cuttingRecord.id, {
                    quantityTransferred: advancingQty,
                    quantityLost: qtyLost,
                    lossReason: advanceData.lossReason,
                    status: 'Transferred'
                });
            }

            // Add Humid Chamber record (expected exit date exactly 1 month later)
            const entryDate = todayStr;
            const expectedCompletionDate = format(addMonths(new Date(), 1), 'yyyy-MM-dd');

            await db.productionHumidChamber.add({
                batchId: advancingBatch.batchId,
                variety: advancingBatch.variety,
                entryDate,
                expectedCompletionDate,
                quantityReceived: advancingQty,
                quantityRetained: advancingQty,
                quantityLost: 0,
                responsibleWorker: advanceData.responsibleWorker,
                chamberNumber: advanceData.chamberNumber,
                status: 'In Chamber'
            });

            // Update batch
            await db.cloneBatches.update(advancingBatch.batchId, {
                currentStage: 'Humid Chamber',
                currentQuantity: advancingQty
            });

        } else if (advancingBatch.currentStage === 'Humid Chamber') {
            const advancingQty = Number(advanceData.quantityRetained);
            if (advancingQty + qtyLost !== qtyReceived) {
                alert(`Reconciliation error: Advancing to 1st Hardening (${advancingQty}) + Lost (${qtyLost}) must equal Current (${qtyReceived}).`);
                return;
            }

            // Update Chamber record
            const chamberRecord = humidChambers.find(h => h.batchId === advancingBatch.batchId);
            if (chamberRecord?.id) {
                await db.productionHumidChamber.update(chamberRecord.id, {
                    actualExitDate: todayStr,
                    quantityRetained: advancingQty,
                    quantityLost: qtyLost,
                    lossReason: advanceData.lossReason,
                    status: 'Transferred'
                });
            }

            // Add 1st Hardening record
            await db.productionFirstHardening.add({
                batchId: advancingBatch.batchId,
                variety: advancingBatch.variety,
                entryDate: todayStr,
                quantityReceived: advancingQty,
                quantityRetained: advancingQty,
                quantityLost: 0,
                responsibleWorker: advanceData.responsibleWorker,
                section: advanceData.section,
                status: 'In Hardening'
            });

            // Update batch
            await db.cloneBatches.update(advancingBatch.batchId, {
                currentStage: 'First Hardening',
                currentQuantity: advancingQty
            });

        } else if (advancingBatch.currentStage === 'First Hardening') {
            const advancingQty = Number(advanceData.quantityRetained);
            if (advancingQty + qtyLost !== qtyReceived) {
                alert(`Reconciliation error: Advancing to 2nd Hardening (${advancingQty}) + Lost (${qtyLost}) must equal Current (${qtyReceived}).`);
                return;
            }

            const h1Record = firstHardenings.find(h => h.batchId === advancingBatch.batchId);
            if (h1Record?.id) {
                await db.productionFirstHardening.update(h1Record.id, {
                    completionDate: todayStr,
                    quantityRetained: advancingQty,
                    quantityLost: qtyLost,
                    lossReason: advanceData.lossReason,
                    status: 'Transferred'
                });
            }

            // Add 2nd Hardening record
            await db.productionSecondHardening.add({
                batchId: advancingBatch.batchId,
                variety: advancingBatch.variety,
                entryDate: todayStr,
                quantityReceived: advancingQty,
                quantityRetained: advancingQty,
                quantityLost: 0,
                responsibleWorker: advanceData.responsibleWorker,
                section: advanceData.section,
                status: 'In Hardening'
            });

            await db.cloneBatches.update(advancingBatch.batchId, {
                currentStage: 'Second Hardening',
                currentQuantity: advancingQty
            });

        } else if (advancingBatch.currentStage === 'Second Hardening') {
            const advancingQty = Number(advanceData.quantityRetained);
            if (advancingQty + qtyLost !== qtyReceived) {
                alert(`Reconciliation error: Advancing to Sorting (${advancingQty}) + Lost (${qtyLost}) must equal Current (${qtyReceived}).`);
                return;
            }

            const h2Record = secondHardenings.find(h => h.batchId === advancingBatch.batchId);
            if (h2Record?.id) {
                await db.productionSecondHardening.update(h2Record.id, {
                    completionDate: todayStr,
                    quantityRetained: advancingQty,
                    quantityLost: qtyLost,
                    lossReason: advanceData.lossReason,
                    status: 'Transferred'
                });
            }

            await db.cloneBatches.update(advancingBatch.batchId, {
                currentStage: 'Sorting',
                currentQuantity: advancingQty
            });

        } else if (advancingBatch.currentStage === 'Sorting') {
            // Sorting reconciliation: Quantity Received = Retained Quantity + Lost Quantity.
            const retained = Number(advanceData.quantityRetained);
            const lost = Number(advanceData.quantityLost);

            const recon = validateSortingReconciliation(qtyReceived, retained, lost);
            if (!recon.isValid) {
                alert(`Reconciliation error: Received (${qtyReceived}) must equal Retained (${retained}) + Lost (${lost}). Difference: ${recon.difference}`);
                return;
            }

            // Add Sorting record
            await db.productionSortings.add({
                batchId: advancingBatch.batchId,
                variety: advancingBatch.variety,
                sortingDate: todayStr,
                quantityReceived: qtyReceived,
                retainedQuantity: retained,
                lostQuantity: lost,
                totalValidatedQuantity: recon.totalValidated,
                responsibleWorker: advanceData.responsibleWorker,
                notes: advanceData.notes,
                status: 'Validated'
            });

            // Mark batch as Completed in sorting
            await db.cloneBatches.update(advancingBatch.batchId, {
                currentStage: 'Completed',
                currentQuantity: recon.totalValidated
            });
        }

        setAdvancingBatch(null);
    };

    return (
        <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Sprout size={28} color="var(--color-primary)" /> Coffee Clone 5-Stage Production
                    </h1>
                    <p className="text-light" style={{ margin: '0.25rem 0 0 0' }}>
                        Track Robusta clone nursery propagation: Cuttings → Humid Chamber → 1st Hardening → 2nd Hardening → Sorting.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => generateProductionBatchMasterPDF(batches, humidChambers, sortings)}
                    >
                        <FileDown size={18} /> Download Production PDF
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowNewBatchModal(true)}>
                        <Plus size={18} /> New Clone Batch
                    </button>
                </div>
            </div>

            {/* Visual Pipeline Bar */}
            <div className="card clones-pipeline" style={{ padding: '1rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={20} color="var(--color-primary)" />
                        <span style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>Propagation Stages:</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="badge" style={{ backgroundColor: '#e2e8f0', color: '#334155' }}>1. Cutting</span>
                        <ChevronRight size={16} color="#94a3b8" />
                        <span className="badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>2. Humid Chamber (1 Mo)</span>
                        <ChevronRight size={16} color="#94a3b8" />
                        <span className="badge" style={{ backgroundColor: '#fef08a', color: '#854d0e' }}>3. 1st Hardening</span>
                        <ChevronRight size={16} color="#94a3b8" />
                        <span className="badge" style={{ backgroundColor: '#f3e8ff', color: '#6b21a8' }}>4. 2nd Hardening</span>
                        <ChevronRight size={16} color="#94a3b8" />
                        <span className="badge" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>5. Sorting</span>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 240px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                    <input
                        type="text"
                        placeholder="Search batch ID, variety, or responsible worker..."
                        className="form-input"
                        style={{ paddingLeft: '2.25rem' }}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#475569' }}>Variety:</label>
                    <select
                        className="form-input"
                        style={{ width: 'auto' }}
                        value={selectedVariety}
                        onChange={e => setSelectedVariety(e.target.value)}
                    >
                        <option value="all">All Varieties</option>
                        {ALLOWED_VARIETIES.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Batches Master Table */}
            <div className="table-responsive card desktop-only">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Batch ID</th>
                            <th>Variety</th>
                            <th>Current Stage</th>
                            <th>Initial Qty</th>
                            <th>Current Qty</th>
                            <th>Responsible Worker</th>
                            <th>Date Started</th>
                            <th>Chamber / Due Date</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredBatches.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                                    No clone batches found.
                                </td>
                            </tr>
                        ) : (
                            filteredBatches.map(batch => {
                                const chamber = humidChambers.find(h => h.batchId === batch.batchId);
                                const isOverdue = !!(chamber && chamber.status === 'In Chamber' && chamber.expectedCompletionDate && chamber.expectedCompletionDate < todayStr);

                                return (
                                    <tr key={batch.batchId}>
                                        <td>
                                            <strong style={{ color: 'var(--color-primary-dark)' }}>{batch.batchId}</strong>
                                        </td>
                                        <td>
                                            <span style={{ padding: '0.2rem 0.5rem', backgroundColor: '#dbeafe', color: '#1e40af', borderRadius: '4px', fontWeight: 700, fontSize: '0.8rem' }}>
                                                {batch.variety}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                backgroundColor:
                                                    batch.currentStage === 'Cutting' ? '#f1f5f9' :
                                                    batch.currentStage === 'Humid Chamber' ? '#e0f2fe' :
                                                    batch.currentStage === 'First Hardening' ? '#fef08a' :
                                                    batch.currentStage === 'Second Hardening' ? '#f3e8ff' :
                                                    batch.currentStage === 'Sorting' ? '#fed7aa' : '#dcfce7',
                                                color:
                                                    batch.currentStage === 'Cutting' ? '#334155' :
                                                    batch.currentStage === 'Humid Chamber' ? '#0369a1' :
                                                    batch.currentStage === 'First Hardening' ? '#854d0e' :
                                                    batch.currentStage === 'Second Hardening' ? '#6b21a8' :
                                                    batch.currentStage === 'Sorting' ? '#9a3412' : '#166534'
                                            }}>
                                                {batch.currentStage}
                                            </span>
                                        </td>
                                        <td>{batch.originalQuantity.toLocaleString()}</td>
                                        <td><strong>{batch.currentQuantity.toLocaleString()}</strong></td>
                                        <td>{batch.personResponsible || '-'}</td>
                                        <td>{batch.dateObtained}</td>
                                        <td>
                                            {batch.currentStage === 'Humid Chamber' && chamber ? (
                                                <div style={{ fontSize: '0.8rem' }}>
                                                    <div>Due: {chamber.expectedCompletionDate}</div>
                                                    {isOverdue && (
                                                        <span style={{ color: '#b91c1c', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <AlertTriangle size={12} /> Overdue for Hardening
                                                        </span>
                                                    )}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {batch.currentStage !== 'Completed' && (
                                                <button
                                                    className="btn btn-primary"
                                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                                    onClick={() => handleOpenAdvance(batch)}
                                                >
                                                    Advance <ArrowRight size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="clone-batch-cards">
                {filteredBatches.length === 0 ? (
                    <div className="card empty-state">
                        No clone batches found.
                    </div>
                ) : (
                    filteredBatches.map(batch => {
                        const chamber = humidChambers.find(h => h.batchId === batch.batchId);
                        const isOverdue = !!(chamber && chamber.status === 'In Chamber' && chamber.expectedCompletionDate && chamber.expectedCompletionDate < todayStr);
                        const stageStyle = batch.currentStage === 'Cutting' ? { backgroundColor: '#f1f5f9', color: '#334155' } :
                            batch.currentStage === 'Humid Chamber' ? { backgroundColor: '#e0f2fe', color: '#0369a1' } :
                            batch.currentStage === 'First Hardening' ? { backgroundColor: '#fef08a', color: '#854d0e' } :
                            batch.currentStage === 'Second Hardening' ? { backgroundColor: '#f3e8ff', color: '#6b21a8' } :
                            batch.currentStage === 'Sorting' ? { backgroundColor: '#fed7aa', color: '#9a3412' } :
                            { backgroundColor: '#dcfce7', color: '#166534' };

                        return (
                            <article key={batch.batchId} className="card clone-batch-card">
                                <div className="clone-batch-card-header">
                                    <div>
                                        <strong className="clone-batch-id">{batch.batchId}</strong>
                                        <span className="clone-variety-badge">{batch.variety}</span>
                                    </div>
                                    <span className="badge clone-batch-stage" style={stageStyle}>{batch.currentStage}</span>
                                </div>

                                <div className="clone-batch-quantities">
                                    <div>
                                        <span className="text-light">Initial quantity</span>
                                        <strong>{batch.originalQuantity.toLocaleString()}</strong>
                                    </div>
                                    <div>
                                        <span className="text-light">Current quantity</span>
                                        <strong>{batch.currentQuantity.toLocaleString()}</strong>
                                    </div>
                                </div>

                                <dl className="clone-batch-details">
                                    <div>
                                        <dt>Responsible worker</dt>
                                        <dd>{batch.personResponsible || '-'}</dd>
                                    </div>
                                    <div>
                                        <dt>Date started</dt>
                                        <dd>{batch.dateObtained}</dd>
                                    </div>
                                    {batch.currentStage === 'Humid Chamber' && chamber && (
                                        <div>
                                            <dt>Chamber / due date</dt>
                                            <dd>
                                                {chamber.chamberNumber} · {chamber.expectedCompletionDate}
                                                {isOverdue && (
                                                    <span className="clone-overdue">
                                                        <AlertTriangle size={14} /> Overdue for hardening
                                                    </span>
                                                )}
                                            </dd>
                                        </div>
                                    )}
                                </dl>

                                {batch.currentStage !== 'Completed' && (
                                    <button
                                        className="btn btn-primary clone-advance-button"
                                        onClick={() => handleOpenAdvance(batch)}
                                    >
                                        Advance <ArrowRight size={16} />
                                    </button>
                                )}
                            </article>
                        );
                    })
                )}
            </div>

            {/* Modal: New Batch */}
            {showNewBatchModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '520px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Sprout size={22} color="var(--color-primary)" /> Register New Coffee Clone Batch
                            </h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setShowNewBatchModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateBatch} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Clone Variety *</label>
                                    <select
                                        className="form-input"
                                        value={newBatchData.variety}
                                        onChange={e => setNewBatchData({ ...newBatchData, variety: e.target.value as CloneVarietyType })}
                                    >
                                        {ALLOWED_VARIETIES.map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Initial Quantity (Cuttings) *</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        min="1"
                                        required
                                        value={newBatchData.originalQuantity}
                                        onChange={e => setNewBatchData({ ...newBatchData, originalQuantity: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Source Mother Garden *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        required
                                        value={newBatchData.sourceFarm}
                                        onChange={e => setNewBatchData({ ...newBatchData, sourceFarm: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Mother Bush / Row Identifier</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={newBatchData.sourceMotherPlant}
                                        onChange={e => setNewBatchData({ ...newBatchData, sourceMotherPlant: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Batch Notes</label>
                                <textarea
                                    className="form-input"
                                    rows={2}
                                    value={newBatchData.notes}
                                    onChange={e => setNewBatchData({ ...newBatchData, notes: e.target.value })}
                                />
                            </div>

                            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowNewBatchModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Create Batch
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Stage Advancement */}
            {advancingBatch && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ maxWidth: '580px', width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ArrowRight size={22} color="var(--color-primary)" />
                                Advance Batch: {advancingBatch.batchId} ({advancingBatch.variety})
                            </h2>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem', border: 'none' }} onClick={() => setAdvancingBatch(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitAdvance} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ padding: '0.75rem', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '0.85rem' }}>
                                <div><strong>Current Stage:</strong> {advancingBatch.currentStage}</div>
                                <div><strong>Total Quantity Entering:</strong> {advancingBatch.currentQuantity.toLocaleString()} plants</div>
                            </div>

                            {/* Stage-specific fields */}
                            {advancingBatch.currentStage === 'Sorting' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                                        Sorting Reconciliation Form:
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Retained (Nursery Stock) *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            min="0"
                                            required
                                            value={advanceData.quantityRetained}
                                            onChange={e => setAdvanceData({ ...advanceData, quantityRetained: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Quantity Lost / Culled *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            min="0"
                                            required
                                            value={advanceData.quantityLost}
                                            onChange={e => setAdvanceData({ ...advanceData, quantityLost: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Quantity Advancing *</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            min="1"
                                            max={advancingBatch.currentQuantity}
                                            required
                                            value={advanceData.quantityRetained}
                                            onChange={e => setAdvanceData({ ...advanceData, quantityRetained: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Quantity Lost (Mortality)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            min="0"
                                            value={advanceData.quantityLost}
                                            onChange={e => setAdvanceData({ ...advanceData, quantityLost: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            )}

                            {Number(advanceData.quantityLost) > 0 && (
                                <div className="form-group">
                                    <label className="form-label">Loss / Culling Reason</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="e.g. Desiccation, damping-off fungus, physical damage"
                                        value={advanceData.lossReason}
                                        onChange={e => setAdvanceData({ ...advanceData, lossReason: e.target.value })}
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Responsible Worker</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    required
                                    value={advanceData.responsibleWorker}
                                    onChange={e => setAdvanceData({ ...advanceData, responsibleWorker: e.target.value })}
                                />
                            </div>

                            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setAdvancingBatch(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Confirm Stage Advancement
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CloneProduction;

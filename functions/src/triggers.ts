import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { NotificationEventProcessor } from './eventProcessor';
import {
    getAdminRecipients,
    getManagerRecipients,
    getFarmPreferences,
    verifyActorIdentity
} from './roles';
import {
    buildManagerEntryTemplate,
    buildNurseryUpdateTemplate,
    buildInventoryAlertTemplate,
    buildAdminAlertTemplate,
    formatUGX
} from './templates';

/**
 * -------------------------------------------------------------
 * 1. SALES & REVENUE TRIGGER
 * Trigger: `salesOrders/{orderId}` onWrite
 * -------------------------------------------------------------
 */
export function createSalesOrderTrigger(db: admin.firestore.Firestore, processor: NotificationEventProcessor) {
    return functions.firestore
        .document('salesOrders/{orderId}')
        .onWrite(async (change, context) => {
            const orderId = context.params.orderId;
            const before = change.before.exists ? change.before.data() : null;
            const after = change.after.exists ? change.after.data() : null;

            if (!after) return; // Order deleted

            const prefs = await getFarmPreferences(db);
            if (!prefs.enableEmailAlerts || !prefs.notifySalesEvents) return;

            const isNew = !before;
            const adminRecipients = await getAdminRecipients(db);
            const actor = await verifyActorIdentity(db, after.createdByUid || after.userId, after.createdByName || after.salesAgent);

            if (isNew) {
                // New completed sale entry
                const eventId = NotificationEventProcessor.generateEventId(['sale_create', orderId, after.totalAmount]);
                const totalFormatted = formatUGX(after.totalAmount || 0);

                const template = buildManagerEntryTemplate({
                    module: 'Sales & Revenue',
                    action: 'Created',
                    recordId: after.invoiceNumber || orderId,
                    actorName: actor.name,
                    actorEmail: actor.email,
                    summary: `New coffee clone sale registered for ${after.customerName || 'Customer'}. Total: ${totalFormatted}`,
                    details: {
                        'Invoice / Receipt #': after.invoiceNumber || orderId,
                        'Customer Name': after.customerName || 'N/A',
                        'Customer Contact': after.customerPhone || 'N/A',
                        'Clone Variety': after.cloneType || after.variety || 'Elite Robusta',
                        'Quantity': `${Number(after.quantity || 0).toLocaleString()} plantlets`,
                        'Total Settlement': totalFormatted,
                        'Payment Status': after.paymentStatus || 'Paid in Full'
                    },
                    portalPath: '/sales'
                });

                await processor.processEvent({
                    eventId,
                    eventType: 'SALES_ORDER_CREATED',
                    category: 'Sales & Revenue',
                    subject: `[G&S Sales] New Order Settled #${after.invoiceNumber || orderId} (${totalFormatted})`,
                    htmlContent: template.html,
                    textContent: template.text,
                    recipients: adminRecipients,
                    severity: 'info',
                    recordId: orderId,
                    module: 'Sales',
                    inApp: {
                        type: 'Manager Entry',
                        title: `New Sale: ${after.invoiceNumber || orderId}`,
                        message: `Customer: ${after.customerName || 'Walk-in'} | Qty: ${after.quantity || 0} | ${totalFormatted}`,
                        recipientLabel: 'Farm Administration'
                    }
                });
            } else {
                // Check for cancellation or status change
                const wasCancelled = !before.isCancelled && (after.isCancelled || after.status === 'Cancelled' || after.cancelled);
                if (wasCancelled) {
                    const eventId = NotificationEventProcessor.generateEventId(['sale_cancelled', orderId]);
                    const template = buildManagerEntryTemplate({
                        module: 'Sales & Revenue',
                        action: 'Cancelled',
                        recordId: after.invoiceNumber || orderId,
                        actorName: actor.name,
                        actorEmail: actor.email,
                        summary: `Sale invoice #${after.invoiceNumber || orderId} has been CANCELLED or marked Void.`,
                        details: {
                            'Invoice #': after.invoiceNumber || orderId,
                            'Original Total': formatUGX(after.totalAmount || 0),
                            'Customer': after.customerName || 'N/A',
                            'Cancellation Reason': after.cancelReason || 'Manager voided transaction'
                        },
                        portalPath: '/sales'
                    });

                    await processor.processEvent({
                        eventId,
                        eventType: 'SALES_ORDER_CANCELLED',
                        category: 'Sales Alert',
                        subject: `[G&S Alert] Sale #${after.invoiceNumber || orderId} CANCELLED`,
                        htmlContent: template.html,
                        textContent: template.text,
                        recipients: adminRecipients,
                        severity: 'warning',
                        recordId: orderId,
                        module: 'Sales',
                        inApp: {
                            type: 'Manager Entry',
                            title: `Sale Cancelled: ${after.invoiceNumber || orderId}`,
                            message: `Invoice #${after.invoiceNumber || orderId} was cancelled by ${actor.name}.`,
                            recipientLabel: 'Farm Administration'
                        }
                    });
                }
            }
        });
}

/**
 * -------------------------------------------------------------
 * 2. INVENTORY ITEMS TRIGGER (New Items, Low-Stock, Expiry)
 * Trigger: `inventoryItems/{itemId}` onWrite
 * -------------------------------------------------------------
 */
export function createInventoryItemTrigger(db: admin.firestore.Firestore, processor: NotificationEventProcessor) {
    return functions.firestore
        .document('inventoryItems/{itemId}')
        .onWrite(async (change, context) => {
            const itemId = context.params.itemId;
            const before = change.before.exists ? change.before.data() : null;
            const after = change.after.exists ? change.after.data() : null;

            if (!after) return; // Item deleted

            const prefs = await getFarmPreferences(db);
            if (!prefs.enableEmailAlerts || !prefs.notifyInventoryEvents) return;

            const isNew = !before;
            const adminRecipients = await getAdminRecipients(db);
            const managerRecipients = await getManagerRecipients(db);
            const allStakeholders = [...adminRecipients, ...managerRecipients];

            const actor = await verifyActorIdentity(db, after.updatedByUid || after.createdByUid, after.updatedByName || after.recordedBy);

            // 1. New Inventory Item added
            if (isNew) {
                const eventId = NotificationEventProcessor.generateEventId(['inventory_create', itemId]);
                const template = buildManagerEntryTemplate({
                    module: 'Inventory Management',
                    action: 'Created',
                    recordId: itemId,
                    actorName: actor.name,
                    actorEmail: actor.email,
                    summary: `New stock catalogue item "${after.name}" added to inventory.`,
                    details: {
                        'Item Name': after.name,
                        'Category': after.category || 'General Farm Supplies',
                        'Initial Stock': `${after.quantity || 0} ${after.unit || 'units'}`,
                        'Reorder Threshold': `${after.minQuantity || 10} ${after.unit || 'units'}`,
                        'Unit Cost': after.unitCost ? formatUGX(after.unitCost) : 'N/A'
                    },
                    portalPath: '/inventory'
                });

                await processor.processEvent({
                    eventId,
                    eventType: 'INVENTORY_ITEM_CREATED',
                    category: 'Inventory Management',
                    subject: `[G&S Inventory] New Item Registered: ${after.name}`,
                    htmlContent: template.html,
                    textContent: template.text,
                    recipients: adminRecipients,
                    severity: 'info',
                    recordId: itemId,
                    module: 'Inventory',
                    inApp: {
                        type: 'Manager Entry',
                        title: `New Stock Item: ${after.name}`,
                        message: `Initial stock: ${after.quantity || 0} ${after.unit || 'units'}. Added by ${actor.name}.`,
                        recipientLabel: 'Farm Administration'
                    }
                });
            }

            // 2. Low-Stock Detection (Notify Admin & Managers)
            const currentQty = Number(after.quantity || 0);
            const minQty = Number(after.minQuantity || 10);
            if (prefs.notifyLowStock && currentQty <= minQty) {
                const eventId = NotificationEventProcessor.generateEventId(['low_stock', itemId, currentQty]);
                const isCritical = currentQty === 0;

                const template = buildInventoryAlertTemplate({
                    alertType: isCritical ? 'Critical Stock Out' : 'Low Stock',
                    itemName: after.name || itemId,
                    category: after.category,
                    currentQuantity: currentQty,
                    threshold: minQty,
                    unit: after.unit || 'units',
                    recommendedAction: isCritical
                        ? 'Immediate emergency restocking required. Farm operations or nursery may be stalled.'
                        : 'Submit replenishment purchase requisition to prevent stock-out.'
                });

                await processor.processEvent({
                    eventId,
                    eventType: isCritical ? 'CRITICAL_STOCK_OUT' : 'INVENTORY_LOW_STOCK',
                    category: 'Inventory Alert',
                    subject: `[G&S Alert] ${isCritical ? 'CRITICAL STOCKOUT' : 'Low Stock Warning'}: ${after.name} (${currentQty} ${after.unit || 'units'} left)`,
                    htmlContent: template.html,
                    textContent: template.text,
                    recipients: allStakeholders,
                    severity: isCritical ? 'critical' : 'warning',
                    recordId: itemId,
                    module: 'Inventory',
                    inApp: {
                        type: 'Inventory Low',
                        title: `${isCritical ? 'Critical Stock Out' : 'Low Stock'}: ${after.name}`,
                        message: `Only ${currentQty} ${after.unit || 'units'} remaining (Reorder minimum: ${minQty}).`,
                        recipientLabel: 'Management & Stores'
                    }
                });
            }

            // 3. Expiry Warning Detection
            if (after.expiryDate) {
                const expiryTime = new Date(after.expiryDate).getTime();
                const nowTime = Date.now();
                const daysUntilExpiry = Math.ceil((expiryTime - nowTime) / (1000 * 60 * 60 * 24));

                if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
                    const eventId = NotificationEventProcessor.generateEventId(['inventory_expiry', itemId, after.expiryDate]);
                    const template = buildInventoryAlertTemplate({
                        alertType: 'Expiring Soon',
                        itemName: after.name || itemId,
                        category: after.category,
                        currentQuantity: currentQty,
                        unit: after.unit || 'units',
                        expiryDate: `${after.expiryDate} (${daysUntilExpiry} days remaining)`,
                        recommendedAction: 'Prioritize utilization before expiration date to prevent inventory loss.'
                    });

                    await processor.processEvent({
                        eventId,
                        eventType: 'INVENTORY_EXPIRING_SOON',
                        category: 'Inventory Alert',
                        subject: `[G&S Alert] Expiry Warning: ${after.name} expires in ${daysUntilExpiry} days`,
                        htmlContent: template.html,
                        textContent: template.text,
                        recipients: allStakeholders,
                        severity: 'warning',
                        recordId: itemId,
                        module: 'Inventory',
                        inApp: {
                            type: 'Inventory Low',
                            title: `Item Expiring Soon: ${after.name}`,
                            message: `Expires on ${after.expiryDate} (${daysUntilExpiry} days left).`,
                            recipientLabel: 'Management & Stores'
                        }
                    });
                }
            }
        });
}

/**
 * -------------------------------------------------------------
 * 3. NURSERY CLONE BATCHES TRIGGER
 * Trigger: `cloneBatches/{batchId}` onWrite
 * -------------------------------------------------------------
 */
export function createCloneBatchTrigger(db: admin.firestore.Firestore, processor: NotificationEventProcessor) {
    return functions.firestore
        .document('cloneBatches/{batchId}')
        .onWrite(async (change, context) => {
            const batchId = context.params.batchId;
            const before = change.before.exists ? change.before.data() : null;
            const after = change.after.exists ? change.after.data() : null;

            if (!after) return;

            const prefs = await getFarmPreferences(db);
            if (!prefs.enableEmailAlerts || !prefs.notifyNurseryEvents) return;

            const isNew = !before;
            const adminRecipients = await getAdminRecipients(db);
            const actor = await verifyActorIdentity(db, after.updatedByUid || after.createdByUid, after.recordedBy || after.createdByName);

            if (isNew) {
                // New Nursery Batch created
                const eventId = NotificationEventProcessor.generateEventId(['nursery_batch_create', batchId]);
                const template = buildNurseryUpdateTemplate({
                    batchId,
                    variety: after.variety || after.cloneType || 'Elite Robusta',
                    stage: after.stage || 'Rooting / Chamber',
                    action: 'Batch Enrollment & Propagation Initiated',
                    quantityEntered: after.initialQuantity || after.quantity || 0,
                    availableStock: after.currentQuantity || after.quantity || 0,
                    recordedBy: actor.name,
                    notes: after.notes || `Mother Garden Block: ${after.motherGardenBlock || 'Block A'}`
                });

                await processor.processEvent({
                    eventId,
                    eventType: 'NURSERY_BATCH_CREATED',
                    category: 'Nursery Operations',
                    subject: `[G&S Nursery] New Propagation Batch: ${batchId} (${after.variety || 'Robusta'})`,
                    htmlContent: template.html,
                    textContent: template.text,
                    recipients: adminRecipients,
                    severity: 'info',
                    recordId: batchId,
                    module: 'Nursery',
                    inApp: {
                        type: 'Manager Entry',
                        title: `New Nursery Batch: ${batchId}`,
                        message: `Variety: ${after.variety || 'Robusta'} | Initial: ${after.initialQuantity || 0} plantlets. Entered by ${actor.name}.`,
                        recipientLabel: 'Farm Administration'
                    }
                });
            } else {
                // Check for stage transition or significant mortality updates
                const stageChanged = before.stage !== after.stage && after.stage;
                const lossesIncreased = (after.lossCount || 0) > (before.lossCount || 0);

                if (stageChanged || lossesIncreased) {
                    const eventId = NotificationEventProcessor.generateEventId(['nursery_batch_update', batchId, after.stage, after.lossCount]);
                    const actionLabel = stageChanged
                        ? `Stage Transitioned: ${before.stage || 'Initial'} &rarr; ${after.stage}`
                        : `Mortality Recorded (+${(after.lossCount || 0) - (before.lossCount || 0)} losses)`;

                    const template = buildNurseryUpdateTemplate({
                        batchId,
                        variety: after.variety || 'Elite Robusta',
                        stage: after.stage || 'Propagation Stage',
                        action: actionLabel,
                        quantityEntered: after.initialQuantity,
                        retainedCount: after.currentQuantity,
                        lossCount: after.lossCount,
                        availableStock: after.currentQuantity,
                        recordedBy: actor.name,
                        notes: after.notes
                    });

                    await processor.processEvent({
                        eventId,
                        eventType: 'NURSERY_STAGE_UPDATED',
                        category: 'Nursery Operations',
                        subject: `[G&S Nursery] Batch ${batchId} Update: ${actionLabel}`,
                        htmlContent: template.html,
                        textContent: template.text,
                        recipients: adminRecipients,
                        severity: lossesIncreased ? 'warning' : 'info',
                        recordId: batchId,
                        module: 'Nursery',
                        inApp: {
                            type: 'Manager Entry',
                            title: `Nursery Update: ${batchId}`,
                            message: `${actionLabel}. Current available: ${after.currentQuantity || 0} plantlets.`,
                            recipientLabel: 'Farm Administration'
                        }
                    });
                }
            }
        });
}

/**
 * -------------------------------------------------------------
 * 4. WORKER REGISTRY TRIGGER
 * Trigger: `workers/{workerId}` onWrite
 * -------------------------------------------------------------
 */
export function createWorkerTrigger(db: admin.firestore.Firestore, processor: NotificationEventProcessor) {
    return functions.firestore
        .document('workers/{workerId}')
        .onWrite(async (change, context) => {
            const workerId = context.params.workerId;
            const before = change.before.exists ? change.before.data() : null;
            const after = change.after.exists ? change.after.data() : null;

            if (!after) return;

            const prefs = await getFarmPreferences(db);
            if (!prefs.enableEmailAlerts || !prefs.notifyWorkerEvents) return;

            const isNew = !before;
            const adminRecipients = await getAdminRecipients(db);
            const actor = await verifyActorIdentity(db, after.updatedByUid || after.createdByUid, after.updatedByName);

            if (isNew) {
                // New worker registered
                const eventId = NotificationEventProcessor.generateEventId(['worker_registered', workerId]);
                const template = buildManagerEntryTemplate({
                    module: 'Worker Management',
                    action: 'Created',
                    recordId: workerId,
                    actorName: actor.name,
                    actorEmail: actor.email,
                    summary: `New farm worker enrolled: ${after.fullName} (${workerId}). Farm Card Issued: ${after.farmCardNumber || 'Auto-generated'}.`,
                    details: {
                        'Worker ID': workerId,
                        'Full Name': after.fullName,
                        'Assigned Role / Dept': `${after.role || 'General Field'} / ${after.department || 'Operations'}`,
                        'Farm Card Number': after.farmCardNumber || 'N/A',
                        'Card Issued Date': after.cardIssuedDate || after.dateJoined || 'Today',
                        'National ID (NIN)': after.nin || 'On file',
                        'Phone Contact': after.phone || 'N/A'
                    },
                    portalPath: '/workers'
                });

                await processor.processEvent({
                    eventId,
                    eventType: 'WORKER_REGISTERED',
                    category: 'Worker Management',
                    subject: `[G&S HR] New Worker Enrolled: ${after.fullName} (${workerId})`,
                    htmlContent: template.html,
                    textContent: template.text,
                    recipients: adminRecipients,
                    severity: 'info',
                    recordId: workerId,
                    module: 'Workers',
                    inApp: {
                        type: 'Manager Entry',
                        title: `New Worker: ${after.fullName}`,
                        message: `ID: ${workerId} | Role: ${after.role || 'Staff'}. Enrolled by ${actor.name}.`,
                        recipientLabel: 'Farm Administration'
                    }
                });
            } else {
                // Check if worker was deactivated
                const wasDeactivated = before.status !== 'Inactive' && after.status === 'Inactive';
                if (wasDeactivated) {
                    const eventId = NotificationEventProcessor.generateEventId(['worker_deactivated', workerId]);
                    const template = buildManagerEntryTemplate({
                        module: 'Worker Management',
                        action: 'Updated',
                        recordId: workerId,
                        actorName: actor.name,
                        actorEmail: actor.email,
                        summary: `Worker ${after.fullName} (${workerId}) was DEACTIVATED / Terminated.`,
                        details: {
                            'Worker ID': workerId,
                            'Worker Name': after.fullName,
                            'Previous Status': before.status || 'Active',
                            'New Status': 'Inactive',
                            'Deactivation Reason': after.statusChangeReason || 'Administrative update'
                        },
                        portalPath: '/workers'
                    });

                    await processor.processEvent({
                        eventId,
                        eventType: 'WORKER_DEACTIVATED',
                        category: 'Worker Management',
                        subject: `[G&S HR] Worker Deactivated: ${after.fullName} (${workerId})`,
                        htmlContent: template.html,
                        textContent: template.text,
                        recipients: adminRecipients,
                        severity: 'warning',
                        recordId: workerId,
                        module: 'Workers',
                        inApp: {
                            type: 'Manager Entry',
                            title: `Worker Deactivated: ${after.fullName}`,
                            message: `Status updated to Inactive by ${actor.name}.`,
                            recipientLabel: 'Farm Administration'
                        }
                    });
                }
            }
        });
}

/**
 * -------------------------------------------------------------
 * 5. ATTENDANCE & OVERTIME APPROVAL TRIGGER
 * Trigger: `attendance/{attendanceKey}` onWrite
 * -------------------------------------------------------------
 */
export function createAttendanceTrigger(db: admin.firestore.Firestore, processor: NotificationEventProcessor) {
    return functions.firestore
        .document('attendance/{attendanceKey}')
        .onWrite(async (change, context) => {
            const attendanceKey = context.params.attendanceKey;
            const before = change.before.exists ? change.before.data() : null;
            const after = change.after.exists ? change.after.data() : null;

            if (!after) return;

            const prefs = await getFarmPreferences(db);
            if (!prefs.enableEmailAlerts) return;

            // Check if overtime was approved or manual attendance correction was applied
            const wasOtApproved = !before?.overtimeApproved && after.overtimeApproved === true && (after.overtimeHours || 0) > 0;
            const wasManualCorrection = !before?.manualCorrection && after.manualCorrection === true;

            if (wasOtApproved || wasManualCorrection) {
                const adminRecipients = await getAdminRecipients(db);
                const managerRecipients = await getManagerRecipients(db);
                const eventId = NotificationEventProcessor.generateEventId([
                    wasOtApproved ? 'ot_approved' : 'attendance_correction',
                    attendanceKey,
                    after.overtimeHours
                ]);

                const actionTitle = wasOtApproved ? 'Overtime Approved' : 'Manual Attendance Correction';
                const summaryText = wasOtApproved
                    ? `Overtime approved for ${after.workerName || after.workerId}: ${after.overtimeHours} hours on ${after.date}. Reason: ${after.overtimeReason || 'Shift Extension'}`
                    : `Attendance record manually adjusted for ${after.workerName || after.workerId} on ${after.date}.`;

                const template = buildManagerEntryTemplate({
                    module: 'Attendance & Overtime',
                    action: 'Approved',
                    recordId: attendanceKey,
                    actorName: after.approvedByName || after.recordedBy || 'Farm Supervisor',
                    summary: summaryText,
                    details: {
                        'Worker Name': after.workerName || 'N/A',
                        'Worker ID': after.workerId || 'N/A',
                        'Attendance Date': after.date,
                        'Overtime Hours': after.overtimeHours ? `${after.overtimeHours} hrs` : '0',
                        'Check-In': after.timeIn || 'N/A',
                        'Check-Out': after.timeOut || 'N/A'
                    },
                    portalPath: '/overtime'
                });

                await processor.processEvent({
                    eventId,
                    eventType: wasOtApproved ? 'OVERTIME_APPROVED' : 'ATTENDANCE_CORRECTED',
                    category: 'Attendance & HR',
                    subject: `[G&S HR] ${actionTitle}: ${after.workerName || after.workerId} (${after.date})`,
                    htmlContent: template.html,
                    textContent: template.text,
                    recipients: [...adminRecipients, ...managerRecipients],
                    severity: 'info',
                    recordId: attendanceKey,
                    module: 'Attendance',
                    inApp: {
                        type: 'Manager Entry',
                        title: actionTitle,
                        message: summaryText,
                        recipientLabel: 'Farm Management'
                    }
                });
            }
        });
}

/**
 * -------------------------------------------------------------
 * 6. SYSTEM SETTINGS & NOTIFICATION CONFIGURATION AUDIT
 * Trigger: `settings/general` onWrite
 * -------------------------------------------------------------
 */
export function createSettingsAuditTrigger(db: admin.firestore.Firestore, processor: NotificationEventProcessor) {
    return functions.firestore
        .document('settings/general')
        .onWrite(async (change, context) => {
            const before = change.before.exists ? change.before.data() : null;
            const after = change.after.exists ? change.after.data() : null;

            if (!before || !after) return; // Initial setup or deletion

            // Detect if sensitive settings changed (e.g. notification emails, contact emails, admin access)
            const emailsChanged = before.notificationEmails !== after.notificationEmails || before.contactEmail !== after.contactEmail;
            const scheduleChanged = before.attendanceTimeInEnd !== after.attendanceTimeInEnd || before.timezone !== after.timezone;

            if (emailsChanged || scheduleChanged) {
                const adminRecipients = await getAdminRecipients(db);
                const eventId = NotificationEventProcessor.generateEventId(['settings_audit', Date.now()]);

                const template = buildAdminAlertTemplate({
                    title: 'Security Notice: System Configuration Modified',
                    message: `An authorized user updated core farm system preferences and notification routing. Review the changes below to ensure authorization:`,
                    category: 'Security & Settings Audit',
                    details: {
                        'Notification Recipient(s)': after.notificationEmails || 'None',
                        'Timezone': after.timezone || 'Africa/Kampala',
                        'Morning Cutoff (Time-In End)': after.attendanceTimeInEnd || '07:20',
                        'Modified At': new Date().toLocaleString('en-GB')
                    },
                    actionLabel: 'Review Settings in Portal',
                    actionUrl: 'https://gs-coffee-3d022.web.app/settings'
                });

                await processor.processEvent({
                    eventId,
                    eventType: 'SETTINGS_MODIFIED',
                    category: 'Security Alert',
                    subject: '[G&S Security] Farm Settings & Notification Routing Updated',
                    htmlContent: template.html,
                    textContent: template.text,
                    recipients: adminRecipients,
                    severity: 'warning',
                    recordId: 'general',
                    module: 'Settings',
                    inApp: {
                        type: 'General',
                        title: 'Settings Updated',
                        message: 'Notification preferences or attendance schedule were updated.',
                        recipientLabel: 'Super Administrators'
                    }
                });
            }
        });
}

/**
 * -------------------------------------------------------------
 * 7. NURSERY PRODUCTION STAGES TRIGGER (Humid Chamber, Hardening, Sorting)
 * Trigger: `productionHumidChamber/{id}`, `productionFirstHardening/{id}`, `productionSecondHardening/{id}`, `productionSortings/{id}`
 * -------------------------------------------------------------
 */
export function createNurseryStageTrigger(
    db: admin.firestore.Firestore,
    processor: NotificationEventProcessor,
    stageName: 'Humid Chamber' | 'First Hardening' | 'Second Hardening' | 'Sorting',
    collectionName: string
) {
    return functions.firestore
        .document(`${collectionName}/{docId}`)
        .onCreate(async (snap, context) => {
            const data = snap.data();
            if (!data) return;

            const prefs = await getFarmPreferences(db);
            if (!prefs.enableEmailAlerts || !prefs.notifyNurseryEvents) return;

            const adminRecipients = await getAdminRecipients(db);
            const managerRecipients = await getManagerRecipients(db);
            const actor = await verifyActorIdentity(db, data.createdByUid, data.recordedBy || data.createdByName);

            const batchId = data.batchId || context.params.docId;
            const eventId = NotificationEventProcessor.generateEventId(['nursery_stage_entry', collectionName, context.params.docId]);

            const template = buildNurseryUpdateTemplate({
                batchId,
                variety: data.variety || 'Elite Robusta Clones',
                stage: stageName,
                action: `${stageName} Progress Logged`,
                quantityEntered: data.quantityIn || data.totalIn || data.quantity,
                retainedCount: data.retained || data.healthyCount || data.retainedCount,
                lossCount: data.losses || data.lossCount || 0,
                availableStock: data.availableStock || data.currentQuantity,
                recordedBy: actor.name,
                notes: data.notes || data.observations
            });

            await processor.processEvent({
                eventId,
                eventType: 'NURSERY_STAGE_RECORDED',
                category: 'Nursery Operations',
                subject: `[G&S Nursery] ${stageName} Logged: Batch ${batchId}`,
                htmlContent: template.html,
                textContent: template.text,
                recipients: [...adminRecipients, ...managerRecipients],
                severity: (data.losses || data.lossCount || 0) > 20 ? 'warning' : 'info',
                recordId: context.params.docId,
                module: 'Nursery',
                inApp: {
                    type: 'Manager Entry',
                    title: `Nursery ${stageName}: ${batchId}`,
                    message: `Logged by ${actor.name}. Healthy: ${data.retained || data.healthyCount || 'N/A'}, Losses: ${data.losses || 0}.`,
                    recipientLabel: 'Farm Management'
                }
            });
        });
}

/**
 * -------------------------------------------------------------
 * 8. PAYROLL RUNS & APPROVAL TRIGGER
 * Trigger: `payrollRecords/{recordId}` onWrite
 * -------------------------------------------------------------
 */
export function createPayrollRecordTrigger(db: admin.firestore.Firestore, processor: NotificationEventProcessor) {
    return functions.firestore
        .document('payrollRecords/{recordId}')
        .onWrite(async (change, context) => {
            const recordId = context.params.recordId;
            const before = change.before.exists ? change.before.data() : null;
            const after = change.after.exists ? change.after.data() : null;

            if (!after) return;

            const prefs = await getFarmPreferences(db);
            if (!prefs.enableEmailAlerts || !prefs.notifyPayrollEvents) return;

            const wasApproved = !before?.status && (after.status === 'Approved' || after.status === 'Paid');
            const statusChanged = before?.status !== after.status && (after.status === 'Approved' || after.status === 'Paid');

            if (wasApproved || statusChanged) {
                const adminRecipients = await getAdminRecipients(db);
                const managerRecipients = await getManagerRecipients(db);
                const eventId = NotificationEventProcessor.generateEventId(['payroll_approved', recordId, after.status]);

                const template = buildManagerEntryTemplate({
                    module: 'Payroll & Compensation',
                    action: after.status === 'Paid' ? 'Completed' : 'Approved',
                    recordId: `${after.payrollMonth} - ${after.workerName || after.workerId}`,
                    actorName: after.approvedByName || after.recordedBy || 'Farm Management',
                    summary: `Payroll record for ${after.workerName || after.workerId} (${after.payrollMonth}) is marked ${after.status}. Net Pay: ${formatUGX(after.netPay || 0)}.`,
                    details: {
                        'Worker Name': after.workerName || 'N/A',
                        'Worker ID': after.workerId || 'N/A',
                        'Payroll Month': after.payrollMonth,
                        'Base Salary': formatUGX(after.baseSalary || 0),
                        'Overtime Compensation': formatUGX(after.overtimePay || 0),
                        'Deductions': `-${formatUGX(after.deductions || 0)}`,
                        'Net Pay Disbursement': formatUGX(after.netPay || 0),
                        'Payment Status': after.status
                    },
                    portalPath: '/payroll'
                });

                await processor.processEvent({
                    eventId,
                    eventType: 'PAYROLL_STATUS_UPDATED',
                    category: 'Payroll & Finance',
                    subject: `[G&S Payroll] ${after.status}: ${after.workerName || after.workerId} (${after.payrollMonth})`,
                    htmlContent: template.html,
                    textContent: template.text,
                    recipients: [...adminRecipients, ...managerRecipients],
                    severity: 'info',
                    recordId,
                    module: 'Payroll',
                    inApp: {
                        type: 'Manager Entry',
                        title: `Payroll ${after.status}: ${after.workerName}`,
                        message: `Month: ${after.payrollMonth} | Net: ${formatUGX(after.netPay || 0)}.`,
                        recipientLabel: 'Farm Administration'
                    }
                });
            }
        });
}


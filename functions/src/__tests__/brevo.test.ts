import test from 'node:test';
import assert from 'node:assert/strict';
import { BrevoService } from '../brevoService';
import {
    buildAdminAlertTemplate,
    buildMissedAttendanceTemplate,
    buildPayrollRunTemplate,
    buildWorkerPayslipTemplate,
    buildSalesInvoiceTemplate,
    buildInventoryAlertTemplate,
    buildReportDeliveryTemplate,
    escapeHtml,
    formatUGX
} from '../templates';

test('BrevoService constructor reads config options and reports status', () => {
    const service = new BrevoService({
        apiKey: 'test-api-key-1234567890',
        senderEmail: 'test@gsfarms.farm',
        senderName: 'Test Farm'
    });

    const status = service.getStatus();
    assert.equal(status.configured, true);
    assert.equal(status.senderEmail, 'test@gsfarms.farm');
    assert.equal(status.senderName, 'Test Farm');
});

test('BrevoService returns error when API key is missing', async () => {
    const service = new BrevoService({ apiKey: '' });
    const result = await service.sendEmail({
        to: 'manager@gsfarms.farm',
        subject: 'Test Subject',
        htmlContent: '<p>Test Message</p>'
    });

    assert.equal(result.success, false);
    assert.equal(result.code, 'MISSING_API_KEY');
});

test('BrevoService sendEmail validates recipients', async () => {
    const service = new BrevoService({ apiKey: 'mock-valid-api-key-12345' });
    
    const result1 = await service.sendEmail({
        to: [],
        subject: 'Test',
        htmlContent: '<p>Test</p>'
    });
    assert.equal(result1.success, false);
    assert.equal(result1.code, 'INVALID_RECIPIENT');

    const result2 = await service.sendEmail({
        to: ['not-an-email'],
        subject: 'Test',
        htmlContent: '<p>Test</p>'
    });
    assert.equal(result2.success, false);
    assert.equal(result2.code, 'INVALID_RECIPIENT');
});

test('BrevoService handles successful 201 response with mock fetch', async () => {
    const service = new BrevoService({ apiKey: 'xkeysib-mock-key-123456' });

    const originalFetch = globalThis.fetch;
    try {
        let capturedUrl = '';
        let capturedHeaders: Record<string, string> = {};
        let capturedBody: any = null;

        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            capturedUrl = url;
            capturedHeaders = (init?.headers as Record<string, string>) || {};
            capturedBody = init?.body ? JSON.parse(init.body as string) : null;

            return {
                ok: true,
                status: 201,
                json: async () => ({ messageId: '<mock-message-id@brevo.com>' }),
                text: async () => JSON.stringify({ messageId: '<mock-message-id@brevo.com>' })
            } as any;
        }) as any;

        const result = await service.sendEmail({
            to: 'manager@gsfarms.farm',
            subject: 'Quarterly Audit Notice',
            htmlContent: '<p>Audit Scheduled</p>',
            textContent: 'Audit Scheduled'
        });

        assert.equal(result.success, true);
        assert.equal(result.messageId, '<mock-message-id@brevo.com>');
        assert.equal(capturedUrl, 'https://api.brevo.com/v3/smtp/email');
        assert.equal(capturedHeaders['api-key'], 'xkeysib-mock-key-123456');
        assert.equal(capturedHeaders['content-type'], 'application/json');
        assert.equal(capturedBody.to[0].email, 'manager@gsfarms.farm');
        assert.equal(capturedBody.subject, 'Quarterly Audit Notice');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('BrevoService properly handles 401 Unauthorized', async () => {
    const service = new BrevoService({ apiKey: 'bad-key-123456789' });
    const originalFetch = globalThis.fetch;

    try {
        globalThis.fetch = (async () => {
            return {
                ok: false,
                status: 401,
                json: async () => ({ code: 'unauthorized', message: 'Key not found' }),
                text: async () => '{"code":"unauthorized","message":"Key not found"}'
            } as any;
        }) as any;

        const result = await service.sendEmail({
            to: 'manager@gsfarms.farm',
            subject: 'Test',
            htmlContent: '<p>Hi</p>'
        });

        assert.equal(result.success, false);
        assert.equal(result.code, 'UNAUTHORIZED');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('BrevoService properly handles 429 Rate Limit', async () => {
    const service = new BrevoService({ apiKey: 'any-key-123456789' });
    const originalFetch = globalThis.fetch;

    try {
        globalThis.fetch = (async () => {
            return {
                ok: false,
                status: 429,
                json: async () => ({ code: 'rate_limited', message: 'Too many requests' }),
                text: async () => '{"code":"rate_limited","message":"Too many requests"}'
            } as any;
        }) as any;

        const result = await service.sendEmail({
            to: 'manager@gsfarms.farm',
            subject: 'Test',
            htmlContent: '<p>Hi</p>'
        });

        assert.equal(result.success, false);
        assert.equal(result.code, 'RATE_LIMITED');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('Template generator escapes HTML entities to prevent injection', () => {
    const dangerousInput = '<script>alert("xss")</script> & "quotes"';
    const escaped = escapeHtml(dangerousInput);
    assert.ok(!escaped.includes('<script>'));
    assert.ok(escaped.includes('&lt;script&gt;'));
    assert.ok(escaped.includes('&amp;'));
    assert.ok(escaped.includes('&quot;'));
});

test('formatUGX formats numbers into currency correctly', () => {
    assert.equal(formatUGX(1500000), 'UGX 1,500,000');
    assert.equal(formatUGX(0), 'UGX 0');
});

test('Templates render valid HTML and text structures', () => {
    // 1. Admin Alert
    const adminTpl = buildAdminAlertTemplate({
        title: 'New Data Added',
        category: 'Operations',
        message: 'A new record was entered by manager.',
        details: { Farm: 'Plot 4', Workers: 12 }
    });
    assert.ok(adminTpl.html.includes('New Data Added'));
    assert.ok(adminTpl.text.includes('Operations'));

    // 2. Sales Invoice
    const salesTpl = buildSalesInvoiceTemplate({
        invoiceNumber: 'INV-2026-001',
        orderDate: '2026-10-28',
        customerName: 'Kampala Coffee Roasters',
        customerPhone: '+256701234567',
        cloneType: 'KR-10 Elite Clone',
        quantity: 500,
        unitPrice: 2500,
        totalAmount: 1250000,
        amountPaid: 1250000,
        location: 'Mubende District'
    });
    assert.ok(salesTpl.html.includes('INV-2026-001'));
    assert.ok(salesTpl.html.includes('1,250,000'));
    assert.ok(salesTpl.text.includes('Kampala Coffee Roasters'));

    // 3. Payroll Run
    const payrollTpl = buildPayrollRunTemplate({
        payrollMonth: 'October 2026',
        totalWorkers: 45,
        totalGrossPay: 9500000,
        totalOvertimePay: 500000,
        totalDeductions: 200000,
        totalNetPay: 9800000,
        paymentStatusSummary: 'Paid in Full via Cash & Mobile Money'
    });
    assert.ok(payrollTpl.html.includes('9,800,000'));
    assert.ok(payrollTpl.text.includes('45'));

    // 4. Worker Payslip
    const payslipTpl = buildWorkerPayslipTemplate({
        workerName: 'John Mukasa',
        workerId: 'GSW-104',
        farmCardNumber: 'CARD-042',
        payrollMonth: 'October 2026',
        baseSalary: 280000,
        overtimeHours: 6,
        overtimePay: 42000,
        deductions: 10000,
        netPay: 312000,
        paymentMethod: 'Cash'
    });
    assert.ok(payslipTpl.html.includes('John Mukasa'));
    assert.ok(payslipTpl.html.includes('312,000'));

    // 5. Missed Attendance
    const missedTpl = buildMissedAttendanceTemplate({
        workerId: 'W-01',
        workerName: 'Alice N.',
        date: '2026-10-28',
        scheduledShift: 'Morning Shift',
        timeInWindow: '06:00 - 08:30 AM'
    });
    assert.ok(missedTpl.html.includes('Alice N.'));
    assert.ok(missedTpl.text.includes('06:00 - 08:30 AM'));

    // 6. Inventory Alert
    const invTpl = buildInventoryAlertTemplate({
        alertType: 'Low Stock',
        itemName: 'Rooting Hormone Powder',
        category: 'Agrochemicals',
        currentQuantity: 1.2,
        threshold: 5.0,
        unit: 'kg',
        recommendedAction: 'Reorder immediately from agro-dealer in Mubende.'
    });
    assert.ok(invTpl.html.includes('Rooting Hormone Powder'));
    assert.ok(invTpl.text.includes('Low Stock'));

    // 7. Report Delivery
    const reportTpl = buildReportDeliveryTemplate({
        reportName: 'Monthly Harvest & Clone Output Report',
        dateRange: 'October 1 - October 28, 2026',
        generatedBy: 'Brighton Kato (Superadmin)',
        summaryMetrics: { 'Total Clones': 15200, 'Mortality': '2.1%' }
    });
    assert.ok(reportTpl.html.includes('Monthly Harvest'));
    assert.ok(reportTpl.text.includes('Brighton Kato'));
});

// -------------------------------------------------------------
// NEW AUTOMATED NOTIFICATION & EVENT ARCHITECTURE TESTS
// -------------------------------------------------------------
import {
    buildManagerEntryTemplate,
    buildNurseryUpdateTemplate,
    buildBackgroundJobFailureTemplate
} from '../templates';
import {
    sanitizeEmail,
    parseEmailList,
    SUPER_ADMIN_EMAILS
} from '../roles';
import { NotificationEventProcessor } from '../eventProcessor';
import { getTimeInZone } from '../attendanceScheduler';

test('buildManagerEntryTemplate formats action, record ID, and actor details with escaping', () => {
    const tpl = buildManagerEntryTemplate({
        module: 'Nursery Management',
        action: 'Created',
        recordId: 'BATCH-2026-X1',
        actorName: 'John <Supervisor>',
        actorEmail: 'john@gsfarms.farm',
        summary: 'Propagated 5,000 new Robusta clone cuttings',
        details: {
            'Variety': 'Robusta Elite CWD-R',
            'Cuttings': 5000,
            'Block': 'Mother Garden Alpha'
        },
        portalPath: '/nursery'
    });

    assert.ok(tpl.html.includes('BATCH-2026-X1'));
    assert.ok(tpl.html.includes('John &lt;Supervisor&gt;')); // Escaped HTML
    assert.ok(!tpl.html.includes('<Supervisor>'));          // XSS prevented
    assert.ok(tpl.html.includes('Robusta Elite CWD-R'));
    assert.ok(tpl.text.includes('BATCH-2026-X1'));
    assert.ok(tpl.text.includes('/nursery'));
});

test('buildNurseryUpdateTemplate calculates loss and retained amounts accurately', () => {
    const tpl = buildNurseryUpdateTemplate({
        batchId: 'BATCH-402',
        variety: 'Robusta Clone 1',
        stage: 'First Hardening',
        action: 'Grading and Sorting Completed',
        quantityEntered: 3000,
        retainedCount: 2850,
        lossCount: 150,
        availableStock: 2850,
        recordedBy: 'Joseph Okello (Field Manager)',
        notes: 'Minor root rot in tray 4'
    });

    assert.ok(tpl.html.includes('BATCH-402'));
    assert.ok(tpl.html.includes('2,850 plantlets'));
    assert.ok(tpl.html.includes('-150 plantlets'));
    assert.ok(tpl.text.includes('Loss: 150'));
    assert.ok(tpl.text.includes('Joseph Okello'));
});

test('buildBackgroundJobFailureTemplate displays failure metrics and recommended actions', () => {
    const tpl = buildBackgroundJobFailureTemplate({
        jobName: 'Attendance Deadline Scheduled Monitor',
        failureTime: '2026-10-28 07:35 EAT',
        errorMessage: 'Firestore deadline query timed out after 30000ms',
        affectedRecords: 'Workforce Attendance Logs',
        recommendedAction: 'Verify Cloud Functions connectivity and retry manual scan'
    });

    assert.ok(tpl.html.includes('Attendance Deadline Scheduled Monitor'));
    assert.ok(tpl.html.includes('Firestore deadline query timed out'));
    assert.ok(tpl.text.includes('Verify Cloud Functions'));
});

test('Email sanitization and parsing correctly extracts valid emails and discards junk', () => {
    assert.equal(sanitizeEmail('  brightonkato317@gmail.com  '), 'brightonkato317@gmail.com');
    assert.equal(sanitizeEmail('not-an-email'), null);
    assert.equal(sanitizeEmail(null), null);
    assert.equal(sanitizeEmail(''), null);

    const parsed = parseEmailList('admin@gsfarms.farm, manager@gsfarms.farm ; duplicate@gsfarms.farm, admin@gsfarms.farm ; invalid-email');
    assert.deepEqual(parsed, [
        'admin@gsfarms.farm',
        'manager@gsfarms.farm',
        'duplicate@gsfarms.farm'
    ]);
});

test('Super admin defaults are protected and include verified administrators', () => {
    assert.ok(SUPER_ADMIN_EMAILS.includes('gs.farms.ug@gmail.com'));
    assert.ok(SUPER_ADMIN_EMAILS.includes('brightonkato317@gmail.com'));
});

test('NotificationEventProcessor generates deterministic SHA256 event ID for idempotency', () => {
    const id1 = NotificationEventProcessor.generateEventId(['sale_create', 'INV-1001', 500000]);
    const id2 = NotificationEventProcessor.generateEventId(['sale_create', 'INV-1001', 500000]);
    const id3 = NotificationEventProcessor.generateEventId(['sale_create', 'INV-1002', 500000]);

    assert.equal(id1, id2);
    assert.notEqual(id1, id3);
    assert.equal(id1.length, 32);
});

test('NotificationEventProcessor prevents recursive notification loops on excluded collections', () => {
    assert.equal(NotificationEventProcessor.isExcludedCollection('mail'), true);
    assert.equal(NotificationEventProcessor.isExcludedCollection('mailLogs'), true);
    assert.equal(NotificationEventProcessor.isExcludedCollection('processedEvents'), true);
    assert.equal(NotificationEventProcessor.isExcludedCollection('notificationLogs'), true);
    assert.equal(NotificationEventProcessor.isExcludedCollection('notifications'), true);

    // Business collections MUST NOT be excluded
    assert.equal(NotificationEventProcessor.isExcludedCollection('salesOrders'), false);
    assert.equal(NotificationEventProcessor.isExcludedCollection('inventoryItems'), false);
    assert.equal(NotificationEventProcessor.isExcludedCollection('cloneBatches'), false);
    assert.equal(NotificationEventProcessor.isExcludedCollection('workers'), false);
});

test('getTimeInZone correctly extracts date and time in Uganda / EAT timezone', () => {
    const fixedDate = new Date('2026-10-28T04:20:00.000Z'); // 04:20 UTC = 07:20 EAT (UTC+3)
    const { dateStr, timeStr } = getTimeInZone(fixedDate, 'Africa/Kampala');

    assert.equal(dateStr, '2026-10-28');
    assert.equal(timeStr, '07:20');
});

test('NotificationEventProcessor duplicate suppression and in-app coordination with mock DB', async () => {
    const mockStore = new Map<string, any>();
    const mockDb: any = {
        collection: (colName: string) => ({
            doc: (docId: string) => ({
                get: async () => ({
                    exists: mockStore.has(`${colName}/${docId}`),
                    data: () => mockStore.get(`${colName}/${docId}`)
                }),
                set: async (val: any) => {
                    mockStore.set(`${colName}/${docId}`, val);
                },
                update: async (val: any) => {
                    const current = mockStore.get(`${colName}/${docId}`) || {};
                    mockStore.set(`${colName}/${docId}`, { ...current, ...val });
                }
            }),
            add: async (val: any) => {
                const autoId = `auto_${Date.now()}_${Math.random()}`;
                mockStore.set(`${colName}/${autoId}`, val);
                return { id: autoId };
            }
        })
    };

    const mockBrevo = new BrevoService({ apiKey: 'xkeysib-mock-123' });
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = (async () => ({
            ok: true,
            status: 201,
            json: async () => ({ messageId: '<mock-msg-999@brevo.com>' }),
            text: async () => JSON.stringify({ messageId: '<mock-msg-999@brevo.com>' })
        })) as any;

        const processor = new NotificationEventProcessor(mockDb, mockBrevo);

        const eventId = 'test_event_id_unique_123';
        // First run: Dispatches successfully
        const result1 = await processor.processEvent({
            eventId,
            eventType: 'SALES_ORDER_CREATED',
            category: 'Sales',
            subject: 'New Order',
            htmlContent: '<p>Order Created</p>',
            recipients: [{ email: 'admin@gsfarms.farm', name: 'Admin' }],
            inApp: {
                type: 'Manager Entry',
                title: 'New Order #1001',
                message: 'Manager entered new sale'
            }
        });

        assert.equal(result1.success, true);
        assert.equal(result1.messageId, '<mock-msg-999@brevo.com>');
        assert.equal(result1.skipped, undefined);

        // Verify stored in processedEvents with status ACCEPTED_BY_BREVO
        const savedEvent = mockStore.get(`processedEvents/${eventId}`);
        assert.ok(savedEvent);
        assert.equal(savedEvent.status, 'ACCEPTED_BY_BREVO');
        assert.equal(savedEvent.brevoMessageId, '<mock-msg-999@brevo.com>');

        // Second run with SAME eventId: Suppresses duplicate!
        const result2 = await processor.processEvent({
            eventId,
            eventType: 'SALES_ORDER_CREATED',
            category: 'Sales',
            subject: 'New Order',
            htmlContent: '<p>Order Created</p>',
            recipients: [{ email: 'admin@gsfarms.farm', name: 'Admin' }]
        });

        assert.equal(result2.success, true);
        assert.equal(result2.skipped, true);
        assert.equal(result2.reason, 'DUPLICATE_SUPPRESSED');
    } finally {
        globalThis.fetch = originalFetch;
    }
});


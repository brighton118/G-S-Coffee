# G&S Coffee Farm Management System - Brevo Email Service (Cloud Backend)

This directory contains the secure backend Firebase Cloud Functions powering Brevo (formerly Sendinblue) transactional emails for the **G&S Coffee Farm Management System**.

---

## 🔒 Security Architecture (Zero Secret Exposure)
- **`BREVO_API_KEY` is NEVER exposed to client-side bundles, GitHub, browser localStorage, or IndexedDB.**
- The client frontend triggers emails via authenticated HTTPS Callable functions (`sendBrevoEmail`, `getBrevoServiceStatus`) or writes queued mail documents to Cloud Firestore (`mail/{mailId}`).
- Only the server-side environment in Firebase Cloud Functions holds the secret key.

---

## 📁 Modules & Structure
- **[src/brevoService.ts](file:///d:/Downloads/G-S-Coffee-main/G-S-Coffee-main/functions/src/brevoService.ts)**: Core HTTP client calling Brevo SMTP v3 (`POST https://api.brevo.com/v3/smtp/email`). Supports recipient sanitization, attachments, timeout handling, and typed status codes (401, 402, 429).
- **[src/templates.ts](file:///d:/Downloads/G-S-Coffee-main/G-S-Coffee-main/functions/src/templates.ts)**: Branded, high-contrast, mobile-responsive HTML & plain-text templates with XSS escaping:
  1. Administrative & Manager Data Entry Alerts (`buildAdminAlertTemplate`)
  2. Missed Attendance Notifications (`buildMissedAttendanceTemplate`)
  3. Payroll Run Completion & Summary in UGX (`buildPayrollRunTemplate`)
  4. Worker Monthly Payslip Breakdown in UGX (`buildWorkerPayslipTemplate`)
  5. Sales Invoice & Customer Receipts in UGX (`buildSalesInvoiceTemplate`)
  6. Critical Inventory & Nursery Warnings (`buildInventoryAlertTemplate`)
  7. Official Farm Report Delivery (`buildReportDeliveryTemplate`)
- **[src/index.ts](file:///d:/Downloads/G-S-Coffee-main/G-S-Coffee-main/functions/src/index.ts)**:
  - `sendBrevoEmail`: Authenticated HTTPS Callable function.
  - `processMailQueue`: Firestore Trigger on `mail/{mailId}` (`onCreate`).
  - `getBrevoServiceStatus`: Authenticated HTTPS Callable function reporting backend status without revealing secrets.
- **[src/__tests__/brevo.test.ts](file:///d:/Downloads/G-S-Coffee-main/G-S-Coffee-main/functions/src/__tests__/brevo.test.ts)**: 9 unit tests verifying API mocking, payload generation, rate limiting, and template escaping.

---

## ⚙️ Environment Variables & Secrets Configuration

### 1. Local Development (`functions/.env`)
Copy `.env.example` to `functions/.env` and insert your Brevo credentials:
```bash
cp .env.example .env
```

```ini
BREVO_API_KEY=xkeysib-YOUR_REAL_BREVO_API_KEY
BREVO_SENDER_EMAIL=notifications@gsfarm.farm
BREVO_SENDER_NAME=G&S Coffee Farm Management System
ADMIN_NOTIFICATION_EMAIL=gs.farms.ug@gmail.com
FARM_PORTAL_URL=https://gs-coffee-3d022.web.app
```

> **Note**: Verify that `BREVO_SENDER_EMAIL` (e.g. `notifications@gsfarm.farm` or your verified email in Brevo) is added to your **Senders & IP** in the Brevo Dashboard.

### 2. Production Deployment (Firebase Secrets Manager)
To set `BREVO_API_KEY` securely in Firebase Cloud Functions:
```bash
firebase functions:secrets:set BREVO_API_KEY
```
When prompted, paste your Brevo API key.

---

## 🚀 Deployment Commands

### Build & Run Tests
```bash
cd functions
npm run build
npm test
```

### Deploy Functions Only
```bash
firebase deploy --only functions
```

### Deploy Entire Project (Functions + Hosting + Firestore Rules)
```bash
firebase deploy
```

---

## ✅ Operational Verification Checklist
1. **Admin Settings Test**: Navigate to **Settings > System & Notification Settings > Brevo (Sendinblue) Transactional Email Engine**.
2. **Controlled Test Dispatch**: Enter target email (e.g. `brightonkato317@gmail.com`) and click **Send Test**.
3. **Sales Receipt**: Record a cash sale in the **Sales** module with customer email to automatically dispatch the receipt.
4. **Payroll Summary**: Open **Payroll** and click **Email Month Summary (Brevo)** to deliver the executive payroll run report.
5. **Missed Attendance**: In **Attendance**, click **Alert Absences** to notify management of unrecorded clock-ins.

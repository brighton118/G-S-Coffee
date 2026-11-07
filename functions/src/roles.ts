import * as admin from 'firebase-admin';

export interface RecipientInfo {
    email: string;
    name?: string;
}

export interface FarmNotificationPreferences {
    enableEmailAlerts: boolean;
    timezone: string;
    attendanceTimeInStart: string;
    attendanceTimeInEnd: string;
    attendanceTimeOutStart: string;
    attendanceTimeOutEnd: string;
    notifyLowStock: boolean;
    notifyChamberOverdue: boolean;
    notifyPendingOvertime: boolean;
    notifyEODAttendance: boolean;
    notifyManagerEntry: boolean;
    notifyNurseryEvents: boolean;
    notifyInventoryEvents: boolean;
    notifySalesEvents: boolean;
    notifyWorkerEvents: boolean;
    notifyPayrollEvents: boolean;
    notifyAttendanceDeadlines: boolean;
}

export const SUPER_ADMIN_EMAILS: string[] = [
    'gs.farms.ug@gmail.com',
    'gsfarm@gmail.com',
    'brighton118@gmail.com',
    'brightonkato317@gmail.com'
];

/**
 * Validates and normalizes email strings
 */
export function sanitizeEmail(email: any): string | null {
    if (!email || typeof email !== 'string') return null;
    const clean = email.trim().toLowerCase();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(clean) ? clean : null;
}

/**
 * Parses comma or semicolon-separated email strings into sanitized recipient array
 */
export function parseEmailList(rawList?: string | string[]): string[] {
    if (!rawList) return [];
    const items = Array.isArray(rawList)
        ? rawList
        : rawList.split(/[,;\s]+/);

    const valid: string[] = [];
    for (const item of items) {
        const cleaned = sanitizeEmail(item);
        if (cleaned && !valid.includes(cleaned)) {
            valid.push(cleaned);
        }
    }
    return valid;
}

/**
 * Retrieve verified Administrator recipient list from Firestore settings and role collections
 */
export async function getAdminRecipients(db: admin.firestore.Firestore): Promise<RecipientInfo[]> {
    const recipientsMap = new Map<string, string>(); // email -> name

    try {
        // 1. Read configured notification emails in settings/general
        const settingsSnap = await db.collection('settings').doc('general').get();
        if (settingsSnap.exists) {
            const data = settingsSnap.data() || {};
            const configuredList = [
                ...parseEmailList(data.notificationEmails),
                ...parseEmailList(data.contactEmail),
                ...parseEmailList(data.adminEmail)
            ];
            for (const email of configuredList) {
                recipientsMap.set(email, data.contactPerson || 'Estate Administrator');
            }
        }

        // 2. Query users collection for active admins (case-insensitive role check)
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            if (u.active === false) return;
            const role = (u.role || '').toString().toLowerCase().trim();
            if (role === 'admin' || role === 'administrator' || role === 'super_admin' || role === 'owner') {
                const email = sanitizeEmail(u.email);
                if (email) {
                    recipientsMap.set(email, u.name || 'Farm Admin');
                }
            }
        });

        // 3. Query admins collection
        const adminsSnap = await db.collection('admins').get();
        adminsSnap.forEach(docSnap => {
            const a = docSnap.data();
            if (a.active === false) return;
            const email = sanitizeEmail(a.email);
            if (email) {
                recipientsMap.set(email, a.name || 'System Administrator');
            }
        });
    } catch (err) {
        console.warn('[Roles] Error querying admin recipients from Firestore:', err);
    }

    // 4. Always ensure Super Admins are included
    for (const superEmail of SUPER_ADMIN_EMAILS) {
        if (!recipientsMap.has(superEmail)) {
            recipientsMap.set(superEmail, 'Super Administrator');
        }
    }

    // 5. Environment variable fallback
    const envAdmin = sanitizeEmail(process.env.ADMIN_NOTIFICATION_EMAIL);
    if (envAdmin && !recipientsMap.has(envAdmin)) {
        recipientsMap.set(envAdmin, 'Farm Administrator');
    }

    return Array.from(recipientsMap.entries()).map(([email, name]) => ({ email, name }));
}

/**
 * Retrieve verified Manager recipient list from Firestore
 */
export async function getManagerRecipients(db: admin.firestore.Firestore): Promise<RecipientInfo[]> {
    const recipientsMap = new Map<string, string>(); // email -> name

    try {
        // 1. Check settings/general manager notification config
        const settingsSnap = await db.collection('settings').doc('general').get();
        if (settingsSnap.exists) {
            const data = settingsSnap.data() || {};
            const configuredList = parseEmailList(data.managerNotificationEmails);
            for (const email of configuredList) {
                recipientsMap.set(email, 'Farm Manager');
            }
        }

        // 2. Query users collection for active managers
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            if (u.active === false) return;
            const role = (u.role || '').toString().toLowerCase().trim();
            if (role.includes('manager') || role === 'supervisor' || role === 'clerk') {
                const email = sanitizeEmail(u.email);
                if (email) {
                    recipientsMap.set(email, u.name || 'Farm Manager');
                }
            }
        });

        // 3. Query managers collection
        const managersSnap = await db.collection('managers').get();
        managersSnap.forEach(docSnap => {
            const m = docSnap.data();
            if (m.active === false) return;
            const email = sanitizeEmail(m.email);
            if (email) {
                recipientsMap.set(email, m.name || 'Operations Manager');
            }
        });
    } catch (err) {
        console.warn('[Roles] Error querying manager recipients from Firestore:', err);
    }

    // Fallback: If no managers found, route to admins
    if (recipientsMap.size === 0) {
        return getAdminRecipients(db);
    }

    return Array.from(recipientsMap.entries()).map(([email, name]) => ({ email, name }));
}

/**
 * Retrieve all registered and active system recipients (Admins, Managers, Staff, Super Admins)
 * logged in or registered in our system.
 */
export async function getAllSystemRecipients(db: admin.firestore.Firestore): Promise<RecipientInfo[]> {
    const recipientsMap = new Map<string, string>(); // email -> name

    try {
        // 1. All active registered users in Firestore
        const usersSnap = await db.collection('users').get();
        usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            if (u.active === false) return;
            const email = sanitizeEmail(u.email);
            if (email) {
                recipientsMap.set(email, u.name || u.displayName || 'System User');
            }
        });

        // 2. Users in admins collection
        const adminsSnap = await db.collection('admins').get();
        adminsSnap.forEach(docSnap => {
            const a = docSnap.data();
            if (a.active === false) return;
            const email = sanitizeEmail(a.email);
            if (email) {
                recipientsMap.set(email, a.name || 'Administrator');
            }
        });

        // 3. Users in managers collection
        const managersSnap = await db.collection('managers').get();
        managersSnap.forEach(docSnap => {
            const m = docSnap.data();
            if (m.active === false) return;
            const email = sanitizeEmail(m.email);
            if (email) {
                recipientsMap.set(email, m.name || 'Manager');
            }
        });

        // 4. Configured emails in settings/general
        const settingsSnap = await db.collection('settings').doc('general').get();
        if (settingsSnap.exists) {
            const data = settingsSnap.data() || {};
            const configuredList = [
                ...parseEmailList(data.notificationEmails),
                ...parseEmailList(data.contactEmail),
                ...parseEmailList(data.adminEmail),
                ...parseEmailList(data.managerNotificationEmails)
            ];
            for (const email of configuredList) {
                if (!recipientsMap.has(email)) {
                    recipientsMap.set(email, data.contactPerson || 'Farm Management');
                }
            }
        }
    } catch (err) {
        console.warn('[Roles] Error querying all system recipients:', err);
    }

    // 5. Always include Super Admin emails
    for (const superEmail of SUPER_ADMIN_EMAILS) {
        if (!recipientsMap.has(superEmail)) {
            recipientsMap.set(superEmail, 'Super Administrator');
        }
    }

    return Array.from(recipientsMap.entries()).map(([email, name]) => ({ email, name }));
}

/**
 * Fetch farm notification preferences and schedule from settings/general
 */
export async function getFarmPreferences(db: admin.firestore.Firestore): Promise<FarmNotificationPreferences> {
    const defaults: FarmNotificationPreferences = {
        enableEmailAlerts: true,
        timezone: 'Africa/Kampala',
        attendanceTimeInStart: '07:00',
        attendanceTimeInEnd: '07:20',
        attendanceTimeOutStart: '14:00',
        attendanceTimeOutEnd: '14:20',
        notifyLowStock: true,
        notifyChamberOverdue: true,
        notifyPendingOvertime: true,
        notifyEODAttendance: true,
        notifyManagerEntry: true,
        notifyNurseryEvents: true,
        notifyInventoryEvents: true,
        notifySalesEvents: true,
        notifyWorkerEvents: true,
        notifyPayrollEvents: true,
        notifyAttendanceDeadlines: true
    };

    try {
        const snap = await db.collection('settings').doc('general').get();
        if (!snap.exists) return defaults;

        const data = snap.data() || {};
        return {
            enableEmailAlerts: data.enableEmailAlerts !== false,
            timezone: data.timezone || defaults.timezone,
            attendanceTimeInStart: data.attendanceTimeInStart || defaults.attendanceTimeInStart,
            attendanceTimeInEnd: data.attendanceTimeInEnd || defaults.attendanceTimeInEnd,
            attendanceTimeOutStart: data.attendanceTimeOutStart || defaults.attendanceTimeOutStart,
            attendanceTimeOutEnd: data.attendanceTimeOutEnd || defaults.attendanceTimeOutEnd,
            notifyLowStock: data.notifyLowStock !== false,
            notifyChamberOverdue: data.notifyChamberOverdue !== false,
            notifyPendingOvertime: data.notifyPendingOvertime !== false,
            notifyEODAttendance: data.notifyEODAttendance !== false,
            notifyManagerEntry: data.notifyManagerEntry !== false,
            notifyNurseryEvents: data.notifyNurseryEvents !== false,
            notifyInventoryEvents: data.notifyInventoryEvents !== false,
            notifySalesEvents: data.notifySalesEvents !== false,
            notifyWorkerEvents: data.notifyWorkerEvents !== false,
            notifyPayrollEvents: data.notifyPayrollEvents !== false,
            notifyAttendanceDeadlines: data.notifyAttendanceDeadlines !== false
        };
    } catch (err) {
        console.warn('[Roles] Error reading settings/general preferences:', err);
        return defaults;
    }
}

/**
 * Server-side actor identity verification.
 * Fetches the user's authentic record from Firestore rather than trusting client claims.
 */
export async function verifyActorIdentity(
    db: admin.firestore.Firestore,
    uid?: string,
    fallbackName?: string,
    fallbackEmail?: string
): Promise<{ uid?: string; name: string; email?: string; role: string }> {
    if (!uid) {
        return {
            name: fallbackName || 'Farm Manager',
            email: sanitizeEmail(fallbackEmail) || undefined,
            role: 'manager'
        };
    }

    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const data = userDoc.data() || {};
            return {
                uid,
                name: data.name || fallbackName || 'Farm User',
                email: sanitizeEmail(data.email) || sanitizeEmail(fallbackEmail) || undefined,
                role: data.role || 'manager'
            };
        }
    } catch (e) {
        console.warn('[Roles] Unable to verify actor UID in users collection:', e);
    }

    return {
        uid,
        name: fallbackName || 'Farm Manager',
        email: sanitizeEmail(fallbackEmail) || undefined,
        role: 'manager'
    };
}

import {
    createUserWithEmailAndPassword,
    getAuth,
    sendPasswordResetEmail,
    signOut,
    type User as FirebaseUser
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp
} from 'firebase/firestore';
import { auth, dbFirestore, firebaseConfig } from '../firebase';
import { db } from '../db';
import type { UserRole } from '../context/UserRoleContext';

export type { UserRole };

export const SUPER_ADMIN_EMAILS: string[] = [
    'gs.farms.ug@gmail.com',
    'gsfarm@gmail.com',
    'brighton118@gmail.com'
];

export function isSuperAdmin(email?: string | null): boolean {
    if (!email) return false;
    return SUPER_ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export async function assertAdminPermission(): Promise<void> {
    const current = auth.currentUser;
    if (!current) {
        throw new Error('Authentication required.');
    }
    const currentEmail = (current.email || '').toLowerCase().trim();
    if (isSuperAdmin(currentEmail)) {
        return;
    }
    const role = await getUserRole(current);
    if (role !== 'admin') {
        throw new Error('Permission denied: Only Administrators can create or manage user accounts.');
    }
}

export interface FarmUserRecord {
    uid: string;
    email: string;
    name: string;
    role: UserRole;
    active: boolean;
    permissions?: string[];
    createdAt?: any;
    updatedAt?: any;
}

export async function getUserRole(user: FirebaseUser): Promise<UserRole> {
    try {
        const email = (user.email || '').toLowerCase().trim();

        // 0. Super Admin check - always guaranteed Admin access
        if (email && SUPER_ADMIN_EMAILS.includes(email)) {
            localStorage.setItem(`gs_user_role_${user.uid}`, 'admin');
            localStorage.setItem('gs_user_role', 'admin');
            await setUserRoleInFirestore(user, 'admin', 'Super Administrator');
            return 'admin';
        }

        // 1. Check managers table first (if manager account was created, role is strictly manager)
        const managerRef = doc(dbFirestore, 'managers', user.uid);
        const managerSnap = await getDoc(managerRef);
        if (managerSnap.exists() && managerSnap.data()?.active !== false) {
            localStorage.setItem(`gs_user_role_${user.uid}`, 'manager');
            localStorage.setItem('gs_user_role', 'manager');
            return 'manager';
        }

        // 2. Check staff table
        const staffRef = doc(dbFirestore, 'staff', user.uid);
        const staffSnap = await getDoc(staffRef);
        if (staffSnap.exists() && staffSnap.data()?.active !== false) {
            localStorage.setItem(`gs_user_role_${user.uid}`, 'staff');
            localStorage.setItem('gs_user_role', 'staff');
            return 'staff';
        }

        // 3. Check central users collection
        const userDocRef = doc(dbFirestore, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            if (data?.role === 'manager') {
                localStorage.setItem(`gs_user_role_${user.uid}`, 'manager');
                localStorage.setItem('gs_user_role', 'manager');
                return 'manager';
            }
            if (data?.role === 'staff') {
                localStorage.setItem(`gs_user_role_${user.uid}`, 'staff');
                localStorage.setItem('gs_user_role', 'staff');
                return 'staff';
            }
            if (data?.role === 'admin') {
                // Non-superadmin with admin flag must be actively in admins collection
                const adminRef = doc(dbFirestore, 'admins', user.uid);
                const adminSnap = await getDoc(adminRef);
                if (adminSnap.exists() && adminSnap.data()?.active !== false) {
                    localStorage.setItem(`gs_user_role_${user.uid}`, 'admin');
                    localStorage.setItem('gs_user_role', 'admin');
                    return 'admin';
                }
                // If not in admins collection and not superadmin, downgrade to manager or staff
                localStorage.setItem(`gs_user_role_${user.uid}`, 'staff');
                localStorage.setItem('gs_user_role', 'staff');
                return 'staff';
            }
        }

        // 4. Check admins table
        const adminRef = doc(dbFirestore, 'admins', user.uid);
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists() && adminSnap.data()?.active !== false) {
            localStorage.setItem(`gs_user_role_${user.uid}`, 'admin');
            localStorage.setItem('gs_user_role', 'admin');
            return 'admin';
        }

        // 5. Check user-specific cached local role fallback
        const cached = localStorage.getItem(`gs_user_role_${user.uid}`) as UserRole;
        if (cached === 'manager' || cached === 'staff') {
            return cached;
        }
        if (cached === 'admin' && isSuperAdmin(email)) {
            return 'admin';
        }

        // Safety fallback: NEVER default non-superadmins to admin!
        localStorage.setItem(`gs_user_role_${user.uid}`, 'staff');
        localStorage.setItem('gs_user_role', 'staff');
        return 'staff';
    } catch (e) {
        console.warn('Error reading user role from Firestore, using safe fallback:', e);
        const cached = localStorage.getItem(`gs_user_role_${user.uid}`) as UserRole;
        if (cached && (cached !== 'admin' || isSuperAdmin(user.email))) {
            return cached;
        }
        return 'staff';
    }
}

export async function setUserRoleInFirestore(
    user: FirebaseUser | { uid: string; email?: string | null; displayName?: string | null },
    role: UserRole,
    customName?: string
): Promise<void> {
    const email = (user.email || user.uid).toLowerCase().trim();
    const displayName = customName || user.displayName || email.split('@')[0] || 'Farm User';
    const userDocRef = doc(dbFirestore, 'users', user.uid);

    const permissions = role === 'admin'
        ? ['all', 'admin_access', 'manage_users', 'edit_all', 'delete_all', 'view_all']
        : role === 'manager'
        ? ['operations', 'create_records', 'edit_records', 'view_all']
        : ['view_only', 'read_all'];

    try {
        // 1. Write to central users collection
        await setDoc(userDocRef, {
            uid: user.uid,
            email,
            role,
            name: displayName,
            active: true,
            permissions,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
        }, { merge: true });

        // Only update local storage if the user being updated is the current logged in user!
        if (auth.currentUser && auth.currentUser.uid === user.uid) {
            localStorage.setItem(`gs_user_role_${user.uid}`, role);
            localStorage.setItem('gs_user_role', role);
        }

        // 2. Synchronize specific role collections: admins, managers, and staff
        if (role === 'admin') {
            await setDoc(doc(dbFirestore, 'admins', user.uid), {
                uid: user.uid,
                email,
                name: displayName,
                role: 'admin',
                active: true,
                permissions,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            }, { merge: true });

            try { await deleteDoc(doc(dbFirestore, 'managers', user.uid)); } catch (_) {}
            try { await deleteDoc(doc(dbFirestore, 'staff', user.uid)); } catch (_) {}
        } else if (role === 'manager') {
            await setDoc(doc(dbFirestore, 'managers', user.uid), {
                uid: user.uid,
                email,
                name: displayName,
                role: 'manager',
                active: true,
                permissions,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            }, { merge: true });

            try { await deleteDoc(doc(dbFirestore, 'admins', user.uid)); } catch (_) {}
            try { await deleteDoc(doc(dbFirestore, 'staff', user.uid)); } catch (_) {}
        } else if (role === 'staff') {
            await setDoc(doc(dbFirestore, 'staff', user.uid), {
                uid: user.uid,
                email,
                name: displayName,
                role: 'staff',
                active: true,
                permissions,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            }, { merge: true });

            try { await deleteDoc(doc(dbFirestore, 'admins', user.uid)); } catch (_) {}
            try { await deleteDoc(doc(dbFirestore, 'managers', user.uid)); } catch (_) {}
        }

        // 3. Cache into local Dexie IndexedDB
        try {
            const existing = await db.users.where('uid').equals(user.uid).first();
            if (existing && existing.id) {
                await db.users.update(existing.id, {
                    uid: user.uid,
                    email,
                    username: email,
                    name: displayName,
                    role,
                    permissions,
                    active: true,
                    updatedAt: new Date().toISOString()
                });
            } else {
                await db.users.add({
                    uid: user.uid,
                    email,
                    username: email,
                    name: displayName,
                    role,
                    permissions,
                    active: true,
                    createdAt: new Date().toISOString()
                });
            }
        } catch (dexieErr) {
            console.warn('Dexie user store sync note:', dexieErr);
        }

    } catch (e) {
        console.warn('Error saving user role to Firestore:', e);
        if (auth.currentUser && auth.currentUser.uid === user.uid) {
            localStorage.setItem(`gs_user_role_${user.uid}`, role);
            localStorage.setItem('gs_user_role', role);
        }
    }
}

export async function ensureAdminAccess(user: FirebaseUser): Promise<void> {
    const email = (user.email || user.uid).toLowerCase().trim();

    try {
        // 1. Verify account is not deactivated
        const userDocRef = doc(dbFirestore, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists() && userSnap.data()?.active === false) {
            throw new Error('This account has been deactivated.');
        }

        const adminSnap = await getDoc(doc(dbFirestore, 'admins', user.uid));
        if (adminSnap.exists() && adminSnap.data()?.active === false) {
            throw new Error('This account has been deactivated.');
        }

        const managerSnap = await getDoc(doc(dbFirestore, 'managers', user.uid));
        if (managerSnap.exists() && managerSnap.data()?.active === false) {
            throw new Error('This account has been deactivated.');
        }

        const staffSnap = await getDoc(doc(dbFirestore, 'staff', user.uid));
        if (staffSnap.exists() && staffSnap.data()?.active === false) {
            throw new Error('This account has been deactivated.');
        }

        // 2. Mark any matching invite as claimed
        if (user.email) {
            try {
                const inviteRef = doc(dbFirestore, 'adminInvites', email);
                const inviteSnap = await getDoc(inviteRef);
                if (inviteSnap.exists()) {
                    await setDoc(inviteRef, {
                        claimedBy: user.uid,
                        claimedAt: serverTimestamp()
                    }, { merge: true });
                }
            } catch (e) {
                console.warn('Invite update note:', e);
            }
        }

        // 3. Read user role across all database tables without blindly overwriting manager role
        const role = await getUserRole(user);
        if (isSuperAdmin(email) || !userSnap.exists()) {
            await setUserRoleInFirestore(user, role);
        }

    } catch (error: any) {
        if (error?.message && error.message.includes('deactivated')) {
            throw error;
        }
        console.warn('User access verification note:', error);
    }
}

export async function listAllFarmUsers(): Promise<FarmUserRecord[]> {
    try {
        const usersSnap = await getDocs(collection(dbFirestore, 'users'));
        const usersList: FarmUserRecord[] = [];

        usersSnap.forEach(docSnap => {
            if (docSnap.id.startsWith('_') || docSnap.data()._isSystemSchema) return;
            const data = docSnap.data();
            usersList.push({
                uid: data.uid || docSnap.id,
                email: data.email || '',
                name: data.name || data.email?.split('@')[0] || 'Farm User',
                role: (data.role as UserRole) || 'staff',
                active: data.active !== false,
                permissions: data.permissions || [],
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            });
        });

        if (usersList.length > 0) {
            return usersList.sort((a, b) => a.email.localeCompare(b.email));
        }

        // Fallback: check individual collections
        const [adminsSnap, managersSnap, staffSnap] = await Promise.all([
            getDocs(collection(dbFirestore, 'admins')),
            getDocs(collection(dbFirestore, 'managers')),
            getDocs(collection(dbFirestore, 'staff'))
        ]);

        const merged: Map<string, FarmUserRecord> = new Map();

        adminsSnap.forEach(d => {
            if (d.id.startsWith('_') || d.data()._isSystemSchema) return;
            const data = d.data();
            merged.set(d.id, {
                uid: data.uid || d.id,
                email: data.email || '',
                name: data.name || 'Farm Administrator',
                role: 'admin',
                active: data.active !== false
            });
        });

        managersSnap.forEach(d => {
            if (d.id.startsWith('_') || d.data()._isSystemSchema) return;
            const data = d.data();
            merged.set(d.id, {
                uid: data.uid || d.id,
                email: data.email || '',
                name: data.name || 'Farm Manager',
                role: 'manager',
                active: data.active !== false
            });
        });

        staffSnap.forEach(d => {
            if (d.id.startsWith('_') || d.data()._isSystemSchema) return;
            const data = d.data();
            merged.set(d.id, {
                uid: data.uid || d.id,
                email: data.email || '',
                name: data.name || 'Farm Staff',
                role: 'staff',
                active: data.active !== false
            });
        });

        return Array.from(merged.values());
    } catch (e) {
        console.warn('Could not list farm users from Firestore:', e);
        return [];
    }
}

export async function updateUserRoleByAdmin(
    targetUid: string,
    targetEmail: string,
    targetName: string,
    newRole: UserRole
): Promise<void> {
    await assertAdminPermission();
    await setUserRoleInFirestore({ uid: targetUid, email: targetEmail, displayName: targetName }, newRole, targetName);
}

export async function createAdminInvite(emailAddress: string, createdBy: string, role: UserRole = 'admin'): Promise<void> {
    await assertAdminPermission();
    const email = emailAddress.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
        throw new Error('Enter a valid email address.');
    }

    const inviteRef = doc(dbFirestore, 'adminInvites', email);
    await setDoc(inviteRef, {
        email,
        role,
        createdBy,
        createdAt: serverTimestamp()
    }, { merge: true });
}

export async function listAdminInvites() {
    try {
        const snapshot = await getDocs(collection(dbFirestore, 'adminInvites'));
        return snapshot.docs.map(invite => ({
            email: invite.data().email as string,
            role: (invite.data().role as UserRole) || 'admin',
            claimed: Boolean(invite.data().claimedBy)
        }));
    } catch (e) {
        console.warn('Could not fetch invites:', e);
        return [];
    }
}

export async function createAccountByAdmin(
    fullName: string,
    emailAddress: string,
    passwordStr: string,
    role: UserRole
): Promise<{ uid: string; email: string }> {
    await assertAdminPermission();
    const email = emailAddress.trim().toLowerCase();
    const password = passwordStr.trim();
    const name = fullName.trim();

    if (!name) throw new Error('Please enter the full name for this account.');
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');

    const tempAppName = `Provisioner_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getAuth(tempApp);

    try {
        const userCred = await createUserWithEmailAndPassword(tempAuth, email, password);
        const newUser = userCred.user;

        await setUserRoleInFirestore({
            uid: newUser.uid,
            email: newUser.email,
            displayName: name
        }, role, name);

        try { await signOut(tempAuth); } catch (_) {}
        try { await deleteApp(tempApp); } catch (_) {}

        return { uid: newUser.uid, email: newUser.email || email };
    } catch (err: any) {
        try { await signOut(tempAuth); } catch (_) {}
        try { await deleteApp(tempApp); } catch (_) {}

        const code = err?.code || '';
        const messages: Record<string, string> = {
            'auth/email-already-in-use': 'An account already exists with this email address.',
            'auth/invalid-email': 'The email address is invalid.',
            'auth/weak-password': 'Password is too weak. Must be at least 6 characters.'
        };
        throw new Error(messages[code] || err?.message || 'Failed to create account.');
    }
}

export async function sendPasswordResetByAdmin(targetEmail: string): Promise<void> {
    await assertAdminPermission();
    const email = targetEmail.trim().toLowerCase();
    await sendPasswordResetEmail(auth, email);
}

export async function toggleUserActiveByAdmin(
    targetUid: string,
    currentActive: boolean,
    role: UserRole
): Promise<void> {
    await assertAdminPermission();
    const newActiveState = !currentActive;
    await setDoc(doc(dbFirestore, 'users', targetUid), { active: newActiveState }, { merge: true });
    if (role === 'admin') {
        await setDoc(doc(dbFirestore, 'admins', targetUid), { active: newActiveState }, { merge: true });
    } else if (role === 'manager') {
        await setDoc(doc(dbFirestore, 'managers', targetUid), { active: newActiveState }, { merge: true });
    } else if (role === 'staff') {
        await setDoc(doc(dbFirestore, 'staff', targetUid), { active: newActiveState }, { merge: true });
    }

    try {
        const local = await db.users.where('uid').equals(targetUid).first();
        if (local?.id) {
            await db.users.update(local.id, { active: newActiveState });
        }
    } catch (_) {}
}

export async function deleteUserByAdmin(
    targetUid: string,
    role: UserRole
): Promise<void> {
    await assertAdminPermission();
    try { await deleteDoc(doc(dbFirestore, 'users', targetUid)); } catch (_) {}
    if (role === 'admin') {
        try { await deleteDoc(doc(dbFirestore, 'admins', targetUid)); } catch (_) {}
    } else if (role === 'manager') {
        try { await deleteDoc(doc(dbFirestore, 'managers', targetUid)); } catch (_) {}
    } else if (role === 'staff') {
        try { await deleteDoc(doc(dbFirestore, 'staff', targetUid)); } catch (_) {}
    }

    try {
        const local = await db.users.where('uid').equals(targetUid).first();
        if (local?.id) {
            await db.users.delete(local.id);
        }
    } catch (_) {}
}


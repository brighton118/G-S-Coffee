import {
    createUserWithEmailAndPassword,
    getAuth,
    signOut,
    type User as FirebaseUser
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp
} from 'firebase/firestore';
import { dbFirestore, firebaseConfig } from '../firebase';
import { db } from '../db';
import type { UserRole } from '../context/UserRoleContext';

export type { UserRole };

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
        const userDocRef = doc(dbFirestore, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            if (data?.role === 'admin' || data?.role === 'manager' || data?.role === 'staff') {
                localStorage.setItem('gs_user_role', data.role);
                return data.role as UserRole;
            }
        }

        // Check admins table
        const adminRef = doc(dbFirestore, 'admins', user.uid);
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists() && adminSnap.data()?.active !== false) {
            localStorage.setItem('gs_user_role', 'admin');
            return 'admin';
        }

        // Check managers table
        const managerRef = doc(dbFirestore, 'managers', user.uid);
        const managerSnap = await getDoc(managerRef);
        if (managerSnap.exists() && managerSnap.data()?.active !== false) {
            localStorage.setItem('gs_user_role', 'manager');
            return 'manager';
        }

        // Check staff table
        const staffRef = doc(dbFirestore, 'staff', user.uid);
        const staffSnap = await getDoc(staffRef);
        if (staffSnap.exists() && staffSnap.data()?.active !== false) {
            localStorage.setItem('gs_user_role', 'staff');
            return 'staff';
        }

        // Check if there is a pending registration role chosen
        const pendingRole = localStorage.getItem('gs_pending_registration_role') as UserRole;
        if (pendingRole === 'admin' || pendingRole === 'manager' || pendingRole === 'staff') {
            await setUserRoleInFirestore(user, pendingRole);
            localStorage.removeItem('gs_pending_registration_role');
            return pendingRole;
        }

        // Check cached local role fallback
        const cached = localStorage.getItem('gs_user_role') as UserRole;
        if (cached === 'admin' || cached === 'manager' || cached === 'staff') {
            return cached;
        }

        // Default to admin for first user or bootstrap
        return 'admin';
    } catch (e) {
        console.warn('Error reading user role from Firestore, using cache/fallback:', e);
        const cached = localStorage.getItem('gs_user_role') as UserRole;
        return cached || 'admin';
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

        localStorage.setItem('gs_user_role', role);

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
        localStorage.setItem('gs_user_role', role);
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

        // 3. Read or set user role across all database tables
        const role = await getUserRole(user);
        await setUserRoleInFirestore(user, role);

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
    await setUserRoleInFirestore({ uid: targetUid, email: targetEmail, displayName: targetName }, newRole, targetName);
}

export async function createAdminInvite(emailAddress: string, createdBy: string, role: UserRole = 'admin'): Promise<void> {
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
    const email = emailAddress.trim().toLowerCase();
    const password = passwordStr.trim();
    const name = fullName.trim();

    if (!name) throw new Error('Please enter the full name for this account.');
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');

    const secondaryAppName = 'SecondaryAuthProvisioner';
    const existingApps = getApps();
    const secondaryApp = existingApps.find(a => a.name === secondaryAppName) || initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUser = userCred.user;

        await setUserRoleInFirestore({
            uid: newUser.uid,
            email: newUser.email,
            displayName: name
        }, role, name);

        await signOut(secondaryAuth);
        return { uid: newUser.uid, email: newUser.email || email };
    } catch (err: any) {
        try { await signOut(secondaryAuth); } catch (_) {}
        const code = err?.code || '';
        const messages: Record<string, string> = {
            'auth/email-already-in-use': 'An account already exists with this email address.',
            'auth/invalid-email': 'The email address is invalid.',
            'auth/weak-password': 'Password is too weak. Must be at least 6 characters.'
        };
        throw new Error(messages[code] || err?.message || 'Failed to create account.');
    }
}

export async function toggleUserActiveByAdmin(
    targetUid: string,
    currentActive: boolean,
    role: UserRole
): Promise<void> {
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


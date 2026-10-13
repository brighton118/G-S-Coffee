import type { User as FirebaseUser } from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    serverTimestamp
} from 'firebase/firestore';
import { dbFirestore } from '../firebase';
import type { UserRole } from '../context/UserRoleContext';

export type { UserRole };

const bootstrapRef = doc(dbFirestore, 'system', 'bootstrap');

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

        // Check legacy admin record
        const adminRef = doc(dbFirestore, 'admins', user.uid);
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists() && adminSnap.data()?.active !== false) {
            localStorage.setItem('gs_user_role', 'admin');
            return 'admin';
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
    user: FirebaseUser,
    role: UserRole,
    customName?: string
): Promise<void> {
    const email = (user.email || user.uid).toLowerCase().trim();
    const userDocRef = doc(dbFirestore, 'users', user.uid);

    try {
        await setDoc(userDocRef, {
            uid: user.uid,
            email,
            role,
            name: customName || user.displayName || email.split('@')[0] || 'Farm User',
            active: true,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
        }, { merge: true });

        localStorage.setItem('gs_user_role', role);

        if (role === 'admin') {
            const adminRef = doc(dbFirestore, 'admins', user.uid);
            await setDoc(adminRef, {
                uid: user.uid,
                email,
                name: customName || user.displayName || 'Farm Administrator',
                active: true,
                createdAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('Error saving user role to Firestore:', e);
        localStorage.setItem('gs_user_role', role);
    }
}

export async function ensureAdminAccess(user: FirebaseUser): Promise<void> {
    const email = (user.email || user.uid).toLowerCase().trim();
    const adminRef = doc(dbFirestore, 'admins', user.uid);

    try {
        const existingAdmin = await getDoc(adminRef);
        if (existingAdmin.exists()) {
            const data = existingAdmin.data();
            if (data && data.active === false) {
                throw new Error('This account has been deactivated.');
            }
            return;
        }

        // Check if bootstrap doc exists, otherwise create it
        try {
            const bootstrapSnap = await getDoc(bootstrapRef);
            if (!bootstrapSnap.exists()) {
                await setDoc(bootstrapRef, {
                    uid: user.uid,
                    email,
                    createdAt: serverTimestamp()
                }, { merge: true });
            }
        } catch (e) {
            console.warn('System bootstrap check note:', e);
        }

        // Mark any matching invite as claimed
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

        // Read or set user role
        const role = await getUserRole(user);
        if (role === 'admin') {
            await setDoc(adminRef, {
                uid: user.uid,
                email,
                name: user.displayName || 'Farm Administrator',
                active: true,
                createdAt: serverTimestamp()
            }, { merge: true });
        }

    } catch (error: any) {
        if (error?.message && error.message.includes('deactivated')) {
            throw error;
        }
        console.warn('Admin access verification note:', error);
    }
}

export async function createAdminInvite(emailAddress: string, createdBy: string): Promise<void> {
    const email = emailAddress.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
        throw new Error('Enter a valid email address.');
    }

    const inviteRef = doc(dbFirestore, 'adminInvites', email);
    await setDoc(inviteRef, {
        email,
        createdBy,
        createdAt: serverTimestamp()
    }, { merge: true });
}

export async function listAdminInvites() {
    try {
        const snapshot = await getDocs(collection(dbFirestore, 'adminInvites'));
        return snapshot.docs.map(invite => ({
            email: invite.data().email as string,
            claimed: Boolean(invite.data().claimedBy)
        }));
    } catch (e) {
        console.warn('Could not fetch invites:', e);
        return [];
    }
}

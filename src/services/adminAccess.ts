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

const bootstrapRef = doc(dbFirestore, 'system', 'bootstrap');

export async function ensureAdminAccess(user: FirebaseUser): Promise<void> {
    const email = (user.email || user.uid).toLowerCase().trim();
    const adminRef = doc(dbFirestore, 'admins', user.uid);

    try {
        const existingAdmin = await getDoc(adminRef);
        if (existingAdmin.exists()) {
            const data = existingAdmin.data();
            if (data && data.active === false) {
                throw new Error('This administrator account has been deactivated.');
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

        // Create or update admin document for the user
        await setDoc(adminRef, {
            uid: user.uid,
            email,
            name: user.displayName || 'Farm Administrator',
            active: true,
            createdAt: serverTimestamp()
        }, { merge: true });

    } catch (error: any) {
        if (error?.message && error.message.includes('deactivated')) {
            throw error;
        }
        console.warn('Admin access verification note:', error);
    }
}

export async function createAdminInvite(emailAddress: string, createdBy: string): Promise<void> {
    const email = emailAddress.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

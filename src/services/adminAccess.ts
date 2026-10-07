import type { User as FirebaseUser } from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    runTransaction,
    serverTimestamp,
    where
} from 'firebase/firestore';
import { dbFirestore } from '../firebase';

const bootstrapRef = doc(dbFirestore, 'system', 'bootstrap');

export async function ensureAdminAccess(user: FirebaseUser): Promise<void> {
    if (!user.email) {
        throw new Error('An email address is required for administrator access.');
    }
    if (!user.emailVerified) {
        throw new Error('Verify your email address using the link we sent, then sign in again.');
    }

    const adminRef = doc(dbFirestore, 'admins', user.uid);
    const existingAdmin = await getDoc(adminRef);
    if (existingAdmin.exists()) {
        const admin = existingAdmin.data();
        if (admin.email !== user.email.toLowerCase() || admin.active !== true) {
            throw new Error('This account is not authorized as a farm administrator.');
        }
        return;
    }

    const email = user.email.toLowerCase();
    const inviteRef = doc(dbFirestore, 'adminInvites', email);

    await runTransaction(dbFirestore, async transaction => {
        const [bootstrap, invite] = await Promise.all([
            transaction.get(bootstrapRef),
            transaction.get(inviteRef)
        ]);

        if (!bootstrap.exists()) {
            transaction.set(bootstrapRef, {
                uid: user.uid,
                email,
                createdAt: serverTimestamp()
            });
            transaction.set(adminRef, {
                uid: user.uid,
                email,
                active: true,
                createdAt: serverTimestamp()
            });
            return;
        }

        if (!invite.exists() || invite.data().email !== email || invite.data().claimedBy) {
            throw new Error('Admin registration is invite-only. Ask an existing administrator to invite this email address.');
        }

        transaction.update(inviteRef, {
            claimedBy: user.uid,
            claimedAt: serverTimestamp()
        });
        transaction.set(adminRef, {
            uid: user.uid,
            email,
            active: true,
            createdAt: serverTimestamp()
        });
    });
}

export async function createAdminInvite(emailAddress: string, createdBy: string): Promise<void> {
    const email = emailAddress.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Enter a valid email address.');
    }

    const existingAdmin = await getDocs(query(collection(dbFirestore, 'admins'), where('email', '==', email)));
    if (!existingAdmin.empty) {
        throw new Error('This email already belongs to an administrator.');
    }

    const inviteRef = doc(dbFirestore, 'adminInvites', email);
    await runTransaction(dbFirestore, async transaction => {
        const existingInvite = await transaction.get(inviteRef);
        if (existingInvite.exists() && existingInvite.data().claimedBy) {
            throw new Error('This invitation has already been used.');
        }
        transaction.set(inviteRef, {
            email,
            createdBy,
            createdAt: serverTimestamp()
        });
    });
}

export async function listAdminInvites() {
    const snapshot = await getDocs(collection(dbFirestore, 'adminInvites'));
    return snapshot.docs.map(invite => ({
        email: invite.data().email as string,
        claimed: Boolean(invite.data().claimedBy)
    }));
}

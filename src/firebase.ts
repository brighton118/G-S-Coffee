import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";

const getAuthDomain = () => {
    if (typeof window !== 'undefined' && window.location.hostname) {
        const host = window.location.hostname;
        if (host.endsWith('gsfarm.farm') || host.endsWith('web.app') || host.endsWith('firebaseapp.com')) {
            return host;
        }
    }
    return "gs-coffee-3d022.firebaseapp.com";
};

// Your web app's Firebase configuration
export const firebaseConfig = {
    apiKey: "AIzaSyDXAYOGiPk1sHBff2karq-jkxlVG8nuRqw",
    authDomain: getAuthDomain(),
    projectId: "gs-coffee-3d022",
    storageBucket: "gs-coffee-3d022.firebasestorage.app",
    messagingSenderId: "397024052080",
    appId: "1:397024052080:web:54964e5acb1c61b8c685b5",
    measurementId: "G-84VYLX5CPR"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : undefined;
export const dbFirestore = initializeFirestore(app, {
    ignoreUndefinedProperties: true
});
export const auth = getAuth(app);

// Guarantee permanent local session persistence so the user stays signed in indefinitely until manually logged out
if (typeof window !== 'undefined') {
    void setPersistence(auth, browserLocalPersistence).catch(err => {
        console.warn('Firebase session persistence configuration note:', err);
    });
}

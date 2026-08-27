import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDXAYOGiPk1sHBff2karq-jkxlVG8nuRqw",
    authDomain: "gs-coffee-3d022.firebaseapp.com",
    projectId: "gs-coffee-3d022",
    storageBucket: "gs-coffee-3d022.firebasestorage.app",
    messagingSenderId: "397024052080",
    appId: "1:397024052080:web:54964e5acb1c61b8c685b5",
    measurementId: "G-84VYLX5CPR"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const dbFirestore = getFirestore(app);

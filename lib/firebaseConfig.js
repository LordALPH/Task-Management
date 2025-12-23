// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDcaT8jVKMrn-6TEHAjC-6e_dLJ5z50aPo",
  authDomain: "task-management-6b83c.firebaseapp.com",
  projectId: "task-management-6b83c",
  storageBucket: "task-management-6b83c.firebasestorage.app",
  messagingSenderId: "819370656460",
  appId: "1:819370656460:web:9c3477c48fa72fcbcab869"
};

// Initialize Firebase only if it hasn't been initialized already
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

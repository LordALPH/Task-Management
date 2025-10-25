"use client";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAHICnqebxRTENLFgd1CANxV9VYsdu7Tno",
  authDomain: "task-management-e5851.firebaseapp.com",
  projectId: "task-management-e5851",
  storageBucket: "task-management-e5851.firebasestorage.app",
  messagingSenderId: "224444744597",
  appId: "1:224444744597:web:cc04114b94f01da7a6ec9c",
  measurementId: "G-BDRC9WMKTM"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Firebase configuration for Insel-Wiki
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyBa9TR4kXUDqvcG7yS6CpI-27AjziRHocw",
  authDomain: "insel-wiki-i.firebaseapp.com",
  projectId: "insel-wiki-i",
  storageBucket: "insel-wiki-i.firebasestorage.app",
  messagingSenderId: "369086809260",
  appId: "1:369086809260:web:c4a76e0bb29ac875874b09",
  measurementId: "G-EN1FZMCJG7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);
export default app;

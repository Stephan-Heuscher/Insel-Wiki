import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.INSEL_WIKI_FIREBASE_API_KEY,
  authDomain: process.env.INSEL_WIKI_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.INSEL_WIKI_FIREBASE_PROJECT_ID,
  storageBucket: process.env.INSEL_WIKI_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.INSEL_WIKI_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.INSEL_WIKI_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = 'stephansdigitalassistent+wiki@gmail.com';
const password = 'InselWikiUser2026!';

async function register() {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log('User registered successfully:', userCredential.user.email);
    console.log('UID:', userCredential.user.uid);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log('User already exists:', email);
    } else {
      console.error('Registration failed:', error.code, error.message);
    }
  }
}

register();

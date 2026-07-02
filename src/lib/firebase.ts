import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration for salescore-piranusa
const firebaseConfig = {
  apiKey: "AIzaSyDJMVS0fAMzqsD_6nMWqYkR5-xqWLoFNT8",
  authDomain: "salescore-piranusa.firebaseapp.com",
  projectId: "salescore-piranusa",
  storageBucket: "salescore-piranusa.firebasestorage.app",
  messagingSenderId: "845907112680",
  appId: "1:845907112680:web:0fe07368509e356e880f5d"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

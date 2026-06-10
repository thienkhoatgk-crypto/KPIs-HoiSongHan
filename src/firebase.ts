import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: "AIzaSyBsbvOBVbj97yLI6TjE0dNKYErQ-erM_xI", // <-- Khóa mới của anh đây
  authDomain: "kpissonghan.firebaseapp.com",
  projectId: "kpissonghan",
  storageBucket: "kpissonghan.firebasestorage.app",
  messagingSenderId: "214853849761",
  appId: "1:214853849761:web:b62ada63d18b0a66e8d6e0",
  measurementId: "G-TF6J258QQX"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

export const signInWithGoogleMobile = async () => {
  const result = await FirebaseAuthentication.signInWithGoogle();
  const credential = GoogleAuthProvider.credential(result.credential?.idToken);
  return signInWithCredential(auth, credential);
};
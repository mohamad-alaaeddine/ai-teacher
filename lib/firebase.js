import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "[REMOVED_API_KEY]",
  authDomain: "buddy-ai-language-teacher.firebaseapp.com",
  projectId: "buddy-ai-language-teacher",
  storageBucket: "buddy-ai-language-teacher.firebasestorage.app",
  messagingSenderId: "596524836235",
  appId: "1:596524836235:web:1581ac7305bd0147a87b8e",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (e) {
    console.error("❌ [GOOGLE LOGIN]", e);
    return null;
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("❌ [SIGN OUT]", e);
  }
}
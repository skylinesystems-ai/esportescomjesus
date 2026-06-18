import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  deleteField,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBpKA_hHHFz_FS0-3lzn1oFX7XOEMsgyIY",
  authDomain: "ct-forge.firebaseapp.com",
  projectId: "ct-forge",
  storageBucket: "ct-forge.firebasestorage.app",
  messagingSenderId: "804278272617",
  appId: "1:804278272617:web:bb1aedd66ef646dd6798f8"
};

export const isFirebaseConfigured = !firebaseConfig.apiKey.includes("SUA_")
  && !firebaseConfig.projectId.includes("SEU_");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  auth,
  db,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  deleteField,
  serverTimestamp
};

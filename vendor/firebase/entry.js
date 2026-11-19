import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, browserLocalPersistence, setPersistence } from "firebase/auth";
/* Firestore sans cache persistant (mémoire seulement) : aucune donnée de compte n'est laissée dans IndexedDB
   sur l'appareil. Le stockage local de l'application reste la copie hors connexion. */
import { getFirestore, doc, getDocFromServer, runTransaction, onSnapshot, serverTimestamp } from "firebase/firestore";
export { initializeApp, getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, browserLocalPersistence, setPersistence,
  getFirestore, doc, getDocFromServer, runTransaction, onSnapshot, serverTimestamp };

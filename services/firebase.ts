// Use namespace import for firebase/app to resolve potential named export issues in the environment
import * as firebaseApp from "firebase/app";
import { getFirestore } from "firebase/firestore";
// Correcting the modular import for getStorage from the official firebase/storage subpath.
import { getStorage } from "firebase/storage";

/**
 * Replace the values below with your actual Firebase project configuration
 * found in the Firebase Console: Project Settings > General > Your apps.
 */
const firebaseConfig = {
  apiKey: "AIzaSyAD_tntj6vbOzGxdNI9hh6-v1G--qaNvKs",
  authDomain: "filershubvault.firebaseapp.com",
  projectId: "filershubvault",
  storageBucket: "filershubvault.firebasestorage.app",
  messagingSenderId: "1042750305582",
  appId: "1:1042750305582:web:0664d3d6263a08342c36bf"
};

// Initialize Firebase using the namespace-imported initializeApp method
const app = firebaseApp.initializeApp(firebaseConfig);

// Initialize and export services for use throughout the app
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

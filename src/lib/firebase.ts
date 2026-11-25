import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(firebaseAuth, googleProvider);
  return credential.user;
}

export async function signOutGoogle(): Promise<void> {
  await signOut(firebaseAuth);
}

export async function getFreshIdToken(user: User | null): Promise<string | null> {
  if (!user) return null;
  return user.getIdToken();
}

export async function authJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getFreshIdToken(firebaseAuth.currentUser);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export { onAuthStateChanged };
export type { User as FirebaseUser };

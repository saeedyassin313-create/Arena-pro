import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const firestoreDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'] as const;

export const gmailProvider = new GoogleAuthProvider();
for (const scope of GMAIL_SCOPES) {
  gmailProvider.addScope(scope);
}
gmailProvider.setCustomParameters({ prompt: 'consent select_account' });

// Strict in-memory OAuth access token caching (never persisted to localStorage/sessionStorage)
let cachedGmailAccessToken: string | null = null;
let cachedGmailSenderEmail: string | null = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedGmailAccessToken = null;
    cachedGmailSenderEmail = null;
  }
});

export function getGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function getGmailSenderEmail(): string | null {
  return cachedGmailSenderEmail;
}

export function clearGmailAccessToken(): void {
  cachedGmailAccessToken = null;
  cachedGmailSenderEmail = null;
}

export async function connectGmailSender(): Promise<{
  accessToken: string;
  email: string;
}> {
  const result = await signInWithPopup(auth, gmailProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('لم يتم استلام صلاحية الإرسال من حساب Google.');
  }
  cachedGmailAccessToken = credential.accessToken;
  cachedGmailSenderEmail = result.user.email || '';
  return {
    accessToken: cachedGmailAccessToken,
    email: cachedGmailSenderEmail,
  };
}

async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Use named database if specified and not the default, otherwise use the default database
const dbId = firebaseConfig.firestoreDatabaseId;
export const db = (dbId && dbId !== '(default)')
  ? getFirestore(app, dbId)
  : getFirestore(app);

// Initialize Authentication (used only for the Pastor/Admin login)
export const auth = getAuth();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
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

/**
 * Handle Firestore errors according to precision standard specifications.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Checks client-side if email belongs to the Pastor/Admin list as specified in metadata.
 */
export function isUserAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = ['liviston63@gmail.com', 'idsystems17@gmail.com'];
  return adminEmails.includes(email.toLowerCase());
}

// ---------------------------------------------------------------------------
// PASTOR / ADMIN LOGIN — real Firebase Authentication (e-mail + senha de 4 dígitos)
// Uses the pastor's real e-mail so Firebase's own "esqueci a senha" works de graça.
// ---------------------------------------------------------------------------

/** Turns the 4-digit PIN the pastor types into a password Firebase accepts (needs 6+ chars). */
function pinToPassword(pin: string): string {
  return `amanhecer-${pin}`;
}

/**
 * Logs the Pastor/Admin in with e-mail + PIN. If the account doesn't exist yet
 * (first time using this e-mail), creates it on the spot.
 */
export async function loginAdmin(email: string, pin: string) {
  const password = pinToPassword(pin);
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-credential') {
      const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      return result.user;
    }
    throw error;
  }
}

/** Sends the real "esqueci minha senha" e-mail via Firebase (only works for the admin e-mail login). */
export async function sendAdminPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export async function logoutUser() {
  await signOut(auth);
}

// ---------------------------------------------------------------------------
// MEMBER LOGIN — nome + senha de 4 dígitos, sem e-mail, guardado direto no Firestore.
// Simples de propósito: serve só para lembrar o progresso de leitura da pessoa,
// não protege nada sensível (não tem pedido de oração nem edição aqui).
// ---------------------------------------------------------------------------

/** Turns a display name into a stable document id: sem acento, minúsculo, só letras/números. */
const DIACRITICS_REGEX = new RegExp(String.fromCharCode(0x5b, 0x300, 0x2d, 0x36f, 0x5d), 'g');

export function slugifyMemberName(name: string): string {
  return name
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`amanhecer-com-deus-${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface MemberRecord {
  name: string;
  pinHash: string;
  readDays: number[];
  starredDays: number[];
}

export type MemberLoginResult =
  | { status: 'ok'; loginId: string; member: MemberRecord }
  | { status: 'new_account'; loginId: string; member: MemberRecord }
  | { status: 'wrong_pin'; loginId: string };

/**
 * Tries to log a member in by name + PIN. If the name has never been used,
 * creates the account automatically (first login = signup).
 */
export async function loginOrCreateMember(name: string, pin: string): Promise<MemberLoginResult> {
  const loginId = slugifyMemberName(name);
  const pinHash = await hashPin(pin);
  const memberRef = doc(db, 'members', loginId);
  const snap = await getDoc(memberRef);

  if (!snap.exists()) {
    const member: MemberRecord = { name: name.trim(), pinHash, readDays: [], starredDays: [] };
    await setDoc(memberRef, member);
    return { status: 'new_account', loginId, member };
  }

  const existing = snap.data() as MemberRecord;
  if (existing.pinHash !== pinHash) {
    return { status: 'wrong_pin', loginId };
  }
  return { status: 'ok', loginId, member: existing };
}

/** "Esqueci a senha": recria a senha do zero para esse nome, sem precisar provar nada. */
export async function resetMemberPin(name: string, newPin: string): Promise<{ loginId: string; member: MemberRecord }> {
  const loginId = slugifyMemberName(name);
  const pinHash = await hashPin(newPin);
  const memberRef = doc(db, 'members', loginId);
  const snap = await getDoc(memberRef);
  const previous = snap.exists() ? (snap.data() as MemberRecord) : null;
  const member: MemberRecord = {
    name: name.trim(),
    pinHash,
    readDays: previous?.readDays || [],
    starredDays: previous?.starredDays || [],
  };
  await setDoc(memberRef, member);
  return { loginId, member };
}

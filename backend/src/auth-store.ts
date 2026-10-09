import { Buffer } from "node:buffer";
import type { User } from "./domain.js";
import { firebase } from "./firebase.js";
import { activeSessions, users } from "./store.js";

const firestore = firebase?.firestore;
const userCollection = "users";
const emailCollection = "userEmails";
const sessionCollection = "sessions";

function emailDocumentId(email: string) {
  return Buffer.from(email).toString("base64url");
}

export async function createUser(user: User): Promise<boolean> {
  if (!firestore) {
    if ([...users.values()].some((candidate) => candidate.email === user.email)) return false;
    users.set(user.id, user);
    return true;
  }

  const userRef = firestore.collection(userCollection).doc(user.id);
  const emailRef = firestore.collection(emailCollection).doc(emailDocumentId(user.email));
  const created = await firestore.runTransaction(async (transaction) => {
    const existingEmail = await transaction.get(emailRef);
    if (existingEmail.exists) return false;
    transaction.create(userRef, user);
    transaction.create(emailRef, { userId: user.id });
    return true;
  });
  if (created) users.set(user.id, user);
  return created;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  if (!firestore) return [...users.values()].find((user) => user.email === email);
  const emailDoc = await firestore.collection(emailCollection).doc(emailDocumentId(email)).get();
  const userId = emailDoc.data()?.userId;
  if (typeof userId !== "string") return undefined;
  return getUser(userId);
}

export async function getUser(userId: string): Promise<User | undefined> {
  if (!firestore) return users.get(userId);
  const snapshot = await firestore.collection(userCollection).doc(userId).get();
  if (!snapshot.exists) {
    users.delete(userId);
    return undefined;
  }
  const user = snapshot.data() as User;
  users.set(user.id, user);
  return user;
}

export async function getAllUsers(): Promise<User[]> {
  if (!firestore) return [...users.values()];
  const snapshot = await firestore.collection(userCollection).get();
  const allUsers = snapshot.docs.map((document) => document.data() as User);
  users.clear();
  for (const user of allUsers) users.set(user.id, user);
  return allUsers;
}

export async function saveUser(user: User): Promise<void> {
  if (firestore) {
    const userRef = firestore.collection(userCollection).doc(user.id);
    await firestore.runTransaction(async (transaction) => {
      const previousSnapshot = await transaction.get(userRef);
      const previous = previousSnapshot.data() as User | undefined;
      if (previous && previous.email !== user.email) {
        const nextEmailRef = firestore.collection(emailCollection).doc(emailDocumentId(user.email));
        const existingEmail = await transaction.get(nextEmailRef);
        if (existingEmail.exists && existingEmail.data()?.userId !== user.id) {
          throw new Error("Email already registered");
        }
        const previousEmailRef = firestore.collection(emailCollection).doc(emailDocumentId(previous.email));
        transaction.delete(previousEmailRef);
        transaction.set(nextEmailRef, { userId: user.id });
      } else {
        transaction.set(firestore.collection(emailCollection).doc(emailDocumentId(user.email)), { userId: user.id });
      }
      transaction.set(userRef, user);
    });
  }
  users.set(user.id, user);
}

export async function createSession(sessionId: string, userId: string): Promise<void> {
  if (firestore) {
    await firestore.collection(sessionCollection).doc(sessionId).create({ userId, createdAt: new Date().toISOString() });
  }
  activeSessions.add(sessionId);
}

export async function hasSession(sessionId: string): Promise<boolean> {
  if (!firestore) return activeSessions.has(sessionId);
  const snapshot = await firestore.collection(sessionCollection).doc(sessionId).get();
  return snapshot.exists;
}

export async function revokeSession(sessionId: string): Promise<void> {
  if (firestore) await firestore.collection(sessionCollection).doc(sessionId).delete();
  activeSessions.delete(sessionId);
}

import { firebase } from "./firebase.js";

const firestore = firebase?.firestore;

export async function loadRecord<T extends object>(collectionName: string, records: Map<string, T>, id: string): Promise<T | undefined> {
  if (!firestore) return records.get(id);
  const snapshot = await firestore.collection(collectionName).doc(id).get();
  if (!snapshot.exists) {
    records.delete(id);
    return undefined;
  }
  const record = snapshot.data() as T;
  records.set(id, record);
  return record;
}

export async function loadCollection<T extends object>(collectionName: string, records: Map<string, T>, seedWhenEmpty = false): Promise<T[]> {
  if (!firestore) return [...records.values()];
  const collection = firestore.collection(collectionName);
  let snapshot = await collection.get();
  if (snapshot.empty && seedWhenEmpty && records.size > 0) {
    const batch = firestore.batch();
    for (const [id, record] of records) batch.set(collection.doc(id), record);
    await batch.commit();
    snapshot = await collection.get();
  }
  const loaded = snapshot.docs.map((document) => document.data() as T);
  records.clear();
  for (const record of loaded) {
    const id = (record as { id?: unknown }).id;
    if (typeof id === "string") records.set(id, record);
    else if ("userId" in record && typeof (record as { userId?: unknown }).userId === "string") {
      records.set((record as { userId: string }).userId, record);
    }
  }
  return loaded;
}

export async function loadOwnedRecords<T extends { id: string; ownerId: string }>(collectionName: string, records: Map<string, T>, ownerId: string): Promise<T[]> {
  if (!firestore) return [...records.values()].filter((record) => record.ownerId === ownerId);
  const snapshot = await firestore.collection(collectionName).where("ownerId", "==", ownerId).get();
  const loaded = snapshot.docs.map((document) => document.data() as T);
  for (const record of loaded) records.set(record.id, record);
  return loaded;
}

export async function loadMatchingRecords<T extends { id: string }>(
  collectionName: string,
  records: Map<string, T>,
  field: string,
  value: string
): Promise<T[]> {
  if (!firestore) return [...records.values()].filter((record) => (record as Record<string, unknown>)[field] === value);
  const snapshot = await firestore.collection(collectionName).where(field, "==", value).get();
  const loaded = snapshot.docs.map((document) => document.data() as T);
  for (const record of loaded) records.set(record.id, record);
  return loaded;
}

export async function saveRecord<T extends object>(collectionName: string, records: Map<string, T>, id: string, record: T): Promise<void> {
  if (firestore) await firestore.collection(collectionName).doc(id).set(record);
  records.set(id, record);
}

export async function deleteRecord<T extends object>(collectionName: string, records: Map<string, T>, id: string): Promise<void> {
  if (firestore) await firestore.collection(collectionName).doc(id).delete();
  records.delete(id);
}

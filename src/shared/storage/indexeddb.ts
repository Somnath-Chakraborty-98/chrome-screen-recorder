// src/shared/storage/indexeddb.ts
import { openDB, IDBPDatabase } from 'idb';

export type RecordingEntry = {
  id: string;
  name: string;
  blob?: Blob;
  meta?: Record<string, any>;
  createdAt: number;
};

const DB_NAME = 'screen-recorder-db';
const STORE_NAME = 'recordings';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Save a recording blob and metadata.
 * @param id unique id for recording (string)
 * @param blob Blob of recording
 * @param meta arbitrary metadata
 */
export async function saveRecording(id: string, blob: Blob, meta: Record<string, any> = {}) {
  const db = await getDb();
  const entry: RecordingEntry = {
    id,
    name: meta.name || `${id}.webm`,
    blob,
    meta,
    createdAt: Date.now(),
  };
  // Use put to add or update
  await db.put(STORE_NAME, entry);
  return entry;
}

/** Get a recording by id */
export async function getRecording(id: string): Promise<RecordingEntry | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, id);
}

/** Delete a recording by id */
export async function deleteRecording(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

/** List recordings, newest first */
export async function listRecordings(limit = 50): Promise<RecordingEntry[]> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('createdAt');

  // iterate in reverse order (newest first)
  const results: RecordingEntry[] = [];
  let cursor = await index.openCursor(null, 'prev');
  while (cursor && results.length < limit) {
    results.push(cursor.value as RecordingEntry);
    cursor = await cursor.continue();
  }
  await tx.done;
  return results;
}

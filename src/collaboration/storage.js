export const COLLABORATION_DATABASE_NAME = "underscores_multiplayer_v1";
const DATABASE_VERSION = 1;

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
});

export class CollaborationRoomCache {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this.databasePromise = null;
    this.memoryRooms = new Map();
    this.memoryFiles = new Map();
  }

  async database() {
    if (!this.indexedDB) return null;
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(COLLABORATION_DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("rooms")) database.createObjectStore("rooms", { keyPath: "roomId" });
          if (!database.objectStoreNames.contains("files")) database.createObjectStore("files", { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open the multiplayer cache."));
      }).catch(() => null);
    }
    return this.databasePromise;
  }

  async put(storeName, value) {
    const database = await this.database();
    if (!database) return false;
    const transaction = database.transaction(storeName, "readwrite");
    await requestResult(transaction.objectStore(storeName).put(value));
    return true;
  }

  async get(storeName, key) {
    const database = await this.database();
    if (!database) return null;
    const transaction = database.transaction(storeName, "readonly");
    return await requestResult(transaction.objectStore(storeName).get(key)) || null;
  }

  async saveRoom(roomId, encryptedSnapshot) {
    const record = { roomId, encryptedSnapshot, updatedAt: Date.now() };
    this.memoryRooms.set(roomId, record);
    try { await this.put("rooms", record); } catch { /* memory fallback remains available */ }
    return record;
  }

  async loadRoom(roomId) {
    if (this.memoryRooms.has(roomId)) return this.memoryRooms.get(roomId);
    try {
      const record = await this.get("rooms", roomId);
      if (record) this.memoryRooms.set(roomId, record);
      return record;
    } catch {
      return null;
    }
  }

  async saveFile(roomId, fileId, encryptedFile, metadata = {}) {
    const key = `${roomId}:${fileId}`;
    const record = { key, roomId, fileId, encryptedFile, metadata, updatedAt: Date.now() };
    this.memoryFiles.set(key, record);
    try { await this.put("files", record); } catch { /* memory fallback remains available */ }
    return record;
  }

  async loadFile(roomId, fileId) {
    const key = `${roomId}:${fileId}`;
    if (this.memoryFiles.has(key)) return this.memoryFiles.get(key);
    try {
      const record = await this.get("files", key);
      if (record) this.memoryFiles.set(key, record);
      return record;
    } catch {
      return null;
    }
  }
}

// peekDb.js
// IndexedDB storage for Peek phone state (per character) + global state.

const DB_NAME = 'psoulos_peek_v1';
const DB_VERSION = 1;
const STORE_PHONE = 'peekPhoneState';
const STORE_GLOBAL = 'peekAppState';

const LEGACY_CHAR_KEY_PREFIX = 'peek_char_data_v1_';
const LEGACY_GLOBAL_KEY = 'peek_app_state_v1';

function reqToPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
    });
}

function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
}

let _dbPromise = null;
export function openPeekDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_PHONE)) {
                db.createObjectStore(STORE_PHONE, { keyPath: 'charId' });
            }
            if (!db.objectStoreNames.contains(STORE_GLOBAL)) {
                db.createObjectStore(STORE_GLOBAL, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
    });
    return _dbPromise;
}

export async function getPhoneState(charId) {
    const id = String(charId || '');
    if (!id) return null;
    const db = await openPeekDb();
    const tx = db.transaction([STORE_PHONE], 'readonly');
    const store = tx.objectStore(STORE_PHONE);
    const res = await reqToPromise(store.get(id));
    await txDone(tx);
    return res || null;
}

export async function putPhoneState(charId, state) {
    const id = String(charId || '');
    if (!id) return;
    const db = await openPeekDb();
    const tx = db.transaction([STORE_PHONE], 'readwrite');
    const store = tx.objectStore(STORE_PHONE);
    const doc = { ...(state || {}), charId: id, updatedAt: Date.now() };
    store.put(doc);
    await txDone(tx);
}

export async function getGlobalState() {
    const db = await openPeekDb();
    const tx = db.transaction([STORE_GLOBAL], 'readonly');
    const store = tx.objectStore(STORE_GLOBAL);
    const res = await reqToPromise(store.get('global'));
    await txDone(tx);
    return res?.data || null;
}

export async function putGlobalState(state) {
    const db = await openPeekDb();
    const tx = db.transaction([STORE_GLOBAL], 'readwrite');
    const store = tx.objectStore(STORE_GLOBAL);
    store.put({ id: 'global', data: state || {}, updatedAt: Date.now() });
    await txDone(tx);
}

function safeParseJson(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function legacyCharIdFromKey(k) {
    if (!k || typeof k !== 'string') return '';
    if (!k.startsWith(LEGACY_CHAR_KEY_PREFIX)) return '';
    return k.slice(LEGACY_CHAR_KEY_PREFIX.length);
}

// Migrate legacy localStorage state into IndexedDB.
// - Safe to call multiple times.
// - Does not delete legacy keys (keeps rollback path).
export async function migratePeekLocalStorageToIdb() {
    // no window/localStorage in some contexts
    if (typeof localStorage === 'undefined') return { migratedChars: 0, migratedGlobal: false };

    let migratedChars = 0;
    let migratedGlobal = false;

    // Global state
    try {
        const existingGlobal = await getGlobalState();
        if (!existingGlobal) {
            const legacyGlobalRaw = localStorage.getItem(LEGACY_GLOBAL_KEY);
            const legacyGlobal = legacyGlobalRaw ? safeParseJson(legacyGlobalRaw) : null;
            if (legacyGlobal && typeof legacyGlobal === 'object') {
                await putGlobalState(legacyGlobal);
                migratedGlobal = true;
            }
        }
    } catch {
        // ignore migration failures
    }

    // Per-char state
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith(LEGACY_CHAR_KEY_PREFIX)) keys.push(k);
        }
        for (const k of keys) {
            const charId = legacyCharIdFromKey(k);
            if (!charId) continue;
            const existing = await getPhoneState(charId);
            if (existing) continue;
            const legacyRaw = localStorage.getItem(k);
            const legacy = legacyRaw ? safeParseJson(legacyRaw) : null;
            if (!legacy || typeof legacy !== 'object') continue;
            await putPhoneState(charId, legacy);
            migratedChars += 1;
        }
    } catch {
        // ignore
    }

    return { migratedChars, migratedGlobal };
}


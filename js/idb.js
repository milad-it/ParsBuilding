// --- IndexedDB Asynchronous Storage Layer ---
// Eliminates 5MB LocalStorage limit and provides safe fallback against browser cache clears.

const IDB_NAME = 'ParsBuildingDB';
const IDB_VERSION = 1;
const IDB_STORE = 'app_state';

let _idbPromise = null;

function getIDB() {
    if (_idbPromise) return _idbPromise;
    _idbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            console.warn('IndexedDB is not supported on this browser.');
            return resolve(null);
        }
        const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => {
            console.error('IndexedDB open error:', e);
            resolve(null);
        };
    });
    return _idbPromise;
}

async function idbGet(key) {
    try {
        const db = await getIDB();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction([IDB_STORE], 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => resolve(null);
        });
    } catch (err) {
        console.warn('idbGet error:', err);
        return null;
    }
}

async function idbSet(key, value) {
    try {
        const db = await getIDB();
        if (!db) return false;
        return new Promise((resolve) => {
            const tx = db.transaction([IDB_STORE], 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            const req = store.put(value, key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    } catch (err) {
        console.warn('idbSet error:', err);
        return false;
    }
}

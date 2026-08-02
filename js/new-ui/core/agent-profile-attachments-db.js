(function () {
  // shell: Agent Profiles' photo/file attachment BYTES live here, not in
  // localStorage - the rest of this app's live state (profile core fields,
  // attachment metadata) is small text and fits localStorage's shared
  // ~5-10MB quota fine, but a handful of photos/documents would not. This is
  // the first IndexedDB usage in this codebase - kept deliberately minimal
  // (one object store, id-keyed, no indexes/versioning beyond v1) rather
  // than pulling in a wrapper library, matching the app's zero-JS-dependency
  // convention. Callers already know which attachment ids belong to which
  // profile from the localStorage metadata array (agent-profiles-runtime.js),
  // so this module only needs plain id-keyed CRUD, no profileId index.
  var DB_NAME = "netrecon-agent-profile-attachments";
  var DB_VERSION = 1;
  var STORE_NAME = "attachments";

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("indexedDB unavailable"));
        return;
      }
      var request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        dbPromise = null;
        reject(request.error || new Error("failed to open " + DB_NAME));
      };
    });
    return dbPromise;
  }

  function withStore(mode, work) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, mode);
        var store = tx.objectStore(STORE_NAME);
        var result;
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error || new Error("indexedDB transaction failed")); };
        tx.onabort = function () { reject(tx.error || new Error("indexedDB transaction aborted")); };
        result = work(store);
      });
    });
  }

  function putAttachment(id, blob) {
    return withStore("readwrite", function (store) { store.put(blob, id); });
  }

  function getAttachment(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error("failed to read attachment " + id)); };
      });
    });
  }

  function deleteAttachment(id) {
    return withStore("readwrite", function (store) { store.delete(id); });
  }

  function clearAll() {
    return withStore("readwrite", function (store) { store.clear(); });
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.agentProfileAttachmentsDb = {
    putAttachment: putAttachment,
    getAttachment: getAttachment,
    deleteAttachment: deleteAttachment,
    clearAll: clearAll,
  };
})();

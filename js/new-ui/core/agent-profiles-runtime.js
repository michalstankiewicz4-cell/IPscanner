(function () {
  // shell: Agent Profiles - the user's OWN account-creation identities
  // (nickname/email/login/password/note), not OSINT target data. Structurally
  // mirrors pulpit-canvas-runtime.js (localStorage-backed state, per-item
  // CRUD, a "newui:*-changed" CustomEvent on every write) but splits state
  // across TWO localStorage keys - core profile fields stay small text like
  // everything else in this app, while attachment BYTES live only in
  // IndexedDB (agent-profile-attachments-db.js) since photos/files don't fit
  // localStorage's shared ~5-10MB quota. This module only ever stores
  // attachment METADATA in localStorage; the id it assigns is the same id
  // used to key the actual blob in IndexedDB.
  var PROFILES_KEY = "netrecon_agent_profiles_v1";
  var ATTACHMENTS_KEY = "netrecon_agent_profile_attachments_v1";
  var VALID_ROLES = ["photo", "file"];
  // Social-media services: a per-profile repeatable list ("Facebook",
  // "Instagram", ...), each holding a repeatable list of user-named,
  // user-typed fields (label picked freely by the user, type picked at
  // add-time). Same small-text-in-localStorage treatment as profiles - no
  // IndexedDB involved here, unlike attachments, since field values are
  // plain strings, not binary.
  var SERVICES_KEY = "netrecon_agent_profile_services_v1";
  var FIELDS_KEY = "netrecon_agent_profile_service_fields_v1";
  var VALID_FIELD_TYPES = ["text", "password"];

  function safeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function makeId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function makeDefaultState() {
    return { profiles: [], attachments: [], services: [], fields: [] };
  }

  // Security note: password is stored as plain text here (and in the SQLite
  // session file) - no at-rest encryption exists anywhere in this app today
  // (the AI Assistant/Email Recon API key fields are the same, unmasked
  // plain text). Worth being explicit about given this feature's whole
  // point is real, reusable account credentials.
  function sanitizeProfile(item) {
    if (!item || typeof item !== "object") return null;
    return {
      id: safeString(item.id) || makeId("agentprofile"),
      name: safeString(item.name),
      nickname: safeString(item.nickname),
      email: safeString(item.email),
      login: safeString(item.login),
      password: safeString(item.password),
      note: safeString(item.note),
    };
  }

  function sanitizeAttachment(item) {
    if (!item || typeof item !== "object") return null;
    var profileId = safeString(item.profileId);
    if (!profileId) return null;
    return {
      id: safeString(item.id) || makeId("agentattachment"),
      profileId: profileId,
      filename: safeString(item.filename) || "file",
      mimeType: safeString(item.mimeType) || "application/octet-stream",
      role: VALID_ROLES.indexOf(item.role) >= 0 ? item.role : "file",
    };
  }

  function sanitizeService(item) {
    if (!item || typeof item !== "object") return null;
    var profileId = safeString(item.profileId);
    if (!profileId) return null;
    return {
      id: safeString(item.id) || makeId("agentservice"),
      profileId: profileId,
      name: safeString(item.name),
    };
  }

  function sanitizeField(item) {
    if (!item || typeof item !== "object") return null;
    var serviceId = safeString(item.serviceId);
    if (!serviceId) return null;
    return {
      id: safeString(item.id) || makeId("agentfield"),
      serviceId: serviceId,
      label: safeString(item.label),
      type: VALID_FIELD_TYPES.indexOf(item.type) >= 0 ? item.type : "text",
      value: safeString(item.value),
    };
  }

  function cloneState(state) {
    var profiles = (state && Array.isArray(state.profiles) ? state.profiles : [])
      .map(sanitizeProfile)
      .filter(function (p) { return !!p; });
    var attachments = (state && Array.isArray(state.attachments) ? state.attachments : [])
      .map(sanitizeAttachment)
      .filter(function (a) { return !!a; });
    var services = (state && Array.isArray(state.services) ? state.services : [])
      .map(sanitizeService)
      .filter(function (s) { return !!s; });
    var fields = (state && Array.isArray(state.fields) ? state.fields : [])
      .map(sanitizeField)
      .filter(function (f) { return !!f; });

    var seenProfileIds = Object.create(null);
    profiles.forEach(function (p) {
      if (seenProfileIds[p.id]) p.id = makeId("agentprofile");
      seenProfileIds[p.id] = true;
    });
    var seenAttachmentIds = Object.create(null);
    attachments.forEach(function (a) {
      if (seenAttachmentIds[a.id]) a.id = makeId("agentattachment");
      seenAttachmentIds[a.id] = true;
    });
    var seenServiceIds = Object.create(null);
    services.forEach(function (s) {
      if (seenServiceIds[s.id]) s.id = makeId("agentservice");
      seenServiceIds[s.id] = true;
    });
    var seenFieldIds = Object.create(null);
    fields.forEach(function (f) {
      if (seenFieldIds[f.id]) f.id = makeId("agentfield");
      seenFieldIds[f.id] = true;
    });

    // Orphan cleanup: an attachment/service whose profile no longer exists
    // (e.g. a hand-edited localStorage, or a state race) is dropped on
    // every read rather than left to accumulate as unreachable metadata.
    // A field whose service no longer exists cascades the same way, one
    // level deeper - computed AFTER services are cleaned up, so a field
    // belonging to an already-orphaned service is dropped too.
    var profileIds = Object.create(null);
    profiles.forEach(function (p) { profileIds[p.id] = true; });
    attachments = attachments.filter(function (a) { return !!profileIds[a.profileId]; });
    services = services.filter(function (s) { return !!profileIds[s.profileId]; });

    var serviceIds = Object.create(null);
    services.forEach(function (s) { serviceIds[s.id] = true; });
    fields = fields.filter(function (f) { return !!serviceIds[f.serviceId]; });

    return { profiles: profiles, attachments: attachments, services: services, fields: fields };
  }

  function sanitizeState(raw) {
    return cloneState(raw && typeof raw === "object" ? raw : makeDefaultState());
  }

  function loadState() {
    try {
      var profilesRaw = window.localStorage ? window.localStorage.getItem(PROFILES_KEY) : "";
      var attachmentsRaw = window.localStorage ? window.localStorage.getItem(ATTACHMENTS_KEY) : "";
      var servicesRaw = window.localStorage ? window.localStorage.getItem(SERVICES_KEY) : "";
      var fieldsRaw = window.localStorage ? window.localStorage.getItem(FIELDS_KEY) : "";
      return sanitizeState({
        profiles: profilesRaw ? JSON.parse(profilesRaw) : [],
        attachments: attachmentsRaw ? JSON.parse(attachmentsRaw) : [],
        services: servicesRaw ? JSON.parse(servicesRaw) : [],
        fields: fieldsRaw ? JSON.parse(fieldsRaw) : [],
      });
    } catch (_) {
      return sanitizeState(makeDefaultState());
    }
  }

  function saveState(state) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles));
      window.localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(state.attachments));
      window.localStorage.setItem(SERVICES_KEY, JSON.stringify(state.services));
      window.localStorage.setItem(FIELDS_KEY, JSON.stringify(state.fields));
    } catch (_) {
      // ignore persistence failures
    }
  }

  var currentState = loadState();

  function emitChanged() {
    try {
      document.dispatchEvent(new CustomEvent("newui:agent-profiles-changed", { detail: getState() }));
    } catch (_) {
      // ignore event dispatch failures
    }
  }

  function getState() {
    return cloneState(currentState);
  }

  function replaceState(nextState) {
    currentState = sanitizeState(nextState);
    saveState(currentState);
    emitChanged();
    return getState();
  }

  function findProfile(state, id) {
    return state.profiles.find(function (p) { return p.id === id; }) || null;
  }

  function addProfile(fields) {
    var next = cloneState(currentState);
    var profile = sanitizeProfile(Object.assign({}, fields));
    if (!profile) return "";
    next.profiles.push(profile);
    replaceState(next);
    return profile.id;
  }

  function updateProfile(id, patch) {
    var next = cloneState(currentState);
    var profile = findProfile(next, id);
    if (!profile) return;
    var merged = sanitizeProfile(Object.assign({}, profile, patch, { id: profile.id }));
    if (!merged) return;
    next.profiles = next.profiles.map(function (p) { return p.id === id ? merged : p; });
    replaceState(next);
  }

  function getAttachmentsDb() {
    return (window.NetReconNewUICore && window.NetReconNewUICore.agentProfileAttachmentsDb) || null;
  }

  function removeProfile(id) {
    var next = cloneState(currentState);
    var toRemove = next.attachments.filter(function (a) { return a.profileId === id; });
    var servicesToRemove = next.services.filter(function (s) { return s.profileId === id; }).map(function (s) { return s.id; });
    next.profiles = next.profiles.filter(function (p) { return p.id !== id; });
    next.attachments = next.attachments.filter(function (a) { return a.profileId !== id; });
    next.services = next.services.filter(function (s) { return s.profileId !== id; });
    next.fields = next.fields.filter(function (f) { return servicesToRemove.indexOf(f.serviceId) === -1; });
    replaceState(next);
    // IndexedDB has no foreign keys - cascade the blob deletes explicitly,
    // mirroring the SQL session-file schema's ON DELETE CASCADE. Services/
    // fields have no IndexedDB counterpart (plain strings only), so their
    // cascade above is fully synchronous, unlike this one.
    var db = getAttachmentsDb();
    if (db) {
      toRemove.forEach(function (a) {
        db.deleteAttachment(a.id).catch(function () { /* best-effort */ });
      });
    }
  }

  function findService(state, id) {
    return state.services.find(function (s) { return s.id === id; }) || null;
  }

  // `defaultFields` (optional array of {label,type,value}) is applied
  // atomically in the SAME replaceState call, only when this is the
  // profile's first service - one write/one changed-event instead of
  // three. Callers (wireAgentProfileDetail) resolve default labels via
  // tr("agentProfileLoginLabel")/tr("agentProfilePasswordLabel") - this
  // module stays tr()-agnostic, matching its existing design.
  function addService(profileId, overrides, defaultFields) {
    var next = cloneState(currentState);
    var isFirst = !next.services.some(function (s) { return s.profileId === profileId; });
    var service = sanitizeService(Object.assign({}, overrides, { profileId: profileId }));
    if (!service) return "";
    next.services.push(service);
    if (isFirst && Array.isArray(defaultFields)) {
      defaultFields.forEach(function (f) {
        var field = sanitizeField(Object.assign({}, f, { serviceId: service.id }));
        if (field) next.fields.push(field);
      });
    }
    replaceState(next);
    return service.id;
  }

  function updateService(id, patch) {
    var next = cloneState(currentState);
    var service = findService(next, id);
    if (!service) return;
    var merged = sanitizeService(Object.assign({}, service, patch, { id: service.id }));
    if (!merged) return;
    next.services = next.services.map(function (s) { return s.id === id ? merged : s; });
    replaceState(next);
  }

  function removeService(id) {
    var next = cloneState(currentState);
    next.services = next.services.filter(function (s) { return s.id !== id; });
    next.fields = next.fields.filter(function (f) { return f.serviceId !== id; });
    replaceState(next);
  }

  function findFieldItem(state, id) {
    return state.fields.find(function (f) { return f.id === id; }) || null;
  }

  function addField(serviceId, overrides) {
    var next = cloneState(currentState);
    var field = sanitizeField(Object.assign({}, overrides, { serviceId: serviceId }));
    if (!field) return "";
    next.fields.push(field);
    replaceState(next);
    return field.id;
  }

  function updateField(id, patch) {
    var next = cloneState(currentState);
    var field = findFieldItem(next, id);
    if (!field) return;
    var merged = sanitizeField(Object.assign({}, field, patch, { id: field.id }));
    if (!merged) return;
    next.fields = next.fields.map(function (f) { return f.id === id ? merged : f; });
    replaceState(next);
  }

  function removeField(id) {
    var next = cloneState(currentState);
    next.fields = next.fields.filter(function (f) { return f.id !== id; });
    replaceState(next);
  }

  function addAttachmentMeta(meta) {
    var next = cloneState(currentState);
    var attachment = sanitizeAttachment(Object.assign({}, meta));
    if (!attachment) return "";
    // At most one photo per profile - replace (including its IndexedDB
    // blob) rather than accumulate.
    if (attachment.role === "photo") {
      var existingPhoto = next.attachments.find(function (a) {
        return a.profileId === attachment.profileId && a.role === "photo";
      });
      if (existingPhoto) {
        next.attachments = next.attachments.filter(function (a) { return a.id !== existingPhoto.id; });
        var db = getAttachmentsDb();
        if (db) db.deleteAttachment(existingPhoto.id).catch(function () {});
      }
    }
    next.attachments.push(attachment);
    replaceState(next);
    return attachment.id;
  }

  function removeAttachmentMeta(id) {
    var next = cloneState(currentState);
    next.attachments = next.attachments.filter(function (a) { return a.id !== id; });
    replaceState(next);
  }

  // Async glue: caller already picked a file (desktop native dialog or web
  // <input type=file>, see wireAgentProfileDetail in
  // panel-interactions-runtime.js) and hands over its bytes as a Blob here -
  // this stores the blob in IndexedDB, then records metadata via
  // addAttachmentMeta. Kept in this module (not the DOM-wiring layer) so the
  // file-picking mechanics stay swappable without touching state code.
  function addAttachmentFromBlob(profileId, role, filename, mimeType, blob) {
    var db = getAttachmentsDb();
    if (!db) return Promise.reject(new Error("attachments db unavailable"));
    var id = makeId("agentattachment");
    return db.putAttachment(id, blob).then(function () {
      return addAttachmentMeta({ id: id, profileId: profileId, filename: filename, mimeType: mimeType, role: role });
    });
  }

  function removeAttachment(id) {
    var db = getAttachmentsDb();
    removeAttachmentMeta(id);
    if (db) return db.deleteAttachment(id).catch(function () {});
    return Promise.resolve();
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.agentProfiles = {
    getState: getState,
    replaceState: replaceState,
    addProfile: addProfile,
    updateProfile: updateProfile,
    removeProfile: removeProfile,
    addAttachmentMeta: addAttachmentMeta,
    removeAttachmentMeta: removeAttachmentMeta,
    addAttachmentFromBlob: addAttachmentFromBlob,
    removeAttachment: removeAttachment,
    addService: addService,
    updateService: updateService,
    removeService: removeService,
    addField: addField,
    updateField: updateField,
    removeField: removeField,
  };
})();

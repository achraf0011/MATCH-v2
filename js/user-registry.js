'use strict';

/**
 * UserRegistry — localStorage-based user directory.
 *
 * Every time a user sets their nickname, they are registered here.
 * All registered users are searchable instantly.
 * Each entry: { id, nickname, online, lastSeen, registeredAt }
 *
 * Cross-tab sync via BroadcastChannel (if available) so new users
 * show up across tabs without a full refresh.
 */
(function () {
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var Storage = window.Storage;

  var KEY = KEYS.CHAT_USERS_REGISTRY;
  var channel = null;
  var listeners = []; // onChange callbacks

  /* ── persistence helpers ──────────────── */
  function loadAll() {
    var raw = Storage.getItem(KEY);
    if (Array.isArray(raw)) return raw;
    return [];
  }

  function saveAll(users) {
    Storage.setItem(KEY, users);
    broadcast({ type: 'registry-update' });
  }

  /* ── BroadcastChannel for cross-tab sync ── */
  function initChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('madarik_user_registry');
        channel.onmessage = function (e) {
          if (e.data && e.data.type === 'registry-update') {
            notifyListeners();
          }
        };
      }
    } catch (err) { /* BroadcastChannel unavailable — single-tab only */ }
  }

  function broadcast(msg) {
    if (channel) {
      try { channel.postMessage(msg); } catch (e) {}
    }
  }

  function notifyListeners() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
  }

  /* ── public API ───────────────────────── */

  /**
   * Register or update a user in the directory.
   * Returns the user object.
   */
  function registerUser(id, nickname) {
    if (!id || !nickname) return null;
    var users = loadAll();
    var existing = users.find(function (u) { return u.id === id; });
    var now = Date.now();
    if (existing) {
      existing.nickname = nickname;
      existing.online = true;
      existing.lastSeen = now;
    } else {
      users.push({
        id: id,
        nickname: nickname,
        online: true,
        lastSeen: now,
        registeredAt: now
      });
    }
    saveAll(users);
    notifyListeners();
    return existing || users[users.length - 1];
  }

  /**
   * Mark the current user as online and update lastSeen.
   */
  function heartbeat(id) {
    if (!id) return;
    var users = loadAll();
    var u = users.find(function (u) { return u.id === id; });
    if (u) {
      u.online = true;
      u.lastSeen = Date.now();
      saveAll(users);
    }
  }

  /**
   * Mark user as offline.
   */
  function setOffline(id) {
    if (!id) return;
    var users = loadAll();
    var u = users.find(function (u) { return u.id === id; });
    if (u) {
      u.online = false;
      u.lastSeen = Date.now();
      saveAll(users);
    }
  }

  /**
   * Search users by nickname query. Returns matched users excluding selfId.
   */
  function search(query, selfId) {
    var users = loadAll();
    var q = (query || '').trim().toLowerCase();
    return users.filter(function (u) {
      if (selfId && u.id === selfId) return false;
      if (!q) return true; // empty query = all users
      return u.nickname.toLowerCase().indexOf(q) !== -1;
    });
  }

  /**
   * Get all users except self.
   */
  function getAll(selfId) {
    return search('', selfId);
  }

  /**
   * Get a single user by ID.
   */
  function getById(id) {
    var users = loadAll();
    return users.find(function (u) { return u.id === id; }) || null;
  }

  /**
   * Check if a nickname is already taken (by a different user).
   */
  function isNicknameTaken(nickname, selfId) {
    var users = loadAll();
    var nick = nickname.trim().toLowerCase();
    return users.some(function (u) {
      return u.id !== selfId && u.nickname.toLowerCase() === nick;
    });
  }

  /**
   * Subscribe to registry changes.
   */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /* ── init ─────────────────────────────── */
  initChannel();

  // Mark stale users as offline (> 5 min without heartbeat)
  var STALE_MS = 5 * 60 * 1000;
  var users = loadAll();
  var now = Date.now();
  var changed = false;
  users.forEach(function (u) {
    if (u.online && u.lastSeen && (now - u.lastSeen > STALE_MS)) {
      u.online = false;
      changed = true;
    }
  });
  if (changed) Storage.setItem(KEY, users);

  window.UserRegistry = {
    registerUser: registerUser,
    heartbeat: heartbeat,
    setOffline: setOffline,
    search: search,
    getAll: getAll,
    getById: getById,
    isNicknameTaken: isNicknameTaken,
    onChange: onChange
  };
})();

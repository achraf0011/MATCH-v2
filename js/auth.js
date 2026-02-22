'use strict';

/**
 * Admin auth: secure session storage with expiry. No password stored.
 * Session timeout after ADMIN_SESSION_TIMEOUT_MS; refresh on activity.
 */
(function () {
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var CREDS = window.APP_CONFIG.CREDS;
  var TIMEOUT_MS = window.APP_CONFIG.ADMIN_SESSION_TIMEOUT_MS || (30 * 60 * 1000);
  var Storage = window.Storage;

  var isAdmin = false;

  function getSession() {
    var raw = Storage.getItem(KEYS.ADMIN);
    if (raw === '1' || raw === true || raw === 1) {
      persistSession(true);
      return { exp: Date.now() + TIMEOUT_MS };
    }
    if (!raw || typeof raw !== 'object' || !raw.exp) return null;
    if (raw.exp <= Date.now()) return null;
    return raw;
  }

  function persistSession(active) {
    if (!active) {
      Storage.setItem(KEYS.ADMIN, { exp: 0 });
      return;
    }
    Storage.setItem(KEYS.ADMIN, { exp: Date.now() + TIMEOUT_MS });
  }

  function load() {
    var s = getSession();
    isAdmin = !!s;
  }

  function refreshSession() {
    if (!isAdmin) return;
    persistSession(true);
  }

  function getIsAdmin() {
    var s = getSession();
    if (!s) {
      isAdmin = false;
      return false;
    }
    isAdmin = true;
    return true;
  }

  function setAdmin(value) {
    isAdmin = !!value;
    persistSession(isAdmin);
  }

  function doLogin(email, pass) {
    var emailNorm = (email || '').trim().toLowerCase();
    var passNorm = (pass || '').trim();
    var expectedEmail = (CREDS.email || '').trim().toLowerCase();
    var expectedPass = (CREDS.pass || '').trim();
    var ok = expectedEmail.length > 0 && expectedPass.length > 0 &&
             emailNorm === expectedEmail && passNorm === expectedPass;
    if (ok) {
      isAdmin = true;
      persistSession(true);
      if (window.Modals) window.Modals.toast('✅ مرحبًا! تم تسجيل الدخول بنجاح', 'ok');
    } else {
      if (window.Modals) window.Modals.toast('❌ البريد الإلكتروني أو كلمة المرور غير صحيحة', 'err');
    }
    return ok;
  }

  function doLogout() {
    if (!confirm('هل تريد تسجيل الخروج من لوحة التحكم؟')) return false;
    isAdmin = false;
    persistSession(false);
    if (window.Modals) window.Modals.toast('تم تسجيل الخروج', 'inf');
    return true;
  }

  function updateAdminUI() {
    isAdmin = getIsAdmin();
    var btn = document.getElementById('admin-login-btn');
    var badge = document.getElementById('admin-badge');
    if (!btn) return;
    if (isAdmin) {
      btn.textContent = '🚪 تسجيل الخروج';
      btn.classList.add('logout');
      if (badge) badge.classList.add('show');
      document.body.classList.add('admin-active');
    } else {
      btn.textContent = '🔐 دخول المسؤول';
      btn.classList.remove('logout');
      if (badge) badge.classList.remove('show');
      document.body.classList.remove('admin-active');
    }
    // Sync mobile menu admin button (injected by navbar.js)
    var mobBtn = document.getElementById('mob-admin-btn');
    if (mobBtn) {
      if (isAdmin) {
        mobBtn.textContent = '🚪 تسجيل الخروج';
        mobBtn.classList.add('logout');
      } else {
        mobBtn.textContent = '🔐 دخول المسؤول';
        mobBtn.classList.remove('logout');
      }
    }
  }

  load();
  window.Auth = {
    getIsAdmin: getIsAdmin,
    setAdmin: setAdmin,
    doLogin: doLogin,
    doLogout: doLogout,
    updateAdminUI: updateAdminUI,
    refreshSession: refreshSession
  };
})();

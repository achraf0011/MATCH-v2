'use strict';

/**
 * Bootstrap: bind modal buttons (login, submit forms), close buttons, then init app.
 */
(function () {
  var Modals = window.Modals;
  var Auth = window.Auth;
  var App = window.App;
  var Navbar = window.Navbar;
  var Chat = window.Chat;
  var Pages = window.Pages;

  function bindLogin() {
    var btn = document.getElementById('btn-do-login');
    var emailEl = document.getElementById('l-email');
    var passEl = document.getElementById('l-pass');
    function doLogin(e) {
      if (e && e.preventDefault) e.preventDefault();
      var email = emailEl ? emailEl.value.trim().toLowerCase() : '';
      var pass = passEl ? passEl.value.trim() : '';
      if (!email) {
        Modals.toast('❌ أدخل البريد الإلكتروني', 'err');
        if (emailEl) emailEl.focus();
        return;
      }
      if (!pass) {
        Modals.toast('❌ أدخل كلمة المرور', 'err');
        if (passEl) passEl.focus();
        return;
      }
      if (Auth.doLogin(email, pass)) {
        if (emailEl) emailEl.value = '';
        if (passEl) passEl.value = '';
        Modals.close('m-login');
        if (Auth.refreshSession) Auth.refreshSession();
        Auth.updateAdminUI();
        App.render();
      } else {
        if (passEl) { passEl.value = ''; passEl.focus(); }
      }
    }
    if (btn) btn.addEventListener('click', function (e) { doLogin(e); });
    if (passEl) passEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doLogin(e); }
    });
    var loginOverlay = document.getElementById('m-login');
    if (loginOverlay) {
      var form = loginOverlay.querySelector('form');
      if (form) form.addEventListener('submit', function (e) { e.preventDefault(); doLogin(e); });
    }
  }

  function bindCloseButtons() {
    document.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-close');
        if (id) Modals.close(id);
      });
    });
  }

  function bindModalSubmits() {
    var submitVideo = document.getElementById('btn-submit-video');
    if (submitVideo) submitVideo.addEventListener('click', function (e) { e.preventDefault(); Pages.submitVideo(); });
    var submitPdf = document.getElementById('btn-submit-pdf');
    if (submitPdf) submitPdf.addEventListener('click', function (e) { e.preventDefault(); Pages.submitPDF(); });
    var submitEx = document.getElementById('btn-submit-ex');
    if (submitEx) submitEx.addEventListener('click', function (e) { e.preventDefault(); Pages.submitExercise(); });
    var submitTest = document.getElementById('btn-submit-test');
    if (submitTest) submitTest.addEventListener('click', function (e) { e.preventDefault(); Pages.submitTest(); });
  }

  Modals.init();
  bindCloseButtons();
  bindLogin();
  bindModalSubmits();
  App.init();

  // Populate subject dropdowns in admin modals
  (function () {
    var subjects = Pages.getSubjects ? Pages.getSubjects() : [];
    var dropdownIds = ['f-vsubject', 'f-psubject', 'f-exsubject', 'f-testsubject'];
    dropdownIds.forEach(function (id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      subjects.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.icon + ' ' + s.name;
        sel.appendChild(opt);
      });
    });
  })();

  Navbar.init();
  Chat.init();
  App.nav('home');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();

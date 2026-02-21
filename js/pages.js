'use strict';

/**
 * Page renderers and handlers. Uses IndexedDB for PDF blobs (no broken URLs on refresh).
 */
(function () {
  var App = window.App;
  var Auth = window.Auth;
  var Modals = window.Modals;
  var Storage = window.Storage;
  var Utils = window.Utils;
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var MAX_PDF_MB = window.APP_CONFIG.MAX_PDF_MB || 20;

  function adminBar(addLabel, addOnClick, modalId) {
    if (!Auth.getIsAdmin()) return '';
    return '<div class="admin-bar">' +
      '<span class="admin-bar-label">🛡 وضع المسؤول</span>' +
      '<button class="btn btn-primary btn-sm" type="button" data-admin-add="' + (modalId || '') + '">' + (addLabel || 'إضافة') + '</button>' +
      '<button class="btn btn-danger btn-sm admin-logout-btn" type="button">🚪 تسجيل الخروج</button>' +
      '</div>';
  }

  function bindAdminBarEvents(modalId) {
    var bar = document.querySelector('.admin-bar');
    if (!bar) return;
    var addBtn = bar.querySelector('.btn-primary');
    if (addBtn) addBtn.addEventListener('click', function () {
      if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
      Modals.open(modalId);
    });
    var logoutBtn = bar.querySelector('.admin-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      if (Auth.doLogout()) App.render();
    });
  }

  function safeFilename(name) {
    if (!name || typeof name !== 'string') return 'document';
    return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'document';
  }

  function docDownloadUrl(id, filename, openInNewTab) {
    if (!id) {
      Modals.toast('❌ الملف غير متوفر', 'err');
      return;
    }
    Modals.toast(openInNewTab ? 'جاري فتح الملف…' : 'جاري التحميل…', 'inf');
    Storage.getBlob(id).then(function (blob) {
      if (!blob) {
        Modals.toast('❌ الملف غير متوفر', 'err');
        return;
      }
      var url = URL.createObjectURL(blob);
      var fn = safeFilename(filename) + '.pdf';
      if (openInNewTab) {
        try {
          window.open(url, '_blank');
        } catch (err) {
          Modals.toast('❌ تعذر فتح الملف', 'err');
          URL.revokeObjectURL(url);
          return;
        }
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        Modals.toast('✅ تم فتح الملف', 'ok');
      } else {
        try {
          var a = document.createElement('a');
          a.href = url;
          a.download = fn;
          a.setAttribute('download', fn);
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (err) {
          Modals.toast('❌ تعذر بدء التحميل', 'err');
        }
        URL.revokeObjectURL(url);
        Modals.toast('✅ تم بدء التحميل', 'ok');
      }
    }).catch(function (err) {
      Modals.toast('❌ خطأ في تحميل الملف', 'err');
    });
  }

  function renderDocList(items, type, iconClass, sectionTitle, countLabel, emptyMsg, addModalId, addLabel, delCb) {
    var isAdmin = Auth.getIsAdmin();
    var adminBarHtml = adminBar(addLabel, null, addModalId);
    var listHtml;
    if (!items || items.length === 0) {
      listHtml = '<div class="empty"><span class="empty-icon">' + (type === 'pdf' ? '📄' : type === 'ex' ? '📝' : '📋') + '</span><p>' + emptyMsg + '</p></div>';
    } else {
      listHtml = items.map(function (item, i) {
        var hasFile = !!item.id;
        var actions = '<div class="doc-actions">';
        if (hasFile) {
          actions += '<button type="button" class="btn-download" data-doc-id="' + Utils.esc(item.id) + '" data-doc-title="' + Utils.esc(item.title) + '">⬇ تحميل</button>';
          actions += ' <button type="button" class="btn btn-ghost btn-sm btn-open-pdf" data-doc-id="' + Utils.esc(item.id) + '" data-doc-title="' + Utils.esc(item.title) + '">عرض</button>';
        } else {
          actions += '<span class="btn-coming">قريبًا…</span>';
        }
        if (isAdmin) actions += '<button class="doc-del" type="button" data-index="' + i + '" title="حذف">🗑</button>';
        actions += '</div>';
        return '<div class="doc-item">' +
          '<div class="doc-icon ' + iconClass + '">' + (type === 'pdf' ? '📄' : type === 'ex' ? '📝' : '📋') + '</div>' +
          '<div class="doc-body"><div class="doc-title">' + Utils.esc(item.title) + '</div><div class="doc-desc">' + Utils.esc(item.desc) + '</div></div>' +
          actions + '</div>';
      }).join('');
    }
    var html = '<div class="sec-header">' +
      '<div class="sec-icon">' + (type === 'pdf' ? '📄' : type === 'ex' ? '📝' : '📋') + '</div>' +
      '<h2>' + sectionTitle + '</h2>' +
      '<span class="sec-count">' + (items ? items.length : 0) + '</span></div>' +
      adminBarHtml +
      '<div class="doc-list">' + listHtml + '</div>';
    var page = document.getElementById('page');
    if (!page) return;
    page.innerHTML = html;

    bindAdminBarEvents(addModalId);
    page.querySelectorAll('.btn-download').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        docDownloadUrl(btn.getAttribute('data-doc-id'), btn.getAttribute('data-doc-title'), false);
      });
    });
    page.querySelectorAll('.btn-open-pdf').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        docDownloadUrl(btn.getAttribute('data-doc-id'), btn.getAttribute('data-doc-title'), true);
      });
    });
    page.querySelectorAll('.doc-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-index'), 10);
        if (!isNaN(idx) && delCb) delCb(idx);
      });
    });
  }

  /** Homepage layout and copy match original الاولى_اعدادي_FINAL_v2.html */
  function renderHome() {
    var v = App.getVideos();
    var p = App.getPdfList();
    var ex = App.getExercisesList();
    var t = App.getTestsList();
    var levelTitle = (App.getLevelTitle && App.getLevelTitle()) ? App.getLevelTitle() : 'مدارك التعليمية';
    var html = '<div class="home-hero">' +
      '<div class="home-badge">🎓 ' + Utils.esc(levelTitle) + ' · مدارك التعليمية</div>' +
      '<h1>منصتك التعليمية الشاملة</h1>' +
      '<p>كل ما تحتاجه من دروس، تمارين، وامتحانات تجريبية في مكان واحد</p>' +
      '<div class="home-grid">' +
      '<div class="home-card" data-section="video"><span class="hc-icon">🎬</span><div class="hc-title">شرح بالفيديو</div><div class="hc-count">' + (v ? v.length : 0) + ' فيديو</div></div>' +
      '<div class="home-card" data-section="pdf"><span class="hc-icon">📄</span><div class="hc-title">تحميل PDF</div><div class="hc-count">' + (p ? p.length : 0) + ' ملف</div></div>' +
      '<div class="home-card" data-section="exercises"><span class="hc-icon">📝</span><div class="hc-title">سلاسل التمارين</div><div class="hc-count">' + (ex ? ex.length : 0) + ' سلسلة</div></div>' +
      '<div class="home-card" data-section="tests"><span class="hc-icon">📋</span><div class="hc-title">الامتحانات التجريبية</div><div class="hc-count">' + (t ? t.length : 0) + ' امتحان</div></div>' +
      '</div></div>';
    var page = document.getElementById('page');
    if (!page) return;
    page.innerHTML = html;
    page.querySelectorAll('.home-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var s = card.getAttribute('data-section');
        if (s) App.nav(s);
      });
    });
  }

  function extractYTID(url) {
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function renderVideos() {
    var videos = App.getVideos();
    var isAdmin = Auth.getIsAdmin();
    var adminBarHtml = adminBar('➕ إضافة فيديو جديد', null, 'm-video');
    var cards = videos.length ? videos.map(function (v, i) {
      return '<div class="vid-card" data-video-id="' + Utils.esc(v.id) + '">' +
        '<div class="vid-thumb">' +
        '<img src="https://img.youtube.com/vi/' + Utils.esc(v.id) + '/hqdefault.jpg" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<div class="vid-play"></div></div>' +
        (isAdmin ? '<button class="vid-del" type="button" data-video-index="' + i + '" title="حذف">🗑</button>' : '') +
        '<div class="vid-info"><div class="vid-title">' + Utils.esc(v.title) + '</div><div class="vid-desc">' + Utils.esc(v.desc) + '</div></div></div>';
    }).join('') : '<div class="empty" style="grid-column:1/-1"><span class="empty-icon">🎬</span><p>لا توجد فيديوهات بعد.' + (isAdmin ? ' أضف أول فيديو باستخدام الزر أعلاه.' : '') + '</p></div>';
    var html = '<div class="sec-header"><div class="sec-icon">🎬</div><h2>شرح بالفيديو</h2><span class="sec-count">' + videos.length + '</span></div>' +
      adminBarHtml + '<div class="video-grid">' + cards + '</div>';
    var page = document.getElementById('page');
    if (page) page.innerHTML = html;
    bindAdminBarEvents('m-video');
    page.querySelectorAll('.vid-card[data-video-id]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.vid-del')) return;
        var id = card.getAttribute('data-video-id');
        if (id) window.open('https://www.youtube.com/watch?v=' + id, '_blank');
      });
    });
    page.querySelectorAll('.vid-del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var i = parseInt(btn.getAttribute('data-video-index'), 10);
        if (!confirm('هل تريد حذف هذا الفيديو نهائيًا؟')) return;
        var v = App.getVideos();
        v.splice(i, 1);
        App.setVideos(v);
        Modals.toast('تم حذف الفيديو', 'inf');
        App.render();
      });
    });
  }

  function renderPDFs() {
    var list = App.getPdfList();
    renderDocList(list, 'pdf', 'pdf', 'تحميل PDF', list.length, 'لا توجد ملفات PDF بعد.', 'm-pdf', '📤 رفع ملف PDF', function (i) {
      if (!confirm('هل تريد حذف هذا الملف؟')) return;
      var item = list[i];
      if (item && item.id) Storage.deleteBlob(item.id).catch(function () {});
      list.splice(i, 1);
      App.setPdfList(list);
      Modals.toast('تم الحذف', 'inf');
      App.render();
    });
  }

  function renderExercises() {
    var list = App.getExercisesList();
    renderDocList(list, 'ex', 'ex', 'سلاسل التمارين', list.length, 'لا توجد سلاسل بعد.', 'm-ex', '➕ إضافة سلسلة', function (i) {
      if (!confirm('هل تريد حذف هذه السلسلة؟')) return;
      var item = list[i];
      if (item && item.id) Storage.deleteBlob(item.id).catch(function () {});
      list.splice(i, 1);
      App.setExercisesList(list);
      Modals.toast('تم الحذف', 'inf');
      App.render();
    });
  }

  function renderTests() {
    var list = App.getTestsList();
    renderDocList(list, 'test', 'test', 'الامتحانات التجريبية', list.length, 'لا توجد امتحانات بعد.', 'm-test', '➕ إضافة امتحان', function (i) {
      if (!confirm('هل تريد حذف هذا الامتحان؟')) return;
      var item = list[i];
      if (item && item.id) Storage.deleteBlob(item.id).catch(function () {});
      list.splice(i, 1);
      App.setTestsList(list);
      Modals.toast('تم الحذف', 'inf');
      App.render();
    });
  }

  function submitVideo() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var urlEl = document.getElementById('f-vurl');
    var titleEl = document.getElementById('f-vtitle');
    var descEl = document.getElementById('f-vdesc');
    var url = urlEl && urlEl.value ? urlEl.value.trim() : '';
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    if (!url || !title) { Modals.toast('❌ الرجاء تعبئة الحقول المطلوبة', 'err'); return; }
    var id = extractYTID(url);
    if (!id) { Modals.toast('❌ رابط YouTube غير صحيح.', 'err'); return; }
    var videos = App.getVideos();
    videos.unshift({ id: id, title: title, desc: desc || 'درس تعليمي' });
    App.setVideos(videos);
    if (urlEl) urlEl.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    Modals.close('m-video');
    if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
    Modals.toast('✅ تم إضافة الفيديو بنجاح!', 'ok');
    App.render();
  }

  function makeId(prefix) {
    var level = (window.App && window.App.getCurrentLevel) ? window.App.getCurrentLevel() : '';
    return (level ? level + '_' : '') + prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function submitPDF() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var fileEl = document.getElementById('f-pfile');
    var titleEl = document.getElementById('f-ptitle');
    var descEl = document.getElementById('f-pdesc');
    var file = fileEl && fileEl.files && fileEl.files[0];
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    if (!title) { Modals.toast('❌ أدخل عنوان الملف', 'err'); return; }
    if (!file) {
      var list = App.getPdfList();
      list.unshift({ id: null, title: title, desc: desc || 'ملف درس' });
      App.setPdfList(list);
    } else {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        Modals.toast('❌ يجب أن يكون الملف من نوع PDF', 'err');
        return;
      }
      if (file.size > MAX_PDF_MB * 1024 * 1024) {
        Modals.toast('❌ حجم الملف يتجاوز ' + MAX_PDF_MB + ' ميجابايت', 'err');
        return;
      }
      var id = makeId('pdf');
      Storage.putBlob(id, file).then(function () {
        var list = App.getPdfList();
        list.unshift({ id: id, title: title, desc: desc || 'ملف درس' });
        App.setPdfList(list);
        if (fileEl) fileEl.value = '';
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
        Modals.close('m-pdf');
        if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
        Modals.toast('✅ تم رفع "' + title + '" بنجاح!', 'ok');
        App.render();
      }).catch(function () {
        Modals.toast('❌ فشل حفظ الملف', 'err');
      });
      return;
    }
    if (fileEl) fileEl.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    Modals.close('m-pdf');
    if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
    Modals.toast('✅ تمت الإضافة بنجاح!', 'ok');
    App.render();
  }

  function submitExercise() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var fileEl = document.getElementById('f-exfile');
    var titleEl = document.getElementById('f-extitle');
    var descEl = document.getElementById('f-exdesc');
    var file = fileEl && fileEl.files && fileEl.files[0];
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    if (!title) { Modals.toast('❌ أدخل عنوان السلسلة', 'err'); return; }
    if (!file) {
      var list = App.getExercisesList();
      list.unshift({ id: null, title: title, desc: desc || 'سلسلة تمارين' });
      App.setExercisesList(list);
    } else {
      var id = makeId('ex');
      Storage.putBlob(id, file).then(function () {
        var list = App.getExercisesList();
        list.unshift({ id: id, title: title, desc: desc || 'سلسلة تمارين' });
        App.setExercisesList(list);
        if (fileEl) fileEl.value = '';
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
        Modals.close('m-ex');
        if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
        Modals.toast('✅ تم إضافة السلسلة بنجاح!', 'ok');
        App.render();
      }).catch(function () {
        Modals.toast('❌ فشل حفظ الملف', 'err');
      });
      return;
    }
    if (fileEl) fileEl.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    Modals.close('m-ex');
    if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
    Modals.toast('✅ تم إضافة السلسلة بنجاح!', 'ok');
    App.render();
  }

  function submitTest() {
    if (!Auth.getIsAdmin()) { Modals.toast('غير مصرح. يرجى تسجيل الدخول كمسؤول.', 'err'); return; }
    var fileEl = document.getElementById('f-testfile');
    var titleEl = document.getElementById('f-testtitle');
    var descEl = document.getElementById('f-testdesc');
    var file = fileEl && fileEl.files && fileEl.files[0];
    var title = titleEl && titleEl.value ? titleEl.value.trim() : '';
    var desc = descEl && descEl.value ? descEl.value.trim() : '';
    if (!title) { Modals.toast('❌ أدخل عنوان الامتحان', 'err'); return; }
    if (!file) {
      var list = App.getTestsList();
      list.unshift({ id: null, title: title, desc: desc || 'امتحان تجريبي' });
      App.setTestsList(list);
    } else {
      var id = makeId('test');
      Storage.putBlob(id, file).then(function () {
        var list = App.getTestsList();
        list.unshift({ id: id, title: title, desc: desc || 'امتحان تجريبي' });
        App.setTestsList(list);
        if (fileEl) fileEl.value = '';
        if (titleEl) titleEl.value = '';
        if (descEl) descEl.value = '';
        Modals.close('m-test');
        if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
        Modals.toast('✅ تم إضافة الامتحان بنجاح!', 'ok');
        App.render();
      }).catch(function () {
        Modals.toast('❌ فشل حفظ الملف', 'err');
      });
      return;
    }
    if (fileEl) fileEl.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    Modals.close('m-test');
    if (window.Auth && window.Auth.refreshSession) window.Auth.refreshSession();
    Modals.toast('✅ تم إضافة الامتحان بنجاح!', 'ok');
    App.render();
  }

  function render(section) {
    if (section === 'home') renderHome();
    else if (section === 'video') renderVideos();
    else if (section === 'pdf') renderPDFs();
    else if (section === 'exercises') renderExercises();
    else if (section === 'tests') renderTests();
  }

  window.Pages = {
    render: render,
    submitVideo: submitVideo,
    submitPDF: submitPDF,
    submitExercise: submitExercise,
    submitTest: submitTest
  };
})();

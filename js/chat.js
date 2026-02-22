'use strict';

/**
 * Chat: real users only. Messages persist per user (deviceId) in localStorage.
 * No fake accounts. XSS-safe rendering (textContent). Media validation and permission toasts.
 */
(function () {
  var KEYS = window.APP_CONFIG.STORAGE_KEYS;
  var Storage = window.Storage;
  var Utils = window.Utils;
  var MAX_IMG_MB = (window.APP_CONFIG && window.APP_CONFIG.MAX_IMG_MB) || 5;
  var MAX_AUDIO_MB = (window.APP_CONFIG && window.APP_CONFIG.MAX_AUDIO_MB) || 10;
  var ALLOWED_IMAGE_TYPES = (window.APP_CONFIG && window.APP_CONFIG.ALLOWED_IMAGE_TYPES) || ['image/png', 'image/jpeg', 'image/webp'];
  var ALLOWED_AUDIO_TYPES = (window.APP_CONFIG && window.APP_CONFIG.ALLOWED_AUDIO_TYPES) || ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm'];

  var chatOpen = false;
  var selContact = null;
  var contacts = [];
  var convos = {};
  var MAX_RECORD_MS = 5 * 60 * 1000; // 5 min
  // cachedStream keeps mic open between recordings so browser never re-prompts permission
  var recState = { active: false, recorder: null, stream: null, cachedStream: null, chunks: [], timer: null };
  // Active message-type filter for the sidebar filter pills
  var activeFilter = 'all'; // 'all' | 'text' | 'image' | 'audio'
  // Track whether we are in user-search mode inside the sidebar
  var searchPanelOpen = false;
  // Heartbeat interval ref
  var heartbeatInterval = null;

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getChatUser() {
    var raw = Storage.getItem(KEYS.CHAT_USER);
    if (raw && raw.deviceId && raw.username) return raw;
    return null;
  }

  function setChatUser(data) {
    try {
      Storage.setItem(KEYS.CHAT_USER, { deviceId: data.deviceId, username: String(data.username).trim() });
    } catch (e) {}
  }

  function hasChatUser() {
    return !!getChatUser();
  }

  function updateYouLabel() {
    var el = document.getElementById('chat-you-label');
    if (!el) return;
    var user = getChatUser();
    el.textContent = user && user.username ? 'أنت: ' + Utils.sanitizeText(user.username, 50) : '';
  }

  function getMyThreadId() {
    var u = getChatUser();
    return u ? u.deviceId : null;
  }

  function buildContacts() {
    var me = getChatUser();
    if (!me) return [];
    var tid = me.deviceId;
    var av = (me.username && me.username[0]) ? me.username[0] : 'أ';
    var result = [{ id: tid, name: 'رسائلي', av: av, online: true }];
    // Add contacts from conversations that have registry entries
    if (window.UserRegistry) {
      var convoKeys = Object.keys(convos);
      convoKeys.forEach(function (cid) {
        if (cid === tid) return;
        var regUser = window.UserRegistry.getById(cid);
        if (regUser) {
          result.push({
            id: cid,
            name: regUser.nickname,
            av: regUser.nickname[0] || 'أ',
            online: regUser.online
          });
        }
      });
    }
    return result;
  }

  function loadConvos() {
    var raw = Storage.getItem(KEYS.CHAT_CONVOS);
    if (raw && typeof raw === 'object') return raw;
    return {};
  }

  function saveConvos() {
    Storage.setItem(KEYS.CHAT_CONVOS, convos);
  }

  function openChatPanel() {
    chatOpen = true;
    var box = document.getElementById('chat-box');
    var fab = document.getElementById('chat-fab');
    if (box) box.classList.add('open');
    if (fab) fab.classList.add('open');
    contacts = buildContacts();
    convos = loadConvos();
    var myId = getMyThreadId();
    if (myId && !convos[myId]) convos[myId] = [];
    updateYouLabel();
    renderContacts();
    if (contacts.length) selContact = contacts[0];
    renderMainArea();
  }

  function toggleChat() {
    if (!hasChatUser()) {
      if (window.Modals) window.Modals.open('m-chat-username');
      return;
    }
    chatOpen = !chatOpen;
    var box = document.getElementById('chat-box');
    var fab = document.getElementById('chat-fab');
    if (box) box.classList.toggle('open', chatOpen);
    if (fab) fab.classList.toggle('open', chatOpen);
    if (chatOpen) {
      contacts = buildContacts();
      convos = loadConvos();
      var myId = getMyThreadId();
      if (myId && !convos[myId]) convos[myId] = [];
      updateYouLabel();
      renderContacts();
      if (contacts.length && !selContact) selContact = contacts[0];
      renderMainArea();
    }
  }

  function toast(msg, type) {
    if (window.Modals && window.Modals.toast) window.Modals.toast(msg, type || 'inf');
  }

  function renderContacts() {
    var list = document.getElementById('friends-list');
    if (!list) return;
    var query = (document.getElementById('f-search') && document.getElementById('f-search').value) ? document.getElementById('f-search').value.trim() : '';
    var filtered = query === '' ? contacts : contacts.filter(function (c) {
      return c.name.indexOf(query) !== -1;
    });
    list.textContent = '';
    filtered.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'friend' + (selContact && selContact.id === c.id ? ' active' : '');
      row.setAttribute('data-contact-id', c.id);
      var avatar = document.createElement('div');
      avatar.className = 'f-avatar';
      avatar.textContent = Utils.sanitizeText(c.av, 2);
      var wrap = document.createElement('div');
      var nameEl = document.createElement('div');
      nameEl.className = 'f-name';
      if (query && c.name.indexOf(query) !== -1) {
        nameEl.innerHTML = highlightMatch(Utils.esc(c.name), query);
      } else {
        nameEl.textContent = c.name;
      }
      var status = document.createElement('div');
      var isOnline = c.online !== false;
      status.className = 'f-status' + (isOnline ? ' online' : ' offline');
      status.textContent = isOnline ? 'متصل' : 'غير متصل';
      wrap.appendChild(nameEl);
      wrap.appendChild(status);
      row.appendChild(avatar);
      row.appendChild(wrap);
      list.appendChild(row);
    });
  }

  function highlightMatch(text, q) {
    if (!q) return text;
    var r = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return text.replace(r, '<mark class="search-highlight">$1</mark>');
  }

  function filterContacts() {
    renderContacts();
  }

  function getContactById(id) {
    return contacts.find(function (c) { return c.id === id; });
  }

  function selectContact(id) {
    selContact = getContactById(id);
    renderContacts();
    renderMainArea();
    // Close sidebar overlay on mobile after selecting a contact
    var sb = document.getElementById('chat-sidebar');
    if (sb) sb.classList.remove('sb-open');
  }

  function clearSel() {
    selContact = null;
    renderContacts();
    showNoSelection();
  }

  function showNoSelection() {
    var main = document.getElementById('chat-main');
    if (!main) return;
    main.textContent = '';
    var div = document.createElement('div');
    div.className = 'chat-no-sel';
    var big = document.createElement('span');
    big.className = 'big';
    big.textContent = '💬';
    var p = document.createElement('p');
    p.textContent = 'اختر محادثة لبدء المراسلة';
    div.appendChild(big);
    div.appendChild(p);
    main.appendChild(div);
  }

  function createMessageRow(m) {
    var row = document.createElement('div');
    row.className = 'msg-row ' + (m.from === 'me' ? 'me' : 'you');
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (m.type === 'text') {
      var textEl = document.createElement('div');
      textEl.textContent = Utils.sanitizeText(m.text, 5000);
      bubble.appendChild(textEl);
    } else if (m.type === 'image' && Utils.isAllowedDataUrl(m.url, 'image')) {
      var img = document.createElement('img');
      img.className = 'msg-img';
      img.alt = 'صورة';
      img.setAttribute('src', m.url);
      img.addEventListener('click', function () { window.open(m.url, '_blank'); });
      bubble.appendChild(img);
    } else if (m.type === 'audio' && Utils.isAllowedDataUrl(m.url, 'audio')) {
      var pill = document.createElement('div');
      pill.className = 'audio-pill';
      var audioEl = document.createElement('audio');
      audioEl.controls = true;
      audioEl.setAttribute('controls', '');
      audioEl.style.cssText = 'max-width:220px;height:36px;border-radius:8px;outline:none;';
      audioEl.setAttribute('src', m.url);
      audioEl.preload = 'metadata';
      pill.appendChild(audioEl);
      bubble.appendChild(pill);
    }
    var time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = Utils.sanitizeText(m.time, 20);
    bubble.appendChild(time);
    row.appendChild(bubble);
    return row;
  }

  function renderMessages() {
    var c = document.getElementById('chat-msgs');
    if (!c || !selContact) return;
    var msgs = convos[selContact.id] || [];
    // Apply sidebar filter pill
    var filtered = activeFilter === 'all'
      ? msgs
      : msgs.filter(function (m) { return m.type === activeFilter; });
    c.textContent = '';
    if (filtered.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;color:var(--text3);padding:30px;font-size:13px';
      empty.textContent = activeFilter === 'all'
        ? '\u0627\u0628\u062f\u0623 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \uD83D\uDC4B'
        : '\u0644\u0627 \u062A\u0648\u062C\u062F \u0631\u0633\u0627\u0626\u0644 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0646\u0648\u0639';
      c.appendChild(empty);
    } else {
      var frag = document.createDocumentFragment();
      filtered.forEach(function (m) { frag.appendChild(createMessageRow(m)); });
      c.appendChild(frag);
    }
    c.scrollTop = c.scrollHeight;
  }

  function push(msg) {
    if (!selContact) return;
    if (!convos[selContact.id]) convos[selContact.id] = [];
    convos[selContact.id].push(msg);
    saveConvos();
    renderMessages();
  }

  function sendMsg() {
    if (!selContact) {
      toast('اختر محادثة أولاً لبدء المراسلة', 'err');
      return;
    }
    var input = document.getElementById('msg-input');
    var text = input && input.value ? input.value.trim() : '';
    if (!text) return;
    push({ from: 'me', type: 'text', text: text, time: Utils.now() });
    input.value = '';
    toast('تم إرسال الرسالة', 'ok');
  }

  function renderMainArea() {
    var main = document.getElementById('chat-main');
    if (!main) return;
    main.textContent = '';
    if (!selContact) {
      showNoSelection();
      return;
    }
    var header = document.createElement('div');
    header.className = 'chat-header';

    // Mobile-only sidebar toggle — hidden via CSS on desktop
    var contactsBtn = document.createElement('button');
    contactsBtn.className = 'ch-contacts-btn';
    contactsBtn.type = 'button';
    contactsBtn.setAttribute('aria-label', 'عرض المحادثات');
    contactsBtn.title = 'المحادثات';
    contactsBtn.innerHTML = '&#9776;';
    contactsBtn.addEventListener('click', function () {
      var sb = document.getElementById('chat-sidebar');
      if (sb) sb.classList.toggle('sb-open');
    });

    var info = document.createElement('div');
    info.className = 'ch-info';
    var av = document.createElement('div');
    av.className = 'f-avatar';
    av.style.cssText = 'width:32px;height:32px;font-size:13px';
    av.textContent = Utils.sanitizeText(selContact.av, 2);
    var meta = document.createElement('div');
    var nameEl = document.createElement('div');
    nameEl.className = 'ch-name';
    nameEl.textContent = selContact.name;
    var sub = document.createElement('div');
    sub.className = 'ch-sub';
    sub.textContent = 'متصل الآن';
    meta.appendChild(nameEl);
    meta.appendChild(sub);
    info.appendChild(av);
    info.appendChild(meta);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'ch-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', clearSel);
    header.appendChild(contactsBtn);
    header.appendChild(info);
    header.appendChild(closeBtn);
    main.appendChild(header);
    var msgsEl = document.createElement('div');
    msgsEl.id = 'chat-msgs';
    main.appendChild(msgsEl);
    var inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    var inputRow = document.createElement('div');
    inputRow.className = 'input-row';
    var mediaBtns = document.createElement('div');
    mediaBtns.className = 'media-btns';
    var imgBtn = document.createElement('button');
    imgBtn.className = 'media-btn';
    imgBtn.type = 'button';
    imgBtn.title = 'إرسال صورة من الجهاز';
    imgBtn.textContent = '🖼️';
    imgBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var pick = document.getElementById('img-pick');
      if (pick) pick.click();
    });
    var camBtn = document.createElement('button');
    camBtn.className = 'media-btn';
    camBtn.type = 'button';
    camBtn.title = 'التقاط صورة بالكاميرا';
    camBtn.textContent = '📷';
    camBtn.addEventListener('click', onCameraBtnClick);
    var audBtn = document.createElement('button');
    audBtn.className = 'media-btn';
    audBtn.type = 'button';
    audBtn.title = 'إرسال ملف صوتي';
    audBtn.textContent = '🎵';
    audBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var pick = document.getElementById('aud-pick');
      if (pick) pick.click();
    });
    var recBtn = document.createElement('button');
    recBtn.id = 'chat-record-btn';
    recBtn.className = 'media-btn';
    recBtn.type = 'button';
    recBtn.title = 'تسجيل رسالة صوتية';
    recBtn.textContent = '🎤';
    recBtn.addEventListener('click', onRecordBtnClick);
    mediaBtns.appendChild(imgBtn);
    mediaBtns.appendChild(camBtn);
    mediaBtns.appendChild(audBtn);
    mediaBtns.appendChild(recBtn);
    var ta = document.createElement('textarea');
    ta.id = 'msg-input';
    ta.placeholder = 'اكتب رسالتك…';
    ta.rows = 1;
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
    var sendBtn = document.createElement('button');
    sendBtn.id = 'send-btn';
    sendBtn.type = 'button';
    sendBtn.textContent = '➤';
    sendBtn.addEventListener('click', function (e) { e.preventDefault(); sendMsg(); });
    inputRow.appendChild(mediaBtns);
    inputRow.appendChild(ta);
    inputRow.appendChild(sendBtn);
    inputArea.appendChild(inputRow);
    main.appendChild(inputArea);
    renderMessages();
    updateRecordButtonLabel();
  }

  function validateImageFile(file) {
    var allowed = ALLOWED_IMAGE_TYPES;
    var ok = allowed.some(function (t) { return file.type === t; });
    if (!ok) {
      toast('❌ نوع الصورة غير مدعوم. استخدم PNG أو JPG أو WebP فقط.', 'err');
      return false;
    }
    if (file.size > MAX_IMG_MB * 1024 * 1024) {
      toast('❌ حجم الصورة يتجاوز ' + MAX_IMG_MB + ' ميجابايت', 'err');
      return false;
    }
    return true;
  }

  function validateAudioFile(file) {
    var allowed = ALLOWED_AUDIO_TYPES;
    var ok = allowed.some(function (t) { return file.type === t; });
    if (!ok) {
      toast('❌ نوع الصوت غير مدعوم. استخدم MP3 أو OGG أو WAV فقط.', 'err');
      return false;
    }
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
      toast('❌ حجم الملف الصوتي يتجاوز ' + MAX_AUDIO_MB + ' ميجابايت', 'err');
      return false;
    }
    return true;
  }

  function setupFilePicks() {
    var imgPick = document.getElementById('img-pick');
    var audPick = document.getElementById('aud-pick');
    if (imgPick) {
      imgPick.setAttribute('accept', 'image/png,image/jpeg,image/webp');
      imgPick.addEventListener('change', function () {
        var file = this.files[0];
        this.value = '';
        if (!file) return;
        if (!selContact) {
          toast('اختر محادثة أولاً لإرسال صورة', 'err');
          return;
        }
        if (!validateImageFile(file)) return;
        var r = new FileReader();
        r.onload = function (e) {
          var url = e.target.result;
          if (Utils.isAllowedDataUrl(url, 'image')) push({ from: 'me', type: 'image', url: url, time: Utils.now() });
          else toast('❌ فشل تحميل الصورة', 'err');
        };
        r.onerror = function () { toast('❌ فشل قراءة الصورة', 'err'); };
        r.readAsDataURL(file);
      });
    }
    if (audPick) {
      audPick.setAttribute('accept', 'audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/webm');
      audPick.addEventListener('change', function () {
        var file = this.files[0];
        this.value = '';
        if (!file) return;
        if (!selContact) {
          toast('اختر محادثة أولاً لإرسال رسالة صوتية', 'err');
          return;
        }
        if (!validateAudioFile(file)) return;
        var r = new FileReader();
        r.onload = function (e) {
          var url = e.target.result;
          if (Utils.isAllowedDataUrl(url, 'audio')) push({ from: 'me', type: 'audio', url: url, time: Utils.now() });
          else toast('❌ فشل تحميل الملف الصوتي', 'err');
        };
        r.onerror = function () { toast('❌ فشل قراءة الملف الصوتي', 'err'); };
        r.readAsDataURL(file);
      });
    }
  }

  function getStoredMicDenied() {
    try { return Storage.getItem(KEYS.MIC_PERMISSION_DENIED) === true || Storage.getItem(KEYS.MIC_PERMISSION_DENIED) === '1'; } catch (e) { return false; }
  }
  function setStoredMicDenied(denied) {
    try { Storage.setItem(KEYS.MIC_PERMISSION_DENIED, denied ? true : false); } catch (e) {}
  }
  function getStoredCameraDenied() {
    try { return Storage.getItem(KEYS.CAMERA_PERMISSION_DENIED) === true || Storage.getItem(KEYS.CAMERA_PERMISSION_DENIED) === '1'; } catch (e) { return false; }
  }
  function setStoredCameraDenied(denied) {
    try { Storage.setItem(KEYS.CAMERA_PERMISSION_DENIED, denied ? true : false); } catch (e) {}
  }

  function requestMicPermission(cb) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('التسجيل الصوتي غير متاح في هذا المتصفح', 'err');
      if (cb) cb(false);
      return;
    }
    if (getStoredMicDenied()) {
      toast('تم رفض إذن الميكروفون سابقاً. فعّل الميكروفون من إعدادات المتصفح ثم أعد المحاولة.', 'err');
      if (cb) cb(false);
      return;
    }
    var permissionDone = function (granted) {
      if (!granted) setStoredMicDenied(true);
      else setStoredMicDenied(false);
      if (cb) cb(granted);
    };
    if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then(function (result) {
        if (result.state === 'granted') {
          toast('الميكروفون مسموح', 'ok');
          permissionDone(true);
          return;
        }
        if (result.state === 'denied') {
          setStoredMicDenied(true);
          toast('تم رفض إذن الميكروفون. لا يمكن التسجيل بدون الإذن.', 'err');
          permissionDone(false);
          return;
        }
        doRequestMic(permissionDone);
      }).catch(function () { doRequestMic(permissionDone); });
    } else {
      doRequestMic(permissionDone);
    }
  }

  function doRequestMic(permissionDone) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        setStoredMicDenied(false);
        toast('تم منح إذن الميكروفون', 'ok');
        permissionDone(true);
      })
      .catch(function () {
        toast('تم رفض إذن الميكروفون. لا يمكن التسجيل بدون الإذن.', 'err');
        permissionDone(false);
      });
  }

  function requestCameraPermission(cb) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('الكاميرا غير متاحة في هذا المتصفح', 'err');
      if (cb) cb(false);
      return;
    }
    if (getStoredCameraDenied()) {
      toast('تم رفض إذن الكاميرا سابقاً. فعّل الكاميرا من إعدادات المتصفح ثم أعد المحاولة.', 'err');
      if (cb) cb(false);
      return;
    }
    var permissionDone = function (granted) {
      if (!granted) setStoredCameraDenied(true);
      else setStoredCameraDenied(false);
      if (cb) cb(granted);
    };
    if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' }).then(function (result) {
        if (result.state === 'granted') {
          toast('الكاميرا مسموحة', 'ok');
          permissionDone(true);
          return;
        }
        if (result.state === 'denied') {
          setStoredCameraDenied(true);
          toast('تم رفض إذن الكاميرا. لا يمكن التقاط صورة بدون الإذن.', 'err');
          permissionDone(false);
          return;
        }
        doRequestCamera(permissionDone);
      }).catch(function () { doRequestCamera(permissionDone); });
    } else {
      doRequestCamera(permissionDone);
    }
  }

  function doRequestCamera(permissionDone) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(function (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        setStoredCameraDenied(false);
        toast('تم منح إذن الكاميرا', 'ok');
        permissionDone(true);
      })
      .catch(function () {
        toast('تم رفض إذن الكاميرا. لا يمكن التقاط صورة بدون الإذن.', 'err');
        permissionDone(false);
      });
  }

  function updateRecordButtonLabel() {
    var btn = document.getElementById('chat-record-btn');
    if (!btn) return;
    btn.textContent = recState.active ? '⏹' : '🎤';
    btn.title = recState.active ? 'إيقاف التسجيل' : 'تسجيل رسالة صوتية';
  }

  /**
   * Returns a live mic stream via callback.
   * Reuses the cached stream on subsequent calls so the browser NEVER shows the
   * permission dialog more than once per session.
   */
  function getActiveMicStream(cb) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('التسجيل الصوتي غير متاح في هذا المتصفح', 'err');
      cb(null); return;
    }
    // Reuse cached stream if at least one audio track is still live
    if (recState.cachedStream) {
      var tracks = recState.cachedStream.getAudioTracks();
      if (tracks.length && tracks[0].readyState === 'live') { cb(recState.cachedStream); return; }
      recState.cachedStream = null; // stale — request again
    }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        recState.cachedStream = stream;
        cb(stream);
      })
      .catch(function (err) {
        var name = err && err.name ? err.name : '';
        var msg = name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'تم رفض إذن الميكروفون. فعّل الميكروفون من إعدادات المتصفح ثم أعد المحاولة.'
          : name === 'NotFoundError'
            ? 'لم يُعثر على ميكروفون في جهازك.'
            : 'لا يمكن الوصول إلى الميكروفون.';
        toast(msg, 'err');
        cb(null);
      });
  }

  function startRecording() {
    if (recState.active) return;
    if (typeof MediaRecorder === 'undefined') {
      toast('التسجيل الصوتي غير مدعوم في هذا المتصفح', 'err'); return;
    }
    getActiveMicStream(function (stream) {
      if (!stream) return;
      recState.chunks = [];
      // Determine best supported mimeType
      var mimeType = '';
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
      var opts = { audioBitsPerSecond: 128000 };
      if (mimeType) opts.mimeType = mimeType;
      var recorder;
      try { recorder = new MediaRecorder(stream, opts); }
      catch (e) {
        try { recorder = new MediaRecorder(stream); }
        catch (e2) { toast('التسجيل الصوتي غير مدعوم في هذا المتصفح', 'err'); return; }
      }
      recState.recorder = recorder;
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) recState.chunks.push(e.data);
      };
      recorder.onstop = function () {
        var chunks = recState.chunks.slice();
        recState.chunks = [];
        recState.recorder = null;
        recState.active = false;
        if (recState.timer) { clearTimeout(recState.timer); recState.timer = null; }
        updateRecordButtonLabel();
        // Keep recState.cachedStream alive — do NOT stop tracks
        if (!chunks.length) { toast('لم يتم التقاط أي صوت. حاول مجدداً.', 'err'); return; }
        var blobType = recorder.mimeType || mimeType || 'audio/webm';
        var blob = new Blob(chunks, { type: blobType });
        if (blob.size === 0) { toast('الرسالة الصوتية فارغة.', 'err'); return; }
        if (blob.size > MAX_AUDIO_MB * 1024 * 1024) {
          toast('التسجيل طويل جداً. الحد ' + MAX_AUDIO_MB + ' ميجابايت.', 'err'); return;
        }
        toast('جارٍ الإرسال…', 'inf');
        var reader = new FileReader();
        reader.onload = function (ev) {
          var url = ev.target.result;
          if (!url) { toast('فشل حفظ التسجيل.', 'err'); return; }
          if (Utils.isAllowedDataUrl(url, 'audio')) {
            push({ from: 'me', type: 'audio', url: url, time: Utils.now() });
            toast('تم إرسال الرسالة الصوتية ✓', 'ok');
          } else {
            toast('نوع التسجيل غير مدعوم: ' + (blob.type || '?'), 'err');
          }
        };
        reader.onerror = function () { toast('فشل حفظ التسجيل.', 'err'); };
        reader.readAsDataURL(blob);
      };
      recorder.onerror = function () {
        recState.active = false; recState.recorder = null;
        if (recState.timer) { clearTimeout(recState.timer); recState.timer = null; }
        // On error, discard cached stream so next attempt re-requests cleanly
        if (recState.cachedStream) {
          recState.cachedStream.getTracks().forEach(function (t) { t.stop(); });
          recState.cachedStream = null;
        }
        updateRecordButtonLabel();
        toast('حدث خطأ أثناء التسجيل.', 'err');
      };
      recorder.start(100); // collect chunk every 100ms for reliability
      recState.active = true;
      recState.timer = setTimeout(function () {
        if (recState.recorder && recState.recorder.state === 'recording') recState.recorder.stop();
      }, MAX_RECORD_MS);
      updateRecordButtonLabel();
      toast('جارٍ التسجيل… 🔴 اضغط ⏹ للإيقاف', 'inf');
    });
  }

  function stopRecording() {
    if (!recState.active || !recState.recorder || recState.recorder.state !== 'recording') return;
    recState.recorder.stop();
  }

  function onRecordBtnClick(e) {
    e.preventDefault();
    if (!selContact) {
      toast('اختر محادثة أولاً لإرسال رسالة صوتية', 'err');
      return;
    }
    if (recState.active) {
      toast('جارٍ إيقاف التسجيل…', 'inf');
      stopRecording();
      return;
    }
    startRecording();
  }

  function captureFromCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('الكاميرا غير متاحة في هذا المتصفح', 'err');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(function (stream) {
        var video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.srcObject = stream;
        video.play().then(function () {
          var w = video.videoWidth;
          var h = video.videoHeight;
          if (!w || !h) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            toast('لم يتم التقاط الإطار', 'err');
            return;
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0);
          stream.getTracks().forEach(function (t) { t.stop(); });
          video.srcObject = null;
          canvas.toBlob(function (blob) {
            if (!blob) {
              toast('فشل إنشاء الصورة', 'err');
              return;
            }
            if (blob.size > MAX_IMG_MB * 1024 * 1024) {
              toast('حجم الصورة يتجاوز ' + MAX_IMG_MB + ' ميجابايت', 'err');
              return;
            }
            var reader = new FileReader();
            reader.onload = function (ev) {
              var url = ev.target.result;
              if (Utils.isAllowedDataUrl(url, 'image')) {
                push({ from: 'me', type: 'image', url: url, time: Utils.now() });
                toast('تم إرسال الصورة', 'ok');
              } else toast('فشل إرسال الصورة', 'err');
            };
            reader.onerror = function () { toast('فشل قراءة الصورة', 'err'); };
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.9);
        }).catch(function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          toast('فشل التقاط الصورة', 'err');
        });
      })
      .catch(function () {
        toast('تم رفض إذن الكاميرا. لا يمكن التقاط صورة بدون الإذن.', 'err');
      });
  }

  function onCameraBtnClick(e) {
    e.preventDefault();
    if (!selContact) {
      toast('اختر محادثة أولاً لإرسال صورة', 'err');
      return;
    }
    requestCameraPermission(function (granted) {
      if (granted) captureFromCamera();
    });
  }

  function submitUsername() {
    var input = document.getElementById('chat-username-input');
    var name = input ? Utils.sanitizeText(input.value, 32) : '';
    if (!name) {
      toast('أدخل اسمًا رمزيًا', 'err');
      if (input) input.focus();
      return;
    }
    var existing = getChatUser();
    var deviceId = existing ? existing.deviceId : generateUUID();
    // Check for duplicate nickname in registry
    if (window.UserRegistry && window.UserRegistry.isNicknameTaken(name, deviceId)) {
      toast('هذا الاسم مستخدم بالفعل، اختر اسمًا آخر', 'err');
      if (input) input.focus();
      return;
    }
    setChatUser({ deviceId: deviceId, username: name });
    // Register in the user directory
    if (window.UserRegistry) {
      window.UserRegistry.registerUser(deviceId, name);
    }
    if (window.Modals) window.Modals.close('m-chat-username');
    if (input) input.value = '';
    updateYouLabel();
    openChatPanel();
    startHeartbeat();
    toast('مرحبًا ' + name + '!', 'ok');
  }

  function onFriendsListClick(e) {
    var row = e.target.closest('.friend');
    if (!row) return;
    var id = row.getAttribute('data-contact-id');
    if (id) selectContact(id);
  }

  /* ── User Search Panel ─────────────────── */
  function openSearchPanel() {
    searchPanelOpen = true;
    var sidebar = document.getElementById('chat-sidebar');
    if (!sidebar) return;
    // On mobile, ensure sidebar is visible
    sidebar.classList.add('sb-open');
    // Hide normal sidebar content, show search panel
    var normalContent = sidebar.querySelectorAll('.csb-head, .ch-you-label, .csb-search, .csb-filter-pills, .friends-list, .csb-new-chat-wrap');
    normalContent.forEach(function (el) { el.style.display = 'none'; });
    // Remove old search panel if exists
    var old = sidebar.querySelector('.user-search-panel');
    if (old) old.remove();
    // Build search panel
    var panel = document.createElement('div');
    panel.className = 'user-search-panel';
    // Back button
    var backBtn = document.createElement('button');
    backBtn.className = 'csb-back-btn';
    backBtn.type = 'button';
    backBtn.innerHTML = '← رجوع للمحادثات';
    backBtn.addEventListener('click', closeSearchPanel);
    panel.appendChild(backBtn);
    // Search header
    var head = document.createElement('div');
    head.className = 'csb-head';
    head.innerHTML = '<span>🔍 البحث عن أصدقاء</span>';
    panel.appendChild(head);
    // Search input
    var searchWrap = document.createElement('div');
    searchWrap.className = 'csb-search';
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'ابحث باسم المستخدم...';
    searchInput.id = 'user-search-input';
    searchInput.addEventListener('input', function () { renderSearchResults(searchInput.value); });
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);
    // Results area
    var results = document.createElement('div');
    results.className = 'user-search-results';
    results.id = 'user-search-results';
    panel.appendChild(results);
    sidebar.appendChild(panel);
    // Render all users immediately
    renderSearchResults('');
    setTimeout(function () { searchInput.focus(); }, 100);
  }

  function closeSearchPanel() {
    searchPanelOpen = false;
    var sidebar = document.getElementById('chat-sidebar');
    if (!sidebar) return;
    // Remove search panel
    var panel = sidebar.querySelector('.user-search-panel');
    if (panel) panel.remove();
    // Restore normal sidebar content
    var normalContent = sidebar.querySelectorAll('.csb-head, .ch-you-label, .csb-search, .csb-filter-pills, .friends-list, .csb-new-chat-wrap');
    normalContent.forEach(function (el) { el.style.display = ''; });
  }

  function renderSearchResults(query) {
    var results = document.getElementById('user-search-results');
    if (!results || !window.UserRegistry) return;
    var me = getChatUser();
    var selfId = me ? me.deviceId : null;
    var users = window.UserRegistry.search(query, selfId);
    results.textContent = '';
    if (users.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'user-search-empty';
      empty.textContent = query ? 'لا يوجد مستخدم بهذا الاسم' : 'لا يوجد مستخدمون مسجلون بعد';
      results.appendChild(empty);
      return;
    }
    users.forEach(function (u) {
      var row = document.createElement('div');
      row.className = 'friend';
      row.setAttribute('data-user-id', u.id);
      var avatar = document.createElement('div');
      avatar.className = 'f-avatar';
      avatar.textContent = u.nickname[0] || 'أ';
      var wrap = document.createElement('div');
      var nameEl = document.createElement('div');
      nameEl.className = 'f-name';
      if (query) {
        nameEl.innerHTML = highlightMatch(Utils.esc(u.nickname), query);
      } else {
        nameEl.textContent = u.nickname;
      }
      var status = document.createElement('div');
      status.className = 'f-status' + (u.online ? ' online' : ' offline');
      status.textContent = u.online ? 'متصل' : 'غير متصل';
      wrap.appendChild(nameEl);
      wrap.appendChild(status);
      row.appendChild(avatar);
      row.appendChild(wrap);
      row.addEventListener('click', function () {
        startChatWith(u);
      });
      results.appendChild(row);
    });
  }

  function startChatWith(user) {
    if (!user || !user.id) return;
    // Create conversation if needed
    if (!convos[user.id]) convos[user.id] = [];
    saveConvos();
    // Rebuild contacts to include this user
    contacts = buildContacts();
    // Select the contact
    var contact = contacts.find(function (c) { return c.id === user.id; });
    if (!contact) {
      // Add to contacts if not yet present
      contact = { id: user.id, name: user.nickname, av: user.nickname[0] || 'أ', online: user.online };
      contacts.push(contact);
    }
    selContact = contact;
    closeSearchPanel();
    renderContacts();
    renderMainArea();
    // Close sidebar on mobile
    var sb = document.getElementById('chat-sidebar');
    if (sb) sb.classList.remove('sb-open');
    toast('تم فتح محادثة مع ' + user.nickname, 'ok');
  }

  /* ── Heartbeat ─────────────────────────── */
  function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    var me = getChatUser();
    if (!me || !window.UserRegistry) return;
    window.UserRegistry.heartbeat(me.deviceId);
    heartbeatInterval = setInterval(function () {
      var me2 = getChatUser();
      if (me2 && window.UserRegistry) window.UserRegistry.heartbeat(me2.deviceId);
    }, 60000); // every 60s
  }

  function init() {
    var fab = document.getElementById('chat-fab');
    if (fab) fab.addEventListener('click', toggleChat);
    var search = document.getElementById('f-search');
    if (search) search.addEventListener('input', function () { filterContacts(); });
    var list = document.getElementById('friends-list');
    if (list) list.addEventListener('click', onFriendsListClick);
    var usernameSubmit = document.getElementById('chat-username-submit');
    if (usernameSubmit) usernameSubmit.addEventListener('click', function (e) {
      e.preventDefault();
      submitUsername();
    });
    var usernameInput = document.getElementById('chat-username-input');
    if (usernameInput) usernameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitUsername(); }
    });
    setupFilePicks();
    // Mobile sidebar back/close button
    var csbBack = document.getElementById('csb-back');
    if (csbBack) csbBack.addEventListener('click', function () {
      var sb = document.getElementById('chat-sidebar');
      if (sb) sb.classList.remove('sb-open');
    });
    // Filter pills — delegate from sidebar container
    var filtersEl = document.getElementById('csb-filters');
    if (filtersEl) filtersEl.addEventListener('click', function (e) {
      var pill = e.target.closest('.csb-filter-pill');
      if (!pill) return;
      filtersEl.querySelectorAll('.csb-filter-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      activeFilter = pill.getAttribute('data-filter') || 'all';
      renderMessages();
    });
    // New Chat button — opens user search panel (or username modal if not registered)
    var newChatBtn = document.getElementById('csb-new-chat');
    if (newChatBtn) newChatBtn.addEventListener('click', function () {
      if (!hasChatUser()) {
        if (window.Modals) window.Modals.open('m-chat-username');
      } else {
        openSearchPanel();
      }
    });
    // If user not registered, prompt for username
    if (!hasChatUser()) {
      if (window.Modals) window.Modals.open('m-chat-username');
    } else {
      // Re-register existing user on page load & start heartbeat
      var me = getChatUser();
      if (me && window.UserRegistry) {
        window.UserRegistry.registerUser(me.deviceId, me.username);
        startHeartbeat();
      }
    }
    // Listen for registry changes to refresh contacts in real-time
    if (window.UserRegistry) {
      window.UserRegistry.onChange(function () {
        contacts = buildContacts();
        renderContacts();
        // Also refresh search results if search panel is open
        if (searchPanelOpen) {
          var input = document.getElementById('user-search-input');
          renderSearchResults(input ? input.value : '');
        }
      });
    }
    // Mark user offline on page close
    window.addEventListener('beforeunload', function () {
      var me = getChatUser();
      if (me && window.UserRegistry) window.UserRegistry.setOffline(me.deviceId);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    });
  }

  window.Chat = {
    toggle: toggleChat,
    hasChatUser: hasChatUser,
    getChatUser: getChatUser,
    requestMicPermission: requestMicPermission,
    requestCameraPermission: requestCameraPermission,
    init: init
  };
})();

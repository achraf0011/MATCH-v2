(() => {
  // DOM caching
  const DOM = {
    input: document.getElementById('input-message'),
    sendBtn: document.getElementById('send-btn'),
    messages: document.getElementById('messages')
  };

  // قائمة الرسائل (تجريبية)
  let messages = [];

  // إضافة رسالة للواجهة - Optimistic UI
  function appendMessage(msg) {
    const div = document.createElement('div');
    div.classList.add('message');
    if(msg.from === 'me') div.classList.add('me');
    div.innerHTML = sanitize(msg.text);
    DOM.messages.appendChild(div);

    // Scroll سلس
    requestAnimationFrame(() => {
      DOM.messages.scrollTop = DOM.messages.scrollHeight;
    });
  }

  // إرسال رسالة
  function sendMessage() {
    const text = DOM.input.value.trim();
    if(!text) return;

    const msg = {from: 'me', text: text, time: new Date()};
    messages.push(msg);
    appendMessage(msg); // Optimistic UI
    DOM.input.value = '';

    // محاكاة إرسال للخادم
    setTimeout(() => {
      console.log('تم إرسال الرسالة إلى الخادم:', msg.text);
    }, 100);
  }

  // تنظيف المدخلات لمنع XSS
  function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // الأحداث
  DOM.sendBtn.addEventListener('click', sendMessage);
  DOM.input.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') sendMessage();
  });

})();

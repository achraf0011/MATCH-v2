'use strict';

/**
 * App config — credentials, storage keys, security, levels.
 * APP_VERSION is set by js/version.js which is loaded first.
 * To release a new version run: python bump-version.py <N>
 */
window.APP_CONFIG = {
  APP_VERSION: window.APP_VERSION || '3',
  CREDS: { email: 'achraf1258@gmail.com', pass: 'achraf1258' },
  STORAGE_KEYS: {
    ADMIN: 'madarik_admin_session',
    CHAT_USER: 'madarik_chat_user',
    CHAT_CONVOS: 'madarik_chat_convos',
    CHAT_USERS_REGISTRY: 'madarik_users_registry',
    MIC_PERMISSION_DENIED: 'madarik_mic_denied',
    CAMERA_PERMISSION_DENIED: 'madarik_camera_denied',
    VIDEOS: 'madarik_videos',
    PDF_LIST: 'madarik_pdf_list',
    EXERCISES_LIST: 'madarik_exercises_list',
    TESTS_LIST: 'madarik_tests_list'
  },
  IDB_NAME: 'MadarikPDFs',
  IDB_VERSION: 1,
  IDB_STORE: 'blobs',
  MAX_PDF_MB: 20,
  MAX_IMG_MB: 5,
  MAX_AUDIO_MB: 10,
  ADMIN_SESSION_TIMEOUT_MS: 30 * 60 * 1000,
  ALLOWED_IMAGE_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  ALLOWED_AUDIO_TYPES: ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm'],
  LEVELS: [
    { id: 'first-middle', file: 'index.html', title: 'الأولى إعدادي' },
    { id: 'first-primary', file: 'first-primary.html', title: 'الصف الأول الابتدائي' },
    { id: 'second-primary', file: 'second-primary.html', title: 'الصف الثاني الابتدائي' },
    { id: 'third-primary', file: 'third-primary.html', title: 'الصف الثالث الابتدائي' },
    { id: 'fourth-primary', file: 'fourth-primary.html', title: 'الصف الرابع الابتدائي' },
    { id: 'fifth-primary', file: 'fifth-primary.html', title: 'الصف الخامس الابتدائي' },
    { id: 'sixth-primary', file: 'sixth-primary.html', title: 'الصف السادس الابتدائي' },
    { id: 'second-middle', file: 'second-middle.html', title: 'الثانية إعدادي' },
    { id: 'third-middle', file: 'third-middle.html', title: 'الثالثة إعدادي' },
    { id: 'shared-curricula', file: 'shared-curricula.html', title: 'الجدع المشترك علوم' },
    { id: 'first-bac-islamic', file: 'first-bac-islamic.html', title: 'الأولى باك - علوم تجريبية' },
    { id: 'first-bac-math', file: 'first-bac-math.html', title: 'الأولى باك - علوم رياضية' },
    { id: 'first-bac-economic', file: 'first-bac-economic.html', title: 'الأولى باك - علوم اقتصادية' },
    { id: 'second-bac-physical', file: 'second-bac-physical.html', title: 'الثانية باك - علوم فيزيائية' },
    { id: 'second-bac-life-earth', file: 'second-bac-life-earth.html', title: 'الثانية باك - علوم الحياة والأرض' },
    { id: 'second-bac-math', file: 'second-bac-math.html', title: 'الثانية باك - علوم رياضية' }
  ],
  /** Subjects per level group — used for sidebar/dropdown filtering */
  SUBJECTS: {
    primary: [
      { id: 'math', name: 'الرياضيات', icon: '📐' },
      { id: 'arabic', name: 'اللغة العربية', icon: '📖' },
      { id: 'french', name: 'اللغة الفرنسية', icon: '🇫🇷' },
      { id: 'islamic', name: 'التربية الإسلامية', icon: '🕌' },
      { id: 'science', name: 'النشاط العلمي', icon: '🔬' },
      { id: 'social', name: 'الاجتماعيات', icon: '🌍' }
    ],
    middle: [
      { id: 'math', name: 'الرياضيات', icon: '📐' },
      { id: 'arabic', name: 'اللغة العربية', icon: '📖' },
      { id: 'french', name: 'اللغة الفرنسية', icon: '🇫🇷' },
      { id: 'islamic', name: 'التربية الإسلامية', icon: '🕌' },
      { id: 'physics', name: 'الفيزياء والكيمياء', icon: '⚗️' },
      { id: 'life-earth', name: 'علوم الحياة والأرض', icon: '🌱' },
      { id: 'social', name: 'الاجتماعيات', icon: '🌍' },
      { id: 'english', name: 'اللغة الإنجليزية', icon: '🇬🇧' },
      { id: 'info', name: 'المعلوميات', icon: '💻' }
    ],
    bac: [
      { id: 'math', name: 'الرياضيات', icon: '📐' },
      { id: 'physics', name: 'الفيزياء والكيمياء', icon: '⚗️' },
      { id: 'life-earth', name: 'علوم الحياة والأرض', icon: '🌱' },
      { id: 'arabic', name: 'اللغة العربية', icon: '📖' },
      { id: 'french', name: 'اللغة الفرنسية', icon: '🇫🇷' },
      { id: 'english', name: 'اللغة الإنجليزية', icon: '🇬🇧' },
      { id: 'islamic', name: 'التربية الإسلامية', icon: '🕌' },
      { id: 'philosophy', name: 'الفلسفة', icon: '🧠' }
    ]
  },
  /** Weekly schedule template per level group */
  SCHEDULE_TEMPLATE: {
    days: ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    slots: ['08:00 - 10:00', '10:00 - 12:00', '14:00 - 16:00', '16:00 - 18:00']
  }
};

window.APP_CONFIG.getCurrentLevel = function () {
  var body = document.body;
  var level = body && body.getAttribute ? body.getAttribute('data-level') : '';
  return level || 'first-middle';
};

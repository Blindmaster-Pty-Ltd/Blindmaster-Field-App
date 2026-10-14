/* Blindmaster Field App — stage 1
 * Sign in, schedule, appointment details, directions, route, and an office Team board.
 * Three layouts from one codebase:
 *   phone   (< 768px)   single column, bottom tabs
 *   tablet  (768–1279)  icon rail + schedule list + appointment detail side by side
 *   desktop (>= 1280)   full sidebar + list + detail; office staff get the Team board
 * Plain JavaScript, no build step: GitHub Pages serves these files as they are.
 */
(function () {
  'use strict';

  var CFG = window.FIELD_APP_CONFIG || {};
  var APP_VERSION = '39'; // shown on the Account page and the sidebar, so it's easy to check which version is live
  var TZ = 'Australia/Sydney';
  var app = document.getElementById('app');
  var state = { user: null, cache: {}, mode: null };

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; } }
  function unstore(key) { try { localStorage.removeItem(key); } catch (e) {} }

  function todayStr() { return ymd(new Date()); }
  function ymd(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  function addDays(dateStr, n) {
    var d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function longDate(s) { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function shortDate(s) { return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function greeting() {
    var h = Number(new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function firstName(n) { return String(n || '').split(' ')[0]; }
  function initials(n) { return String(n || '').split(' ').map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function suburb(address) {
    var m = String(address || '').match(/([A-Za-z' ]+?)\s+(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/);
    return m ? m[1].trim().split(',').pop().trim() : String(address || '').split(',')[0];
  }
  function mapsDir(dest) { return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(dest); }
  function mapsSearch(q) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
  function tel(p) { return 'tel:' + String(p || '').replace(/[^\d+]/g, ''); }
  function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
  function isOffice() { return !!(state.user && /office|admin/i.test(state.user.role || '')); }
  /** The job report opens inside the app (same form as the standalone JR, prefilled with the JR number). */
  function jrBase() { return state.jrBase || store('fa-jrbase') || 'https://blindmaster-pty-ltd.github.io/Blindmaster-Job-Report/blindmaster-job-report.html'; }
  /** JR link from just a job number (e.g. from Needs attention). From an appointment, the script sends the full link (client, address, crew, calendar IDs). */
  function jrFormUrl(jr, date) { return jr ? jrBase() + '?ref=' + encodeURIComponent(jr) + '&date=' + encodeURIComponent(date || todayStr()) : ''; }
  function myEmailSafe() { var s = store('fa-session') || {}; return String((state.user && state.user.email) || s.email || s.devEmail || ''); }
  function jrHref(a, date) {
    date = date || a.date || todayStr();
    if (a.jobReportUrl) return '#/jrappt/' + encodeURIComponent(a.id) + '/' + date;
    return a.jr ? '#/jr/' + encodeURIComponent(a.jr) + '/' + date : '';
  }
  function reportLine(a) {
    if (!a.report) return '';
    return a.report.complete ? '<span class="rep-ok">' + I.check + 'Job report submitted</span>' : '<span class="rep-warn">Not finished: return visit needed</span>';
  }
  function apptHref(a, date) { return '#/appt/' + encodeURIComponent(a.id) + '/' + date; }
  function dayHref(date) { return date === todayStr() ? '#/day' : '#/day/' + date; }

  function layoutMode() {
    var w = window.innerWidth;
    return w >= 1280 ? 'desktop' : w >= 768 ? 'tablet' : 'phone';
  }
  function wide() { return state.mode !== 'phone'; }

  var I = {
    nav: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>',
    phone: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    msg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    left: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:1px"><path d="M5 12l5 5L20 7"/></svg>',
    folder: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3z"/></svg>',
    ext: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
    cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    route: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/></svg>',
    team: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/></svg>',
    chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    print: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H3v-8h18v8h-3M6 14h12v7H6z"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    idcard: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14"/><circle cx="8.5" cy="11" r="2.5"/><path d="M4.5 17a4 4 0 0 1 8 0M14.5 10h4M14.5 14h4"/></svg>',
    car: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 16v-4l2-5h14l2 5v4z"/><path d="M3 12h18"/><circle cx="7" cy="16.5" r="1.8"/><circle cx="17" cy="16.5" r="1.8"/></svg>',
    user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    planner: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17"/><path d="M3 9h18M9 9v12M15 9v12M8 2v4M16 2v4"/></svg>',
    mic: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    spark: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    camera: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    play: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    list: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11"/></svg>',
    leave: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/></svg>',
    clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pencil: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/></svg>',
    pin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    window: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18"/><path d="M4 7h16M7 7v8M17 7v8M7 15h10"/></svg>',
    awning: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-5 9 5"/><path d="M3 9h18l-2 4H5z"/><path d="M6 13v7M18 13v7"/></svg>',
    eye: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    receipt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    doc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>',
    grid: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>',
    download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>',
    video: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
    report: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3"/></svg>'
  };

  /* ---------- auth ---------- */

  function session() { return store('fa-session'); }
  /** Office "View as": the email being viewed, or '' when you're seeing your own view. */
  function viewAs() { return store('fa-viewas') || ''; }
  function realOffice() { var u = state.user; return !!(u && /office|admin/i.test((u.viewing ? u.realRole : u.role) || '')); }
  function setViewAs(email) {
    if (email) store('fa-viewas', email); else unstore('fa-viewas');
    state.cache = {}; stopChat();
    loading(email ? 'Switching to the ' + roleLabel(email) + ' view…' : 'Back to your view…');
    return api({ action: 'me' }).then(function (d) {
      state.user = d.user; store('fa-user', d.user);
      location.hash = '#/'; render();
    }, function (err) { unstore('fa-viewas'); showError(err, render); });
  }
  function vasBar() {
    var u = state.user;
    if (!u || !u.viewing) return '';
    return '<div class="vas-bar" role="status"><span>' + I.eye + '<span>Viewing as <b>' + esc(roleLabel(u.role)) + '</b></span></span>' +
      '<button type="button" class="vas-back" data-vas-back>Back to my view</button></div>';
  }
  function tokenValid(s) { return s && (s.devEmail || (s.sess && s.sessExp > Date.now() + 60000) || (s.idToken && s.exp * 1000 > Date.now() + 60000)); }
  /** Keeps the 90-day session the script hands back (renewed while the app is used), so people stay signed in. */
  function keepSession(data) {
    var u = data && data.user;
    if (!u || !u.session) return;
    var s = session() || {};
    if (s.email && u.email && String(s.email).toLowerCase() !== String(u.email).toLowerCase() && !s.devEmail) return;
    s.sess = u.session; s.sessExp = u.sessionExp; if (!s.email) s.email = u.email;
    store('fa-session', s);
  }
  function signOut() {
    unstore('fa-session'); unstore('fa-user'); unstore('fa-viewas');
    stopChat(); try { if (chat.auth) chat.auth.signOut(); } catch (e) {}
    state.user = null; state.cache = {};
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) {}
    location.hash = '#/';
    render();
  }
  function decodeJwt(t) { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; } }
  function onGoogleCredential(resp) {
    var c = decodeJwt(resp.credential);
    store('fa-session', { idToken: resp.credential, exp: c.exp, email: c.email, name: c.name });
    state.cache = {};
    render();
  }

  /* ---------- api ---------- */

  function api(params) {
    var s = session() || {};
    var q = Object.assign({}, params);
    if (s.sess && s.sessExp > Date.now() + 60000) q.session = s.sess; else if (s.idToken) q.idToken = s.idToken; else if (s.devEmail) q.devEmail = s.devEmail;
    if (viewAs() && !q.viewAs && q.viewAs !== '') q.viewAs = viewAs();
    if (q.viewAs === '') delete q.viewAs;
    var url = CFG.API_URL + '?' + Object.keys(q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&');
    return fetch(url, { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok && q.viewAs && /view as|pick a role|staff list/i.test(data.error || '')) {
          unstore('fa-viewas'); delete params.viewAs; return api(params); // an old View as choice: drop it and carry on as yourself
        }
        if (!data.ok) {
          var err = new Error(data.error || 'Something went wrong');
          err.auth = /sign in|sign-in|recognised|verified|blindmaster account|expired/i.test(data.error || '');
          throw err;
        }
        keepSession(data);
        return data;
      });
  }

  /** POST to the script (used for uploads). Plain-text body avoids a CORS preflight, which Apps Script can't answer. */
  function apiPost(body, opts) {
    if (viewAs()) return Promise.reject(new Error('You\'re viewing as ' + roleLabel(viewAs()) + '. Tap "Back to my view" to make changes.'));
    var s = session() || {};
    var b = Object.assign({}, body);
    if (s.sess && s.sessExp > Date.now() + 60000) b.session = s.sess; else if (s.idToken) b.idToken = s.idToken; else if (s.devEmail) b.devEmail = s.devEmail;
    return fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b), keepalive: !!(opts && opts.keepalive) })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (!data.ok) throw new Error(data.error || 'Upload failed'); keepSession(data); return data; });
  }

  function loadDay(date, force) {
    if (!force && state.cache[date]) return Promise.resolve(state.cache[date]);
    return api({ action: 'day', date: date })
      .then(function (data) {
        state.user = data.user;
        state.cache[date] = { appointments: data.appointments, away: data.away || [], fetchedAt: Date.now(), offline: false };
        if (data.jrBaseUrl) { state.jrBase = data.jrBaseUrl; store('fa-jrbase', data.jrBaseUrl); }
        store('fa-day-' + date, state.cache[date]);
        store('fa-user', data.user);
        return state.cache[date];
      })
      .catch(function (err) {
        if (err.auth) throw err;
        var saved = store('fa-day-' + date);
        if (saved) { saved.offline = true; state.user = state.user || store('fa-user'); return saved; }
        throw err;
      });
  }

  /* ---------- project chat (Firebase / Firestore) ----------
   * One chat per project, keyed OPP-<opportunity> (or JR-<job> until the opportunity is linked).
   * Messages: projects/{key}/messages. Access is enforced by the Firestore rules, not here.
   */

  var chat = { db: null, auth: null, ready: null, unsub: null, back: '#/chats', kind: 'message', filter: 'all', inboxFilter: 'all', msgs: [], project: null, markedAt: 0, names: {} };

  function chatEnabled() { return !!(CFG.FIREBASE && CFG.FIREBASE.projectId && window.firebase); }
  function chatInit() {
    if (chat.ready || !chatEnabled()) return chat.ready;
    try {
      firebase.initializeApp(CFG.FIREBASE);
      chat.db = firebase.firestore();
      chat.db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); // keeps chats readable with a weak signal
      chat.auth = firebase.auth();
      chat.ready = new Promise(function (resolve) { var off = chat.auth.onAuthStateChanged(function (u) { off(); resolve(u); }); });
    } catch (e) { chat.ready = null; }
    return chat.ready;
  }
  function myEmail() { var s = session() || {}; return String((state.user && (state.user.realEmail || state.user.email)) || s.email || s.devEmail || '').toLowerCase(); }
  function needConnect(msg) { var e = new Error(msg || 'Sign in to the project chat'); e.connect = true; return e; }

  /** Signs in to Firebase with the same Google account as the app. Rejects with .connect when a tap is needed. */
  function chatUser() {
    if (!chatInit()) { var e = new Error('Project chat isn\'t set up yet (FIREBASE in config.js).'); e.setup = true; return Promise.reject(e); }
    return chat.ready.then(function () {
      var u = chat.auth.currentUser;
      if (u && String(u.email).toLowerCase() === myEmail()) return u;
      var s = session() || {};
      if (s.idToken && tokenValid(s)) {
        return chat.auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(s.idToken))
          .then(function (r) { return r.user; }, function () { throw needConnect(); });
      }
      throw needConnect();
    }).then(function (u) {
      if (String(u.email).toLowerCase() !== myEmail()) { chat.auth.signOut(); throw needConnect('That Google account isn\'t ' + myEmail() + '. Sign in with the account the office added for you.'); }
      return u;
    });
  }
  function connectChat() {
    var p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ login_hint: myEmail(), prompt: 'select_account' }); // no domain lock: contractors use their own Google account
    return chat.auth.signInWithPopup(p);
  }
  function stopChat() { if (chat.unsub) { chat.unsub(); chat.unsub = null; } if (typeof stopDictation === 'function') stopDictation(); }

  function chatKeyOf(a) { return a.chatKey || (a.opp ? 'OPP-' + a.opp : a.jr ? 'JR-' + a.jr : ''); }
  function keyLabel(key, p) {
    p = p || {};
    var jr = p.jrNumber || (/^JR-/.test(key) ? key.slice(3) : ''), opp = p.oppNumber || (/^OPP-/.test(key) ? key.slice(4) : '');
    return [jr ? 'JR#' + jr : '', opp ? 'OPP-' + opp : ''].filter(String).join(' · ') || key;
  }
  function projectRef(key) { return chat.db.collection('projects').doc(key); }
  function tsDate(t) { return t && t.toDate ? t.toDate() : t ? new Date(t) : null; }
  function hhmm(d) { return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d); }
  function chatWhen(d) {
    if (!d) return '';
    var day = ymd(d);
    return day === todayStr() ? hhmm(d) : day === addDays(todayStr(), -1) ? 'Yesterday' : shortDate(day);
  }
  function dayLabel(day) { return day === todayStr() ? 'Today' : day === addDays(todayStr(), -1) ? 'Yesterday' : longDate(day); }
  function roleForChat() {
    var r = (state.user && state.user.role) || 'installer';
    return /office|admin/i.test(r) ? 'office' : /^pm$|project/i.test(r) ? 'pm' : r === 'sales' ? 'sales' : 'installer';
  }
  function roleWord(r) { return { office: 'Office', pm: 'Project manager', sales: 'Sales', installer: 'Installer' }[r] || ''; }
  function nameOf(email) { return chat.names[email] || nameFromEmail(email); }
  function nameFromEmail(email) { return String(email || '').split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

  /** Last message, unread and open-important counts for one project. */
  function summarize(p, r) {
    if (!p) return { exists: false };
    var last = p.lastMessage || null, upd = tsDate(p.updatedAt), read = r && tsDate(r.lastReadAt);
    var mine = last && (last.authorEmail ? last.authorEmail === myEmail() : last.authorName === (state.user && state.user.name));
    return { exists: true, project: p, last: last, unread: !!(last && upd && !mine && (!read || upd > read)), open: Math.max(0, p.openImportantCount || 0) };
  }
  function chatStatus(key) {
    return chatUser().then(function () {
      var pr = projectRef(key);
      return Promise.all([pr.get(), pr.collection('reads').doc(myEmail()).get().catch(function () { return null; })]);
    }).then(function (res) {
      return summarize(res[0].exists ? res[0].data() : null, res[1] && res[1].exists ? res[1].data() : null);
    });
  }

  function chatLink(a) {
    var key = chatKeyOf(a);
    if (!key || !chatEnabled()) return '';
    return '<section class="section stack" style="gap:8px"><h2 style="margin-bottom:4px">Project chat</h2>' +
      '<a class="linkrow chat-link" href="#/chat/' + encodeURIComponent(key) + '" data-key="' + esc(key) + '">' + I.msg +
        '<span class="text"><b>Open project chat</b><span class="chat-sub">' + esc(keyLabel(key, { jrNumber: a.jr, oppNumber: a.opp })) + '</span></span>' +
        '<span class="chat-badges"></span>' + I.right + '</a></section>';
  }
  function fillChatLinks() {
    Array.prototype.forEach.call(document.querySelectorAll('.chat-link'), function (el) {
      var key = el.getAttribute('data-key'), sub = el.querySelector('.chat-sub'), badges = el.querySelector('.chat-badges');
      chatStatus(key).then(function (s) {
        if (!s.exists || !s.last) { sub.textContent = 'No messages yet'; return; }
        sub.textContent = (s.last.authorName ? firstName(s.last.authorName) + ': ' : '') + s.last.text;
        badges.innerHTML = (s.open ? '<span class="tag tag-blue">' + s.open + ' important</span>' : '') + (s.unread ? '<span class="dot" role="img" aria-label="Unread messages"></span>' : '');
      }, function (err) { if (err.connect) sub.textContent = 'Tap to connect the chat'; });
    });
  }

  function connectHtml(err) {
    return '<div class="empty stack" style="gap:12px"><h2>Connect the project chat</h2>' +
      '<p class="muted" style="margin:0">' + esc(err && err.connect && !/^Sign in to/.test(err.message) ? err.message : 'The chat uses your Blindmaster Google account. You only need to do this once on this device.') + '</p>' +
      '<button class="btn btn-dark" type="button" data-connect>Sign in with Google</button><p class="small connect-err" style="margin:0"></p></div>';
  }
  function chatErrorHtml(err) {
    if (err && err.connect) return connectHtml(err);
    var denied = err && /permission|insufficient/i.test(err.code + ' ' + err.message);
    return '<div class="empty stack"><h2>' + (denied ? 'You\'re not in this chat yet' : 'Couldn\'t load the chat') + '</h2><p class="muted" style="margin:0">' +
      esc(denied ? 'You\'re added automatically when you\'re booked on one of its appointments. The office can also add you.' : (err && err.message) || 'Check your connection and try again.') + '</p></div>';
  }
  function bindConnect() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-connect]'), function (b) {
      b.onclick = function () {
        var out = b.parentNode.querySelector('.connect-err');
        b.disabled = true;
        connectChat().then(function () { app.innerHTML = ''; render(); }, function (e) { // rebuild the whole screen: list and conversation both need the new sign-in
          b.disabled = false;
          if (out) out.textContent = /popup/i.test(e.code || '') ? 'The sign-in window was blocked or closed. Try again.' : (e.message || 'Sign-in didn\'t work.');
        });
      };
    });
  }

  /* inbox */

  function inboxHtml() {
    var f = chat.inboxFilter;
    return '<div class="chat-inbox-head"><div class="spread"><h1 style="font-size:24px">Project chats</h1><button class="link-btn" id="inboxRefresh" type="button">Refresh</button></div>' +
      '<div class="seg" role="group" aria-label="Show">' +
        [['all', 'All'], ['unread', 'Unread'], ['important', 'Important']].map(function (o) {
          return '<button type="button" data-inbox="' + o[0] + '" aria-pressed="' + (f === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</div></div>' +
      '<div id="chatInbox"><p class="loading">Loading chats…</p></div>';
  }
  function drawInbox(selectedKey) {
    var el = document.getElementById('chatInbox'); if (!el) return;
    var rows = (chat.inboxRows || []).filter(function (r) {
      return chat.inboxFilter === 'unread' ? r.s.unread : chat.inboxFilter === 'important' ? r.s.open > 0 : true;
    });
    if (!rows.length) {
      el.innerHTML = '<p class="muted" style="padding:16px 20px;margin:0">' + (chat.inboxFilter === 'all' ? 'No conversations yet. Open an appointment and tap Project chat to start one.' : 'Nothing here.') + '</p>';
      return;
    }
    el.innerHTML = '<ul class="chat-inbox">' + rows.map(function (r) {
      var last = r.s.last || {};
      return '<li><a class="chat-item' + (r.key === selectedKey ? ' is-selected' : '') + (r.s.unread ? ' is-unread' : '') + '" href="#/chat/' + encodeURIComponent(r.key) + '">' +
        '<span class="spread"><b class="chat-item-title">' + esc(r.p.title || keyLabel(r.key, r.p)) + '</b><span class="small chat-item-time">' + esc(chatWhen(tsDate(r.p.updatedAt))) + '</span></span>' +
        '<span class="small chat-item-ref">' + esc(keyLabel(r.key, r.p) + (r.p.address ? ' · ' + suburb(r.p.address) : '')) + '</span>' +
        '<span class="chat-item-last">' + esc((last.authorName ? firstName(last.authorName) + ': ' : '') + (last.text || '')) + '</span>' +
        (r.s.open || r.s.unread ? '<span class="row" style="gap:8px">' + (r.s.open ? '<span class="tag tag-blue">' + r.s.open + ' important open</span>' : '') + (r.s.unread ? '<span class="dot" role="img" aria-label="Unread"></span>' : '') + '</span>' : '') +
      '</a></li>';
    }).join('') + '</ul>';
  }
  function loadInbox(selectedKey) {
    var el = document.getElementById('chatInbox'); if (!el) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-inbox]'), function (b) {
      b.onclick = function () {
        chat.inboxFilter = b.getAttribute('data-inbox');
        Array.prototype.forEach.call(document.querySelectorAll('[data-inbox]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        drawInbox(selectedKey);
      };
    });
    var rb = document.getElementById('inboxRefresh'); if (rb) rb.onclick = function () { el.innerHTML = '<p class="loading">Loading chats…</p>'; loadInbox(selectedKey); };
    chatUser().then(function () {
      var col = chat.db.collection('projects');
      // office: every project chat; everyone else: the chats they're a member of
      return (isOffice() ? col.orderBy('updatedAt', 'desc').limit(100) : col.where('memberEmails', 'array-contains', myEmail())).get();
    }).then(function (snap) {
      var rows = snap.docs.map(function (d) { return { key: d.id, p: d.data() }; }).filter(function (r) { return r.p.lastMessage; });
      rows.sort(function (a, b) { return (tsDate(b.p.updatedAt) || 0) - (tsDate(a.p.updatedAt) || 0); });
      return Promise.all(rows.map(function (r) {
        return projectRef(r.key).collection('reads').doc(myEmail()).get()
          .then(function (s) { r.s = summarize(r.p, s.exists ? s.data() : null); }, function () { r.s = summarize(r.p, null); });
      })).then(function () { return rows; });
    }).then(function (rows) {
      chat.inboxRows = rows;
      drawInbox(selectedKey);
    }, function (err) {
      el.innerHTML = chatErrorHtml(err);
      bindConnect();
    });
  }

  function renderChats() {
    stopChat();
    if (wide()) {
      app.innerHTML = shell('chats', null, '<div class="split"><section class="pane-list chat-list-pane" aria-label="Project chats">' + inboxHtml() + '</section>' +
        '<section class="pane-detail chat-pane" aria-label="Conversation"><div class="empty-detail"><p class="muted">Select a chat to read and reply.</p></div></section></div>');
    } else {
      app.innerHTML = topbar() + '<main>' + inboxHtml() + '</main>' + tabbar('chats');
    }
    loadInbox(null);
  }

  /* one conversation */

  function threadHtml(key) {
    var f = chat.filter;
    return '<div class="chat-thread">' +
      '<div class="chat-top">' +
        '<div class="stack" style="gap:2px;min-width:0"><b class="chat-title" id="chatTitle">' + esc(keyLabel(key)) + '</b><span class="small muted chat-subtitle" id="chatSubtitle">Project chat</span></div>' +
        '<div class="seg seg-sm" role="group" aria-label="Show">' + [['all', 'All'], ['important', 'Important'], ['note', 'Notes']].map(function (o) {
          return '<button type="button" data-filter="' + o[0] + '" aria-pressed="' + (f === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="chat-msgs" id="chatMsgs"><p class="loading">Loading messages…</p></div>' +
      '<form class="chat-compose" id="chatForm" autocomplete="off">' +
        '<div class="seg chat-kinds" role="radiogroup" aria-label="Message type">' +
          [['message', 'Message'], ['note', 'Note for the record'], ['important', 'Important']].map(function (o) {
            return '<button type="button" role="radio" data-kind="' + o[0] + '" aria-checked="false">' + o[1] + '</button>';
          }).join('') + '</div>' +
        '<p class="small chat-hint" id="chatHint" hidden></p>' +
        '<div class="chat-tray" id="chatTray" hidden></div>' +
        '<div class="chat-input-row">' +
          '<label class="chat-tool" title="Photo or video"><input type="file" id="chatFile" accept="image/*,video/*" multiple class="sr-only">' + I.camera + '<span class="sr-only">Add a photo or video</span></label>' +
          (speechSupported() ? '<button class="chat-tool" type="button" id="chatMic" aria-pressed="false" title="Speak your message">' + I.mic + '<span class="sr-only">Voice to text</span></button>' : '') +
          '<label class="sr-only" for="chatText">Message</label>' +
          '<textarea id="chatText" rows="1" maxlength="4000" placeholder="Message the project team"></textarea>' +
          '<button class="btn btn-dark" id="chatSend" type="submit" disabled>Send</button></div>' +
      '</form></div>';
  }

  function renderChat(key) {
    if (wide()) {
      var pane = document.querySelector('.chat-pane');
      if (pane && document.getElementById('chatInbox')) {
        // already on the chats page: just swap the conversation
        stopChat();
        pane.innerHTML = threadHtml(key);
        Array.prototype.forEach.call(document.querySelectorAll('.chat-item'), function (a) { a.classList.toggle('is-selected', a.getAttribute('href') === '#/chat/' + encodeURIComponent(key)); });
      } else {
        stopChat();
        app.innerHTML = shell('chats', null, '<div class="split"><section class="pane-list chat-list-pane" aria-label="Project chats">' + inboxHtml() + '</section>' +
          '<section class="pane-detail chat-pane" aria-label="Conversation">' + threadHtml(key) + '</section></div>');
        loadInbox(key);
      }
    } else {
      stopChat();
      app.innerHTML = topbar({ back: chat.back, backLabel: 'Back', right: keyLabel(key) }) + '<main class="chat-main">' + threadHtml(key) + '</main>';
    }
    startThread(key);
  }

  function startThread(key) {
    chat.msgs = []; chat.project = null; chat.markedAt = 0;
    bindComposer(key);
    var box = document.getElementById('chatMsgs');
    chatUser().then(function () {
      projectRef(key).get().then(function (s) {
        if (!s.exists) return;
        chat.project = s.data();
        var t = document.getElementById('chatTitle'), st = document.getElementById('chatSubtitle');
        if (t && chat.project.title) t.textContent = chat.project.title;
        if (st) st.textContent = [keyLabel(key, chat.project), chat.project.address ? suburb(chat.project.address) : ''].filter(String).join(' · ');
      }).catch(function () {});
      chat.unsub = projectRef(key).collection('messages').orderBy('createdAt').limitToLast(300).onSnapshot(function (snap) {
        chat.msgs = snap.docs.map(function (d) { var m = d.data({ serverTimestamps: 'estimate' }); m.id = d.id; m.pending = d.metadata.hasPendingWrites; if (m.authorEmail && m.authorName) chat.names[m.authorEmail] = m.authorName; return m; });
        drawMessages(key);
        markRead(key);
      }, function (err) { if (box) box.innerHTML = chatErrorHtml(err); });
    }, function (err) {
      if (!box) return;
      box.innerHTML = chatErrorHtml(err);
      bindConnect();
    });
  }

  /* ---------- chat media and voice ---------- */

  var MAX_FILES = 6, MAX_VIDEO_BYTES = 30 * 1024 * 1024, IMG_MAX_PX = 1600;
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function mediaSummary(media) {
    var p = media.filter(function (x) { return !/^video/.test(x.type); }).length, v = media.length - p;
    return [p ? p + (p === 1 ? ' photo' : ' photos') : '', v ? v + (v === 1 ? ' video' : ' videos') : ''].filter(String).join(' and ') || 'Attachment';
  }
  /** Photos are resized to 1600 px JPEG before upload: quicker on a weak signal, still sharp enough for site detail. */
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var scale = Math.min(1, IMG_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var t = document.createElement('canvas'), ts = 96 / Math.max(c.width, c.height); t.width = Math.round(c.width * ts); t.height = Math.round(c.height * ts);
        t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        c.toBlob(function (blob) { URL.revokeObjectURL(url); blob ? resolve({ blob: blob, thumb: t.toDataURL('image/jpeg', 0.7) }) : reject(new Error('resize')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }
  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = function () { reject(new Error('Couldn\'t read the file')); };
      r.readAsDataURL(blob);
    });
  }
  /** Uploads one file at a time to the project's Drive folder (via the script). Returns [{url, id, name, type}]. */
  function uploadAll(key, files, progress) {
    var out = [];
    return files.reduce(function (p, f, i) {
      return p.then(function () {
        progress(i, files.length);
        var blob = f.blob || f.file;
        return toBase64(blob).then(function (data) {
          return apiPost({ action: 'chatUpload', key: key, name: f.name, mime: blob.type || (f.isVideo ? 'video/mp4' : 'image/jpeg'), data: data });
        }).then(function (r) { out.push({ url: r.url, id: r.id, name: r.name, type: r.mime }); });
      });
    }, Promise.resolve()).then(function () { return out; });
  }
  function driveId(url) { var m = String(url || '').match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/); return m ? (m[1] || m[2]) : ''; }
  function mediaHtml(m) {
    var items = (m.media && m.media.length ? m.media : (m.mediaUrls || []).map(function (u) { return { url: u }; }));
    if (!items.length) return '';
    return '<div class="chat-media-grid">' + items.map(function (x, i) {
      var id = x.id || driveId(x.url), isImg = /^image/.test(x.type || ''), isVid = /^video/.test(x.type || '');
      if ((isImg || isVid) && id) {
        return '<a class="chat-thumb' + (isVid ? ' is-video' : '') + '" href="' + esc(x.url) + '" target="_blank" rel="noopener" aria-label="' + (isVid ? 'Open video' : 'Open photo') + '">' +
          '<img src="https://drive.google.com/thumbnail?id=' + esc(id) + '&sz=w480" alt="" loading="lazy" onerror="this.remove()">' +
          '<span class="chat-thumb-label">' + (isVid ? I.play + 'Video' : 'Photo') + '</span></a>';
      }
      return '<a class="chat-media" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + I.folder + esc(x.name || 'Attachment ' + (i + 1)) + '</a>';
    }).join('') + '</div>';
  }

  var dictation = null;
  function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function stopDictation() { if (dictation) { try { dictation.rec.stop(); } catch (e) {} } }
  /** Voice to text: words appear in the message box to check before sending (Australian English). */
  function toggleDictation(btn, ta, sync) {
    if (dictation) { stopDictation(); return; }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR(), base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
    rec.lang = 'en-AU'; rec.interimResults = true; rec.continuous = true;
    dictation = { rec: rec };
    btn.setAttribute('aria-pressed', 'true'); btn.classList.add('is-listening');
    rec.onresult = function (e) {
      var finalText = '', interim = '';
      for (var i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript; }
      ta.value = base + finalText + interim; sync();
    };
    rec.onerror = function (e) { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('Allow microphone access for this site to use voice to text. You can also use the microphone key on your keyboard.'); };
    rec.onend = function () { dictation = null; btn.setAttribute('aria-pressed', 'false'); btn.classList.remove('is-listening'); ta.value = ta.value.replace(/^\s+/, ''); sync(); };
    try { rec.start(); } catch (e) { rec.onend(); }
  }

  function msgHtml(m, me) {
    var t = tsDate(m.createdAt), time = t ? hhmm(t) : '';
    var media = mediaHtml(m);
    if (m.kind === 'system') return '<div class="chat-system"><p>' + esc(m.text) + '</p>' + media + '<span class="small">' + esc(time) + '</span></div>';
    var mine = m.authorEmail === me, open = m.kind === 'important' && m.status === 'open';
    var label = m.kind === 'important' ? '<span class="tag ' + (open ? 'tag-dark' : '') + '">' + (open ? 'Important · open' : 'Important · sorted') + '</span>'
      : m.kind === 'note' ? '<span class="tag tag-light">Note for the record</span>' : '';
    var foot = '';
    if (m.kind === 'important' && m.status === 'sorted') foot = '<span class="small chat-sorted">Sorted by ' + esc(m.sortedBy === me ? 'you' : nameOf(m.sortedBy)) + (m.sortedAt ? ', ' + esc(chatWhen(tsDate(m.sortedAt))) : '') + '</span>';
    if (open && !m.pending) foot = '<button class="link-btn chat-sort" type="button" data-sort="' + esc(m.id) + '">Mark sorted</button>';
    return '<div class="chat-msg' + (mine ? ' is-mine' : '') + ' kind-' + esc(m.kind) + (open ? ' is-open' : '') + '">' +
      '<div class="chat-meta"><b>' + esc(mine ? 'You' : m.authorName || nameOf(m.authorEmail)) + '</b>' + (!mine && roleWord(m.authorRole) ? '<span>' + esc(roleWord(m.authorRole)) + '</span>' : '') + '<span>' + esc(m.pending ? 'Sending…' : time) + '</span></div>' +
      '<div class="chat-bubble">' + label + (m.text ? '<p>' + esc(m.text) + '</p>' : '') + media + foot + '</div></div>';
  }

  function drawMessages(key) {
    var box = document.getElementById('chatMsgs'); if (!box) return;
    var stick = !box.getAttribute('data-drawn') || box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    var me = myEmail(), f = chat.filter;
    var list = chat.msgs.filter(function (m) { return f === 'all' || m.kind === f; });
    var openCount = chat.msgs.filter(function (m) { return m.kind === 'important' && m.status === 'open'; }).length;
    var ib = document.querySelector('[data-filter="important"]'); if (ib) ib.textContent = openCount ? 'Important (' + openCount + ')' : 'Important';
    if (!list.length) {
      box.innerHTML = '<div class="chat-empty">' + (f === 'all' ? 'No messages yet. Everyone on this project, and the office, will see what you post here.' : f === 'important' ? 'No important messages.' : 'No notes for the record yet.') + '</div>';
    } else {
      var lastDay = '';
      box.innerHTML = list.map(function (m) {
        var day = ymd(tsDate(m.createdAt) || new Date()), sep = '';
        if (day !== lastDay) { sep = '<div class="chat-day"><span>' + esc(dayLabel(day)) + '</span></div>'; lastDay = day; }
        return sep + msgHtml(m, me);
      }).join('');
    }
    box.setAttribute('data-drawn', '1');
    if (stick) box.scrollTop = box.scrollHeight;
    Array.prototype.forEach.call(box.querySelectorAll('[data-sort]'), function (b) { b.onclick = function () { markSorted(key, b.getAttribute('data-sort'), b); }; });
  }

  var KIND_HINT = {
    message: '',
    note: 'Kept with the project, for anyone who works on it later.',
    important: 'Emails the project team and the office. Stays open until someone marks it sorted.'
  };
  function bindComposer(key) {
    var form = document.getElementById('chatForm'), ta = document.getElementById('chatText'), send = document.getElementById('chatSend'), hint = document.getElementById('chatHint');
    if (!form) return;
    function setKind(k) {
      chat.kind = k;
      Array.prototype.forEach.call(form.querySelectorAll('[data-kind]'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-kind') === k)); });
      hint.textContent = KIND_HINT[k]; hint.hidden = !KIND_HINT[k];
      ta.placeholder = k === 'note' ? 'Add a note for the record' : k === 'important' ? 'What needs discussing?' : 'Message the project team';
      send.textContent = k === 'note' ? 'Save note' : k === 'important' ? 'Flag' : 'Send';
      form.classList.toggle('is-important', k === 'important');
    }
    var files = [], busy = false, tray = document.getElementById('chatTray'), fileIn = document.getElementById('chatFile'), mic = document.getElementById('chatMic');
    function sync() { send.disabled = busy || (!ta.value.trim() && !files.length); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }
    function drawTray() {
      tray.hidden = !files.length;
      tray.innerHTML = files.map(function (f, i) {
        return '<span class="chat-chip">' + (f.thumb ? '<img src="' + f.thumb + '" alt="">' : '<span class="chat-chip-icon">' + (f.isVideo ? I.play : I.folder) + '</span>') +
          '<span class="chat-chip-name">' + esc(f.isVideo ? 'Video' : 'Photo') + ' · ' + esc(fmtSize(f.size)) + '</span>' +
          '<button type="button" data-remove="' + i + '" aria-label="Remove">' + I.x + '</button></span>';
      }).join('');
      Array.prototype.forEach.call(tray.querySelectorAll('[data-remove]'), function (b) { b.onclick = function () { files.splice(Number(b.getAttribute('data-remove')), 1); drawTray(); sync(); }; });
    }
    fileIn.onchange = function () {
      Array.prototype.forEach.call(fileIn.files, function (f) {
        if (files.length >= MAX_FILES) return;
        var isVideo = /^video\//.test(f.type);
        if (!isVideo && !/^image\//.test(f.type)) return;
        if (isVideo && f.size > MAX_VIDEO_BYTES) { alert('That video is ' + fmtSize(f.size) + '. Please keep videos under ' + fmtSize(MAX_VIDEO_BYTES) + ' (about 30 seconds).'); return; }
        var item = { file: f, isVideo: isVideo, size: f.size, name: f.name || (isVideo ? 'video.mp4' : 'photo.jpg') };
        files.push(item);
        if (!isVideo) shrinkImage(f).then(function (r) { item.blob = r.blob; item.thumb = r.thumb; item.size = r.blob.size; item.name = item.name.replace(/\.[^.]+$/, '') + '.jpg'; drawTray(); }, function () {});
      });
      fileIn.value = ''; drawTray(); sync();
    };
    if (mic) mic.onclick = function () { toggleDictation(mic, ta, sync); };
    Array.prototype.forEach.call(form.querySelectorAll('[data-kind]'), function (b) { b.onclick = function () { setKind(b.getAttribute('data-kind')); ta.focus(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (b) {
      b.onclick = function () {
        chat.filter = b.getAttribute('data-filter');
        Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var box = document.getElementById('chatMsgs'); if (box) box.removeAttribute('data-drawn');
        drawMessages(key);
      };
    });
    ta.oninput = sync;
    ta.onkeydown = function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.onsubmit(e); } };
    form.onsubmit = function (e) {
      e.preventDefault();
      var text = ta.value.trim(), kind = chat.kind, sending = files.slice();
      if ((!text && !sending.length) || busy) return;
      stopDictation();
      busy = true; sync();
      uploadAll(key, sending, function (done, total) { hint.hidden = false; hint.textContent = 'Uploading ' + (done + 1) + ' of ' + total + '…'; }).then(function (media) {
        ta.value = ''; files = []; drawTray();
        busy = false; sync(); setKind(kind === 'important' ? 'message' : kind);
        return postMessage(key, kind, text, media).catch(function (err) { ta.value = text; sync(); setKind(kind); throw err; });
      }).catch(function (err) {
        busy = false; sync(); hint.textContent = KIND_HINT[chat.kind]; hint.hidden = !KIND_HINT[chat.kind];
        alert(/permission|insufficient/i.test(err.code + ' ' + err.message) ? 'You can\'t post in this chat yet. You\'re added when you\'re booked on one of its appointments.' : 'Couldn\'t send: ' + (err.message || 'check your connection.'));
      });
    };
    setKind('message');
  }

  function postMessage(key, kind, text, media) {
    media = media || [];
    return chatUser().then(function () {
      var me = myEmail(), u = state.user || {}, p = chat.project || {};
      var FV = firebase.firestore.FieldValue, now = FV.serverTimestamp();
      var pr = projectRef(key), ref = pr.collection('messages').doc();
      var m = {
        oppNumber: p.oppNumber || (/^OPP-/.test(key) ? key.slice(4) : ''),
        jrNumber: p.jrNumber || (/^JR-/.test(key) ? key.slice(3) : ''),
        createdAt: now, authorEmail: me, authorName: u.name || nameFromEmail(me), authorRole: roleForChat(),
        kind: kind, text: text.slice(0, 4000), mediaUrls: media.map(function (x) { return x.url; }), media: media,
        status: kind === 'important' ? 'open' : '', sortedBy: '', sortedAt: null, source: 'app'
      };
      var preview = m.text || mediaSummary(media);
      var summary = { lastMessage: { text: preview.slice(0, 140), authorName: m.authorName, authorEmail: me, at: now, kind: kind }, updatedAt: now };
      if (kind === 'important') summary.openImportantCount = FV.increment(1);
      var b = chat.db.batch();
      b.set(ref, m);
      b.set(pr, summary, { merge: true });
      return b.commit().then(function () {
        if (kind === 'important') api({ action: 'chatNotify', key: key, id: ref.id }).catch(function () {});
      });
    });
  }

  function markSorted(key, id, btn) {
    btn.disabled = true;
    var FV = firebase.firestore.FieldValue, pr = projectRef(key), b = chat.db.batch();
    b.update(pr.collection('messages').doc(id), { status: 'sorted', sortedBy: myEmail(), sortedAt: FV.serverTimestamp() });
    b.set(pr, { openImportantCount: FV.increment(-1) }, { merge: true });
    b.commit().catch(function (err) { btn.disabled = false; alert('Couldn\'t mark it sorted: ' + (err.message || 'check your connection.')); });
  }

  function markRead(key) {
    var last = chat.msgs[chat.msgs.length - 1], at = last && tsDate(last.createdAt);
    if (!at || at.getTime() <= chat.markedAt || document.visibilityState === 'hidden') return;
    chat.markedAt = at.getTime();
    projectRef(key).collection('reads').doc(myEmail()).set({ lastReadAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
  }

  /* ---------- sales autosave ----------
     Everything on a site visit (the item being measured, site notes, a sketch, photos and videos) is kept on the phone
     as it's entered, so putting the phone down, locking it, or iOS closing the app in the background loses nothing.
     Notes and sketches/measures live in localStorage; photos and videos wait in IndexedDB until they've uploaded. */
  var VA_DAYS = 7, vaFlush = null, vaResumed = false;
  function vaKey(id, date) { return 'fa-sd-' + id + '|' + date; }
  function vaLoad(id, date) { var d = store(vaKey(id, date)); return d && d.at > Date.now() - VA_DAYS * 864e5 ? d : null; }
  function vaSave(id, date, patch) {
    var d = vaLoad(id, date) || {};
    Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
    d.at = Date.now(); d.id = id; d.date = date;
    store(vaKey(id, date), d);
    if (/^#\/(visit|measure|capture)\//.test(location.hash)) store('fa-sd-last', { id: id, date: date, hash: location.hash, at: d.at });
  }
  function vaDrop(id, date, field) {
    var d = vaLoad(id, date); if (!d) return;
    delete d[field];
    if (!d.ms && d.notes == null && !(d.strokes && d.strokes.length)) { unstore(vaKey(id, date)); var l = store('fa-sd-last'); if (l && l.id === id && l.date === date) unstore('fa-sd-last'); }
    else store(vaKey(id, date), d);
  }
  /** Reopened from the home screen after iOS closed it: go straight back to the visit screen they were on. */
  function vaResume() {
    if (vaResumed) return false; vaResumed = true;
    var l = store('fa-sd-last');
    if (!l || !l.hash || l.at < Date.now() - 12 * 36e5 || !vaLoad(l.id, l.date)) return false;
    location.hash = l.hash; return true;
  }
  function dftNotes(id, date) { var d = vaLoad(id, date); return d ? d.notes : null; }
  function vaSaveMs(id, date) {
    if (ms.step === 'item' && ms.item) vaSave(id, date, { ms: JSON.parse(JSON.stringify(ms)) }); else vaDrop(id, date, 'ms');
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (vaFlush) try { vaFlush(); } catch (e) {} }
    else uqRun();
  });
  window.addEventListener('pagehide', function () { if (vaFlush) try { vaFlush(); } catch (e) {} });
  window.addEventListener('online', function () { uqRun(); });

  /* Upload queue: photos and videos are saved on the phone first, then sent. A dropped signal or a locked screen
     just means they send later (when the app is next open with signal). */
  var uq = { db: null, busy: false, timer: null, ok: typeof indexedDB !== 'undefined' };
  function uqDb() {
    if (!uq.db) uq.db = new Promise(function (res, rej) {
      var r = indexedDB.open('bm-field-uploads', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('q', { keyPath: 'qid' }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return uq.db;
  }
  function uqTx(mode, fn) {
    return uqDb().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction('q', mode), req = fn(t.objectStore('q')), out;
        if (req) req.onsuccess = function () { out = req.result; };
        t.oncomplete = function () { res(out); }; t.onerror = t.onabort = function () { rej(t.error || new Error('Couldn\'t save on this phone')); };
      });
    });
  }
  function uqAll() { return uq.ok ? uqTx('readonly', function (s) { return s.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return x.added - y.added; }); }, function () { return []; }) : Promise.resolve([]); }
  /** job: { id, date, kind, mime, name, blob, extra }. Resolves once it's safely on the phone. */
  function uqAdd(job) {
    job.qid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); job.added = Date.now(); job.tries = 0;
    return uqTx('readwrite', function (s) { return s.put(job); }).then(function () { uqBars(); setTimeout(uqRun, 50); return job; });
  }
  function uqRun(force) {
    if (!uq.ok || uq.busy || viewAs()) return;
    if (!tokenValid(session())) return;
    uq.busy = true; clearTimeout(uq.timer); uq.timer = null;
    var sent = {}, offline = false;
    uqAll().then(function (jobs) {
      jobs = jobs.filter(function (j) { return force || j.tries < 3; });
      return jobs.reduce(function (p, j) {
        return p.then(function () {
          if (offline) return;
          uqBars(j);
          return toBase64(j.blob).then(function (b64) {
            return apiPost(Object.assign({ action: 'visitUpload', id: j.id, date: j.date, kind: j.kind, data: b64, mime: j.mime, name: j.name }, j.extra || {}));
          }).then(function () {
            sent[visitKey(j.id, j.date)] = 1;
            return uqTx('readwrite', function (s) { return s['delete'](j.qid); });
          }, function (e) {
            if (e instanceof TypeError || !navigator.onLine) { offline = true; return; } // no signal: try again later
            j.tries++; j.error = e.message || 'Upload failed';
            return uqTx('readwrite', function (s) { return s.put(j); });
          });
        });
      }, Promise.resolve());
    }).then(function () {
      uq.busy = false; uq.timer = offline ? setTimeout(function () { uq.timer = null; uqRun(); }, 30000) : null; uqBars();
      var r = route(), k = r.arg && visitKey(r.arg, r.arg2 || todayStr());
      if (k && sent[k] && (r.name === 'capture' || r.name === 'visit')) loadVisit(r.arg, r.arg2 || todayStr(), true).then(function () {
        if (route().name === 'capture' && cap.tab !== 'notes' && cap.tab !== 'sketch') renderCapture(r.arg, r.arg2 || todayStr(), cap.tab);
        else if (route().name === 'visit') drawVisit(r.arg, r.arg2 || todayStr(), vs.data);
      }, function () {});
    }, function () { uq.busy = false; });
  }
  /** Fills any "waiting to upload" line on screen ([data-uqbar="id|date"]). */
  function uqBars(current) {
    var bars = document.querySelectorAll('[data-uqbar]'); if (!bars.length) return;
    uqAll().then(function (jobs) {
      Array.prototype.forEach.call(bars, function (el) {
        var k = el.getAttribute('data-uqbar'), mine = jobs.filter(function (j) { return visitKey(j.id, j.date) === k; });
        var stuck = mine.filter(function (j) { return j.tries >= 3; }), wait = mine.length - stuck.length;
        var vids = mine.filter(function (j) { return /^video/.test(j.mime); }).length, what = function (n, v) { return n + ' ' + (v === n ? (n === 1 ? 'video' : 'videos') : v ? 'files' : (n === 1 ? 'photo' : 'photos')); };
        if (!mine.length) { el.hidden = true; el.innerHTML = ''; return; }
        el.hidden = false;
        el.innerHTML = (wait ? '<span>' + I.clock + '<span><b>' + what(wait, vids) + ' saved on this phone</b> · ' + (uq.busy ? 'uploading now…' : uq.timer && !uq.busy ? 'no signal, will send when you\'re back online' : navigator.onLine ? 'sending shortly' : 'will send when you have signal') + '</span></span>' : '') +
          (stuck.length ? '<span><b>' + stuck.length + ' couldn\'t upload</b> (' + esc(stuck[0].error || 'error') + ') <button type="button" class="link-btn" data-uqretry>Try again</button></span>' : '');
        var b = el.querySelector('[data-uqretry]'); if (b) b.onclick = function () { uqRun(true); };
      });
    });
  }
  function uqBar(id, date) { return '<div class="uq-bar" data-uqbar="' + esc(visitKey(id, date)) + '" role="status" hidden></div>'; }

  /* ---------- router ---------- */

  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    return { name: parts[0] || 'day', arg: parts[1] ? decodeURIComponent(parts[1]) : '', arg2: parts[2] ? decodeURIComponent(parts[2]) : '', arg3: parts[3] ? decodeURIComponent(parts[3]) : '' };
  }
  window.addEventListener('hashchange', render);
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (layoutMode() !== state.mode) render(); }, 150);
  });

  function render() {
    state.mode = layoutMode();
    document.body.className = 'mode-' + state.mode;
    var s = session();
    if (!CFG.API_URL || /PASTE_/.test(CFG.API_URL)) return renderSetupNeeded();
    if (!tokenValid(s)) return renderSignIn();
    vaFlush = null;
    if (!vaResumed) setTimeout(uqRun, 1500);
    if (!location.hash.replace(/^#\/?/, '') && vaResume()) return;
    var r = route();
    if (r.name !== 'chat') { stopChat(); if (r.name !== 'chats') chat.back = location.hash || '#/day'; else chat.back = '#/chats'; }
    if (r.name !== 'jr' && r.name !== 'jrappt') state.jrBack = location.hash || '#/day';
    if ((r.name === 'chats' || r.name === 'chat' || r.name === 'planner' || r.name === 'account' || r.name === 'me' || r.name === 'staff' || r.name === 'vehicles' || r.name === 'myvehicle' || r.name === 'ticket' || r.name === 'mytickets' || r.name === 'ask') && !state.user) {
      // opened straight from a link (e.g. a chat email): find out who this is first
      loading('Loading…');
      return api({ action: 'me' }).then(function (d) { state.user = d.user; store('fa-user', d.user); render(); }, function (err) { showError(err, render); });
    }
    if (r.name === 'jr' && r.arg) return renderJobReport(jrFormUrl(r.arg, r.arg2), 'JR#' + r.arg, r.arg2 || todayStr());
    if (r.name === 'jrappt' && r.arg) return renderJobReportForAppt(r.arg, r.arg2 || todayStr());
    if (r.name === 'chats') return renderChats();
    if (r.name === 'chat' && r.arg) return renderChat(r.arg);
    if (r.name === 'appt') return wide() ? renderDayWide(r.arg2 || todayStr(), r.arg) : renderAppointment(r.arg2 || todayStr(), r.arg);
    if (r.name === 'route') return renderRoute(r.arg || todayStr());
    if (r.name === 'team') return renderTeam(r.arg || todayStr());
    if (r.name === 'planner') return renderPlanner(r.arg || todayStr());
    if (r.name === 'overview') return renderOverview(r.arg || 'today', r.arg2 || todayStr());
    if (!location.hash.replace(/^#\/?/, '') && isOffice()) return renderOverview('today', todayStr());
    if (r.name === 'account') return renderAccount();
    if (r.name === 'me') return renderMe();
    if (r.name === 'visit' && r.arg) return renderVisit(r.arg, r.arg2 || todayStr());
    if (r.name === 'measure' && r.arg) return renderMeasure(r.arg, r.arg2 || todayStr());
    if (r.name === 'capture' && r.arg) return renderCapture(r.arg, r.arg2 || todayStr(), r.arg3);
    if (r.name === 'todo') return renderTodo();
    if (r.name === 'staff') return renderStaff(r.arg, r.arg2);
    if (r.name === 'ticket' && r.arg) return renderTicket(r.arg);
    if (r.name === 'mytickets') return renderMyTickets();
    if (r.name === 'tickets') return renderTicketRegister();
    if (r.name === 'ask') return renderAsk();
    if (r.name === 'vehicles') return renderVehicles(r.arg);
    if (r.name === 'myvehicle') return renderMyVehicle();
    if (r.name === 'leave') return r.arg === 'new' ? renderLeaveNew() : r.arg ? renderLeaveItem(r.arg) : renderLeave();
    if (r.name === 'clock') return renderClock();
    if (r.name === 'hours') return renderHours(r.arg);
    if (r.name === 'collateral' && r.arg) return renderCollateral(r.arg, r.arg2 || todayStr());
    if (r.name === 'receipts') return renderReceipts(r.arg);
    var date = r.name === 'day' && r.arg ? r.arg : todayStr();
    return wide() ? renderDayWide(date, null) : renderDay(date);
  }

  /* ---------- chrome: phone ---------- */

  function topbar(opts) {
    opts = opts || {};
    var left = opts.back
      ? '<a class="back" href="' + esc(opts.back) + '">' + I.back + esc(opts.backLabel || 'Back') + '</a>'
      : '<img src="wordmark-white.svg" alt="Blindmaster">';
    var right = opts.right != null ? '<span class="meta">' + esc(opts.right) + '</span>'
      : (state.user ? '<a class="avatar" href="#/account" aria-label="Account: ' + esc(state.user.name) + '">' + esc(initials(state.user.name)) + '</a>' : '');
    return '<header class="topbar">' + left + right + '</header>' + vasBar();
  }

  function navItems(date) {
    var d = date && date !== todayStr() ? '/' + date : '';
    var items = [];
    if (isOffice()) items.push({ key: 'overview', href: '#/overview', icon: I.chart, label: 'Overview' });
    items.push(
      { key: 'day', href: '#/day' + d, icon: I.cal, label: isOffice() ? 'Schedule' : 'Today' },
      { key: 'route', href: '#/route' + d, icon: I.route, label: 'Route' });
    if (canSchedule()) items.push({ key: 'planner', href: '#/planner', icon: I.planner, label: 'Planner' });
    if (isOffice()) items.push({ key: 'team', href: '#/team' + d, icon: I.team, label: 'Team' });
    if (isManagerUser()) items.push({ key: 'staff', href: '#/staff', icon: I.idcard, label: 'Staff' });
    if (chatEnabled()) items.push({ key: 'chats', href: '#/chats', icon: I.msg, label: 'Chats' });
    items.push({ key: 'ask', href: '#/ask', icon: I.spark, label: 'Ask Jan' });
    items.push({ key: 'me', href: '#/me', icon: I.user, label: 'Me' }); // to do, receipts, leave, clock, account

    return items;
  }

  function tabbar(active, date) {
    var items = navItems(date);
    items = items.filter(function (t) { return t.key !== 'staff'; }); // phones: the staff directory is under Me
    if (items.length > 5) items = items.filter(function (t) { return t.key !== 'route'; }); // office phones: route is on each day instead
    if (items.length > 5) items = items.filter(function (t) { return t.key !== 'team'; }); // office phones: Team board is under Me
    if (items.length > 5) items = items.filter(function (t) { return t.key !== 'planner'; }); // and the Planner
    return '<nav class="tabbar" aria-label="Main"><div class="inner" style="grid-template-columns:repeat(' + items.length + ',minmax(0,1fr))">' +
      items.map(function (t) {
        return '<a href="' + t.href + '"' + (active === t.key ? ' aria-current="page"' : '') + '><span class="pill">' + t.icon + '</span>' + t.label + '</a>';
      }).join('') + '</div></nav>';
  }

  /* ---------- chrome: tablet and desktop ---------- */

  function shell(active, date, content) {
    var u = state.user || {};
    var items = navItems(date);
    return '<div class="shell">' +
      '<aside class="rail" aria-label="Main">' +
        '<a class="rail-brand" href="#/day" aria-label="Blindmaster, home"><img src="wordmark-white.svg" alt="Blindmaster"><span class="rail-mark" aria-hidden="true"></span></a>' +
        '<nav class="rail-nav">' + items.map(function (t) {
          return '<a href="' + t.href + '"' + (active === t.key ? ' aria-current="page"' : '') + '>' + t.icon + '<span>' + t.label + '</span></a>';
        }).join('') + '</nav>' +
        '<a class="rail-user" href="#/account"><span class="avatar">' + esc(initials(u.name)) + '</span><span class="rail-user-text"><b>' + esc(u.name || '') + '</b><span>' + esc(roleLabel(u.role)) + '</span></span></a>' +
        (CFG.ENVIRONMENT ? '<span class="rail-env">' + esc(CFG.ENVIRONMENT) + ' · v' + APP_VERSION + '</span>' : '') +
      '</aside>' +
      '<div class="content">' + vasBar() + content + '</div>' +
    '</div>';
  }

  function roleLabel(r) { return /office|admin/i.test(r || '') ? 'Office' : r === 'sales' ? 'Sales and projects' : r === 'pm' ? 'Project manager' : r === 'warehouse' ? 'Warehouse' : 'Installer'; }

  function loading(msg) {
    var body = '<p class="loading">' + esc(msg || 'Loading your day…') + '</p>';
    app.innerHTML = wide() && state.user ? shell(null, null, body) : topbar() + '<main>' + body + '</main>';
  }

  function showError(err, retry) {
    if (err && err.auth) { unstore('fa-session'); return renderSignIn(err.message); }
    var body = '<div class="empty stack"><h2>Couldn\'t load your schedule</h2><p class="muted" style="margin:0">' + esc(err && err.message || 'Check your connection and try again.') + '</p><button class="btn btn-dark" id="retry" style="margin-top:12px">Try again</button></div>';
    app.innerHTML = wide() && state.user ? shell(null, null, body) : topbar() + '<main>' + body + '</main>';
    document.getElementById('retry').onclick = retry;
  }

  /* ---------- sign in ---------- */

  function renderSetupNeeded() {
    app.innerHTML = '<div class="signin"><div class="signin-card"><div class="plate"><img src="wordmark-white.svg" alt="Blindmaster"></div><div class="band"></div>' +
      '<div class="body"><h1>Almost ready</h1><p class="muted">Add the sandbox Apps Script URL to <b>config.js</b> (API_URL), then reload. The README has the steps.</p></div></div></div>';
  }

  function renderSignIn(errorMsg) {
    var useGoogle = !!CFG.GOOGLE_CLIENT_ID;
    app.innerHTML =
      '<div class="signin"><div class="signin-card">' +
        '<div class="si-hero"><img class="hero-img" src="signin-hero.jpg" alt="Light falling through outdoor shading">' +
          '<div class="hero-bar"><img src="wordmark-white.svg" alt="Blindmaster"><span>' + esc(CFG.ENVIRONMENT || 'Field app') + '</span></div>' +
        '</div>' +
        '<div class="body">' +
          '<div class="stack" style="gap:6px"><h1>Sign in to start your day</h1><p class="muted" style="margin:0">Your schedule, job details and reports for today, in one place.</p></div>' +
          (errorMsg ? '<p class="notice error" role="alert">' + esc(errorMsg) + '</p>' : '') +
          (useGoogle
            ? '<div id="gbtn" style="min-height:48px"></div><p class="small muted" style="margin:0">Use your Blindmaster Google account. Contractors: use the Google account you gave the office.</p>'
            : '<form id="devform" class="stack" style="gap:16px">' +
                '<p class="notice" style="margin:0">Test sign-in: enter your Blindmaster email. Google sign-in is switched on once the OAuth client is set up.</p>' +
                '<div class="field"><label for="email">Work email</label><input id="email" type="email" autocomplete="email" required placeholder="name@blindmaster.com.au"></div>' +
                '<button class="btn btn-dark btn-lg" type="submit">Sign in</button>' +
              '</form>') +
          '<p class="small muted" style="margin:auto 0 0">Trouble signing in? Call the office on ' + esc(CFG.OFFICE_PHONE || '') + '.</p>' +
        '</div>' +
      '</div></div>';

    if (useGoogle) {
      var tries = 0;
      (function initGsi() {
        if (!(window.google && google.accounts && google.accounts.id)) { if (tries++ < 50) setTimeout(initGsi, 100); return; }
        google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onGoogleCredential, auto_select: true }); // no domain lock: contractors on the staff list sign in with their own Google account
        var box = document.getElementById('gbtn');
        google.accounts.id.renderButton(box, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'continue_with', width: Math.min(box.clientWidth || 320, 400) });
        google.accounts.id.prompt();
      })();
    } else {
      document.getElementById('devform').onsubmit = function (e) {
        e.preventDefault();
        var email = document.getElementById('email').value.trim().toLowerCase();
        store('fa-session', { devEmail: email, email: email });
        state.cache = {};
        render();
      };
    }
  }

  /* ---------- shared building blocks ---------- */

  function nextIndex(appts, date) {
    if (date !== todayStr()) return -1;
    var now = Date.now();
    for (var i = 0; i < appts.length; i++) if (new Date(appts[i].end).getTime() > now) return i;
    return -1;
  }

  function crewPosition(a) {
    for (var i = 0; i < a.crew.length; i++) if (a.crew[i].me) return i + 1;
    return a.crew.length + 1;
  }

  function refLabel(a) { return a.jr ? 'JR#' + a.jr : a.opp ? 'OPP-' + a.opp : ''; }

  /** Mon–Fri tabs for the week of `date`, with arrows to the previous / next week. Counts fill in after loading. */
  function weekMonday(date) { var dow = new Date(date + 'T12:00:00').getDay(); return addDays(date, dow === 0 ? -6 : 1 - dow); }
  function weekTabs(date) {
    var mon = weekMonday(date), t = todayStr();
    var cells = [0, 1, 2, 3, 4].map(function (i) {
      var d = addDays(mon, i), on = d === date, dt = new Date(d + 'T12:00:00');
      return '<a class="wk-day' + (d === t ? ' is-today' : '') + '" href="' + dayHref(d) + '"' + (on ? ' aria-current="date"' : '') + ' data-wk="' + d + '">' +
        '<span class="wk-dow">' + dt.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase() + '</span><span class="wk-num">' + dt.getDate() + '</span>' +
        '<span class="wk-count">' + weekCount(d) + '</span></a>';
    }).join('');
    return '<nav class="wk" aria-label="This week">' +
      '<a class="wk-arrow" href="' + dayHref(addDays(mon, -7)) + '" aria-label="Previous week">' + I.left + '</a>' + cells +
      '<a class="wk-arrow" href="' + dayHref(addDays(mon, 7)) + '" aria-label="Next week">' + I.right + '</a></nav>' +
      (date === t || weekMonday(t) === mon ? '' : '<div class="section" style="padding-top:8px"><a class="today-btn" href="#/day">Back to today</a></div>');
  }
  function weekCount(d) {
    var c = state.cache[d];
    if (!c) return '&nbsp;';
    var n = c.appointments.length;
    return n ? n + (isOffice() || !c.appointments.every(function (a) { return a.isInstall; }) ? (n === 1 ? ' appt' : ' appts') : (n === 1 ? ' job' : ' jobs')) : '–';
  }
  /** Loads the rest of the week (cached) so each tab shows how many appointments it has. */
  function fillWeekCounts(date) {
    var mon = weekMonday(date);
    [0, 1, 2, 3, 4].forEach(function (i) {
      var d = addDays(mon, i);
      loadDay(d).then(function () {
        var el = document.querySelector('.wk-day[data-wk="' + d + '"] .wk-count');
        if (el) el.innerHTML = weekCount(d);
      }, function () {});
    });
  }

  function dayNav(date) {
    var isToday = date === todayStr();
    return '<div class="daybar">' +
      '<a class="btn btn-sand" style="min-height:44px;padding:0" href="' + dayHref(addDays(date, -1)) + '" aria-label="Previous day">' + I.left + '</a>' +
      (isToday ? '<span></span>' : '<a class="today-btn" href="#/day">Back to today</a>') +
      '<a class="btn btn-sand" style="min-height:44px;padding:0" href="' + dayHref(addDays(date, 1)) + '" aria-label="Next day">' + I.right + '</a>' +
    '</div>';
  }

  function dayHeading(date, appts) {
    var user = state.user || {};
    var isToday = date === todayStr();
    var jobs = appts.filter(function (a) { return a.isInstall && !/warehouse/i.test(a.type); }).length;
    var title = isOffice() ? (isToday ? 'Today' : shortDate(date)) : (isToday ? greeting() + ', ' + firstName(user.name) : shortDate(date));
    return '<section class="section stack" style="padding-top:16px;padding-bottom:20px">' +
      '<span class="eyebrow">' + esc(longDate(date)) + (isOffice() ? ' · all crews' : '') + '</span>' +
      '<h1>' + esc(title) + '</h1>' +
      '<p style="margin:4px 0 0;font-weight:500">' + (appts.length ? appts.length + ' appointment' + (appts.length === 1 ? '' : 's') + (jobs ? ' · ' + jobs + ' job' + (jobs === 1 ? '' : 's') : '') : 'Nothing scheduled') + '</p>' +
      awayLine(date) +
      '<div class="wx-day" data-date="' + date + '"></div>' +
    '</section>';
  }
  /** Approved leave on this day: your own, or (office) everyone away. */
  function awayLine(date) {
    var away = ((state.cache[date] || {}).away || []).filter(function (a) { return a.first <= date && a.last >= date; });
    var me = (state.user || {}).email;
    var mine = away.filter(function (a) { return a.email === me; })[0];
    if (mine) return '<p class="notice" style="margin:8px 0 0">You\'re on leave' + (mine.part ? ' from ' + esc(mine.from) + (mine.to ? ' to ' + esc(mine.to) : '') : ' today') + ' (' + esc(mine.type.toLowerCase()) + ').</p>';
    if (isOffice() && away.length) return '<p class="small" style="margin:6px 0 0"><b>Away:</b> ' + esc(away.map(function (a) { return firstName(a.name) + (a.part ? ' (from ' + a.from + ')' : ''); }).join(', ')) + '</p>';
    return '';
  }

  function nextPanel(next, date) {
    if (!next || isOffice()) return '';
    return '<section class="panel-accent" aria-label="Next appointment">' +
      '<span class="small" style="font-weight:700">Next up · ' + esc(next.startLabel) + ' · ' + esc(next.type) + '</span>' +
      '<div class="stack" style="gap:4px"><h2 style="font-size:22px;line-height:1.2">' + esc(next.title) + '</h2>' +
        '<span style="font-weight:500">' + esc(suburb(next.address)) + (refLabel(next) ? ' · ' + esc(refLabel(next)) : '') + '</span></div>' +
      '<div class="grid-2">' +
        (next.address ? '<a class="btn btn-dark" href="' + mapsDir(next.address) + '" target="_blank" rel="noopener">' + I.nav + 'Directions</a>' : '<span></span>') +
        (next.isSales ? '<a class="btn btn-light" href="' + visitHref(next.id, date) + '">Open visit</a>' : '<a class="btn btn-light" href="' + apptHref(next, date) + '">View details</a>') +
      '</div></section>';
  }

  function scheduleList(appts, date, ni, selectedId) {
    var user = state.user || {};
    var isToday = date === todayStr();
    return '<ol class="schedule">' + appts.map(function (a, i) {
      var cls = a.id === selectedId ? ' is-selected' : i === ni && !selectedId ? ' is-next' : (isToday && new Date(a.end).getTime() < Date.now() ? ' is-past' : '');
      var tag = a.isSales ? 'tag-light' : 'tag-blue';
      var meRole = (user.role === 'sales' && a.isInstall) ? ' · ' + ordinal(crewPosition(a)) + ' installer' : '';
      var who = isOffice() && a.crew.length ? '<span class="sub">' + esc(a.crew.map(function (c) { return firstName(c.name); }).join(', ')) + '</span>' : '';
      return '<li><span class="time">' + esc(a.allDay ? 'All day' : a.startLabel) + '</span>' +
        '<a class="appt-card' + cls + '" href="' + apptHref(a, date) + '"' + (a.id === selectedId ? ' aria-current="true"' : '') + '>' + lightHtml(a) +
          '<span><span class="tag ' + (i === ni && !selectedId ? 'tag-blue' : tag) + '">' + esc(a.type) + esc(meRole) + '</span>' + (i === ni && isToday ? ' <span class="tag tag-light">Next</span>' : '') + '</span>' +
          '<span class="name">' + esc(a.title) + '</span>' +
          '<span class="sub">' + esc(suburb(a.address)) + (refLabel(a) ? ' · ' + esc(refLabel(a)) : '') + '</span>' + who + reportLine(a) +
        '</a></li>';
    }).join('') + '</ol>';
  }

  function dirUrl(date) {
    var u = CFG.DIR_FORM_URL || '';
    var email = (state.user && state.user.email) || '';
    var name = (state.user && state.user.name) || '';
    return u.indexOf('{') >= 0 ? u.replace('{email}', encodeURIComponent(email)).replace('{date}', date).replace('{name}', encodeURIComponent(name)) : u;
  }

  function dayFooter(day, date, appts) {
    var html = '';
    if (!isOffice()) html += '<a class="panel spread" style="margin-top:20px;text-decoration:none;color:inherit" href="#/receipts">' +
      '<span class="stack" style="gap:4px"><b>Receipts</b><span class="small muted">Photograph receipts as you go</span></span><span class="tag tag-light">+ Add</span></a>';
    if (!isOffice() && (state.user || {}).role !== 'sales' && appts.some(function (a) { return a.isInstall; }) && CFG.DIR_FORM_URL) {
      html += '<a class="panel spread" style="margin-top:20px;text-decoration:none;color:inherit" href="' + esc(dirUrl(date)) + '" target="_blank" rel="noopener">' +
        '<span class="stack" style="gap:4px"><b>End of day</b><span class="small muted">Open your Daily Installation Report</span></span>' + I.ext + '</a>';
    }
    html += '<p class="small muted" style="padding:16px 24px 24px;margin:0">Updated ' + new Date(day.fetchedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) +
      ' · <button class="refresh" data-date="' + date + '" style="background:none;border:0;padding:0;font-weight:700;text-decoration:underline;min-height:44px">Refresh</button></p>';
    return html;
  }

  function bindRefresh() {
    Array.prototype.forEach.call(document.querySelectorAll('.refresh'), function (b) {
      b.onclick = function () { var d = b.getAttribute('data-date'); delete state.cache[d]; loadDay(d, true).then(render, function (e) { showError(e, render); }); };
    });
  }

  function linkRow(href, icon, title, sub) {
    return '<a class="linkrow" href="' + esc(href) + '" target="_blank" rel="noopener">' + icon +
      '<span class="text"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></span>' + I.ext + '</a>';
  }

  function hasReport(a) { return (a.isInstall || !!a.jobReportUrl) && !/warehouse/i.test(a.type); }

  /** The appointment details, used full-screen on phones and in the right-hand pane on tablet/desktop. */
  function apptDetail(a, date, isWide) {
    var html = '<section class="hero">' +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' + lightHtml(a) + '<span class="tag tag-dark">' + esc(a.type) + '</span>' + (a.status === 'Tentative' ? '<span class="tag tag-light">Tentative, not confirmed</span>' : '') + '<span style="font-weight:700;font-size:14px">' + esc(a.allDay ? 'All day' : a.startLabel + ' – ' + a.endLabel) + '</span>' +
        (isWide && refLabel(a) ? '<span class="small" style="font-weight:500;margin-left:auto">' + esc(refLabel(a)) + '</span>' : '') + '</div>' +
      '<h1>' + esc(a.title) + '</h1>' +
      (a.address ? '<p style="margin:0;font-weight:500">' + esc(a.address) + '</p>' : '') +
    '</section>';

    var sms = a.phone ? 'sms:' + String(a.phone).replace(/[^\d+]/g, '') + (/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent('Hi, this is ' + firstName(state.user && state.user.name) + ' from Blindmaster. I\'m on my way and should be with you soon.') : '';
    var actions = [
      a.address ? '<a class="btn btn-dark action" href="' + mapsDir(a.address) + '" target="_blank" rel="noopener">' + I.nav + 'Navigate</a>' : '<span class="btn btn-sand action" aria-disabled="true" style="opacity:.55">' + I.nav + 'No address</span>',
      a.phone ? '<a class="btn btn-sand action" href="' + tel(a.phone) + '">' + I.phone + 'Call</a>' : '<span class="btn btn-sand action" aria-disabled="true" style="opacity:.55">' + I.phone + 'Call</span>',
      sms ? '<a class="btn btn-sand action" href="' + sms + '">' + I.msg + 'On my way</a>' : '<span class="btn btn-sand action" aria-disabled="true" style="opacity:.55">' + I.msg + 'On my way</span>'
    ];
    if (isWide && hasReport(a)) {
      actions.push(jrHref(a, date) ? '<a class="btn btn-dark action" href="' + esc(jrHref(a, date)) + '">' + I.report + (a.report ? 'View report' : 'Job report') + '</a>'
        : '<span class="btn btn-sand action" aria-disabled="true" style="opacity:.55">' + I.report + 'No JR number</span>');
    }
    html += '<div class="actions" style="grid-template-columns:repeat(' + actions.length + ',minmax(0,1fr))">' + actions.join('') + '</div>';
    if (a.report) html += '<div class="rep-banner ' + (a.report.complete ? 'is-ok' : 'is-warn') + '">' + (a.report.complete ? I.check : '') +
      '<span><b>' + esc(a.report.complete ? 'Job report submitted' : 'Job not finished') + '</b>' + esc(a.report.complete ? '' : ' · ' + (a.report.outstanding || 'return visit needed')) + '</span></div>';
    else if (hasReport(a) && new Date(a.end).getTime() < Date.now()) html += '<div class="rep-banner is-todo"><span><b>Job report not done yet</b></span></div>';
    if (a.isSales) html += '<div class="section" style="padding-top:12px"><a class="btn btn-dark btn-lg" href="' + visitHref(a.id, date) + '">' + I.window.replace(/width="40" height="40"/, 'width="22" height="22"') + 'Open site consult · measure and capture</a></div>';
    html += '<div class="section" style="padding-top:10px"><button type="button" class="link-btn" data-addtodo data-jr="' + esc(a.jr || '') + '" data-opp="' + esc(a.opp || '') + '" data-title="' + esc(a.customer || a.title) + '" data-date="' + date + '">+ Add a to-do for this job</button>' +
      (a.readOnly ? ' <span class="small muted">· From the ' + esc(a.source) + ' calendar</span>' : '') + '</div>';
    html += '<div class="wx-appt" data-id="' + esc(a.id) + '" data-date="' + date + '"></div>';

    var info = '';
    var details = [];
    if (a.customer || a.phone) details.push(['Contact', [a.customer, a.phone].filter(String).join(' · ')]);
    if (a.access) details.push(['Access', a.access]);
    if (details.length) info += '<section class="section stack" style="gap:12px"><h2>Customer and site</h2><dl class="dl">' + details.map(function (d) { return '<dt>' + esc(d[0]) + '</dt><dd>' + esc(d[1]) + '</dd>'; }).join('') + '</dl></section>';
    if (a.requirements.length) info += '<section class="section stack" style="gap:12px"><h2>' + (a.isSales ? 'Visit checklist' : 'Job requirements') + '</h2><ul class="checklist">' + a.requirements.map(function (r) { return '<li>' + I.check + '<span>' + esc(r) + '</span></li>'; }).join('') + '</ul></section>';
    if (a.crew.length) info += '<section class="section stack" style="gap:8px"><span class="small muted" style="font-weight:700">Crew</span><div class="chips">' + a.crew.map(function (c, i) { return '<span class="tag" style="padding:6px 12px;font-size:13px">' + esc(c.name) + (c.me ? ' (you)' : '') + (a.isInstall && a.crew.length > 2 && i >= 2 ? ' · ' + ordinal(i + 1) : '') + '</span>'; }).join('') + '</div></section>';
    info += chatLink(a);
    var folders = '';
    if (a.projectFolderUrl || a.folderUrl) folders += '<a class="linkrow" href="#/collateral/' + encodeURIComponent(a.id) + '/' + date + '">' + I.grid +
      '<span class="text"><b>Collateral</b><span>Photos, sketches, quotes and documents for this job</span></span>' + I.right + '</a>';
    if (a.projectFolderUrl) folders += linkRow(a.projectFolderUrl, I.folder, 'Project folder', a.jr ? 'Project ' + a.jr : 'Google Drive');
    if (a.folderUrl) folders += linkRow(a.folderUrl, I.folder, 'Opportunity folder', a.opp ? 'OPP-' + a.opp + ' · Collateral and project' : 'Google Drive');
    if (folders) info += '<section class="section stack" style="gap:8px"><h2 style="margin-bottom:4px">Files</h2>' + folders + '</section>';
    if (a.notes) info += '<section class="panel stack" style="margin-top:28px;gap:6px"><b class="small">Notes</b><p style="margin:0;white-space:pre-line;font-size:14px">' + esc(a.notes) + '</p></section>';

    var map = a.address ? '<section class="mapbox">' +
      '<iframe class="map-frame" loading="lazy" title="Map of ' + esc(a.address) + '" src="https://maps.google.com/maps?q=' + encodeURIComponent(a.address) + '&z=14&output=embed"></iframe>' +
      '<a class="spread" style="min-height:48px;padding:0 16px;text-decoration:none;font-weight:700;font-size:14px" href="' + mapsSearch(a.address) + '" target="_blank" rel="noopener">Open in Google Maps' + I.ext + '</a></section>' : '';

    // desktop: information and map side by side; phone/tablet: map first, then information
    if (isWide && state.mode === 'desktop') html += '<div class="detail-cols"><div class="detail-info">' + info + '</div><div class="detail-map">' + map + '</div></div>';
    else html += map + info;
    return html + '<div style="height:32px"></div>';
  }

  /* ---------- weather (Open-Meteo, no account needed) ---------- */

  var WX_LIMIT = Number(CFG.WIND_WARN_KMH || 40);
  var wxCache = {};
  function wxFetch(url) {
    if (!wxCache[url]) wxCache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error('weather'); return r.json(); }).catch(function (e) { delete wxCache[url]; throw e; });
    return wxCache[url];
  }
  function wxInfo(code) {
    code = Number(code);
    if (code === 0) return { label: 'Sunny', icon: 'sun' };
    if (code <= 2) return { label: 'Partly cloudy', icon: 'part' };
    if (code === 3) return { label: 'Cloudy', icon: 'cloud' };
    if (code === 45 || code === 48) return { label: 'Fog', icon: 'cloud' };
    if (code >= 95) return { label: 'Thunderstorms', icon: 'storm', storm: true };
    if (code >= 51) return { label: code >= 80 ? 'Showers' : 'Rain', icon: 'rain' };
    return { label: 'Cloudy', icon: 'cloud' };
  }
  var WXI = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    part: '<path d="M8 3v1.5M3.5 8H2M4.6 4.6l1 1M12.4 4.6l-1 1"/><circle cx="8" cy="8.5" r="3"/><path d="M9 20h8.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.5A3 3 0 0 0 9 20z"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.3 3.3 0 0 0 7 18z"/>',
    rain: '<path d="M7 15h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.3 3.3 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    storm: '<path d="M7 14h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.6A3.3 3.3 0 0 0 7 14z"/><path d="M12 14l-2 4h4l-2 4"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>'
  };
  function wxIcon(name, label, size) {
    return '<svg width="' + (size || 26) + '" height="' + (size || 26) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ' +
      (label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"') + ' style="flex-shrink:0">' + WXI[name] + '</svg>';
  }
  function wxWarning(title, text, icon) {
    return '<div class="wx-warn" role="alert">' + wxIcon(icon || 'wind', null, 22) + '<span class="stack" style="gap:4px"><b>' + esc(title) + '</b><span class="small">' + esc(text) + '</span></span></div>';
  }
  function daysAhead(date) { return Math.round((new Date(date + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400000); }

  function fillWeather() {
    Array.prototype.forEach.call(document.querySelectorAll('.wx-day'), function (el) {
      var date = el.getAttribute('data-date');
      var ahead = daysAhead(date);
      if (ahead < 0 || ahead > 13) return;
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + (CFG.WEATHER_LAT || -33.75) + '&longitude=' + (CFG.WEATHER_LON || 151.28) +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max&timezone=Australia%2FSydney&start_date=' + date + '&end_date=' + date;
      wxFetch(url).then(function (d) {
        var dd = d.daily; if (!dd || !dd.time || !dd.time.length) return;
        var info = wxInfo(dd.weather_code[0]);
        var gust = Math.round(dd.wind_gusts_10m_max[0]);
        var html = '<div class="wx-line">' + wxIcon(info.icon, info.label) +
          '<span class="wx-temp">' + Math.round(dd.temperature_2m_max[0]) + '°</span>' +
          '<span class="small muted">/ ' + Math.round(dd.temperature_2m_min[0]) + '° · ' + esc(info.label) + ' · ' + (dd.precipitation_probability_max[0] || 0) + '% rain · gusts ' + gust + ' km/h</span></div>';
        if (info.storm) html += wxWarning('Storm warning', 'Thunderstorms forecast. Check conditions before working at height or outdoors.', 'storm');
        else if (gust >= WX_LIMIT) html += wxWarning('Wind warning', 'Gusts up to ' + gust + ' km/h. Check before extending awnings or fitting outdoor blinds.');
        el.innerHTML = html;
      }).catch(function () {});
    });

    Array.prototype.forEach.call(document.querySelectorAll('.wx-appt'), function (el) {
      var date = el.getAttribute('data-date');
      var day = state.cache[date]; if (!day) return;
      var a = day.appointments.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      var ahead = daysAhead(date);
      if (!a || !a.address || ahead < 0 || ahead > 13) return;
      var place = suburb(a.address);
      wxFetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&countryCode=AU&name=' + encodeURIComponent(place)).then(function (g) {
        var loc = (g.results || [])[0];
        var lat = loc ? loc.latitude : (CFG.WEATHER_LAT || -33.75), lon = loc ? loc.longitude : (CFG.WEATHER_LON || 151.28);
        return wxFetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
          '&hourly=temperature_2m,weather_code,precipitation_probability,wind_gusts_10m&timezone=Australia%2FSydney&start_date=' + date + '&end_date=' + date);
      }).then(function (d) {
        var h = d.hourly; if (!h) return;
        var startH = Number((a.startLabel || '08:00').slice(0, 2)), endH = Math.max(startH, Number((a.endLabel || '').slice(0, 2)) || startH + 2);
        var idx = []; for (var i = 0; i < h.time.length; i++) { var hr = Number(h.time[i].slice(11, 13)); if (hr >= startH && hr <= endH) idx.push(i); }
        if (!idx.length) return;
        var maxGust = 0, maxRain = 0, storm = false, gustAt = '';
        idx.forEach(function (i) {
          if (h.wind_gusts_10m[i] > maxGust) { maxGust = h.wind_gusts_10m[i]; gustAt = h.time[i].slice(11, 16); }
          maxRain = Math.max(maxRain, h.precipitation_probability[i] || 0);
          if (Number(h.weather_code[i]) >= 95) storm = true;
        });
        var info = wxInfo(h.weather_code[idx[0]]);
        var html = '<div class="wx-card">' + wxIcon(info.icon, info.label) + '<span class="stack" style="gap:0"><b>' + Math.round(h.temperature_2m[idx[0]]) + '° · ' + esc(info.label) + '</b>' +
          '<span class="small muted">' + esc(place) + ', ' + esc(a.startLabel) + (a.endLabel ? '–' + esc(a.endLabel) : '') + ' · ' + maxRain + '% rain · gusts ' + Math.round(maxGust) + ' km/h</span></span></div>';
        if (storm) html += wxWarning('Storm forecast during this job', 'If it isn\'t safe to finish, choose Weather as the reason in the job report.', 'storm');
        else if (maxGust >= WX_LIMIT) html += wxWarning('Gusts ' + Math.round(maxGust) + ' km/h around ' + gustAt, 'Above the ' + WX_LIMIT + ' km/h limit for awnings and outdoor blinds. If it isn\'t safe to finish, choose Weather as the reason in the job report.');
        el.innerHTML = html;
      }).catch(function () {});
    });
  }

  /* ---------- phone screens ---------- */

  function renderDay(date) {
    loading();
    loadDay(date).then(function (day) {
      var appts = day.appointments;
      var ni = nextIndex(appts, date);
      var html = topbar() + (day.offline ? '<div class="offline-bar">Offline: showing your last saved schedule</div>' : '') + '<main>' +
        dayHeading(date, appts) + weekTabs(date) + nextPanel(ni >= 0 ? appts[ni] : null, date);
      if (appts.length) {
        html += '<div class="section spread" style="padding-top:28px;padding-bottom:12px"><h2>Schedule</h2>' +
          '<a href="#/route' + (date === todayStr() ? '' : '/' + date) + '" style="font-weight:700;font-size:14px;min-height:44px;display:flex;align-items:center">Route map</a></div>' +
          scheduleList(appts, date, ni, null);
      } else {
        html += '<div class="empty stack"><h2>No appointments</h2><p class="muted" style="margin:0">Nothing is booked for you on this day.</p></div>';
      }
      html += dayFooter(day, date, appts) + '</main>' + tabbar('day', date);
      app.innerHTML = html;
      bindRefresh();
      fillWeather();
      fillChatLinks();
      fillWeekCounts(date);
    }, function (err) { showError(err, function () { renderDay(date); }); });
  }

  function renderAppointment(date, id) {
    loading('Loading appointment…');
    loadDay(date).then(function (day) {
      var a = day.appointments.filter(function (x) { return x.id === id; })[0];
      var back = dayHref(date);
      if (!a) { app.innerHTML = topbar({ back: back, backLabel: 'Schedule' }) + '<main><div class="empty"><h2>Appointment not found</h2><p class="muted">It may have been moved or cancelled.</p></div></main>'; return; }
      var html = topbar({ back: back, backLabel: date === todayStr() ? 'Today' : shortDate(date), right: refLabel(a) }) +
        (day.offline ? '<div class="offline-bar">Offline: details may be out of date</div>' : '') + '<main>' + apptDetail(a, date, false) + '</main>';
      if (hasReport(a)) {
        html += '<div class="sticky-cta"><div class="inner">' +
          (jrHref(a, date) ? '<a class="btn btn-dark btn-lg" href="' + esc(jrHref(a, date)) + '">' + I.report + (a.report ? 'View or update job report' : 'Open job report') + '</a>'
            : '<button class="btn btn-dark btn-lg" disabled>Job report link not set</button><span class="small muted" style="text-align:center">Add a JR number to the appointment</span>') +
        '</div></div>';
      } else {
        html += tabbar('day', date);
      }
      app.innerHTML = html;
      window.scrollTo(0, 0);
      fillWeather();
      fillChatLinks();
    }, function (err) { showError(err, function () { renderAppointment(date, id); }); });
  }

  /* ---------- tablet / desktop: schedule + detail side by side ---------- */

  function renderDayWide(date, selectedId) {
    loading();
    loadDay(date).then(function (day) {
      var appts = day.appointments;
      var ni = nextIndex(appts, date);
      var sel = selectedId ? appts.filter(function (a) { return a.id === selectedId; })[0] : (appts[ni >= 0 ? ni : 0] || null);
      var list = (day.offline ? '<div class="offline-bar">Offline: showing your last saved schedule</div>' : '') +
        dayHeading(date, appts) + weekTabs(date) +
        (appts.length ? scheduleList(appts, date, ni, sel && sel.id) : '<div class="empty stack"><h2>No appointments</h2><p class="muted" style="margin:0">Nothing is booked on this day.</p></div>') +
        dayFooter(day, date, appts);
      var detail = sel ? apptDetail(sel, date, true)
        : '<div class="empty-detail"><p class="muted">' + (selectedId ? 'This appointment may have been moved or cancelled.' : 'Select an appointment to see the details.') + '</p></div>';
      app.innerHTML = shell('day', date, '<div class="split"><section class="pane-list" aria-label="Schedule">' + list + '</section><section class="pane-detail" aria-label="Appointment details">' + detail + '</section></div>');
      var pane = app.querySelector('.pane-detail'); if (pane) pane.scrollTop = 0;
      bindRefresh();
      fillWeather();
      fillChatLinks();
      fillWeekCounts(date);
    }, function (err) { showError(err, function () { renderDayWide(date, selectedId); }); });
  }

  /* ---------- route (all layouts) ---------- */

  /* ---------- Google Maps: live route map and address suggestions ---------- */

  var gmapsPromise = null;
  function mapsKey() { return (CFG.GOOGLE_MAPS_KEY || '').trim(); }
  /** Loads the Maps JavaScript API once (needs GOOGLE_MAPS_KEY in config.js). */
  function loadMaps() {
    if (!mapsKey()) return Promise.reject(new Error('No Google Maps key'));
    if (window.google && google.maps && google.maps.places) return Promise.resolve(google.maps);
    if (gmapsPromise) return gmapsPromise;
    // Google only explains a key problem in the browser console, so listen for it and show it in the app
    if (!window.__bmMapsErrHook) {
      window.__bmMapsErrHook = true;
      ['error', 'warn'].forEach(function (k) {
        var orig = console[k];
        console[k] = function () {
          try { var m = String([].slice.call(arguments).join(' ')).match(/([A-Za-z]+MapError)/); if (m) showMapsProblem(m[1]); } catch (e) {}
          return orig.apply(console, arguments);
        };
      });
    }
    gmapsPromise = new Promise(function (resolve, reject) {
      window.__bmMapsReady = function () { resolve(google.maps); };
      window.gm_authFailure = function () { reject(new Error('Google Maps key was refused. Check the key and its website restriction.')); };
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(mapsKey()) + '&v=weekly&libraries=places,geometry&loading=async&region=AU&callback=__bmMapsReady';
      s.async = true; s.onerror = function () { gmapsPromise = null; reject(new Error('Google Maps could not load. Check your connection.')); };
      document.head.appendChild(s);
    });
    return gmapsPromise;
  }

  var MAPS_FIX = {
    BillingNotEnabledMapError: 'Billing isn\'t switched on for the Google Cloud project. In console.cloud.google.com open Billing and link a billing account to this project.',
    ApiNotActivatedMapError: 'The Maps JavaScript API isn\'t enabled. In APIs & Services > Library, enable Maps JavaScript API (and Places API (New) and Geocoding API).',
    RefererNotAllowedMapError: 'The key\'s website restriction doesn\'t match. Set it to https://blindmaster-pty-ltd.github.io/* and save.',
    InvalidKeyMapError: 'Google doesn\'t recognise the key. Check it was copied in full into config.js.',
    ApiTargetBlockedMapError: 'The key\'s API restrictions block Maps JavaScript API. Tick it (and Places API (New), Geocoding API) under API restrictions.',
    ExpiredKeyMapError: 'The key has expired or was deleted. Create a new key.',
    MissingKeyMapError: 'No key was sent. Check GOOGLE_MAPS_KEY in config.js.'
  };
  function showMapsProblem(code) {
    var note = document.getElementById('rtNote');
    var msg = 'Google Maps problem (' + code + '): ' + (MAPS_FIX[code] || 'see Google\'s Maps JavaScript API error list.');
    window.__bmMapsProblem = msg;
    if (note) { note.textContent = msg; note.classList.add('is-problem'); }
  }

  /** Address → {lat,lng}, remembered on the phone so each address is looked up once. */
  function geocode(address) {
    var key = 'fa-geo-' + address.toLowerCase().replace(/\s+/g, ' ').trim();
    var hit = store(key);
    if (hit) return Promise.resolve(hit);
    return loadMaps().then(function (maps) {
      return new Promise(function (resolve) {
        new maps.Geocoder().geocode({ address: address, region: 'au' }, function (res, status) {
          if (status === 'OK' && res[0]) { var l = res[0].geometry.location, p = { lat: l.lat(), lng: l.lng() }; store(key, p); resolve(p); }
          else resolve(null);
        });
      });
    });
  }

  /** A square numbered marker drawn in our own style (no Map ID needed). */
  function numberMarker(maps, map, pos, label, cls, onClick) {
    function M() { this.setMap(map); }
    M.prototype = new maps.OverlayView();
    M.prototype.onAdd = function () {
      var el = this.el = document.createElement('button');
      el.type = 'button'; el.className = 'rt-pin ' + cls; el.textContent = label; el.setAttribute('aria-label', 'Stop ' + label);
      el.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
      this.getPanes().overlayMouseTarget.appendChild(el);
    };
    M.prototype.draw = function () {
      var p = this.getProjection().fromLatLngToDivPixel(new maps.LatLng(pos.lat, pos.lng));
      if (p && this.el) { this.el.style.left = p.x + 'px'; this.el.style.top = p.y + 'px'; }
    };
    M.prototype.onRemove = function () { if (this.el) this.el.remove(); };
    M.prototype.setClass = function (c) { if (this.el) this.el.className = 'rt-pin ' + c; };
    return new M();
  }

  var rt = { sel: -1, date: '', markers: [], watch: null };
  function renderRouteLive(date, day) {
    var stops = day.appointments.filter(function (a) { return a.address; });
    var now = Date.now(), isToday = date === todayStr();
    var done = function (a) { return isToday ? new Date(a.end).getTime() < now : date < todayStr(); };
    if (rt.date !== date || rt.sel >= stops.length) { var ni = nextIndex(stops, date); rt.sel = ni >= 0 ? ni : 0; rt.date = date; }
    var doneN = stops.filter(done).length;
    var last = stops[stops.length - 1];
    var card = '<div class="rt-card"><span class="stack" style="gap:2px"><img src="wordmark-white.svg" alt="" class="rt-logo"><b class="rt-date">' + esc(shortDate(date)) + '</b>' +
      '<span class="small">' + stops.length + (stops.length === 1 ? ' stop' : ' stops') + (isToday ? ' · ' + doneN + ' done' : '') + (last ? ' · last finishes ' + esc(last.endLabel) : '') + '</span></span>' +
      (isOffice() ? '<span class="tag">All crews</span>' : '') + '</div>';
    var body = '<div class="rt-mapwrap"><div id="rtMap" class="rt-map" aria-label="Map of today\'s stops"></div>' + card +
      '<p class="rt-note' + (window.__bmMapsProblem ? ' is-problem' : '') + '" id="rtNote">' + esc(window.__bmMapsProblem || 'Loading map…') + '</p></div>';
    if (!stops.length) body += '<div class="empty"><h2>No stops</h2><p class="muted" style="margin:0">No appointments with an address on this day.</p></div>';
    else body += '<section class="rt-sheet" id="rtSheet"></section>';
    if (wide()) app.innerHTML = shell('route', date, '<div class="rt-wide">' + body + '</div>');
    else app.innerHTML = topbar({ right: shortDate(date) }) + '<main class="rt-main">' + body + '</main>' + tabbar('route', date);
    if (!stops.length && !window.__bmMapsProblem) { var n0 = document.getElementById('rtNote'); if (n0) n0.textContent = 'No stops on this day'; }

    function sheet() {
      var el = document.getElementById('rtSheet'); if (!el) return;
      var a = stops[rt.sel], tent = a.status === 'Tentative', isDone = done(a);
      var detail = [refLabel(a), (a.requirements || [])[0] || ''].filter(String).join(' · ');
      var full = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(CFG.WAREHOUSE || stops[0].address) +
        '&destination=' + encodeURIComponent(last.address) + (stops.length > 1 ? '&waypoints=' + stops.slice(0, -1).map(function (s) { return encodeURIComponent(s.address); }).join('%7C') : '');
      el.innerHTML = '<div class="spread"><span class="rt-kicker">Stop ' + (rt.sel + 1) + ' of ' + stops.length + ' · ' + esc(a.type) + '</span><b>' + esc(a.allDay ? 'All day' : a.startLabel + '–' + a.endLabel) + '</b></div>' +
        '<h1 class="rt-name">' + esc(a.customer || a.title) + '</h1><span class="rt-addr">' + esc(a.address) + '</span>' +
        (detail ? '<span class="small muted">' + esc(detail) + '</span>' : '') +
        '<span class="rt-status"><span class="light ' + (tent ? 'is-red' : 'is-green') + '"></span>' + (tent ? 'Not confirmed (tentative)' : 'Confirmed booking') + '</span>' +
        '<div class="rt-actions"><a class="btn btn-lg ' + (isDone ? 'btn-sand' : 'btn-dark') + '" href="' + mapsDir(a.address) + '" target="_blank" rel="noopener">' + I.nav + (isDone ? 'Done ✓' : 'Navigate') + '</a>' +
        '<a class="btn btn-lg btn-outline" href="' + apptHref(a, date) + '">Open job</a></div>' +
        '<div class="rt-strip" role="group" aria-label="Stops" style="grid-template-columns:repeat(' + Math.min(stops.length, 6) + ',minmax(0,1fr))">' + stops.map(function (s, i) {
          return '<button type="button" data-stop="' + i + '" aria-pressed="' + (i === rt.sel) + '" class="' + (s.status === 'Tentative' ? 'is-tent' : 'is-conf') + (done(s) ? ' is-done' : '') + '">' +
            '<b>' + (i + 1) + '</b><span>' + esc(s.allDay ? 'All day' : s.startLabel) + '</span><span class="small">' + esc(suburb(s.address)) + '</span></button>';
        }).join('') + '</div>' +
        '<a class="rt-full" href="' + full + '" target="_blank" rel="noopener">Open the whole route in Google Maps' + I.ext + '</a>';
      Array.prototype.forEach.call(el.querySelectorAll('[data-stop]'), function (b) { b.onclick = function () { select(Number(b.getAttribute('data-stop')), true); }; });
    }
    function pinClass(i) { return (i === rt.sel ? 'is-sel' : done(stops[i]) ? 'is-done' : '') + (stops[i].status === 'Tentative' ? ' is-tent' : ''); }
    var map = null, pts = [];
    function select(i, pan) {
      rt.sel = i; sheet();
      rt.markers.forEach(function (m, k) { if (m) m.setClass(pinClass(k)); });
      if (pan && map && pts[i]) map.panTo(pts[i]);
    }
    if (stops.length) sheet();

    loadMaps().then(function (maps) {
      var el = document.getElementById('rtMap'); if (!el) return;
      map = new maps.Map(el, { center: { lat: -33.75, lng: 151.27 }, zoom: 11, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false,
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }] });
      return Promise.all(stops.map(function (s) { return geocode(s.address); })).then(function (list) {
        pts = list; rt.markers = [];
        var bounds = new maps.LatLngBounds(), any = false;
        list.forEach(function (p, i) {
          if (!p) { rt.markers.push(null); return; }
          any = true; bounds.extend(p);
          rt.markers.push(numberMarker(maps, map, p, String(i + 1), pinClass(i), function () { select(i, false); }));
        });
        var path = list.filter(Boolean);
        if (path.length > 1) new maps.Polyline({ map: map, path: path, strokeColor: '#404141', strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3 }, offset: '0', repeat: '14px' }] });
        if (any) { map.fitBounds(bounds, { top: 110, bottom: 30, left: 30, right: 30 }); if (path.length === 1) map.setZoom(14); }
        var missing = list.filter(function (p) { return !p; }).length;
        var note = document.getElementById('rtNote');
        if (note && !window.__bmMapsProblem) { note.textContent = missing ? missing + ' address' + (missing === 1 ? '' : 'es') + ' couldn\'t be found on the map' : 'Live map · tap a number'; }
        if (isToday && navigator.geolocation) {
          var me = null;
          navigator.geolocation.getCurrentPosition(function (p) {
            if (!document.getElementById('rtMap')) return;
            me = new maps.Marker({ map: map, position: { lat: p.coords.latitude, lng: p.coords.longitude }, title: 'You are here', clickable: false,
              icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#404141', fillOpacity: 1, strokeColor: '#9DBCD0', strokeWeight: 5 } });
          }, function () {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
        }
      });
    }).catch(function (e) {
      var note = document.getElementById('rtNote'); if (note) note.textContent = e.message || 'The map couldn\'t load.';
    });
  }

  /** Google address suggestions under an input as you type (Places API, New). */
  function addressSuggest(input, onPick) {
    if (!mapsKey() || !input) return;
    var box = document.createElement('div');
    box.className = 'addr-suggest'; box.setAttribute('role', 'listbox'); box.hidden = true;
    input.setAttribute('autocomplete', 'off'); input.setAttribute('aria-autocomplete', 'list');
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(box);
    var timer = null, token = null, seq = 0, items = [];
    function close() { box.hidden = true; box.innerHTML = ''; items = []; }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 3) { close(); return; }
      timer = setTimeout(function () {
        var my = ++seq;
        loadMaps().then(function (maps) {
          if (!token) token = new maps.places.AutocompleteSessionToken();
          return maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, includedRegionCodes: ['au'], sessionToken: token,
            locationBias: { center: { lat: -33.75, lng: 151.27 }, radius: 50000 } });
        }).then(function (res) {
          if (my !== seq) return;
          items = (res.suggestions || []).map(function (s) { return s.placePrediction; }).filter(Boolean).slice(0, 5);
          if (!items.length) { close(); return; }
          box.innerHTML = items.map(function (p, i) { return '<button type="button" role="option" data-i="' + i + '">' + esc(p.text.toString()) + '</button>'; }).join('') +
            '<span class="addr-google">Suggestions by Google</span>';
          box.hidden = false;
          Array.prototype.forEach.call(box.querySelectorAll('[data-i]'), function (b) {
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.onclick = function () {
              var p = items[Number(b.getAttribute('data-i'))];
              input.value = p.text.toString(); close();
              p.toPlace().fetchFields({ fields: ['formattedAddress'] }).then(function (r) {
                var addr = (r.place && r.place.formattedAddress || input.value).replace(/, Australia$/, '');
                input.value = addr; token = null;
                input.dispatchEvent(new Event('change')); if (onPick) onPick(addr);
              }, function () { token = null; });
            };
          });
        }).catch(function () { close(); });
      }, 250);
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  function renderRoute(date) {
    loading('Loading route…');
    loadDay(date).then(function (day) {
      if (mapsKey()) return renderRouteLive(date, day);
      var stops = day.appointments.filter(function (a) { return a.address; });
      var head = '<section class="section stack" style="padding-bottom:16px"><h1>Route</h1><p class="muted" style="margin:0">' + stops.length + ' stop' + (stops.length === 1 ? '' : 's') + ' · ' + esc(longDate(date)) + (isOffice() ? ' · all crews' : '') + '</p></section>';
      var mapHtml = '', listHtml = '';
      if (!stops.length) {
        listHtml = '<div class="empty"><h2>No stops</h2><p class="muted">No appointments with an address on this day.</p></div>';
      } else {
        var addrs = stops.map(function (s) { return s.address; });
        var startsAtWarehouse = /warehouse/i.test(stops[0].type);
        var origin = startsAtWarehouse ? addrs[0] : (CFG.WAREHOUSE || addrs[0]);
        var rest = startsAtWarehouse ? addrs.slice(1) : addrs;
        var embed = 'https://maps.google.com/maps?output=embed&saddr=' + encodeURIComponent(origin) + '&daddr=' + rest.map(encodeURIComponent).join('+to:');
        var full = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(origin) +
          '&destination=' + encodeURIComponent(rest[rest.length - 1] || origin) +
          (rest.length > 1 ? '&waypoints=' + rest.slice(0, -1).map(encodeURIComponent).join('%7C') : '');
        mapHtml = '<iframe class="map-frame route-map" loading="lazy" title="Route map" src="' + embed + '"></iframe>';
        listHtml = '<ol class="stops">' + stops.map(function (s, i) {
          return '<li><span class="num">' + (i + 1) + '</span>' +
            '<a style="flex:1;display:flex;flex-direction:column;text-decoration:none;min-height:44px;justify-content:center" href="' + apptHref(s, date) + '"><b>' + esc(suburb(s.address)) + '</b><span class="small muted">' + esc(s.startLabel) + ' · ' + esc(s.title) + '</span></a>' +
            '<a class="icon-btn" href="' + mapsDir(s.address) + '" target="_blank" rel="noopener" aria-label="Directions to ' + esc(suburb(s.address)) + '">' + I.nav + '</a></li>';
        }).join('') + '</ol>' +
          '<div style="padding:16px"><a class="btn btn-dark btn-lg" href="' + full + '" target="_blank" rel="noopener">Open full route in Google Maps' + I.ext + '</a></div>';
      }
      if (wide()) {
        app.innerHTML = shell('route', date, '<div class="split split-route"><section class="pane-list">' + dayNav(date) + head + listHtml + '</section><section class="pane-detail pane-map">' + (mapHtml || '<div class="empty-detail"><p class="muted">No route to show.</p></div>') + '</section></div>');
      } else {
        app.innerHTML = topbar({ right: shortDate(date) }) + '<main>' + head + mapHtml + listHtml + '</main>' + tabbar('route', date);
      }
    }, function (err) { showError(err, function () { renderRoute(date); }); });
  }

  /* ---------- office: Team board ---------- */

  function renderTeam(date) {
    loading('Loading the team…');
    loadDay(date).then(function (day) {
      if (!isOffice()) { location.hash = '#/day'; return; }
      var people = {}, order = [];
      day.appointments.forEach(function (a) {
        var crew = a.crew.length ? a.crew : [{ email: '_none', name: 'Unassigned' }];
        crew.forEach(function (c, i) {
          if (!people[c.email]) { people[c.email] = { name: c.name, appts: [] }; order.push(c.email); }
          people[c.email].appts.push({ a: a, pos: i + 1 });
        });
      });
      order.forEach(function (e) { people[e].appts.sort(function (x, y) { return x.a.start < y.a.start ? -1 : 1; }); });
      order.sort(function (x, y) { return x === '_none' ? 1 : y === '_none' ? -1 : people[x].name.localeCompare(people[y].name); });

      var head = '<div class="team-head">' + dayNav(date) +
        '<section class="section stack" style="padding-top:16px;padding-bottom:16px"><span class="eyebrow">' + esc(longDate(date)) + '</span><h1>Team</h1>' +
        '<p style="margin:4px 0 0;font-weight:500">' + order.filter(function (e) { return e !== '_none'; }).length + ' people · ' + day.appointments.length + ' appointments</p></section></div>';

      var cols = order.length ? '<div class="team-board">' + order.map(function (email) {
        var p = people[email];
        return '<section class="team-col" aria-label="' + esc(p.name) + '">' +
          '<header class="team-col-head"><span class="avatar">' + esc(initials(p.name)) + '</span><span class="stack" style="gap:0"><b>' + esc(p.name) + '</b><span class="small muted">' + p.appts.length + ' appointment' + (p.appts.length === 1 ? '' : 's') + '</span></span></header>' +
          p.appts.map(function (x) {
            var a = x.a;
            return '<a class="appt-card" href="' + apptHref(a, date) + '">' +
              '<span class="spread"><span class="tag ' + (a.isSales ? 'tag-light' : 'tag-blue') + '">' + esc(a.type) + (a.isInstall && x.pos > 2 ? ' · ' + ordinal(x.pos) : '') + '</span><b class="small">' + esc(a.startLabel) + '</b></span>' +
              '<span class="name">' + esc(a.title) + '</span>' +
              '<span class="sub">' + esc(suburb(a.address)) + (refLabel(a) ? ' · ' + esc(refLabel(a)) : '') + '</span></a>';
          }).join('') +
        '</section>';
      }).join('') + '</div>' : '<div class="empty"><h2>No appointments</h2><p class="muted">Nothing is booked on this day.</p></div>';

      if (wide()) app.innerHTML = shell('team', date, '<div class="team-page">' + head + cols + '</div>');
      else app.innerHTML = topbar() + '<main>' + head + cols + '</main>' + tabbar('team', date);
    }, function (err) { showError(err, function () { renderTeam(date); }); });
  }

  /* ---------- office: Overview (metrics snapshot) ---------- */

  function periodRange(period, anchor) {
    var d = new Date(anchor + 'T12:00:00');
    if (period === 'week') {
      var dow = (d.getDay() + 6) % 7; // Monday = 0
      var mon = addDays(anchor, -dow);
      return { from: mon, to: addDays(mon, 6), prev: addDays(mon, -7), next: addDays(mon, 7),
        label: 'Week of ' + new Date(mon + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' }) };
    }
    if (period === 'month') {
      var first = anchor.slice(0, 8) + '01';
      var nextFirst = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      var last = addDays(nextFirst.getFullYear() + '-' + String(nextFirst.getMonth() + 1).padStart(2, '0') + '-01', -1);
      var prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      return { from: first, to: last, prev: prevMonth.getFullYear() + '-' + String(prevMonth.getMonth() + 1).padStart(2, '0') + '-01',
        next: nextFirst.getFullYear() + '-' + String(nextFirst.getMonth() + 1).padStart(2, '0') + '-01',
        label: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) };
    }
    return { from: anchor, to: anchor, prev: addDays(anchor, -1), next: addDays(anchor, 1), label: longDate(anchor) };
  }

  function loadMetrics(from, to, force) {
    var key = 'm:' + from + ':' + to;
    if (!force && state.cache[key]) return Promise.resolve(state.cache[key]);
    return api({ action: 'metrics', from: from, to: to }).then(function (data) {
      state.user = data.user;
      store('fa-user', data.user);
      state.cache[key] = data.metrics;
      return data.metrics;
    });
  }

  function fmtNum(n, dp) { return Number(n || 0).toLocaleString('en-AU', { maximumFractionDigits: dp || 0, minimumFractionDigits: 0 }); }
  function fmtMins(m) { m = Math.round(m || 0); var h = Math.floor(m / 60); return h ? h + ' h ' + String(m % 60).padStart(2, '0') + ' m' : (m % 60) + ' m'; }

  function tile(label, value, sub, flag) {
    return '<div class="tile' + (flag ? ' tile-flag' : '') + '"><span class="tile-label">' + esc(label) + '</span>' +
      '<span class="tile-value">' + esc(value) + '</span>' +
      '<span class="tile-sub">' + (flag ? '<span class="tag tag-dark">Check</span> ' : '') + esc(sub) + '</span></div>';
  }

  function renderOverview(period, anchor) {
    if (['today', 'week', 'month'].indexOf(period) < 0) period = 'today';
    var r = periodRange(period, anchor);
    loading('Loading the overview…');
    loadMetrics(r.from, r.to).then(function (m) {
      if (!isOffice()) { location.hash = '#/day'; return; }
      var t = m.totals || {};
      var reports = (t.onTime || 0) + (t.late || 0);
      var pct = reports ? Math.round((t.onTime / reports) * 100) : null;
      var maxHours = Math.max.apply(null, [1].concat(m.people.map(function (p) { return p.hours; })));

      var seg = ['today', 'week', 'month'].map(function (k) {
        var label = { today: 'Day', week: 'Week', month: 'Month' }[k];
        return '<a href="#/overview/' + k + '/' + anchor + '"' + (k === period ? ' aria-current="page"' : '') + '>' + label + '</a>';
      }).join('');

      var html = '<div class="overview">' +
        '<div class="ov-head">' +
          '<div class="stack" style="gap:4px"><span class="eyebrow">Overview</span><h1>' + esc(r.label) + '</h1></div>' +
          '<div class="ov-controls no-print">' +
            '<nav class="segmented" aria-label="Period">' + seg + '</nav>' +
            '<a class="btn btn-sand sq" href="#/overview/' + period + '/' + r.prev + '" aria-label="Previous">' + I.left + '</a>' +
            '<a class="btn btn-sand sq" href="#/overview/' + period + '/' + r.next + '" aria-label="Next">' + I.right + '</a>' +
            '<button class="btn btn-outline" id="printSnap">' + I.print + 'Print snapshot</button>' +
          '</div>' +
        '</div>';

      if (!m.hasReportLog) html += '<p class="notice" style="margin:0 0 16px">The report log isn\'t connected yet, so jobs done, hours, travel and report timing show as zero. Run <b>seedSampleReportLog</b> in the sandbox script.</p>';

      html += '<section class="tiles" aria-label="Key numbers">' +
        tile('Jobs done', fmtNum(t.done), 'of ' + fmtNum(t.jobsScheduled) + ' scheduled jobs') +
        tile('Jobs incomplete', fmtNum(t.incomplete), 'return visits needed', t.incomplete > 0) +
        tile('Reports outstanding', fmtNum(t.jobsOutstanding), 'jobs with no job report yet', t.jobsOutstanding > 0) +
        tile('Hours on site', fmtNum(t.hours, 1) + ' h', 'from Daily Installation Reports') +
        tile('Travel time', fmtMins(t.travelMin), 'driving between jobs') +
        tile('Kilometres', fmtNum(t.km) + ' km', 'travelled') +
        tile('Reports on time', pct == null ? '–' : pct + '%', fmtNum(t.onTime) + ' of ' + fmtNum(reports) + ' reports') +
        tile('Late reports', fmtNum(t.late), 'submitted after the deadline', t.late > 0) +
      '</section>';

      html += '<section class="ov-section"><h2>By person</h2>' + (m.people.length ?
        '<div class="table-wrap"><table class="ov-table"><thead><tr>' +
          '<th scope="col">Name</th><th scope="col" class="num">Scheduled</th><th scope="col" class="num">Done</th><th scope="col" class="num">Incomplete</th><th scope="col" class="num">No report</th>' +
          '<th scope="col" class="bar-col">Hours on site</th><th scope="col" class="num">Travel</th><th scope="col" class="num">Km</th><th scope="col" class="num">On time</th><th scope="col" class="num">Late</th>' +
        '</tr></thead><tbody>' +
        m.people.map(function (p) {
          var rep = p.onTime + p.late;
          return '<tr><th scope="row"><span class="row" style="gap:10px"><span class="avatar sm">' + esc(initials(p.name)) + '</span><span>' + esc(p.name) + '</span></span></th>' +
            '<td class="num">' + p.scheduled + '</td><td class="num">' + p.done + '</td>' +
            '<td class="num">' + (p.incomplete ? '<b>' + p.incomplete + '</b>' : 0) + '</td>' +
            '<td class="num">' + (p.outstanding ? '<b>' + p.outstanding + '</b>' : 0) + '</td>' +
            '<td class="bar-col"><span class="hbar" title="' + fmtNum(p.hours, 1) + ' hours"><span style="width:' + Math.round((p.hours / maxHours) * 100) + '%"></span></span><span class="hbar-val">' + fmtNum(p.hours, 1) + ' h</span></td>' +
            '<td class="num">' + fmtMins(p.travelMin) + '</td><td class="num">' + fmtNum(p.km) + '</td>' +
            '<td class="num">' + (rep ? Math.round(p.onTime / rep * 100) + '%' : '–') + '</td>' +
            '<td class="num">' + (p.late ? '<b>' + p.late + '</b>' : 0) + '</td></tr>';
        }).join('') +
        '</tbody><tfoot><tr><th scope="row">Total</th><td class="num">' + fmtNum(t.scheduled) + '</td><td class="num">' + fmtNum(t.done) + '</td><td class="num">' + fmtNum(t.incomplete) + '</td><td class="num">' + fmtNum(t.outstanding) + '</td>' +
          '<td class="bar-col"><span class="hbar-val">' + fmtNum(t.hours, 1) + ' h</span></td><td class="num">' + fmtMins(t.travelMin) + '</td><td class="num">' + fmtNum(t.km) + '</td><td class="num">' + (pct == null ? '–' : pct + '%') + '</td><td class="num">' + fmtNum(t.late) + '</td></tr></tfoot>' +
        '</table></div>' : '<p class="muted">No activity in this period.</p>') + '</section>';

      if (m.jrBaseUrl) { state.jrBase = m.jrBaseUrl; store('fa-jrbase', m.jrBaseUrl); }
      var kindLabel = { late: 'Late report', incomplete: 'Incomplete', outstanding: 'No report' };
      html += '<section class="ov-section"><h2>Needs attention' + (m.attention.length ? ' <span class="muted" style="font-weight:500">(' + m.attention.length + ')</span>' : '') + '</h2>' +
        (m.attention.length ? '<ul class="attention">' + m.attention.slice(0, 50).map(function (a) {
          var open = a.jr && a.kind === 'outstanding' && a.report !== 'DIR';
          var inner = '<span class="tag ' + (a.kind === 'outstanding' ? 'tag-dark' : a.kind === 'incomplete' ? 'tag-blue' : '') + '">' + esc(kindLabel[a.kind]) + '</span>' +
            '<span class="att-main"><b>' + esc(a.name) + (a.jr ? ' · JR#' + esc(a.jr) : '') + '</b><span class="small muted">' + esc(a.detail) + '</span></span>' +
            '<span class="small muted att-date">' + esc(shortDate(a.date)) + '</span>' + (open ? '<span class="att-open">Open job report' + I.right + '</span>' : '');
          return '<li>' + (open ? '<a class="att-link" href="#/jr/' + encodeURIComponent(a.jr) + '/' + esc(a.date) + '">' + inner + '</a>' : inner) + '</li>';
        }).join('') + '</ul>' : '<p class="muted" style="margin:0">Nothing needs attention. Every job has a report and every report was on time.</p>') + '</section>';

      html += '<p class="small muted" style="margin:24px 0 0">Snapshot taken ' + new Date(m.generatedAt).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) +
        ' · <button class="link-btn no-print" id="refreshOv">Refresh</button></p></div>';

      app.innerHTML = wide() ? shell('overview', null, html) : topbar() + '<main>' + html + '</main>' + tabbar('overview');
      document.getElementById('printSnap').onclick = function () { window.print(); };
      document.getElementById('refreshOv').onclick = function () { loadMetrics(r.from, r.to, true).then(function () { renderOverview(period, anchor); }, function (e) { showError(e, render); }); };
    }, function (err) { showError(err, function () { renderOverview(period, anchor); }); });
  }

  /* ---------- office planner (sandbox: writes straight to the calendar) ---------- */

  var planner = { from: null, data: null, person: '', editing: null };
  var APPT_TYPES = ['Sales', 'Installation', 'Check measure', 'Service call', 'Site meeting'];
  function canSchedule() {
    var u = state.user || {};
    return [u.role].concat(u.roles || []).some(function (r) { return /office|admin|pm|sales/i.test(r || ''); });
  }
  function weekStart(dateStr) { // Monday
    var d = new Date(dateStr + 'T12:00:00'), wd = (d.getDay() + 6) % 7;
    return addDays(dateStr, -wd);
  }
  function lightHtml(a) {
    var t = a.status === 'Tentative';
    return '<span class="light ' + (t ? 'is-red' : 'is-green') + '" role="img" aria-label="' + (t ? 'Not confirmed (tentative)' : 'Confirmed booking') + '" title="' + (t ? 'Not confirmed (tentative)' : 'Confirmed booking') + '"></span>';
  }
  function fmtHM(mins) { if (mins == null) return '–'; var h = Math.floor(mins / 60), m = Math.round(mins % 60); return h + 'h' + (m ? ' ' + String(m).padStart(2, '0') : ''); }
  function durOf(a) { return Math.round((new Date(a.end) - new Date(a.start)) / 60000); }

  function loadWeek(from, force) {
    if (!force && planner.data && planner.data.from === from) return Promise.resolve(planner.data);
    return api({ action: 'week', from: from }).then(function (d) { state.user = d.user; planner.data = d.week; if (d.week.jrBaseUrl) state.jrBase = d.week.jrBaseUrl; return d.week; });
  }

  function renderPlanner(from) {
    if (!canSchedule()) { location.hash = '#/day'; return; }
    from = weekStart(from || todayStr());
    planner.from = from;
    loading('Loading the week…');
    loadWeek(from).then(function (w) { drawPlanner(w); }, function (err) { showError(err, function () { renderPlanner(from); }); });
  }

  /** Approved leave shown on each planner day ("Away: Lewis"). */
  function plAway(w, d, person) {
    var a = (w.away || []).filter(function (x) { return x.first <= d && x.last >= d && (!person || x.email === person); });
    return a.length ? '<span class="pl-away">Away: ' + esc(a.map(function (x) { return firstName(x.name) + (x.part ? ' from ' + x.from : ''); }).join(', ')) + '</span>' : '';
  }
  function drawPlanner(w) {
    var from = w.from, days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(from, i));
    var person = planner.person;
    var appts = w.appointments.filter(function (a) { return !person || a.crew.some(function (c) { return c.email === person; }); });
    var showSun = appts.some(function (a) { return a.date === days[6]; });
    if (!showSun) days = days.slice(0, 6);
    var label = shortDate(days[0]) + ' – ' + shortDate(days[days.length - 1]);
    var head = '<div class="pl-head">' +
      '<div class="stack" style="gap:2px"><h1 style="font-size:24px">Planner</h1><span class="small muted">' + esc(label) + ' · Sandbox calendar</span></div>' +
      '<div class="pl-tools">' +
        '<div class="pl-weeknav"><button type="button" id="plPrev" aria-label="Previous week">' + I.left + '</button><button type="button" id="plThis">This week</button><button type="button" id="plNext" aria-label="Next week">' + I.right + '</button></div>' +
        '<label class="sr-only" for="plPerson">Show</label><select id="plPerson" class="pl-select"><option value="">Everyone</option>' +
          w.staff.map(function (s) { return '<option value="' + esc(s.email) + '"' + (s.email === person ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="btn btn-dark" id="plNew">+ New appointment</button>' +
      '</div></div>' +
      '<p class="pl-legend small"><span class="light is-green"></span> Confirmed booking <span class="light is-red" style="margin-left:12px"></span> Not confirmed (tentative)</p>';

    var cols = days.map(function (d) {
      var list = appts.filter(function (a) { return a.date === d; });
      var tot = (w.days || {})[d] || { siteMin: 0, people: {} };
      var totals;
      if (person) {
        var p = tot.people[person] || { siteMin: 0, travelMin: 0 };
        var dayMin = p.siteMin + (p.travelMin || 0);
        totals = '<span class="pl-tot' + (dayMin > 480 ? ' is-over' : '') + '">' + fmtHM(p.siteMin) + ' site + ' + fmtHM(p.travelMin) + ' travel = <b>' + fmtHM(dayMin) + '</b>' + (dayMin > 480 ? ' · over 8 h' : '') + '</span>';
      } else {
        totals = '<span class="pl-tot">' + list.length + (list.length === 1 ? ' appointment' : ' appointments') + (tot.siteMin ? ' · ' + fmtHM(tot.siteMin) + ' on site' : '') + '</span>';
      }
      return '<section class="pl-day' + (d === todayStr() ? ' is-today' : '') + '">' +
        '<header class="pl-dayhead"><div class="spread"><b>' + esc(shortDate(d)) + '</b><span class="pl-wx" data-date="' + d + '"></span></div>' + totals + plAway(w, d, person) + '</header>' +
        '<div class="pl-cards">' + (list.length ? list.map(function (a) {
          return '<button type="button" class="pl-card' + (a.status === 'Tentative' ? ' is-tentative' : '') + '" data-edit="' + esc(a.id) + '">' + lightHtml(a) +
            '<span class="pl-time">' + esc(a.allDay ? 'All day' : a.startLabel + '–' + a.endLabel) + '</span>' +
            '<span class="tag ' + (a.isSales ? '' : 'tag-blue') + '">' + esc(a.type) + '</span>' +
            '<span class="pl-title">' + esc(a.title) + '</span>' + (a.readOnly ? '<span class="pl-sub">From ' + esc(a.source) + '</span>' : '') +
            '<span class="pl-sub">' + esc([suburb(a.address), refLabel(a)].filter(String).join(' · ')) + '</span>' +
            (a.crew.length ? '<span class="pl-crew">' + a.crew.map(function (c) { return '<span class="pl-ini" title="' + esc(c.name) + '">' + esc(initials(c.name)) + '</span>'; }).join('') + '</span>' : '<span class="pl-sub" style="color:#8a3b2e">No crew assigned</span>') +
          '</button>';
        }).join('') : '<p class="small muted" style="margin:0;padding:4px 2px">Nothing booked</p>') +
        '<button type="button" class="pl-add" data-add="' + d + '">+ Add</button></div></section>';
    }).join('');

    var body = '<div class="pl">' + head + '<div class="pl-grid" style="--days:' + days.length + '">' + cols + '</div></div>';
    app.innerHTML = wide() ? shell('planner', null, body) : topbar() + '<main>' + body + '</main>' + tabbar('planner');
    document.getElementById('plPrev').onclick = function () { location.hash = '#/planner/' + addDays(planner.from, -7); };
    document.getElementById('plNext').onclick = function () { location.hash = '#/planner/' + addDays(planner.from, 7); };
    document.getElementById('plThis').onclick = function () { location.hash = '#/planner'; };
    document.getElementById('plPerson').onchange = function () { planner.person = this.value; drawPlanner(planner.data); };
    document.getElementById('plNew').onclick = function () { openBooking(null, d0()); };
    function d0() { var t = todayStr(); return t >= days[0] && t <= days[days.length - 1] ? t : days[0]; }
    Array.prototype.forEach.call(app.querySelectorAll('[data-add]'), function (b) { b.onclick = function () { openBooking(null, b.getAttribute('data-add')); }; });
    Array.prototype.forEach.call(app.querySelectorAll('[data-edit]'), function (b) {
      b.onclick = function () {
        var a = w.appointments.filter(function (x) { return x.id === b.getAttribute('data-edit'); })[0];
        if (a && a.readOnly) { if (confirm('This appointment comes from the "' + a.source + '" Google Calendar, so it\'s changed there. Open Google Calendar?')) window.open(a.calendarUrl, '_blank'); return; }
        openBooking(a);
      };
    });
    fillPlannerWeather(days);
  }

  function fillPlannerWeather(days) {
    var first = days[0], last = days[days.length - 1];
    if (daysAhead(last) < 0 || daysAhead(first) > 13) return;
    var s = daysAhead(first) < 0 ? todayStr() : first, e = daysAhead(last) > 13 ? addDays(todayStr(), 13) : last;
    wxFetch('https://api.open-meteo.com/v1/forecast?latitude=' + (CFG.WEATHER_LAT || -33.75) + '&longitude=' + (CFG.WEATHER_LON || 151.28) +
      '&daily=weather_code,temperature_2m_max,wind_gusts_10m_max&timezone=Australia%2FSydney&start_date=' + s + '&end_date=' + e).then(function (d) {
      planner.wx = {};
      (d.daily.time || []).forEach(function (t, i) { planner.wx[t] = { code: d.daily.weather_code[i], max: d.daily.temperature_2m_max[i], gust: d.daily.wind_gusts_10m_max[i] }; });
      Array.prototype.forEach.call(document.querySelectorAll('.pl-wx'), function (el) {
        var x = planner.wx[el.getAttribute('data-date')]; if (!x) return;
        var info = wxInfo(x.code), warn = info.storm || x.gust >= WX_LIMIT;
        el.innerHTML = wxIcon(info.icon, info.label, 18) + '<span>' + Math.round(x.max) + '°</span>' + (warn ? '<span class="pl-warn" title="' + esc(info.storm ? 'Thunderstorms' : 'Gusts ' + Math.round(x.gust) + ' km/h') + '">' + (info.storm ? 'Storm' : 'Wind ' + Math.round(x.gust)) + '</span>' : '');
      });
    }).catch(function () {});
  }

  /* booking panel */

  function openBooking(a, date) {
    var w = planner.data, isNew = !a;
    var defType = 'Installation';
    var v = a ? {
      id: a.id, type: APPT_TYPES.indexOf(a.type) >= 0 ? a.type : (a.isSales ? 'Sales' : 'Installation'), status: a.status || 'Confirmed',
      date: a.date, start: a.startLabel, durationMin: durOf(a), customer: a.customer, phone: a.phone, address: a.address,
      jr: a.jr, opp: a.opp, crew: a.crew.map(function (c) { return c.email; }), access: a.access, notes: a.notes,
      requirements: (a.requirements || []).join('\n'), folderUrl: a.folderUrl, projectFolderUrl: a.projectFolderUrl, title: a.title
    } : { type: defType, status: 'Tentative', date: date, start: '08:00', durationMin: 120, crew: [], title: '' };
    planner.editing = v;
    var durOpts = []; for (var m = 30; m <= 600; m += 30) durOpts.push(m);
    var html = '<div class="bk-backdrop" id="bkBack"></div><aside class="bk" role="dialog" aria-modal="true" aria-labelledby="bkTitle">' +
      '<header class="bk-head"><h2 id="bkTitle">' + (isNew ? 'New appointment' : 'Edit appointment') + '</h2><button type="button" class="bk-x" id="bkClose" aria-label="Close">' + I.x + '</button></header>' +
      '<form class="bk-body" id="bkForm" autocomplete="off">' +
        '<div class="field"><span class="bk-label">Type</span><div class="seg bk-types" role="radiogroup">' + APPT_TYPES.map(function (t) {
          return '<button type="button" role="radio" data-type="' + esc(t) + '" aria-checked="' + (v.type === t) + '">' + esc(t) + '</button>'; }).join('') + '</div></div>' +
        '<div class="field"><span class="bk-label">Booking</span><div class="seg" role="radiogroup">' +
          '<button type="button" role="radio" data-status="Tentative" aria-checked="' + (v.status === 'Tentative') + '"><span class="light is-red"></span> Tentative</button>' +
          '<button type="button" role="radio" data-status="Confirmed" aria-checked="' + (v.status === 'Confirmed') + '"><span class="light is-green"></span> Confirmed</button></div>' +
          '<span class="small muted bk-hint" id="bkStatusHint"></span></div>' +
        '<div class="bk-row3">' +
          '<div class="field"><label for="bkDate">Date</label><input id="bkDate" type="date" required value="' + esc(v.date) + '"></div>' +
          '<div class="field"><label for="bkStart">Start</label><input id="bkStart" type="time" step="900" required value="' + esc(v.start) + '"></div>' +
          '<div class="field"><label for="bkDur">Length</label><select id="bkDur">' + durOpts.map(function (m) { return '<option value="' + m + '"' + (m === v.durationMin ? ' selected' : '') + '>' + fmtHM(m) + '</option>'; }).join('') +
            (durOpts.indexOf(v.durationMin) < 0 ? '<option value="' + v.durationMin + '" selected>' + fmtHM(v.durationMin) + '</option>' : '') + '</select></div>' +
        '</div>' +
        '<div id="bkWx"></div>' +
        '<div class="bk-row2">' +
          '<div class="field"><label for="bkJr">JR number</label><input id="bkJr" inputmode="numeric" placeholder="e.g. 28874" value="' + esc(v.jr || '') + '"></div>' +
          '<div class="field"><label for="bkOpp">OPP number</label><input id="bkOpp" inputmode="numeric" placeholder="e.g. 1042" value="' + esc(v.opp || '') + '"></div>' +
        '</div>' +
        '<div id="bkJrLink" class="bk-jr"></div>' +
        '<div class="field"><label for="bkCustomer">Customer</label><input id="bkCustomer" placeholder="Name" value="' + esc(v.customer || '') + '"></div>' +
        '<div class="bk-row2">' +
          '<div class="field"><label for="bkPhone">Phone</label><input id="bkPhone" type="tel" value="' + esc(v.phone || '') + '"></div>' +
          '<div class="field"><label for="bkAccess">Access</label><input id="bkAccess" placeholder="Side gate, code…" value="' + esc(v.access || '') + '"></div>' +
        '</div>' +
        '<div class="field"><label for="bkAddress">Site address</label><input id="bkAddress" placeholder="Street, suburb NSW postcode" value="' + esc(v.address || '') + '"></div>' +
        '<div class="field"><span class="bk-label">Crew</span><div class="bk-crew">' + w.staff.map(function (s) {
          return '<label class="bk-person"><input type="checkbox" value="' + esc(s.email) + '"' + (v.crew.indexOf(s.email) >= 0 ? ' checked' : '') + '><span>' + esc(s.name) + '<small>' + esc(roleLabelList(s)) + '</small></span></label>'; }).join('') +
          (w.staff.length ? '' : '<p class="small muted" style="margin:0">Add the team to STAFF_JSON in the script settings to pick them here.</p>') +
          '</div><span class="small bk-warn" id="bkClash"></span></div>' +
        '<div class="field"><label for="bkReq">Job requirements <small class="muted">(one per line)</small></label><textarea id="bkReq" rows="3">' + esc(v.requirements || '') + '</textarea></div>' +
        '<div class="field"><label for="bkNotes">Notes</label><textarea id="bkNotes" rows="2">' + esc(v.notes || '') + '</textarea></div>' +
        '<details class="bk-more"' + (v.folderUrl || v.projectFolderUrl ? ' open' : '') + '><summary>Drive folders and title</summary>' +
          '<div class="field"><label for="bkFolder">Opportunity folder link</label><input id="bkFolder" type="url" value="' + esc(v.folderUrl || '') + '"></div>' +
          '<div class="field"><label for="bkProj">Project folder link</label><input id="bkProj" type="url" value="' + esc(v.projectFolderUrl || '') + '"></div>' +
          '<div class="field"><label for="bkTitleIn">Calendar title <small class="muted">(blank: customer · type)</small></label><input id="bkTitleIn" value="' + esc(isNew ? '' : v.title || '') + '"></div>' +
        '</details>' +
        '<div class="bk-todo"><label class="st-check"><input type="checkbox" id="bkTodoOn"> Add a to-do to my list for this appointment</label>' +
          '<div id="bkTodoBox" class="stack" style="gap:8px" hidden><div class="field"><label for="bkTodoText">To-do</label><input id="bkTodoText" placeholder="e.g. Confirm the motor has arrived"></div>' +
          '<div class="field"><label for="bkTodoDue">Due</label><input id="bkTodoDue" type="date" value="' + esc(v.date || '') + '"></div></div></div>' +
        '<p class="notice error" id="bkErr" hidden></p>' +
      '</form>' +
      '<footer class="bk-foot">' + (isNew ? '' : '<button type="button" class="btn btn-outline" id="bkDelete">Delete</button>') +
        '<button type="button" class="btn btn-sand" id="bkCancel">Cancel</button><button type="button" class="btn btn-dark" id="bkSave">' + (isNew ? 'Book' : 'Save changes') + '</button></footer>' +
    '</aside>';
    var host = document.createElement('div'); host.id = 'bkHost'; host.innerHTML = html; document.body.appendChild(host);
    document.body.classList.add('bk-open');
    var $ = function (id) { return document.getElementById(id); };
    function close() { host.remove(); document.body.classList.remove('bk-open'); }
    $('bkClose').onclick = $('bkCancel').onclick = $('bkBack').onclick = close;
    host.onkeydown = function (e) { if (e.key === 'Escape') close(); };
    function pick(sel, attr, val) { Array.prototype.forEach.call(host.querySelectorAll(sel), function (b) { b.setAttribute('aria-checked', String(b.getAttribute(attr) === val)); }); }
    Array.prototype.forEach.call(host.querySelectorAll('[data-type]'), function (b) { b.onclick = function () { v.type = b.getAttribute('data-type'); pick('[data-type]', 'data-type', v.type); refresh(); }; });
    Array.prototype.forEach.call(host.querySelectorAll('[data-status]'), function (b) { b.onclick = function () { v.status = b.getAttribute('data-status'); pick('[data-status]', 'data-status', v.status); refresh(); }; });
    ['bkDate', 'bkStart', 'bkDur', 'bkJr'].forEach(function (id) { $(id).oninput = $(id).onchange = refresh; });
    Array.prototype.forEach.call(host.querySelectorAll('.bk-crew input'), function (c) { c.onchange = refresh; });

    function refresh() {
      // status hint
      $('bkStatusHint').textContent = v.status === 'Tentative' ? 'Shows red in the installers\' app until it is confirmed.' : 'Shows green: the job is going ahead.';
      // JR link, filled in from the JR number
      var jr = $('bkJr').value.replace(/[^\d]/g, ''), tpl = w.jrBaseUrl || jrBase();
      $('bkJrLink').innerHTML = jr && tpl ? I.report + '<span>Job report link ready: <a href="' + esc(tpl + '?ref=' + encodeURIComponent(jr) + '&date=' + $('bkDate').value) + '" target="_blank" rel="noopener">JR#' + esc(jr) + '</a>. The crew open it from the appointment.</span>'
        : (jr ? '' : '<span class="small muted">Add the JR number and the job report link fills in automatically. The JR number also links the project chat.</span>');
      // weather for the day
      var x = planner.wx && planner.wx[$('bkDate').value], outdoor = /Installation|Service call/.test(v.type);
      $('bkWx').innerHTML = x && (wxInfo(x.code).storm || x.gust >= WX_LIMIT) && outdoor ? wxWarning(wxInfo(x.code).storm ? 'Storms forecast this day' : 'Gusts up to ' + Math.round(x.gust) + ' km/h forecast', 'Check before booking awnings or outdoor blinds.', wxInfo(x.code).storm ? 'storm' : null) : '';
      // crew clashes
      var d = $('bkDate').value, st = $('bkStart').value, dur = Number($('bkDur').value);
      var s0 = st ? Number(st.slice(0, 2)) * 60 + Number(st.slice(3, 5)) : 0, e0 = s0 + dur;
      var crew = Array.prototype.filter.call(host.querySelectorAll('.bk-crew input'), function (c) { return c.checked; }).map(function (c) { return c.value; });
      var clashes = [];
      w.appointments.forEach(function (o) {
        if (o.id === v.id || o.date !== d || o.allDay) return;
        var s1 = Number(o.startLabel.slice(0, 2)) * 60 + Number(o.startLabel.slice(3, 5)), e1 = s1 + durOf(o);
        if (s1 < e0 && s0 < e1) o.crew.forEach(function (c) { if (crew.indexOf(c.email) >= 0) clashes.push(firstName(c.name) + ' is booked ' + o.startLabel + '–' + o.endLabel + ' (' + o.title + ')'); });
      });
      $('bkClash').textContent = clashes.length ? 'Clash: ' + clashes.join('; ') : '';
    }
    refresh();
    addressSuggest($('bkAddress'));
    setTimeout(function () { $('bkCustomer').focus(); }, 50);

    $('bkTodoOn').onchange = function () { $('bkTodoBox').hidden = !this.checked; if (this.checked) $('bkTodoText').focus(); };
    $('bkSave').onclick = function () {
      var appt = {
        id: v.id || '', type: v.type, status: v.status, date: $('bkDate').value, start: $('bkStart').value, durationMin: Number($('bkDur').value),
        jr: $('bkJr').value, opp: $('bkOpp').value, customer: $('bkCustomer').value.trim(), phone: $('bkPhone').value.trim(), access: $('bkAccess').value.trim(),
        address: $('bkAddress').value.trim(), notes: $('bkNotes').value.trim(), requirements: $('bkReq').value, folderUrl: $('bkFolder').value.trim(),
        projectFolderUrl: $('bkProj').value.trim(), title: $('bkTitleIn').value.trim(),
        crew: Array.prototype.filter.call(host.querySelectorAll('.bk-crew input'), function (c) { return c.checked; }).map(function (c) { return c.value; })
      };
      if ($('bkTodoOn').checked) appt.todo = { text: $('bkTodoText').value.trim(), due: $('bkTodoDue').value || appt.date };
      var err = !appt.date || !appt.start ? 'Choose a date and start time.' : !appt.customer && !appt.title ? 'Add the customer name.' : (appt.todo && !appt.todo.text) ? 'Type the to-do, or untick it.' : '';
      if (err) { $('bkErr').textContent = err; $('bkErr').hidden = false; return; }
      $('bkSave').disabled = true; $('bkSave').textContent = 'Saving…';
      apiPost({ action: 'saveAppt', appt: appt }).then(function () {
        close(); afterBookingChange([v.date, appt.date]);
      }, function (e) { $('bkSave').disabled = false; $('bkSave').textContent = isNew ? 'Book' : 'Save changes'; $('bkErr').textContent = e.message; $('bkErr').hidden = false; });
    };
    if ($('bkDelete')) $('bkDelete').onclick = function () {
      if (!confirm('Delete this appointment? It will disappear from the crew\'s app.')) return;
      $('bkDelete').disabled = true;
      apiPost({ action: 'deleteAppt', id: v.id }).then(function () { close(); afterBookingChange([v.date]); }, function (e) { $('bkDelete').disabled = false; $('bkErr').textContent = e.message; $('bkErr').hidden = false; });
    };
  }
  function roleLabelList(s) {
    var r = (s.roles && s.roles.length ? s.roles : [s.role]).map(function (x) { return { office: 'Office', pm: 'PM', installer: 'Installer', sales: 'Sales', warehouse: 'Warehouse', marketing: 'Marketing', admin: 'Admin' }[x] || x; });
    return r.join(' · ');
  }
  function afterBookingChange(dates) {
    dates.forEach(function (d) { if (d) { delete state.cache[d]; unstore('fa-day-' + d); } });
    loadWeek(planner.from, true).then(drawPlanner, function (e) { showError(e, function () { renderPlanner(planner.from); }); });
  }

  /* ---------- job report inside the app ---------- */

  function renderJobReportForAppt(id, date) {
    loading('Opening job report…');
    loadDay(date).then(function (day) {
      var a = day.appointments.filter(function (x) { return x.id === id; })[0];
      if (!a) { showError(new Error('Appointment not found. It may have been moved.'), function () { history.back(); }); return; }
      renderJobReport(a.jobReportUrl || jrFormUrl(a.jr, date), refLabel(a) || a.title, date);
    }, function (err) { showError(err, function () { renderJobReportForAppt(id, date); }); });
  }

  function renderJobReport(url, label, date) {
    var back = state.jrBack && !/^#\/jr/.test(state.jrBack) ? state.jrBack : '#/day';
    if (!url) {
      var msg = '<div class="empty stack"><h2>Job report link not set up</h2><p class="muted" style="margin:0">Add the JR_FORM_URL script property (the job report address with {jr} where the number goes).</p></div>';
      app.innerHTML = wide() ? shell('day', null, msg) : topbar({ back: back, backLabel: 'Back' }) + '<main>' + msg + '</main>';
      return;
    }
    var bar = '<div class="jr-bar"><a class="jr-back" id="jrBack" href="' + esc(back) + '">' + I.back + 'Back</a><b>Job report · ' + esc(label) + '</b>' +
      '<a class="jr-ext" href="' + esc(url) + '" target="_blank" rel="noopener" title="Open in a new tab">' + I.ext + '<span class="jr-ext-label">New tab</span></a></div>';
    var frame = '<iframe class="jr-frame" src="' + esc(url) + '" title="Job report ' + esc(label) + '" allow="camera; microphone; geolocation; clipboard-write; fullscreen"></iframe>';
    if (wide()) app.innerHTML = shell('day', date, '<div class="jr-view">' + bar + frame + '</div>');
    else app.innerHTML = '<div class="jr-view jr-phone">' + bar + frame + '</div>';
    // coming back: reload that day and the overview so a just-submitted report shows as done
    document.getElementById('jrBack').addEventListener('click', function () {
      Object.keys(state.cache).forEach(function (k) { if (k === date || k.indexOf('m:') === 0) delete state.cache[k]; });
      unstore('fa-day-' + date);
    });
  }

  /* ---------- collateral (design no. 5) ---------- */

  function renderCollateral(id, date) {
    loading('Loading collateral…');
    var back = '#/appt/' + encodeURIComponent(id) + '/' + date;
    api({ action: 'collateral', id: id, date: date }).then(function (d) {
      var c = d.collateral, a = c.appointment;
      var photos = c.files.filter(function (f) { return f.kind === 'photo'; });
      var videos = c.files.filter(function (f) { return f.kind === 'video' || f.kind === 'audio'; });
      var docs = c.files.filter(function (f) { return ['photo', 'video', 'audio'].indexOf(f.kind) < 0; });
      var kindLabel = { pdf: 'PDF', sheet: 'Spreadsheet', doc: 'Document', slides: 'Slides', other: 'File' };
      function short(folder) { var parts = String(folder).split(' › '); return parts.length > 1 ? parts.slice(1).join(' › ') : parts[0]; }
      function fileRow(f) {
        return '<a class="linkrow" href="' + esc(f.url) + '" target="_blank" rel="noopener">' + (f.kind === 'video' ? I.video : I.doc) +
          '<span class="text"><b>' + esc(f.name) + '</b><span>' + esc((kindLabel[f.kind] || (f.kind === 'video' ? 'Video' : 'Audio')) + ' · ' + short(f.folder) + ' · ' + shortDate(f.updated)) + '</span></span>' + I.ext + '</a>';
      }
      var body = '<section class="hero"><span class="small" style="font-weight:700">' + esc([a.type, a.jr ? 'JR#' + a.jr : '', a.opp ? 'OPP-' + a.opp : ''].filter(String).join(' · ')) + '</span>' +
        '<h1>Collateral</h1><p style="margin:0;font-weight:500">' + esc(a.title) + '</p></section>';
      if (c.problems.length) body += '<p class="notice" style="margin:16px 20px 0">' + esc(c.problems.join(' ')) + '</p>';
      var tab = state.colTab === 'add' && c.destinations && c.destinations.length ? 'add' : 'files';
      if (c.sources.length) body += '<div class="col-tabs" role="tablist">' +
        '<button type="button" role="tab" data-tab="files" aria-selected="' + (tab === 'files') + '">Files</button>' +
        '<button type="button" role="tab" data-tab="add" aria-selected="' + (tab === 'add') + '"' + (c.destinations && c.destinations.length ? '' : ' disabled') + '>Add collateral</button></div>';
      if (c.sources.length) {
        var dests = c.destinations || [];
        var defDest = state.colDest && dests.some(function (x) { return x.id === state.colDest; }) ? state.colDest : (dests[0] && dests[0].id);
        body += '<section class="section stack col-add" id="colAdd"' + (tab === 'add' ? '' : ' hidden') + ' style="gap:14px;max-width:640px">' +
          '<div class="field"><label for="colDest">Save to</label><select id="colDest">' + dests.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === defDest ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></div>' +
          '<label class="col-drop" id="colDrop" for="colFile" tabindex="0">' + I.folder + '<b>' + (wide() ? 'Drag files here, or click to choose' : 'Choose files') + '</b>' +
            '<span class="small muted">Photos, videos, PDFs, quotes, drawings: any file up to 30 MB. ' + (wide() ? '' : 'From your photos, camera or files.') + '</span></label>' +
          '<input type="file" id="colFile" multiple hidden>' +
          '<ul class="col-queue" id="colQueue"></ul></section>';
      }
      body += '<div id="colFiles"' + (tab === 'files' ? '' : ' hidden') + '>';
      if (!c.sources.length) {
        body += '<div class="empty stack"><h2>No Drive folders on this appointment</h2><p class="muted" style="margin:0">Add the project or opportunity folder link to the appointment (Planner › edit › Drive folders).</p></div>';
      } else {
        body += '<section class="section stack" style="gap:8px"><h2>Documents' + (docs.length ? ' · ' + docs.length : '') + '</h2>' +
          (docs.length ? docs.map(fileRow).join('') : '<p class="muted small" style="margin:0">No documents in the folders yet.</p>') + '</section>';
        body += '<section class="section stack" style="gap:10px"><h2>Photos' + (photos.length ? ' · ' + photos.length : '') + '</h2>' +
          (photos.length ? '<div class="col-grid">' + photos.map(function (f) {
            return '<a class="col-photo" href="' + esc(f.url) + '" target="_blank" rel="noopener" title="' + esc(f.name) + '">' +
              (f.thumb ? '<img src="' + esc(f.thumb) + '" alt="' + esc(f.name) + '" loading="lazy">' : '<span>' + esc(f.name) + '</span>') +
              '<small>' + esc(short(f.folder)) + '</small></a>';
          }).join('') + '</div>' : '<p class="muted small" style="margin:0">No photos yet.</p>') + '</section>';
        if (videos.length) body += '<section class="section stack" style="gap:8px"><h2>Videos and voice notes · ' + videos.length + '</h2>' + videos.map(fileRow).join('') + '</section>';
        if (c.truncated) body += '<p class="small muted" style="margin:12px 20px 0">Showing the first ' + c.files.length + ' files. Open the folder in Drive to see everything.</p>';
        body += '<section class="section stack" style="gap:8px"><h2>NetSuite</h2><p class="small muted" style="margin:0">Order confirmations, signed quotes and files attached in NetSuite will show here once NetSuite is connected.</p></section>';
        body += '<section class="section stack" style="gap:8px">' + c.sources.map(function (s) { return linkRow(s.url, I.folder, 'Open ' + s.label.toLowerCase() + ' in Drive', s.name); }).join('') + '</section>';
      }
      body += '</div><div style="height:32px"></div>';
      if (wide()) app.innerHTML = shell('day', date, '<div class="pane-solo"><a class="back-link" href="' + back + '">' + I.left + 'Back to appointment</a>' + body + '</div>');
      else app.innerHTML = topbar({ back: back, backLabel: 'Job', right: a.jr ? 'JR#' + a.jr : '' }) + '<main>' + body + '</main>';
      window.scrollTo(0, 0);
      bindCollateralUpload(id, date);
    }, function (err) { showError(err, function () { renderCollateral(id, date); }); });
  }

  var COL_MAX_BYTES = 30 * 1024 * 1024;
  function bindCollateralUpload(id, date) {
    Array.prototype.forEach.call(document.querySelectorAll('.col-tabs button'), function (b) {
      b.onclick = function () {
        state.colTab = b.getAttribute('data-tab');
        Array.prototype.forEach.call(document.querySelectorAll('.col-tabs button'), function (x) { x.setAttribute('aria-selected', String(x === b)); });
        document.getElementById('colAdd').hidden = state.colTab !== 'add';
        document.getElementById('colFiles').hidden = state.colTab === 'add';
      };
    });
    var input = document.getElementById('colFile'), drop = document.getElementById('colDrop'), sel = document.getElementById('colDest'), queue = document.getElementById('colQueue');
    if (!input) return;
    sel.onchange = function () { state.colDest = sel.value; };
    var busy = 0, done = 0;
    function addFiles(list) {
      Array.prototype.forEach.call(list, function (f) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="col-q-name"></span><span class="col-q-state small"></span>';
        li.querySelector('.col-q-name').textContent = f.name + ' · ' + fmtSize(f.size);
        var st = li.querySelector('.col-q-state');
        queue.insertBefore(li, queue.firstChild);
        if (f.size > COL_MAX_BYTES) { st.textContent = 'Too big (over 30 MB). Add it in Drive instead.'; li.className = 'is-bad'; return; }
        var dest = sel.value, destLabel = sel.options[sel.selectedIndex].text;
        st.textContent = 'Waiting…';
        chain = chain.then(function () {
          busy++; st.textContent = 'Uploading…'; li.className = 'is-busy';
          return toBase64(f).then(function (b64) {
            return apiPost({ action: 'collateralUpload', id: id, date: date, dest: dest, name: f.name, mime: f.type || 'application/octet-stream', data: b64 });
          }).then(function () { st.textContent = 'Saved to ' + destLabel; li.className = 'is-ok'; done++; },
            function (e) { st.textContent = 'Not saved: ' + (e.message || 'upload failed') + '. Try again.'; li.className = 'is-bad'; })
            .then(function () { busy--; if (!busy && done) markStale(); });
        });
      });
    }
    var chain = Promise.resolve();
    function markStale() {
      if (document.getElementById('colRefresh')) return;
      var b = document.createElement('button'); b.type = 'button'; b.id = 'colRefresh'; b.className = 'btn btn-sand'; b.textContent = 'Done: show files';
      b.onclick = function () { state.colTab = 'files'; renderCollateral(id, date); };
      queue.parentNode.appendChild(b);
    }
    input.onchange = function () { if (input.files && input.files.length) addFiles(input.files); input.value = ''; };
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  }

  /* ---------- receipts (design no. 8) ---------- */

  var rcForm = { photo: null, amount: '', purpose: '', paidWith: '', job: '', date: '', scanNote: '' };

  function money(n) { return '$' + Number(n || 0).toFixed(2); }

  function renderReceipts(month) {
    loading('Loading receipts…');
    var today = todayStr();
    Promise.all([api({ action: 'receipts', month: month || today.slice(0, 7) }), loadDay(today).catch(function () { return { appointments: [] }; })]).then(function (res) {
      var d = res[0], appts = (res[1].appointments || []).filter(function (a) { return a.jr; });
      state.user = d.user || state.user;
      rcCache = { d: d, appts: appts };
      drawReceipts(d, appts);
    }, function (err) { showError(err, function () { renderReceipts(month); }); });
  }

  var rcCache = null;
  function drawReceipts(d, appts) {
    var today = todayStr();
    (function () {
      var list = d.receipts, total = 0, own = 0;
      list.forEach(function (r) { total += r.amount; if (r.paidWith === 'Personally paid') own += r.amount; });
      var monthLabel = new Date(d.month + '-01T12:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      if (!rcForm.date) rcForm.date = today;

      var body = '<section class="hero rc-hero"><span class="small" style="font-weight:700">' + esc(monthLabel) + (d.locked ? ' · sent to accounts' : '') + '</span><h1>My work receipts</h1>' +
        '<div class="rc-stats"><div><b>' + list.length + '</b><span>receipts</span></div><div><b>' + money(total) + '</b><span>total spend</span></div><div><b>' + money(own) + '</b><span>to reimburse</span></div></div></section>';

      body += '<section class="section stack" style="gap:8px">' + (list.length ? list.map(function (r) {
        return '<div class="rc-item"><span class="rc-icon">' + I.receipt + '</span><span class="rc-text"><b>' + esc(r.purpose) + '</b><span>' +
          esc(shortDate(r.date) + ' · ' + (r.paidWith === 'Personally paid' ? 'Paid myself' : 'Work card') + ' · ' + r.job) + '</span></span>' +
          '<b class="rc-amt">' + money(r.amount) + '</b>' +
          (r.photoUrl ? '<a class="icon-btn" href="' + esc(r.photoUrl) + '" target="_blank" rel="noopener" aria-label="Open receipt photo">' + I.ext + '</a>' : '') +
          (d.locked ? '' : '<button type="button" class="icon-btn rc-del" data-id="' + esc(r.id) + '" data-date="' + esc(r.date) + '" aria-label="Remove receipt: ' + esc(r.purpose) + '">' + I.x + '</button>') + '</div>';
      }).join('') : '<p class="muted small" style="margin:0">No receipts yet this month.</p>') + '</section>';

      var jobOpts = '<option value="">General / van</option>' + appts.map(function (a) {
        return '<option value="' + esc(a.id) + '"' + (rcForm.job === a.id ? ' selected' : '') + '>JR#' + esc(a.jr) + ' · ' + esc(a.title) + '</option>';
      }).join('');
      body += '<section class="section stack rc-form" style="gap:16px;max-width:560px"><h2>Add a receipt</h2>' +
        '<div class="field"><span class="lbl">Receipt photo <span class="req">*</span></span>' +
          (rcForm.photo
            ? '<div class="rc-photo">' + (rcForm.photo.thumb ? '<img src="' + rcForm.photo.thumb + '" alt="Receipt photo">' : '<span class="rc-pdf">PDF</span>') +
              '<span class="stack" style="gap:2px;flex:1"><b>Photo added</b><span class="small muted" id="rcScan">' + esc(rcForm.scanNote) + '</span></span>' +
              '<button type="button" class="btn btn-sand" id="rcRetake">Retake</button></div>'
            : '<label class="rc-take" for="rcFile">' + I.camera + '<span>Take photo of receipt</span></label>') +
          '<input type="file" id="rcFile" accept="image/*,application/pdf" hidden></div>' +
        '<div class="field"><label for="rcAmount">Amount, inc. GST <span class="req">*</span></label><input id="rcAmount" inputmode="decimal" placeholder="0.00" value="' + esc(rcForm.amount) + '"></div>' +
        '<div class="field"><label for="rcPurpose">What was it for <span class="req">*</span></label><input id="rcPurpose" placeholder="e.g. fixings from Bunnings, fuel, parking in Mosman" value="' + esc(rcForm.purpose) + '"></div>' +
        '<div class="field"><label for="rcPaid">Paid with <span class="req">*</span></label><select id="rcPaid"><option value="">Choose</option>' +
          '<option value="Work credit card"' + (rcForm.paidWith === 'Work credit card' ? ' selected' : '') + '>Work credit card</option>' +
          '<option value="Personally paid"' + (rcForm.paidWith === 'Personally paid' ? ' selected' : '') + '>Paid myself, reimburse me</option></select></div>' +
        '<div class="field"><label for="rcJob">Job</label><select id="rcJob">' + jobOpts + '</select><span class="small muted">Today\'s jobs. A copy of the photo is saved in that job\'s folder.</span></div>' +
        '<div class="field"><label for="rcDate">Date on the receipt</label><input id="rcDate" type="date" max="' + today + '" value="' + esc(rcForm.date) + '"></div>' +
        '<p class="notice error" id="rcErr" role="alert" hidden></p>' +
        '<button type="button" class="btn btn-dark btn-lg" id="rcAdd">Add receipt</button>' +
        '<span class="small muted">Saved straight away to the receipts sheet. Accounts get the month\'s receipts on the 1st.</span></section>';

      body += '<div style="height:32px"></div>';
      app.innerHTML = wide() ? shell('me', null, '<div class="pane-solo">' + body + '</div>') : topbar({ back: '#/me', backLabel: 'Me' }) + '<main>' + body + '</main>' + tabbar('me');
      bindReceipts(appts);
    })();
  }

  function bindReceipts(appts) {
    function keep() {
      ['Amount', 'Purpose', 'Paid', 'Job', 'Date'].forEach(function (k) { var el = document.getElementById('rc' + k); if (el) rcForm[{ Amount: 'amount', Purpose: 'purpose', Paid: 'paidWith', Job: 'job', Date: 'date' }[k]] = el.value; });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.rc-form input, .rc-form select'), function (el) { el.addEventListener('input', keep); el.addEventListener('change', keep); });
    var file = document.getElementById('rcFile');
    var take = document.querySelector('.rc-take');
    var retake = document.getElementById('rcRetake');
    if (retake) retake.onclick = function () { file.click(); };
    file.onchange = function () {
      var f = file.files && file.files[0];
      if (!f) return;
      keep();
      var isPdf = /pdf/.test(f.type);
      (isPdf ? Promise.resolve({ blob: f, thumb: '' }) : shrinkImage(f)).then(function (img) {
        return toBase64(img.blob).then(function (b64) {
          rcForm.photo = { data: b64, mime: isPdf ? 'application/pdf' : 'image/jpeg', thumb: img.thumb };
          rcForm.scanNote = isPdf ? 'Type in the total from the receipt.' : 'Reading the total from the receipt…';
          renderReceiptsKeepScroll();
          if (isPdf) return;
          apiPost({ action: 'receiptScan', data: b64, mime: 'image/jpeg' }).then(function (r) {
            if (!rcForm.photo || rcForm.photo.data !== b64) return;
            if (r.found) {
              if (!rcForm.amount) { rcForm.amount = r.amount; rcForm.scanNote = 'Amount read from the photo. Check it matches the receipt.'; }
              else rcForm.scanNote = Number(rcForm.amount) === Number(r.amount) ? 'Matches the receipt total.' : 'The receipt looks like $' + r.amount + ', but $' + rcForm.amount + ' is entered. Check which is right.';
            } else rcForm.scanNote = 'Couldn\'t read the total' + (r.error ? ' (' + r.error + ')' : '') + '. Please type it in.';
            var a = document.getElementById('rcAmount'); if (a && !a.value) a.value = rcForm.amount;
            var n = document.getElementById('rcScan'); if (n) n.textContent = rcForm.scanNote;
          }, function () { var n = document.getElementById('rcScan'); rcForm.scanNote = 'Couldn\'t read the total. Please type it in.'; if (n) n.textContent = rcForm.scanNote; });
        });
      }, function () { alert('That photo couldn\'t be read. Try taking it again.'); });
    };
    if (take) take.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    if (take) take.setAttribute('tabindex', '0');

    document.getElementById('rcAdd').onclick = function () {
      keep();
      var err = document.getElementById('rcErr'), btn = this;
      var miss = [];
      if (!rcForm.photo) miss.push('a photo');
      if (!(Number(String(rcForm.amount).replace(/[^\d.]/g, '')) > 0)) miss.push('the amount');
      if (!rcForm.purpose.trim()) miss.push('what it was for');
      if (!rcForm.paidWith) miss.push('how it was paid');
      if (miss.length) { err.textContent = 'Add ' + miss.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.'; err.hidden = false; return; }
      var a = appts.filter(function (x) { return x.id === rcForm.job; })[0];
      btn.disabled = true; btn.textContent = 'Saving…'; err.hidden = true;
      apiPost({ action: 'receiptAdd', data: rcForm.photo.data, mime: rcForm.photo.mime, amount: rcForm.amount, purpose: rcForm.purpose.trim(), paidWith: rcForm.paidWith,
        date: rcForm.date, jr: a ? a.jr : '', client: a ? a.title + (a.address ? ', ' + a.address : '') : '', projectFolderUrl: a ? a.projectFolderUrl : '' })
        .then(function () {
          var keepDate = rcForm.date;
          rcForm = { photo: null, amount: '', purpose: '', paidWith: '', job: '', date: keepDate, scanNote: '' };
          renderReceipts();
        }, function (e) { btn.disabled = false; btn.textContent = 'Add receipt'; err.textContent = e.message || 'Couldn\'t save the receipt. Try again.'; err.hidden = false; });
    };

    Array.prototype.forEach.call(document.querySelectorAll('.rc-del'), function (b) {
      b.onclick = function () {
        if (!confirm('Remove this receipt?')) return;
        b.disabled = true;
        apiPost({ action: 'receiptDelete', id: b.getAttribute('data-id'), date: b.getAttribute('data-date') }).then(function () { renderReceipts(); },
          function (e) { b.disabled = false; alert(e.message || 'Couldn\'t remove it.'); });
      };
    });
  }

  function renderReceiptsKeepScroll() { var y = window.scrollY; if (rcCache) drawReceipts(rcCache.d, rcCache.appts); else renderReceipts(); window.scrollTo(0, y); }

  /* ---------- sales flow: site consult, measure, capture on site ---------- */

  var vs = { key: '', data: null };       // the visit currently open
  var ms = { step: 'cat', cat: '', productId: '', supplier: '', item: null, field: '', room: '', supFilter: '' }; // measure flow
  function visitKey(id, date) { return id + '|' + date; }
  function loadVisit(id, date, force) {
    if (!force && vs.key === visitKey(id, date) && vs.data) return Promise.resolve(vs.data);
    return api({ action: 'visit', id: id, date: date }).then(function (d) {
      state.user = d.user || state.user; vs.key = visitKey(id, date); vs.data = d.visit;
      store('fa-visit-' + vs.key, d.visit); // a copy on the phone, so the visit still opens with no signal
      return d.visit;
    }, function (err) {
      var saved = !err.auth && store('fa-visit-' + visitKey(id, date));
      if (!saved) throw err;
      saved.offline = true; vs.key = visitKey(id, date); vs.data = saved; return saved;
    });
  }
  function visitHref(id, date, sub) { return '#/' + (sub || 'visit') + '/' + encodeURIComponent(id) + '/' + date; }
  function salesPage(body, back) {
    if (wide()) return shell('day', null, '<div class="pane-solo sv-page">' + body + '</div>');
    return topbar({ back: back[0], backLabel: back[1] }) + '<main class="sv-page">' + body + '</main>' + tabbar('day');
  }
  function measuresText(m, prod) {
    var parts = [];
    ['width', 'track_width'].forEach(function (k) { if (m[k]) parts.push(m[k]); });
    ['drop', 'projection', 'height'].forEach(function (k) { if (m[k]) parts.push(m[k]); });
    var s = parts.join(' × ');
    if (m.panels) s += (s ? ' · ' : '') + m.panels + ' panels';
    return s;
  }

  /* Site consult */
  function renderVisit(id, date) {
    loading('Opening the visit…');
    loadVisit(id, date, true).then(function (v) { drawVisit(id, date, v); }, function (e) { showError(e, function () { renderVisit(id, date); }); });
  }
  function drawVisit(id, date, v) {
    var a = v.appointment;
    var sms = a.phone ? 'sms:' + String(a.phone).replace(/[^\d+]/g, '') + (/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent('Hi, this is ' + firstName(state.user && state.user.name) + ' from Blindmaster. I\'m on my way and should be with you soon.') : '';
    var body = '<section class="hero"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="tag tag-dark">' + esc(a.type) + '</span><b class="small">' + esc(a.allDay ? 'All day' : a.startLabel + ' – ' + a.endLabel) + '</b>' +
      (refLabel(a) ? '<span class="small" style="margin-left:auto;font-weight:700">' + esc(refLabel(a)) + '</span>' : '') + '</div>' +
      '<h1>' + esc(a.customer || a.title) + '</h1>' + (a.address ? '<p style="margin:0;font-weight:500">' + esc(a.address) + '</p>' : '') + '</section>';
    body += '<div class="actions" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
      (a.address ? '<a class="btn btn-dark action" href="' + mapsDir(a.address) + '" target="_blank" rel="noopener">' + I.nav + 'Navigate</a>' : '<span class="btn btn-sand action" style="opacity:.55">' + I.nav + 'No address</span>') +
      (a.phone ? '<a class="btn btn-sand action" href="' + tel(a.phone) + '">' + I.phone + 'Call</a>' : '<span class="btn btn-sand action" style="opacity:.55">' + I.phone + 'Call</span>') +
      (sms ? '<a class="btn btn-sand action" href="' + sms + '">' + I.msg + 'On my way</a>' : '<span class="btn btn-sand action" style="opacity:.55">' + I.msg + 'On my way</span>') + '</div>';
    if (v.offline) body += '<div class="section"><p class="notice" style="margin:0">No signal. Showing the copy saved on this phone. Anything you enter is kept and sends when you\'re back online.</p></div>';
    if (v.problem) body += '<div class="section"><p class="notice error" style="margin:0">' + esc(v.problem) + '</p></div>';
    if (v.folder) body += '<div class="section" style="padding-top:8px"><a class="sv-folder" href="' + esc(v.folder.url) + '" target="_blank" rel="noopener"><span class="sv-ico">' + I.folder + '</span><span class="st-txt"><b>' +
      (v.folder.linked ? 'Opportunity folder' : 'Visit folder') + '</b><span>' + esc(v.folder.linked ? v.folder.name + ' (Collateral)' : 'No opportunity folder linked yet, saving to ' + v.folder.name) + '</span></span>' + I.ext + '</a></div>';
    var enq = [];
    if (a.customer || a.phone) enq.push(['Contact', [a.customer, a.phone].filter(String).join(' · ')]);
    if (a.requirements && a.requirements.length) enq.push(['Interested in', a.requirements.join('; ')]);
    if (a.notes) enq.push(['Notes', a.notes]);
    if (enq.length) body += '<section class="section stack" style="gap:12px"><h2>Enquiry</h2><dl class="dl">' + enq.map(function (d) { return '<dt>' + esc(d[0]) + '</dt><dd style="white-space:pre-line">' + esc(d[1]) + '</dd>'; }).join('') + '</dl></section>';

    // Measure
    body += '<section class="section stack" style="gap:10px"><div class="spread"><h2>Measure</h2><span class="small muted">' + v.items.length + (v.items.length === 1 ? ' item' : ' items') + '</span></div>';
    if (v.items.length) body += v.items.map(function (it) {
      return '<a class="sv-item" href="' + visitHref(id, date, 'measure') + '" data-item="' + esc(it.itemId) + '"><span class="sv-id">' + esc(it.itemId) + '</span><span class="st-txt"><b>' + esc(it.product) + (it.supplier ? ' · ' + esc(it.supplier) : '') + '</b>' +
        '<span>' + esc([it.room, measuresText(it.measures), it.quantity > 1 ? '× ' + it.quantity : ''].filter(String).join(' · ')) + '</span></span>' + (it.photos ? '<span class="small muted">' + it.photos + ' photo' + (it.photos === 1 ? '' : 's') + '</span>' : '') + '</a>';
    }).join('');
    var dft = vaLoad(id, date);
    if (dft && dft.ms && dft.ms.item) body += '<a class="sv-item sv-unsaved" href="' + visitHref(id, date, 'measure') + '" data-resume><span class="sv-id">' + esc(dft.ms.item.itemId || '?') + '</span><span class="st-txt"><b>Not saved yet · tap to finish</b><span>' +
      esc([dft.ms.item.room, measuresText(dft.ms.item.measures || {})].filter(String).join(' · ') || 'Item in progress') + '</span></span></a>';
    body += '<a class="btn btn-dark btn-lg" href="' + visitHref(id, date, 'measure') + '" data-newitem>' + (v.items.length ? 'Measure the next item' : 'Start measuring') + '</a>' +
      (v.sheetUrl ? '<a class="small" style="font-weight:700" href="' + esc(v.sheetUrl) + '" target="_blank" rel="noopener">Open the measure sheet</a>' : '') + '</section>';

    // Capture
    var cap = function (tab, icon, label) { return '<a class="sv-cap" href="' + visitHref(id, date, 'capture') + '/' + tab + '">' + icon + '<b>' + label + '</b></a>'; };
    body += '<section class="section stack" style="gap:10px"><h2>Capture on site</h2><p class="small muted" style="margin:0">Saves to the opportunity\'s Collateral: Notes, Sketches, Photos and Videos.</p>' +
      '<div class="sv-caps">' + cap('notes', I.doc, 'Notes') + cap('sketch', I.pencil, 'Sketch') + cap('photos', I.camera, 'Photo') + cap('video', I.video, 'Video') + '</div>';
    var counts = {}; v.captures.forEach(function (c) { counts[c.kind] = (counts[c.kind] || 0) + 1; });
    var got = [];
    if (v.notes) got.push('Site notes');
    if (counts.Photos) got.push(counts.Photos + ' photo' + (counts.Photos === 1 ? '' : 's'));
    if (counts.Sketches) got.push(counts.Sketches + ' sketch' + (counts.Sketches === 1 ? '' : 'es'));
    if (counts.Videos) got.push(counts.Videos + ' video' + (counts.Videos === 1 ? '' : 's'));
    if (got.length) body += '<p class="small" style="margin:0"><b>Captured:</b> ' + esc(got.join(' · ')) + '</p>';
    if (dft && dft.notes != null) body += '<p class="small" style="margin:0"><b>Site notes</b> not sent yet. They\'re kept on this phone.</p>';
    if (dft && dft.strokes && dft.strokes.length) body += '<p class="small" style="margin:0"><b>Sketch</b> in progress, not saved yet.</p>';
    body += uqBar(id, date) + '</section>';

    if (a.folderUrl || a.projectFolderUrl) body += '<section class="section"><a class="linkrow" href="#/collateral/' + encodeURIComponent(id) + '/' + date + '">' + I.grid + '<span class="text"><b>Collateral</b><span>Everything in the opportunity folder</span></span>' + I.right + '</a></section>';
    body += '<section class="panel stack" style="margin-top:24px;gap:8px"><div class="spread"><b>Proposal</b><span class="tag tag-light">Coming next</span></div><span class="small">Start a proposal from the costing templates (Umbris, markilux…) using what you\'ve measured.</span></section>';
    body += '<div style="height:32px"></div>';
    app.innerHTML = salesPage(body, ['#/appt/' + encodeURIComponent(id) + '/' + date, 'Appointment']);
    Array.prototype.forEach.call(app.querySelectorAll('[data-item]'), function (el) {
      el.onclick = function (e) { e.preventDefault(); var it = v.items.filter(function (x) { return x.itemId === el.getAttribute('data-item'); })[0]; openItem(id, date, it); };
    });
    var n = app.querySelector('[data-newitem]'); if (n) n.onclick = function (e) {
      e.preventDefault();
      var d = vaLoad(id, date);
      if (d && d.ms && !confirm('Item ' + (d.ms.item.itemId || '') + ' isn\'t saved yet. Discard it and start a new item?')) { ms = d.ms; location.hash = visitHref(id, date, 'measure'); return; }
      vaDrop(id, date, 'ms'); ms = { step: 'cat', room: ms.room || '' }; location.hash = visitHref(id, date, 'measure');
    };
    var rs = app.querySelector('[data-resume]'); if (rs) rs.onclick = function (e) { e.preventDefault(); var d = vaLoad(id, date); if (d && d.ms) { ms = d.ms; ms.restored = false; } location.hash = visitHref(id, date, 'measure'); };
    uqBars();
  }

  /* Measure */
  function cfgProduct(cfg, pid) { return cfg.products.filter(function (p) { return p.id === pid; })[0]; }
  function measureFields(prod) {
    return String(prod.measures || 'Width, Drop').split(/,\s*/).map(function (m) {
      var k = m.trim().toLowerCase().replace(/\s+/g, '_');
      return { key: k, label: m.trim(), unit: k === 'panels' ? '' : 'mm' };
    });
  }
  function openItem(id, date, it) {
    var d = vaLoad(id, date);
    if (d && d.ms && d.ms.item && d.ms.originalId !== it.itemId && !confirm('Item ' + (d.ms.item.itemId || '') + ' isn\'t saved yet. Discard it and open ' + it.itemId + '?')) { ms = d.ms; location.hash = visitHref(id, date, 'measure'); if (route().name === 'measure') renderMeasure(id, date); return; }
    ms = { step: 'item', cat: it.cat, productId: it.productId, supplier: it.supplier || '', room: it.room, field: '', originalId: it.itemId,
      item: { itemId: it.itemId, room: it.room, measures: Object.assign({}, it.measures), answers: Object.assign({}, it.answers), photos: it.photos || 0 } };
    location.hash = visitHref(id, date, 'measure');
    if (route().name === 'measure') renderMeasure(id, date);
  }
  function nextItemId(v, room) {
    var p = (String(room || 'Item').match(/[A-Za-z]/) || ['I'])[0].toUpperCase(), n = 1;
    var used = v.items.map(function (x) { return x.itemId.toUpperCase(); });
    while (used.indexOf(p + n) >= 0) n++;
    return p + n;
  }
  function renderMeasure(id, date) {
    var key = visitKey(id, date);
    if (vs.key !== key || !vs.data) { loading('Opening the visit…'); return loadVisit(id, date).then(function () { renderMeasure(id, date); }, function (e) { showError(e, function () { renderMeasure(id, date); }); }); }
    var v = vs.data, cfg = v.config, a = v.appointment, back = visitHref(id, date);
    if (ms.step !== 'item') { var dft = vaLoad(id, date); if (dft && dft.ms && dft.ms.item) { ms = dft.ms; ms.restored = true; return drawItem(id, date); } }
    var head = '<div class="sv-sub"><span>' + esc(a.customer || a.title) + '</span><span>' + v.items.length + ' measured</span></div>';
    if (ms.step === 'cat' || !ms.step) {
      var body = head + '<section class="hero"><span class="small" style="font-weight:700">Item ' + (v.items.length + 1) + '</span><h1>What are you measuring?</h1></section>' +
        '<section class="section ms-cats"><button type="button" class="ms-cat is-dark" data-cat="Indoor">' + I.window + '<b>Indoor</b><span>Blinds, shutters, curtains</span></button>' +
        '<button type="button" class="ms-cat" data-cat="Outdoor">' + I.awning + '<b>Outdoor</b><span>Awnings, screens, louvres</span></button></section>';
      if (v.items.length) body += '<section class="section stack" style="gap:8px"><h2 class="st-h2" style="margin:0">Measured so far · ' + v.items.length + '</h2>' + v.items.map(function (it) {
        return '<button type="button" class="sv-item" data-item="' + esc(it.itemId) + '"><span class="sv-id">' + esc(it.itemId) + '</span><span class="st-txt"><b>' + esc(it.product) + '</b><span>' + esc([it.room, measuresText(it.measures)].filter(String).join(' · ')) + '</span></span></button>';
      }).join('') + '</section>';
      body += '<section class="section"><a class="btn btn-outline btn-lg" href="' + back + '">Finish measuring</a></section><div style="height:24px"></div>';
      app.innerHTML = salesPage(body, [back, 'Visit']);
      Array.prototype.forEach.call(app.querySelectorAll('[data-cat]'), function (b) { b.onclick = function () { ms.cat = b.getAttribute('data-cat'); ms.step = 'product'; ms.supFilter = ''; renderMeasure(id, date); window.scrollTo(0, 0); }; });
      Array.prototype.forEach.call(app.querySelectorAll('[data-item]'), function (b) { b.onclick = function () { openItem(id, date, v.items.filter(function (x) { return x.itemId === b.getAttribute('data-item'); })[0]); }; });
      return;
    }
    if (ms.step === 'product') {
      var prods = cfg.products.filter(function (p) { return p.cat === ms.cat; });
      var sups = cfg.suppliers.filter(function (s) { return cfg.supplierProducts.some(function (sp) { return sp.supplier === s.code && prods.some(function (p) { return p.id === sp.product; }); }); });
      if (ms.supFilter) prods = prods.filter(function (p) { return cfg.supplierProducts.some(function (sp) { return sp.product === p.id && sp.supplier === ms.supFilter; }); });
      var body2 = head + '<div class="section" style="padding-top:12px"><div class="seg" role="group" aria-label="Category">' + ['Indoor', 'Outdoor'].map(function (c) { return '<button type="button" data-cat="' + c + '" aria-pressed="' + (ms.cat === c) + '">' + c + '</button>'; }).join('') + '</div></div>' +
        '<section class="section stack" style="gap:8px;padding-top:16px"><h1>' + esc(ms.cat) + ' product</h1>' +
        (sups.length ? '<div class="ms-chips" role="group" aria-label="Supplier"><button type="button" data-sup="" aria-pressed="' + !ms.supFilter + '">All suppliers</button>' + sups.map(function (s) { return '<button type="button" data-sup="' + esc(s.code) + '" aria-pressed="' + (ms.supFilter === s.code) + '">' + esc(s.name) + '</button>'; }).join('') + '</div>' : '') +
        '</section><section class="section ms-prods">' + prods.map(function (p) {
          return '<button type="button" class="ms-prod" data-prod="' + esc(p.id) + '"><b>' + esc(p.name) + '</b><span>' + esc(p.measures.replace(/,\s*/g, ' · ')) + '</span></button>';
        }).join('') + (prods.length ? '' : '<p class="muted">No products for this supplier.</p>') + '</section>' +
        (cfg.source === 'starter' ? '<p class="small muted section">Starter product list. It switches to the product build sheet once it\'s linked.</p>' : '') + '<div style="height:24px"></div>';
      app.innerHTML = salesPage(body2, [back, 'Visit']);
      var bk = app.querySelector('.back'); if (bk) bk.onclick = function (e) { e.preventDefault(); ms.step = 'cat'; renderMeasure(id, date); };
      Array.prototype.forEach.call(app.querySelectorAll('[data-cat]'), function (b) { b.onclick = function () { ms.cat = b.getAttribute('data-cat'); ms.supFilter = ''; renderMeasure(id, date); }; });
      Array.prototype.forEach.call(app.querySelectorAll('[data-sup]'), function (b) { b.onclick = function () { ms.supFilter = b.getAttribute('data-sup'); renderMeasure(id, date); }; });
      Array.prototype.forEach.call(app.querySelectorAll('[data-prod]'), function (b) {
        b.onclick = function () {
          var p = cfgProduct(cfg, b.getAttribute('data-prod')), room = ms.room || '';
          var sp = cfg.supplierProducts.filter(function (x) { return x.product === p.id; });
          ms = { step: 'item', cat: p.cat, productId: p.id, supplier: ms.supFilter || (sp.length === 1 ? sp[0].supplier : ''), room: room, field: measureFields(p)[0].key, originalId: '',
            item: { itemId: nextItemId(v, room), room: room, measures: {}, answers: {}, photos: 0 } };
          renderMeasure(id, date); window.scrollTo(0, 0);
        };
      });
      return;
    }
    drawItem(id, date);
  }

  function qOptions(q, cfg) {
    var o = String(q.options || '');
    var m = o.match(/^list:\s*(.+)$/i);
    if (m) return (cfg.lists[m[1].trim()] || []).slice();
    return o ? o.split(/\s*,\s*/).filter(String) : [];
  }
  function qShown(q, ans) {
    var s = String(q.showIf || '').trim();
    if (!s) return true;
    var m = s.match(/^(\w+)\s*(!=|=)\s*(.+)$/);
    if (!m) return true;
    var val = String(ans[m[1].toLowerCase()] == null ? '' : ans[m[1].toLowerCase()]).toLowerCase(), want = m[3].trim().toLowerCase();
    var hit = want.split(/\s*\|\s*/).indexOf(val) >= 0;
    return m[2] === '=' ? hit : !hit;
  }
  function itemQuestions(cfg) {
    var common = cfg.common.filter(function (q) { return q.field !== 'room' && q.field !== 'item_id' && (q.appliesTo === 'All' || !q.appliesTo || q.appliesTo === ms.cat); });
    var prod = cfg.questions.filter(function (q) { return q.product === ms.productId && (!q.supplier || q.supplier === ms.supplier); });
    return { common: common, prod: prod };
  }
  function qHtml(q, ans, cfg) {
    var val = ans[q.field] != null ? String(ans[q.field]) : '';
    var lab = '<span class="ms-qlab">' + esc(q.label) + (q.required ? ' <span class="req">*</span>' : '') + (q.unit && q.type === 'number' ? ' <span class="muted">(' + esc(q.unit) + ')</span>' : '') + '</span>';
    if (q.type === 'choice') {
      var opts = qOptions(q, cfg);
      if (opts.length <= 4) return '<div class="ms-q" data-q="' + esc(q.field) + '">' + lab + '<div class="ms-opts">' + opts.map(function (o) { return '<button type="button" data-ans="' + esc(q.field) + '" data-val="' + esc(o) + '" aria-pressed="' + (val === o) + '">' + esc(o) + '</button>'; }).join('') + '</div></div>';
      return '<label class="ms-q" data-q="' + esc(q.field) + '">' + lab + '<select data-input="' + esc(q.field) + '"><option value="">Choose</option>' + opts.map(function (o) { return '<option' + (val === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
    }
    if (q.type === 'yes-no') return '<div class="ms-q" data-q="' + esc(q.field) + '">' + lab + '<div class="ms-opts">' + ['Yes', 'No'].map(function (o) { return '<button type="button" data-ans="' + esc(q.field) + '" data-val="' + o + '" aria-pressed="' + (val === o) + '">' + o + '</button>'; }).join('') + '</div></div>';
    if (q.type === 'number') {
      if (q.field === 'quantity' || (q.max != null && q.max <= 50)) return '<div class="ms-q ms-q-row" data-q="' + esc(q.field) + '">' + lab + '<div class="ms-step"><button type="button" data-stepq="' + esc(q.field) + '" data-d="-1" aria-label="One less">−</button><b>' + esc(val || '0') + '</b><button type="button" data-stepq="' + esc(q.field) + '" data-d="1" aria-label="One more">+</button></div></div>';
      return '<label class="ms-q" data-q="' + esc(q.field) + '">' + lab + '<input inputmode="decimal" data-input="' + esc(q.field) + '" value="' + esc(val) + '"></label>';
    }
    if (q.type === 'photo') return '<div class="ms-q">' + lab + '<span class="small muted">Use "Photo for this item" below.</span></div>';
    return '<label class="ms-q" data-q="' + esc(q.field) + '">' + lab + '<input data-input="' + esc(q.field) + '" value="' + esc(val) + '"></label>';
  }
  function limitsFor(cfg) {
    var p = cfgProduct(cfg, ms.productId) || {}, sp = cfg.supplierProducts.filter(function (x) { return x.product === ms.productId && x.supplier === ms.supplier; })[0] || {};
    var pick = function (a, b) { return a != null ? a : b; };
    return { minW: pick(sp.minW, p.minW), maxW: pick(sp.maxW, p.maxW), minD: pick(sp.minD, p.minD), maxD: pick(sp.maxD, p.maxD) };
  }
  function measureWarnings(cfg) {
    var L = limitsFor(cfg), m = ms.item.measures, out = [], p = cfgProduct(cfg, ms.productId) || {};
    var w = Number(m.width || m.track_width || 0), d = Number(m.drop || m.projection || 0);
    if (w && L.maxW && w > L.maxW) out.push('Width ' + w + ' mm is over ' + L.maxW + ' mm, the largest ' + p.name.toLowerCase() + ' made in one piece. Split it, or check with the office.');
    if (w && L.minW && w < L.minW) out.push('Width ' + w + ' mm is under the ' + L.minW + ' mm minimum.');
    if (d && L.maxD && d > L.maxD) out.push((m.projection ? 'Projection ' : 'Drop ') + d + ' mm is over the ' + L.maxD + ' mm maximum.');
    if (d && L.minD && d < L.minD) out.push((m.projection ? 'Projection ' : 'Drop ') + d + ' mm is under the ' + L.minD + ' mm minimum.');
    return out;
  }
  function drawItem(id, date) {
    var v = vs.data, cfg = v.config, prod = cfgProduct(cfg, ms.productId), it = ms.item, back = visitHref(id, date);
    if (!prod) { ms.step = 'cat'; return renderMeasure(id, date); }
    var fields = measureFields(prod);
    if (!ms.field) ms.field = fields[0].key;
    var Q = itemQuestions(cfg);
    // defaults once
    Q.common.concat(Q.prod).forEach(function (q) { if (it.answers[q.field] == null && q.def) it.answers[q.field] = q.def; });
    var rooms = (cfg.lists.Rooms || []).slice();
    if (it.room && rooms.indexOf(it.room) < 0) rooms.push(it.room);
    var sps = cfg.supplierProducts.filter(function (x) { return x.product === prod.id; });
    var supName = function (c) { var s = cfg.suppliers.filter(function (x) { return x.code === c; })[0]; return s ? s.name : c; };
    var body = '<div class="sv-sub"><span>' + esc(v.appointment.customer || v.appointment.title) + '</span><span>' + v.items.length + ' measured</span></div>' +
      '<section class="section stack ms-top"><div class="spread" style="align-items:flex-end;gap:12px"><div class="stack" style="gap:2px"><span class="small muted" style="font-weight:700">' + esc(prod.cat) + (ms.originalId ? ' · editing ' + esc(ms.originalId) : ' · item ' + (v.items.length + 1)) + '</span><h1>' + esc(prod.name) + '</h1></div>' +
      '<label class="ms-idbox">Item ID<input id="msId" value="' + esc(it.itemId) + '" maxlength="8" autocapitalize="characters"></label></div>' +
      (ms.restored ? '<p class="notice" style="margin:0">Picked up where you left off. This item isn\'t saved to the measure sheet until you tap Save.</p>' : '') +
      '<div class="ms-rooms" role="group" aria-label="Room">' + rooms.map(function (r) { return '<button type="button" data-room="' + esc(r) + '" aria-pressed="' + (it.room === r) + '">' + esc(r) + '</button>'; }).join('') + '<button type="button" data-room="+">+ Room</button></div></section>';
    if (sps.length) body += '<section class="section stack" style="gap:8px"><span class="ms-qlab">Supplier</span><div class="ms-opts">' + sps.map(function (s) { return '<button type="button" data-supplier="' + esc(s.supplier) + '" aria-pressed="' + (ms.supplier === s.supplier) + '">' + esc(supName(s.supplier)) + (s.range ? ' · ' + esc(s.range) : '') + '</button>'; }).join('') + '</div></section>';
    body += '<section class="section stack" style="gap:10px"><h2 class="st-h2" style="margin:0">1 · Measurements</h2><div class="ms-meas" style="grid-template-columns:repeat(' + Math.min(fields.length, 3) + ',minmax(0,1fr))">' + fields.map(function (f) {
      var val = it.measures[f.key];
      return '<button type="button" data-field="' + f.key + '" aria-pressed="' + (ms.field === f.key) + '"><span>' + esc(f.label.toUpperCase()) + '</span><b>' + (val != null && val !== '' ? esc(val) : '–') + (f.unit ? '<small> ' + f.unit + '</small>' : '') + '</b></button>';
    }).join('') + '</div><div id="msWarn">' + measureWarnings(cfg).map(function (w) { return '<p class="notice error" role="alert" style="margin:0 0 6px">' + esc(w) + '</p>'; }).join('') + '</div>' +
      '<div class="ms-pad" role="group" aria-label="Number pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(function (k) { return '<button type="button" data-key="' + k + '" aria-label="' + (k === 'C' ? 'Clear' : k === '⌫' ? 'Delete' : k) + '">' + k + '</button>'; }).join('') + '</div></section>';
    body += '<section class="section stack" style="gap:14px"><h2 class="st-h2" style="margin:0">2 · Every item</h2>' + Q.common.filter(function (q) { return qShown(q, it.answers); }).map(function (q) { return qHtml(q, it.answers, cfg); }).join('') + '</section>';
    var pq = Q.prod.filter(function (q) { return qShown(q, it.answers); });
    if (pq.length) body += '<section class="section stack" style="gap:14px"><h2 class="st-h2" style="margin:0">3 · ' + esc(prod.name) + '</h2>' + pq.map(function (q) { return qHtml(q, it.answers, cfg); }).join('') + '</section>';
    body += '<section class="section stack" style="gap:8px"><label class="btn btn-sand btn-lg" for="msPhoto">' + I.camera + 'Photo for ' + esc(it.itemId) + (it.photos ? ' · ' + it.photos + ' added' : '') + '</label><input type="file" id="msPhoto" accept="image/*" capture="environment" hidden><span class="small muted" id="msPhotoNote">Saved to Collateral › Photos as "' + esc(it.itemId + ' ' + (it.room || '') + ' ' + prod.name).replace(/\s+/g, ' ') + '".</span>' + uqBar(id, date) + '</section>';
    body += '<p class="notice error section" id="msErr" role="alert" hidden style="margin:16px 16px 0"></p>' +
      '<div class="ms-save"><button type="button" class="btn btn-outline btn-lg" id="msDone">Save · done</button><button type="button" class="btn btn-dark btn-lg" id="msNext">Save · next item</button></div>' +
      (ms.originalId ? '<div class="section"><button type="button" class="link-btn" id="msDel">Delete ' + esc(ms.originalId) + '</button></div>' : '') + '<div style="height:24px"></div>';
    var y = window.scrollY;
    app.innerHTML = salesPage(body, [back, 'Visit']);
    window.scrollTo(0, y);
    var bk = app.querySelector('.back'); if (bk) bk.onclick = function (e) { e.preventDefault(); if (confirm('Leave this item without saving?')) { vaDrop(id, date, 'ms'); ms.step = ms.originalId ? 'cat' : 'product'; renderMeasure(id, date); } };
    bindItem(id, date, fields);
    vaSaveMs(id, date); uqBars();
  }
  function bindItem(id, date, fields) {
    var v = vs.data, cfg = v.config, it = ms.item, redraw = function () { drawItem(id, date); };
    var $ = function (s) { return app.querySelector(s); }, keep = function () { vaSaveMs(id, date); };
    vaFlush = keep;
    $('#msId').oninput = function () { it.itemId = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); keep(); };
    Array.prototype.forEach.call(app.querySelectorAll('[data-room]'), function (b) {
      b.onclick = function () {
        var r = b.getAttribute('data-room');
        if (r === '+') { r = (prompt('Room name') || '').trim(); if (!r) return; cfg.lists.Rooms = (cfg.lists.Rooms || []).concat([r]); }
        var autoId = !ms.originalId && it.itemId === nextItemId(v, it.room);
        it.room = r; ms.room = r;
        if (autoId) it.itemId = nextItemId(v, r);
        redraw();
      };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-supplier]'), function (b) { b.onclick = function () { ms.supplier = ms.supplier === b.getAttribute('data-supplier') ? '' : b.getAttribute('data-supplier'); redraw(); }; });
    Array.prototype.forEach.call(app.querySelectorAll('[data-field]'), function (b) { b.onclick = function () { ms.field = b.getAttribute('data-field'); redraw(); }; });
    Array.prototype.forEach.call(app.querySelectorAll('[data-key]'), function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-key'), cur = String(it.measures[ms.field] == null ? '' : it.measures[ms.field]);
        if (k === 'C') cur = ''; else if (k === '⌫') cur = cur.slice(0, -1); else if (cur.length < 5) cur = (cur === '0' ? '' : cur) + k;
        if (cur === '') delete it.measures[ms.field]; else it.measures[ms.field] = Number(cur);
        var btn = app.querySelector('[data-field="' + ms.field + '"] b'), f = fields.filter(function (x) { return x.key === ms.field; })[0];
        if (btn) btn.innerHTML = (cur || '–') + (f && f.unit ? '<small> ' + f.unit + '</small>' : '');
        $('#msWarn').innerHTML = measureWarnings(cfg).map(function (w) { return '<p class="notice error" role="alert" style="margin:0 0 6px">' + esc(w) + '</p>'; }).join('');
        keep();
      };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-ans]'), function (b) {
      b.onclick = function () { var f = b.getAttribute('data-ans'), val = b.getAttribute('data-val'); it.answers[f] = it.answers[f] === val ? '' : val; redraw(); };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-input]'), function (el) {
      var f = el.getAttribute('data-input');
      el.onchange = function () { var before = JSON.stringify(it.answers); it.answers[f] = el.value; if (el.tagName === 'SELECT' && JSON.stringify(it.answers) !== before) redraw(); };
      el.oninput = function () { it.answers[f] = el.value; keep(); };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-stepq]'), function (b) {
      b.onclick = function () {
        var f = b.getAttribute('data-stepq'), q = itemQuestions(cfg).common.concat(itemQuestions(cfg).prod).filter(function (x) { return x.field === f; })[0] || {};
        var n = (Number(it.answers[f]) || 0) + Number(b.getAttribute('data-d'));
        if (q.min != null) n = Math.max(q.min, n); if (q.max != null) n = Math.min(q.max, n); n = Math.max(0, n);
        it.answers[f] = String(n); b.parentNode.querySelector('b').textContent = n; keep();
      };
    });
    $('#msPhoto').onchange = function () {
      var file = this.files && this.files[0]; if (!file) return;
      var note = $('#msPhotoNote'), prod = cfgProduct(cfg, ms.productId), inp = this;
      if (uq.ok) {
        note.textContent = 'Saving…';
        var n = (it.photos || 0) + 1;
        return shrinkImage(file).then(function (img) {
          return uqAdd({ id: id, date: date, kind: 'item', mime: 'image/jpeg', name: '', blob: img.blob, extra: { itemId: it.itemId, room: it.room, product: prod.name, n: n } });
        }).then(function () {
          it.photos = n; keep(); inp.value = '';
          note.textContent = 'Photo ' + n + ' saved on this phone. It uploads to Collateral › Photos in the background.';
          var l = app.querySelector('label[for="msPhoto"]'); if (l) l.innerHTML = I.camera + 'Photo for ' + esc(it.itemId) + ' · ' + it.photos + ' added';
        }, function (e) { note.textContent = (e && e.message) || 'Couldn\'t save the photo. Try again.'; });
      }
      note.textContent = 'Uploading…';
      shrinkImage(file).then(function (img) { return toBase64(img.blob); }).then(function (b64) {
        return apiPost({ action: 'visitUpload', id: id, date: date, kind: 'item', data: b64, mime: 'image/jpeg', itemId: it.itemId, room: it.room, product: prod.name, n: (it.photos || 0) + 1 });
      }).then(function (r) { it.photos = (it.photos || 0) + 1; note.textContent = 'Saved as ' + r.file.name + '.'; var l = app.querySelector('label[for="msPhoto"]'); if (l) l.innerHTML = I.camera + 'Photo for ' + esc(it.itemId) + ' · ' + it.photos + ' added'; },
        function (e) { note.textContent = e.message || 'Couldn\'t upload the photo.'; });
    };
    function save(next) {
      var err = $('#msErr'), prod = cfgProduct(cfg, ms.productId), Q = itemQuestions(cfg), miss = [];
      if (!it.itemId) miss.push('an item ID');
      if (!it.room) miss.push('the room');
      fields.forEach(function (f) { if (!it.measures[f.key]) miss.push(f.label.toLowerCase()); });
      Q.common.concat(Q.prod).forEach(function (q) { if (q.required && qShown(q, it.answers) && q.type !== 'photo' && !String(it.answers[q.field] || '').trim()) miss.push(q.label.toLowerCase()); });
      if (miss.length) { err.textContent = 'Still needed: ' + miss.join(', ') + '.'; err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
      var shownQs = Q.common.concat(Q.prod).filter(function (q) { return qShown(q, it.answers); });
      var answers = {}; shownQs.forEach(function (q) { if (it.answers[q.field] != null && it.answers[q.field] !== '') answers[q.field] = it.answers[q.field]; });
      var details = shownQs.filter(function (q) { return answers[q.field] != null && q.field !== 'quantity'; }).map(function (q) { return q.label + ': ' + answers[q.field]; }).join('; ');
      var btns = app.querySelectorAll('.ms-save button'); Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
      err.hidden = true;
      apiPost({ action: 'measureSave', id: id, date: date, originalId: ms.originalId || '', item: { itemId: it.itemId, room: it.room, cat: prod.cat, product: prod.name, productId: prod.id, supplier: ms.supplier,
        measures: it.measures, answers: answers, details: details, photos: it.photos || 0 } }).then(function (r) {
        v.items = r.items; v.sheetUrl = r.sheetUrl; store('fa-visit-' + visitKey(id, date), v);
        vaDrop(id, date, 'ms');
        var room = it.room;
        if (next) { ms = { step: 'cat', room: room }; renderMeasure(id, date); window.scrollTo(0, 0); }
        else { ms = { step: 'cat', room: room }; location.hash = visitHref(id, date); }
      }, function (e) { Array.prototype.forEach.call(btns, function (b) { b.disabled = false; }); err.textContent = (e instanceof TypeError || !navigator.onLine ? 'No signal right now. The item is kept on this phone; tap Save again when you have signal.' : e.message || 'Couldn\'t save. Try again.'); err.hidden = false; });
    }
    $('#msNext').onclick = function () { save(true); };
    $('#msDone').onclick = function () { save(false); };
    var del = $('#msDel');
    if (del) del.onclick = function () {
      if (!confirm('Delete item ' + ms.originalId + '?')) return;
      apiPost({ action: 'measureDelete', id: id, date: date, itemId: ms.originalId }).then(function (r) { v.items = r.items; vaDrop(id, date, 'ms'); ms = { step: 'cat', room: it.room }; renderMeasure(id, date); }, function (e) { alert(e.message); });
    };
  }

  /* Capture on site */
  var cap = { tab: 'notes', strokes: [], tool: 'pen', notesTimer: null };
  function renderCapture(id, date, tab) {
    cap.tab = tab || cap.tab || 'notes';
    var key = visitKey(id, date);
    if (vs.key !== key || !vs.data) { loading('Opening the visit…'); return loadVisit(id, date).then(function () { renderCapture(id, date, cap.tab); }, function (e) { showError(e, function () { renderCapture(id, date, tab); }); }); }
    var v = vs.data, a = v.appointment, back = visitHref(id, date), dft = vaLoad(id, date) || {};
    if (cap.key !== key) { cap.key = key; cap.strokes = (dft.strokes || []).slice(); }
    var tabs = [['notes', 'Notes', 'Notes'], ['sketch', 'Sketch', 'Sketches'], ['photos', 'Photos', 'Photos'], ['video', 'Video', 'Videos']];
    var cur = tabs.filter(function (t) { return t[0] === cap.tab; })[0] || tabs[0];
    var body = '<div class="sv-sub"><span>' + esc(a.customer || a.title) + '</span><span>' + esc(refLabel(a)) + '</span></div>' +
      '<nav class="cp-tabs" aria-label="Capture type">' + tabs.map(function (t) { return '<a href="' + visitHref(id, date, 'capture') + '/' + t[0] + '" aria-current="' + (t[0] === cap.tab ? 'page' : 'false') + '">' + t[1] + '</a>'; }).join('') + '</nav>';
    if (cap.tab === 'notes') {
      body += '<section class="section stack" style="gap:10px"><label for="cpNotes"><b>Site notes</b></label><textarea id="cpNotes" class="cp-notes" rows="14" placeholder="Orientation, fixing surfaces, what the client wants…">' + esc(dft.notes != null ? dft.notes : (v.notes || '')) + '</textarea>' +
        '<div class="st-grid2">' + (speechSupported() ? '<button type="button" class="btn btn-outline" id="cpMic" aria-pressed="false">' + I.mic + 'Dictate</button>' : '<span></span>') +
        '<button type="button" class="btn btn-dark" id="cpSave">Save notes</button></div><span class="small muted" id="cpState">' + (dft.notes != null ? 'Kept on this phone, sending…' : v.notes ? 'Saved' : 'Saves as you type') + '</span></section>';
    } else if (cap.tab === 'sketch') {
      body += '<section class="section stack" style="gap:10px"><div class="spread"><b>Sketch</b><span class="small muted">Draw with your finger or a stylus</span></div>' +
        '<canvas id="cpCanvas" class="cp-canvas"></canvas><div class="cp-tools" role="toolbar" aria-label="Sketch tools">' +
        '<button type="button" data-tool="pen" aria-pressed="' + (cap.tool === 'pen') + '" aria-label="Pen">' + I.pencil + '</button>' +
        '<button type="button" data-tool="line" aria-pressed="' + (cap.tool === 'line') + '" aria-label="Straight line">／</button>' +
        '<button type="button" data-tool="text" aria-pressed="' + (cap.tool === 'text') + '" aria-label="Text">T</button>' +
        '<button type="button" id="cpUndo" aria-label="Undo">↶</button><button type="button" id="cpClear" aria-label="Clear">✕</button></div>' +
        '<button type="button" class="btn btn-dark btn-lg" id="cpSketchSave">Save sketch</button><span class="small muted" id="cpState"></span></section>';
    } else if (cap.tab === 'photos') {
      var ph = v.captures.filter(function (c) { return c.kind === 'Photos'; });
      body += '<section class="section stack" style="gap:12px"><div class="st-grid2"><label class="btn btn-dark btn-lg" for="cpCam">' + I.camera + 'Take photo</label><label class="btn btn-outline btn-lg" for="cpLib">From library</label></div>' +
        '<input type="file" id="cpCam" accept="image/*" capture="environment" hidden><input type="file" id="cpLib" accept="image/*" multiple hidden><span class="small muted" id="cpState"></span>' +
        '<div class="cp-grid">' + ph.map(function (p) { return '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" title="' + esc(p.name) + '">' + (p.thumb ? '<img src="' + p.thumb + '" alt="' + esc(p.name) + '">' : '<span>' + esc(p.name) + '</span>') + '</a>'; }).join('') + '</div>' +
        (ph.length ? '' : '<p class="small muted" style="margin:0">No photos yet.</p>') + '</section>';
    } else {
      var vids = v.captures.filter(function (c) { return c.kind === 'Videos'; });
      body += '<section class="section stack" style="gap:12px"><label class="btn btn-dark btn-lg" for="cpVid">' + I.video + 'Record a video</label><input type="file" id="cpVid" accept="video/*" capture="environment" hidden>' +
        '<span class="small muted" id="cpState">Talk through the site as you film. Keep it under a minute or two (30 MB limit).</span>' +
        vids.map(function (x) { return '<a class="linkrow" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + I.video + '<span class="text"><b>' + esc(x.name) + '</b><span>Video</span></span>' + I.ext + '</a>'; }).join('') + '</section>';
    }
    if (cap.tab === 'photos' || cap.tab === 'video') body += '<div class="section" style="padding-top:0">' + uqBar(id, date) + '</div>';
    body += '<div class="cp-foot">' + I.folder + '<span>Saving to <b>' + esc((v.folder ? v.folder.name : 'the visit folder') + ' › ' + cur[2]) + '</b></span></div><div style="height:24px"></div>';
    app.innerHTML = salesPage(body, [back, 'Visit']);
    bindCapture(id, date);
    uqBars();
  }
  function capUploadFiles(id, date, files, kind) {
    var st = document.getElementById('cpState'), v = vs.data, done = 0;
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    if (uq.ok) {
      if (st) st.textContent = 'Saving on this phone…';
      return list.reduce(function (p, file) {
        return p.then(function () {
          var isImg = /^image\//.test(file.type);
          return (isImg ? shrinkImage(file).then(function (img) { return img.blob; }) : Promise.resolve(file)).then(function (blob) {
            return uqAdd({ id: id, date: date, kind: kind, mime: isImg ? 'image/jpeg' : (file.type || 'video/mp4'), name: file.name || '', blob: blob });
          }).then(function () { done++; });
        });
      }, Promise.resolve()).then(function () {
        if (st) st.textContent = done + (done === 1 ? ' file' : ' files') + ' saved on this phone. Uploading in the background, so you can carry on.';
      }, function (e) { if (st) st.textContent = (done ? done + ' saved. ' : '') + ((e && e.message) || 'Couldn\'t save on this phone.') + ' Try again.'; });
    }
    var run = list.reduce(function (p, file, i) {
      return p.then(function () {
        if (st) st.textContent = 'Uploading ' + (i + 1) + ' of ' + list.length + '…';
        var isImg = /^image\//.test(file.type);
        return (isImg ? shrinkImage(file).then(function (img) { return img.blob; }) : Promise.resolve(file)).then(toBase64).then(function (b64) {
          return apiPost({ action: 'visitUpload', id: id, date: date, kind: kind, data: b64, mime: isImg ? 'image/jpeg' : file.type, name: file.name });
        }).then(function () { done++; });
      });
    }, Promise.resolve());
    run.then(function () { if (st) st.textContent = done + ' saved.'; return loadVisit(id, date, true); }).then(function () { if (route().name === 'capture') renderCapture(id, date, cap.tab); },
      function (e) { if (st) st.textContent = (e && e.message) || 'Upload failed. Try again.'; });
  }
  function bindCapture(id, date) {
    var v = vs.data, st = document.getElementById('cpState');
    if (cap.tab === 'notes') {
      var ta = document.getElementById('cpNotes');
      var saveNotes = function (bg) {
        clearTimeout(cap.notesTimer);
        var text = ta.value;
        if (!bg) st.textContent = 'Saving…';
        return apiPost({ action: 'visitNotes', id: id, date: date, notes: text }, { keepalive: !!bg && text.length < 60000 }).then(function () {
          v.notes = text; var d = vaLoad(id, date); if (d && d.notes === text) vaDrop(id, date, 'notes');
          store('fa-visit-' + visitKey(id, date), v);
          if (document.body.contains(st)) st.textContent = 'Saved ' + hhmm(new Date());
        }, function (e) { if (document.body.contains(st)) st.textContent = (e instanceof TypeError || !navigator.onLine ? 'No signal. Kept on this phone, it sends when you\'re back online.' : e.message || 'Couldn\'t save. Kept on this phone.'); });
      };
      ta.oninput = function () { vaSave(id, date, { notes: ta.value }); st.textContent = 'Kept on this phone · sending…'; clearTimeout(cap.notesTimer); cap.notesTimer = setTimeout(saveNotes, 1500); };
      vaFlush = function () { var d = vaLoad(id, date); if (d && d.notes != null) saveNotes(true); };
      if (dftNotes(id, date) != null) saveNotes();
      document.getElementById('cpSave').onclick = function () { saveNotes(); };
      var mic = document.getElementById('cpMic');
      if (mic) mic.onclick = function () { toggleDictation(mic, ta, function () { ta.oninput(); }); };
    } else if (cap.tab === 'sketch') {
      var cv = document.getElementById('cpCanvas'), ctx = cv.getContext('2d');
      var ratio = window.devicePixelRatio || 1, w = cv.clientWidth, h = Math.round(w * 1.25);
      cv.style.height = h + 'px'; cv.width = w * ratio; cv.height = h * ratio; ctx.scale(ratio, ratio);
      function paint() {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#EEECE7'; ctx.lineWidth = 1;
        for (var x = 20; x < w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (var y = 20; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.strokeStyle = '#404141'; ctx.fillStyle = '#404141'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.font = '700 15px Manrope, sans-serif';
        cap.strokes.forEach(function (s) {
          if (s.type === 'text') { ctx.fillText(s.text, s.x, s.y); return; }
          ctx.beginPath(); s.pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
        });
      }
      paint();
      var drawing = null;
      var pos = function (e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener('pointerdown', function (e) {
        e.preventDefault(); var p = pos(e);
        if (cap.tool === 'text') { var t = prompt('Text'); if (t) { cap.strokes.push({ type: 'text', text: t, x: p[0], y: p[1] }); paint(); keepSketch(); } return; }
        drawing = { type: cap.tool, pts: [p] }; cap.strokes.push(drawing); cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', function (e) {
        if (!drawing) return; e.preventDefault(); var p = pos(e);
        if (drawing.type === 'line') drawing.pts = [drawing.pts[0], p]; else drawing.pts.push(p);
        paint();
      });
      var keepSketch = function () { if (cap.strokes.length) vaSave(id, date, { strokes: cap.strokes }); else vaDrop(id, date, 'strokes'); };
      vaFlush = keepSketch;
      ['pointerup', 'pointercancel'].forEach(function (ev) { cv.addEventListener(ev, function () { if (drawing) keepSketch(); drawing = null; }); });
      cv.style.touchAction = 'none';
      Array.prototype.forEach.call(app.querySelectorAll('[data-tool]'), function (b) { b.onclick = function () { cap.tool = b.getAttribute('data-tool'); Array.prototype.forEach.call(app.querySelectorAll('[data-tool]'), function (x) { x.setAttribute('aria-pressed', x === b); }); }; });
      document.getElementById('cpUndo').onclick = function () { cap.strokes.pop(); paint(); keepSketch(); };
      document.getElementById('cpClear').onclick = function () { if (cap.strokes.length && confirm('Clear the sketch?')) { cap.strokes = []; paint(); keepSketch(); } };
      document.getElementById('cpSketchSave').onclick = function () {
        if (!cap.strokes.length) { st.textContent = 'Draw something first.'; return; }
        var btn = this; btn.disabled = true; st.textContent = 'Saving…';
        var b64 = cv.toDataURL('image/png').split(',')[1];
        apiPost({ action: 'visitUpload', id: id, date: date, kind: 'sketch', data: b64, mime: 'image/png' }).then(function (r) {
          cap.strokes = []; vaDrop(id, date, 'strokes'); paint(); btn.disabled = false; st.textContent = 'Saved as ' + r.file.name + '.'; loadVisit(id, date, true);
        }, function (e) { btn.disabled = false; st.textContent = (e instanceof TypeError || !navigator.onLine ? 'No signal. The sketch is kept on this phone; tap Save again when you have signal.' : e.message || 'Couldn\'t save. Try again.'); });
      };
    } else if (cap.tab === 'photos') {
      document.getElementById('cpCam').onchange = function () { capUploadFiles(id, date, this.files, 'photo'); };
      document.getElementById('cpLib').onchange = function () { capUploadFiles(id, date, this.files, 'photo'); };
    } else {
      document.getElementById('cpVid').onchange = function () {
        var f = this.files && this.files[0]; if (!f) return;
        if (f.size > 30 * 1024 * 1024) { st.textContent = 'That video is over 30 MB. Record a shorter one, or upload it from the Drive app.'; return; }
        capUploadFiles(id, date, [f], 'video');
      };
    }
  }

  /* ---------- staff tools: Me, My to do, Leave, Clock, Team hours ---------- */

  function staffPage(key, body, back) {
    if (wide()) return shell('me', null, '<div class="pane-solo st-page">' + body + '</div>');
    return topbar(back ? { back: back[0], backLabel: back[1] } : null) + '<main class="st-page">' + body + '</main>' + tabbar('me');
  }
  function stErr(msg) { return '<p class="notice error" role="alert">' + esc(msg) + '</p>'; }
  function hm(min) { min = Math.max(0, Math.round(min || 0)); return Math.floor(min / 60) + 'h ' + ('0' + (min % 60)).slice(-2) + 'm'; }
  function ymdLocal(d) { return ymd(d); }
  function dueChip(due) {
    if (!due) return '';
    var t = todayStr();
    if (due < t) return '<span class="tag tag-dark">Overdue · ' + esc(shortDate(due)) + '</span>';
    if (due === t) return '<span class="tag tag-blue">Due today</span>';
    if (due === addDays(t, 1)) return '<span class="tag">Due tomorrow</span>';
    return '<span class="tag st-tag-plain">Due ' + esc(shortDate(due)) + '</span>';
  }

  /* Me */
  function renderMe() {
    var u = state.user || {};
    var row = function (href, icon, title, sub, badge) {
      return '<a class="st-row" href="' + href + '"><span class="st-ico">' + icon + '</span><span class="st-txt"><b>' + esc(title) + '</b>' +
        (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span>' + (badge ? '<span class="st-badge">' + esc(badge) + '</span>' : '') + I.right + '</a>';
    };
    function draw(h, err) {
      var body = '<section class="hero"><span class="small" style="font-weight:700">' + esc(roleLabel(u.role)) + ' · ' + esc(u.email || '') + '</span><h1>Me</h1>' +
        '<span class="small">Your tasks, receipts, leave' + (h && h.can.clock ? ' and hours' : '') + ', all with one sign-in.</span></section>';
      if (u.staffWarning) body += '<div class="section"><p class="notice error" role="alert" style="margin:0">' + esc(u.staffWarning) + '</p></div>';
      body += '<nav class="section stack st-list" aria-label="Staff tools" style="gap:8px">';
      body += row('#/todo', I.list, 'My to do', h ? (h.todo.open + ' open' + (h.todo.dueToday ? ' · ' + h.todo.dueToday + ' due today' : '') + (h.todo.overdue ? ' · ' + h.todo.overdue + ' overdue' : '')) : '', h && h.todo.open ? String(h.todo.open) : '');
      body += row('#/receipts', I.receipt, 'Work receipts', 'This month\'s receipts, sent to accounts on the 1st');
      body += row('#/leave', I.leave, 'Leave', h ? ('Request leave' + (h.leave.waiting ? ' · ' + h.leave.waiting + ' waiting for approval' : '')) : 'Request leave');
      if (h && h.can.approve) body += row('#/leave', I.check, 'Approve leave', h.leave.toApprove ? h.leave.toApprove + ' waiting for you' : 'Nothing waiting', h.leave.toApprove ? String(h.leave.toApprove) : '');
      if (h && h.can.clock) body += row('#/clock', I.clock, 'Clock in / out', h.clock && h.clock.in ? 'Clocked in since ' + hhmm(new Date(h.clock.in.since)) : 'You\'re clocked out · ' + hm(h.clock ? h.clock.weekMin : 0) + ' this week');
      (h && h.vehicles || []).forEach(function (v) { body += row('#/myvehicle', I.car, 'My vehicle', v.model + (v.plate ? ' · ' + v.plate : '') + (v.odometerDue ? ' · odometer due this week' : ''), v.odometerDue ? '!' : ''); });
      body += row('#/mytickets', I.idcard, 'My licences and tickets', h && h.tickets ? (h.tickets.waiting ? h.tickets.waiting + ' waiting for approval' : h.tickets.due ? h.tickets.due + ' need renewing' : h.tickets.count ? 'All current' : 'Upload your licence and tickets') : 'Licence, white card, heights and other tickets', h && h.tickets && h.tickets.due ? '!' : '');
      if (h && h.can.ticketView) body += row('#/tickets', I.idcard, 'Staff licences and tickets', 'Everyone\'s current tickets · SWMS pack');
      if (h && h.can.directory && h.ticketsToApprove) body += row('#/staff', I.check, 'Approve tickets', h.ticketsToApprove + ' renewed ' + (h.ticketsToApprove === 1 ? 'ticket' : 'tickets') + ' waiting', String(h.ticketsToApprove));
      if (h && h.can.hours) body += row('#/hours', I.clock, 'Team hours', 'Everyone\'s clock times this week');
      if (h && h.can.directory && !wide()) body += row('#/staff', I.idcard, 'Staff directory', 'People, access and company vehicles');
      if (!wide() && isOffice()) {
        body += row('#/team', I.team, 'Team board', 'Who\'s where today');
        if (canSchedule()) body += row('#/planner', I.planner, 'Planner', 'Book and move appointments');
      }
      body += row('#/account', I.user, 'Account', 'View as, sign out, app version');
      body += '</nav>' + (err ? '<div class="section">' + stErr(err) + '</div>' : '') + '<div style="height:24px"></div>';
      app.innerHTML = staffPage('me', body);
    }
    draw(state.stHome || null);
    api({ action: 'staffHome' }).then(function (d) { state.user = d.user || state.user; u = state.user; state.stHome = d.home; if (route().name === 'me') draw(d.home); },
      function (e) { if (e.auth) return showError(e); if (route().name === 'me') draw(state.stHome || null, e.message); });
  }

  /* ---------- Staff directory and vehicles (managers: Simon and Troy) ---------- */
  var dv = { data: null, filter: 'all', q: '', vfilter: 'all', veh: {}, form: null, vform: null, svc: null };
  function dvPrep(f) { return /^image\//.test(f.type) ? shrinkImage(f).then(function (r) { return r.blob; }, function () { return f; }) : Promise.resolve(f); }
  function isManagerUser() { var u = state.user; return !!(u && u.manager && !u.viewing); }
  function dvTabs(active) {
    return '<div class="dv-tabs" role="tablist"><a role="tab" href="#/staff" aria-selected="' + (active === 'people') + '">People</a>' +
      '<a role="tab" href="#/vehicles" aria-selected="' + (active === 'vehicles') + '">Vehicles</a></div>';
  }
  function dvPage(body, back) {
    if (wide()) return shell('staff', null, '<div class="dv-page">' + body + '</div>');
    return topbar(back ? { back: back[0], backLabel: back[1] } : { back: '#/me', backLabel: 'Me' }) + '<main class="dv-page">' + body + '</main>' + tabbar('me');
  }
  function dvLoad(force) {
    if (dv.data && !force) return Promise.resolve(dv.data);
    return api({ action: 'directory' }).then(function (d) { state.user = d.user || state.user; dv.data = d.directory; return dv.data; });
  }
  function dvMissing() { return '<span class="dv-missing">Missing</span>'; }
  function dvRoleLabel(k) { return { office: 'Office', sales: 'Sales', pm: 'PM', installer: 'Installer', warehouse: 'Warehouse', marketing: 'Marketing' }[k] || k; }
  function dvLock() { return '<span class="dv-lock">' + I.lock + 'Only Simon and Troy can see this page.</span>'; }
  function dvFmtDate(s) { return s ? new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function dvKm(n) { var x = parseFloat(String(n || '').replace(/[^\d.]/g, '')); return isNaN(x) ? '' : Math.round(x).toLocaleString('en-AU') + ' km'; }
  function dvDirections(addr) {
    var wh = (dv.data && dv.data.warehouse) || CFG.WAREHOUSE || '';
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(wh) + '&destination=' + encodeURIComponent(addr);
  }
  function dvNoAccess() {
    app.innerHTML = dvPage('<section class="section"><p class="notice">The staff directory is for Simon and Troy.</p></section>');
  }

  /* People */
  function renderStaff(sel, tab) {
    if (state.user && !isManagerUser()) return dvNoAccess();
    if (!dv.data) app.innerHTML = dvPage('<section class="section"><p class="muted">Loading the staff directory…</p></section>');
    if (dv.lastSel !== sel) { sd.open = null; sd.tk = null; dv.lastSel = sel; }
    dvLoad(!dv.data).then(function () { if (route().name === 'staff') drawStaff(sel, tab); }, function (e) { if (e.auth) return showError(e); showError(e, function () { renderStaff(sel); }); });
  }
  function dvPeopleFiltered() {
    var q = dv.q.toLowerCase();
    return dv.data.people.filter(function (p) {
      if (dv.filter === 'off') { if (p.active) return false; }
      else if (!p.active) return false;
      if (dv.filter === 'office' && p.roles.indexOf('office') < 0) return false;
      if (dv.filter === 'installers' && p.roles.indexOf('installer') < 0) return false;
      if (q && (p.name + ' ' + p.email + ' ' + p.address + ' ' + p.mobile).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function dvPeopleRows(selEmail) {
    var list = dvPeopleFiltered();
    if (!list.length) return '<p class="muted dv-empty">Nobody matches.</p>';
    return list.map(function (p) {
      return '<a class="dv-row dv-prow' + (p.email === selEmail ? ' is-sel' : '') + '" href="#/staff/' + encodeURIComponent(p.email) + '">' +
        '<span class="dv-who"><b>' + esc(p.name) + (p.manager ? ' <span class="dv-mgr">Manager</span>' : '') + '</b><span>' + esc(p.email) + '</span></span>' +
        '<span class="dv-chips">' + p.roles.map(function (r) { return '<span class="dv-chip">' + esc(dvRoleLabel(r)) + '</span>'; }).join('') + '</span>' +
        '<span class="dv-cell">' + (p.tickets ? dvSt(p.tickets, p.tickets.text) + (p.tickets.pending ? ' <span class="dv-chip sd-chip">To approve</span>' : '') : '') + '</span>' +
        '<span class="dv-cell">' + (p.mobile ? esc(p.mobile) : dvMissing()) + '</span>' +
        '<span class="dv-cell dv-ask">' + dvAskCell(p) + '</span></a>';
    }).join('');
  }
  function dvAskCell(p) {
    var a = p.ask; if (!a) return '';
    return '<b' + (a.today >= a.limit ? ' class="dv-ask-full"' : '') + '>' + a.today + ' / ' + a.limit + '</b><span class="small muted">' + a.month + ' in 30 days</span>';
  }
  function dvAskSummary() {
    var t = 0, m = 0, who = 0;
    dv.data.people.forEach(function (p) { if (p.ask) { t += p.ask.today; m += p.ask.month; if (p.ask.today) who++; } });
    return ' · Ask Jan today: ' + t + (t === 1 ? ' question' : ' questions') + (who ? ' from ' + who + (who === 1 ? ' person' : ' people') : '') + ' (' + m + ' in 30 days)';
  }
  function dvPeopleAlerts() {
    var pend = dv.data.pendingTickets || [];
    var due = [];
    dv.data.people.forEach(function (p) { if (p.active && p.tickets && (p.tickets.level === 'bad' || p.tickets.level === 'warn')) due.push(firstName(p.name) + ': ' + p.tickets.text); });
    if (!pend.length && !due.length) return '';
    return '<div class="dv-soon">' + (pend.length ? '<b>To approve:</b><span>' + pend.map(function (t) { return '<a href="#/ticket/' + encodeURIComponent(t.id) + '">' + esc(firstName(t.name) + '\'s ' + t.type) + '</a>'; }).join(' · ') + '</span>' : '') +
      (due.length ? '<b>Coming up:</b><span>' + esc(due.join(' · ')) + '</span>' : '') + '</div>';
  }
  function dvPeopleList(selEmail) {
    var all = dv.data.people.filter(function (p) { return p.active; });
    var missing = all.filter(function (p) { return !p.mobile || !p.address; }).length;
    var f = function (k, l) { return '<button type="button" role="tab" data-dvf="' + k + '" aria-selected="' + (dv.filter === k) + '">' + l + '</button>'; };
    return dvTabs('people') +
      '<div class="dv-head"><div><h1>Staff directory</h1>' + dvLock() + '<span class="small muted">' + all.length + ' people' + (missing ? ' · ' + missing + ' missing details' : '') + esc(dvAskSummary()) + '</span></div>' +
      '<a class="btn btn-dark" href="#/staff/new">+ Add a person</a></div>' + dvPeopleAlerts() +
      '<div class="dv-tools"><input type="search" id="dvQ" placeholder="Search name, email, suburb" value="' + esc(dv.q) + '">' +
      '<div class="dv-filter" role="tablist">' + f('all', 'Everyone') + f('office', 'Office') + f('installers', 'Installers') + f('off', 'Switched off') + '</div></div>' +
      '<div class="dv-table" role="table" aria-label="Staff"><div class="dv-row dv-prow dv-th" role="row"><span>Name · sign-in email</span><span>Access</span><span>Licences and tickets</span><span>Mobile</span><span>Ask Jan · today</span></div>' +
      '<div id="dvRows">' + dvPeopleRows(selEmail) + '</div></div>' +
      '<p class="small muted dv-foot">Saved in the sheet <a href="' + esc(dv.data.sheetUrl) + '" target="_blank" rel="noopener">Field App – Staff directory (private)</a>, in Simon\'s Drive.</p>';
  }
  function dvBindList(selEmail, rowsFn) {
    var q = document.getElementById('dvQ');
    if (q) q.addEventListener('input', function () { dv.q = q.value; var r = document.getElementById('dvRows'); if (r) r.innerHTML = rowsFn(selEmail); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dvf]'), function (b) {
      b.onclick = function () { dv.filter = b.getAttribute('data-dvf'); drawStaff(selEmail); };
    });
  }
  function dvBlankPerson() { return { email: '', name: '', roles: [], mainRole: '', manager: false, active: true, mobile: '', address: '', emergency: '', notes: '', vehicle: null, isNew: true }; }
  function dvPersonForm(p) {
    var roles = dv.data.roles;
    var descs = { office: 'Everyone\'s schedule, Overview, Team', sales: 'Site consults, measure, quotes', pm: 'Book jobs in the Planner', installer: 'Jobs, route, Job Reports', warehouse: 'Clock in / out, van loading', marketing: 'Collateral and photos' };
    var tick = function (id, on, label, desc) {
      return '<label class="dv-tick' + (on ? ' on' : '') + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span><b>' + esc(label) + '</b><span>' + esc(desc) + '</span></span></label>';
    };
    var opens = (p.roles.length ? p.roles : ['installer']).map(function (r) { return '<option value="' + r + '"' + (p.mainRole === r ? ' selected' : '') + '>' + esc(roleLabel(r === 'marketing' ? 'office' : r) === 'Office' && r === 'marketing' ? 'Marketing' : roleLabel(r)) + ' view</option>'; }).join('');
    var h = '<div class="dv-card-head"><div><span class="small" style="font-weight:700">' + esc(p.isNew ? 'New person' : p.roles.map(function (r) { return (dv.data.roles.filter(function (x) { return x.key === r; })[0] || {}).label || r; }).join(' · ')) + '</span>' +
      '<h2>' + esc(p.isNew ? 'Add a person' : p.name) + '</h2>' +
      (p.isNew ? '<span class="small">They can sign in as soon as you save.</span>' : '<span class="small">' + (p.updated ? 'Updated ' + esc(p.updated) + (p.updatedBy ? ' by ' + esc(p.updatedBy) : '') : '') + '</span>') + '</div>' +
      (wide() ? '<a class="icon-btn" href="#/staff" aria-label="Close">' + I.x + '</a>' : '') + '</div>';
    h += dvPTabs(p, 'details', p.tickets && p.tickets.files);
    h += '<div class="dv-card-body stack" style="gap:14px">';
    h += '<b class="dv-sec">Details</b><div class="st-grid2"><div class="field"><label for="dvName">Full name</label><input id="dvName" value="' + esc(p.name) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="dvMobile">Mobile</label><input id="dvMobile" type="tel" inputmode="tel" value="' + esc(p.mobile) + '" placeholder="04xx xxx xxx"></div></div>';
    h += '<div class="field"><label for="dvEmail">Work email (signs in with)</label>' + (p.isNew ? '<input id="dvEmail" type="email" inputmode="email" autocomplete="off" placeholder="name@blindmaster.com.au">' : '<input id="dvEmail" value="' + esc(p.email) + '" readonly aria-readonly="true">') + '</div>';
    if (!p.isNew && p.mobile) h += '<div class="dv-links"><a href="' + esc(tel(p.mobile)) + '">' + I.phone + 'Call ' + esc(firstName(p.name)) + '</a></div>';
    h += '<div class="field"><label for="dvAddr">Home address</label><input id="dvAddr" value="' + esc(p.address) + '" placeholder="Start typing the address"></div>';
    h += '<div class="dv-links" id="dvAddrLinks"' + (p.address ? '' : ' hidden') + '><a id="dvDir" target="_blank" rel="noopener" href="' + esc(dvDirections(p.address)) + '">Directions from the warehouse</a><a id="dvMap" target="_blank" rel="noopener" href="' + esc(mapsSearch(p.address)) + '">Show on map</a></div>';
    h += '<div class="st-grid2"><div class="field"><span class="lbl">Vehicle</span>' + (p.vehicle ? '<a class="dv-veh" href="#/vehicles/' + encodeURIComponent(p.vehicle.id) + '">' + esc(p.vehicle.model) + (p.vehicle.plate ? ' · ' + esc(p.vehicle.plate) : '') + '</a>' : '<span class="small muted dv-veh-none">None. Set the driver on the Vehicles page.</span>') + '</div>' +
      '<div class="field"><label for="dvEmerg">Emergency contact</label><input id="dvEmerg" value="' + esc(p.emergency) + '" placeholder="Name and phone"></div></div>';
    h += '<div class="field"><label for="dvNotes">Notes</label><input id="dvNotes" value="' + esc(p.notes) + '" placeholder="Optional"></div>';
    if (!p.isNew && p.ask) h += '<b class="dv-sec">Ask Jan usage</b><div class="dv-askuse"><span><b>' + p.ask.today + ' of ' + p.ask.limit + '</b>today</span><span><b>' + p.ask.week + '</b>last 7 days</span><span><b>' + p.ask.month + '</b>last 30 days</span><span><b>' + esc(p.ask.last ? dvFmtDate(p.ask.last.slice(0, 10)) + p.ask.last.slice(10) : 'Never') + '</b>last asked</span></div>' +
      '<span class="small muted">Counts the app and the Ask Jan page together. Daily limit ' + p.ask.limit + ': 100 for Simon, Troy and Jan, 50 for everyone else.</span>';
    h += '<b class="dv-sec">Access in the app · tick all that apply</b><div class="dv-ticks">' + roles.map(function (r) { return tick('dvR-' + r.key, p.roles.indexOf(r.key) >= 0, r.label, descs[r.key] || ''); }).join('') + '</div>';
    h += '<div class="dv-lockline">' + I.lock + '<span>' + (p.manager ? '<b>Manager</b> · approves leave, sees everyone\'s hours, this directory and vehicles.' : 'No manager access.') +
      ' Manager access is locked to Simon and Troy and can\'t be changed in the app.</span></div>';
    h += '<div class="st-grid2"><div class="field"><label for="dvMain">Opens the app on</label><select id="dvMain">' + opens + '</select></div>' +
      '<div class="field"><label for="dvStatus">Status</label><select id="dvStatus"><option value="1"' + (p.active ? ' selected' : '') + '>Active</option><option value="0"' + (p.active ? '' : ' selected') + '>Switched off</option></select></div></div>';
    h += '</div><div class="dv-card-foot"><p class="notice error" id="dvErr" role="alert" hidden></p><span class="small muted">' + (p.isNew ? 'They sign in with Google using this email.' : 'Changes apply next time ' + esc(firstName(p.name)) + ' opens the app.') + '</span>' +
      '<button type="button" class="btn btn-dark" id="dvSave">Save</button></div>';
    return h;
  }
  function drawStaff(sel, tab) {
    var p = null;
    if (tab === undefined) tab = route().arg2;
    if (sel === 'new') p = dvBlankPerson();
    else if (sel) p = dv.data.people.filter(function (x) { return x.email === sel; })[0] || null;
    var selEmail = p && !p.isNew ? p.email : '';
    var docsTab = !!(p && !p.isNew && tab === 'docs');
    if (wide()) {
      app.innerHTML = dvPage('<div class="dv-split"><div class="dv-main">' + dvPeopleList(selEmail) + '</div>' +
        '<aside class="dv-side' + (docsTab ? ' dv-side-wide' : '') + '">' + (p ? (docsTab ? dvPersonDocs(p) : dvPersonForm(p)) : '<div class="dv-side-empty"><p class="muted">Choose a person to see and change their details and access.</p></div>') + '</aside></div>');
    } else if (p) {
      app.innerHTML = dvPage('<div class="dv-card">' + (docsTab ? dvPersonDocs(p) : dvPersonForm(p)) + '</div>', ['#/staff', 'Staff']);
    } else {
      app.innerHTML = dvPage('<div class="dv-main">' + dvPeopleList('') + '</div>');
    }
    dvBindList(selEmail, dvPeopleRows);
    if (p) { if (docsTab) dvBindDocs(p); else dvBindPerson(p); }
  }
  function dvBindPerson(p) {
    var addr = document.getElementById('dvAddr');
    function links() {
      var v = addr.value.trim(), box = document.getElementById('dvAddrLinks');
      box.hidden = !v;
      document.getElementById('dvDir').href = dvDirections(v);
      document.getElementById('dvMap').href = mapsSearch(v);
    }
    addr.addEventListener('input', links); addr.addEventListener('change', links);
    addressSuggest(addr, links);
    Array.prototype.forEach.call(document.querySelectorAll('.dv-tick input'), function (c) {
      c.addEventListener('change', function () {
        c.closest('.dv-tick').classList.toggle('on', c.checked);
        if (/^dvR-/.test(c.id)) {
          var main = document.getElementById('dvMain'), cur = main.value;
          var ticked = dv.data.roles.filter(function (r) { return document.getElementById('dvR-' + r.key).checked; }).map(function (r) { return r.key; });
          main.innerHTML = (ticked.length ? ticked : ['installer']).map(function (r) { return '<option value="' + r + '"' + (r === cur ? ' selected' : '') + '>' + esc(r === 'marketing' ? 'Marketing' : roleLabel(r)) + ' view</option>'; }).join('');
        }
      });
    });
    document.getElementById('dvSave').onclick = function () {
      var btn = this, err = document.getElementById('dvErr');
      var person = {
        email: document.getElementById('dvEmail').value.trim().toLowerCase(),
        name: document.getElementById('dvName').value.trim(),
        mobile: document.getElementById('dvMobile').value.trim(),
        address: addr.value.trim(),
        emergency: document.getElementById('dvEmerg').value.trim(),
        notes: document.getElementById('dvNotes').value.trim(),
        roles: dv.data.roles.filter(function (r) { return document.getElementById('dvR-' + r.key).checked; }).map(function (r) { return r.key; }),
        mainRole: document.getElementById('dvMain').value,
        active: document.getElementById('dvStatus').value === '1'
      };
      var added = person.roles.filter(function (r) { return (p.roles || []).indexOf(r) < 0; });
      var turnedOn = person.active && p.active === false;
      if (added.length || turnedOn) {
        var labels = added.map(function (k) { var r = dv.data.roles.filter(function (x) { return x.key === k; })[0]; return r ? r.label : k; });
        var who = person.name || person.email || 'this person';
        if (!confirm((p.isNew ? 'Give ' + who + ' access to the app' : 'Raise ' + who + '\'s access') + (labels.length ? ': ' + labels.join(', ') : '') + '?\n\nSimon and Troy will both get an email about this change.')) return;
      }
      err.hidden = true; btn.disabled = true; btn.textContent = 'Saving…';
      apiPost({ action: 'dirSave', person: person, isNew: !!p.isNew }).then(function (r) {
        return dvLoad(true).then(function () {
          if (r.email === myEmailSafe()) state.user = null; // your own access may have changed
          location.hash = '#/staff/' + encodeURIComponent(r.email);
          if (route().arg === r.email) drawStaff(r.email);
          var s = document.getElementById('dvSave'); if (s) { s.textContent = 'Saved'; setTimeout(function () { if (s.isConnected) s.textContent = 'Save'; }, 1800); }
        });
      }).catch(function (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Save'; });
    };
  }

  /* Vehicles */
  function dvSt(a, text) {
    var lvl = (a && a.level) || 'none';
    return '<span class="dv-st dv-' + lvl + '">' + esc(text) + '</span>';
  }
  function dvDateStatus(a, ymdv, verb) {
    if (!ymdv) return '<span class="dv-st dv-none">Not entered</span>';
    if (a.level === 'bad') return dvSt(a, 'Overdue ' + (-a.days) + ' day' + (a.days === -1 ? '' : 's'));
    if (a.level === 'warn') return dvSt(a, 'Due in ' + a.days + ' day' + (a.days === 1 ? '' : 's'));
    return dvSt(a, dvFmtDate(ymdv));
  }
  function dvServiceStatus(v) {
    var a = v.alerts.service;
    if (a.level === 'none') return '<span class="dv-st dv-none">Not set</span>';
    if (a.level === 'bad') return dvSt(a, a.days != null && a.days < 0 ? 'Overdue ' + Math.ceil(-a.days / 7) + ' wk' : 'Overdue ' + dvKm(-a.km));
    if (a.level === 'warn') return dvSt(a, a.km != null && a.km <= 1000 ? 'Due in ' + dvKm(a.km) : 'Due in ' + a.days + ' days');
    return dvSt(a, v.nextServiceDate ? dvFmtDate(v.nextServiceDate) : 'At ' + dvKm(v.nextServiceKm));
  }
  /* Ask Jan: ask a question, find anything in the app */
  var ask = { turns: [], busy: false, draft: '', quota: null, quotaAsked: false };
  function askQuotaText() { var q = ask.quota; return q ? q.left + (q.left === 1 ? ' question' : ' questions') + ' left today (of ' + q.limit + ')' : ''; }
  function askSuggestions() {
    if (isManagerUser()) return ['What needs me today?', 'Tickets expiring in the next 60 days', 'Vehicles due for rego or service', 'Who\'s on leave this month?'];
    if (isOffice()) return ['Unconfirmed bookings this week', 'Who\'s free Thursday afternoon?', 'Who\'s away next week?', 'Jobs in Manly this month'];
    if (canSchedule()) return ['My consults this week', 'Jobs I\'m booked on next week', 'Request a day off', 'My leave'];
    return ['What\'s on tomorrow?', 'Where is my next job?', 'Request a day off', 'When do my tickets expire?'];
  }
  function askMd(text) {
    var lines = esc(text || '').split('\n'), out = [], list = false;
    var inline = function (s) {
      return s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/\[([^\]]+)\]\(((?:#\/|https:\/\/)[^)\s]+)\)/g, function (m, label, href) {
          var ext = /^https:/.test(href);
          return '<a href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
        });
    };
    lines.forEach(function (l) {
      var m = l.match(/^\s*[-•*]\s+(.*)$/);
      if (m) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if (list) { out.push('</ul>'); list = false; }
      if (/^#{1,3}\s+/.test(l)) l = '<b>' + l.replace(/^#{1,3}\s+/, '') + '</b>';
      out.push(l.trim() ? '<p>' + inline(l) + '</p>' : '');
    });
    if (list) out.push('</ul>');
    return out.join('');
  }
  function askActions(t, ti) {
    return (t.actions || []).map(function (a, ai) {
      var rows = a.rows.map(function (r) { return '<div class="ask-act-row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('');
      var foot;
      if (a.status === 'done') foot = '<p class="ask-act-done">' + I.check + esc(a.doneText) + (a.link ? ' <a href="' + a.link + '">Open</a>' : '') +
        (a.undo ? ' <button type="button" class="link-btn small" data-askundo="' + ti + ':' + ai + '">Undo</button>' : '') + '</p>';
      else if (a.status === 'undone') foot = '<p class="small muted" style="margin:0">Removed from your list.</p>';
      else if (a.status === 'cancelled') foot = '<p class="small muted" style="margin:0">Cancelled. Nothing was sent.</p>';
      else foot = (a.note ? '<p class="small" style="margin:0">' + esc(a.note) + '</p>' : '') + (a.error ? '<p class="notice error" style="margin:0">' + esc(a.error) + '</p>' : '') +
        '<div class="ask-act-btns"><button type="button" class="btn btn-dark" data-askok="' + ti + ':' + ai + '"' + (a.status === 'busy' ? ' disabled' : '') + '>' + esc(a.status === 'busy' ? 'Sending…' : a.confirmLabel || 'Confirm') + '</button>' +
        '<button type="button" class="btn btn-sand" data-askno="' + ti + ':' + ai + '"' + (a.status === 'busy' ? ' disabled' : '') + '>Cancel</button></div>';
      return '<div class="ask-act"><b class="ask-act-title">' + esc(a.title) + '</b>' + rows + foot + '</div>';
    }).join('');
  }
  function askDoAction(ti, ai, ok) {
    var a = ask.turns[ti] && ask.turns[ti].actions[ai];
    if (!a || a.status === 'done' || a.status === 'busy') return;
    if (!ok) { a.status = 'cancelled'; return renderAsk(); }
    a.status = 'busy'; a.error = ''; renderAsk();
    apiPost(a.payload).then(function (r) {
      a.status = 'done';
      if (a.kind === 'leave') { a.doneText = 'Sent. Simon or Troy will approve it and you\'ll get an email.'; a.link = r.id ? '#/leave/' + encodeURIComponent(r.id) : '#/leave'; state.stHome = null; }
      else { a.doneText = 'Saved to your to-do list.'; a.link = '#/todo'; if (typeof td !== 'undefined') td.data = null; }
    }, function (e) { a.status = ''; a.error = e.message; }).then(renderAsk);
  }
  function renderAsk() {
    var u = state.user || {};
    var convo = ask.turns.map(function (t, ti) {
      return '<div class="ask-q">' + esc(t.q) + '</div>' + (t.a ? '<div class="ask-a' + (t.err ? ' is-err' : '') + '"><span class="ask-lbl">' + (t.err ? I.lock + 'Couldn\'t answer' : I.spark + 'Ask Jan') + '</span>' + (t.err ? '<p>' + esc(t.a) + '</p>' : askMd(t.a)) + askActions(t, ti) + '</div>' :
        '<div class="ask-a is-busy"><span class="ask-lbl">' + I.spark + 'Ask Jan</span><p class="muted">Looking that up…</p></div>');
    }).join('');
    var body = '<div class="ask-page"><section class="ask-head"><h1>' + I.spark + 'Ask Jan</h1><span class="small">Ask about a job, a customer, your day, your tickets. Answers come only from what you can already see in the app.</span>' + (ask.quota ? '<span class="small ask-quota" style="font-weight:700">' + esc(askQuotaText()) + '</span>' : '') + '</section>' +
      '<section class="ask-convo" id="askConvo">' + (convo || '<p class="muted ask-empty">Try one of these, or type your own question.</p>') + '</section>' +
      '<section class="ask-bar"><div class="ask-chips">' + askSuggestions().map(function (s) { return '<button type="button" class="ask-chip" data-askq="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
      '<form class="ask-form" id="askForm"><input id="askIn" autocomplete="off" placeholder="Ask about a job, a customer, your day…" value="' + esc(ask.draft) + '"' + (ask.busy ? ' disabled' : '') + '>' +
      '<button type="submit" class="btn btn-dark"' + (ask.busy ? ' disabled' : '') + '>Ask</button></form>' +
      (ask.turns.length ? '<button type="button" class="link-btn small" id="askClear">Start again</button>' : '') + '</section></div>';
    app.innerHTML = wide() ? shell('ask', null, '<div class="pane-solo">' + body + '</div>') : topbar({ title: 'Ask Jan' }) + '<main>' + body + '</main>' + tabbar('ask');
    var cv = document.getElementById('askConvo'); if (cv) cv.scrollTop = cv.scrollHeight;
    var last = cv && cv.lastElementChild; if (last && ask.turns.length) last.scrollIntoView({ block: 'end' });
    var form = document.getElementById('askForm'), inp = document.getElementById('askIn');
    if (inp) { inp.addEventListener('input', function () { ask.draft = inp.value; }); if (!ask.busy && wide()) inp.focus(); }
    form.onsubmit = function (e) { e.preventDefault(); askSend(inp.value); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-askq]'), function (b) { b.onclick = function () { askSend(b.getAttribute('data-askq')); }; });
    var clr = document.getElementById('askClear'); if (clr) clr.onclick = function () { ask.turns = []; renderAsk(); };
    if (!ask.quotaAsked) { ask.quotaAsked = true; api({ action: 'askQuota' }).then(function (r) { ask.quota = r.quota; if (route().name === 'ask' && !ask.busy) renderAsk(); }, function () {}); }
    Array.prototype.forEach.call(document.querySelectorAll('[data-askundo]'), function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-askundo').split(':'), a = ask.turns[+k[0]].actions[+k[1]];
        b.disabled = true; b.textContent = 'Undoing…';
        apiPost(a.undo).then(function () { a.status = 'undone'; if (typeof td !== 'undefined') td.data = null; }, function (e) { a.error = e.message; }).then(renderAsk);
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-askok],[data-askno]'), function (b) {
      b.onclick = function () { var ok = b.hasAttribute('data-askok'), k = (b.getAttribute(ok ? 'data-askok' : 'data-askno')).split(':'); askDoAction(Number(k[0]), Number(k[1]), ok); };
    });
  }
  function askSend(q) {
    q = String(q || '').trim();
    if (!q || ask.busy) return;
    var history = ask.turns.filter(function (t) { return t.a && !t.err; }).slice(-6).map(function (t) { return { q: t.q, a: t.a }; });
    var turn = { q: q, a: '' };
    ask.turns.push(turn); ask.busy = true; ask.draft = '';
    if (route().name === 'ask') renderAsk();
    apiPost({ action: 'askJan', question: q, history: history }).then(function (r) { turn.a = r.answer; turn.actions = r.actions || []; if (r.quota) ask.quota = r.quota; if (turn.actions.some(function (a) { return a.kind === 'todo'; }) && typeof td !== 'undefined') td.data = null; }, function (e) { turn.a = e.message; turn.err = true; })
      .then(function () { ask.busy = false; if (route().name === 'ask') renderAsk(); });
  }

  /* Staff documents, licences and tickets (Simon and Troy) */
  var sd = { docs: {}, open: null, tk: null, busy: false };
  function sdTkStatus(t) {
    if (t.status === 'Pending') return '<span class="dv-st dv-none">Waiting for Simon or Troy</span>';
    if (t.status === 'Sent back') return '<span class="dv-st dv-bad">Sent back</span>';
    if (!t.expires) return dvSt({ level: 'ok' }, 'Current · no expiry');
    if (t.level === 'bad') return dvSt(t, 'Expired ' + dvFmtDate(t.expires));
    if (t.level === 'warn') return dvSt(t, 'Expires in ' + t.days + (t.days === 1 ? ' day' : ' days'));
    return dvSt(t, 'Current · ' + dvFmtDate(t.expires));
  }
  function dvPTabs(p, active, count) {
    if (p.isNew) return '';
    var base = '#/staff/' + encodeURIComponent(p.email);
    return '<div class="dv-ptabs" role="tablist"><a role="tab" href="' + base + '" aria-selected="' + (active === 'details') + '">Details and access</a>' +
      '<a role="tab" href="' + base + '/docs" aria-selected="' + (active === 'docs') + '">Documents' + (count ? ' · ' + count : '') + '</a></div>';
  }
  function sdFileInput(id, label, opts) {
    opts = opts || {};
    return '<label class="dv-up' + (opts.big ? ' sd-big' : '') + '" for="' + id + '">' + I.camera + '<span id="' + id + 'Name">' + esc(label) + '</span></label>' +
      '<input type="file" id="' + id + '" accept="' + (opts.accept || 'image/*,application/pdf') + '" hidden>';
  }
  function sdReadFile(input) {
    var f = input && input.files && input.files[0];
    if (!f) return Promise.resolve(null);
    return dvPrep(f).then(function (blob) { return toBase64(blob).then(function (data) { return { data: data, mime: blob.type || f.type, name: f.name }; }); });
  }
  function sdWatchFile(id, empty) {
    var inp = document.getElementById(id);
    if (inp) inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; document.getElementById(id + 'Name').textContent = f ? f.name : empty; });
  }
  function sdTicketForm(prefix, t, types, isStaff) {
    t = t || {};
    var known = types.indexOf(t.type) >= 0;
    return '<div class="sd-tform stack" style="gap:10px">' +
      (t.renewOf ? '<b>Renew: ' + esc(t.type) + '</b>' : '<b>' + (isStaff ? 'Upload a renewed ticket' : 'Add a licence or ticket') + '</b>') +
      '<div class="st-grid2"><div class="field"><label for="' + prefix + 'Type">Which ticket</label><select id="' + prefix + 'Type">' +
      types.map(function (x) { return '<option' + ((known ? t.type === x : (t.type && x === 'Other')) ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="' + prefix + 'Num">Number or unit code</label><input id="' + prefix + 'Num" value="' + esc(t.number || '') + '"></div></div>' +
      '<div class="field" id="' + prefix + 'OtherBox"' + ((t.type && !known) || t.type === 'Other' ? '' : ' style="display:none"') + '><label for="' + prefix + 'Other">Name of the ticket</label><input id="' + prefix + 'Other" value="' + esc(known ? '' : (t.type || '')) + '" placeholder="e.g. Asbestos awareness"></div>' +
      '<div class="st-grid2"><div class="field"><label for="' + prefix + 'Iss">Issued</label><input id="' + prefix + 'Iss" type="date"></div>' +
      '<div class="field"><label for="' + prefix + 'Exp">Expires</label><input id="' + prefix + 'Exp" type="date"></div></div>' +
      '<div class="st-grid2">' + sdFileInput(prefix + 'Front', 'Photo of the front', { big: true }) + sdFileInput(prefix + 'Back', 'Back (optional)', { big: true }) + '</div>' +
      '<p class="notice error" id="' + prefix + 'Err" role="alert" hidden></p>' +
      '<div class="dv-row-btns"><button type="button" class="btn btn-dark" id="' + prefix + 'Save">' + (isStaff ? 'Send to Simon and Troy' : 'Save ticket') + '</button>' +
      '<button type="button" class="btn btn-sand" id="' + prefix + 'Cancel">Cancel</button></div>' +
      (isStaff ? '<span class="small muted">It counts once Simon or Troy approves it. Until then your current one stays on file.</span>' : (t.renewOf ? '<span class="small muted">The old one is kept in the folder as history.</span>' : '')) + '</div>';
  }
  function sdBindTicketForm(prefix, onSave, onCancel) {
    var sel = document.getElementById(prefix + 'Type');
    if (!sel) return;
    sel.addEventListener('change', function () { document.getElementById(prefix + 'OtherBox').style.display = sel.value === 'Other' ? '' : 'none'; });
    sdWatchFile(prefix + 'Front', 'Photo of the front'); sdWatchFile(prefix + 'Back', 'Back (optional)');
    document.getElementById(prefix + 'Cancel').onclick = onCancel;
    var btn = document.getElementById(prefix + 'Save'), err = document.getElementById(prefix + 'Err');
    btn.onclick = function () {
      var label = btn.textContent; err.hidden = true; btn.disabled = true; btn.textContent = 'Uploading…';
      Promise.all([sdReadFile(document.getElementById(prefix + 'Front')), sdReadFile(document.getElementById(prefix + 'Back'))]).then(function (files) {
        return onSave({ type: sel.value, otherType: document.getElementById(prefix + 'Other').value, number: document.getElementById(prefix + 'Num').value,
          issued: document.getElementById(prefix + 'Iss').value, expires: document.getElementById(prefix + 'Exp').value, front: files[0], back: files[1] });
      }).catch(function (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = label; });
    };
  }
  function sdDocRow(d) {
    return '<div class="sd-file"><a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + I.doc + esc(d.title) + '</a><span class="small muted">' + esc(dvFmtDate(d.date)) + (d.addedBy ? ' · ' + esc(d.addedBy) : '') + '</span>' +
      '<button type="button" class="dv-x" data-sdrm="' + esc(d.id) + '" aria-label="Take ' + esc(d.title) + ' off the list">' + I.x + '</button></div>';
  }
  function sdSection(title, note, inner) {
    return '<section class="dv-vsec"><div class="dv-vsec-h"><b>' + esc(title) + '</b>' + (note ? '<span class="small muted">' + esc(note) + '</span>' : '') + '</div>' + inner + '</section>';
  }
  function dvPersonDocs(p) {
    var d = sd.docs[p.email];
    var h = '<div class="dv-card-head"><div><span class="small" style="font-weight:700">' + esc(p.roles.map(dvRoleLabel).join(' · ')) + '</span><h2>' + esc(p.name) + '</h2></div>' +
      (wide() ? '<a class="icon-btn" href="#/staff" aria-label="Close">' + I.x + '</a>' : '') + '</div>' + dvPTabs(p, 'docs', p.tickets && p.tickets.files);
    if (!d) return h + '<div class="dv-card-body"><p class="muted">Loading documents…</p></div>';
    var body = '';
    var upForm = function (section) {
      return sd.open === section ? '<div class="sd-tform stack" style="gap:10px"><div class="st-grid2"><div class="field"><label for="sdTitle">Title</label><input id="sdTitle" placeholder="' + esc({ employment: 'e.g. Employment contract', notes: 'e.g. Quarterly check-in', other: 'e.g. Uniform sign-off' }[section]) + '"></div>' +
        '<div class="field"><label for="sdDate">Date</label><input id="sdDate" type="date" value="' + esc(todayStr()) + '"></div></div>' +
        sdFileInput('sdFile', 'Choose the file (PDF, photo or document)', { accept: 'image/*,application/pdf,.doc,.docx,.xls,.xlsx' }) +
        '<p class="notice error" id="sdErr" role="alert" hidden></p><div class="dv-row-btns"><button type="button" class="btn btn-dark" id="sdUp" data-section="' + section + '">Upload</button><button type="button" class="btn btn-sand" data-sdcancel>Cancel</button></div></div>' :
        '<button type="button" class="btn btn-outline dv-addsvc" data-sdopen="' + section + '">+ Add a document</button>';
    };
    var docsIn = function (s) { return d.docs.filter(function (x) { return x.section === s; }); };
    body += sdSection('Employment', 'Contract, job description, letters', docsIn('employment').map(sdDocRow).join('') + upForm('employment'));
    // tickets
    var tk = '';
    d.pending.forEach(function (t) { tk += '<div class="sd-wait"><span><b>Renewal waiting:</b> ' + esc(t.type) + ', uploaded ' + esc(t.added) + '</span><a href="#/ticket/' + encodeURIComponent(t.id) + '">Review</a></div>'; });
    tk += d.current.map(function (t) {
      return '<div class="sd-tk"><span class="sd-tk-name"><b>' + esc(t.type) + '</b><span class="small muted">' + esc(t.number || '') + '</span></span>' +
        '<span>' + sdTkStatus(t) + '</span><span class="sd-tk-acts">' + (t.frontUrl ? '<a href="' + esc(t.frontUrl) + '" target="_blank" rel="noopener" aria-label="Front">' + I.doc + '</a>' : '') +
        (t.backUrl ? '<a href="' + esc(t.backUrl) + '" target="_blank" rel="noopener" aria-label="Back">' + I.doc + '</a>' : '') +
        '<button type="button" class="link-btn" data-sdrenew="' + esc(t.id) + '">Renew</button><button type="button" class="dv-x" data-sdtkrm="' + esc(t.id) + '" aria-label="Remove ' + esc(t.type) + '">' + I.x + '</button></span></div>';
    }).join('');
    if (!d.current.length && !d.pending.length) tk += '<p class="small muted">No licences or tickets yet.</p>';
    tk += sd.tk ? sdTicketForm('sdT', sd.tk, d.types, false) : '<button type="button" class="btn btn-outline dv-addsvc" id="sdTNew">+ Add a licence or ticket</button>';
    if (d.history.length) tk += '<details class="sd-hist"><summary class="small">' + d.history.length + ' older ' + (d.history.length === 1 ? 'certificate' : 'certificates') + '</summary>' +
      d.history.map(function (t) { return '<div class="sd-file"><a href="' + esc(t.frontUrl) + '" target="_blank" rel="noopener">' + I.doc + esc(t.type) + '</a><span class="small muted">' + (t.expires ? 'expired ' + esc(dvFmtDate(t.expires)) : '') + '</span></div>'; }).join('') + '</details>';
    body += sdSection('Licences and tickets', 'Expiry dates send reminders', tk);
    var notes = docsIn('notes').map(sdDocRow).join('');
    if (sd.open === 'write') notes += '<div class="sd-tform stack" style="gap:10px"><div class="st-grid2"><div class="field"><label for="sdNTitle">Title</label><input id="sdNTitle" value="Meeting notes"></div>' +
      '<div class="field"><label for="sdNDate">Date</label><input id="sdNDate" type="date" value="' + esc(todayStr()) + '"></div></div>' +
      '<div class="field"><label for="sdNText">Notes</label><textarea id="sdNText" rows="7"></textarea></div><p class="notice error" id="sdNErr" role="alert" hidden></p>' +
      '<div class="dv-row-btns"><button type="button" class="btn btn-dark" id="sdNSave">Save as a Google Doc</button><button type="button" class="btn btn-sand" data-sdcancel>Cancel</button></div></div>';
    else if (sd.open === 'notes') notes += upForm('notes');
    else notes += '<div class="dv-row-btns"><button type="button" class="btn btn-outline" data-sdopen="write">+ Write notes</button><button type="button" class="btn btn-outline" data-sdopen="notes">+ Upload notes</button></div>';
    body += sdSection('Meeting notes', 'Only Simon and Troy', notes);
    body += sdSection('Other', '', docsIn('other').map(sdDocRow).join('') + upForm('other'));
    return h + '<div class="dv-card-body">' + body + '</div><div class="dv-card-foot"><div class="dv-lockline" style="margin:0">' + I.lock + '<span>Saved to Drive › Management › BLINDMASTER PEOPLE › Staff files › ' + esc(p.name) + '. Shared with Simon and Troy only. ' +
      esc(firstName(p.name)) + ' sees only their own licences and tickets.' + (d.folderUrl ? ' <a href="' + esc(d.folderUrl) + '" target="_blank" rel="noopener">Open the folder</a>' : '') + '</span></div></div>';
  }
  function sdLoad(email, force) {
    if (sd.docs[email] && !force) return Promise.resolve(sd.docs[email]);
    return api({ action: 'staffDocs', email: email }).then(function (r) { sd.docs[email] = r.docs; return r.docs; });
  }
  function sdRefresh(p) {
    return Promise.all([sdLoad(p.email, true), dvLoad(true)]).then(function () { if (route().name === 'staff' && route().arg === p.email) drawStaff(p.email, 'docs'); });
  }
  function dvBindDocs(p) {
    if (!sd.docs[p.email]) { sdLoad(p.email).then(function () { if (route().name === 'staff' && route().arg === p.email) drawStaff(p.email, 'docs'); }, function (e) { showError(e); }); return; }
    var redraw = function () { drawStaff(p.email, 'docs'); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-sdopen]'), function (b) { b.onclick = function () { sd.open = b.getAttribute('data-sdopen'); sd.tk = null; redraw(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sdcancel]'), function (b) { b.onclick = function () { sd.open = null; redraw(); }; });
    sdWatchFile('sdFile', 'Choose the file (PDF, photo or document)');
    var up = document.getElementById('sdUp');
    if (up) up.onclick = function () {
      var err = document.getElementById('sdErr'), inp = document.getElementById('sdFile');
      if (!inp.files || !inp.files[0]) { err.textContent = 'Choose a file first.'; err.hidden = false; return; }
      up.disabled = true; up.textContent = 'Uploading…'; err.hidden = true;
      sdReadFile(inp).then(function (f) {
        return apiPost({ action: 'docUpload', email: p.email, section: up.getAttribute('data-section'), title: document.getElementById('sdTitle').value, date: document.getElementById('sdDate').value, name: f.name, mime: f.mime, data: f.data });
      }).then(function () { sd.open = null; return sdRefresh(p); }).catch(function (e) { err.textContent = e.message; err.hidden = false; up.disabled = false; up.textContent = 'Upload'; });
    };
    var ns = document.getElementById('sdNSave');
    if (ns) ns.onclick = function () {
      var err = document.getElementById('sdNErr'); ns.disabled = true; ns.textContent = 'Saving…'; err.hidden = true;
      apiPost({ action: 'noteWrite', email: p.email, title: document.getElementById('sdNTitle').value, date: document.getElementById('sdNDate').value, text: document.getElementById('sdNText').value })
        .then(function () { sd.open = null; return sdRefresh(p); }).catch(function (e) { err.textContent = e.message; err.hidden = false; ns.disabled = false; ns.textContent = 'Save as a Google Doc'; });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-sdrm]'), function (b) {
      b.onclick = function () { if (!confirm('Take this off the list? The file stays in ' + firstName(p.name) + '\'s Drive folder.')) return; apiPost({ action: 'docRemove', id: b.getAttribute('data-sdrm') }).then(function () { return sdRefresh(p); }).catch(function (e) { alert(e.message); }); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sdtkrm]'), function (b) {
      b.onclick = function () { if (!confirm('Remove this licence or ticket from the list? The photo stays in the Drive folder.')) return; apiPost({ action: 'ticketRemove', id: b.getAttribute('data-sdtkrm') }).then(function () { return sdRefresh(p); }).catch(function (e) { alert(e.message); }); };
    });
    var tn = document.getElementById('sdTNew');
    if (tn) tn.onclick = function () { sd.tk = { type: 'Driver licence' }; sd.open = null; redraw(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-sdrenew]'), function (b) {
      b.onclick = function () { var t = sd.docs[p.email].current.filter(function (x) { return x.id === b.getAttribute('data-sdrenew'); })[0]; sd.tk = { type: t.type, number: t.number, renewOf: t.id }; sd.open = null; redraw(); };
    });
    sdBindTicketForm('sdT', function (t) {
      return apiPost(Object.assign({ action: 'ticketSave', email: p.email }, t)).then(function () { sd.tk = null; return sdRefresh(p); });
    }, function () { sd.tk = null; redraw(); });
  }

  /* Approve a renewed ticket */
  function renderTicket(id) {
    if (state.user && !isManagerUser()) return dvNoAccess();
    app.innerHTML = dvPage('<section class="section"><p class="muted">Loading the ticket…</p></section>', ['#/staff', 'Staff']);
    api({ action: 'ticket', id: id }).then(function (d) { drawTicket(d.ticket); }, function (e) { if (e.auth) return showError(e); showError(e, function () { renderTicket(id); }); });
  }
  function drawTicket(t, done) {
    var img = function (src, label, url) { return src ? '<a class="sd-photo" href="' + esc(url || src) + '" target="_blank" rel="noopener"><img src="' + src + '" alt="' + esc(label) + '"><span>' + esc(label) + '</span></a>' : ''; };
    var body = '<div class="sd-approve"><section class="hero"><span class="small" style="font-weight:700">' + (t.status === 'Pending' ? 'Waiting for you or ' + (myEmailSafe() === 'troy@blindmaster.com.au' ? 'Simon' : 'Troy') : esc(t.status === 'Current' ? 'Approved' : t.status) + (t.decidedBy ? ' by ' + esc(t.decidedBy) : '')) + ' · sent ' + esc(t.added) + '</span>' +
      '<h1>' + esc(t.name) + ': ' + esc(t.type.toLowerCase()) + '</h1></section>';
    if (done) body += '<section class="section"><p class="notice">' + esc(done) + '</p><a class="btn btn-sand" href="#/staff/' + encodeURIComponent(t.email) + '/docs">Open ' + esc(firstName(t.name)) + '\'s documents</a></section>';
    else {
      body += '<section class="section sd-photos">' + (img(t.front, 'Front', t.frontUrl) || '<p class="muted">No photo.</p>') + img(t.back, 'Back', t.backUrl) + '</section>';
      body += '<section class="section"><dl class="sd-dl"><dt>Ticket</dt><dd><b>' + esc(t.type) + (t.number ? ' · ' + esc(t.number) : '') + '</b></dd>' +
        (t.issued ? '<dt>Issued</dt><dd>' + esc(dvFmtDate(t.issued)) + '</dd>' : '') + '<dt>Expires</dt><dd><b>' + esc(t.expires ? dvFmtDate(t.expires) : 'No expiry') + '</b></dd>' +
        '<dt>Replaces</dt><dd>' + (t.replaces ? esc(t.replaces.type) + (t.replaces.expires ? ', ' + (t.replaces.level === 'bad' ? 'expired ' : 'expires ') + esc(dvFmtDate(t.replaces.expires)) : '') : 'Nothing (new ticket)') + '</dd></dl>' +
        '<p class="small muted">Check the name, the dates and the number match the photo before approving.</p></section>';
      if (t.status === 'Pending') body += '<section class="section stack" style="gap:6px"><label for="tkNote" style="font-size:13px;font-weight:700">Note to ' + esc(firstName(t.name)) + ' (needed if you send it back)</label><input id="tkNote" placeholder="e.g. The photo is blurry, please retake it">' +
        '<p class="notice error" id="tkErr" role="alert" hidden></p><div class="sd-decide"><button type="button" class="btn btn-outline" id="tkBack">Send back</button><button type="button" class="btn btn-dark" id="tkOk">Approve</button></div></section>';
      else body += '<section class="section"><p class="notice">This one has already been dealt with' + (t.decidedBy ? ' by ' + esc(t.decidedBy) : '') + '.</p></section>';
    }
    app.innerHTML = dvPage(body + '</div>', ['#/staff', 'Staff']);
    var decide = function (decision, btn) {
      var err = document.getElementById('tkErr'); err.hidden = true;
      document.getElementById('tkOk').disabled = document.getElementById('tkBack').disabled = true; btn.textContent = 'Saving…';
      apiPost({ action: 'ticketDecide', id: t.id, decision: decision, note: document.getElementById('tkNote').value }).then(function () {
        delete sd.docs[t.email]; dv.data = null;
        drawTicket(t, decision === 'approve' ? 'Approved. Saved to ' + firstName(t.name) + '\'s folder with the old one kept as history. ' + firstName(t.name) + ' has been emailed.' : 'Sent back. ' + firstName(t.name) + ' has been emailed your note and can upload it again.');
      }).catch(function (e) { err.textContent = e.message; err.hidden = false; document.getElementById('tkOk').disabled = document.getElementById('tkBack').disabled = false; btn.textContent = decision === 'approve' ? 'Approve' : 'Send back'; });
    };
    var ok = document.getElementById('tkOk'), back = document.getElementById('tkBack');
    if (ok) ok.onclick = function () { decide('approve', ok); };
    if (back) back.onclick = function () { decide('back', back); };
  }

  /* My licences and tickets (everyone) */
  var mt = { data: null, form: null, msg: '' };
  /* Staff licences and tickets (read-only register for SWMS): Simon, Troy and anyone in TICKET_VIEWERS */
  var tr = { data: null, pick: {}, open: '', view: null, busy: false, msg: '' };
  function trDownload(f) {
    var bin = atob(f.data), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: f.mime })), a = document.createElement('a');
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  function renderTicketRegister() {
    if (!tr.data) app.innerHTML = staffPage('me', '<section class="section"><p class="muted">Loading licences and tickets…</p></section>', ['#/me', 'Me']);
    api({ action: 'ticketRegister' }).then(function (d) { state.user = d.user || state.user; tr.data = d.register; drawTicketRegister(); },
      function (e) { if (tr.data) drawTicketRegister(e.message); else showError(e, renderTicketRegister); });
  }
  function drawTicketRegister(err) {
    var d = tr.data, n = Object.keys(tr.pick).filter(function (e) { return tr.pick[e]; }).length;
    var body = '<section class="hero"><span class="small" style="font-weight:700">Read only · for SWMS</span><h1>Staff licences and tickets</h1>' +
      '<span class="small">Everyone\'s current licences and tickets. Tick the crew for a job and make a SWMS pack.</span></section>';
    body += '<section class="section stack" style="gap:8px"><div class="spread"><button type="button" class="link-btn" id="trAll">' + (n === d.people.length ? 'Clear all' : 'Select all') + '</button>' +
      '<span class="small muted">' + n + ' selected</span></div>';
    d.people.forEach(function (p) {
      body += '<div class="tr-person"><label class="tr-head"><input type="checkbox" data-trpick="' + esc(p.email) + '"' + (tr.pick[p.email] ? ' checked' : '') + '><b>' + esc(p.name) + '</b>' +
        '<span class="small muted">' + (p.tickets.length ? p.tickets.length + (p.tickets.length === 1 ? ' ticket' : ' tickets') : 'Nothing on file') + '</span></label>';
      p.tickets.forEach(function (t) {
        var open = tr.open === t.id;
        body += '<div class="sd-tk"><span class="sd-tk-name"><b>' + esc(t.type) + '</b><span class="small muted">' + esc(t.number || '') + '</span></span><span>' + sdTkStatus(t) + '</span>' +
          '<span class="sd-tk-acts">' + (t.hasFront ? '<button type="button" class="link-btn" data-tropen="' + esc(t.id) + '">' + (open ? 'Hide' : 'Photo') + '</button>' : '<span class="small muted">No photo</span>') + '</span></div>';
        if (open) {
          var v = tr.view && tr.view.id === t.id ? tr.view : null;
          body += '<div class="tr-photos">' + (!v ? '<p class="small muted">Loading the photo…</p>' : v.error ? stErr(v.error) :
            ['front', 'back'].filter(function (s) { return v[s]; }).map(function (s) {
              var f = v[s], isImg = /^image\//.test(f.mime);
              return '<figure>' + (isImg ? '<img src="data:' + f.mime + ';base64,' + f.data + '" alt="' + esc(t.type + ' ' + s) + '">' : '<p class="small">' + esc(f.name) + '</p>') +
                '<figcaption><button type="button" class="btn btn-outline" data-trdl="' + s + '">' + I.download + 'Download ' + (v.back ? s : '') + '</button></figcaption></figure>';
            }).join('')) + '</div>';
        }
      });
      body += '</div>';
    });
    body += '</section>';
    if (tr.msg) body += '<div class="section"><p class="notice">' + esc(tr.msg) + '</p></div>';
    if (err) body += '<div class="section">' + stErr(err) + '</div>';
    body += '<div class="ms-save" style="grid-template-columns:1fr"><button type="button" class="btn btn-dark btn-lg" id="trPack"' + (n && !tr.busy ? '' : ' disabled') + '>' + (tr.busy ? 'Making the PDF…' : 'Make SWMS pack (PDF)' + (n ? ' · ' + n : '')) + '</button></div>';
    body += '<p class="small muted section">Only current tickets show here. Contracts, notes and other staff files stay private to Simon and Troy.</p><div style="height:24px"></div>';
    app.innerHTML = staffPage('me', body, ['#/me', 'Me']);
    document.getElementById('trAll').onclick = function () { var all = n !== d.people.length; tr.pick = {}; if (all) d.people.forEach(function (p) { tr.pick[p.email] = true; }); drawTicketRegister(); };
    Array.prototype.forEach.call(app.querySelectorAll('[data-trpick]'), function (c) { c.onchange = function () { tr.pick[c.getAttribute('data-trpick')] = c.checked; drawTicketRegister(); }; });
    Array.prototype.forEach.call(app.querySelectorAll('[data-tropen]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-tropen');
        if (tr.open === id) { tr.open = ''; return drawTicketRegister(); }
        tr.open = id; drawTicketRegister();
        if (tr.view && tr.view.id === id) return;
        var t = null; d.people.forEach(function (p) { p.tickets.forEach(function (x) { if (x.id === id) t = x; }); });
        Promise.all([api({ action: 'ticketFile', id: id, side: 'front' }), t && t.hasBack ? api({ action: 'ticketFile', id: id, side: 'back' }) : Promise.resolve(null)]).then(function (r) {
          tr.view = { id: id, front: r[0].file, back: r[1] && r[1].file }; if (tr.open === id) drawTicketRegister();
        }, function (e) { tr.view = { id: id, error: e.message }; if (tr.open === id) drawTicketRegister(); });
      };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-trdl]'), function (b) { b.onclick = function () { trDownload(tr.view[b.getAttribute('data-trdl')]); }; });
    document.getElementById('trPack').onclick = function () {
      var emails = d.people.filter(function (p) { return tr.pick[p.email]; }).map(function (p) { return p.email; });
      tr.busy = true; tr.msg = ''; drawTicketRegister();
      apiPost({ action: 'ticketPack', emails: emails }).then(function (r) { tr.busy = false; tr.msg = 'Downloaded ' + r.file.name + '.'; trDownload(r.file); drawTicketRegister(); },
        function (e) { tr.busy = false; drawTicketRegister(e.message); });
    };
  }

  function renderMyTickets() {
    if (!mt.data) app.innerHTML = staffPage('me', '<section class="section"><p class="muted">Loading your licences and tickets…</p></section>', ['#/me', 'Me']);
    api({ action: 'myTickets' }).then(function (d) { state.user = d.user || state.user; mt.data = d.tickets; drawMyTickets(); }, function (e) { if (mt.data) drawMyTickets(e.message); else showError(e, renderMyTickets); });
  }
  function drawMyTickets(err) {
    var d = mt.data, u = state.user || {};
    var body = '<section class="hero"><span class="small" style="font-weight:700">' + esc(u.name || '') + '</span><h1>My licences and tickets</h1><span class="small">Keep these current so you can work on every job.</span></section>';
    body += '<section class="section sd-mine">';
    if (!d.current.length && !d.waiting.length) body += '<p class="muted">Nothing on file yet. Upload your licence and tickets below.</p>';
    d.current.forEach(function (t) {
      body += '<div class="sd-tk"><span class="sd-tk-name"><b>' + esc(t.type) + '</b><span class="small muted">' + esc(t.number || '') + '</span></span><span>' + sdTkStatus(t) + '</span>' +
        '<span class="sd-tk-acts"><button type="button" class="link-btn" data-mtrenew="' + esc(t.type) + '">Renew</button></span></div>';
    });
    d.waiting.forEach(function (t) {
      body += '<div class="sd-tk"><span class="sd-tk-name"><b>' + esc(t.type) + '</b><span class="small muted">' + (t.expires ? 'New one expires ' + esc(dvFmtDate(t.expires)) : 'Uploaded ' + esc(t.added)) + '</span></span><span>' + sdTkStatus(t) + '</span>' +
        (t.status === 'Sent back' && t.note ? '<span class="sd-note">' + esc(t.decidedBy || '') + ': ' + esc(t.note) + '</span>' : '<span></span>') + '</div>';
    });
    body += '</section>';
    if (mt.msg) body += '<div class="section"><p class="notice">' + esc(mt.msg) + '</p></div>';
    body += '<section class="section">' + (mt.form ? sdTicketForm('mt', mt.form, d.types, true) : '<button type="button" class="btn btn-dark" id="mtNew">Upload a renewed or new ticket</button>') + '</section>';
    if (err) body += '<div class="section">' + stErr(err) + '</div>';
    body += '<p class="small muted section">You only see your own licences and tickets. You\'ll get an email 30 days and 7 days before one expires.</p><div style="height:24px"></div>';
    app.innerHTML = staffPage('me', body, ['#/me', 'Me']);
    var nb = document.getElementById('mtNew');
    if (nb) nb.onclick = function () { mt.form = { type: (d.current.filter(function (t) { return t.level !== 'ok'; })[0] || {}).type || 'Driver licence' }; mt.msg = ''; drawMyTickets(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-mtrenew]'), function (b) { b.onclick = function () { mt.form = { type: b.getAttribute('data-mtrenew') }; mt.msg = ''; drawMyTickets(); var f = document.getElementById('mtNum'); if (f) f.scrollIntoView({ block: 'center' }); }; });
    sdBindTicketForm('mt', function (t) {
      return apiPost(Object.assign({ action: 'ticketSubmit' }, t)).then(function (r) { mt.data = r.tickets; mt.form = null; mt.msg = 'Sent. Simon and Troy have been told. You\'ll get an email when it\'s approved.'; state.stHome = null; drawMyTickets(); });
    }, function () { mt.form = null; drawMyTickets(); });
  }

  function dvComingUp(list) {
    var out = [];
    list.forEach(function (v) {
      var n = v.model;
      if (v.alerts.rego.level === 'bad') out.push(n + ' rego overdue'); else if (v.alerts.rego.level === 'warn') out.push(n + ' rego due in ' + v.alerts.rego.days + ' days');
      if (v.alerts.insurance.level === 'bad') out.push(n + ' insurance overdue'); else if (v.alerts.insurance.level === 'warn') out.push(n + ' insurance renews in ' + v.alerts.insurance.days + ' days');
      if (v.alerts.service.level === 'bad') out.push(n + ' service overdue'); else if (v.alerts.service.level === 'warn') out.push(n + ' service due soon');
    });
    return out;
  }
  function renderVehicles(sel) {
    if (state.user && !isManagerUser()) return dvNoAccess();
    if (!dv.data) app.innerHTML = dvPage('<section class="section"><p class="muted">Loading vehicles…</p></section>');
    var p = dvLoad(!dv.data);
    if (sel && sel !== 'new') p = p.then(function () { return api({ action: 'vehicle', id: sel }).then(function (d) { dv.veh[sel] = d.vehicle; }); });
    p.then(function () { if (route().name === 'vehicles') drawVehicles(sel); }, function (e) { if (e.auth) return showError(e); showError(e, function () { renderVehicles(sel); }); });
  }
  function dvVehRows(selId) {
    var list = dv.data.vehicles.filter(function (v) { return dv.vfilter === 'off' ? /off|sold|inactive/i.test(v.status) : !/off|sold|inactive/i.test(v.status); });
    if (!list.length) return '<p class="muted dv-empty">No vehicles here.</p>';
    return list.map(function (v) {
      return '<a class="dv-row dv-vrow' + (v.id === selId ? ' is-sel' : '') + '" href="#/vehicles/' + encodeURIComponent(v.id) + '">' +
        '<span class="dv-who"><b>' + esc(v.model) + '</b><span>' + (dvStaffOwned(v) ? 'Staff owned · ' : '') + 'Driver: ' + esc(v.driverName || 'not set') + '</span></span>' +
        '<span>' + (v.plate ? '<span class="dv-plate">' + esc(v.plate) + '</span>' : dvMissing()) + '</span>' +
        '<span class="dv-cell"><span class="dv-ml">Rego</span>' + dvDateStatus(v.alerts.rego, v.regoExpiry) + '</span>' +
        '<span class="dv-cell"><span class="dv-ml">Insurance</span>' + dvDateStatus(v.alerts.insurance, v.insuranceRenewal) + '</span>' +
        '<span class="dv-cell"><span class="dv-ml">Service</span>' + dvServiceStatus(v) + '</span></a>';
    }).join('');
  }
  function dvVehList(selId) {
    var active = dv.data.vehicles.filter(function (v) { return !/off|sold|inactive/i.test(v.status); });
    var soon = dvComingUp(active);
    var f = function (k, l) { return '<button type="button" role="tab" data-dvvf="' + k + '" aria-selected="' + (dv.vfilter === k) + '">' + l + '</button>'; };
    return dvTabs('vehicles') +
      '<div class="dv-head"><div><h1>Vehicles</h1>' + dvLock() + '<span class="small muted">' + active.length + ' vehicles' + (soon.length ? ' · ' + soon.length + ' need attention' : '') + '</span></div>' +
      '<a class="btn btn-dark" href="#/vehicles/new">+ Add a vehicle</a></div>' +
      (soon.length ? '<div class="dv-soon"><b>Coming up:</b><span>' + esc(soon.join(' · ')) + '</span></div>' : '') +
      '<div class="dv-tools"><div class="dv-filter" role="tablist">' + f('all', 'In use') + f('off', 'Sold / off the road') + '</div></div>' +
      '<div class="dv-table" role="table" aria-label="Vehicles"><div class="dv-row dv-vrow dv-th" role="row"><span>Vehicle · driver</span><span>Plate</span><span>Rego due</span><span>Insurance renews</span><span>Next service</span></div>' +
      dvVehRows(selId) + '</div>' +
      '<p class="small muted dv-foot">Green: fine · Amber: due within 30 days (service: 14 days or 1,000 km) · Red: overdue. Simon, Troy and Di are emailed 30 and 7 days before each rego and insurance date; the driver, Simon and Troy when a service is due. Drivers are reminded on Fridays to enter their odometer. Staff-owned cars: rego and insurance reminders go to the driver, Simon and Troy; no service or odometer reminders.</p>';
  }
  function dvStaffOwned(v) { return /staff|private|own/i.test(String((v && v.ownership) || '')); }
  function dvTel(n) { return String(n || '').replace(/[^\d+]/g, ''); }
  function dvBlankVehicle() { return { ownership: 'Company', roadsideProvider: '', roadsidePhone: '', id: '', model: '', year: '', plate: '', colour: '', vin: '', driver: '', regoExpiry: '', regoPeriod: '12 months', ctpInsurer: '', ctpPolicy: '', insurer: '', policy: '', cover: '', insuranceRenewal: '', etagProvider: '', etagNumber: '', tollAccount: '', serviceKm: '10000', serviceMonths: '6', nextServiceDate: '', nextServiceKm: '', odometer: '', odometerDate: '', status: 'Active', notes: '', docs: [], services: [], readings: [], isNew: true, alerts: { service: { level: 'none' } } }; }
  function dvF(id, label, val, opts) {
    opts = opts || {};
    return '<div class="field' + (opts.span ? ' dv-span' + opts.span : '') + '"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" data-vf="' + (opts.key || '') + '" type="' + (opts.type || 'text') + '"' +
      (opts.mode ? ' inputmode="' + opts.mode + '"' : '') + ' value="' + esc(val || '') + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + '></div>';
  }
  function dvDocs(v, kinds) {
    var docs = (v.docs || []).filter(function (d) { return kinds.indexOf(d.kind) >= 0; });
    var rn = { 'Green slip': 'CTP certificate', 'Certificate of currency': 'Insurance certificate' };
    return '<div class="dv-docs">' + docs.map(function (d) {
      d = Object.assign({}, d, { label: rn[d.label] || d.label });
      return '<span class="dv-doc"><a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + I.doc + esc(d.label) + '</a><button type="button" class="dv-x" data-rmdoc="' + esc(d.id) + '" aria-label="Remove ' + esc(d.label) + '">' + I.x + '</button></span>';
    }).join('') + (v.isNew ? '' : kinds.map(function (k) {
      var l = { rego: 'Rego certificate', ctp: 'CTP certificate', insurance: 'Insurance certificate', other: 'Other document' }[k];
      return '<label class="dv-up" for="dvUp-' + k + '">' + I.camera + 'Add ' + esc(l.toLowerCase()) + '</label><input type="file" id="dvUp-' + k + '" data-upkind="' + k + '" accept="image/*,application/pdf" hidden>';
    }).join('')) + '</div>';
  }
  function dvVehForm(v) {
    var people = (v.drivers || dv.data.people.filter(function (p) { return p.active; }).map(function (p) { return { email: p.email, name: p.name }; }));
    var sec = function (title, note, inner) { return '<section class="dv-vsec"><div class="dv-vsec-h"><b>' + esc(title) + '</b>' + (note ? '<span class="small muted">' + esc(note) + '</span>' : '') + '</div>' + inner + '</section>'; };
    var h = '<div class="dv-card-head"><div><span class="small" style="font-weight:700">' + (v.isNew ? 'New vehicle' : (dvStaffOwned(v) ? 'Staff-owned vehicle' : 'Company vehicle') + ' · Driver: ' + esc(v.driverName || 'not set')) + '</span>' +
      '<h2>' + esc(v.isNew ? 'Add a vehicle' : v.model) + '</h2>' +
      (v.isNew ? '' : '<span class="small">' + esc(v.plate || 'No plate yet') + (v.odometer ? ' · odometer ' + esc(dvKm(v.odometer)) + (v.odometerDate ? ' (' + esc(dvFmtDate(v.odometerDate)) + (v.odometerBy ? ', ' + esc(v.odometerBy) : '') + ')' : '') : '') + '</span>') + '</div>' +
      (wide() ? '<a class="icon-btn" href="#/vehicles" aria-label="Close">' + I.x + '</a>' : '') + '</div><div class="dv-card-body">';
    h += sec('Vehicle', '', '<div class="dv-g3">' + dvF('vfModel', 'Make and model', v.model, { key: 'model', span: 2, ph: 'e.g. Toyota Hiace LWB' }) + dvF('vfYear', 'Year', v.year, { key: 'year', mode: 'numeric' }) +
      dvF('vfPlate', 'Number plate', v.plate, { key: 'plate' }) + dvF('vfColour', 'Colour', v.colour, { key: 'colour' }) +
      '<div class="field"><label for="vfDriver">Driver</label><select id="vfDriver" data-vf="driver"><option value="">No driver</option>' + people.map(function (p) { return '<option value="' + esc(p.email) + '"' + (p.email === v.driver ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="vfOwn">Owned by</label><select id="vfOwn" data-vf="ownership">' + [['Company', 'Company'], ['Staff owned', 'Staff owned']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((dvStaffOwned(v) ? 'Staff owned' : 'Company') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      dvF('vfVin', 'VIN', v.vin, { key: 'vin', span: 2 }) + '</div>' +
      (dvStaffOwned(v) ? '<p class="small muted" style="margin:8px 0 0">Staff-owned: still listed for the driver and in the Job Report and Daily Job Report. Rego and insurance reminders go to the driver, Simon and Troy; no service or odometer reminders.</p>' : ''));
    h += sec('Registration', '', '<div class="st-grid2">' + dvF('vfRego', 'Rego expiry', v.regoExpiry, { key: 'regoExpiry', type: 'date' }) + dvF('vfRegoP', 'Rego period', v.regoPeriod, { key: 'regoPeriod', ph: '12 months' }) +
      dvF('vfCtpI', 'CTP (green slip) insurer', v.ctpInsurer, { key: 'ctpInsurer' }) + dvF('vfCtpP', 'CTP policy number', v.ctpPolicy, { key: 'ctpPolicy' }) + '</div>' + dvDocs(v, ['rego', 'ctp']));
    h += sec('Insurance', '', '<div class="st-grid2">' + dvF('vfIns', 'Insurer', v.insurer, { key: 'insurer' }) + dvF('vfPol', 'Policy number', v.policy, { key: 'policy' }) +
      dvF('vfCover', 'Cover', v.cover, { key: 'cover', ph: 'e.g. Comprehensive (fleet)' }) + dvF('vfRen', 'Renewal date', v.insuranceRenewal, { key: 'insuranceRenewal', type: 'date' }) + '</div>' + dvDocs(v, ['insurance']));
    h += sec('Roadside assist', 'Quote the plate when you call', '<div class="st-grid2">' + dvF('vfRsP', 'Provider', v.roadsideProvider, { key: 'roadsideProvider', ph: 'e.g. NRMA' }) +
      dvF('vfRsT', 'Phone', v.roadsidePhone, { key: 'roadsidePhone', type: 'tel', ph: 'e.g. 13 11 22' }) + '</div>' +
      (v.roadsidePhone ? '<p class="small" style="margin:8px 0 0"><a href="tel:' + esc(dvTel(v.roadsidePhone)) + '">Call ' + esc(v.roadsideProvider || 'roadside assist') + ' · ' + esc(v.roadsidePhone) + '</a></p>' : ''));
    h += sec('Tolls', '', '<div class="st-grid2">' + dvF('vfTagP', 'E-tag provider', v.etagProvider, { key: 'etagProvider', ph: 'e.g. Linkt' }) + dvF('vfTagN', 'E-tag number', v.etagNumber, { key: 'etagNumber' }) +
      dvF('vfToll', 'Toll account', v.tollAccount, { key: 'tollAccount', span: 2 }) + '</div>');
    var svcRows = (v.services || []).map(function (s) {
      return '<div class="dv-svc"><span>' + esc(dvFmtDate(s.date)) + '</span><span>' + esc(dvKm(s.km)) + '</span><span><b>' + esc(s.workshop || '–') + '</b><br><span class="muted">' + esc(s.work) + '</span></span>' +
        '<span class="dv-r">' + esc(s.cost ? (/^\$/.test(s.cost) ? s.cost : '$' + s.cost) : '') + '</span>' +
        '<span class="dv-r">' + (s.invoice ? '<a href="' + esc(s.invoice) + '" target="_blank" rel="noopener" aria-label="Invoice">' + I.doc + '</a>' : '') + '<button type="button" class="dv-x" data-rmsvc="' + esc(s.id) + '" aria-label="Delete this service">' + I.x + '</button></span></div>';
    }).join('');
    var add = v.isNew ? '<p class="small muted">Save the vehicle first, then add services and documents.</p>' : (dv.svc === v.id ?
      '<div class="dv-svcadd stack" style="gap:10px"><div class="st-grid2">' + dvF('svDate', 'Date', todayStr(), { type: 'date' }) + dvF('svKm', 'Odometer (km)', '', { mode: 'numeric' }) +
      dvF('svShop', 'Workshop', '', { ph: 'e.g. Brookvale Toyota' }) + dvF('svCost', 'Cost', '', { mode: 'decimal', ph: '$' }) + dvF('svWork', 'Work done', '', { span: 2, ph: 'e.g. Major service, front pads' }) + '</div>' +
      '<label class="dv-up" for="svInv">' + I.camera + '<span id="svInvName">Attach the invoice (optional)</span></label><input type="file" id="svInv" accept="image/*,application/pdf" hidden>' +
      '<div class="dv-row-btns"><button type="button" class="btn btn-dark" id="svSave">Save service</button><button type="button" class="btn btn-sand" id="svCancel">Cancel</button></div></div>' :
      '<button type="button" class="btn btn-outline dv-addsvc" id="svOpen">+ Add a service</button>');
    h += sec('Service history', 'Every ' + (v.serviceKm ? dvKm(v.serviceKm) : '? km') + ' or ' + (v.serviceMonths || '?') + ' months', '<div class="dv-g3">' +
      dvF('vfNsD', 'Next service due', v.nextServiceDate, { key: 'nextServiceDate', type: 'date' }) + dvF('vfNsK', 'or at (km)', v.nextServiceKm, { key: 'nextServiceKm', mode: 'numeric' }) +
      dvF('vfOdo', 'Odometer now (km)', v.odometer, { key: 'odometer', mode: 'numeric' }) +
      dvF('vfEvK', 'Service every (km)', v.serviceKm, { key: 'serviceKm', mode: 'numeric' }) + dvF('vfEvM', 'Service every (months)', v.serviceMonths, { key: 'serviceMonths', mode: 'numeric' }) +
      '<div class="field"><label for="vfStatus">Status</label><select id="vfStatus" data-vf="status">' + ['Active', 'Off the road', 'Sold'].map(function (s) { return '<option' + (String(v.status || 'Active') === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div></div>' +
      (svcRows ? '<div class="dv-svcs">' + svcRows + '</div>' : (v.isNew ? '' : '<p class="small muted">No services recorded yet.</p>')) + add);
    h += sec('Notes and other documents', '', '<div class="field"><label for="vfNotes">Notes</label><input id="vfNotes" data-vf="notes" value="' + esc(v.notes || '') + '"></div>' + dvDocs(v, ['other']));
    h += '</div><div class="dv-card-foot"><p class="notice error" id="dvErr" role="alert" hidden></p><span class="small muted">Documents are saved to Drive › Field App – Vehicles › ' + esc(v.plate || 'the plate') + '.</span>' +
      (v.isNew ? '' : '<button type="button" class="btn btn-outline dv-del" id="vfDelete">Delete vehicle</button>') + '<button type="button" class="btn btn-dark" id="vfSave">Save</button></div>';
    return h;
  }
  function drawVehicles(sel) {
    var v = null;
    if (sel === 'new') v = dv.vform && dv.vform.isNew ? dv.vform : dvBlankVehicle();
    else if (sel) v = dv.veh[sel] || null;
    var selId = v && !v.isNew ? v.id : '';
    if (wide()) {
      app.innerHTML = dvPage('<div class="dv-split"><div class="dv-main">' + dvVehList(selId) + '</div>' +
        '<aside class="dv-side dv-side-wide">' + (v ? dvVehForm(v) : '<div class="dv-side-empty"><p class="muted">Choose a vehicle to see its rego, insurance, tolls and service history.</p></div>') + '</aside></div>');
    } else if (v) {
      app.innerHTML = dvPage('<div class="dv-card">' + dvVehForm(v) + '</div>', ['#/vehicles', 'Vehicles']);
    } else {
      app.innerHTML = dvPage('<div class="dv-main">' + dvVehList('') + '</div>');
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-dvvf]'), function (b) { b.onclick = function () { dv.vfilter = b.getAttribute('data-dvvf'); drawVehicles(sel); }; });
    if (v) dvBindVehicle(v, sel);
  }
  function dvReadVehicle(v) {
    var out = { id: v.isNew ? '' : v.id };
    Array.prototype.forEach.call(document.querySelectorAll('[data-vf]'), function (el) { var k = el.getAttribute('data-vf'); if (k) out[k] = el.value.trim(); });
    return out;
  }
  function dvReloadVehicle(id) {
    return Promise.all([dvLoad(true), api({ action: 'vehicle', id: id }).then(function (d) { dv.veh[id] = d.vehicle; })]).then(function () {
      if (route().name === 'vehicles' && route().arg === id) drawVehicles(id);
    });
  }
  function dvBindVehicle(v, sel) {
    var err = document.getElementById('dvErr');
    function fail(e) { err.textContent = e.message; err.hidden = false; }
    document.getElementById('vfSave').onclick = function () {
      var btn = this; err.hidden = true; btn.disabled = true; btn.textContent = 'Saving…';
      apiPost({ action: 'vehSave', vehicle: dvReadVehicle(v) }).then(function (r) {
        dv.vform = null;
        if (v.isNew) { location.hash = '#/vehicles/' + encodeURIComponent(r.id); return; }
        return dvReloadVehicle(r.id).then(function () { var s = document.getElementById('vfSave'); if (s) { s.textContent = 'Saved'; setTimeout(function () { if (s.isConnected) s.textContent = 'Save'; }, 1800); } });
      }).catch(function (e) { fail(e); btn.disabled = false; btn.textContent = 'Save'; });
    };
    var del = document.getElementById('vfDelete');
    if (del) del.onclick = function () {
      var name = v.model + (v.plate ? ' (' + v.plate + ')' : ' (no plate)');
      if (!confirm('Delete the ' + name + '?\n\nIt comes off the list, with its service history and odometer readings. Documents stay in Drive. This can\'t be undone.')) return;
      del.disabled = true; del.textContent = 'Deleting…'; err.hidden = true;
      apiPost({ action: 'vehDelete', vehicleId: v.id }).then(function () {
        delete dv.veh[v.id]; dv.vform = null; dv.svc = null;
        return dvLoad(true).then(function () { if (location.hash === '#/vehicles') drawVehicles(); else location.hash = '#/vehicles'; });
      }).catch(function (e) { fail(e); del.disabled = false; del.textContent = 'Delete vehicle'; });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-upkind]'), function (inp) {
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var lab = document.querySelector('label[for="' + inp.id + '"]'); if (lab) lab.textContent = 'Uploading…';
        var prep = dvPrep(f);
        prep.then(function (blob) { return toBase64(blob).then(function (data) {
          return apiPost({ action: 'vehUpload', vehicleId: v.id, kind: inp.getAttribute('data-upkind'), name: f.name, mime: blob.type || f.type, data: data });
        }); }).then(function () { return dvReloadVehicle(v.id); }).catch(function (e) { fail(e); if (lab) lab.textContent = 'Try again'; });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-rmdoc]'), function (b) {
      b.onclick = function () {
        if (!confirm('Remove this document from the vehicle? The file stays in Drive.')) return;
        apiPost({ action: 'vehDocRemove', vehicleId: v.id, docId: b.getAttribute('data-rmdoc') }).then(function () { return dvReloadVehicle(v.id); }).catch(fail);
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-rmsvc]'), function (b) {
      b.onclick = function () {
        if (!confirm('Delete this service entry?')) return;
        apiPost({ action: 'vehServiceDelete', serviceId: b.getAttribute('data-rmsvc') }).then(function () { return dvReloadVehicle(v.id); }).catch(fail);
      };
    });
    var open = document.getElementById('svOpen');
    if (open) open.onclick = function () { if (v.isNew) return; dv.vform = null; dv.svc = v.id; drawVehicles(sel); var k = document.getElementById('svKm'); if (k) k.focus(); };
    var cancel = document.getElementById('svCancel');
    if (cancel) cancel.onclick = function () { dv.svc = null; drawVehicles(sel); };
    var inv = document.getElementById('svInv'), invFile = null;
    if (inv) inv.addEventListener('change', function () { invFile = inv.files && inv.files[0]; document.getElementById('svInvName').textContent = invFile ? invFile.name : 'Attach the invoice (optional)'; });
    var save = document.getElementById('svSave');
    if (save) save.onclick = function () {
      var service = { date: document.getElementById('svDate').value, km: document.getElementById('svKm').value, workshop: document.getElementById('svShop').value,
        cost: document.getElementById('svCost').value, work: document.getElementById('svWork').value };
      save.disabled = true; save.textContent = invFile ? 'Uploading invoice…' : 'Saving…'; err.hidden = true;
      var up = invFile ? dvPrep(invFile).then(function (blob) {
        return toBase64(blob).then(function (data) { return apiPost({ action: 'vehUpload', vehicleId: v.id, kind: 'invoice', name: invFile.name, mime: blob.type || invFile.type, data: data }); });
      }).then(function (r) { service.invoice = r.doc.url; }) : Promise.resolve();
      up.then(function () { return apiPost({ action: 'vehService', vehicleId: v.id, service: service }); })
        .then(function () { dv.svc = null; return dvReloadVehicle(v.id); })
        .catch(function (e) { fail(e); save.disabled = false; save.textContent = 'Save service'; });
    };
    var own = document.getElementById('vfOwn');
    if (own) own.addEventListener('change', function () {
      var cur = Object.assign({}, v, dvReadVehicle(v), { isNew: v.isNew, id: v.id });
      if (v.isNew) dv.vform = cur; else dv.veh[v.id] = cur;
      drawVehicles(sel);
    });
    if (v.isNew) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-vf]'), function (el) {
        el.addEventListener('input', function () { dv.vform = Object.assign(dvBlankVehicle(), dvReadVehicle(v), { isNew: true }); });
      });
    }
  }

  /* My vehicle (drivers): weekly odometer */
  function renderMyVehicle() {
    app.innerHTML = staffPage('me', '<section class="section"><p class="muted">Loading your vehicle…</p></section>', ['#/me', 'Me']);
    api({ action: 'myVehicle' }).then(function (d) { state.user = d.user || state.user; drawMyVehicle(d.vehicles || []); }, function (e) { showError(e, renderMyVehicle); });
  }
  function drawMyVehicle(list, msg) {
    var body = '<section class="hero"><span class="small" style="font-weight:700">' + esc((state.user || {}).name || '') + '</span><h1>My vehicle</h1>' +
      '<span class="small">Enter your odometer once a week. It keeps the service reminders right.</span></section>';
    if (!list.length) body += '<section class="section"><p class="notice">No vehicle is set up for you. If that\'s wrong, let Simon or Troy know.</p></section>';
    list.forEach(function (v) {
      body += '<section class="section stack" style="gap:12px;max-width:560px"><div class="dv-mycar"><b>' + esc(v.model) + '</b>' + (v.plate ? '<span class="dv-plate">' + esc(v.plate) + '</span>' : '') + '</div>' +
        '<p class="small" style="margin:0">' + (v.odometer ? 'Last reading: <b>' + esc(dvKm(v.odometer)) + '</b> on ' + esc(dvFmtDate(v.odometerDate)) : 'No reading yet.') + '</p>' +
        (v.roadsidePhone ? '<a class="btn btn-outline" href="tel:' + esc(dvTel(v.roadsidePhone)) + '">' + I.phone + 'Roadside assist: ' + esc(v.roadsideProvider || '') + ' ' + esc(v.roadsidePhone) + '</a>' +
          '<p class="small muted" style="margin:0">Quote the plate' + (v.plate ? ' <b>' + esc(v.plate) + '</b>' : '') + ' when you call.</p>' : '') +
        (v.staffOwned ? '<p class="small muted" style="margin:0">Your own car, listed for work. Odometer readings are optional.</p>' :
        (v.odometerDue ? '<p class="st-note" style="margin:0">This week\'s reading is due.</p>' : '<p class="small muted" style="margin:0">Done for this week. Thanks.</p>')) +
        (v.service && (v.service.level === 'warn' || v.service.level === 'bad') ? '<p class="notice' + (v.service.level === 'bad' ? ' error' : '') + '" style="margin:0">Service ' + (v.service.level === 'bad' ? 'overdue' : 'due soon') +
          (v.nextServiceDate ? ': ' + esc(dvFmtDate(v.nextServiceDate)) : '') + (v.nextServiceKm ? ' or at ' + esc(dvKm(v.nextServiceKm)) : '') + '. Simon and Troy know.</p>' : '') +
        '<div class="field"><label for="odo-' + esc(v.id) + '">Odometer now (km)</label><div class="st-addrow"><input id="odo-' + esc(v.id) + '" type="text" inputmode="numeric" placeholder="e.g. 119250">' +
        '<button type="button" class="btn btn-dark" data-odo="' + esc(v.id) + '">Save</button></div></div></section>';
    });
    if (msg) body += '<div class="section">' + msg + '</div>';
    body += '<div style="height:32px"></div>';
    app.innerHTML = staffPage('me', body, ['#/me', 'Me']);
    Array.prototype.forEach.call(document.querySelectorAll('[data-odo]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-odo'), km = document.getElementById('odo-' + id).value;
        b.disabled = true; b.textContent = 'Saving…';
        apiPost({ action: 'odoAdd', vehicleId: id, km: km }).then(function (r) {
          state.stHome = null;
          drawMyVehicle(r.vehicles || [], '<p class="notice">Saved. Thanks.</p>');
        }).catch(function (e) {
          if (/lower than the last reading/.test(e.message) && confirm(e.message + '\n\nSave it anyway?')) {
            return apiPost({ action: 'odoAdd', vehicleId: id, km: km, confirmLower: true }).then(function (r) { drawMyVehicle(r.vehicles || [], '<p class="notice">Saved. Thanks.</p>'); });
          }
          drawMyVehicle(list, stErr(e.message));
        });
      };
    });
  }

  /* My to do */
  var td = { data: null, tab: 'mine', draft: { text: '', due: '', high: false, linkType: '', linkNo: '', priv: false }, more: false, edit: null, sharePeople: null };
  function renderTodo() {
    if (!td.data) loading('Loading your list…');
    api({ action: 'todo' }).then(function (d) { state.user = d.user || state.user; td.data = d.todo; td.sharePeople = null; drawTodo(); },
      function (e) { if (td.data) drawTodo(e.message); else showError(e, renderTodo); });
  }
  function linkFields(prefix, v, types) {
    return '<div class="st-grid2"><div class="field"><label for="' + prefix + 'LT">Link to</label><select id="' + prefix + 'LT"><option value="">Nothing</option>' +
      types.map(function (t) { return '<option' + (v.linkType === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="' + prefix + 'LN">Number</label><input id="' + prefix + 'LN" inputmode="numeric" placeholder="e.g. 28874" value="' + esc(v.linkNo || '') + '"></div></div>' +
      '<div class="st-grid2"><div class="field"><label for="' + prefix + 'Due">Due date</label><input id="' + prefix + 'Due" type="date" value="' + esc(v.due || '') + '"></div>' +
      '<div class="field st-checks"><label class="st-check"><input type="checkbox" id="' + prefix + 'High"' + (v.high ? ' checked' : '') + '> High priority</label>' +
      '<label class="st-check"><input type="checkbox" id="' + prefix + 'Priv"' + (v.priv ? ' checked' : '') + '> Private, never shared</label></div></div>';
  }
  function readTaskFields(prefix, into) {
    var g = function (id) { return document.getElementById(prefix + id); };
    if (g('LT')) { into.linkType = g('LT').value; into.linkNo = g('LN').value.trim(); into.due = g('Due').value; into.high = g('High').checked; into.priv = g('Priv').checked; }
    return into;
  }
  function drawTodo(errMsg) {
    var d = td.data, t = todayStr();
    var open = d.mine.filter(function (x) { return !x.done; });
    var sum = { private: 'Private to you', people: d.sharing.people.length ? 'Shared with ' + d.sharing.people.length + (d.sharing.people.length === 1 ? ' person' : ' people') : 'Pick who can see it', office: 'Shared with the office', everyone: 'Shared with everyone' }[d.sharing.mode];
    var sorted = open.slice().sort(function (a, b) {
      var ad = a.due || '9999', bd = b.due || '9999';
      if (a.high !== b.high && (ad <= t) === (bd <= t)) return a.high ? -1 : 1;
      return ad < bd ? -1 : ad > bd ? 1 : (a.created < b.created ? 1 : -1);
    });
    var done = d.mine.filter(function (x) { return x.done; }).slice(-10).reverse();
    var body = '<section class="section stack" style="gap:6px"><h1>My to do</h1><p class="muted" style="margin:0">' + open.length + (open.length === 1 ? ' task open' : ' tasks open') + ' · ' + esc(sum) + '</p></section>';
    body += '<section class="st-add" aria-label="Add a task"><div class="st-addrow"><label for="tdText" class="sr-only">New task</label>' +
      '<input id="tdText" placeholder="Add a task…" value="' + esc(td.draft.text) + '" autocomplete="off">' +
      (speechSupported() ? '<button type="button" class="btn btn-dark sq" id="tdMic" aria-pressed="false" aria-label="Fill by voice">' + I.mic + '</button>' : '') +
      '<button type="button" class="btn st-btn-blue" id="tdAdd">Add</button></div>' +
      (td.more ? linkFields('tdN', td.draft, d.linkTypes) : '') +
      '<button type="button" class="link-btn" id="tdMore" aria-expanded="' + td.more + '">' + (td.more ? 'Fewer options' : 'Link to a project, opportunity, quotation or sales order, or set a date') + '</button></section>';
    if (errMsg) body += '<div class="section">' + stErr(errMsg) + '</div>';
    body += '<div class="section" style="padding-top:16px"><div class="seg" role="group" aria-label="Lists"><button type="button" data-tab="mine" aria-pressed="' + (td.tab === 'mine') + '">My list</button>' +
      '<button type="button" data-tab="shared" aria-pressed="' + (td.tab === 'shared') + '">Shared with me (' + d.shared.length + ')</button></div></div>';
    if (td.tab === 'mine') {
      var item = function (x) {
        var editing = td.edit === x.id;
        return '<li class="st-task' + (x.done ? ' is-done' : '') + '"><button type="button" class="st-box" data-toggle="' + esc(x.id) + '" aria-pressed="' + x.done + '" aria-label="' + (x.done ? 'Mark as not done: ' : 'Mark as done: ') + esc(x.text) + '"><span>' + (x.done ? I.check : '') + '</span></button>' +
          '<div class="st-task-body"><span class="st-task-text">' + esc(x.text) + '</span><div class="st-chips">' + (x.done ? '' : dueChip(x.due)) +
          (x.high && !x.done ? '<span class="tag st-tag-black">High priority</span>' : '') + (x.linkNo ? '<span class="tag tag-blue">' + esc((x.linkType || 'Project') + ' ' + x.linkNo) + '</span>' : '') +
          (x.priv ? '<span class="tag">Private</span>' : '') + '</div>' +
          (editing ? '<div class="st-edit stack" style="gap:12px"><div class="field"><label for="tdEText">Task</label><input id="tdEText" value="' + esc(x.text) + '"></div>' + linkFields('tdE', x, d.linkTypes) +
            '<div class="row" style="gap:8px"><button type="button" class="btn btn-dark" data-save="' + esc(x.id) + '">Save</button><button type="button" class="btn btn-sand" data-cancel>Cancel</button>' +
            '<button type="button" class="btn btn-outline" data-del="' + esc(x.id) + '" style="margin-left:auto">Delete</button></div></div>' : '') +
          '</div>' + (editing ? '' : '<button type="button" class="icon-btn" data-edit="' + esc(x.id) + '" aria-label="Edit: ' + esc(x.text) + '">' + I.pencil + '</button>') + '</li>';
      };
      body += '<section class="section"><ul class="st-tasks">' + (sorted.length ? sorted.map(item).join('') : '<li class="muted small" style="padding:8px">Nothing on your list. Add a task above.</li>') + '</ul>' +
        (done.length ? '<h2 class="st-h2">Done</h2><ul class="st-tasks">' + done.map(item).join('') + '</ul>' : '') + '</section>';
      var mode = d.sharing.mode, people = td.sharePeople || d.sharing.people;
      var opts = [['private', 'Only me', 'Nobody else can see your list.'], ['people', 'Specific people', 'Pick who can see it.'], ['office', 'Office', 'Office staff and the project managers.'], ['everyone', 'Everyone at Blindmaster', 'Every signed-in staff member.']];
      body += '<section class="section"><div class="st-share stack" role="radiogroup" aria-label="Who can see my list"><h2 class="st-h2" style="margin:0 0 4px">Who can see my list</h2>' +
        opts.map(function (o) { return '<button type="button" role="radio" class="st-radio" data-mode="' + o[0] + '" aria-checked="' + (mode === o[0]) + '"><span class="dot"></span><span class="stack" style="gap:2px"><b>' + o[1] + '</b><span class="small">' + o[2] + '</span></span></button>'; }).join('') +
        (mode === 'people' ? '<div class="st-people">' + d.staff.map(function (p) { return '<label class="st-check"><input type="checkbox" data-person="' + esc(p.email) + '"' + (people.indexOf(p.email) >= 0 ? ' checked' : '') + '> ' + esc(p.name) + '</label>'; }).join('') +
          '<button type="button" class="btn btn-dark" id="tdPeopleSave">Save who can see it</button></div>' : '') +
        '<p class="st-note">People you share with can look, not edit. A task marked private is never shown to anyone else.</p></div></section>';
    } else {
      body += '<section class="section stack" style="gap:16px">' + (d.shared.length ? d.shared.map(function (o) {
        return '<div class="st-shared"><p class="st-note" style="margin:0">' + esc(firstName(o.name)) + '\'s list, view only.</p>' + (o.tasks.length ? o.tasks.map(function (x) {
          return '<div class="st-task-ro"><span class="st-task-text">' + esc(x.text) + '</span><div class="st-chips">' + dueChip(x.due) + (x.high ? '<span class="tag st-tag-black">High priority</span>' : '') +
            (x.linkNo ? '<span class="tag tag-blue">' + esc((x.linkType || 'Project') + ' ' + x.linkNo) + '</span>' : '') + '</div></div>';
        }).join('') : '<p class="small muted" style="margin:0">Nothing open.</p>') + '</div>';
      }).join('') : '<div class="empty" style="margin:0"><p class="muted" style="margin:0">Nobody has shared their list with you yet.</p></div>') + '</section>';
    }
    body += '<div style="height:32px"></div>';
    var y = window.scrollY;
    app.innerHTML = staffPage('me', body, ['#/me', 'Me']);
    window.scrollTo(0, y);
    bindTodo();
  }
  function bindTodo() {
    var d = td.data;
    var text = document.getElementById('tdText');
    text.oninput = function () { td.draft.text = text.value; };
    text.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('tdAdd').click(); } };
    var mic = document.getElementById('tdMic');
    if (mic) mic.onclick = function () { toggleDictation(mic, text, function () { td.draft.text = text.value; }); };
    document.getElementById('tdMore').onclick = function () { readTaskFields('tdN', td.draft); td.more = !td.more; drawTodo(); };
    document.getElementById('tdAdd').onclick = function () {
      readTaskFields('tdN', td.draft);
      var v = td.draft; if (!v.text.trim()) { text.focus(); return; }
      var btn = this; btn.disabled = true;
      apiPost({ action: 'todoAdd', text: v.text.trim(), due: v.due, high: v.high, linkType: v.linkType, linkNo: v.linkNo, priv: v.priv }).then(function (r) {
        d.mine.push(r.task); td.draft = { text: '', due: '', high: false, linkType: '', linkNo: '', priv: false }; td.more = false; drawTodo();
        var t = document.getElementById('tdText'); if (t) t.focus();
      }, function (e) { btn.disabled = false; drawTodo(e.message); });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) { b.onclick = function () { td.tab = b.getAttribute('data-tab'); td.edit = null; drawTodo(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle]'), function (b) {
      b.onclick = function () {
        var x = d.mine.filter(function (k) { return k.id === b.getAttribute('data-toggle'); })[0]; if (!x) return;
        x.done = !x.done; drawTodo();
        apiPost({ action: 'todoUpdate', id: x.id, fields: { done: x.done } }).catch(function (e) { x.done = !x.done; drawTodo(e.message); });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) { b.onclick = function () { td.edit = b.getAttribute('data-edit'); drawTodo(); var i = document.getElementById('tdEText'); if (i) i.focus(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cancel]'), function (b) { b.onclick = function () { td.edit = null; drawTodo(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-save]'), function (b) {
      b.onclick = function () {
        var x = d.mine.filter(function (k) { return k.id === b.getAttribute('data-save'); })[0];
        var f = readTaskFields('tdE', { text: document.getElementById('tdEText').value.trim() });
        if (!f.text) return;
        b.disabled = true;
        apiPost({ action: 'todoUpdate', id: x.id, fields: f }).then(function () { Object.assign(x, f); td.edit = null; drawTodo(); }, function (e) { b.disabled = false; drawTodo(e.message); });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (b) {
      b.onclick = function () {
        if (!confirm('Delete this task?')) return;
        var id = b.getAttribute('data-del'); b.disabled = true;
        apiPost({ action: 'todoDelete', id: id }).then(function () { d.mine = d.mine.filter(function (k) { return k.id !== id; }); td.edit = null; drawTodo(); }, function (e) { b.disabled = false; drawTodo(e.message); });
      };
    });
    function saveSharing(mode, people) {
      var prev = { mode: d.sharing.mode, people: d.sharing.people };
      d.sharing = { mode: mode, people: people || [] }; drawTodo();
      return apiPost({ action: 'todoSharing', mode: mode, people: people || [] }).then(function (r) { d.sharing = r.sharing; td.sharePeople = null; drawTodo(); },
        function (e) { d.sharing = prev; drawTodo(e.message); });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      b.onclick = function () {
        var m = b.getAttribute('data-mode');
        if (m === 'people') { td.sharePeople = d.sharing.people.slice(); d.sharing = { mode: 'people', people: d.sharing.people }; drawTodo(); return; }
        saveSharing(m);
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-person]'), function (c) {
      c.onchange = function () {
        var e = c.getAttribute('data-person'), list = td.sharePeople || [];
        td.sharePeople = c.checked ? list.concat([e]) : list.filter(function (x) { return x !== e; });
      };
    });
    var ps = document.getElementById('tdPeopleSave');
    if (ps) ps.onclick = function () {
      if (!(td.sharePeople || []).length) { alert('Tick at least one person.'); return; }
      saveSharing('people', td.sharePeople);
    };
  }

  /* Leave */
  var LV_STATUS = { Pending: ['Waiting for approval', ''], Approved: ['Approved', 'tag-blue'], Declined: ['Declined', 'tag-dark'], Cancelled: ['Cancelled', 'tag-light'] };
  function lvWhen(l) {
    if (l.part) return shortDate(l.first) + ', ' + l.from + (l.to ? ' – ' + l.to : ' onwards');
    return l.first === l.last ? shortDate(l.first) : shortDate(l.first) + ' – ' + shortDate(l.last);
  }
  function lvTotal(l) { return l.part ? l.hours + ' hours' : l.days + (l.days === 1 ? ' working day' : ' working days') + ' (' + l.hours + ' h)'; }
  function lvRow(l, who) {
    var s = LV_STATUS[l.status] || [l.status, ''];
    return '<a class="st-row" href="#/leave/' + encodeURIComponent(l.id) + '"><span class="st-txt"><b>' + esc(who ? l.name + ': ' + l.type.toLowerCase() : l.type) + '</b><span>' + esc(lvWhen(l) + ' · ' + lvTotal(l)) + '</span></span>' +
      '<span class="tag ' + s[1] + '">' + esc(s[0]) + '</span>' + I.right + '</a>';
  }
  function renderLeave() {
    loading('Loading leave…');
    api({ action: 'leave' }).then(function (d) {
      state.user = d.user || state.user;
      var L = d.leave;
      var body = '<section class="hero"><span class="small" style="font-weight:700">' + esc(L.approvers.join(' or ')) + ' approve' + (L.approvers.length === 1 ? 's' : '') + ' leave</span><h1>Leave</h1>' +
        '<a class="btn btn-dark btn-lg" href="#/leave/new" style="align-self:flex-start;margin-top:8px">Request leave</a></section>';
      if (L.can.approve) {
        body += '<section class="section stack" style="gap:8px"><h2>Waiting for you</h2>' + (L.toApprove.length ? L.toApprove.map(function (l) { return lvRow(l, true); }).join('') : '<p class="small muted" style="margin:0">Nothing to approve.</p>') + '</section>';
        if (L.upcoming.length) body += '<section class="section stack" style="gap:8px"><h2>Coming up</h2>' + L.upcoming.map(function (l) { return lvRow(l, true); }).join('') + '</section>';
      }
      body += '<section class="section stack" style="gap:8px"><h2>My requests</h2>' + (L.mine.length ? L.mine.map(function (l) { return lvRow(l, false); }).join('') : '<p class="small muted" style="margin:0">You haven\'t requested any leave in the app yet.</p>') + '</section><div style="height:32px"></div>';
      app.innerHTML = staffPage('me', body, ['#/me', 'Me']);
    }, function (e) { showError(e, renderLeave); });
  }

  var lvForm = null;
  function lvBlank() { return { type: 'Annual leave', reason: 'My own illness or injury', first: '', last: '', part: false, from: '', to: '', notes: '', files: [], confirm: false }; }
  function lvSaveDraft() { try { var c = Object.assign({}, lvForm, { files: [], confirm: false }); store('fa-leave-draft', c); } catch (e) {} }
  function renderLeaveNew() {
    if (!lvForm) lvForm = Object.assign(lvBlank(), store('fa-leave-draft') || {}, { files: [], confirm: false });
    var f = lvForm, u = state.user || {};
    var sick = /personal|sick|carer/i.test(f.type) && !/unpaid/i.test(f.type);
    var types = ['Annual leave', "Personal / carer's leave", "Unpaid carer's leave", 'Compassionate leave', 'Family and domestic violence leave', 'Long service leave', 'Parental leave',
      'Community service leave', 'Defence Reserve leave', 'Public holiday absence', 'Time off in lieu / RDO', 'Leave without pay', 'Other leave'];
    if (types.indexOf(f.type) < 0) f.type = 'Annual leave';
    var body = '<section class="hero"><span class="small" style="font-weight:700">' + esc(u.name || '') + ' · ' + esc(u.email || '') + '</span><h1>Request leave</h1>' +
      '<span class="small">It goes to the office to approve. You\'ll get an email either way.</span></section>';
    body += '<section class="section stack lv-form" style="gap:16px;max-width:560px">' +
      '<div class="field"><label for="lvType">Type of leave</label><select id="lvType">' + types.map(function (t) { return '<option' + (f.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      (sick ? '<div class="field"><label for="lvReason">Reason</label><select id="lvReason">' + ['My own illness or injury', 'Caring for a family or household member', 'Unexpected family or household emergency'].map(function (r) { return '<option' + (f.reason === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="st-grid2"><div class="field"><label for="lvFirst">' + (f.part ? 'Day' : 'First day') + '</label><input id="lvFirst" type="date" value="' + esc(f.first) + '"></div>' +
      (f.part ? '' : '<div class="field"><label for="lvLast">Last day</label><input id="lvLast" type="date" value="' + esc(f.last) + '" min="' + esc(f.first) + '"></div>') + '</div>' +
      '<label class="st-check"><input type="checkbox" id="lvPart"' + (f.part ? ' checked' : '') + '> Part day only (taking some hours, not the whole day)</label>' +
      (f.part ? '<div class="st-grid2"><div class="field"><label for="lvFrom">Leaving at</label><input id="lvFrom" type="time" value="' + esc(f.from) + '"></div><div class="field"><label for="lvTo">Back at</label><input id="lvTo" type="time" value="' + esc(f.to) + '"><span class="small muted">Leave blank if not back today</span></div></div>' : '') +
      '<div class="lv-total"><span>Total requested</span><b id="lvTotal">–</b></div>' +
      '<div class="lv-jobs" id="lvJobs" hidden></div>' +
      '<div class="field"><label for="lvNotes">Notes for the office</label><div class="st-addrow"><textarea id="lvNotes" rows="3" placeholder="Anything the office should know">' + esc(f.notes) + '</textarea>' +
        (speechSupported() ? '<button type="button" class="btn btn-dark sq" id="lvMic" aria-pressed="false" aria-label="Fill by voice">' + I.mic + '</button>' : '') + '</div></div>' +
      '<div class="field"><span class="lbl">Supporting documents ' + (sick ? '(a medical certificate or statutory declaration, if you have one)' : '(optional)') + '</span>' +
        f.files.map(function (x, i) { return '<div class="lv-file"><span>' + esc(x.name) + '</span><button type="button" class="icon-btn" data-rmfile="' + i + '" aria-label="Remove ' + esc(x.name) + '">' + I.x + '</button></div>'; }).join('') +
        '<label class="btn btn-sand" for="lvFile">' + I.camera + 'Add a photo or file</label><input type="file" id="lvFile" accept="image/*,application/pdf" multiple hidden></div>' +
      '<label class="st-check"><input type="checkbox" id="lvConfirm"' + (f.confirm ? ' checked' : '') + '> I confirm these details are true and correct.</label>' +
      '<p class="st-note" style="margin:0"><b>When you send it</b><br>The office gets a review request. Once it\'s approved it goes on your calendar, the planner shows you as away, and you\'re emailed.</p>' +
      '<p class="notice error" id="lvErr" role="alert" hidden></p>' +
      '<button type="button" class="btn btn-dark btn-lg" id="lvSend">Send request</button></section><div style="height:32px"></div>';
    app.innerHTML = staffPage('me', body, ['#/leave', 'Leave']);
    bindLeaveNew();
    lvRefresh();
  }
  var lvTimer = null, lvSeq = 0;
  function lvRefresh() {
    clearTimeout(lvTimer);
    var f = lvForm, tot = document.getElementById('lvTotal'), box = document.getElementById('lvJobs');
    if (!tot) return;
    var last = f.part ? f.first : f.last;
    if (!f.first || !last || last < f.first || (f.part && !f.from)) { tot.textContent = '–'; box.hidden = true; return; }
    tot.textContent = 'Checking…';
    var seq = ++lvSeq;
    lvTimer = setTimeout(function () {
      var q = { action: 'leaveJobs', first: f.first, last: last, from: f.from, to: f.to };
      if (f.part) q.part = '1';
      api(q).then(function (r) {
        if (seq !== lvSeq || !document.getElementById('lvTotal')) return;
        tot.textContent = r.totals ? (f.part ? r.totals.hours + ' hours' : r.totals.days + (r.totals.days === 1 ? ' working day' : ' working days') + ' (' + r.totals.hours + ' h)') : '–';
        box.hidden = false;
        box.innerHTML = '<b>' + (r.jobs.length ? r.jobs.length + (r.jobs.length === 1 ? ' booked job' : ' booked jobs') + ' in these dates' : 'No booked jobs in these dates') + '</b>' +
          (r.jobs.length ? '<span class="small">Found in your schedule. The office sees these on the approval and in the planner.</span>' + r.jobs.map(function (j) { return '<div class="lv-job"><b>' + esc(j.title) + '</b><span>' + esc(j.when + ' · ' + j.with) + '</span></div>'; }).join('') : '');
      }, function () { if (seq === lvSeq && document.getElementById('lvTotal')) tot.textContent = '–'; });
    }, 350);
  }
  function bindLeaveNew() {
    var f = lvForm, g = function (id) { return document.getElementById(id); };
    var redraw = function () { var y = window.scrollY; renderLeaveNew(); window.scrollTo(0, y); };
    g('lvType').onchange = function () { f.type = this.value; lvSaveDraft(); redraw(); };
    if (g('lvReason')) g('lvReason').onchange = function () { f.reason = this.value; lvSaveDraft(); };
    g('lvFirst').onchange = function () { f.first = this.value; if (!f.last || f.last < f.first) { f.last = f.first; if (g('lvLast')) g('lvLast').value = f.last; } if (g('lvLast')) g('lvLast').min = f.first; lvSaveDraft(); lvRefresh(); };
    if (g('lvLast')) g('lvLast').onchange = function () { f.last = this.value; lvSaveDraft(); lvRefresh(); };
    g('lvPart').onchange = function () { f.part = this.checked; if (f.part) f.last = f.first; lvSaveDraft(); redraw(); };
    if (g('lvFrom')) g('lvFrom').onchange = function () { f.from = this.value; lvSaveDraft(); lvRefresh(); };
    if (g('lvTo')) g('lvTo').onchange = function () { f.to = this.value; lvSaveDraft(); lvRefresh(); };
    g('lvNotes').oninput = function () { f.notes = this.value; lvSaveDraft(); };
    if (g('lvMic')) g('lvMic').onclick = function () { var ta = g('lvNotes'); toggleDictation(g('lvMic'), ta, function () { f.notes = ta.value; lvSaveDraft(); }); };
    g('lvConfirm').onchange = function () { f.confirm = this.checked; };
    g('lvFile').onchange = function () {
      var files = Array.prototype.slice.call(this.files || []);
      Promise.all(files.map(function (file) {
        if (file.size > 10 * 1024 * 1024) { alert(file.name + ' is over 10 MB.'); return null; }
        var isImg = /^image\//.test(file.type);
        return (isImg ? shrinkImage(file).then(function (i) { return i.blob; }) : Promise.resolve(file)).then(toBase64).then(function (b64) {
          return { name: file.name, mime: isImg ? 'image/jpeg' : (file.type || 'application/pdf'), data: b64 };
        });
      })).then(function (list) { f.files = f.files.concat(list.filter(Boolean)).slice(0, 5); redraw(); }, function () { alert('That file couldn\'t be read.'); });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-rmfile]'), function (b) { b.onclick = function () { f.files.splice(Number(b.getAttribute('data-rmfile')), 1); redraw(); }; });
    g('lvSend').onclick = function () {
      var err = g('lvErr'), btn = this, last = f.part ? f.first : f.last;
      var msg = !f.first ? 'Pick the ' + (f.part ? 'day.' : 'first day.') : !last ? 'Pick the last day.' : last < f.first ? 'The last day is before the first day.' : (f.part && !f.from) ? 'Add the time you\'re leaving.' : !f.confirm ? 'Tick to confirm the details are correct.' : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      err.hidden = true; btn.disabled = true; btn.textContent = 'Sending…';
      apiPost({ action: 'leaveSubmit', type: f.type, reason: f.reason, first: f.first, last: last, part: f.part, from: f.from, to: f.to, notes: f.notes, files: f.files, confirm: true }).then(function (r) {
        unstore('fa-leave-draft'); lvForm = null; state.lvSent = r.id; state.stHome = null;
        location.hash = '#/leave/' + encodeURIComponent(r.id);
      }, function (e) { btn.disabled = false; btn.textContent = 'Send request'; err.textContent = e.message || 'Couldn\'t send it. Try again.'; err.hidden = false; });
    };
  }

  function renderLeaveItem(id) {
    loading('Loading the request…');
    api({ action: 'leaveItem', id: id }).then(function (d) {
      state.user = d.user || state.user;
      var l = d.item, s = LV_STATUS[l.status] || [l.status, ''];
      var mine = l.email === ((state.user || {}).email);
      var sent = state.lvSent === l.id; state.lvSent = null;
      var body = '<section class="hero"><span class="small" style="font-weight:700">' + esc(l.status === 'Pending' ? 'Waiting for approval · sent ' + shortDate(l.sent.slice(0, 10)) : s[0] + (l.decidedBy ? ' by ' + l.decidedBy : '')) + '</span>' +
        '<h1>' + esc((mine ? '' : l.name + ': ') + l.type) + '</h1><span>' + esc(lvWhen(l)) + '</span></section>';
      if (sent) body += '<div class="section"><p class="notice" role="status" style="margin:0">Sent. The office has been emailed and you\'ll hear back by email.</p></div>';
      body += '<section class="section"><dl class="lv-dl"><dt>Total</dt><dd>' + esc(lvTotal(l)) + '</dd>' + (l.reason ? '<dt>Reason</dt><dd>' + esc(l.reason) + '</dd>' : '') +
        '<dt>Notes</dt><dd>' + esc(l.notes || '–') + '</dd><dt>Documents</dt><dd>' + (l.docs.length ? l.docs.map(function (u, i) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">Document ' + (i + 1) + '</a>'; }).join(', ') : 'None') + '</dd>' +
        (l.canDecide || !mine ? '<dt>Also away</dt><dd>' + esc(l.alsoAway.length ? l.alsoAway.join(', ') : 'Nobody else on leave those days') + '</dd>' : '') +
        (l.decisionNote ? '<dt>Note</dt><dd>' + esc(l.decisionNote) + '</dd>' : '') + '</dl></section>';
      if (l.jobs.length) body += '<section class="section"><div class="lv-jobs"><b>' + l.jobs.length + (l.jobs.length === 1 ? ' booked job' : ' booked jobs') + (l.status === 'Declined' || l.status === 'Cancelled' ? ' in these dates' : ' need' + (l.jobs.length === 1 ? 's' : '') + ' another installer') + '</b>' +
        l.jobs.map(function (j) { return '<div class="lv-job row" style="justify-content:space-between"><span class="stack" style="gap:2px"><b>' + esc(j.title) + '</b><span>' + esc(j.when + ' · ' + j.with) + '</span></span>' + (canSchedule() ? '<a class="btn btn-light" href="#/planner/' + esc(j.date) + '">Planner</a>' : '') + '</div>'; }).join('') + '</div></section>';
      if (l.canDecide) body += '<section class="section stack" style="gap:12px"><div class="field"><label for="lvNote">Note to ' + esc(firstName(l.name)) + ' (needed if you decline)</label><input id="lvNote" placeholder="Optional"></div>' +
        '<p class="notice error" id="lvErr" role="alert" hidden></p><div class="st-grid2"><button type="button" class="btn btn-outline btn-lg" data-decide="decline">Decline</button><button type="button" class="btn btn-dark btn-lg" data-decide="approve">Approve</button></div></section>';
      if (l.canCancel) body += '<section class="section"><button type="button" class="btn btn-outline btn-lg" id="lvCancel">Cancel this request</button></section>';
      body += '<div style="height:32px"></div>';
      app.innerHTML = staffPage('me', body, ['#/leave', 'Leave']);
      Array.prototype.forEach.call(document.querySelectorAll('[data-decide]'), function (b) {
        b.onclick = function () {
          var dec = b.getAttribute('data-decide'), note = document.getElementById('lvNote').value.trim(), err = document.getElementById('lvErr');
          if (dec === 'decline' && !note) { err.textContent = 'Add a note to say why it\'s declined.'; err.hidden = false; return; }
          Array.prototype.forEach.call(document.querySelectorAll('[data-decide]'), function (x) { x.disabled = true; });
          apiPost({ action: 'leaveDecide', id: l.id, decision: dec, note: note }).then(function () { state.stHome = null; renderLeaveItem(l.id); },
            function (e) { Array.prototype.forEach.call(document.querySelectorAll('[data-decide]'), function (x) { x.disabled = false; }); err.textContent = e.message; err.hidden = false; });
        };
      });
      var c = document.getElementById('lvCancel');
      if (c) c.onclick = function () {
        if (!confirm('Cancel this leave request?' + (l.status === 'Approved' ? ' It comes off the calendar and the office is told.' : ''))) return;
        c.disabled = true;
        apiPost({ action: 'leaveCancel', id: l.id }).then(function () { state.stHome = null; renderLeaveItem(l.id); }, function (e) { c.disabled = false; alert(e.message); });
      };
    }, function (e) { showError(e, function () { renderLeaveItem(id); }); });
  }

  /* Clock in / out */
  var clockTick = null;
  function renderClock() {
    loading('Loading…');
    api({ action: 'clock' }).then(function (d) { state.user = d.user || state.user; drawClock(d.clock); }, function (e) { showError(e, renderClock); });
  }
  function drawClock(c, errMsg) {
    var u = state.user || {}, inn = !!c.in;
    var body = '<section class="ck-face"><span class="ck-time" id="ckTime">' + hhmm(new Date()) + '</span><span>' + esc(longDate(todayStr())) + '</span></section>' +
      '<section class="section stack" style="gap:12px"><p role="status" class="ck-state">' + (inn ? 'Clocked in since ' + esc(hhmm(new Date(c.in.since))) + '.' : 'You are clocked out.') + '</p>' +
      '<button type="button" class="ck-btn ' + (inn ? 'is-out' : 'is-in') + '" id="ckBtn">' + (inn ? 'CLOCK OUT' : 'CLOCK IN') + '</button>' +
      (errMsg ? stErr(errMsg) : '') + '</section>' +
      '<section class="section"><div class="ck-hours"><div><span>Today</span><b id="ckToday">' + hm(c.todayMin) + '</b></div><div><span>This week</span><b id="ckWeek">' + hm(c.weekMin) + '</b></div></div></section>' +
      (c.recent.length ? '<section class="section stack" style="gap:6px"><h2 class="st-h2">Recent</h2>' + c.recent.map(function (r) {
        return '<div class="ck-rec"><span>' + esc(shortDate(r.date)) + '</span><span>' + esc(r.in + ' – ' + (r.out || 'now')) + '</span><b>' + hm(r.min) + '</b>' + (r.flag ? '<span class="tag" title="' + esc(r.flag) + '">!</span>' : '') + '</div>';
      }).join('') + '</section>' : '') +
      '<section class="section"><p class="st-note" style="margin:0">Signed in as ' + esc(firstName(u.name)) + ', so there\'s no PIN. Forgot to clock out? Tell the office and they\'ll fix it on the timesheet.</p></section><div style="height:32px"></div>';
    app.innerHTML = staffPage('me', body, ['#/me', 'Me']);
    clearInterval(clockTick);
    var t0 = Date.now();
    clockTick = setInterval(function () {
      var el = document.getElementById('ckTime');
      if (!el) { clearInterval(clockTick); return; }
      el.textContent = hhmm(new Date());
      if (inn) { var add = (Date.now() - t0) / 60000; document.getElementById('ckToday').textContent = hm(c.todayMin + add); document.getElementById('ckWeek').textContent = hm(c.weekMin + add); }
    }, 15000);
    document.getElementById('ckBtn').onclick = function () {
      var btn = this; btn.disabled = true; btn.textContent = 'Checking location…';
      locate().then(function (pos) {
        btn.textContent = inn ? 'Clocking out…' : 'Clocking in…';
        return apiPost(Object.assign({ action: inn ? 'clockOut' : 'clockIn' }, pos));
      }).then(function (r) { state.stHome = null; drawClock(r.clock); }, function (e) { drawClock(c, e.message || 'Couldn\'t save. Try again.'); });
    };
  }
  /** Current position, or the reason there isn't one (never rejects: the server flags a missing location). */
  function locate() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve({ locError: 'not supported' });
      navigator.geolocation.getCurrentPosition(function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
        function (e) { resolve({ locError: e.code === 1 ? 'permission denied' : 'unavailable' }); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
    });
  }

  /* Team hours (managers) */
  function renderHours(from) {
    loading('Loading hours…');
    api({ action: 'hours', from: from || '' }).then(function (d) {
      state.user = d.user || state.user;
      var H = d.hours, t = todayStr();
      var dayHead = function (day) { return new Date(day + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' }) + '<br><span class="small">' + new Date(day + 'T12:00:00').getDate() + '</span>'; };
      var awayOn = function (email, day) { return H.away.some(function (a) { return a.email === email && a.first <= day && a.last >= day; }); };
      var body = '<section class="section stack" style="gap:8px"><h1>Team hours</h1>' +
        '<div class="row" style="gap:8px"><a class="btn btn-sand sq" href="#/hours/' + addDays(H.from, -7) + '" aria-label="Previous week">' + I.left + '</a>' +
        '<b style="flex:1;text-align:center">' + esc(shortDate(H.from) + ' – ' + shortDate(H.days[6])) + '</b>' +
        '<a class="btn btn-sand sq" href="#/hours/' + addDays(H.from, 7) + '" aria-label="Next week">' + I.right + '</a></div></section>';
      body += '<section class="section"><div class="hr-wrap"><table class="hr-table"><thead><tr><th scope="col">Person</th>' + H.days.map(function (day) { return '<th scope="col"' + (day === t ? ' class="is-today"' : '') + '>' + dayHead(day) + '</th>'; }).join('') + '<th scope="col">Total</th></tr></thead><tbody>' +
        (H.people.length ? H.people.map(function (p) {
          return '<tr><th scope="row">' + esc(p.name) + '</th>' + H.days.map(function (day) {
            var m = p.days[day], flag = p.entries.some(function (e) { return e.date === day && e.flag; }), open = p.entries.some(function (e) { return e.date === day && e.open; });
            return '<td' + (day === t ? ' class="is-today"' : '') + '>' + (m ? Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2) : awayOn(p.email, day) ? '<span class="small">Leave</span>' : '–') + (open ? ' <span class="small">in</span>' : '') + (flag ? ' <b class="hr-flag" title="Check: see below">!</b>' : '') + '</td>';
          }).join('') + '<td><b>' + hm(p.totalMin) + '</b></td></tr>';
        }).join('') : '<tr><td colspan="9" class="muted">No warehouse staff on the staff list yet.</td></tr>') + '</tbody></table></div></section>';
      var flagged = [];
      H.people.forEach(function (p) { p.entries.forEach(function (e) { if (e.flag) flagged.push({ name: p.name, e: e }); }); });
      if (flagged.length) body += '<section class="section stack" style="gap:6px"><h2 class="st-h2">To check</h2>' + flagged.map(function (f) {
        return '<div class="ck-rec"><span>' + esc(firstName(f.name) + ' · ' + shortDate(f.e.date)) + '</span><span>' + esc(f.e.in + ' – ' + (f.e.out || 'now')) + '</span><span class="small">' + esc(f.e.flag) + '</span></div>';
      }).join('') + '</section>';
      body += '<section class="section"><a class="btn btn-sand btn-lg" href="' + esc(H.sheetUrl) + '" target="_blank" rel="noopener">' + I.ext + 'Open the timesheet to fix a time</a><p class="small muted" style="margin:8px 0 0">Opens the Bundy Clock Time Log. Fix the time in the Timestamp column and it shows here on refresh.</p></section><div style="height:32px"></div>';
      app.innerHTML = staffPage('me', body, ['#/me', 'Me']);
    }, function (e) { showError(e, function () { renderHours(from); }); });
  }

  /* ---------- account ---------- */

  function renderAccount() {
    var u = state.user || store('fa-user') || { name: (session() || {}).email, email: (session() || {}).email };
    var body = '<section class="section stack" style="gap:16px;max-width:560px">' +
        '<div class="row"><span class="avatar" style="width:56px;height:56px;border-radius:28px">' + esc(initials(u.name)) + '</span>' +
        '<div class="stack" style="gap:2px"><h2>' + esc(u.name || '') + '</h2><span class="small muted">' + esc(u.email || '') + '</span></div></div>' +
        (u.role ? '<span class="tag" style="align-self:flex-start">' + esc(roleLabel(u.role)) + '</span>' : '') +
        (u.staffWarning ? '<p class="notice error" role="alert" style="margin:0">' + esc(u.staffWarning) + '</p>' : '') +
        (CFG.ENVIRONMENT ? '<p class="notice" style="margin:0">You are using the <b>' + esc(CFG.ENVIRONMENT) + '</b> version. Appointments here are test data.</p>' : '') +
        (realOffice() ? '<div class="vas-pick stack" style="gap:8px"><label for="vasSel"><b>View as</b></label>' +
          '<span class="small muted">See how the app is laid out for each role. It still shows only your own appointments, and it\'s view only: switch back to make changes.</span>' +
          '<select id="vasSel">' + [['', 'My view (' + roleLabel(u.realRole || u.role) + ')'], ['installer', 'Installer'], ['sales', 'Sales and projects'], ['pm', 'Project manager'], ['warehouse', 'Warehouse']].map(function (o) {
            return '<option value="' + o[0] + '"' + ((u.viewing ? u.role : '') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' +
          (u.viewing ? '<button type="button" class="btn btn-dark btn-lg" data-vas-back>Back to my view</button>' : '') +
          '</div>' : '') +
        '<button class="btn btn-outline btn-lg" id="signout">Sign out</button>' +
        '<p class="small muted" style="margin:0">App version ' + APP_VERSION + '</p>' +
        '<p class="small muted" style="margin:0">Add this app to your home screen: in Safari tap Share, then Add to Home Screen. In Chrome tap the menu, then Install app.</p>' +
      '</section>';
    app.innerHTML = wide() ? shell('me', null, body) : topbar({ back: '#/me', backLabel: 'Me' }) + '<main>' + body + '</main>' + tabbar('me');
    document.getElementById('signout').onclick = signOut;
    var sel = document.getElementById('vasSel');
    if (sel) sel.onchange = function () { setViewAs(sel.value); };
  }

  /* ---------- start ---------- */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-addtodo]');
    if (t) {
      e.preventDefault();
      var text = (prompt('To-do for ' + t.getAttribute('data-title') + ':') || '').trim();
      if (!text) return;
      var jr = t.getAttribute('data-jr'), opp = t.getAttribute('data-opp');
      t.disabled = true; t.textContent = 'Adding…';
      apiPost({ action: 'todoAdd', text: text + ' (' + t.getAttribute('data-title') + ')', due: t.getAttribute('data-date'), linkType: jr ? 'Project' : opp ? 'Opportunity' : '', linkNo: jr || opp })
        .then(function () { t.textContent = '✓ Added to your to-do list'; if (td.data) td.data = null; state.stHome = null; }, function (err) { t.disabled = false; t.textContent = '+ Add a to-do for this job'; alert(err.message); });
      return;
    }
    var b = e.target.closest && e.target.closest('[data-vas-back]');
    if (b) { e.preventDefault(); setViewAs(''); }
  });
  state.user = store('fa-user');
  render();
})();

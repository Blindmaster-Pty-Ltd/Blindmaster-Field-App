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
    user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    planner: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17"/><path d="M3 9h18M9 9v12M15 9v12M8 2v4M16 2v4"/></svg>',
    mic: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    camera: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    play: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    report: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3"/></svg>'
  };

  /* ---------- auth ---------- */

  function session() { return store('fa-session'); }
  function tokenValid(s) { return s && (s.devEmail || (s.idToken && s.exp * 1000 > Date.now() + 60000)); }
  function signOut() {
    unstore('fa-session'); unstore('fa-user');
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
    if (s.idToken) q.idToken = s.idToken; else if (s.devEmail) q.devEmail = s.devEmail;
    var url = CFG.API_URL + '?' + Object.keys(q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&');
    return fetch(url, { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) {
          var err = new Error(data.error || 'Something went wrong');
          err.auth = /sign in|sign-in|recognised|verified|blindmaster account/i.test(data.error || '');
          throw err;
        }
        return data;
      });
  }

  /** POST to the script (used for uploads). Plain-text body avoids a CORS preflight, which Apps Script can't answer. */
  function apiPost(body) {
    var s = session() || {};
    var b = Object.assign({}, body);
    if (s.idToken) b.idToken = s.idToken; else if (s.devEmail) b.devEmail = s.devEmail;
    return fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b) })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (!data.ok) throw new Error(data.error || 'Upload failed'); return data; });
  }

  function loadDay(date, force) {
    if (!force && state.cache[date]) return Promise.resolve(state.cache[date]);
    return api({ action: 'day', date: date })
      .then(function (data) {
        state.user = data.user;
        state.cache[date] = { appointments: data.appointments, fetchedAt: Date.now(), offline: false };
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
  function myEmail() { var s = session() || {}; return String((state.user && state.user.email) || s.email || s.devEmail || '').toLowerCase(); }
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

  /* ---------- router ---------- */

  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    return { name: parts[0] || 'day', arg: parts[1] ? decodeURIComponent(parts[1]) : '', arg2: parts[2] ? decodeURIComponent(parts[2]) : '' };
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
    var r = route();
    if (r.name !== 'chat') { stopChat(); if (r.name !== 'chats') chat.back = location.hash || '#/day'; else chat.back = '#/chats'; }
    if ((r.name === 'chats' || r.name === 'chat' || r.name === 'planner') && !state.user) {
      // opened straight from a link (e.g. a chat email): find out who this is first
      loading('Loading…');
      return api({ action: 'me' }).then(function (d) { state.user = d.user; store('fa-user', d.user); render(); }, function (err) { showError(err, render); });
    }
    if (r.name === 'chats') return renderChats();
    if (r.name === 'chat' && r.arg) return renderChat(r.arg);
    if (r.name === 'appt') return wide() ? renderDayWide(r.arg2 || todayStr(), r.arg) : renderAppointment(r.arg2 || todayStr(), r.arg);
    if (r.name === 'route') return renderRoute(r.arg || todayStr());
    if (r.name === 'team') return renderTeam(r.arg || todayStr());
    if (r.name === 'planner') return renderPlanner(r.arg || todayStr());
    if (r.name === 'overview') return renderOverview(r.arg || 'today', r.arg2 || todayStr());
    if (!location.hash.replace(/^#\/?/, '') && isOffice()) return renderOverview('today', todayStr());
    if (r.name === 'account') return renderAccount();
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
    return '<header class="topbar">' + left + right + '</header>';
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
    if (chatEnabled()) items.push({ key: 'chats', href: '#/chats', icon: I.msg, label: 'Chats' });
    items.push({ key: 'account', href: '#/account', icon: I.user, label: 'Account' });
    return items;
  }

  function tabbar(active, date) {
    var items = navItems(date);
    if (items.length > 5) items = items.filter(function (t) { return t.key !== 'account'; }); // Account stays on the avatar in the top bar
    if (items.length > 5) items = items.filter(function (t) { return t.key !== 'route'; }); // office phones: route is on each day instead
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
        (CFG.ENVIRONMENT ? '<span class="rail-env">' + esc(CFG.ENVIRONMENT) + '</span>' : '') +
      '</aside>' +
      '<div class="content">' + content + '</div>' +
    '</div>';
  }

  function roleLabel(r) { return /office|admin/i.test(r || '') ? 'Office' : r === 'sales' ? 'Sales and projects' : 'Installer'; }

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
        '<div class="plate"><img src="wordmark-white.svg" alt="Blindmaster">' +
          '<div class="stack"><h1>Sign in to start your day</h1><p style="margin:0">Your schedule, job details and directions in one place.</p></div>' +
          (CFG.ENVIRONMENT ? '<span class="tag tag-blue" style="align-self:flex-start">' + esc(CFG.ENVIRONMENT) + '</span>' : '') +
        '</div><div class="band"></div>' +
        '<div class="body">' +
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
      '<div class="wx-day" data-date="' + date + '"></div>' +
    '</section>';
  }

  function nextPanel(next, date) {
    if (!next || isOffice()) return '';
    return '<section class="panel-accent" aria-label="Next appointment">' +
      '<span class="small" style="font-weight:700">Next up · ' + esc(next.startLabel) + ' · ' + esc(next.type) + '</span>' +
      '<div class="stack" style="gap:4px"><h2 style="font-size:22px;line-height:1.2">' + esc(next.title) + '</h2>' +
        '<span style="font-weight:500">' + esc(suburb(next.address)) + (refLabel(next) ? ' · ' + esc(refLabel(next)) : '') + '</span></div>' +
      '<div class="grid-2">' +
        (next.address ? '<a class="btn btn-dark" href="' + mapsDir(next.address) + '" target="_blank" rel="noopener">' + I.nav + 'Directions</a>' : '<span></span>') +
        '<a class="btn btn-light" href="' + apptHref(next, date) + '">View details</a>' +
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
          '<span class="sub">' + esc(suburb(a.address)) + (refLabel(a) ? ' · ' + esc(refLabel(a)) : '') + '</span>' + who +
        '</a></li>';
    }).join('') + '</ol>';
  }

  function dirUrl(date) {
    var u = CFG.DIR_FORM_URL || '';
    var email = (state.user && state.user.email) || '';
    return u.indexOf('{') >= 0 ? u.replace('{email}', encodeURIComponent(email)).replace('{date}', date) : u;
  }

  function dayFooter(day, date, appts) {
    var html = '';
    if (!isOffice() && appts.some(function (a) { return a.isInstall; }) && CFG.DIR_FORM_URL) {
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

  function hasReport(a) { return a.isInstall && !/warehouse/i.test(a.type); }

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
      actions.push(a.jobReportUrl ? '<a class="btn btn-dark action" href="' + esc(a.jobReportUrl) + '" target="_blank" rel="noopener">' + I.report + 'Job report</a>'
        : '<span class="btn btn-sand action" aria-disabled="true" style="opacity:.55">' + I.report + 'No JR number</span>');
    }
    html += '<div class="actions" style="grid-template-columns:repeat(' + actions.length + ',minmax(0,1fr))">' + actions.join('') + '</div>';
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
        dayNav(date) + dayHeading(date, appts) + nextPanel(ni >= 0 ? appts[ni] : null, date);
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
          (a.jobReportUrl ? '<a class="btn btn-dark btn-lg" href="' + esc(a.jobReportUrl) + '" target="_blank" rel="noopener">' + I.report + 'Open job report</a>'
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
        dayNav(date) + dayHeading(date, appts) +
        (appts.length ? scheduleList(appts, date, ni, sel && sel.id) : '<div class="empty stack"><h2>No appointments</h2><p class="muted" style="margin:0">Nothing is booked on this day.</p></div>') +
        dayFooter(day, date, appts);
      var detail = sel ? apptDetail(sel, date, true)
        : '<div class="empty-detail"><p class="muted">' + (selectedId ? 'This appointment may have been moved or cancelled.' : 'Select an appointment to see the details.') + '</p></div>';
      app.innerHTML = shell('day', date, '<div class="split"><section class="pane-list" aria-label="Schedule">' + list + '</section><section class="pane-detail" aria-label="Appointment details">' + detail + '</section></div>');
      var pane = app.querySelector('.pane-detail'); if (pane) pane.scrollTop = 0;
      bindRefresh();
      fillWeather();
      fillChatLinks();
    }, function (err) { showError(err, function () { renderDayWide(date, selectedId); }); });
  }

  /* ---------- route (all layouts) ---------- */

  function renderRoute(date) {
    loading('Loading route…');
    loadDay(date).then(function (day) {
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

      var kindLabel = { late: 'Late report', incomplete: 'Incomplete', outstanding: 'No report' };
      html += '<section class="ov-section"><h2>Needs attention' + (m.attention.length ? ' <span class="muted" style="font-weight:500">(' + m.attention.length + ')</span>' : '') + '</h2>' +
        (m.attention.length ? '<ul class="attention">' + m.attention.slice(0, 50).map(function (a) {
          return '<li><span class="tag ' + (a.kind === 'outstanding' ? 'tag-dark' : a.kind === 'incomplete' ? 'tag-blue' : '') + '">' + esc(kindLabel[a.kind]) + '</span>' +
            '<span class="att-main"><b>' + esc(a.name) + (a.jr ? ' · JR#' + esc(a.jr) : '') + '</b><span class="small muted">' + esc(a.detail) + '</span></span>' +
            '<span class="small muted att-date">' + esc(shortDate(a.date)) + '</span></li>';
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
    return [u.role].concat(u.roles || []).some(function (r) { return /office|admin|pm/i.test(r || ''); });
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
    return api({ action: 'week', from: from }).then(function (d) { state.user = d.user; planner.data = d.week; return d.week; });
  }

  function renderPlanner(from) {
    if (!canSchedule()) { location.hash = '#/day'; return; }
    from = weekStart(from || todayStr());
    planner.from = from;
    loading('Loading the week…');
    loadWeek(from).then(function (w) { drawPlanner(w); }, function (err) { showError(err, function () { renderPlanner(from); }); });
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
        '<header class="pl-dayhead"><div class="spread"><b>' + esc(shortDate(d)) + '</b><span class="pl-wx" data-date="' + d + '"></span></div>' + totals + '</header>' +
        '<div class="pl-cards">' + (list.length ? list.map(function (a) {
          return '<button type="button" class="pl-card' + (a.status === 'Tentative' ? ' is-tentative' : '') + '" data-edit="' + esc(a.id) + '">' + lightHtml(a) +
            '<span class="pl-time">' + esc(a.allDay ? 'All day' : a.startLabel + '–' + a.endLabel) + '</span>' +
            '<span class="tag ' + (a.isSales ? '' : 'tag-blue') + '">' + esc(a.type) + '</span>' +
            '<span class="pl-title">' + esc(a.title) + '</span>' +
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
      b.onclick = function () { openBooking(w.appointments.filter(function (a) { return a.id === b.getAttribute('data-edit'); })[0]); };
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
      var jr = $('bkJr').value.replace(/[^\d]/g, ''), tpl = w.jrFormUrl || '';
      $('bkJrLink').innerHTML = jr && tpl ? I.report + '<span>Job report link ready: <a href="' + esc(tpl.replace('{jr}', jr).replace('{email}', '').replace('{date}', $('bkDate').value)) + '" target="_blank" rel="noopener">JR#' + esc(jr) + '</a>. The crew open it from the appointment.</span>'
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
    setTimeout(function () { $('bkCustomer').focus(); }, 50);

    $('bkSave').onclick = function () {
      var appt = {
        id: v.id || '', type: v.type, status: v.status, date: $('bkDate').value, start: $('bkStart').value, durationMin: Number($('bkDur').value),
        jr: $('bkJr').value, opp: $('bkOpp').value, customer: $('bkCustomer').value.trim(), phone: $('bkPhone').value.trim(), access: $('bkAccess').value.trim(),
        address: $('bkAddress').value.trim(), notes: $('bkNotes').value.trim(), requirements: $('bkReq').value, folderUrl: $('bkFolder').value.trim(),
        projectFolderUrl: $('bkProj').value.trim(), title: $('bkTitleIn').value.trim(),
        crew: Array.prototype.filter.call(host.querySelectorAll('.bk-crew input'), function (c) { return c.checked; }).map(function (c) { return c.value; })
      };
      var err = !appt.date || !appt.start ? 'Choose a date and start time.' : !appt.customer && !appt.title ? 'Add the customer name.' : '';
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

  /* ---------- account ---------- */

  function renderAccount() {
    var u = state.user || store('fa-user') || { name: (session() || {}).email, email: (session() || {}).email };
    var body = '<section class="section stack" style="gap:16px;max-width:560px">' +
        '<div class="row"><span class="avatar" style="width:56px;height:56px;border-radius:28px">' + esc(initials(u.name)) + '</span>' +
        '<div class="stack" style="gap:2px"><h2>' + esc(u.name || '') + '</h2><span class="small muted">' + esc(u.email || '') + '</span></div></div>' +
        (u.role ? '<span class="tag" style="align-self:flex-start">' + esc(roleLabel(u.role)) + '</span>' : '') +
        (CFG.ENVIRONMENT ? '<p class="notice" style="margin:0">You are using the <b>' + esc(CFG.ENVIRONMENT) + '</b> version. Appointments here are test data.</p>' : '') +
        '<button class="btn btn-outline btn-lg" id="signout">Sign out</button>' +
        '<p class="small muted" style="margin:0">Add this app to your home screen: in Safari tap Share, then Add to Home Screen. In Chrome tap the menu, then Install app.</p>' +
      '</section>';
    app.innerHTML = wide() ? shell('account', null, body) : topbar() + '<main>' + body + '</main>' + tabbar('account');
    document.getElementById('signout').onclick = signOut;
  }

  /* ---------- start ---------- */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  state.user = store('fa-user');
  render();
})();

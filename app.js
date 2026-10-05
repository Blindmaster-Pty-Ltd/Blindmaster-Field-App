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
  function stopChat() { if (chat.unsub) { chat.unsub(); chat.unsub = null; } }

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
        '<div class="chat-input-row"><label class="sr-only" for="chatText">Message</label>' +
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

  function msgHtml(m, me) {
    var t = tsDate(m.createdAt), time = t ? hhmm(t) : '';
    var media = (m.mediaUrls || []).map(function (u, i) { return '<a class="chat-media" href="' + esc(u) + '" target="_blank" rel="noopener">' + I.folder + 'Attachment ' + (i + 1) + '</a>'; }).join('');
    if (m.kind === 'system') return '<div class="chat-system"><p>' + esc(m.text) + '</p>' + media + '<span class="small">' + esc(time) + '</span></div>';
    var mine = m.authorEmail === me, open = m.kind === 'important' && m.status === 'open';
    var label = m.kind === 'important' ? '<span class="tag ' + (open ? 'tag-dark' : '') + '">' + (open ? 'Important · open' : 'Important · sorted') + '</span>'
      : m.kind === 'note' ? '<span class="tag tag-light">Note for the record</span>' : '';
    var foot = '';
    if (m.kind === 'important' && m.status === 'sorted') foot = '<span class="small chat-sorted">Sorted by ' + esc(m.sortedBy === me ? 'you' : nameOf(m.sortedBy)) + (m.sortedAt ? ', ' + esc(chatWhen(tsDate(m.sortedAt))) : '') + '</span>';
    if (open && !m.pending) foot = '<button class="link-btn chat-sort" type="button" data-sort="' + esc(m.id) + '">Mark sorted</button>';
    return '<div class="chat-msg' + (mine ? ' is-mine' : '') + ' kind-' + esc(m.kind) + (open ? ' is-open' : '') + '">' +
      '<div class="chat-meta"><b>' + esc(mine ? 'You' : m.authorName || nameOf(m.authorEmail)) + '</b>' + (!mine && roleWord(m.authorRole) ? '<span>' + esc(roleWord(m.authorRole)) + '</span>' : '') + '<span>' + esc(m.pending ? 'Sending…' : time) + '</span></div>' +
      '<div class="chat-bubble">' + label + '<p>' + esc(m.text) + '</p>' + media + foot + '</div></div>';
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
    function sync() { send.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }
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
      var text = ta.value.trim(), kind = chat.kind;
      if (!text) return;
      ta.value = ''; sync();
      if (kind === 'important') setKind('message');
      postMessage(key, kind, text).catch(function (err) {
        ta.value = text; sync(); setKind(kind);
        alert(/permission|insufficient/i.test(err.code + ' ' + err.message) ? 'You can\'t post in this chat yet. You\'re added when you\'re booked on one of its appointments.' : 'Couldn\'t send: ' + (err.message || 'check your connection.'));
      });
    };
    setKind('message');
  }

  function postMessage(key, kind, text) {
    return chatUser().then(function () {
      var me = myEmail(), u = state.user || {}, p = chat.project || {};
      var FV = firebase.firestore.FieldValue, now = FV.serverTimestamp();
      var pr = projectRef(key), ref = pr.collection('messages').doc();
      var m = {
        oppNumber: p.oppNumber || (/^OPP-/.test(key) ? key.slice(4) : ''),
        jrNumber: p.jrNumber || (/^JR-/.test(key) ? key.slice(3) : ''),
        createdAt: now, authorEmail: me, authorName: u.name || nameFromEmail(me), authorRole: roleForChat(),
        kind: kind, text: text.slice(0, 4000), mediaUrls: [],
        status: kind === 'important' ? 'open' : '', sortedBy: '', sortedAt: null, source: 'app'
      };
      var summary = { lastMessage: { text: m.text.slice(0, 140), authorName: m.authorName, authorEmail: me, at: now, kind: kind }, updatedAt: now };
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
    if ((r.name === 'chats' || r.name === 'chat') && !state.user) {
      // opened straight from a link (e.g. a chat email): find out who this is first
      loading('Loading…');
      return api({ action: 'me' }).then(function (d) { state.user = d.user; store('fa-user', d.user); render(); }, function (err) { showError(err, render); });
    }
    if (r.name === 'chats') return renderChats();
    if (r.name === 'chat' && r.arg) return renderChat(r.arg);
    if (r.name === 'appt') return wide() ? renderDayWide(r.arg2 || todayStr(), r.arg) : renderAppointment(r.arg2 || todayStr(), r.arg);
    if (r.name === 'route') return renderRoute(r.arg || todayStr());
    if (r.name === 'team') return renderTeam(r.arg || todayStr());
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
    if (isOffice()) items.push({ key: 'team', href: '#/team' + d, icon: I.team, label: 'Team' });
    if (chatEnabled()) items.push({ key: 'chats', href: '#/chats', icon: I.msg, label: 'Chats' });
    items.push({ key: 'account', href: '#/account', icon: I.user, label: 'Account' });
    return items;
  }

  function tabbar(active, date) {
    var items = navItems(date);
    if (items.length > 5) items = items.filter(function (t) { return t.key !== 'account'; }); // Account stays on the avatar in the top bar
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
            ? '<div id="gbtn" style="min-height:48px"></div><p class="small muted" style="margin:0">Use your Blindmaster Google account.</p>'
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
        google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onGoogleCredential, auto_select: true, hd: 'blindmaster.com.au' });
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
        '<a class="appt-card' + cls + '" href="' + apptHref(a, date) + '"' + (a.id === selectedId ? ' aria-current="true"' : '') + '>' +
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
      '<div class="row" style="gap:8px;flex-wrap:wrap"><span class="tag tag-dark">' + esc(a.type) + '</span><span style="font-weight:700;font-size:14px">' + esc(a.allDay ? 'All day' : a.startLabel + ' – ' + a.endLabel) + '</span>' +
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

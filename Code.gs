/**
 * Blindmaster Field App — sandbox backend (stage 1)
 *
 * Reads appointments from a TEST Google Calendar and returns them as JSON
 * to the field app hosted on GitHub Pages.
 *
 * Script properties (Project settings › Script properties):
 *   CALENDAR_ID        ID of the test calendar (required)
 *   OAUTH_CLIENT_ID    Google OAuth web client ID used by the app's sign-in (required unless dev login)
 *   ALLOWED_DOMAIN     blindmaster.com.au
 *   ALLOW_DEV_LOGIN    "true" only in the sandbox, lets testers sign in by email without Google
 *   STAFF_JSON         {"lewis@blindmaster.com.au":{"name":"Lewis Hillard","role":"installer"}, ...}
 *                      role: main role, installer | sales | pm | office (office sees every appointment and the Team board)
 *                      roles (optional): every role, e.g. ["installer","pm","sales"]; active: false switches a person off
 *                      Contractors without a Blindmaster account are listed by their own Google email and can sign in.
 *   JR_FORM_URL        Job Report form URL template, e.g. https://.../blindmaster-job-report.html?jr={jr}
 *   DIR_FORM_URL       Daily Installation Report URL template, e.g. https://.../blindmaster-daily-report.html?email={email}&date={date}
 *   REPORT_LOG_ID      Google Sheet that logs every submitted JR and DIR (see "Report log" below). seedSampleReportLog() creates one.
 *   JR_GRACE_HOURS     hours after the end of the job day a JR still counts as on time (default 0 = by midnight)
 *   DIR_GRACE_HOURS    hours after the end of the day a DIR still counts as on time (default 9 = by 9am next day)
 *   FIREBASE_PROJECT_ID  blindmaster-field (project chat; leave blank to switch chat syncing off)
 *   APP_URL            https://blindmaster-pty-ltd.github.io/Blindmaster-Field-App/ (used in chat emails)
 *
 * Deploy: Deploy › New deployment › Web app
 *   Execute as: Me    Who has access: Anyone
 * After the first deployment, always use Manage deployments › Edit (new version)
 * so the /exec URL never changes.
 */

var TZ = 'Australia/Sydney';

/* ---------- entry point ---------- */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return json_({ ok: true, time: new Date().toISOString() });

    var user = authenticate_(p);
    if (p.action === 'me') return json_({ ok: true, user: user });
    if (p.action === 'day') {
      var date = p.date || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
      return json_({ ok: true, user: user, date: date, appointments: getDay_(user, date) });
    }
    if (p.action === 'chatNotify') return json_({ ok: true, sent: chatNotifyFromApp_(user, p.key, p.id) });
    if (p.action === 'metrics') {
      if (!/office|admin/i.test(user.role || '')) throw new Error('The overview is for office staff.');
      return json_({ ok: true, user: user, metrics: getMetrics_(p.from, p.to) });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ---------- auth ---------- */

function authenticate_(p) {
  var props = PropertiesService.getScriptProperties();
  var domain = (props.getProperty('ALLOWED_DOMAIN') || 'blindmaster.com.au').toLowerCase();
  var email = '';

  if (p.idToken) {
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(p.idToken), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Sign-in expired. Please sign in again.');
    var info = JSON.parse(res.getContentText());
    var clientId = props.getProperty('OAUTH_CLIENT_ID');
    if (clientId && info.aud !== clientId) throw new Error('Sign-in not recognised.');
    if (String(info.email_verified) !== 'true') throw new Error('Email not verified.');
    email = String(info.email).toLowerCase();
  } else if (p.devEmail && props.getProperty('ALLOW_DEV_LOGIN') === 'true') {
    email = String(p.devEmail).toLowerCase().trim();
  } else {
    throw new Error('Please sign in.');
  }

  // Blindmaster accounts, plus contractors listed in STAFF_JSON by their own Google account (e.g. a Gmail)
  var staff = staff_();
  var s = staff[email];
  if (email.split('@')[1] !== domain && !s) throw new Error('Use your Blindmaster account to sign in, or ask the office to add your Google account.');
  s = s || {};
  if (s.active === false) throw new Error('Your access has been switched off. Please contact the office.');
  return { email: email, name: s.name || nameFromEmail_(email), role: s.role || 'installer', roles: s.roles || [s.role || 'installer'] };
}

function staff_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('STAFF_JSON') || '{}'); }
  catch (e) { return {}; }
}

function nameFromEmail_(email) {
  var local = email.split('@')[0].replace(/[._-]+/g, ' ');
  return local.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/* ---------- calendar ---------- */

function getDay_(user, dateStr) {
  var props = PropertiesService.getScriptProperties();
  var cal = CalendarApp.getCalendarById(props.getProperty('CALENDAR_ID'));
  if (!cal) throw new Error('Test calendar not found. Check CALENDAR_ID.');

  var start = parseDate_(dateStr);
  var end = new Date(start.getTime() + 24 * 3600 * 1000);
  var staff = staff_();

  // Office staff (role "office" or "admin") see everyone's appointments.
  var seeAll = /office|admin/i.test(user.role || '');
  var appts = cal.getEvents(start, end)
    .filter(function (ev) { return seeAll || isMine_(ev, user.email); })
    .map(function (ev) { return toAppointment_(ev, user, staff, dateStr); })
    .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  chatSyncDay_(appts); // project chat: adds chatKey and keeps chat members in step with the crew (FieldChat.gs)
  return appts;
}

function parseDate_(s) {
  // midnight Sydney time for yyyy-MM-dd
  var parts = s.split('-');
  var guess = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var offset = Utilities.formatDate(guess, TZ, 'Z'); // e.g. +1100
  return new Date(s + 'T00:00:00' + offset.slice(0, 3) + ':' + offset.slice(3));
}

function isMine_(ev, email) {
  var guests = ev.getGuestList(true).map(function (g) { return g.getEmail().toLowerCase(); });
  if (guests.indexOf(email) >= 0) return true;
  // also allow "Crew:" line in the description
  var crew = (parseDescription_(ev.getDescription()).fields.crew || '').toLowerCase();
  return crew.indexOf(email) >= 0;
}

/**
 * Description convention (one per line, case-insensitive keys):
 *   Type: Installation | Site consult | Check measure | Project visit | Service | Showroom | Warehouse
 *   JR: 28874              (project / job report number)
 *   OPP: 1042              (opportunity number)
 *   Customer: Jane Nguyen
 *   Phone: 0400 000 000
 *   Access: Side gate, code 1234
 *   Crew: lewis@blindmaster.com.au, troy@blindmaster.com.au
 *   Folder: https://drive.google.com/drive/folders/...
 *   Project folder: https://drive.google.com/drive/folders/...
 *   Notes: Call 30 min before arrival
 *   - Requirement line one
 *   - Requirement line two
 */
function parseDescription_(desc) {
  var fields = {}, reqs = [], extra = [];
  String(desc || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (/^[-•*]\s+/.test(line)) { reqs.push(line.replace(/^[-•*]\s+/, '')); return; }
      var m = line.match(/^([A-Za-z ]{2,20}):\s*(.*)$/);
      if (m) { fields[m[1].trim().toLowerCase()] = m[2].trim(); return; }
      extra.push(line);
    });
  return { fields: fields, requirements: reqs, extra: extra };
}

function toAppointment_(ev, user, staff, dateStr) {
  var d = parseDescription_(ev.getDescription());
  var f = d.fields;
  var props = PropertiesService.getScriptProperties();
  var title = ev.getTitle();

  var type = f.type || guessType_(title);
  var jr = (f.jr || f.project || (title.match(/JR\s*#?\s*(\d{4,6})/i) || [])[1] || '').replace(/[^\d]/g, '');
  var opp = (f.opp || f.opportunity || '').replace(/^OPP-?/i, '');

  var crewEmails = ev.getGuestList(true).map(function (g) { return g.getEmail().toLowerCase(); });
  if (f.crew) f.crew.split(/[,;]/).forEach(function (c) { c = c.trim().toLowerCase(); if (c && crewEmails.indexOf(c) < 0) crewEmails.push(c); });
  var crew = crewEmails
    .filter(function (e) { return /@/.test(e) && !/calendar\.google\.com$/.test(e); })
    .map(function (e) { return { email: e, name: (staff[e] && staff[e].name) || nameFromEmail_(e), me: e === user.email }; });

  var address = ev.getLocation() || '';
  var jrTpl = props.getProperty('JR_FORM_URL') || '';

  return {
    id: ev.getId(),
    title: title,
    type: type,
    isInstall: /install|service|warehouse/i.test(type),
    isSales: /consult|measure|project visit|showroom/i.test(type),
    start: ev.getStartTime().toISOString(),
    end: ev.getEndTime().toISOString(),
    allDay: ev.isAllDayEvent(),
    startLabel: Utilities.formatDate(ev.getStartTime(), TZ, 'HH:mm'),
    endLabel: Utilities.formatDate(ev.getEndTime(), TZ, 'HH:mm'),
    address: address,
    jr: jr,
    opp: opp,
    customer: f.customer || '',
    phone: f.phone || '',
    access: f.access || '',
    notes: [f.notes || ''].concat(d.extra).filter(String).join('\n'),
    requirements: d.requirements,
    crew: crew,
    folderUrl: f.folder || f['opportunity folder'] || '',
    projectFolderUrl: f['project folder'] || '',
    jobReportUrl: f['jr link'] || (jr && jrTpl ? jrTpl.replace('{jr}', encodeURIComponent(jr)).replace('{email}', encodeURIComponent(user.email)).replace('{date}', dateStr) : '')
  };
}

function guessType_(title) {
  var t = title.toLowerCase();
  if (/warehouse|load/.test(t)) return 'Warehouse';
  if (/consult|quote/.test(t)) return 'Site consult';
  if (/measure/.test(t)) return 'Check measure';
  if (/service|repair/.test(t)) return 'Service';
  if (/showroom/.test(t)) return 'Showroom';
  return 'Installation';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- sandbox helpers (run from the editor) ---------- */

/**
 * Fills the TEST calendar with a sample day (today and tomorrow) so the app
 * has something to show. Run once from the editor after setting CALENDAR_ID.
 * Adds YOU (the person running it) as a guest, so you see it when you sign in.
 */
function seedSampleDay() {
  var props = PropertiesService.getScriptProperties();
  var cal = CalendarApp.getCalendarById(props.getProperty('CALENDAR_ID'));
  var me = Session.getActiveUser().getEmail();
  var days = [0, 1];

  var sample = [
    { t: 'Warehouse load-out', h: 7, m: 30, dur: 45, loc: '4/10 Orchard Road, Brookvale NSW 2100',
      d: 'Type: Warehouse\nNotes: Collect stock for today\'s jobs' },
    { t: 'TEST · Harper residence · Roller blinds', h: 8, m: 30, dur: 120, loc: 'Manly NSW 2095',
      d: 'Type: Installation\nJR: 90001\nOPP: 9001\nCustomer: Test Customer A\nPhone: 0400 000 001\nAccess: Front door\n- Roller blinds x4, face fix\n- Chain tensioners x4' },
    { t: 'TEST · Nguyen residence · Awning', h: 11, m: 0, dur: 120, loc: 'Dee Why NSW 2099',
      d: 'Type: Installation\nJR: 90002\nOPP: 9002\nCustomer: Test Customer B\nPhone: 0400 000 002\nAccess: Side gate, code 0000\nNotes: Call 30 minutes before arrival\n- Folding-arm awning, motorised\n- Masonry fixings, brick wall\n- Electrician on site 12:00' },
    { t: 'TEST · Walker residence · Site consult', h: 14, m: 0, dur: 60, loc: 'Freshwater NSW 2096',
      d: 'Type: Site consult\nOPP: 9003\nCustomer: Test Customer C\nPhone: 0400 000 003\nNotes: Interested in awning and outdoor blinds' },
    { t: 'TEST · Patel residence · Service', h: 15, m: 30, dur: 60, loc: 'Mona Vale NSW 2103',
      d: 'Type: Service\nJR: 90003\nCustomer: Test Customer D\nPhone: 0400 000 004\n- Replace motor, outdoor blind' }
  ];

  days.forEach(function (offset) {
    var base = new Date();
    base.setDate(base.getDate() + offset);
    sample.forEach(function (s) {
      var start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), s.h, s.m);
      var end = new Date(start.getTime() + s.dur * 60000);
      cal.createEvent(s.t, start, end, { location: s.loc, description: s.d, guests: me, sendInvites: false });
    });
  });
  Logger.log('Seeded sample appointments for ' + me);
}

/** Removes every event on the TEST calendar from today to 30 days ahead. */
function clearSampleDays() {
  var cal = CalendarApp.getCalendarById(PropertiesService.getScriptProperties().getProperty('CALENDAR_ID'));
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var later = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  cal.getEvents(now, later).forEach(function (ev) { ev.deleteEvent(); });
}


/* ---------- office overview metrics ---------- */
/*
 * Report log sheet (first tab), one row per submitted report:
 *   Date | Report | JR | Installer | Submitted at | Status | Hours on site | Travel minutes | Km
 *   Date          the job / working day (yyyy-MM-dd)
 *   Report        JR or DIR
 *   JR            project / job report number (JR rows)
 *   Installer     email of the person who submitted it
 *   Submitted at  date and time it was submitted
 *   Status        JR rows: Complete or Incomplete (return visit needed)
 *   Hours on site, Travel minutes, Km   DIR rows (the DIR already works these out)
 * In the live system the JR and DIR scripts append a row here when a report is submitted.
 */

function getMetrics_(from, to) {
  var props = PropertiesService.getScriptProperties();
  var staff = staff_();
  var jrGrace = Number(props.getProperty('JR_GRACE_HOURS') || 0);
  var dirGrace = Number(props.getProperty('DIR_GRACE_HOURS') || 9);
  from = from || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  to = to || from;

  var people = {};
  function person(email) {
    email = String(email || '').toLowerCase();
    if (!people[email]) people[email] = { email: email, name: (staff[email] && staff[email].name) || nameFromEmail_(email), role: (staff[email] && staff[email].role) || 'installer',
      scheduled: 0, done: 0, incomplete: 0, outstanding: 0, hours: 0, travelMin: 0, km: 0, onTime: 0, late: 0 };
    return people[email];
  }

  // 1. scheduled installation / service jobs from the calendar
  var cal = CalendarApp.getCalendarById(props.getProperty('CALENDAR_ID'));
  var start = parseDate_(from), end = new Date(parseDate_(to).getTime() + 24 * 3600 * 1000);
  var jobs = [];
  cal.getEvents(start, end).forEach(function (ev) {
    var d = parseDescription_(ev.getDescription()).fields;
    var type = d.type || guessType_(ev.getTitle());
    if (!/install|service/i.test(type)) return;
    var jr = (d.jr || (ev.getTitle().match(/JR\s*#?\s*(\d{4,6})/i) || [])[1] || '').replace(/[^\d]/g, '');
    var crew = ev.getGuestList(true).map(function (g) { return g.getEmail().toLowerCase(); }).filter(function (e) { return /@/.test(e) && !/calendar\.google\.com$/.test(e); });
    jobs.push({ jr: jr, title: ev.getTitle(), date: Utilities.formatDate(ev.getStartTime(), TZ, 'yyyy-MM-dd'), end: ev.getEndTime(), crew: crew });
    crew.forEach(function (e) { person(e).scheduled++; });
  });

  // 2. submitted reports from the report log
  var rows = [];
  var logId = props.getProperty('REPORT_LOG_ID');
  if (logId) {
    var values = SpreadsheetApp.openById(logId).getSheets()[0].getDataRange().getValues();
    values.slice(1).forEach(function (r) {
      var date = r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd') : String(r[0]);
      if (date < from || date > to) return;
      rows.push({ date: date, report: String(r[1]).toUpperCase(), jr: String(r[2]).replace(/[^\d]/g, ''), email: String(r[3]).toLowerCase(),
        submitted: r[4] instanceof Date ? r[4] : new Date(r[4]), status: String(r[5]), hours: Number(r[6]) || 0, travel: Number(r[7]) || 0, km: Number(r[8]) || 0 });
    });
  }

  var attention = [];
  var jrSubmitted = {};
  rows.forEach(function (r) {
    var p = person(r.email);
    var deadline = new Date(parseDate_(r.date).getTime() + (24 + (r.report === 'DIR' ? dirGrace : jrGrace)) * 3600 * 1000);
    var late = r.submitted > deadline;
    if (late) { p.late++; attention.push({ kind: 'late', report: r.report, jr: r.jr, date: r.date, name: p.name,
      detail: r.report + (r.jr ? ' #' + r.jr : '') + ' submitted ' + Utilities.formatDate(r.submitted, TZ, 'EEE d MMM, HH:mm') }); }
    else p.onTime++;
    if (r.report === 'JR') {
      jrSubmitted[r.jr] = true;
      if (/incomplete/i.test(r.status)) { p.incomplete++; attention.push({ kind: 'incomplete', report: 'JR', jr: r.jr, date: r.date, name: p.name, detail: 'Job marked incomplete, return visit needed' }); }
      else p.done++;
    } else if (r.report === 'DIR') {
      p.hours += r.hours; p.travelMin += r.travel; p.km += r.km;
    }
  });

  // 3. jobs whose day has ended with no job report yet
  var now = new Date();
  jobs.forEach(function (j) {
    if (!j.jr || jrSubmitted[j.jr] || j.end > now) return;
    j.crew.forEach(function (e) { person(e).outstanding++; });
    attention.push({ kind: 'outstanding', report: 'JR', jr: j.jr, date: j.date, name: j.crew.map(function (e) { return person(e).name; }).join(', '), detail: 'No job report yet · ' + j.title });
  });

  var list = Object.keys(people).map(function (k) { return people[k]; })
    .filter(function (p) { return p.scheduled || p.done || p.incomplete || p.hours || p.onTime || p.late; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  var totals = list.reduce(function (t, p) {
    ['scheduled', 'done', 'incomplete', 'outstanding', 'hours', 'travelMin', 'km', 'onTime', 'late'].forEach(function (k) { t[k] = (t[k] || 0) + p[k]; });
    return t;
  }, {});
  totals.jobsScheduled = jobs.length;
  totals.jobsOutstanding = jobs.filter(function (j) { return j.jr && !jrSubmitted[j.jr] && j.end <= now; }).length;

  return { from: from, to: to, totals: totals, people: list, attention: attention.sort(function (a, b) { return a.date < b.date ? 1 : -1; }),
    hasReportLog: !!logId, generatedAt: new Date().toISOString() };
}

/**
 * Creates a sandbox "Report log" sheet filled with sample JR and DIR rows for the
 * last 14 days, for everyone in STAFF_JSON (or just you), and saves its ID as REPORT_LOG_ID.
 */
function seedSampleReportLog() {
  var props = PropertiesService.getScriptProperties();
  var ss = props.getProperty('REPORT_LOG_ID') ? SpreadsheetApp.openById(props.getProperty('REPORT_LOG_ID')) : SpreadsheetApp.create('Field App – Sandbox report log');
  props.setProperty('REPORT_LOG_ID', ss.getId());
  var sh = ss.getSheets()[0];
  sh.clear();
  sh.appendRow(['Date', 'Report', 'JR', 'Installer', 'Submitted at', 'Status', 'Hours on site', 'Travel minutes', 'Km']);
  var staff = staff_();
  var installers = Object.keys(staff).filter(function (e) { return !/office|admin/i.test(staff[e].role || ''); });
  if (!installers.length) installers = [Session.getActiveUser().getEmail()];
  var rows = [], jr = 80000;
  for (var d = 14; d >= 1; d--) {
    var day = new Date(); day.setDate(day.getDate() - d);
    if (day.getDay() === 0) continue; // no Sundays
    var ds = Utilities.formatDate(day, TZ, 'yyyy-MM-dd');
    installers.forEach(function (email, i) {
      var n = 2 + ((d + i) % 3);
      for (var k = 0; k < n; k++) {
        jr++;
        var lateJr = (d + i + k) % 9 === 0;
        var sub = new Date(day); sub.setHours(lateJr ? 34 : 15 + k, 10 * k, 0, 0);
        rows.push([ds, 'JR', jr, email, sub, (d + k + i) % 11 === 0 ? 'Incomplete' : 'Complete', '', '', '']);
      }
      var lateDir = (d + i) % 7 === 0;
      var dirSub = new Date(day); dirSub.setHours(lateDir ? 36 : 17, 30, 0, 0);
      rows.push([ds, 'DIR', '', email, dirSub, '', 6 + ((d + i) % 4) * 0.5, 70 + ((d * 13 + i * 7) % 60), 55 + ((d * 17 + i * 11) % 70)]);
    });
  }
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log('Report log: ' + ss.getUrl() + ' (' + rows.length + ' rows)');
}

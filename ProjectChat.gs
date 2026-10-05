/**
 * BM Project Chat: posting helper for Apps Script (Job Report, DIR, scheduler).
 *
 * Add this file to the Apps Script project, then call postToProjectChat(...).
 * It writes to Firestore with the script owner's Google credentials, so the
 * script owner's account must have access to the Firebase project (see SETUP.md, step 8).
 *
 * Script properties needed:
 *   FIREBASE_PROJECT_ID   e.g. blindmaster-field
 *   APP_URL               optional: the Field App address, so emails link straight to the chat
 *
 * appsscript.json must include these scopes (plus any the script already uses):
 *   "https://www.googleapis.com/auth/datastore",
 *   "https://www.googleapis.com/auth/script.external_request",
 *   "https://www.googleapis.com/auth/script.send_mail"
 *
 * Example: job report submitted complete
 *   postToProjectChat({
 *     jr: '28874', kind: 'system', source: 'jr',
 *     text: 'Job report submitted: complete. Installation Complete | Ready to Invoice.',
 *     mediaUrls: [pdfUrl], installerEmails: ['lewis@blindmaster.com.au', 'troy@blindmaster.com.au']
 *   });
 *
 * Example: job report submitted incomplete (emails the team)
 *   postToProjectChat({
 *     jr: '28874', kind: 'important', source: 'jr',
 *     authorEmail: 'lewis@blindmaster.com.au', authorName: 'Lewis Hillard', authorRole: 'installer',
 *     text: 'Job not finished: Weather (gusts 62 km/h). Arms not tensioned. Return visit about 1.5 h for 2 people.',
 *     mediaUrls: [pdfUrl], installerEmails: ['lewis@blindmaster.com.au', 'troy@blindmaster.com.au']
 *   });
 */

var CHAT_KINDS = ['message', 'note', 'important', 'system'];

function postToProjectChat(opts) {
  opts = opts || {};
  if (CHAT_KINDS.indexOf(opts.kind) < 0) throw new Error('kind must be one of ' + CHAT_KINDS.join(', '));
  if (!opts.text) throw new Error('text is required');

  var jr = String(opts.jr || '').replace(/[^\d]/g, '');
  var opp = String(opts.opp || '').replace(/[^\d]/g, '');
  var projectKey = chatResolveProjectKey_(jr, opp);
  var now = new Date();
  var isSystem = opts.kind === 'system';
  var authorEmail = String(opts.authorEmail || (isSystem ? 'system@blindmaster.com.au' : Session.getActiveUser().getEmail())).toLowerCase();
  var installers = (opts.installerEmails || []).map(function (e) { return String(e).toLowerCase().trim(); }).filter(String);
  var members = installers.slice();
  if (!isSystem && members.indexOf(authorEmail) < 0) members.push(authorEmail);

  var messageId = 'm_' + Utilities.formatDate(now, 'Australia/Sydney', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 6);
  var message = {
    oppNumber: opp,
    jrNumber: jr,
    createdAt: now,
    authorEmail: authorEmail,
    authorName: opts.authorName || (isSystem ? 'Blindmaster' : authorEmail),
    authorRole: opts.authorRole || (isSystem ? 'system' : 'installer'),
    kind: opts.kind,
    text: String(opts.text).slice(0, 4000),
    mediaUrls: opts.mediaUrls || [],
    status: opts.kind === 'important' ? 'open' : '',
    sortedBy: '',
    sortedAt: null,
    source: opts.source || 'jr'
  };

  var base = chatBase_();
  var projectName = base.name + '/projects/' + projectKey;
  var projectFields = { updatedAt: now, lastMessage: { text: message.text.slice(0, 140), authorName: message.authorName, authorEmail: authorEmail, at: now, kind: message.kind } };
  var projectMask = ['updatedAt', 'lastMessage'];
  if (jr) { projectFields.jrNumber = jr; projectMask.push('jrNumber'); }
  if (opp) { projectFields.oppNumber = opp; projectMask.push('oppNumber'); }

  var transforms = [];
  if (members.length) transforms.push({ fieldPath: 'memberEmails', appendMissingElements: { values: members.map(function (m) { return { stringValue: m }; }) } });
  if (opts.kind === 'important') transforms.push({ fieldPath: 'openImportantCount', increment: { integerValue: '1' } });

  var writes = [
    { update: { name: projectName + '/messages/' + messageId, fields: chatFields_(message) }, currentDocument: { exists: false } },
    { update: { name: projectName, fields: chatFields_(projectFields) }, updateMask: { fieldPaths: projectMask }, updateTransforms: transforms }
  ];
  chatFetch_(base.url + ':commit', 'post', { writes: writes });

  if (opts.kind === 'important' && opts.notify !== false) chatNotify_(projectKey, message);
  return { projectKey: projectKey, messageId: messageId };
}

/* ---------- internals ---------- */

function chatBase_() {
  var pid = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
  if (!pid) throw new Error('Set the FIREBASE_PROJECT_ID script property');
  var name = 'projects/' + pid + '/databases/(default)/documents';
  return { pid: pid, name: name, url: 'https://firestore.googleapis.com/v1/' + name };
}

function chatFetch_(url, method, body) {
  var base = chatBase_();
  var res = UrlFetchApp.fetch(url, {
    method: method,
    contentType: 'application/json',
    payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': base.pid },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 404) return null;
  if (code >= 300) throw new Error('Firestore ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText() || '{}');
}

// Find the chat for a job: jrIndex/{jr} → project key. Falls back to OPP-<opp>, then JR-<jr>.
function chatResolveProjectKey_(jr, opp) {
  var base = chatBase_();
  if (jr) {
    var idx = chatFetch_(base.url + '/jrIndex/' + jr, 'get');
    if (idx && idx.fields && idx.fields.projectKey) return idx.fields.projectKey.stringValue;
  }
  var key = opp ? 'OPP-' + opp : (jr ? 'JR-' + jr : '');
  if (!key) throw new Error('Pass a jr or opp number');
  if (jr) {
    // remember the link so later posts by JR number find the same chat
    chatFetch_(base.url + ':commit', 'post', { writes: [{ update: { name: base.name + '/jrIndex/' + jr, fields: chatFields_({ projectKey: key, jrNumber: jr, oppNumber: opp }) } }] });
  }
  return key;
}

// Email an Important message to the project's members and the office
function chatNotify_(projectKey, message) {
  var base = chatBase_();
  var project = chatFetch_(base.url + '/projects/' + projectKey, 'get');
  var to = [];
  var members = project && project.fields && project.fields.memberEmails && project.fields.memberEmails.arrayValue.values || [];
  members.forEach(function (v) { to.push(v.stringValue); });
  var staff = chatFetch_(base.url + '/staff?pageSize=300', 'get');
  ((staff && staff.documents) || []).forEach(function (d) {
    var f = d.fields || {};
    var roles = ((f.roles && f.roles.arrayValue && f.roles.arrayValue.values) || []).map(function (v) { return v.stringValue; });
    if (f.role && f.role.stringValue) roles.push(f.role.stringValue);
    var active = !f.active || f.active.booleanValue !== false;
    var email = d.name.split('/').pop();
    if (active && roles.some(function (r) { return r === 'office' || r === 'admin' || r === 'pm'; })) to.push(email);
  });
  to = to.filter(function (e, i) { return e && to.indexOf(e) === i && e !== message.authorEmail && e !== 'system@blindmaster.com.au'; });
  if (!to.length) return;
  var ref = message.jrNumber ? 'JR#' + message.jrNumber : message.oppNumber ? 'OPP-' + message.oppNumber : projectKey;
  MailApp.sendEmail({
    to: to.join(','),
    subject: 'Important: ' + ref + ' needs discussion',
    htmlBody: '<p><b>' + chatEsc_(message.authorName) + '</b> flagged this as important on ' + chatEsc_(ref) + ':</p>' +
      '<blockquote style="border-left:3px solid #404141;margin:0;padding:8px 12px">' + chatEsc_(message.text) + '</blockquote>' +
      (message.mediaUrls.length ? '<p>' + message.mediaUrls.map(function (u) { return '<a href="' + chatEsc_(u) + '">Attachment</a>'; }).join(' · ') + '</p>' : '') +
      chatAppLink_(projectKey)
  });
}

function chatAppLink_(projectKey) {
  var url = PropertiesService.getScriptProperties().getProperty('APP_URL');
  if (!url) return '<p>Open the project chat in the Blindmaster app to reply.</p>';
  return '<p><a href="' + chatEsc_(url.replace(/#.*$/, '') + '#/chat/' + encodeURIComponent(projectKey)) + '">Open the project chat</a> to reply.</p>';
}

function chatFields_(obj) {
  var f = {};
  Object.keys(obj).forEach(function (k) { f[k] = chatValue_(obj[k]); });
  return f;
}

function chatValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(chatValue_) } };
  switch (typeof v) {
    case 'boolean': return { booleanValue: v };
    case 'number': return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    case 'object': return { mapValue: { fields: chatFields_(v) } };
    default: return { stringValue: String(v) };
  }
}

function chatEsc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

/** Run once from the editor after setup to check everything is connected. */
function testProjectChat() {
  var r = postToProjectChat({ jr: '90002', kind: 'system', source: 'system', text: 'Test entry from the Apps Script helper. Safe to ignore.' });
  Logger.log('Posted ' + r.messageId + ' to projects/' + r.projectKey);
}

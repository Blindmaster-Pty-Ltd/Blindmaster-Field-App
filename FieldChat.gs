/**
 * Field App: project chat glue (uses the helpers in ProjectChat.gs).
 *
 * chatSyncDay_      called when the app loads a day. Gives each appointment its chat key and
 *                   makes sure everyone on the appointment's crew is a member of that project chat.
 * chatNotifyFromApp_ called by the app after someone posts an Important message. Emails the
 *                   project members and the office (Firestore can't send email on its own).
 *
 * Needs the FIREBASE_PROJECT_ID script property. Without it, chat syncing is skipped and
 * the schedule still works.
 */

var CHAT_SYNC_CACHE_SECS = 6 * 3600; // re-check each project's members at most every 6 hours

function chatSyncDay_(appts) {
  appts.forEach(function (a) { a.chatKey = a.opp ? 'OPP-' + a.opp : a.jr ? 'JR-' + a.jr : ''; });
  if (!PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID')) return;
  try {
    var base = chatBase_();

    // Use an existing JR → chat link if there is one, so a job keeps one chat
    var jrs = appts.map(function (a) { return a.jr; }).filter(function (j, i, all) { return j && all.indexOf(j) === i; });
    var idx = {};
    if (jrs.length) {
      var found = chatFetch_(base.url + ':batchGet', 'post', { documents: jrs.map(function (j) { return base.name + '/jrIndex/' + j; }) }) || [];
      found.forEach(function (r) {
        if (r.found && r.found.fields && r.found.fields.projectKey) idx[r.found.name.split('/').pop()] = r.found.fields.projectKey.stringValue;
      });
    }

    // Group by chat (several appointments can share a project)
    var groups = {};
    appts.forEach(function (a) {
      if (a.jr && idx[a.jr]) a.chatKey = idx[a.jr];
      if (!a.chatKey) return;
      var g = groups[a.chatKey] || (groups[a.chatKey] = { members: [], jr: '', opp: '', title: '', address: '', newJr: '' });
      a.crew.forEach(function (c) { if (g.members.indexOf(c.email) < 0) g.members.push(c.email); });
      g.jr = g.jr || a.jr; g.opp = g.opp || a.opp;
      g.title = g.title || a.customer || a.title; g.address = g.address || a.address;
      if (a.jr && !idx[a.jr]) g.newJr = a.jr;
    });

    var cache = CacheService.getScriptCache();
    var writes = [], done = [];
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      var sig = 'cs_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
        [key, g.members.sort().join(','), g.jr, g.opp, g.title, g.address].join('|')));
      if (cache.get(sig)) return;
      var fields = { title: g.title, address: g.address }, mask = ['title', 'address'];
      if (g.jr) { fields.jrNumber = g.jr; mask.push('jrNumber'); }
      if (g.opp) { fields.oppNumber = g.opp; mask.push('oppNumber'); }
      writes.push({
        update: { name: base.name + '/projects/' + key, fields: chatFields_(fields) },
        updateMask: { fieldPaths: mask },
        updateTransforms: g.members.length ? [{ fieldPath: 'memberEmails', appendMissingElements: { values: g.members.map(function (m) { return { stringValue: m }; }) } }] : []
      });
      if (g.newJr) writes.push({ update: { name: base.name + '/jrIndex/' + g.newJr, fields: chatFields_({ projectKey: key, jrNumber: g.newJr, oppNumber: g.opp }) } });
      done.push(sig);
    });
    if (!writes.length) return;
    chatFetch_(base.url + ':commit', 'post', { writes: writes });
    done.forEach(function (sig) { cache.put(sig, '1', CHAT_SYNC_CACHE_SECS); });
  } catch (err) {
    console.error('Chat sync skipped: ' + err); // never block the schedule because of chat
  }
}

function chatNotifyFromApp_(user, key, id) {
  key = String(key || ''); id = String(id || '');
  if (!/^(OPP|JR)-\d+$/.test(key) || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error('Unknown message');
  var cache = CacheService.getScriptCache();
  if (cache.get('cn_' + key + '_' + id)) return false; // already emailed

  var base = chatBase_();
  var doc = chatFetch_(base.url + '/projects/' + key + '/messages/' + id, 'get');
  if (!doc || !doc.fields) throw new Error('Message not found');
  var f = doc.fields;
  function str(name) { return f[name] && f[name].stringValue || ''; }
  if (str('kind') !== 'important') return false;
  if (str('authorEmail') !== user.email) throw new Error('Only the author can send this alert');

  var media = (f.mediaUrls && f.mediaUrls.arrayValue && f.mediaUrls.arrayValue.values || []).map(function (v) { return v.stringValue; });
  chatNotify_(key, { authorEmail: str('authorEmail'), authorName: str('authorName'), text: str('text'), jrNumber: str('jrNumber'), oppNumber: str('oppNumber'), mediaUrls: media });
  cache.put('cn_' + key + '_' + id, '1', 21600);
  return true;
}

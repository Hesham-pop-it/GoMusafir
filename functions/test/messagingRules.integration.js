// Run only against Auth/RTDB emulators; never production.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!databaseHost || !authHost || !project.startsWith('demo-')) throw new Error('Demo emulators required');
const base = `http://${databaseHost}`;
const ns = `${project}-default-rtdb`;
async function main() {
  const signup = async (name) => {
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${name}-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
    });
    const { localId: uid, idToken: token } = await response.json();
    assert.ok(uid && token);
    return { uid, token };
  };
  const [a, b, c, staff, mgr, host] = [await signup('a'), await signup('b'), await signup('c'), await signup('staff'), await signup('mgr'), await signup('host')];
  const owner = async (path, value) => {
    const response = await fetch(`${base}/${path}.json?ns=${ns}`, { method: 'PUT',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal(response.status, 200, await response.text());
  };
  const call = (user, path, method = 'GET', data) => fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(user.token)}`, {
    method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let checks = 0;
  const allow = async (user, path, method, data) => { const r = await call(user, path, method, data); assert.equal(r.status, 200, `${path}: ${await r.text()}`); checks++; };
  const deny = async (user, path, method, data) => { const r = await call(user, path, method, data); assert.equal(r.status, 401, `${path}: expected denied, got ${r.status}`); checks++; };
  const now = Date.now();
  const msg = (user, text = 'hi') => ({ sender_id: user.uid, sender_name: 'x', timestamp: Date.now(), text, type: 'text' });
  const bc = [b.uid, c.uid].sort().join('_');
  const ab = [a.uid, b.uid].sort().join('_');
  const am = [a.uid, mgr.uid].sort().join('_');
  const T = 'trips_active/o/t';
  const access = (u) => ({ expires_at: now + 60000, revoked_before: 0 });
  await owner('', {
    users: { [a.uid]: { current_trip: 't' }, [b.uid]: { current_trip: 't' }, [c.uid]: { current_trip: 't' } },
    app_access: { [a.uid]: access(), [b.uid]: access(), [c.uid]: access(), [staff.uid]: access(), [mgr.uid]: access(), [host.uid]: access() },
    orgs: { o: { staff: { [staff.uid]: 'admin', [mgr.uid]: 'manager', [host.uid]: 'co-host' }, trips: { t: { status: 'active', end_date: now + 60000 } } } },
    trips_orgs: { t: 'o' }, trips_participants: { t: { [a.uid]: true, [b.uid]: true, [c.uid]: true } },
    trips_active: { o: { t: {
      dm_threads: {
        [bc]: { members: { [b.uid]: true, [c.uid]: true }, requester: b.uid, status: 'accepted' },
        [ab]: { members: { [a.uid]: true, [b.uid]: true }, requester: a.uid, status: 'pending' },
        [am]: { members: { [a.uid]: true, [mgr.uid]: true }, requester: a.uid, status: 'accepted', staff: mgr.uid },
      },
      dm_messages: { [bc]: { m1: msg(b, 'secret') } },
      team: { [b.uid]: { m1: msg(b, 'team b') } },
      team_meta: { [b.uid]: { needs_reply: true } },
      staff_chat: { s1: msg(staff, 'staff only') },
      chat: { existing: msg(b, 'original') },
      inbox: { [a.uid]: { [ab]: { kind: 'request_out', unread: 3 } }, [b.uid]: { [ab]: { kind: 'request_in', unread: 2 } } },
    } } },
  });

  // Direct threads: members only, staff excluded.
  await deny(a, `${T}/dm_threads/${bc}`);
  await deny(a, `${T}/dm_messages/${bc}`);
  await deny(staff, `${T}/dm_messages/${bc}`);
  await deny(staff, `${T}/dm_threads/${bc}`);
  await allow(b, `${T}/dm_threads/${bc}`);
  await allow(c, `${T}/dm_messages/${bc}`);
  await deny(a, `${T}/dm_messages/${bc}/m2`, 'PUT', msg(a));
  await deny(b, `${T}/dm_threads/${bc}/status`, 'PUT', 'pending');
  // Pending thread: cannot write; accepted: can; overwrite and forgery denied.
  await deny(a, `${T}/dm_messages/${ab}/m1`, 'PUT', msg(a));
  await owner(`${T}/dm_threads/${ab}/status`, 'accepted');
  await allow(a, `${T}/dm_messages/${ab}/m1`, 'PUT', msg(a));
  await deny(a, `${T}/dm_messages/${ab}/m1`, 'PUT', msg(a, 'edit'));
  await deny(a, `${T}/dm_messages/${ab}/m2`, 'PUT', msg(b));
  await deny(a, `${T}/dm_messages/${ab}/m3`, 'PUT', { ...msg(a), text: 'x'.repeat(2001) });
  await deny(a, `${T}/dm_messages/${ab}/m4`, 'PUT', { ...msg(a), type: 'bogus' });
  await allow(a, `${T}/dm_messages/${ab}/m5`, 'PUT', { ...msg(a), type: 'voice' });
  await allow(b, `${T}/dm_messages/${ab}/m6`, 'PUT', msg(b));
  // Block in either direction stops writes.
  await owner(`${T}/blocks/${b.uid}/${a.uid}`, true);
  await deny(a, `${T}/dm_messages/${ab}/m7`, 'PUT', msg(a));
  await deny(b, `${T}/dm_messages/${ab}/m7`, 'PUT', msg(b));
  await deny(a, `${T}/blocks/${b.uid}/${a.uid}`);
  await allow(b, `${T}/blocks/${b.uid}`);
  await deny(b, `${T}/blocks/${b.uid}/${c.uid}`, 'PUT', true);
  await owner(`${T}/blocks/${b.uid}`, null);
  await owner(`${T}/blocks/${a.uid}/${b.uid}`, true);
  await deny(b, `${T}/dm_messages/${ab}/m8`, 'PUT', msg(b));
  await owner(`${T}/blocks/${a.uid}`, null);
  await allow(b, `${T}/dm_messages/${ab}/m8`, 'PUT', msg(b));
  // Private decline record, reports.
  await owner(`${T}/dm_private/${b.uid}/${ab}`, { declined_at: 1 });
  await allow(b, `${T}/dm_private/${b.uid}`);
  await deny(a, `${T}/dm_private/${b.uid}`);
  await deny(b, `${T}/dm_private/${b.uid}/${ab}`, 'PUT', null);
  await owner(`${T}/reports/r1`, { reporter: b.uid, reported: a.uid, threadId: ab, at: 1 });
  await allow(staff, `${T}/reports`);
  await deny(a, `${T}/reports`);
  await deny(staff, `${T}/reports/r2`, 'PUT', { reporter: 'x' });

  // Private staff chat: both members read and write; other staff and Admins only after a report.
  await allow(a, `${T}/dm_threads/${am}`);
  await allow(mgr, `${T}/dm_threads/${am}`);
  await allow(a, `${T}/dm_messages/${am}/m1`, 'PUT', msg(a));
  await allow(mgr, `${T}/dm_messages/${am}/m2`, 'PUT', msg(mgr));
  await allow(mgr, `${T}/dm_messages/${am}`);
  await deny(b, `${T}/dm_messages/${am}`);
  await deny(host, `${T}/dm_threads/${am}`);
  await deny(host, `${T}/dm_messages/${am}`);
  await deny(staff, `${T}/dm_threads/${am}`);
  await deny(staff, `${T}/dm_messages/${am}`);
  await deny(host, `${T}/dm_messages/${am}/m3`, 'PUT', msg(host));
  await deny(staff, `${T}/dm_messages/${am}/m3`, 'PUT', msg(staff));
  await deny(a, `${T}/dm_threads/${am}`, 'PUT', { members: { [a.uid]: true, [host.uid]: true }, status: 'accepted', staff: host.uid });
  await deny(mgr, `${T}/dm_threads/${a.uid}_${host.uid}`, 'PUT', { members: { [a.uid]: true, [mgr.uid]: true }, status: 'accepted' });
  await deny(a, `${T}/report_access/${am}`, 'PUT', true);
  await deny(staff, `${T}/report_access/${am}`, 'PUT', true);
  await deny(a, `${T}/report_access/${am}`);
  await deny(staff, `${T}/report_access/${am}`);
  await owner(`${T}/report_access/${am}`, true);
  await allow(staff, `${T}/dm_threads/${am}`);
  await allow(staff, `${T}/dm_messages/${am}`);
  await deny(staff, `${T}/dm_messages/${am}/m3`, 'PUT', msg(staff));
  await deny(host, `${T}/dm_threads/${am}`);
  await deny(host, `${T}/dm_messages/${am}`);
  await deny(b, `${T}/dm_messages/${am}`);
  await deny(staff, `${T}/dm_messages/${bc}`);

  // Journey team thread.
  await deny(a, `${T}/team/${b.uid}`);
  await deny(a, `${T}/team/${b.uid}/m2`, 'PUT', msg(a));
  await allow(b, `${T}/team/${b.uid}`);
  await allow(a, `${T}/team/${a.uid}/m1`, 'PUT', msg(a));
  await deny(a, `${T}/team/${a.uid}/m1`, 'PUT', msg(a, 'overwrite'));
  await allow(staff, `${T}/team/${a.uid}/m2`, 'PUT', msg(staff));
  await allow(staff, `${T}/team/${b.uid}`);
  await deny(staff, `${T}/team/${a.uid}/m3`, 'PUT', msg(a));
  await allow(staff, `${T}/team_meta`);
  await allow(b, `${T}/team_meta/${b.uid}`);
  await deny(a, `${T}/team_meta/${b.uid}`);
  await deny(a, `${T}/team_meta`);
  await deny(staff, `${T}/team_meta/${b.uid}/needs_reply`, 'PUT', false);
  await allow(staff, `${T}/team_read/${staff.uid}/${a.uid}`, 'PUT', 5);
  await deny(staff, `${T}/team_read/${a.uid}/${a.uid}`, 'PUT', 5);
  await deny(a, `${T}/team_read/${a.uid}/${a.uid}`, 'PUT', 5);

  // Staff chat.
  await allow(staff, `${T}/staff_chat`);
  await deny(a, `${T}/staff_chat`);
  await deny(a, `${T}/staff_chat/s2`, 'PUT', msg(a));
  await allow(staff, `${T}/staff_chat/s2`, 'PUT', msg(staff));
  await deny(staff, `${T}/staff_chat/s2`, 'PUT', msg(staff, 'overwrite'));

  // Group chat: participants create only; staff may moderate.
  await deny(a, `${T}/chat/existing`, 'PUT', msg(a, 'overwritten'));
  await deny(a, `${T}/chat/existing`, 'PUT', null);
  await allow(a, `${T}/chat/new1`, 'PUT', msg(a));
  // System lines are written by the server only.
  await deny(a, `${T}/chat/sys1`, 'PUT', { ...msg(a), type: 'system' });
  await deny(a, `${T}/chat/sys2`, 'PUT', { ...msg(a), sender_id: 'system' });
  await deny(staff, `${T}/chat/sys3`, 'PUT', { ...msg(staff), type: 'system', sender_id: 'system' });
  await allow(a, `${T}/chat`);
  await allow(staff, `${T}/chat/existing`, 'PUT', msg(staff, 'moderated'));
  await allow(staff, `${T}/chat/new1`, 'PUT', null);

  // Inbox: owner reads; only unread -> 0 on existing rows.
  await allow(a, `${T}/inbox/${a.uid}`);
  await deny(a, `${T}/inbox/${b.uid}`);
  await allow(a, `${T}/inbox/${a.uid}/${ab}/unread`, 'PUT', 0);
  await deny(a, `${T}/inbox/${a.uid}/${ab}/unread`, 'PUT', 9);
  await deny(b, `${T}/inbox/${a.uid}/${ab}/unread`, 'PUT', 0);
  await deny(a, `${T}/inbox/${a.uid}/${ab}/last_text`, 'PUT', 'x');
  await deny(a, `${T}/inbox/${a.uid}/${ab}`, 'PUT', { kind: 'dm', unread: 0 });
  await deny(a, `${T}/inbox/${a.uid}/new/unread`, 'PUT', 0);

  // Message settings.
  await allow(a, `${T}/message_settings/${a.uid}`, 'PUT', { requests: 'nobody' });
  await deny(a, `${T}/message_settings/${a.uid}`, 'PUT', { requests: 'everyone' });
  await deny(b, `${T}/message_settings/${a.uid}`);
  await deny(b, `${T}/message_settings/${a.uid}`, 'PUT', { requests: 'members' });

  // Ended trip: participants lose access, staff keep it.
  await owner('orgs/o/trips/t/end_date', Date.now() - 1);
  await deny(a, `${T}/team/${a.uid}/m9`, 'PUT', msg(a));
  await deny(a, `${T}/dm_messages/${ab}/m9`, 'PUT', msg(a));
  await deny(a, `${T}/chat/new2`, 'PUT', msg(a));
  await deny(a, `${T}/inbox/${a.uid}`);
  await deny(a, `${T}/message_settings/${a.uid}`, 'PUT', { requests: 'members' });
  await allow(staff, `${T}/team/${a.uid}/m9`, 'PUT', msg(staff));
  await allow(staff, `${T}/staff_chat/s3`, 'PUT', msg(staff));
  await deny(a, `${T}/dm_messages/${am}/m9`, 'PUT', msg(a));
  await allow(mgr, `${T}/dm_messages/${am}`);
  await allow(staff, `${T}/dm_messages/${am}`);
  console.log(`PASS: ${checks} direct RTDB checks for messaging rules.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

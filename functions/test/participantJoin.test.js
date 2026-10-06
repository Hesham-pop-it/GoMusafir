const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture({ capacity = 2, failWrite = false, failAccess = false, authProfile = {} } = {}) {
  const data = { invites: { JOIN: { org_id: 'o', trip_id: 't' } }, orgs: { o: { trips: { t: {
    status: 'active', end_date: Date.now() + 60000, participants: 0, total_seats: capacity,
  } } } } };
  const read = key => key.split('/').filter(Boolean).reduce((v,k) => v?.[k], data);
  const write = (key, value) => { const parts=key.split('/');const last=parts.pop();const parent=parts.reduce((v,k)=>v[k] ||= {},data);parent[last]=value; };
  const snap = value => { const copy=value == null ? null : JSON.parse(JSON.stringify(value));return {val:()=>copy,exists:()=>copy!=null}; };
  let prematureParticipant = false;
  const db = {ref:(key='')=>({get:async()=>snap(read(key)),set:async value=>{
    write(key,value);if(key.endsWith('account_type') && !read('trips_participants/t/p')) prematureParticipant=true;
  },update:async updates=>{
    if(failWrite){failWrite=false;throw new Error('write unavailable');}
    for(const [k,v] of Object.entries(updates))write(key ? `${key}/${k}`:k,v);
  },transaction:async cb=>{cb(null);const value=cb(read(key));if(value!==undefined)write(key,value);return {committed:value!==undefined,snapshot:snap(read(key))};}})};
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  const access = {tripExpiry:t=>t?.status==='active' && t.end_date>Date.now()?t.end_date:0,refreshAccess:async uid=>{
    if(failAccess){failAccess=false;throw new Error('access unavailable after commit');}
    assert.equal(read(`trips_participants/t/${uid}`),true);
    assert.equal(read(`users/${uid}/joined_trips/t/org_id`),'o');
    return {trips:{t:Date.now()+60000},expires_at:Date.now()+60000,version:2};
  }};
  const deps = {'../admin':{db,auth:{getUser:async()=>({emailVerified:true,email:'p@test.example',...authProfile}),updateUser:async()=>{}},admin:{database:{ServerValue:{TIMESTAMP:123}}}},
    'firebase-functions/v2/https':{HttpsError},'../services/participantAccessService':access,'./participantAccessService':access,
    '../middleware/participantAccessMiddleware':{onCall:(_,fn)=>fn},'../services/auditService':{writeAuditLog:async()=>{}},
    '../middleware/appCheckMiddleware':{verifyAppCheck:()=>{},requireAuth:()=>{}},
    '../middleware/validateSchema':{validate:(_,v)=>v,schemas:{}},'../middleware/rateLimiter':{checkRateLimit:()=>{}},
    '../services/kmsService':{encrypt:v=>v,decrypt:v=>v},crypto:require('node:crypto')};
  function load(file){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{
    module,exports:module.exports,require:key=>{if(deps[key])return deps[key];throw Error(key);},console,Date,Number,Object,
  });return module.exports;}
  deps['../services/participantJoinSeat']=load('services/participantJoinSeat.js');
  const join=load('groups/inviteFunctions.js').redeemInvitation;
  return {data,read,join:(uid,profile={})=>join({auth:{uid:uid||'p'},data:{inviteCode:'JOIN',...profile}}),premature:()=>prematureParticipant};
}
test('returning participant restores name and photo from Auth when basic profile is missing', async () => {
  const f=fixture({authProfile:{displayName:'Ali Khan',photoURL:'https://example.test/ali.jpg'}});
  await f.join();
  assert.equal(f.read('users/p/profile/firstName'),'Ali');
  assert.equal(f.read('users/p/profile/lastName'),'Khan');
  assert.equal(f.read('users/p/profile/photoURL'),'https://example.test/ali.jpg');
});
test('returning participant restores encrypted profile without dropping preferences', async () => {
  const f=fixture();
  f.data.users={p:{p_profile:JSON.stringify({firstName:'Sara',lastName:'Ali',photoURL:'https://example.test/sara.jpg'}),profile:{likes:{t:true}}}};
  await f.join();
  assert.equal(f.read('users/p/profile/firstName'),'Sara');
  assert.equal(f.read('users/p/photo_url'),'https://example.test/sara.jpg');
  assert.equal(f.read('users/p/profile/likes/t'),true);
});
test('already joined participant can repair missing profile without another seat', async () => {
  const f=fixture();
  await f.join();
  await f.join('p',{firstName:'Ali',lastName:'Khan',photoURL:'https://example.test/ali.jpg'});
  assert.equal(f.read('users/p/profile/firstName'),'Ali');
  assert.equal(f.read('users/p/photo_url'),'https://example.test/ali.jpg');
  assert.equal(f.read('orgs/o/trips/t/participants'),1);
});
test('new registration publishes account type and membership together and returns access',async()=>{
  const f=fixture();const result=await f.join();assert.equal(result.tripId,'t');assert.ok(result.access.trips.t);
  assert.equal(f.premature(),false);assert.equal(f.read('users/p/current_trip'),'t');assert.equal(f.read('users/p/mfa_pending'),false);
});
test('simultaneous repeated joins occupy one seat and one membership',async()=>{
  const f=fixture();await Promise.all([f.join(),f.join(),f.join()]);
  assert.equal(f.read('orgs/o/trips/t/participants'),1);assert.equal(Object.keys(f.read('trips_participants/t')).length,1);
});
test('response/access failure after commit recovers through idempotent retry',async()=>{
  const f=fixture({failAccess:true});await assert.rejects(f.join(),{code:'internal'});
  assert.equal(f.read('trips_participants/t/p'),true);assert.ok((await f.join()).access.trips.t);
  assert.equal(f.read('orgs/o/trips/t/participants'),1);
});
test('interrupted write reuses the reserved seat even when capacity is full',async()=>{
  const f=fixture({capacity:1,failWrite:true});await assert.rejects(f.join(),{code:'internal'});
  await f.join();assert.equal(f.read('orgs/o/trips/t/participants'),1);
});
test('different participants cannot concurrently claim the last seat',async()=>{
  const f=fixture({capacity:1});const results=await Promise.allSettled([f.join('a'),f.join('b')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.read('orgs/o/trips/t/participants'),1);
});

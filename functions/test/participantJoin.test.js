const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture({ capacity = 2, failWrite = false, failAccess = false, authProfile = {} } = {}) {
  let data = { invites: { JOIN: { org_id: 'o', trip_id: 't' } }, orgs: { o: { trips: { t: {
    status: 'active', end_date: Date.now() + 60000, participants: 0, total_seats: capacity,
  } } } } };
  const read = key => key.split('/').filter(Boolean).reduce((v,k) => v?.[k], data);
  const write = (key, value) => { const parts=key.split('/');const last=parts.pop();const parent=parts.reduce((v,k)=>v[k] ||= {},data);parent[last]=value; };
  const snap = value => { const copy=value == null ? null : JSON.parse(JSON.stringify(value));return {val:()=>copy,exists:()=>copy!=null}; };
  let prematureParticipant = false, failUpdate = false;
  const transactions = [];
  const db = {ref:(key='')=>({get:async()=>snap(read(key)),set:async value=>{
    write(key,value);if(key.endsWith('account_type') && !read('trips_participants/t/p')) prematureParticipant=true;
  },update:async updates=>{
    if(failUpdate){failUpdate=false;throw new Error('update unavailable');}
    if(failWrite){failWrite=false;throw new Error('write unavailable');}
    for(const [k,v] of Object.entries(updates))write(key ? `${key}/${k}`:k,v);
  },transaction:async cb=>{transactions.push(key);cb(null);const value=cb(snap(read(key)).val());if(failWrite){failWrite=false;throw new Error('write unavailable');}if(value!==undefined){if(key)write(key,value);else data=value;}return {committed:value!==undefined,snapshot:snap(read(key))};}})};
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
  deps['./tripCapacity']=deps['../services/tripCapacity']=require('../services/tripCapacity');
  deps['../services/participantJoinSeat']=load('services/participantJoinSeat.js');
  const {redeemInvitation:join,getInviteMetadata:metadata}=load('groups/inviteFunctions.js');
  return {get data(){return data;},read,transactions,failNextUpdate:()=>{failUpdate=true;},metadata:uid=>metadata({auth:uid?{uid}:undefined,data:{inviteCode:'JOIN'}}),join:(uid,profile={})=>join({auth:{uid:uid||'p'},data:{inviteCode:'JOIN',...profile}}),premature:()=>prematureParticipant};
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
test('interrupted join leaves no partial membership or consumed seat',async()=>{
  const f=fixture({capacity:1,failWrite:true});await assert.rejects(f.join(),{code:'internal'});
  assert.equal(f.read('orgs/o/trips/t/participants'),0);
  assert.equal(f.read('trips_participants/t/p'),undefined);
  assert.equal(f.read('users/p'),undefined);
  await f.join();assert.equal(f.read('orgs/o/trips/t/participants'),1);
});
test('different participants cannot concurrently claim the last seat',async()=>{
  const f=fixture({capacity:1});const results=await Promise.allSettled([f.join('a'),f.join('b')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.read('orgs/o/trips/t/participants'),1);
});

test('QR metadata and joining ignore a stale full counter and abandoned reservations', async () => {
  const f=fixture({capacity:5});
  f.data.orgs.o.staff={host:'admin'};
  Object.assign(f.data.orgs.o.trips.t,{participants:5,participant_join_seats:{removed:true}});
  f.data.trips_participants={t:{host:true,a:true,b:true}};
  const preview=await f.metadata('new');
  assert.equal(preview.filledSeats,3);
  assert.equal(preview.isFull,false);
  await f.join('new');
  assert.equal(f.read('orgs/o/trips/t/participants'),4);
  assert.equal(f.read('orgs/o/trips/t/participant_join_seats') ?? undefined,undefined);
});
test('removing a member frees a seat even when the old counter remains full',async()=>{
  const f=fixture({capacity:1});await f.join('a');
  delete f.data.trips_participants.t.a;
  assert.equal((await f.metadata('b')).isFull,false);
  await f.join('b');assert.equal(f.read('orgs/o/trips/t/participants'),1);
});
test('genuinely full membership rejects a new UID despite a stale low counter or old seat marker',async()=>{
  const f=fixture({capacity:1});
  f.data.trips_participants={t:{a:true}};
  f.data.orgs.o.trips.t.participant_join_seats={b:true};
  assert.equal((await f.metadata('b')).isFull,true);
  await assert.rejects(f.join('b'),{code:'resource-exhausted'});
  assert.equal(f.read('trips_participants/t/b'),undefined);
});
test('organizers occupy seats once and a full trip permits an existing member to retry',async()=>{
  const f=fixture({capacity:2});
  f.data.orgs.o.staff={host:'admin',manager:'manager'};
  f.data.trips_participants={t:{host:true}};
  assert.equal((await f.metadata()).filledSeats,2);
  await assert.rejects(f.join('new'),{code:'resource-exhausted'});
  await f.join('host');assert.equal(f.read('orgs/o/trips/t/participants'),2);
});
test('mobile and server use identical capacity math',()=>{
  assert.equal(fs.readFileSync(path.join(__dirname,'../services/tripCapacity.js'),'utf8'),
    fs.readFileSync(path.join(__dirname,'../../src/utils/tripCapacity.js'),'utf8'));
});
test('legacy UID arrays migrate without losing existing members',async()=>{
  const f=fixture({capacity:3});
  f.data.trips_participants={t:['a','b']};
  assert.equal((await f.metadata()).filledSeats,2);
  await f.join('p');
  assert.equal(f.read('trips_participants/t/a'),true);
  assert.equal(f.read('trips_participants/t/b'),true);
  assert.equal(f.read('trips_participants/t/p'),true);
  assert.equal(f.read('orgs/o/trips/t/participants'),3);
});
test('numeric string capacity is compared numerically',async()=>{
  const f=fixture({capacity:'10'});
  f.data.orgs.o.trips.t.participants='9';
  f.data.trips_participants={t:Object.fromEntries(Array.from({length:9},(_,i)=>[`p${i}`,true]))};
  assert.equal((await f.metadata()).isFull,false);
  await f.join();
  assert.equal((await f.metadata()).isFull,true);
});

test('the seat check runs as a transaction on the trip membership, never on the database root',async()=>{
  const f=fixture();await f.join();
  assert.deepEqual(f.transactions,['trips_participants/t']);
  assert.equal(f.read('trips_participants/t/p'),true);
});
test('a failed follow-up write takes the new membership out again and frees the seat',async()=>{
  const f=fixture({capacity:1});f.failNextUpdate();
  await assert.rejects(f.join('a'),{code:'internal'});
  assert.equal(f.read('trips_participants/t'),null);
  await f.join('b');assert.equal(f.read('orgs/o/trips/t/participants'),1);
});

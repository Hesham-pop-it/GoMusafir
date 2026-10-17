const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../services/visibilityPolicy');
const { redactNotification } = require('../services/notificationPrivacy');

function fixture({ mode = 'Show to organizers', personal = {}, viewerRole = null, realCache = false } = {}) {
  const fields = ['name','lastname','email','phone','location'];
  const state = {
    orgs: { o: { staff: viewerRole ? { a: viewerRole } : {}, trips: { t: { visibility_config: Object.fromEntries(fields.map(f => [f, mode])) } } } },
    trips_participants: { t: { a: true, b: true, c: true } },
    users: Object.fromEntries(['a','b','c'].map(uid => [uid, { profile: { firstName: `First-${uid}`, lastName: `Last-${uid}`, email: `${uid}@test.invalid`, phone: '123' }, participant_visibility: { t: personal } }])),
    trips_active: { o: { t: { locations: { b: { lat: 31, lng: 71, email: 'leak@test.invalid' } }, location_permissions: {}, notifications: {},
      chat: { message: { sender_id: 'b', sender_name: 'First-b Last-b', avatar: 'private-photo', type: 'location', latitude: 31, longitude: 71, replyTo: { sender: 'First-b Last-b', text: 'Hello' } } } } } },
  };
  let nextId = 0;
  const read = path => path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],state);
  const write = (path, value) => { const keys = path.split('/'); const last = keys.pop(); keys.reduce((v,k)=>v[k] ||= {},state)[last] = value; };
  const snap = v => ({val:()=>v, exists:()=>v != null});
  const reads = [], cached = [], transactions = [];
  const db = {ref(path='') { return {
    update:async values=>{for(const [k,v] of Object.entries(values))write(k,v);},
    get:async()=>{reads.push(path);return snap(read(path));}, set:async value=>write(path,value),
    orderByChild(){return this;},limitToLast(){return this;},
    push(){const key=`request-${++nextId}`;return {key,set:async value=>write(`${path}/${key}`,value)};},
    transaction:async fn=>{transactions.push(path);const result=fn(structuredClone(read(path)));if(result===undefined)return {committed:false,snapshot:snap(read(path))};write(path,result);return {committed:true,snapshot:snap(result)};},
  };}};
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  const access = async (request, tripId) => {
    if (tripId !== 't' || !state.trips_participants.t[request.auth.uid]) throw new HttpsError('permission-denied','No access');
    return {orgId:'o',trip:state.orgs.o.trips.t,staff:['admin','manager','co-host'].includes(state.orgs.o.staff[request.auth.uid])};
  };
  const deps = {
    'firebase-functions/v2/https':{HttpsError}, '../admin':{db,auth:{getUser:async()=>({email:'fallback@test.invalid'})}},
    './participantAccessService':{requireTripAccess:access}, './notificationPrivacy':{redactNotification}, './kmsService':{decrypt:v=>v}, './visibilityPolicy':policy,
    './unchangedResponse':require('../services/unchangedResponse'),
    // The shared cache has its own test; most tests here change records between calls.
    './userRecordCache':{cachedUser:(store,uid)=>{cached.push(uid);return store.ref(`users/${uid}`).get();}},
  };
  function load(file) {
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(require.resolve(file),'utf8'),{module,exports:module.exports,require:name=>{if(deps[name])return deps[name];throw Error(name);},console});
    return module.exports;
  }
  if (realCache) deps['./userRecordCache']=load('../services/userRecordCache');
  deps['./participantProfileService']=load('../services/participantProfileService');
  const service=load('../services/tripVisibilityService');
  const call = (method, data={}, uid='a') => service[method]({auth:{uid,token:{role:'admin',orgId:'forged'}},data:{tripId:'t',...data}});
  return {state,call,reads,cached,transactions,root:()=>state.trips_active.o.t};
}
for (const role of [null,'admin','manager','co-host']) {
  test(`organizer visibility uses current organization membership: ${role}`, async()=>{
    const f=fixture({viewerRole:role});const result=await f.call('getVisibleTripData');
    for(const key of ['firstName','lastName','email','phone'])assert.equal(Boolean(result.users.b.profile[key]),Boolean(role));
    assert.equal(Boolean(result.locations.b),Boolean(role));
  });
}
test('Do Not Show hides all fields even from staff; Everyone returns the fields without raw aliases',async()=>{
  for(const mode of ['Do Not Show','Show to Everyone']){
    const f=fixture({mode,viewerRole:'admin'});const result=await f.call('getVisibleTripData');
    const allowed=mode==='Show to Everyone';
    assert.equal(Boolean(result.users.b.profile.email),allowed);assert.equal(Boolean(result.locations.b),allowed);
    if(allowed)assert.equal(result.locations.b.email,undefined);
  }
});
test('Custom Choice resolves each field independently and missing choices fail closed',async()=>{
  const f=fixture({mode:'Custom Choice',personal:{name:'Show to everyone',lastname:'Do not show',email:'Show to organizers',location:'Do not show'}});
  const result=await f.call('getVisibleTripData');
  assert.equal(result.users.b.profile.firstName,'First-b');assert.equal(result.users.b.profile.lastName,'');
  assert.equal(result.users.b.profile.email,'');assert.equal(result.users.b.profile.phone,'');assert.equal(result.locations.b,undefined);
});
test('only recipient acceptance grants one requester temporary location access without changing visibility',async()=>{
  const f=fixture({mode:'Do Not Show'});
  const {id}=await f.call('requestParticipantLocation',{targetUid:'b'});
  assert.equal((await f.call('getVisibleTripData')).locations.b,undefined);
  assert.equal((await f.call('getVisibleTripData',{section:'notifications'},'b'))[id].status,'pending');
  await assert.rejects(f.call('respondToLocationRequest',{notificationId:id,accept:true},'c'));
  await f.call('respondToLocationRequest',{notificationId:id,accept:true},'b');
  const firstGrant=structuredClone(f.root().location_permissions.b.a);
  assert.equal((await f.call('getVisibleTripData')).locations.b.lat,31);
  assert.equal((await f.call('getVisibleTripData',{},'c')).locations.b,undefined);
  assert.equal((await f.call('getVisibleTripData')).users.b.profile.email,'');
  await f.call('respondToLocationRequest',{notificationId:id,accept:true},'b');
  assert.equal(JSON.stringify(f.root().location_permissions.b.a),JSON.stringify(firstGrant));
  assert.equal(f.state.orgs.o.trips.t.visibility_config.location,'Do Not Show');
  const notifications = await f.call('getVisibleTripData',{section:'notifications'});
  assert.equal(notifications[`location_response_${id}`].title,'Location Request Accepted');
  f.root().location_permissions.b.a.expiresAt=Date.now()-1;
  assert.equal((await f.call('getVisibleTripData')).locations.b,undefined);
});
test('answering a location request runs the transaction on the one request only',async()=>{
  const f=fixture();const {id}=await f.call('requestParticipantLocation',{targetUid:'b'});
  await f.call('respondToLocationRequest',{notificationId:id,accept:true},'b');
  assert.deepEqual(f.transactions,[`trips_active/o/t/notifications/b/${id}`]);
  assert.equal(f.root().notifications.b[id].status,'accepted');
  assert.equal(f.root().notifications.a[`location_response_${id}`].status,'accepted');
});
test('decline, expired requests, legacy boolean grants and removed members do not expose location',async()=>{
  const f=fixture();const {id}=await f.call('requestParticipantLocation',{targetUid:'b'});
  await f.call('respondToLocationRequest',{notificationId:id,accept:false},'b');
  assert.equal((await f.call('getVisibleTripData')).locations.b,undefined);
  f.root().location_permissions.b={a:true};
  assert.equal((await f.call('getVisibleTripData')).locations.b,undefined);
  const second=await f.call('requestParticipantLocation',{targetUid:'b'});
  f.root().notifications.b[second.id].expiresAt=1;
  await assert.rejects(f.call('respondToLocationRequest',{notificationId:second.id,accept:true},'b'));
  delete f.state.trips_participants.t.b;
  await assert.rejects(f.call('requestParticipantLocation',{targetUid:'b'}));
});
test('old chat and reply metadata cannot expose hidden identities or location attachments',async()=>{
  const f=fixture();const data=await f.call('getVisibleTripData',{section:'chat'});
  assert.equal(data.message.sender_name,'Participant');assert.equal(data.message.replyTo.sender,'Participant');
  assert.equal(data.message.latitude,undefined);assert.equal(data.message.type,'text');assert.equal(data.message.avatar,'');
});
test('notification history and push payloads contain no copied participant PII',()=>{
  const result=redactNotification({type:'emergency',senderUid:'b',name:'Hidden Name',message:'Hidden Name needs help',title:'Hidden Name',lat:1,lng:2,senderImage:'private'});
  assert.equal(result.name,'Participant');assert.equal(result.lat,undefined);assert.equal(result.senderImage,undefined);
  assert.ok(!JSON.stringify(result).includes('Hidden Name'));
});
test('chat, voice and notifications read only the profiles they name and no coordinates',async()=>{
  const f=fixture({mode:'Show to Everyone'});
  f.reads.length=0;
  const chat=await f.call('getVisibleTripData',{section:'chat'});
  assert.equal(chat.message.sender_name,'First-b Last-b');
  assert.deepEqual(f.reads.filter(path=>path.startsWith('users/')),['users/b']);
  assert.ok(!f.reads.some(path=>path.endsWith('/locations')));
  f.root().voice_channel={activeSpeaker:{uid:'c'}};f.reads.length=0;
  assert.equal((await f.call('getVisibleTripData',{section:'voice'})).activeSpeaker.name,'First-c Last-c');
  assert.deepEqual(f.reads.filter(path=>path.startsWith('users/')),['users/c']);
  f.root().voice_channel={};f.reads.length=0;
  await f.call('getVisibleTripData',{section:'voice'});
  assert.deepEqual(f.reads.filter(path=>path.startsWith('users/')),[]);
  const {id}=await f.call('requestParticipantLocation',{targetUid:'b'});f.reads.length=0;
  assert.equal((await f.call('getVisibleTripData',{section:'notifications'},'b'))[id].name,'First-a Last-a');
  assert.deepEqual(f.reads.filter(path=>path.startsWith('users/')),['users/a']);
  f.reads.length=0;await f.call('getVisibleTripData');
  assert.equal(f.reads.filter(path=>path.startsWith('users/')).length,3);
});
test('polls that send the hash they hold get an unchanged answer until the redacted data changes',async()=>{
  const f=fixture({mode:'Show to Everyone'});
  const plain=await f.call('getVisibleTripData');
  assert.equal(plain.envelope,undefined);assert.ok(plain.users.b);
  const first=await f.call('getVisibleTripData',{knownHash:''});
  assert.equal(first.envelope,1);assert.deepEqual(first.data,plain);
  const same=await f.call('getVisibleTripData',{knownHash:first.hash});
  assert.deepEqual(same,{envelope:1,unchanged:true,hash:first.hash});
  f.state.users.b.participant_visibility.t={name:'Do not show'};
  f.state.orgs.o.trips.t.visibility_config.name='Custom Choice';
  const changed=await f.call('getVisibleTripData',{knownHash:first.hash});
  assert.notEqual(changed.hash,first.hash);assert.equal(changed.data.users.b.profile.firstName,'');
  assert.equal((await f.call('getVisibleTripData',{knownHash:'x'.repeat(65)})).envelope,undefined);
});
test('directory polls with known parts receive only the parts that changed',async()=>{
  const f=fixture({mode:'Show to Everyone'});
  const first=await f.call('getVisibleTripData',{knownParts:{}});
  assert.deepEqual(Object.keys(first.data).sort(),['location_permissions','locations','users']);
  const same=await f.call('getVisibleTripData',{knownParts:first.parts});
  assert.equal(same.unchanged,true);assert.equal(same.data,undefined);
  f.root().locations.b.lat=32;
  const moved=await f.call('getVisibleTripData',{knownParts:first.parts});
  assert.deepEqual(Object.keys(moved.data),['locations']);assert.equal(moved.data.locations.b.lat,32);
  assert.equal(moved.parts.users,first.parts.users);
  const gone=await f.call('getVisibleTripData',{knownParts:{...moved.parts,extra:'x'}});
  assert.equal(gone.unchanged,undefined);assert.deepEqual(gone.data,{});
  assert.equal((await f.call('getVisibleTripData',{knownParts:{a:1}})).envelope,undefined);
});
test('the directory reads the viewer\'s own record fresh and shares only the other records',async()=>{
  const f=fixture({mode:'Show to Everyone'});
  await f.call('getVisibleTripData');
  assert.deepEqual(f.cached.sort(),['b','c']);
  assert.ok(f.reads.includes('users/a'));
});
test('shared records are redacted per viewer and the viewer\'s own record is never shared',async()=>{
  const f=fixture({mode:'Show to organizers',viewerRole:'admin',realCache:true});
  const staff=await f.call('getVisibleTripData',{},'a');
  const pilgrim=await f.call('getVisibleTripData',{},'b');
  assert.equal(staff.users.c.profile.email,'c@test.invalid');
  assert.equal(pilgrim.users.c.profile.email,'');
  assert.equal(f.reads.filter(path=>path==='users/c').length,1);
  assert.equal(f.state.users.c.profile.email,'c@test.invalid');
  const count=path=>f.reads.filter(read=>read===path).length,own=count('users/b'),other=count('users/c');
  await f.call('getVisibleTripData',{},'b');
  assert.equal(count('users/b'),own+1);assert.equal(count('users/c'),other);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../services/visibilityPolicy');
const { redactNotification } = require('../services/notificationPrivacy');

function fixture({ mode = 'Show to organizers', personal = {}, viewerRole = null } = {}) {
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
  const db = {ref(path) { return {
    get:async()=>snap(read(path)), set:async value=>write(path,value),
    orderByChild(){return this;},limitToLast(){return this;},
    push(){const key=`request-${++nextId}`;return {key,set:async value=>write(`${path}/${key}`,value)};},
    transaction:async fn=>{const result=fn(structuredClone(read(path)));if(result===undefined)return {committed:false,snapshot:snap(read(path))};write(path,result);return {committed:true,snapshot:snap(result)};},
  };}};
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  const access = async (request, tripId) => {
    if (tripId !== 't' || !state.trips_participants.t[request.auth.uid]) throw new HttpsError('permission-denied','No access');
    return {orgId:'o',trip:state.orgs.o.trips.t,staff:['admin','manager','co-host'].includes(state.orgs.o.staff[request.auth.uid])};
  };
  const deps = {
    'firebase-functions/v2/https':{HttpsError}, '../admin':{db,auth:{getUser:async()=>({email:'fallback@test.invalid'})}},
    './participantAccessService':{requireTripAccess:access}, './notificationPrivacy':{redactNotification}, './kmsService':{decrypt:v=>v}, './visibilityPolicy':policy,
  };
  function load(file) {
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(require.resolve(file),'utf8'),{module,exports:module.exports,require:name=>{if(deps[name])return deps[name];throw Error(name);},console});
    return module.exports;
  }
  deps['./participantProfileService']=load('../services/participantProfileService');
  const service=load('../services/tripVisibilityService');
  const call = (method, data={}, uid='a') => service[method]({auth:{uid,token:{role:'admin',orgId:'forged'}},data:{tripId:'t',...data}});
  return {state,call,root:()=>state.trips_active.o.t};
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

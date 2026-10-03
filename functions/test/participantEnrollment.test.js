const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
class HttpsError extends Error { constructor(code, message) { super(message);this.code = code; } }
function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../groups', file), 'utf8'), {
    module, exports: module.exports, require: key => {
      if (key === 'crypto') return crypto;
      if (dependencies[key]) return dependencies[key];
      throw new Error(`Unexpected dependency ${key}`);
    }, console, Date, Number, Object, Set,
  });
  return module.exports;
}
function signInFixture(access, refreshFailure = null) {
  const noop = async () => {};
  return load('authFunctions.js', {
    '../services/participantAccessService': { calculateAccess: async () => access, refreshAccess: async () => { if (refreshFailure) throw refreshFailure; return access; } },
    'firebase-functions/v2': {},
    'firebase-functions/v2/https': { HttpsError },
    '../middleware/participantAccessMiddleware': { onCall: (_, handler) => handler },
    'firebase-functions/v2/identity': { beforeUserCreated: (_,handler)=>handler, beforeUserSignedIn: (_,handler)=>handler },
    '../admin': { admin:{ database:{ServerValue:{TIMESTAMP:0}}},db:{ref:()=>({push:noop,get:async()=>({val:()=>({})}),update:noop})} },
    '../services/kmsService': {}, '../services/auditService': {}, '../middleware/appCheckMiddleware': {},
    '../services/emailService': {}, '../services/notificationService': { sendPushNotification: noop }, '../services/stripeService': {},
  }).onSignIn;
}
test('ordinary backend sign-in rejects participants with no eligible trip', async () => {
  const signIn=signInFixture({participant:true,staff:false,expires_at:0});
  await assert.rejects(signIn({data:{uid:'p',email:'p@example.test'}}),{code:'permission-denied'});
});
test('ordinary backend sign-in admits valid participants and staff', async () => {
  for (const access of [{participant:true,staff:false,expires_at:Date.now()+10000},{participant:false,staff:true,expires_at:0}]) {
    await signInFixture(access)({data:{uid:'p',email:'p@example.test'}});
  }
});
function enrollmentFixture({ coldCache = false } = {}) {
  const challengeId = 'a'.repeat(64);const code = '123456';let tokens=0;
  const emails=[];
  const data={
    [`enrollment_challenges/${challengeId}`]: {uid:'p',inviteCode:'JOIN',attempts:0,expires_at:Date.now()+60000,
      digest:crypto.createHash('sha256').update(`${challengeId}:${code}`).digest('hex')},
    'invites/JOIN':{org_id:'o',trip_id:'t',expires_at:Date.now()+60000},
    'orgs/o/trips/t':{status:'active',end_date:Date.now()+60000},
  };
  const db={ref:key=>({get:async()=>({val:()=>data[key]}),set:async value=>{data[key]=value;},
    transaction:async cb=>{
      // RTDB first runs against its local cache. Only a proposed write lets
      // the server return the existing record and retry the callback.
      if(coldCache && cb(null) === undefined) {
        return {committed:false,snapshot:{val:()=>null}};
      }
      const next=cb(data[key] ?? null);if(next!==undefined)data[key]=next;
      return {committed:next!==undefined,snapshot:{val:()=>data[key]}};}})};
  const handlers=load('participantAccessFunctions.js', {
    'firebase-functions/v2/https': {HttpsError,onCall:(_,handler)=>handler},
    'firebase-functions/v2/database':{onValueWritten:(_,handler)=>handler},
    'firebase-functions/v2/scheduler':{onSchedule:(_,handler)=>handler},
    '../admin':{db,admin:{auth:()=>({getUserByEmail:async()=>({uid:'p'}),getUser:async()=>({uid:'p'}),updateUser:async()=>{},createCustomToken:async()=>{tokens++;return 'enrollment-token';}})}},
    '../services/emailService':{sendEmail:async email=>{emails.push(email);}},
    '../services/participantAccessService':{tripExpiry:trip=>trip?.status==='active' && trip.end_date>Date.now()?trip.end_date:0},
  });
  return {data,challengeId,code,emails,begin:handlers.beginParticipantEnrollment,complete:handlers.completeParticipantEnrollment,tokens:()=>tokens};
}
test('the emailed participant code matches its stored challenge and verifies with a cold cache', async () => {
  const f=enrollmentFixture({coldCache:true});
  const {challengeId}=await f.begin({data:{email:'Participant@example.test',inviteCode:'JOIN'}});
  assert.equal(f.emails[0].to,'participant@example.test');
  const code=f.emails[0].html.match(/<h1>(\d{6})<\/h1>/)[1];
  assert.equal(f.data[`enrollment_challenges/${challengeId}`].digest,
    crypto.createHash('sha256').update(`${challengeId}:${code}`).digest('hex'));
  assert.equal((await f.complete({data:{challengeId,code}})).customToken,'enrollment-token');
});
test('valid invitation plus email proof issues one enrollment token; replay is rejected', async () => {
  const f=enrollmentFixture();const request={data:{challengeId:f.challengeId,code:f.code}};
  assert.equal((await f.complete(request)).customToken,'enrollment-token');
  await assert.rejects(f.complete(request),{code:'permission-denied'});
  assert.equal(f.tokens(),1);
});
test('valid emailed code verifies when the function has an empty local database cache', async () => {
  const f=enrollmentFixture({coldCache:true});
  assert.equal((await f.complete({data:{challengeId:f.challengeId,code:f.code}})).customToken,'enrollment-token');
  assert.equal(f.data[`enrollment_challenges/${f.challengeId}`].attempts,1);
  await assert.rejects(f.complete({data:{challengeId:f.challengeId,code:f.code}}),{code:'permission-denied'});
  assert.equal(f.tokens(),1);
});
test('a genuinely missing challenge still rejects the code with an empty local cache', async () => {
  const f=enrollmentFixture({coldCache:true});
  delete f.data[`enrollment_challenges/${f.challengeId}`];
  await assert.rejects(f.complete({data:{challengeId:f.challengeId,code:f.code}}),{code:'permission-denied'});
  assert.equal(f.tokens(),0);
});
test('five incorrect codes exhaust the challenge, including subsequent correct code', async () => {
  const f=enrollmentFixture();
  for(let i=0;i<5;i++)await assert.rejects(f.complete({data:{challengeId:f.challengeId,code:'000000'}}),{code:'permission-denied'});
  await assert.rejects(f.complete({data:{challengeId:f.challengeId,code:f.code}}),{code:'permission-denied'});
  assert.equal(f.tokens(),0);
});
test('trip expiry between code issuance and verification denies enrollment', async () => {
  const f=enrollmentFixture();f.data['orgs/o/trips/t'].end_date=Date.now()-1;
  await assert.rejects(f.complete({data:{challengeId:f.challengeId,code:f.code}}),{code:'permission-denied'});
  assert.equal(f.tokens(),0);
});

for (const role of ['admin', 'co-host', 'manager']) {
  test(`${role} signs in without trips even when participant reconciliation is unavailable`, async () => {
    const signIn = signInFixture({staff:true,participant:false,expires_at:0}, new Error('Access reconciliation unavailable'));
    await signIn({data:{uid:'staff',email:'staff@example.test',customClaims:{role}}});
  });
}

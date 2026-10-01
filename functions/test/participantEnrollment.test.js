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
function enrollmentFixture() {
  const challengeId = 'a'.repeat(64);const code = '123456';let tokens=0;
  const data={
    [`enrollment_challenges/${challengeId}`]: {uid:'p',inviteCode:'JOIN',attempts:0,expires_at:Date.now()+60000,
      digest:crypto.createHash('sha256').update(`${challengeId}:${code}`).digest('hex')},
    'invites/JOIN':{org_id:'o',trip_id:'t',expires_at:Date.now()+60000},
    'orgs/o/trips/t':{status:'active',end_date:Date.now()+60000},
  };
  const db={ref:key=>({get:async()=>({val:()=>data[key]}),set:async value=>{data[key]=value;},
    transaction:async cb=>{const next=cb(data[key]);if(next!==undefined)data[key]=next;
      return {committed:next!==undefined,snapshot:{val:()=>data[key]}};}})};
  const handlers=load('participantAccessFunctions.js', {
    'firebase-functions/v2/https': {HttpsError,onCall:(_,handler)=>handler},
    'firebase-functions/v2/database':{onValueWritten:(_,handler)=>handler},
    'firebase-functions/v2/scheduler':{onSchedule:(_,handler)=>handler},
    '../admin':{db,admin:{auth:()=>({getUser:async()=>({uid:'p'}),updateUser:async()=>{},createCustomToken:async()=>{tokens++;return 'enrollment-token';}})}},
    '../services/participantAccessService':{tripExpiry:trip=>trip?.status==='active' && trip.end_date>Date.now()?trip.end_date:0},
  });
  return {data,challengeId,code,complete:handlers.completeParticipantEnrollment,tokens:()=>tokens};
}
test('valid invitation plus email proof issues one enrollment token; replay is rejected', async () => {
  const f=enrollmentFixture();const request={data:{challengeId:f.challengeId,code:f.code}};
  assert.equal((await f.complete(request)).customToken,'enrollment-token');
  await assert.rejects(f.complete(request),{code:'permission-denied'});
  assert.equal(f.tokens(),1);
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
    const signIn = signInFixture({staff:true,participant:false,expires_at:0}, new Error('Firestore unavailable'));
    await signIn({data:{uid:'staff',email:'staff@example.test',customClaims:{role}}});
  });
}

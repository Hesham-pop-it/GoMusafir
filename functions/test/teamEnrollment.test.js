const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture({ failWrite = false, failClaims = false, failAudit = false, email = 'member@example.test', existingOrg } = {}) {
  const data = { org_invites: { invite: { email: 'member@example.test', orgId: 'org', role: 'manager', expiresAt: Date.now()+60000 } }, users: { member: { staff_org_id: existingOrg } } };
  const read = key => key.split('/').filter(Boolean).reduce((v,k)=>v?.[k],data);
  const write = (key,value) => { const keys=key.split('/');const last=keys.pop();keys.reduce((v,k)=>v[k] ||= {},data)[last]=value; };
  const claims=[];
  const db={ref:(key='')=>({get:async()=>({exists:()=>read(key)!=null,val:()=>read(key)}),update:async updates=>{
    if(failWrite){failWrite=false;throw Error('write failed');}
    for(const [k,v] of Object.entries(updates))write(k,v);
  }})};
  class HttpsError extends Error { constructor(code,message){super(message);this.code=code;} }
  const deps={
    '../services/participantAccessService':{}, '../services/participantJoinSeat':{},
    'firebase-functions/v2/https':{HttpsError}, '../middleware/participantAccessMiddleware':{onCall:(_,fn)=>fn},
    '../admin':{db,admin:{database:{ServerValue:{TIMESTAMP:1}}},auth:{getUser:async()=>({email,emailVerified:true,customClaims:{preserved:true}}),updateUser:async()=>{},setCustomUserClaims:async(uid,value)=>{
      assert.equal(read(`orgs/org/staff/${uid}`),'manager');
      if(failClaims){failClaims=false;throw Error('claims failed');}
      claims.push(value);
    }}},
    '../services/auditService':{writeAuditLog:async()=>{if(failAudit)throw Error('audit failed');}},
    '../middleware/appCheckMiddleware':{verifyAppCheck:()=>{},requireAuth:()=>{}},
    '../middleware/validateSchema':{validate:(_,v)=>v,schemas:{}}, '../middleware/rateLimiter':{},
    '../services/kmsService':{encrypt:v=>v}, crypto:require('node:crypto'),
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../groups/inviteFunctions'),'utf8'),{module,exports:module.exports,require:key=>{if(deps[key])return deps[key];throw Error(key);},console});
  return {read,claims,join:()=>module.exports.redeemTeamInvitation({auth:{uid:'member'},data:{token:'invite',firstName:'New',lastName:'Member'}})};
}
test('new team member commits membership before claims and can retry',async()=>{
  const f=fixture();await f.join();await f.join();
  assert.equal(f.read('users/member/staff_org_id'),'org');
  assert.equal(f.read('org_invites/invite/redeemedBy'),'member');
  assert.equal(f.claims[0].preserved,true);
});
test('failed database write does not grant claims or consume invite',async()=>{
  const f=fixture({failWrite:true});await assert.rejects(f.join(),/write failed/);
  assert.equal(f.claims.length,0);assert.equal(f.read('org_invites/invite/redeemedBy'),undefined);
  await f.join();assert.equal(f.claims.length,1);
});
test('claims failure after commit can be repaired using the same invitation',async()=>{
  const f=fixture({failClaims:true});await assert.rejects(f.join(),/claims failed/);
  assert.equal(f.read('orgs/org/staff/member'),'manager');
  await f.join();assert.equal(f.claims.length,1);
});
test('wrong email and other-team accounts are rejected before writes',async()=>{
  for(const options of [{email:'other@example.test'},{existingOrg:'different'}]){
    const f=fixture(options);await assert.rejects(f.join());
    assert.equal(f.claims.length,0);assert.equal(f.read('orgs/org/staff/member'),undefined);
  }
});
test('audit outage does not turn completed membership into a failed join',async()=>{
  assert.equal((await fixture({failAudit:true}).join()).success,true);
});

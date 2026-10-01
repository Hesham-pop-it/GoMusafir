const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture(initial, role) {
  let now=100000,denied=0,enrolling=false,latest=initial,failure=null;
  const listeners={},timers=new Map();let sequence=0,foreground;
  const source=fs.readFileSync(path.join(__dirname,'../../src/utils/participantAccess.js'),'utf8')
    .replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const context={
    AppState:{addEventListener:(_,fn)=>{foreground=fn;return{remove:()=>{}};}},
    httpsCallable:()=>async()=>{if(failure)throw failure;return {data:latest};},database:{},functions:{},
    onValue:(key,cb)=>{listeners[key]=cb;return()=>{delete listeners[key];};},ref:(_,key)=>key,
    isEnrolling:()=>enrolling,Date:{now:()=>now},Math,
    setTimeout:(fn)=>{const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    setInterval:()=>1,clearInterval:()=>{},
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/utils/sessionErrors.js'), 'utf8').replace(/export /g, '') + '\n' + source,context);
  const stop=context.watchParticipantAccess({uid:'p',getIdTokenResult:async()=>({claims:{auth_time:50,role}})},()=>{denied++;});
  return {publish:value=>context.publishAppAccess('p',value),stop,timers,listeners,fail:error=>{failure=error;},denied:()=>denied,setNow:value=>{now=value;},enroll:()=>{enrolling=true;},
    tick:()=>{for(const fn of [...timers.values()])fn();},foreground:()=>foreground('active'),
    update:value=>{latest=value;listeners['app_access/p']({exists:()=>true,val:()=>value});}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('open app logs out at expiry without any user record event',async()=>{
  const f=fixture({expires_at:101000,revoked_before:0});await flush();assert.equal(f.denied(),0);
  f.setNow(101001);f.tick();assert.ok(f.denied()>0);f.stop();assert.equal(f.timers.size,0);
});
test('foreground resume rechecks an expired background session',async()=>{
  const f=fixture({expires_at:101000,revoked_before:0});await flush();f.setNow(200000);f.foreground();
  assert.ok(f.denied()>0);f.stop();
});
test('another trip extending access reschedules logout',async()=>{
  const f=fixture({expires_at:101000,revoked_before:0});await flush();
  f.update({expires_at:150000,revoked_before:0});f.setNow(102000);f.tick();assert.equal(f.denied(),0);f.stop();
});
test('a revoked session cannot stay open when a new trip is valid',async()=>{
  const f=fixture({expires_at:150000,revoked_before:0});await flush();
  f.update({expires_at:150000,revoked_before:51});assert.ok(f.denied()>0);f.stop();
});
test('enrollment UI can remain open before admission but cannot override lost access',async()=>{
  const f=fixture({expires_at:0,revoked_before:0});f.enroll();await flush();assert.equal(f.denied(),0);
  f.update({expires_at:150000,revoked_before:0});f.update({expires_at:0,revoked_before:0});
  assert.ok(f.denied()>0);f.stop();
});

for (const role of ['admin', 'co-host', 'manager']) {
  test(`${role} has no trip expiry timer and remains signed in on temporary access-service failure`, async () => {
    const f=fixture({staff:true,expires_at:0,revoked_before:0},role);
    await flush();assert.equal(f.denied(),0);assert.equal(f.timers.size,0);
    f.fail({code:'functions/unavailable'});f.foreground();await flush();
    assert.equal(f.denied(),0);f.stop();
  });
  test(`${role} still signs out when the backend rejects the identity`, async () => {
    const f=fixture({staff:true,expires_at:0,revoked_before:0},role);await flush();
    f.fail({code:'functions/unauthenticated'});f.foreground();await flush();
    assert.ok(f.denied()>0);f.stop();
  });
}
test('participant preserves session during a temporary access-service outage',async()=>{
  const f=fixture({staff:false,expires_at:150000,revoked_before:0},'participant');await flush();
  f.fail({code:'functions/unavailable'});f.foreground();await flush();assert.equal(f.denied(),0);f.stop();
});


test('a stale pre-join access snapshot cannot replace the confirmed join grant',async()=>{
  const f=fixture({expires_at:0,revoked_before:0,version:1});f.enroll();await flush();
  f.publish({expires_at:150000,revoked_before:0,version:3,trips:{t:150000}});
  f.update({expires_at:0,revoked_before:0,version:2});
  assert.equal(f.denied(),0);assert.equal(f.timers.size,1);
  f.update({expires_at:0,revoked_before:51,version:4});
  assert.ok(f.denied()>0);f.stop();
});

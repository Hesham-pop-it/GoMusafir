const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function fixture({retry=false,deny=false,cleanupFails=false}={}){
 const calls=[];let count=0;const user={uid:'p',reload:async()=>calls.push('reload'),getIdToken:async()=>calls.push('token')};
 const source=fs.readFileSync(path.join(__dirname,'../../src/utils/completeTripJoin.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const context={auth:{currentUser:user,authStateReady:async()=>calls.push('ready')},functions:{},
 beginEnrollment:()=>calls.push('begin'),finishEnrollment:()=>calls.push('finish'),publishAppAccess:()=>calls.push('publish'),
 fetchAppAccess:async()=>{throw Error('unexpected fallback');},
 AsyncStorage:{removeItem:async()=>{if(cleanupFails)throw Error('disk');}},
 httpsCallable:()=>async()=>{count++;calls.push('redeem');if(deny)throw {code:'functions/permission-denied'};if(retry && count===1)throw{code:'functions/internal'};
 return {data:{tripId:'t',orgId:'o',access:{trips:{t:999999}}}};}};
 vm.createContext(context);vm.runInContext(source,context);
 return{calls,count:()=>count,join:()=>context.completeTripJoin({inviteCode:'JOIN'})};
}
test('waits for Firebase identity/token, publishes access before ending enrollment',async()=>{
 const f=fixture();assert.equal((await f.join()).tripId,'t');
 assert.ok(f.calls.indexOf('ready')<f.calls.indexOf('redeem'));assert.ok(f.calls.indexOf('token')<f.calls.indexOf('redeem'));
 assert.ok(f.calls.indexOf('publish')<f.calls.indexOf('finish'));
});
test('double tap shares one request and ambiguous commit retries safely',async()=>{
 const f=fixture({retry:true});await Promise.all([f.join(),f.join()]);assert.equal(f.count(),2);
 assert.equal(f.calls.filter(c=>c==='finish').length,1);
});
test('local housekeeping failure cannot turn a confirmed membership into a join error',async()=>{
 const f=fixture({cleanupFails:true});assert.equal((await f.join()).tripId,'t');
});
test('rejected join leaves enrollment available for retry and never signs out',async()=>{
 const f=fixture({deny:true});await assert.rejects(f.join(),{code:'functions/permission-denied'});assert.equal(f.calls.includes('finish'),false);
});

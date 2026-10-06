const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../src/services/visibilityData.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
function fixture(){
 const state={calls:[],queue:[],data:{users:{b:{profile:{firstName:'Visible'}}},locations:{b:{lat:1,lng:2}}},uid:'a',fail:false};
 const auth={get currentUser(){return state.uid?{uid:state.uid}:null;}};
 const api=vm.runInNewContext(source+'\n({getVisibleSnapshot,onVisibleValue,offVisible})',{
  auth,functions:{},URL,console,
  httpsCallable:(_,name)=>async params=>{state.calls.push({name,params});if(state.wait)await state.wait;if(state.fail)throw Error('denied');return {data:state.data};},
  get:async()=>{throw Error('raw read not allowed');},onValue:()=>{throw Error('raw subscription not allowed');},
  setTimeout:fn=>{const item={fn};state.queue.push(item);return item;},clearTimeout:item=>{item.cancelled=true;},
 });
 const ref=path=>({toString:()=>`https://example.test/${path}`});
 const tick=async()=>{const item=state.queue.shift();if(item&&!item.cancelled)await item.fn();};
 return {state,api,ref,tick};
}
test('profile reads use one authorized directory request instead of raw PII',async()=>{
 const f=fixture();const [a,b]=await Promise.all([
  f.api.getVisibleSnapshot(f.ref('users/b/profile'),'t'),f.api.getVisibleSnapshot(f.ref('users/b/full_name'),'t'),
 ]);
 assert.equal(a.val().firstName,'Visible');assert.equal(b.val(),null);assert.equal(f.state.calls.length,1);
});
test('subscriptions replace revoked locations and clear data on permission errors',async()=>{
 const f=fixture(),values=[];
 const stop=f.api.onVisibleValue(f.ref('trips_active/o/t/locations'),'t',snap=>values.push(snap.val()));
 assert.equal(values.length,0);await f.tick();assert.equal(values.at(-1).b.lat,1);
 f.state.data.locations={};await f.tick();assert.equal(Object.keys(values.at(-1)).length,0);
 f.state.fail=true;await f.tick();assert.equal(values.at(-1),null);
 stop();const calls=f.state.calls.length;await f.tick();assert.equal(f.state.calls.length,calls);
});
test('account reads only allow the signed-in UID and use the sanitized account endpoint',async()=>{
 const f=fixture();await assert.rejects(f.api.getVisibleSnapshot(f.ref('users/b'),null),/trip is required/);
 f.state.data={profile:{firstName:'Self'},notifications:{}};
 const snap=await f.api.getVisibleSnapshot(f.ref('users/a'),null);
 assert.equal(snap.val().profile.firstName,'Self');assert.equal(f.state.calls[0].name,'getOwnAccount');
});

test('late responses cannot repopulate an unmounted screen or a different account',async()=>{
 for(const changeAccount of [false,true]){
  const f=fixture(),values=[];
  let resolve;f.state.wait=new Promise(done=>{resolve=done;});
  const stop=f.api.onVisibleValue(f.ref('trips_active/o/t/locations'),'t',snap=>values.push(snap.val()));
  const pending=f.tick();
  if(changeAccount)f.state.uid='different';else stop();
  resolve();await pending;
  assert.equal(values.length,0);
  stop();
 }
});

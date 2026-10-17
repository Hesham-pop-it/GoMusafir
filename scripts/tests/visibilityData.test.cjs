const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../src/services/visibilityData.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
function fixture(){
 const state={calls:[],queue:[],data:{users:{b:{profile:{firstName:'Visible'}}},locations:{b:{lat:1,lng:2}}},uid:'a',fail:false,appState:'active',stateListeners:new Set(),revisions:[]};
 const auth={get currentUser(){return state.uid?{uid:state.uid}:null;}};
 const api=vm.runInNewContext(source+'\n({getVisibleSnapshot,onVisibleValue,offVisible,useVisibilityRevision,visibilitySignature})',{
  auth,functions:{},URL,console,
  useState:()=>['',value=>state.revisions.push(value)],useEffect:callback=>{state.cleanup=callback();},
  AppState:{get currentState(){return state.appState;},addEventListener:(_,listener)=>{
    state.stateListeners.add(listener);return {remove:()=>state.stateListeners.delete(listener)};
  }},
  httpsCallable:(_,name)=>async params=>{state.calls.push({name,params});if(state.wait)await state.wait;if(state.fail)throw Error('denied');return {data:state.data};},
  get:async()=>{throw Error('raw read not allowed');},onValue:()=>{throw Error('raw subscription not allowed');},
  setTimeout:fn=>{const item={fn};state.queue.push(item);return item;},clearTimeout:item=>{if(item)item.cancelled=true;},
 });
 const ref=path=>({toString:()=>`https://example.test/${path}`});
 const tick=async()=>{const item=state.queue.shift();if(item&&!item.cancelled)await item.fn();};
 return {state,api,ref,tick,changeState:next=>{state.appState=next;for(const listener of state.stateListeners)listener(next);}};
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

test('screen polling pauses in background and resumes immediately on foreground',async()=>{
 const f=fixture(),values=[];
 const stop=f.api.onVisibleValue(f.ref('trips_active/o/t/locations'),'t',snap=>values.push(snap.val()));
 await f.tick();assert.equal(f.state.calls.length,1);
 f.changeState('background');await f.tick();assert.equal(f.state.calls.length,1);
 f.state.data.locations={};f.changeState('active');await f.tick();
 assert.equal(f.state.calls.length,2);assert.deepEqual(Object.keys(values.at(-1)),[]);
 stop();assert.equal(f.state.stateListeners.size,0);
});
test('background-interrupted requests do not publish errors and foreground failures still clear data',async()=>{
 const f=fixture(),values=[],errors=[];
 const stop=f.api.onVisibleValue(f.ref('users/a'),null,snap=>values.push(snap.val()),error=>errors.push(error));
 let resolve;f.state.wait=new Promise(done=>{resolve=done;});
 const pending=f.tick();f.changeState('background');f.state.fail=true;resolve();await pending;
 assert.equal(errors.length,0);assert.equal(values.length,0);
 f.changeState('active');await f.tick();
 assert.equal(errors.length,1);assert.equal(values.at(-1),null);
 stop();
});
test('listeners created in the background wait until the app becomes active',async()=>{
 const f=fixture();f.changeState('background');
 const stop=f.api.onVisibleValue(f.ref('users/a'),null,()=>{});
 await f.tick();assert.equal(f.state.calls.length,0);
 f.changeState('active');await f.tick();assert.equal(f.state.calls.length,1);
 stop();
});

test('identical reordered participant and coordinate maps do not refresh subscribers',async()=>{
 const f=fixture(),values=[];
 f.state.data.locations={a:{lat:1,lng:2},b:{lat:3,lng:4}};
 const stop=f.api.onVisibleValue(f.ref('trips_active/o/t/locations'),'t',snap=>values.push(snap.val()));
 await f.tick();
 f.state.data.locations={b:{lng:4,lat:3},a:{lng:2,lat:1}};
 await f.tick();assert.equal(values.length,1);
 f.state.data.locations.b.lat=5;
 await f.tick();assert.equal(values.length,2);
 delete f.state.data.locations.b;
 await f.tick();assert.equal(values.length,3);assert.equal(values.at(-1).b,undefined);
 stop();
});
test('visibility revisions stay stable across server completion order but change on privacy revocation',async()=>{
 const f=fixture();
 f.state.data.users={a:{profile:{firstName:'A',lastName:'One'}},b:{profile:{firstName:'B',lastName:'Two'}}};
 f.api.useVisibilityRevision('t');await f.tick();
 f.state.data.users={b:{profile:{lastName:'Two',firstName:'B'}},a:{profile:{lastName:'One',firstName:'A'}}};
 await f.tick();assert.equal(f.state.revisions[0],f.state.revisions[1]);
 f.state.data.users.b.profile={firstName:'',lastName:''};
 await f.tick();assert.notEqual(f.state.revisions[1],f.state.revisions[2]);
 f.state.cleanup();
});
test('semantic comparison preserves array order, nulls, and real field changes',()=>{
 const f=fixture(),signature=f.api.visibilitySignature;
 assert.equal(signature({b:{d:1,c:2},a:null}),signature({a:null,b:{c:2,d:1}}));
 assert.notEqual(signature([1,2]),signature([2,1]));
 assert.notEqual(signature({a:null}),signature({}));
 assert.notEqual(signature({a:false}),signature({a:true}));
});

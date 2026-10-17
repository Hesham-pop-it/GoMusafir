const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../../src/services/visibilityData.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
function fixture(){
 const state={calls:[],queue:[],signals:new Map(),data:{users:{b:{profile:{firstName:'Visible'}}},locations:{b:{lat:1,lng:2}}},uid:'a',fail:false,appState:'active',stateListeners:new Set(),revisions:[]};
 const auth={get currentUser(){return state.uid?{uid:state.uid}:null;}};
 const api=vm.runInNewContext(source+'\n({getVisibleSnapshot,onVisibleValue,offVisible,useVisibilityRevision,visibilitySignature})',{
  auth,functions:{},URL,console,
  useState:()=>['',value=>state.revisions.push(value)],useEffect:callback=>{state.cleanup=callback();},
  AppState:{get currentState(){return state.appState;},addEventListener:(_,listener)=>{
    state.stateListeners.add(listener);return {remove:()=>state.stateListeners.delete(listener)};
  }},
  httpsCallable:(_,name)=>async params=>{state.calls.push({name,params});if(state.wait)await state.wait;if(state.fail)throw Error('denied');
   if(state.hashes&&params.knownParts){const parts={},data={};for(const [key,value] of Object.entries(state.data)){parts[key]=JSON.stringify(value);if(params.knownParts[key]!==parts[key])data[key]=structuredClone(value);}
    return {data:Object.keys(data).length?{envelope:1,parts,data}:{envelope:1,unchanged:true,parts}};}
   if(!state.hashes||params.knownHash===undefined)return {data:state.data};
   const hash=JSON.stringify(state.data);return {data:params.knownHash===hash?{envelope:1,unchanged:true,hash}:{envelope:1,hash,data:structuredClone(state.data)}};},
  get:async()=>{throw Error('raw read not allowed');},
  database:{},ref:(_,path)=>({path}),
  onValue:(target,callback)=>{
   if(!target.path?.endsWith('/chat_signal'))throw Error('raw subscription not allowed');
   state.signals.set(target.path,callback);return ()=>state.signals.delete(target.path);
  },
  setTimeout:(fn,ms)=>{const item={fn,ms};state.queue.push(item);return item;},clearTimeout:item=>{if(item)item.cancelled=true;},
 });
 const ref=path=>({toString:()=>`https://example.test/${path}`});
 const tick=async()=>{let item;do item=state.queue.shift();while(item?.cancelled);if(item)await item.fn();return item;};
 const run=async ms=>{const index=state.queue.findIndex(item=>!item.cancelled&&item.ms===ms);assert.ok(index>=0,`no ${ms} ms timer`);const [item]=state.queue.splice(index,1);await item.fn();};
 return {state,api,ref,tick,run,changeState:next=>{state.appState=next;for(const listener of state.stateListeners)listener(next);}};
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
 await f.tick();assert.equal(f.state.revisions.length,1);
 f.state.data.users.b.profile={firstName:'',lastName:''};
 await f.tick();assert.equal(f.state.revisions.length,2);assert.notEqual(f.state.revisions[0],f.state.revisions[1]);
 f.state.fail=true;await f.tick();assert.equal(f.state.revisions.at(-1),'unavailable');
 f.state.cleanup();
});
test('semantic comparison preserves array order, nulls, and real field changes',()=>{
 const f=fixture(),signature=f.api.visibilitySignature;
 assert.equal(signature({b:{d:1,c:2},a:null}),signature({a:null,b:{c:2,d:1}}));
 assert.notEqual(signature([1,2]),signature([2,1]));
 assert.notEqual(signature({a:null}),signature({}));
 assert.notEqual(signature({a:false}),signature({a:true}));
});

test('revision hooks share the screen directory poll instead of polling on their own',async()=>{
 const f=fixture(),values=[];
 const stop=f.api.onVisibleValue(f.ref('trips_active/o/t/locations'),'t',snap=>values.push(snap.val()));
 f.api.useVisibilityRevision('t');const first=f.state.cleanup;
 f.api.useVisibilityRevision('t');const second=f.state.cleanup;
 while(f.state.queue.some(item=>!item.cancelled&&item.ms===0))await f.tick();
 assert.equal(f.state.calls.length,1);
 assert.equal(f.state.queue.filter(item=>!item.cancelled).length,1);
 await f.tick();assert.equal(f.state.calls.length,2);
 assert.equal(f.state.queue.filter(item=>!item.cancelled).length,1);
 first();second();stop();
 assert.equal(f.state.queue.filter(item=>!item.cancelled).length,0);
});
test('directory polls send held part hashes and merge only the parts that changed',async()=>{
 const f=fixture(),values=[],users=[];f.state.hashes=true;
 const stop=f.api.onVisibleValue(f.ref('trips_active/o/t/locations'),'t',snap=>values.push(snap.val()));
 const people=f.api.onVisibleValue(f.ref('users/b/profile'),'t',snap=>users.push(snap.val()));
 await f.tick();assert.equal(JSON.stringify(f.state.calls[0].params.knownParts),'{}');
 assert.equal(values.at(-1).b.lat,1);assert.equal(users.at(-1).firstName,'Visible');
 f.state.data.locations.b.lat=7;await f.tick();
 assert.equal(f.state.calls[1].params.knownParts.users,JSON.stringify(f.state.data.users));
 assert.equal(values.at(-1).b.lat,7);assert.equal(users.length,1);
 await f.tick();assert.equal(values.length,2);
 stop();people();
});
test('polls send the held hash and unchanged answers keep the held data',async()=>{
 const f=fixture(),values=[];f.state.hashes=true;
 const stop=f.api.onVisibleValue(f.ref('users/a'),null,snap=>values.push(snap.val()));
 await f.tick();assert.equal(f.state.calls[0].params.knownHash,'');assert.equal(values.at(-1).locations.b.lat,1);
 await f.tick();assert.equal(f.state.calls[1].params.knownHash,JSON.stringify(f.state.data));assert.equal(values.length,1);
 f.state.data.locations.b.lat=9;await f.tick();assert.equal(values.at(-1).locations.b.lat,9);
 f.state.fail=true;await f.tick();assert.equal(values.at(-1),null);
 f.state.fail=false;await f.tick();assert.equal(f.state.calls.at(-1).params.knownHash,'');assert.equal(values.at(-1).locations.b.lat,9);
 const one=await f.api.getVisibleSnapshot(f.ref('users/b/profile'),'t');
 assert.equal(one.val().firstName,'Visible');assert.equal(f.state.calls.at(-1).params.knownHash,undefined);
 stop();
});
test('chat refetches when the chat signal or the directory changes, with a slow fallback',async()=>{
 const f=fixture(),messages=[];
 f.state.data.m1={text:'one'};
 const stop=f.api.onVisibleValue(f.ref('trips_active/o/t/chat'),'t',snap=>messages.push(snap.val()));
 const signal=f.state.signals.get('trips_active/o/t/chat_signal');assert.ok(signal);
 signal({val:()=>'m1'});
 await f.tick();assert.equal(messages.length,1);
 const fallback=f.state.queue.find(item=>!item.cancelled);assert.equal(fallback.ms,30000);
 const calls=f.state.calls.length;
 signal({val:()=>'m1'});assert.equal(f.state.queue.filter(item=>!item.cancelled&&item.ms===0).length,0);
 f.state.data.m2={text:'two'};signal({val:()=>'m2'});
 await f.tick();assert.equal(f.state.calls.length,calls+1);assert.ok(messages.at(-1).m2);
 const people=f.api.onVisibleValue(f.ref('trips_active/o/t/locations'),'t',()=>{});
 await f.run(0);
 const chats=()=>f.state.calls.filter(call=>call.params.section==='chat').length,before=chats();
 await f.run(4000);assert.equal(chats(),before);
 f.state.data.users.b.profile.firstName='';
 await f.run(4000);await f.run(0);assert.equal(chats(),before+1);
 people();stop();
 assert.equal(f.state.signals.size,0);
});
test('a screen joining a running chat poll gets data at once',async()=>{
 const f=fixture(),first=[],second=[];
 f.state.data.m1={text:'one'};
 const a=f.api.onVisibleValue(f.ref('trips_active/o/t/chat'),'t',snap=>first.push(snap.val()));
 await f.tick();
 const b=f.api.onVisibleValue(f.ref('trips_active/o/t/chat'),'t',snap=>second.push(snap.val()));
 const next=f.state.queue.find(item=>!item.cancelled);assert.equal(next.ms,0);
 await f.tick();assert.equal(second.length,1);assert.equal(first.length,1);
 a();b();
});

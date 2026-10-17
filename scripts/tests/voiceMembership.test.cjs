const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/utils/voiceMembership.js','utf8').replace('export function','function'), context);
const base = {uid:'me',currentUid:'me',connected:false,roomState:'disconnected',activeTripId:'trip',tripId:'trip',liveParticipantIds:new Set(['me','other']),presence:{me:true,other:true},channelActive:true};
test('cold restart never restores own Joined status from stale Firebase presence',()=>{
 assert.equal(context.isVoiceMember(base),false);
});
test('explicit successful join shows own membership; leaving clears it immediately',()=>{
 const joined={...base,connected:true,roomState:'connected'};
 assert.equal(context.isVoiceMember(joined),true);
 assert.equal(context.isVoiceMember({...joined,connected:false}),false);
 assert.equal(context.isVoiceMember({...joined,roomState:'disconnected'}),false);
});
test('another trip connection does not mark the local user joined here',()=>{
 assert.equal(context.isVoiceMember({...base,connected:true,roomState:'connected',activeTripId:'different'}),false);
});
test('connected viewers use live roster instead of stale remote presence',()=>{
 const joined={...base,uid:'other',connected:true,roomState:'connected'};
 assert.equal(context.isVoiceMember(joined),true);
 assert.equal(context.isVoiceMember({...joined,liveParticipantIds:new Set(['me'])}),false);
});
test('outside Voice remote presence is only shown for an active channel',()=>{
 assert.equal(context.isVoiceMember({...base,uid:'other'}),true);
 assert.equal(context.isVoiceMember({...base,uid:'other',channelActive:false}),false);
 assert.equal(context.isVoiceMember({...base,uid:'other',channelActive:null}),false);
});

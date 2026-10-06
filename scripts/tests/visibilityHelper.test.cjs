const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../../functions/services/visibilityPolicy');
const source = fs.readFileSync(require.resolve('../../src/utils/visibilityHelper.js'),'utf8').replaceAll('export ', '');
const helper = vm.runInNewContext(source + '\n({checkPIIVisibility,isStaffMember,getParticipantDisplayName})');
test('client and backend agree for all fields, visibility choices and viewer roles',()=>{
 for(const field of ['name','lastname','email','phone','location'])
 for(const global of ['Show to Organizers','Show to Everyone','Do Not Show','Custom Choice',undefined])
 for(const personal of ['Show to Organizers','Show to Everyone','Do Not Show',undefined])
 for(const staff of [true,false])
 for(const self of [true,false]){
  const globalConfig={[field]:global}, personalVisibility={[field]:personal};
  const actual=helper.checkPIIVisibility({field,globalConfig,personalVisibility,isViewerStaff:staff,targetUid:'b',viewerUid:self?'b':'a'});
  assert.equal(actual,policy.visible(field,globalConfig,personalVisibility,self,staff),`${field}/${global}/${personal}/${staff}/${self}`);
 }
});
test('route roles, organizer IDs, and unrecognized staff entries never grant privileged visibility',()=>{
 assert.equal(helper.isStaffMember('a',{},'a','admin'),false);
 for(const record of [true,{},'participant','member','staff']) assert.equal(helper.isStaffMember('a',{a:record}),false);
 for(const record of ['admin','Manager','Co-Host'])assert.equal(helper.isStaffMember('a',{a:record}),true);
});
test('hidden names never reappear through a full-name fallback or staff exception',()=>{
 assert.equal(helper.getParticipantDisplayName({profile:{firstName:'Secret',lastName:'Name'},fullName:'Secret Name',targetUid:'b',viewerUid:'a',isTargetStaff:true,globalConfig:{name:'Show to Organizers',lastname:'Show to Organizers'}}),'Staff Member');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const presentation = require('../src/services/notificationPresentation');
const { normalizeNotification, claimNotification, resetNotificationPresentation } = presentation;

test('normalizes notification and data-only payloads without losing routing metadata', () => {
    const item = normalizeNotification({ messageId:'fcm', data:{ notificationId:'event',tripId:'trip',orgId:'org',type:'chat_message',isUserGlobal:'true'}, notification:{title:'Alice',body:'Hello'} });
    assert.equal(item.id,'event'); assert.equal(item.message,'Hello'); assert.equal(item.tripId,'trip'); assert.equal(item.isUserGlobal,true);
    assert.equal(normalizeNotification({data:{body:'Update',type:'voice_started'}}).message,'Update');
});
test('push/database delivery is deduplicated in either order by event ID', () => {
    for (const first of ['push','database']) {
        resetNotificationPresentation();
        assert.equal(claimNotification({id:'event'},first),true);
        assert.equal(claimNotification({id:'event'},first==='push'?'database':'push'),false);
    }
});
test('legacy cross-source duplicates are suppressed, distinct identical messages survive', () => {
    resetNotificationPresentation();
    const item={type:'chat_message',tripId:'trip',title:'Alice',message:'Hi'};
    assert.equal(claimNotification({...item,id:'one'},'database'),true);
    assert.equal(claimNotification({...item,id:'fcm-one',_pushOnly:true},'push'),false);
    assert.equal(claimNotification({...item,id:'two'},'database'),true);
});
for (const platform of ['ios', 'android']) {
test(`${platform}: foreground uses only the in-app channel; background OS payload is never redisplayed`, async () => {
    let banners=0, systems=0;
    const channels=[];
    const state={currentState:'active'};
    const source=fs.readFileSync(require.resolve('../src/services/notificationService'),'utf8')
        .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
    const ctx={AppState:state,Platform:{OS:platform},Constants:{executionEnvironment:'native'},ExecutionEnvironment:{StoreClient:'expo'},
        normalizeNotification, ...require('../functions/services/notificationSoundConfig'), publishForegroundNotification:()=>banners++,
        notifee:{displayNotification:async()=>systems++,createChannel:async channel=>channels.push(channel)},AndroidImportance:{HIGH:4},Set,Map,console};
    vm.createContext(ctx);vm.runInContext(source,ctx);
    const remote={messageId:'one',data:{type:'chat_message'},notification:{title:'Hello',body:'World'}};
    await ctx.presentRemoteNotification(remote);
    assert.equal(banners,1);assert.equal(systems,0);
    assert.equal(channels.length,0);
    state.currentState='background';
    await ctx.presentRemoteNotification(remote,true);
    assert.equal(systems,0);
    await ctx.presentRemoteNotification({...remote,notification:undefined},true);
    assert.equal(systems,1);assert.equal(banners,1);
    state.currentState='active';
    await ctx.presentRemoteNotification(remote,true); // delayed background delivery after resume
    assert.equal(banners,1);assert.equal(systems,1);
    state.currentState='inactive';
    await ctx.presentRemoteNotification(remote);
    assert.equal(systems,2);
    assert.equal(channels.length,platform==='android'?2:0);
});
}

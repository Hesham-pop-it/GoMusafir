const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../functions/services/notificationSoundConfig');
const { STANDARD, SOS, notificationSound } = policy;

test('all normal categories share a sound; SOS wins over conflicting standard channels', () => {
    for (const type of ['chat', 'chat_message', 'alert', 'location_request', 'voice_started', 'voice_inactivity', 'seat_update', 'notification', 'future_type']) {
        assert.equal(notificationSound({type}, {androidChannelId:'Admin'}), STANDARD);
    }
    for (const type of ['sos', 'emergency']) {
        assert.equal(notificationSound({type, androidChannelId:STANDARD.channelId}), SOS);
        assert.equal(notificationSound({type}, {androidChannelId:'Chat'}), SOS);
    }
    assert.equal(notificationSound({}, {androidChannelId:'Safety'}), SOS);
});

test('FCM/APNs select bundled sounds for locked/background delivery and keep silent pushes silent', async () => {
    const messages = [];
    const ctx = { module:{exports:{}}, console, require(name) {
        if (name === './notificationSoundConfig') return policy;
        assert.equal(name, '../admin');
        return {admin:{messaging:()=>({send:async message=>messages.push(message)})}, db:{ref:path=>({get:async()=>({exists:()=>true,val:()=>path.endsWith('fcmToken')?'token':{}})})}};
    }};
    vm.runInNewContext(fs.readFileSync(require.resolve('../functions/services/notificationService'),'utf8'),ctx);
    const send=ctx.module.exports.sendPushNotification;
    for (const type of ['chat_message','voice_started','emergency','sos']) {
        await send('user','Title','Body',{type},{skipDbSave:true,androidChannelId:'default'});
        const message=messages.at(-1), expected=notificationSound({type});
        assert.equal(message.android.notification.channelId,expected.channelId);
        assert.equal(message.android.notification.sound,expected.sound);
        assert.equal(message.apns.payload.aps.sound,expected.file);
        assert.equal(message.data.androidChannelId,expected.channelId);
    }
    await send('user','','',{type:'sos'},{silent:true});
    assert.equal(messages.at(-1).notification,undefined);
    assert.equal(messages.at(-1).android.notification,undefined);
    assert.equal(messages.at(-1).apns.payload.aps.sound,undefined);
    assert.equal(messages.at(-1).apns.payload.aps.contentAvailable,true);
});

test('data-only notifications use the same sounds on both platforms without redisplaying OS pushes', async () => {
    const source=fs.readFileSync(require.resolve('../src/services/notificationService'),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
    for (const os of ['android','ios']) {
        const displayed=[],channels=[];
        const ctx={...policy,AppState:{currentState:'background'},Platform:{OS:os},Constants:{},ExecutionEnvironment:{StoreClient:'expo'},
            ...require('../src/services/notificationPresentation'), AndroidImportance:{HIGH:4}, console,
            notifee:{createChannel:async c=>channels.push(c), displayNotification:async n=>displayed.push(n)}};
        vm.createContext(ctx);vm.runInContext(source,ctx);
        for(const type of ['chat_message','sos','emergency']) {
            await ctx.presentRemoteNotification({data:{type,androidChannelId:STANDARD.channelId}},true);
            const expected=notificationSound({type});
            assert.equal(displayed.at(-1).android.channelId,expected.channelId);
            assert.equal(displayed.at(-1).android.sound,expected.sound);
            assert.equal(displayed.at(-1).ios.sound,expected.file);
            if(os==='android') assert.equal(channels.at(-1).sound,expected.sound);
        }
        await ctx.presentRemoteNotification({notification:{title:'Already shown'},data:{type:'sos'}},true);
        assert.equal(displayed.length,3);
    }
});

test('a foreground SOS interrupts standard audio and cannot be interrupted by standard audio', () => {
    const players=[];
    const ctx={...policy,console,setTimeout:()=>1,clearTimeout:()=>{},require:()=>1,
        createAudioPlayer:()=>{const p={removed:false,play(){},remove(){this.removed=true},addListener(event,fn){this.finish=()=>fn({didJustFinish:true});return{remove(){}}}};players.push(p);return p;}};
    const source=fs.readFileSync(require.resolve('../src/services/notificationAudio'),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
    vm.createContext(ctx);vm.runInContext(source,ctx);
    ctx.playNotificationSound({type:'chat_message'});
    ctx.playNotificationSound({type:'sos'});
    assert.equal(players[0].removed,true);
    ctx.playNotificationSound({type:'chat_message'});
    assert.equal(players.length,2);assert.equal(players[1].removed,false);
    players[1].finish();
    ctx.playNotificationSound({type:'chat_message'});
    assert.equal(players.length,3);
    ctx.stopNotificationSound();assert.equal(players[2].removed,true);
});

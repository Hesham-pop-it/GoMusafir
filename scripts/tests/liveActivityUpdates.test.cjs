const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/utils/liveActivityUpdates.js'), 'utf8').replaceAll('export ', '');
const {updateLiveActivity} = vm.runInNewContext(source + '\n({updateLiveActivity})');
test('removed activity releases its reference and payload cache', async () => {
    const activity = {update: async () => {throw new Error("Can't find live activity with id: old");}};
    const active = {current:activity}, cache = {current:null};
    await updateLiveActivity(activity, {isMuted:true}, active, cache);
    assert.equal(active.current, null); assert.equal(cache.current, null);
});
test('late rejection cannot clear a replacement activity or payload', async () => {
    let reject;
    const activity = {update: () => new Promise((_, fail) => {reject=fail;})};
    const active = {current:activity}, cache = {current:null};
    const pending = updateLiveActivity(activity, {}, active, cache);
    const replacement = {}; const latest = {activity:replacement, payload:'new'};
    active.current = replacement; cache.current = latest;
    reject(new Error("Can't find live activity with id: old")); await pending;
    assert.equal(active.current, replacement); assert.equal(cache.current, latest);
});
test('unchanged payload is skipped and unrelated failures remain visible', async () => {
    let count=0;
    const activity = {update: async () => {count++;}};
    const active = {current:activity}, cache = {current:null};
    await updateLiveActivity(activity, {isMuted:true}, active, cache);
    await updateLiveActivity(activity, {isMuted:true}, active, cache);
    assert.equal(count,1);
    activity.update = async () => {throw new Error('permission failure');};
    await assert.rejects(updateLiveActivity(activity, {isMuted:false}, active, cache), /permission failure/);
    assert.equal(active.current, activity);
});

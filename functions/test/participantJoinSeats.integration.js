// Run against the demo Realtime Database emulator only.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT;
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!project?.startsWith('demo-') || !host) throw new Error('Demo database emulator required');
const admin = require('firebase-admin');
admin.initializeApp({projectId:project,databaseURL:`http://${host}?ns=${project}-default-rtdb`});
const {db}=require('../admin');
const {commitParticipantJoin}=require('../services/participantJoinSeat');
const tripPath='orgs/join-test/trips/t';
const updates=uid=>({
  [`trips_participants/t/${uid}`]:true,
  [`users/${uid}/account_type`]:'participant',
  [`users/${uid}/joined_trips/t`]:{org_id:'join-test',status:'joined',joined_at:admin.database.ServerValue.TIMESTAMP},
});
const join=uid=>commitParticipantJoin('join-test','t',uid,updates(uid));
async function main(){
  await db.ref().set({orgs:{'join-test':{staff:{host:'admin'},trips:{t:{
    status:'active',end_date:Date.now()+3600000,total_seats:2,participants:20,
    participant_join_seats:{abandoned:true},
  }}}},trips_participants:{t:{host:true}}});
  const results=await Promise.allSettled([join('a'),join('b')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'resource-exhausted');
  const winner=results[0].status==='fulfilled'?'a':'b';
  const loser=winner==='a'?'b':'a';
  let data=(await db.ref().get()).val();
  assert.equal(Object.keys(data.trips_participants.t).length,2);
  assert.equal(data.orgs['join-test'].trips.t.participants,2);
  assert.equal(data.orgs['join-test'].trips.t.participant_join_seats,undefined);
  assert.equal(data.users[loser],undefined);
  const joinedAt=data.users[winner].joined_trips.t.joined_at;
  await Promise.all([join(winner),join(winner)]);
  assert.equal((await db.ref(`users/${winner}/joined_trips/t/joined_at`).get()).val(),joinedAt);
  // Removal currently leaves the historical counter untouched. It must still free capacity.
  await db.ref(`trips_participants/t/${winner}`).remove();
  await join(loser);
  assert.equal((await db.ref(`${tripPath}/participants`).get()).val(),2);
  console.log('Participant join emulator checks passed: concurrent last seat, atomic membership, retries, stale counter and removed member.');
}
main().then(()=>admin.app().delete()).catch(async error=>{console.error(error);await admin.app().delete();process.exitCode=1;});

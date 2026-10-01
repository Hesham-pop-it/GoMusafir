// Run only against local demo emulators; exercises actual Admin transactions and client rules.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!project?.startsWith('demo-') || !databaseHost || !authHost) throw new Error('Demo emulators required');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: project, databaseURL: `http://${databaseHost}?ns=${project}-default-rtdb` });
const { db } = require('../admin');
const { createTripRecord } = require('../groups/tripCreationHelper');
const { changeTripSeats } = require('../services/tripSeatService');
const DAY = 86400000, start = Date.UTC(2027, 0, 1);
const input = { orgId: 'seat-test', uid: 'host', title: 'Journey', destination: 'Makkah, Saudi Arabia', startDate: start,
  endDate: start + 45 * DAY, totalSeats: 10 };
const org = () => db.ref('orgs/seat-test');
async function seed(balance) { await org().set({ prepaid_seats: balance, staff: { host: 'admin' } }); }
function endpointModule(name) {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const { createRequire } = require('node:module');
  const file = path.join(__dirname, '../groups', name);
  const localRequire = createRequire(file);
  const module = { exports: {} };
  const noop = async () => {};
  const overrides = {
    '../middleware/participantAccessMiddleware': { onCall: (_, handler) => handler },
    '../services/auditService': { writeAuditLog: noop },
    '../services/notificationService': { sendPushNotification: noop },
    '../services/emailService': { sendEmail: noop },
    '../services/participantAccessService': {}, './participantAccessFunctions': {},
    stripe: () => ({ checkout: { sessions: { create: async () => ({ id: 'cs_test_seats', url: 'https://checkout.stripe.com/test' }) } } }),
  };
  vm.runInNewContext(fs.readFileSync(file,'utf8'), { module, exports: module.exports,
    require: id => overrides[id] || localRequire(id), process: { env: {} }, console, Date, Number, Object, Math, Buffer,
  });
  return module.exports;
}
async function main() {
  await seed(20);
  const created = await createTripRecord({ ...input, operationId: 'create:one' });
  let data = (await org().get()).val();
  assert.equal(data.prepaid_seats, 0);
  assert.equal(data.trips[created.tripId].time_zone, 'Asia/Riyadh');
  assert.equal(data.trips[created.tripId].total_seats, 10);
  assert.equal(data.trips[created.tripId].seats_allocated, 20);
  assert.equal((await createTripRecord({ ...input, operationId: 'create:one' })).tripId, created.tripId);
  assert.equal((await org().get()).val().prepaid_seats, 0);
  await assert.rejects(changeTripSeats({ orgId: input.orgId, tripId: created.tripId, endDate: start+61*DAY }), /Not enough seats/);
  assert.equal((await org().child(`trips/${created.tripId}/end_date`).get()).val(), input.endDate);
  await org().child('prepaid_seats').set(10);
  await changeTripSeats({ orgId: input.orgId, tripId: created.tripId, endDate: start+61*DAY });
  assert.equal((await org().get()).val().prepaid_seats, 0);
  await changeTripSeats({ orgId: input.orgId, tripId: created.tripId, endDate: start+30*DAY });
  await changeTripSeats({ orgId: input.orgId, tripId: created.tripId, endDate: start+61*DAY });
  assert.equal((await org().get()).val().prepaid_seats, 0); // no duplicate charge after shortening
  await assert.rejects(changeTripSeats({ orgId: input.orgId, tripId: created.tripId, increment: 1 }), /Not enough seats/);
  await changeTripSeats({ orgId: input.orgId, tripId: created.tripId, increment: 1, paidCredit: 3, operationId: 'payment:one' });
  await changeTripSeats({ orgId: input.orgId, tripId: created.tripId, increment: 1, paidCredit: 3, operationId: 'payment:one' });
  data = (await org().get()).val();
  assert.equal(data.trips[created.tripId].total_seats, 11);
  assert.equal(data.trips[created.tripId].seats_allocated, 33);
  assert.equal(data.prepaid_seats, 0);
  await seed(19);
  await assert.rejects(createTripRecord(input), /Not enough seats/);
  assert.equal((await org().get()).val().prepaid_seats,19);
  assert.equal((await org().get()).val().trips,undefined);
  await seed(20);
  const parallel = await Promise.allSettled([createTripRecord({ ...input, operationId: 'parallel:a' }),createTripRecord({ ...input, operationId: 'parallel:b' })]);
  assert.equal(parallel.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await org().get()).val().prepaid_seats,0);
  const tripId = parallel.find(r=>r.status==='fulfilled').value.tripId;
  // Concurrent extensions should only charge the difference once.
  await org().child('prepaid_seats').set(10);
  await Promise.all([1,2].map(()=>changeTripSeats({ orgId: input.orgId, tripId, endDate: start+61*DAY })));
  assert.equal((await org().get()).val().prepaid_seats,0);
  // Legacy records receive credit only for their original one-seat capacity.
  await org().child('trips/legacy').set({ location:'Makkah', start_date:start, end_date:start+30*DAY,total_seats:10,status:'active' });
  await org().child('prepaid_seats').set(10);
  await changeTripSeats({ orgId: input.orgId, tripId:'legacy',endDate:start+45*DAY });
  assert.equal((await org().get()).val().prepaid_seats,0);

  // Exercise both public callable handlers with forged client totals/credits.
  const paymentEndpoints = endpointModule('paymentFunctions.js');
  const tripEndpoints = endpointModule('tripFunctions.js');
  await seed(19);
  const token = 'seat-test-token';
  await db.ref(`temp_links/${token}`).set({ orgId: input.orgId, uid: input.uid,
    action: 'CREATE_TRIP', expiresAt: Date.now()+DAY, used: false });
  const request = { app: {}, data: { action: 'CREATE_TRIP', seats: 10, linkToken: token,
    tripData: { ...input, paidCredit: 1000, seats_required: 1, seat_periods: 1 } } };
  assert.equal((await paymentEndpoints.requestSeats(request)).url, 'https://checkout.stripe.com/test');
  assert.equal((await org().get()).val().trips, undefined);
  await seed(19);
  const authenticated = { app: {}, auth: { uid: input.uid, token: { orgId: input.orgId, role: 'admin' } }, data: { ...input, paid: true, requiredSeats: 1 } };
  await assert.rejects(tripEndpoints.createTrip(authenticated), /Not enough seats/);
  await org().child('prepaid_seats').set(20);
  const fromEndpoint = await paymentEndpoints.requestSeats(request);
  assert.equal(fromEndpoint.requiredSeats,20);
  assert.equal((await org().get()).val().prepaid_seats,0);
  await assert.rejects(tripEndpoints.updateTripDates({ ...authenticated,
    data: { tripId: fromEndpoint.tripId, startDate:start, endDate:start+61*DAY, requiredSeats:0 },
  }), /Not enough seats/);
  await assert.rejects(tripEndpoints.updateTripDates({ ...authenticated, auth:{uid:'outsider',token:{orgId:input.orgId,role:'admin'}},
    data:{tripId:fromEndpoint.tripId,startDate:start,endDate:start+61*DAY},
  }), /Organization staff access/);
  // Restore the earlier trip for rule checks below.
  await org().child(`trips/${tripId}`).set({start_date:start,end_date:start+61*DAY,total_seats:10,seats_required:30,
    seats_allocated:30,seat_periods:3,duration_days:61,status:'active'});

  const user = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`seat-${Date.now()}@example.test`,password:'test-password',returnSecureToken:true})
  }).then(r=>r.json());
  assert.ok(user.localId && user.idToken);
  await org().child(`staff/${user.localId}`).set('admin');
  await db.ref(`app_access/${user.localId}`).set({ expires_at:Date.now()+DAY });
  const check = async (suffix,method,value,expected) => {
    const response = await fetch(`http://${databaseHost}/orgs/seat-test/${suffix}.json?ns=${project}-default-rtdb&auth=${user.idToken}`,{
      method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value),
    });
    assert.equal(response.status,expected,`${suffix}: ${await response.text()}`);
  };
  await check(`trips/${tripId}/title`,'PUT','Updated title',200);
  for (const [field,value] of Object.entries({start_date:start-DAY,end_date:start+90*DAY,total_seats:100,seats_allocated:999,seats_required:1,seat_periods:1,duration_days:1})) {
    await check(`trips/${tripId}/${field}`,'PUT',value,401);
    await check(`trips/${tripId}/${field}`,'DELETE',undefined,401);
  }
  await check('trips/forged','PUT',{start_date:start,end_date:start+45*DAY,total_seats:10},401);
  await check('prepaid_seats','PUT',9999,401);
  await check('seat_operations/forged','PUT',{tripId},401);
  console.log('PASS: real creation/edit/top-up transactions, insufficient funds, retries, concurrent spending, legacy allocation, and 18 database bypass checks.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>admin.app().delete());

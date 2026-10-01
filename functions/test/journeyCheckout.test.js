const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const realRequire = createRequire(__filename);
function fixture(balance = 0) {
  const data = { orgs: { org: { prepaid_seats: balance, staff: { host: 'admin' } } },
    temp_links: { link: { orgId:'org',uid:'host',action:'CREATE_TRIP',expiresAt:Date.now()+86400000 } }, users:{host:{country:{code:'PK'}}} };
  let sequence = 0, stripeCalls = 0;
  const sessions = new Map(); const calls = [];
  function read(key) { return key.split('/').filter(Boolean).reduce((v,k)=>v?.[k],data) ?? null; }
  function write(key,value) { const parts=key.split('/').filter(Boolean);let p=data;for(const k of parts.slice(0,-1))p=p[k]??={};p[parts.at(-1)]=value; }
  const db = { ref: (key='') => ({ key:key.split('/').at(-1),
    get:async()=>({val:()=>structuredClone(read(key)),exists:()=>read(key)!==null}),
    once:async()=>({val:()=>structuredClone(read(key)),exists:()=>read(key)!==null}),
    child:suffix=>db.ref(`${key}/${suffix}`), set:async value=>write(key,value),
    update:async value=>{for(const [k,v] of Object.entries(value))write(`${key}/${k}`,v);},
    push:value=>{const ref=db.ref(`${key}/id-${++sequence}`);return value===undefined?ref:ref.set(value);},
    transaction:async mutate=>{const next=mutate(structuredClone(read(key)));if(next===undefined)return {committed:false};write(key,next);return {committed:true,snapshot:{val:()=>structuredClone(next)}};},
  }) };
  const stripe = { checkout:{sessions:{
    create:async(params,options)=>{
      stripeCalls++;calls.push(params);
      if (stripe.failure) throw stripe.failure;
      const key=options.idempotencyKey;
      if (!sessions.has(key)) sessions.set(key,{id:`cs_${sessions.size}`,url:'https://checkout.stripe.com/test',status:'open',payment_status:'unpaid',metadata:params.metadata,currency:params.line_items[0].price_data.currency,amount_total:params.line_items[0].quantity*params.line_items[0].price_data.unit_amount});
      return structuredClone(sessions.get(key));
    }, retrieve:async id=>structuredClone([...sessions.values()].find(s=>s.id===id)),
  }}};
  const overrides={ '../admin':{db,admin:{database:{ServerValue:{TIMESTAMP:123}}}},
    '../middleware/participantAccessMiddleware':{onCall:(_,handler)=>handler},
    '../middleware/appCheckMiddleware':{verifyAppCheck:()=>{},requireAuth:()=>{},requireRole:()=>{}},
    '../services/auditService':{writeAuditLog:async()=>{}}, '../services/notificationService':{sendPushNotification:async()=>{}},
    stripe:()=>stripe,
  };
  const cache=new Map();
  function load(file) {
    if(cache.has(file))return cache.get(file).exports;
    const mod={exports:{}};cache.set(file,mod);
    const localRequire=id=>{
      if(overrides[id])return overrides[id];
      if(id.startsWith('.')){const filename=path.resolve(path.dirname(file),id+'.js');if(fs.existsSync(filename))return load(filename);}
      return realRequire(id);
    };
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,exports:mod.exports,require:localRequire,process:{env:{}},console,Date,Buffer,setTimeout:()=>{}},{filename:file});
    return mod.exports;
  }
  const service=load(path.join(__dirname,'../services/journeyCheckoutService.js'));
  const endpoints=load(path.join(__dirname,'../groups/paymentFunctions.js'));
  return {data,stripe,calls,sessions,service,endpoints,get stripeCalls(){return stripeCalls;}};
}
const tripData={title:'Pakistan trip',destination:'Pakistan',startDate:Date.UTC(2027,0,1),endDate:Date.UTC(2027,0,10),image:'https://images.example/'+ 'a'.repeat(700)};
const request={data:{action:'CREATE_TRIP',seats:3,linkToken:'link',planId:'seat_only',tripData,origin:'https://app.gomusafir.app'}};

test('zero balance opens checkout for 3 credits, without creating a trip',async()=>{
 const f=fixture();const result=await f.endpoints.requestSeats(request);
 assert.match(result.url,/checkout.stripe.com/);assert.equal(f.calls[0].line_items[0].quantity,3);
 assert.match(f.calls[0].success_url,/\/create-journey\?status=success/);
 assert.equal(f.data.orgs.org.trips,undefined);assert.equal(f.data.temp_links.link.used,undefined);
 assert.equal(f.calls[0].metadata.tripDetailsJson,undefined); // long banner URL stays in server draft
});
test('partial balance is held once; repeated Pay Now reuses checkout',async()=>{
 const f=fixture(2);const first=await f.endpoints.requestSeats(request);const second=await f.endpoints.requestSeats(request);
 assert.equal(first.url,second.url);assert.equal(f.stripeCalls,1);assert.equal(f.calls[0].line_items[0].quantity,1);
 assert.equal(f.data.orgs.org.prepaid_seats,0);assert.equal(Object.values(f.data.orgs.org.journey_checkouts)[0].reservedSeats,2);
});
test('paid checkout creates one trip with exact banner and allocation on repeated verification',async()=>{
 const f=fixture(2);await f.endpoints.requestSeats(request);
 const session=[...f.sessions.values()][0];session.payment_status='paid';session.status='complete';
 assert.equal((await f.endpoints.verifyPayment({data:{sessionId:session.id}})).verified,true);
 await f.endpoints.verifyPayment({data:{sessionId:session.id}});
 const trips=Object.values(f.data.orgs.org.trips);assert.equal(trips.length,1);
 assert.equal(trips[0].seats_allocated,3);assert.equal(trips[0].total_seats,3);assert.equal(trips[0].image,tripData.image);
 assert.equal(f.data.orgs.org.prepaid_seats,0);assert.equal(f.data.temp_links.link.used,true);
});
test('prepaid balance still creates instantly and forged credit fields cannot bypass checkout',async()=>{
 const paid=fixture(3);assert.equal((await paid.endpoints.requestSeats(request)).instant,true);assert.equal(paid.stripeCalls,0);
 const empty=fixture();const result=await empty.endpoints.requestSeats({data:{...request.data,tripData:{...tripData,paidCredit:999,checkoutKey:'forged'}}});
 assert.ok(result.url);assert.equal(empty.data.orgs.org.trips,undefined);
});
test('expired checkout returns reserved seats once; unpaid checkout cannot create trip',async()=>{
 const f=fixture(2);await f.endpoints.requestSeats(request);const session=[...f.sessions.values()][0];
 await assert.rejects(f.service.completeJourneyCheckout(session),/Payment is not complete/);
 session.status='expired';await f.service.releaseJourneyCheckout('org',session.metadata.journeyCheckoutKey,session);
 await f.service.releaseJourneyCheckout('org',session.metadata.journeyCheckoutKey,session);
 assert.equal(f.data.orgs.org.prepaid_seats,2);assert.equal(f.data.orgs.org.trips,undefined);
});
test('duration is calculated on server, and network retries do not reserve credits twice',async()=>{
 const f=fixture(2);f.stripe.failure=Object.assign(new Error('network'),{type:'StripeConnectionError'});
 const long={data:{...request.data,tripData:{...tripData,endDate:Date.UTC(2027,1,15)}}};
 await assert.rejects(f.endpoints.requestSeats(long),/network/);assert.equal(f.data.orgs.org.prepaid_seats,0);
 f.stripe.failure=null;await f.endpoints.requestSeats(long);assert.equal(f.calls.at(-1).line_items[0].quantity,4);
 assert.equal(f.data.orgs.org.prepaid_seats,0);
});
test('concurrent checkout requests share a reservation and session',async()=>{
 const f=fixture(2);const results=await Promise.all([f.endpoints.requestSeats(request),f.endpoints.requestSeats(request)]);
 assert.equal(results[0].url,results[1].url);assert.equal(f.sessions.size,1);assert.equal(f.data.orgs.org.prepaid_seats,0);
});
test('retrying an expired checkout restores credits before making a new quote',async()=>{
 const f=fixture(2);await f.endpoints.requestSeats(request);const old=[...f.sessions.values()][0];old.status='expired';
 await f.endpoints.requestSeats(request);assert.equal(f.sessions.size,2);assert.equal(f.calls.at(-1).line_items[0].quantity,1);
 await f.service.releaseJourneyCheckout('org',old.metadata.journeyCheckoutKey,old);
 assert.equal(f.data.orgs.org.prepaid_seats,0); // stale expiry cannot release new reservation
});

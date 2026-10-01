const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const storeHost = process.env.FIRESTORE_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!authHost || !storeHost || !storageHost || !project.startsWith('demo-')) throw new Error('Demo emulators required');
async function main() {
  const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`storage-${Date.now()}@example.test`,password:'test-password',returnSecureToken:true}),
  });
  const {localId:uid,idToken:token}=await signup.json();assert.ok(uid && token);
  const mirror = async (expiry, cutoff=0) => {
    const response = await fetch(`http://${storeHost}/v1/projects/${project}/databases/(default)/documents/app_access/${uid}`, {
      method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:{
        staff:{booleanValue:false},expires_at:{integerValue:String(expiry)},revoked_before:{integerValue:String(cutoff)},
        trips:{mapValue:{fields:{t:{integerValue:String(expiry)}}}},
      }}),
    });assert.equal(response.status,200,await response.text());
  };
  let checks=0;
  const upload=async (trip,expected) => {
    const response=await fetch(`http://${storageHost}/v0/b/${project}.appspot.com/o?uploadType=media&name=${encodeURIComponent(`chat_media/${trip}/test.jpg`)}`,{
      method:'POST',headers:{Authorization:`Firebase ${token}`,'Content-Type':'image/jpeg'},body:'test',
    });
    assert.equal(response.status,expected,await response.text());checks++;
  };
  await mirror(Date.now()+60000);
  await upload('t',200);
  await upload('other',403);
  await mirror(Date.now()-1);
  await upload('t',403);
  await mirror(Date.now()+60000,Math.floor(Date.now()/1000)+1);
  await upload('t',403);
  const tamper=await fetch(`http://${storeHost}/v1/projects/${project}/databases/(default)/documents/app_access/${uid}`,{
    method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({fields:{staff:{booleanValue:true}}}),
  });assert.equal(tamper.status,403);checks++;
  console.log(`PASS: ${checks} Storage/Firestore checks for valid membership, expiry, replay and mirror tampering.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

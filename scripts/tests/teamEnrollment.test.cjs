const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for (const sourcePath of ['GoMusafir-Website/lib/teamEnrollment.js', 'src/utils/teamEnrollment.js']) {
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(sourcePath,'utf8').replace('export async function','async function'),ctx);
const user={email:'member@example.test'};
function fixture({currentUser=null,exists=false,race=false}={}){
 const calls=[];const auth={currentUser,authStateReady:async()=>{}};
 return {calls,auth,run:()=>ctx.ensureTeamAccount({auth,email:' Member@example.test ',password:'password',
 checkUser:async email=>{calls.push('check');assert.equal(email,user.email);return {data:{exists}};},
 createUser:async()=>{calls.push('create');if(race)throw {code:'auth/email-already-in-use'};auth.currentUser=user;return {user};},
 signIn:async()=>{calls.push('signIn');return {user};}})};
}
test(sourcePath + ': new account is checked before creation and retry reuses the same session',async()=>{
 const f=fixture();assert.equal(await f.run(),user);await f.run();assert.deepEqual(f.calls,['check','create']);
});
test(sourcePath + ': genuine existing verified account uses sign-in without creating again',async()=>{
 const f=fixture({exists:true});await f.run();assert.deepEqual(f.calls,['check','signIn']);
});
test(sourcePath + ': concurrent email creation falls back to authenticating existing account',async()=>{
 const f=fixture({race:true});await f.run();assert.deepEqual(f.calls,['check','create','signIn']);
});

test(sourcePath + ': failed account lookup must not create an account', async () => {
 let created = false;
 await assert.rejects(ctx.ensureTeamAccount({
  auth: { authStateReady: async () => {} }, email: user.email,
  checkUser: async () => { throw Error('offline'); },
  createUser: async () => { created = true; },
 }), /offline/);
 assert.equal(created, false);
});
test(sourcePath + ': another signed-in account is never reused', async () => {
 const f = fixture({currentUser: {email: 'someone-else@example.test'}, exists: true});
 assert.equal(await f.run(), user);
 assert.deepEqual(f.calls, ['check', 'signIn']);
});
test(sourcePath + ': account created before later failure is reusable even when email is verified', async () => {
 const currentUser = {email: user.email, emailVerified: true};
 const f = fixture({currentUser});
 assert.equal(await f.run(), currentUser);
 assert.deepEqual(f.calls, []);
});
}

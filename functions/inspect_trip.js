const admin = require("firebase-admin");

admin.initializeApp({
  databaseURL: "https://go-musafir-default-rtdb.europe-west1.firebasedatabase.app"
});

async function main() {
  const db = admin.database();
  
  // 1. Get active trips from trips_active
  const tripsActiveSnap = await db.ref("trips_active").get();
  if (!tripsActiveSnap.exists()) {
    console.log("No active trips found.");
    process.exit(0);
  }
  
  const orgs = tripsActiveSnap.val();
  for (const orgId in orgs) {
    console.log(`\n================ Org ID: ${orgId} ================`);
    const trips = orgs[orgId];
    for (const tripId in trips) {
      console.log(`\n  --- Trip ID: ${tripId} ---`);
      const tripData = trips[tripId];
      
      console.log("  Global Visibility Config:");
      // Fetch global visibility config from orgs/$orgId/trips/$tripId/visibility_config
      const visSnap = await db.ref(`orgs/${orgId}/trips/${tripId}/visibility_config`).get();
      console.log(JSON.stringify(visSnap.val(), null, 4));
      
      console.log("\n  Locations inside trips_active:");
      console.log(JSON.stringify(tripData.locations, null, 4));
      
      console.log("\n  Location Permissions:");
      console.log(JSON.stringify(tripData.location_permissions, null, 4));
      
      // Fetch participants list for this trip from trips_participants
      const participantsSnap = await db.ref(`trips_participants/${tripId}`).get();
      console.log("\n  Participants List from trips_participants:");
      console.log(JSON.stringify(participantsSnap.val(), null, 4));
      
      // For each participant, fetch their profile and participant_visibility
      const uids = participantsSnap.val() || {};
      const uidList = Array.isArray(uids) ? uids.filter(v => v !== null) : Object.keys(uids);
      for (const uid of uidList) {
        const userSnap = await db.ref(`users/${uid}`).get();
        const userData = userSnap.val() || {};
        console.log(`\n    * User UID: ${uid}`);
        console.log(`      Name: ${userData.full_name || (userData.profile && (userData.profile.firstName + " " + userData.profile.lastName))}`);
        console.log(`      Role in DB: ${userData.role}`);
        console.log(`      Current Trip: ${userData.current_trip}`);
        console.log(`      Personal Visibility Settings for this trip:`);
        console.log(JSON.stringify(userData.participant_visibility?.[tripId], null, 4));
      }
    }
  }
  process.exit(0);
}

main().catch(console.error);

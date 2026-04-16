const admin = require("firebase-admin");

// Initialize once — used by all function groups
if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://go-musafir-default-rtdb.europe-west1.firebasedatabase.app",
  });
}

const db = admin.database();
const auth = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage };

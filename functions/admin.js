const admin = require("firebase-admin");

// Initialize once — used by all function groups
if (!admin.apps.length) {
  const initOptions = {
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://go-musafir-default-rtdb.europe-west1.firebasedatabase.app",
    storageBucket: "go-musafir.firebasestorage.app",
  };

  // Cloud Functions supplies its runtime identity. Local tools can use standard
  // Application Default Credentials without shipping a private key to production.
  admin.initializeApp(initOptions);
}

const db = admin.database();
const auth = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage };

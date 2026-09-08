const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Initialize once — used by all function groups
if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, "go-musafir-firebase-adminsdk-fbsvc-baa91afb3d.json");
  const initOptions = {
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://go-musafir-default-rtdb.europe-west1.firebasedatabase.app",
    storageBucket: "go-musafir.firebasestorage.app",
  };

  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = require(serviceAccountPath);
      initOptions.credential = admin.credential.cert(serviceAccount);
      console.log("Firebase Admin initialized with local Service Account Certificate.");
    } catch (e) {
      console.warn("Failed to load service account certificate, falling back to default credentials:", e);
    }
  }

  admin.initializeApp(initOptions);
}

const db = admin.database();
const auth = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage };


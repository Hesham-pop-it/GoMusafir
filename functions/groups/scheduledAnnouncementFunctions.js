const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { admin, db } = require('../admin');
const { queueEntry, queueKey, sendDue } = require('../services/scheduledAnnouncementService');

// Keeps the server-only due-queue in step with staff edits and cancellations.
exports.onScheduledAnnouncementWritten = onValueWritten({
  ref: '/trips_active/{orgId}/{tripId}/scheduled/{id}', region: 'europe-west1', retry: true,
}, async event => {
  const { orgId, tripId, id } = event.params;
  const entry = queueEntry(orgId, tripId, event.data.after.val(), id);
  await db.ref(`scheduled_queue/${queueKey(orgId, tripId, id)}`).set(entry);
});

exports.sendScheduledAnnouncements = onSchedule({ schedule: 'every 1 minutes', region: 'europe-west1', retryCount: 3 }, async () => {
  await sendDue({ db, timestamp: admin.database.ServerValue.TIMESTAMP });
});

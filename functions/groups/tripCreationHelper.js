const { db, admin } = require("../admin");
const { v4: uuidv4 } = require("uuid");

const createTripRecord = async ({ orgId, uid, title, destination, startDate, endDate, image, totalSeats }) => {
  const tripId = db.ref(`orgs/${orgId}/trips`).push().key;
  const inviteCode = uuidv4();

  const formatDate = (ts) => {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
  };

  const tripData = {
    title,
    location: destination,
    date: `${formatDate(startDate)} - ${formatDate(endDate)}`,
    participants: 1,
    total_seats: parseInt(totalSeats) || 15,
    image: image || null,
    status: "active",
    invitation_code: inviteCode,
    start_date: startDate,
    end_date: endDate,
    invite_expires_at: endDate + 24 * 60 * 60 * 1000,
    created_by: uid || "system",
    created_at: admin.database.ServerValue.TIMESTAMP,
    voice_state: {
      mute_all: false,
      recording: false,
    },
  };

  const inviteEntry = {
    org_id: orgId,
    trip_id: tripId,
    role: "participant",
    expires_at: tripData.invite_expires_at,
    redeemed_count: 0,
  };

  const updates = {
    [`orgs/${orgId}/trips/${tripId}`]: tripData,
    [`invites/${inviteCode}`]: inviteEntry,
    [`trips_orgs/${tripId}`]: orgId,
    [`trips_participants/${tripId}/${uid}`]: true,
    [`users/${uid}/joined_trips/${tripId}`]: {
      org_id: orgId,
      status: "organizer",
      joined_at: admin.database.ServerValue.TIMESTAMP,
    },
  };

  await db.ref().update(updates);
  return { tripId, inviteCode };
};

module.exports = { createTripRecord };

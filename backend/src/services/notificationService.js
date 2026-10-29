const crypto = require("crypto");
const pool = require("../config/db");

function dateText(value) {
  if (!value) return "To be announced";
  if (value instanceof Date) {
    const pad = number => String(number).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }
  return String(value).replace("T", " ").slice(0, 16);
}

function dedupeKey(type, source) {
  return crypto.createHash("sha256").update(`${type}:${source}`).digest("hex");
}

function eventMessage(event, prefix) {
  return `${prefix}: ${event.title}. Date and time: ${dateText(event.start_datetime)}. Venue: ${event.venue || "To be announced"}.`;
}

async function insertForRecipients(rows) {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const values = [];
    const placeholders = batch.map(row => {
      values.push(row.notification_id, row.recipient_id, row.event_id, row.registration_id,
        row.notification_type, row.title, row.message, row.dedupe_key);
      return "(?, ?, ?, ?, ?, ?, ?, ?)";
    }).join(", ");
    const [result] = await pool.execute(
      `INSERT IGNORE INTO event_notifications
        (notification_id, recipient_id, event_id, registration_id, notification_type, title, message, dedupe_key)
       VALUES ${placeholders}`,
      values
    );
    inserted += result.affectedRows;
  }
  return inserted;
}

async function notifyRegistration({ recipientId, registrationId, event }) {
  const key = dedupeKey("REGISTRATION_CONFIRMED", registrationId);
  return insertForRecipients([{
    notification_id: crypto.randomUUID(), recipient_id: recipientId, event_id: event.event_id,
    registration_id: registrationId, notification_type: "REGISTRATION_CONFIRMED",
    title: "Registration confirmed", message: `${eventMessage(event, "Your registration is confirmed")} Registration reference: ${registrationId}.`, dedupe_key: key
  }]);
}

async function notifyEventAttendees({ event, type, title, prefix, revision }) {
  const [recipients] = await pool.execute(
    `SELECT DISTINCT attendee_id, registration_id FROM event_registrations
     WHERE event_id = ? AND registration_status = 'CONFIRMED'`, [event.event_id]
  );
  const key = dedupeKey(type, `${event.event_id}:${revision || event.start_datetime || "cancelled"}`);
  return insertForRecipients(recipients.map(row => ({
    notification_id: crypto.randomUUID(), recipient_id: row.attendee_id, event_id: event.event_id,
    registration_id: row.registration_id, notification_type: type, title,
    message: `${eventMessage(event, prefix)} Registration reference: ${row.registration_id}.`, dedupe_key: key
  })));
}

async function listNotifications(recipientId, limit) {
  const [rows] = await pool.execute(
    `SELECT notification_id, event_id, registration_id, notification_type, title, message, is_read, created_at
     FROM event_notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT ?`, [recipientId, limit]
  );
  return rows;
}

async function markRead(recipientId, notificationId) {
  const [result] = await pool.execute(
    `UPDATE event_notifications SET is_read = 1 WHERE notification_id = ? AND recipient_id = ?`,
    [notificationId, recipientId]
  );
  return result.affectedRows > 0;
}

module.exports = { notifyRegistration, notifyEventAttendees, listNotifications, markRead, dedupeKey };

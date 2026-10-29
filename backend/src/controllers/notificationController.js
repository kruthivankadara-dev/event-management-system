const pool = require("../config/db");
const notifications = require("../services/notificationService");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function listMine(req, res, next) {
  try {
    const requested = Number(req.query.limit || 50);
    if (!Number.isInteger(requested) || requested < 1 || requested > 100) {
      return res.status(400).json({ success: false, message: "Limit must be between 1 and 100." });
    }
    const items = await notifications.listNotifications(req.user.id, requested);
    return res.status(200).json({ success: true, data: { notifications: items } });
  } catch (error) { return next(error); }
}

async function markMineRead(req, res, next) {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid notification ID." });
  }
  try {
    const changed = await notifications.markRead(req.user.id, req.params.id);
    if (!changed) return res.status(404).json({ success: false, message: "Notification not found." });
    return res.status(200).json({ success: true, message: "Notification marked as read." });
  } catch (error) { return next(error); }
}

async function sendReminder(req, res, next) {
  const { eventId } = req.params;
  if (!UUID_PATTERN.test(eventId)) {
    return res.status(400).json({ success: false, message: "Invalid event ID." });
  }
  try {
    const [events] = await pool.execute(
      `SELECT event_id, title, venue, start_datetime, end_datetime, created_by, status
       FROM events WHERE event_id = ? LIMIT 1`, [eventId]
    );
    const event = events[0];
    if (!event || event.status !== "SCHEDULED") {
      return res.status(404).json({ success: false, message: "Scheduled event not found." });
    }
    if (!req.user.roles.includes("ADMIN") && event.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: "You may only send reminders for your own events." });
    }
    const count = await notifications.notifyEventAttendees({
      event, type: "EVENT_REMINDER", title: "Event reminder", prefix: "Reminder",
      revision: `${event.start_datetime}:reminder`
    });
    return res.status(200).json({
      success: true,
      message: count > 0
        ? "Reminder notifications sent."
        : "No new reminders were created; there are no confirmed attendees or this reminder was already sent.",
      data: { delivered: count }
    });
  } catch (error) { return next(error); }
}

module.exports = { listMine, markMineRead, sendReminder };

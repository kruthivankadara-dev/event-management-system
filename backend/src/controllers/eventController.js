const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { validateEvent } = require("../validators/eventValidators");

function toMysqlDateTime(value) {
  // datetime-local values are local wall-clock values. Store those values in
  // MySQL DATETIME consistently without applying a server timezone conversion.
  return value.replace("T", " ").slice(0, 19);
}

async function createEvent(req, res, next) {
  const parsed = validateEvent(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map(issue => ({
      field: issue.path[0] || "event",
      message: issue.message
    }));
    return res.status(400).json({
      success: false,
      message: errors[0]?.message || "Please check the event details.",
      errors
    });
  }

  const event = parsed.data;
  const eventId = randomUUID();
  try {
    await pool.execute(
      `INSERT INTO events
       (event_id, title, description, category, venue, start_datetime, end_datetime,
        capacity, registration_deadline, image_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        event.title,
        event.description,
        event.category || null,
        event.venue,
        toMysqlDateTime(event.startDateTime),
        toMysqlDateTime(event.endDateTime),
        event.capacity,
        event.registrationDeadline ? toMysqlDateTime(event.registrationDeadline) : null,
        event.imageUrl || null,
        req.user.id
      ]
    );

    const [created] = await pool.execute(
      `SELECT event_id, title, description, category, venue, start_datetime,
              end_datetime, capacity, registration_deadline, image_url,
              created_by, created_at
       FROM events WHERE event_id = ?`,
      [eventId]
    );
    if (!created.length) {
      throw new Error("Created event could not be retrieved.");
    }
    return res.status(201).json({
      success: true,
      message: "Event created successfully.",
      data: { event: created[0] }
    });
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(401).json({ success: false, message: "Your account is no longer available. Please sign in again." });
    }
    if (error.code === "ER_DATA_TOO_LONG" || error.code === "ER_TRUNCATED_WRONG_VALUE") {
      return res.status(400).json({ success: false, message: "One or more event details are outside the supported range." });
    }
    next(error);
  }
}

module.exports = { createEvent };

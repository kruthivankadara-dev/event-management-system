const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { validateRegistrationRequest } = require("../validators/registrationValidators");

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ID_PATTERN = EVENT_ID_PATTERN;

function sendError(res, status, message, code) {
  return res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {})
  });
}

async function registerForEvent(req, res, next) {
  const { id: eventId } = req.params;

  if (!EVENT_ID_PATTERN.test(eventId)) {
    return sendError(res, 400, "Invalid event ID.", "INVALID_EVENT_ID");
  }

  const parsed = validateRegistrationRequest(req.body);

if (!parsed.success) {
  return res.status(400).json({
    success: false,
    message:
      parsed.error.issues[0]?.message ||
      "Please check the registration details.",
    errors: parsed.error.issues.map(issue => ({
      field: issue.path[0] || "registration",
      message: issue.message
    }))
  });
}

const { phoneNumber, college, department } = parsed.data;

  const attendeeId = req.user?.id;
  if (!attendeeId || !USER_ID_PATTERN.test(attendeeId)) {
    return sendError(res, 401, "Your attendee account is invalid. Please sign in again.", "INVALID_ATTENDEE");
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [attendees] = await connection.execute(
  `SELECT full_name, email
   FROM users
   WHERE user_id = ?
   LIMIT 1`,
  [attendeeId]
);

if (!attendees.length) {
  await connection.rollback();
  transactionStarted = false;

  return sendError(
    res,
    401,
    "Your attendee account is no longer available. Please sign in again.",
    "INVALID_ATTENDEE"
  );
}

const attendeeName = attendees[0].full_name;
const attendeeEmail = attendees[0].email;

    // Serialize all reservations for this event by locking its event row.
    const [events] = await connection.execute(
      `SELECT event_id, title, status, capacity,
        (registration_deadline IS NULL OR registration_deadline >= CURRENT_TIMESTAMP) AS registration_open,
        (start_datetime > CURRENT_TIMESTAMP) AS event_upcoming
       FROM events
       WHERE event_id = ?
       FOR UPDATE`,
      [eventId]
    );

    if (!events.length) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 404, "Event not found.", "EVENT_NOT_FOUND");
    }

    const event = events[0];
    if (event.status !== "SCHEDULED") {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "This event is unavailable for registration.", "EVENT_UNAVAILABLE");
    }

    if (!Number(event.registration_open)) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "Registration for this event is closed.", "REGISTRATION_CLOSED");
    }

    if (!Number(event.event_upcoming)) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "Registration is unavailable because this event has started.", "EVENT_STARTED");
    }

    const [existing] = await connection.execute(
      `SELECT registration_id
       FROM event_registrations
       WHERE event_id = ? AND attendee_id = ?
       LIMIT 1`,
      [eventId, attendeeId]
    );

    if (existing.length) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "You are already registered for this event.", "ALREADY_REGISTERED");
    }

    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS registered_count
       FROM event_registrations
       WHERE event_id = ? AND registration_status = 'CONFIRMED'`,
      [eventId]
    );
    const registeredCount = Number(countRows[0]?.registered_count || 0);

    if (registeredCount >= Number(event.capacity)) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "This event is full.", "EVENT_FULL");
    }

    const registrationId = randomUUID();

await connection.execute(
  `INSERT INTO event_registrations
    (
      registration_id,
      event_id,
      attendee_id,
      registration_status,
      attendee_name,
      attendee_email,
      phone_number,
      college,
      department
    )
   VALUES (?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?)`,
  [
    registrationId,
    eventId,
    attendeeId,
    attendeeName,
    attendeeEmail,
    phoneNumber,
    college,
    department
  ]
);

    const [registrations] = await connection.execute(
  `SELECT
     registration_id,
     event_id,
     attendee_id,
     registration_status,
     attendee_name,
     attendee_email,
     phone_number,
     college,
     department,
     registered_at,
     updated_at
   FROM event_registrations
   WHERE registration_id = ?`,
  [registrationId]
);

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Registration completed successfully.",
      data: {
        registration: registrations[0],
        availability: {
          capacity: Number(event.capacity),
          registeredCount: registeredCount + 1,
          remaining: Math.max(0, Number(event.capacity) - registeredCount - 1),
          status: registeredCount + 1 >= Number(event.capacity) ? "FULL" : "AVAILABLE"
        }
      }
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original database error for the error middleware.
      }
    }

    if (error.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "You are already registered for this event.", "ALREADY_REGISTERED");
    }

    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return sendError(res, 401, "Your attendee account is no longer available. Please sign in again.", "INVALID_ATTENDEE");
    }

    return next(error);
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { registerForEvent };

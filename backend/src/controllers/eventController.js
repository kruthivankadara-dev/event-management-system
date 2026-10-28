const pool = require("../config/db");
const { randomUUID } = require("crypto");
const {
  validateEvent,
  validateEventSearchQuery
} = require("../validators/eventValidators");

function toMysqlDateTime(value) {
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
  capacity, registration_deadline, image_url, registration_url, created_by)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
  eventId,
  event.title,
  event.description,
  event.category || null,
  event.venue,
  toMysqlDateTime(event.startDateTime),
  toMysqlDateTime(event.endDateTime),
  event.capacity,
  event.registrationDeadline
    ? toMysqlDateTime(event.registrationDeadline)
    : null,
  event.imageUrl || null,
  event.registrationUrl || null,
  req.user.id
]
    );

    const [created] = await pool.execute(
  `SELECT event_id, title, description, category, venue, start_datetime,
          end_datetime, capacity, registration_deadline, image_url,
          registration_url, created_by, created_at
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
      return res.status(401).json({
        success: false,
        message: "Your account is no longer available. Please sign in again."
      });
    }

    if (
      error.code === "ER_DATA_TOO_LONG" ||
      error.code === "ER_TRUNCATED_WRONG_VALUE"
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more event details are outside the supported range."
      });
    }

    next(error);
  }
}


function escapeLikeValue(value) {
  return value.replace(/[=%_]/g, character => `=${character}`);
}

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getEventById(req, res, next) {
  const { id } = req.params;

  if (!EVENT_ID_PATTERN.test(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid event ID."
    });
  }

  try {
    const [events] = await pool.execute(
      `SELECT e.event_id, e.title, e.description, e.category, e.venue,
        e.start_datetime, e.end_datetime, e.capacity,
        e.registration_deadline, e.image_url, e.registration_url,
        e.created_by, e.created_at, e.status,
        attendee_registration.registration_status AS attendee_registration_status,
        attendee_payment.payment_status AS attendee_payment_status,
        (SELECT COUNT(*) FROM event_registrations confirmed
         WHERE confirmed.event_id = e.event_id
           AND confirmed.registration_status = 'CONFIRMED') AS registered_count,
        (e.registration_deadline IS NULL OR e.registration_deadline >= CURRENT_TIMESTAMP) AS registration_open,
        (e.start_datetime > CURRENT_TIMESTAMP) AS event_upcoming
       FROM events e
       LEFT JOIN event_registrations attendee_registration
         ON attendee_registration.event_id = e.event_id
        AND attendee_registration.attendee_id = ?
       LEFT JOIN registration_payments attendee_payment
         ON attendee_payment.registration_id = attendee_registration.registration_id
       WHERE e.event_id = ? AND e.status = 'SCHEDULED'
       LIMIT 1`,
      [req.user.id, id]
    );

    if (!events.length) {
      return res.status(404).json({
        success: false,
        message: "Event not found or unavailable."
      });
    }

    const event = events[0];
    const capacity = Number(event.capacity);
    const registeredCount = Number(event.registered_count || 0);
    const remaining = Math.max(0, capacity - registeredCount);
    const registrationOpen = Boolean(Number(event.registration_open)) &&
      Boolean(Number(event.event_upcoming));
    const attendeeStatus = req.user.roles.includes("ATTENDEE")
      ? (event.attendee_registration_status || "NOT_REGISTERED")
      : "NOT_APPLICABLE";

    return res.status(200).json({
      success: true,
      data: {
        event,
        availability: {
          capacity,
          registeredCount,
          remaining,
          status: remaining === 0 ? "FULL" : registrationOpen ? "AVAILABLE" : "CLOSED"
        },
        registration: {
          status: event.registration_url ? "EXTERNAL" : "NOT_CONFIGURED",
          url: event.registration_url || null,
          attendeeStatus,
          paymentStatus: attendeeStatus === "CONFIRMED"
            ? (event.attendee_payment_status || "PENDING")
            : null,
          processingAvailable: false,
          isOpen: registrationOpen
        },
        fee: null
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getEvents(req, res, next) {
  const parsed = validateEventSearchQuery(req.query);

  if (!parsed.success) {
    const errors = parsed.error.issues.map(issue => ({
      field: issue.path[0] || "query",
      message: issue.message
    }));

    return res.status(400).json({
      success: false,
      message: errors[0]?.message || "Please check the search filters.",
      errors
    });
  }

  const { q, category, date, venue } = parsed.data;
  const conditions = ["status = 'SCHEDULED'"];
  const values = [];

  if (q) {
    const keyword = `%${escapeLikeValue(q)}%`;
    conditions.push("(title LIKE ? ESCAPE '=' OR description LIKE ? ESCAPE '=')");
    values.push(keyword, keyword);
  }

  if (category) {
    conditions.push("category = ?");
    values.push(category);
  }

  if (date) {
    conditions.push("start_datetime >= ? AND start_datetime < DATE_ADD(?, INTERVAL 1 DAY)");
    values.push(date, date);
  }

  if (venue) {
    conditions.push("venue LIKE ? ESCAPE '='");
    values.push(`%${escapeLikeValue(venue)}%`);
  }

  try {
    const [events] = await pool.execute(
      `SELECT event_id, title, description, category, venue,
        start_datetime, end_datetime, capacity,
        registration_deadline, image_url, registration_url,
        created_by, created_at, status
       FROM events
       WHERE ${conditions.join(" AND ")}
       ORDER BY start_datetime ASC`,
      values
    );

    return res.status(200).json({
      success: true,
      data: { events }
    });
  } catch (error) {
    next(error);
  }
}


async function updateEvent(req, res, next) {
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

  try {
    const [result] = await pool.execute(
      `UPDATE events
       SET title = ?, description = ?, category = ?, venue = ?,
           start_datetime = ?, end_datetime = ?, capacity = ?,
           registration_deadline = ?, image_url = ?, registration_url = ?
       WHERE event_id = ? AND created_by = ? AND status = 'SCHEDULED'`,
      [
        event.title,
        event.description,
        event.category || null,
        event.venue,
        toMysqlDateTime(event.startDateTime),
        toMysqlDateTime(event.endDateTime),
        event.capacity,
        event.registrationDeadline
          ? toMysqlDateTime(event.registrationDeadline)
          : null,
        event.imageUrl || null,
        event.registrationUrl || null,
        req.params.id,
        req.user.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found, not owned by you, or already cancelled."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event updated successfully."
    });
  } catch (error) {
    next(error);
  }
}

async function cancelEvent(req, res, next) {
  try {
    const [result] = await pool.execute(
      `UPDATE events
       SET status = 'CANCELLED'
       WHERE event_id = ? AND created_by = ? AND status = 'SCHEDULED'`,
      [req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found, not owned by you, or already cancelled."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event cancelled successfully."
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  cancelEvent
};

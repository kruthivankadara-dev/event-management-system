const pool = require("../config/db");
const { randomUUID } = require("crypto");
const {
  validateEvent,
  validateEventSearchQuery
} = require("../validators/eventValidators");
const { notifyEventAttendees } = require("../services/notificationService");
const { writeAudit } = require("../services/auditLogService");

function toMysqlDateTime(value) {
  const formatted = value.replace("T", " ").slice(0, 19);
  return formatted.length === 16 ? `${formatted}:00` : formatted;
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
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.execute(
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

    const [created] = await connection.execute(
  `SELECT event_id, title, description, category, venue, start_datetime,
          end_datetime, capacity, registration_deadline, image_url,
          registration_url, created_by, created_at
   FROM events WHERE event_id = ?`,
  [eventId]
);

    if (!created.length) {
      throw new Error("Created event could not be retrieved.");
    }

    await writeAudit(
      connection,
      req.user.id,
      "CREATE_EVENT",
      "EVENT",
      eventId,
      null,
      { fields: Object.keys(event) }
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Event created successfully.",
      data: { event: created[0] }
    });

  } catch (error) {
    if (connection) await connection.rollback();

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
  } finally {
    if (connection) connection.release();
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
        attendee_registration.registration_id AS attendee_registration_id,
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
          registrationId: attendeeStatus === "CONFIRMED"
            ? event.attendee_registration_id
            : null,
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

async function getEventAttendees(req, res, next) {
  const { id } = req.params;

  if (!EVENT_ID_PATTERN.test(id)) {
    return res.status(400).json({ success: false, message: "Invalid event ID." });
  }

  try {
    const [events] = await pool.execute(
      `SELECT event_id, title, created_by
       FROM events
       WHERE event_id = ?
       LIMIT 1`,
      [id]
    );

    if (!events.length) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }

    const event = events[0];
    const isAdmin = req.user.roles.includes("ADMIN");
    if (!isAdmin && event.created_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You may only view attendee lists for events you own."
      });
    }

    const [attendees] = await pool.execute(
      `SELECT r.registration_id, r.attendee_name, r.attendee_email,
              r.phone_number, r.college, r.department,
              r.registration_status, r.registered_at, r.updated_at,
              t.ticket_status,
              t.checked_in_at,
              CASE
                WHEN t.checked_in_at IS NOT NULL THEN 'CHECKED_IN'
                ELSE 'NOT_CHECKED_IN'
              END AS attendance_status
       FROM event_registrations r
       LEFT JOIN event_tickets t ON t.registration_id = r.registration_id
       WHERE r.event_id = ?
       ORDER BY r.registered_at ASC, r.registration_id ASC`,
      [id]
    );

    return res.status(200).json({
      success: true,
      data: {
        event: { event_id: event.event_id, title: event.title },
        attendees
      }
    });
  } catch (error) {
    return next(error);
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
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [currentRows] = await connection.execute(
      `SELECT event_id, title, description, category, venue, capacity, image_url,
              DATE_FORMAT(start_datetime, '%Y-%m-%d %H:%i:%s') AS start_datetime,
              DATE_FORMAT(end_datetime, '%Y-%m-%d %H:%i:%s') AS end_datetime,
              DATE_FORMAT(registration_deadline, '%Y-%m-%d %H:%i:%s') AS registration_deadline,
              registration_url
       FROM events
       WHERE event_id = ? AND created_by = ? AND status = 'SCHEDULED'
       LIMIT 1
       FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    if (!currentRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Event not found, not owned by you, or already cancelled." });
    }
    const previous = currentRows[0];

    const updated = {
      ...event,
      event_id: req.params.id,
      start_datetime: toMysqlDateTime(event.startDateTime),
      end_datetime: toMysqlDateTime(event.endDateTime),
      registration_deadline: event.registrationDeadline
        ? toMysqlDateTime(event.registrationDeadline)
        : null
    };
    const comparablePrevious = {
      title: previous.title,
      description: previous.description,
      category: previous.category || "",
      venue: previous.venue,
      startDateTime: previous.start_datetime,
      endDateTime: previous.end_datetime,
      capacity: Number(previous.capacity),
      registrationDeadline: previous.registration_deadline || "",
      imageUrl: previous.image_url || "",
      registrationUrl: previous.registration_url || ""
    };
    const comparableUpdated = {
      title: event.title,
      description: event.description,
      category: event.category || "",
      venue: event.venue,
      startDateTime: updated.start_datetime,
      endDateTime: updated.end_datetime,
      capacity: event.capacity,
      registrationDeadline: updated.registration_deadline || "",
      imageUrl: event.imageUrl || "",
      registrationUrl: event.registrationUrl || ""
    };
    const changedFields = Object.keys(comparableUpdated).filter(
      key => String(comparablePrevious[key]) !== String(comparableUpdated[key])
    );
    const scheduleChanged = changedFields.includes("startDateTime") ||
      changedFields.includes("endDateTime");

    const [result] = await connection.execute(
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
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Event not found, not owned by you, or already cancelled."
      });
    }

    await writeAudit(
      connection,
      req.user.id,
      scheduleChanged ? "POSTPONE_EVENT" : "UPDATE_EVENT",
      "EVENT",
      req.params.id,
      { changedFields },
      { changedFields }
    );

    await connection.commit();

    const importantChanged = changedFields.length > 0;
    if (importantChanged) {
      try {
        await notifyEventAttendees({
          event: updated,
          type: scheduleChanged ? "EVENT_POSTPONED" : "EVENT_UPDATED",
          title: scheduleChanged ? "Event schedule changed" : "Important event update",
          prefix: scheduleChanged ? "The event schedule has changed" : "Important event update",
          revision: `${updated.title}:${updated.start_datetime}:${updated.end_datetime}:${updated.venue}:${updated.description}`
        });
      } catch (notificationError) {
        console.error("Event update notification could not be stored.", notificationError.code || "DATABASE_ERROR");
      }
    }

    return res.status(200).json({
      success: true,
      message: "Event updated successfully."
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
}

async function cancelEvent(req, res, next) {
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [eventRows] = await connection.execute(
      `SELECT event_id, title, venue, start_datetime, end_datetime
       FROM events
       WHERE event_id = ? AND created_by = ? AND status = 'SCHEDULED'
       LIMIT 1
       FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    if (!eventRows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Event not found, not owned by you, or already cancelled."
      });
    }

    const event = eventRows[0];
    const [result] = await connection.execute(
      `UPDATE events
       SET status = 'CANCELLED'
       WHERE event_id = ? AND created_by = ? AND status = 'SCHEDULED'`,
      [req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Event not found, not owned by you, or already cancelled."
      });
    }

    await writeAudit(
      connection,
      req.user.id,
      "CANCEL_EVENT",
      "EVENT",
      req.params.id,
      { status: "SCHEDULED" },
      { status: "CANCELLED" }
    );

    await connection.commit();

    if (event) {
      try {
        await notifyEventAttendees({
          event,
          type: "EVENT_CANCELLED",
          title: "Event cancelled",
          prefix: "This event has been cancelled",
          revision: "cancelled"
        });
      } catch (notificationError) {
        console.error("Event cancellation notification could not be stored.", notificationError.code || "DATABASE_ERROR");
      }
    }

    return res.status(200).json({
      success: true,
      message: "Event cancelled successfully."
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  getEventAttendees,
  updateEvent,
  cancelEvent
};

const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { validateFeedback } = require("../validators/feedbackValidators");

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendError(res, status, message, code) {
  return res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
}

async function submitFeedback(req, res, next) {
  const { id: eventId } = req.params;
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return sendError(res, 400, "Invalid event ID.", "INVALID_EVENT_ID");
  }

  const parsed = validateFeedback(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || "Please check your feedback.",
      errors: parsed.error.issues.map(issue => ({
        field: issue.path[0] || "feedback",
        message: issue.message
      }))
    });
  }

  try {
    const [eligibilityRows] = await pool.execute(
      `SELECT e.event_id, e.title, e.status,
              (e.end_datetime <= CURRENT_TIMESTAMP) AS event_completed,
              r.registration_id, r.registration_status
       FROM events e
       LEFT JOIN event_registrations r
         ON r.event_id = e.event_id AND r.attendee_id = ?
       WHERE e.event_id = ?
       LIMIT 1`,
      [req.user.id, eventId]
    );

    if (!eligibilityRows.length) {
      return sendError(res, 404, "Event not found.", "EVENT_NOT_FOUND");
    }

    const event = eligibilityRows[0];
    if (event.status !== "SCHEDULED") {
      return sendError(res, 409, "Feedback is unavailable for this event.", "EVENT_UNAVAILABLE");
    }
    if (event.registration_status !== "CONFIRMED") {
      return sendError(res, 403, "Only confirmed attendees may submit feedback for this event.", "INELIGIBLE_ATTENDEE");
    }
    if (!Number(event.event_completed)) {
      return sendError(res, 409, "Feedback can be submitted after the event has ended.", "EVENT_NOT_COMPLETED");
    }

    const feedbackId = randomUUID();
    await pool.execute(
      `INSERT INTO event_feedback
         (feedback_id, event_id, attendee_id, registration_id, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [feedbackId, eventId, req.user.id, event.registration_id, parsed.data.rating, parsed.data.comment || null]
    );

    return res.status(201).json({
      success: true,
      message: "Thank you. Your feedback was submitted.",
      data: {
        feedback: {
          feedback_id: feedbackId,
          event_id: eventId,
          rating: parsed.data.rating,
          comment: parsed.data.comment || null
        }
      }
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "You have already submitted feedback for this event.", "FEEDBACK_ALREADY_SUBMITTED");
    }
    return next(error);
  }
}

async function getEventFeedback(req, res, next) {
  const { id: eventId } = req.params;
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return sendError(res, 400, "Invalid event ID.", "INVALID_EVENT_ID");
  }

  try {
    const [events] = await pool.execute(
      `SELECT event_id, title, created_by FROM events WHERE event_id = ? LIMIT 1`,
      [eventId]
    );
    if (!events.length) {
      return sendError(res, 404, "Event not found.", "EVENT_NOT_FOUND");
    }

    const isAttendee = req.user.roles.includes("ATTENDEE");
    const isAdmin = req.user.roles.includes("ADMIN");
    if (!isAttendee && !isAdmin && events[0].created_by !== req.user.id) {
      return sendError(res, 403, "You may only view feedback for events you own.", "EVENT_ACCESS_DENIED");
    }

    const values = [eventId];
    let attendeeFilter = "";
    if (isAttendee && !isAdmin) {
      attendeeFilter = " AND f.attendee_id = ?";
      values.push(req.user.id);
    }

    const [feedback] = await pool.execute(
      `SELECT f.feedback_id, f.rating, f.comment, f.created_at, r.attendee_name
       FROM event_feedback f
       JOIN event_registrations r ON r.registration_id = f.registration_id
       WHERE f.event_id = ?${attendeeFilter}
       ORDER BY f.created_at DESC, f.feedback_id ASC`,
      values
    );

    return res.status(200).json({
      success: true,
      data: {
        event: { event_id: events[0].event_id, title: events[0].title },
        feedback
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { submitFeedback, getEventFeedback };

const pool = require("../config/db");
const { validateReportQuery } = require("../validators/reportValidators");

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REPORT_SELECT = `
  SELECT e.event_id, e.title, e.status, e.start_datetime, e.end_datetime,
         e.venue, e.capacity,
         COUNT(DISTINCT r.registration_id) AS total_registrations,
         COUNT(DISTINCT CASE WHEN r.registration_status = 'CONFIRMED' THEN r.registration_id END) AS confirmed_registrations,
         COUNT(DISTINCT CASE WHEN r.registration_status = 'CANCELLED' THEN r.registration_id END) AS cancelled_registrations,
         COUNT(DISTINCT CASE WHEN t.checked_in_at IS NOT NULL THEN r.registration_id END) AS checked_in_attendees,
         COUNT(DISTINCT p.registration_id) AS payment_tracked_registrations,
         COUNT(DISTINCT CASE WHEN p.payment_status = 'PENDING' THEN p.registration_id END) AS pending_payments,
         COUNT(DISTINCT CASE WHEN p.payment_status = 'SUCCESSFUL' THEN p.registration_id END) AS successful_payments,
         COUNT(DISTINCT CASE WHEN p.payment_status = 'FAILED' THEN p.registration_id END) AS failed_payments
  FROM events e
  LEFT JOIN event_registrations r ON r.event_id = e.event_id
  LEFT JOIN event_tickets t ON t.registration_id = r.registration_id
  LEFT JOIN registration_payments p ON p.registration_id = r.registration_id`;

function normalizeReport(row) {
  return {
    ...row,
    capacity: Number(row.capacity),
    total_registrations: Number(row.total_registrations),
    confirmed_registrations: Number(row.confirmed_registrations),
    cancelled_registrations: Number(row.cancelled_registrations),
    checked_in_attendees: Number(row.checked_in_attendees),
    payment_tracked_registrations: Number(row.payment_tracked_registrations),
    pending_payments: Number(row.pending_payments),
    successful_payments: Number(row.successful_payments),
    failed_payments: Number(row.failed_payments)
  };
}

function summarizeReports(reports) {
  const fields = [
    "total_registrations",
    "confirmed_registrations",
    "cancelled_registrations",
    "checked_in_attendees",
    "payment_tracked_registrations",
    "pending_payments",
    "successful_payments",
    "failed_payments"
  ];
  const summary = { event_count: reports.length };
  for (const field of fields) {
    summary[field] = reports.reduce((total, report) => total + report[field], 0);
  }
  return summary;
}

function buildConditions({ from, to, status, organizerId, eventId }) {
  const conditions = [];
  const values = [];
  if (organizerId) {
    conditions.push("e.created_by = ?");
    values.push(organizerId);
  }
  if (eventId) {
    conditions.push("e.event_id = ?");
    values.push(eventId);
  }
  if (from) {
    conditions.push("e.start_datetime >= ?");
    values.push(`${from} 00:00:00`);
  }
  if (to) {
    conditions.push("e.start_datetime < DATE_ADD(?, INTERVAL 1 DAY)");
    values.push(`${to} 00:00:00`);
  }
  if (status) {
    conditions.push("e.status = ?");
    values.push(status);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

async function queryReports(options) {
  const { where, values } = buildConditions(options);
  const [rows] = await pool.execute(
    `${REPORT_SELECT}
     ${where}
     GROUP BY e.event_id, e.title, e.status, e.start_datetime, e.end_datetime, e.venue, e.capacity
     ORDER BY e.start_datetime DESC, e.event_id ASC`,
    values
  );
  return rows.map(normalizeReport);
}

function reportQueryError(res, parsed) {
  return res.status(400).json({
    success: false,
    message: parsed.error.issues[0]?.message || "Please check the report filters.",
    errors: parsed.error.issues.map(issue => ({ field: issue.path[0] || "filter", message: issue.message }))
  });
}

async function getEventReports(req, res, next) {
  const parsed = validateReportQuery(req.query);
  if (!parsed.success) return reportQueryError(res, parsed);

  const isAdmin = req.user.roles.includes("ADMIN");
  try {
    const reports = await queryReports({
      ...parsed.data,
      organizerId: isAdmin ? null : req.user.id
    });
    return res.status(200).json({
      success: true,
      data: { summary: summarizeReports(reports), events: reports }
    });
  } catch (error) {
    return next(error);
  }
}

async function getEventReport(req, res, next) {
  const { eventId } = req.params;
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return res.status(400).json({ success: false, message: "Invalid event ID." });
  }

  const isAdmin = req.user.roles.includes("ADMIN");
  try {
    const [events] = await pool.execute(
      `SELECT event_id, created_by FROM events WHERE event_id = ? LIMIT 1`,
      [eventId]
    );
    if (!events.length) {
      return res.status(404).json({ success: false, message: "Event not found." });
    }
    if (!isAdmin && events[0].created_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You may only view reports for events you own."
      });
    }

    const reports = await queryReports({ eventId });
    if (!reports.length) {
      return res.status(404).json({ success: false, message: "Event report not found." });
    }
    return res.status(200).json({
      success: true,
      data: { event: reports[0], summary: summarizeReports(reports) }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getEventReports, getEventReport, summarizeReports, normalizeReport };

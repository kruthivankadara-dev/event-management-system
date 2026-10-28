const QRCode = require("qrcode");
const pool = require("../config/db");
const { issueTicket, VALID_UUID } = require("../services/ticketService");

function sendError(res, status, message, code) {
  return res.status(status).json({ success: false, message, code });
}

async function getRegistrationTicket(req, res, next) {
  const { registrationId } = req.params;
  if (!VALID_UUID.test(registrationId)) {
    return sendError(res, 400, "Invalid registration ID.", "INVALID_REGISTRATION_ID");
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [registrations] = await connection.execute(
      `SELECT registration_id, registration_status
       FROM event_registrations
       WHERE registration_id = ? AND attendee_id = ?
       LIMIT 1
       FOR UPDATE`,
      [registrationId, req.user.id]
    );

    if (!registrations.length) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 404, "Registration not found.", "REGISTRATION_NOT_FOUND");
    }
    if (registrations[0].registration_status !== "CONFIRMED") {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "A ticket is available only for a confirmed registration.", "REGISTRATION_NOT_ELIGIBLE");
    }

    const ticket = await issueTicket(connection, registrationId);
    await connection.commit();
    transactionStarted = false;

    const qrCode = await QRCode.toDataURL(ticket.ticket_id, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256
    });

    return res.status(200).json({
      success: true,
      data: {
        ticket: {
          ticketId: ticket.ticket_id,
          registrationId: ticket.registration_id,
          eventId: ticket.event_id,
          eventTitle: ticket.event_title,
          venue: ticket.venue,
          startDateTime: ticket.start_datetime,
          endDateTime: ticket.end_datetime,
          attendeeName: ticket.attendee_name,
          status: ticket.ticket_status,
          issuedAt: ticket.issued_at,
          checkedInAt: ticket.checked_in_at,
          qrCodeDataUrl: qrCode
        }
      }
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try { await connection.rollback(); } catch { /* Keep the original error. */ }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
}

function parseTicketRequest(req, res) {
  const ticketId = typeof req.body?.ticketId === "string" ? req.body.ticketId.trim() : "";
  const qrCode = typeof req.body?.qrCode === "string" ? req.body.qrCode.trim() : "";
  if ((ticketId && qrCode) || (!ticketId && !qrCode)) {
    sendError(res, 400, "Enter either a ticket ID or the QR code contents.", "INVALID_TICKET_ID");
    return null;
  }

  const value = ticketId || qrCode;
  if (!VALID_UUID.test(value)) {
    sendError(res, 400, "Enter a valid ticket ID or scan a valid ticket QR code.", "INVALID_TICKET_ID");
    return null;
  }

  const eventId = req.body?.eventId;
  if (typeof eventId !== "string" || !VALID_UUID.test(eventId)) {
    sendError(res, 400, "Select a valid event for this check-in.", "INVALID_EVENT_ID");
    return null;
  }
  return { ticketId: value, eventId };
}

const CHECKIN_TICKET_QUERY = `SELECT t.ticket_id, t.registration_id,
       t.ticket_status, t.checked_in_at, t.checked_in_by,
       r.registration_status, r.attendee_id,
       COALESCE(r.attendee_name, u.full_name) AS attendee_name,
       e.event_id, e.title AS event_title, e.venue,
       e.status AS event_status
FROM event_tickets t
JOIN event_registrations r ON r.registration_id = t.registration_id
JOIN users u ON u.user_id = r.attendee_id
JOIN events e ON e.event_id = r.event_id
WHERE t.ticket_id = ?
LIMIT 1`;

function ticketEligibilityError(res, ticket, eventId) {
  if (ticket.event_id !== eventId) {
    return sendError(res, 409, "This ticket belongs to a different event.", "TICKET_EVENT_MISMATCH");
  }
  if (ticket.ticket_status === "REVOKED") {
    return sendError(res, 410, "This ticket has been revoked and cannot be used.", "TICKET_REVOKED");
  }
  if (ticket.ticket_status !== "ACTIVE" || ticket.registration_status !== "CONFIRMED" || ticket.event_status !== "SCHEDULED") {
    return sendError(res, 409, "This ticket is not eligible for this event.", "TICKET_NOT_ELIGIBLE");
  }
  if (ticket.checked_in_at) {
    return sendError(res, 409, "This ticket has already been checked in.", "TICKET_ALREADY_CHECKED_IN");
  }
  return null;
}

async function validateTicket(req, res, next) {
  const parsed = parseTicketRequest(req, res);
  if (!parsed) return;

  try {
    const [tickets] = await pool.execute(CHECKIN_TICKET_QUERY, [parsed.ticketId]);
    if (!tickets.length) {
      return sendError(res, 404, "Ticket not found.", "TICKET_NOT_FOUND");
    }

    const ticket = tickets[0];
    const eligibilityError = ticketEligibilityError(res, ticket, parsed.eventId);
    if (eligibilityError) return eligibilityError;

    return res.status(200).json({
      success: true,
      message: "Ticket is valid for this event.",
      data: {
        ticket: {
          ticketId: ticket.ticket_id,
          registrationId: ticket.registration_id,
          attendeeId: ticket.attendee_id,
          attendeeName: ticket.attendee_name,
          eventId: ticket.event_id,
          eventTitle: ticket.event_title,
          venue: ticket.venue,
          valid: true,
          checkedIn: false
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function checkInTicket(req, res, next) {
  const parsed = parseTicketRequest(req, res);
  if (!parsed) return;

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [tickets] = await connection.execute(
      `${CHECKIN_TICKET_QUERY} FOR UPDATE`,
      [parsed.ticketId]
    );

    if (!tickets.length) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 404, "Ticket not found.", "TICKET_NOT_FOUND");
    }

    const ticket = tickets[0];
    const eligibilityError = ticketEligibilityError(res, ticket, parsed.eventId);
    if (eligibilityError) {
      await connection.rollback();
      transactionStarted = false;
      return eligibilityError;
    }

    const [updated] = await connection.execute(
      `UPDATE event_tickets
       SET checked_in_at = CURRENT_TIMESTAMP, checked_in_by = ?
       WHERE ticket_id = ? AND checked_in_at IS NULL AND ticket_status = 'ACTIVE'`,
      [req.user.id, parsed.ticketId]
    );
    if (!updated.affectedRows) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "This ticket has already been checked in.", "TICKET_ALREADY_CHECKED_IN");
    }
    const [checkInRows] = await connection.execute(
      "SELECT checked_in_at, checked_in_by FROM event_tickets WHERE ticket_id = ?",
      [parsed.ticketId]
    );
    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: "Ticket checked in successfully.",
      data: {
        ticket: {
          ticketId: ticket.ticket_id,
          eventId: ticket.event_id,
          registrationId: ticket.registration_id,
          attendeeId: ticket.attendee_id,
          eventTitle: ticket.event_title,
          venue: ticket.venue,
          attendeeName: ticket.attendee_name,
          checkedIn: true,
          checkedInAt: checkInRows[0].checked_in_at,
          checkedInBy: checkInRows[0].checked_in_by
        }
      }
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try { await connection.rollback(); } catch { /* Keep the original error. */ }
    }
    return next(error);
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { getRegistrationTicket, validateTicket, checkInTicket };

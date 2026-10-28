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

async function checkInTicket(req, res, next) {
  const ticketId = req.body?.ticketId;
  if (typeof ticketId !== "string" || !VALID_UUID.test(ticketId)) {
    return sendError(res, 400, "Enter a valid ticket ID.", "INVALID_TICKET_ID");
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [tickets] = await connection.execute(
      `SELECT t.ticket_id, t.checked_in_at, r.registration_status,
              COALESCE(r.attendee_name, u.full_name) AS attendee_name,
              e.event_id, e.title AS event_title,
              e.venue, e.status AS event_status
       FROM event_tickets t
       JOIN event_registrations r ON r.registration_id = t.registration_id
       JOIN users u ON u.user_id = r.attendee_id
       JOIN events e ON e.event_id = r.event_id
       WHERE t.ticket_id = ?
       LIMIT 1
       FOR UPDATE`,
      [ticketId]
    );

    if (!tickets.length) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 404, "Ticket not found.", "TICKET_NOT_FOUND");
    }

    const ticket = tickets[0];
    if (ticket.registration_status !== "CONFIRMED" || ticket.event_status !== "SCHEDULED") {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "This ticket is not eligible for check-in.", "TICKET_NOT_ELIGIBLE");
    }
    if (ticket.checked_in_at) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "This ticket has already been checked in.", "TICKET_ALREADY_CHECKED_IN");
    }

    const [updated] = await connection.execute(
      `UPDATE event_tickets
       SET checked_in_at = CURRENT_TIMESTAMP
       WHERE ticket_id = ? AND checked_in_at IS NULL`,
      [ticketId]
    );
    if (!updated.affectedRows) {
      await connection.rollback();
      transactionStarted = false;
      return sendError(res, 409, "This ticket has already been checked in.", "TICKET_ALREADY_CHECKED_IN");
    }
    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: "Ticket checked in successfully.",
      data: {
        ticket: {
          ticketId: ticket.ticket_id,
          eventId: ticket.event_id,
          eventTitle: ticket.event_title,
          venue: ticket.venue,
          attendeeName: ticket.attendee_name,
          checkedIn: true
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

module.exports = { getRegistrationTicket, checkInTicket };

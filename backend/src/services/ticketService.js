const { randomUUID } = require("crypto");

const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function issueTicket(connection, registrationId) {
  const [registrations] = await connection.execute(
    `SELECT registration_status
     FROM event_registrations
     WHERE registration_id = ?
     FOR UPDATE`,
    [registrationId]
  );

  if (!registrations.length) {
    const error = new Error("Registration not found.");
    error.code = "REGISTRATION_NOT_FOUND";
    throw error;
  }
  if (registrations[0].registration_status !== "CONFIRMED") {
    const error = new Error("Only confirmed registrations can receive a ticket.");
    error.code = "REGISTRATION_NOT_ELIGIBLE";
    throw error;
  }

  // Ticket IDs are cryptographically random UUIDs and are the only value put
  // in the QR code. Registration and attendee data never enter the QR payload.
  let ticket;
  for (let attempt = 0; attempt < 3 && !ticket; attempt += 1) {
    await connection.execute(
      `INSERT IGNORE INTO event_tickets (ticket_id, registration_id)
       VALUES (?, ?)`,
      [randomUUID(), registrationId]
    );

    const [tickets] = await connection.execute(
      `SELECT t.ticket_id, t.registration_id, t.ticket_status,
              t.issued_at, t.checked_in_at,
              r.event_id, r.attendee_id, r.registration_status,
              COALESCE(r.attendee_name, u.full_name) AS attendee_name,
              e.title AS event_title, e.venue,
              e.start_datetime, e.end_datetime, e.status AS event_status
       FROM event_tickets t
       JOIN event_registrations r ON r.registration_id = t.registration_id
       JOIN users u ON u.user_id = r.attendee_id
       JOIN events e ON e.event_id = r.event_id
       WHERE t.registration_id = ?
       LIMIT 1`,
      [registrationId]
    );
    if (tickets.length) ticket = tickets[0];
  }

  if (!ticket || !VALID_UUID.test(ticket.ticket_id)) {
    throw new Error("Ticket could not be issued.");
  }
  return ticket;
}

module.exports = { issueTicket, VALID_UUID };

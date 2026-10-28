process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../backend/src/config/db");
const { getRegistrationTicket, checkInTicket } = require("../backend/src/controllers/ticketController");

const registrationId = "9d3dba07-c272-4f71-aedd-3fc7f4c3c589";
const attendeeId = "c937d041-7ee8-4b93-b785-f973b37ebba3";
const ticketId = "bc3d6e9e-a172-4846-9d7c-0eb174b938fe";

function responseStub() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function createConnection({ registrationStatus = "CONFIRMED", owned = true, existingTicket = false } = {}) {
  let ticket = existingTicket ? { ticket_id: ticketId, registration_id: registrationId } : null;
  let insertCount = 0;
  let checkedInAt = null;
  const calls = [];
  const connection = {
    calls,
    get insertCount() { return insertCount; },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql, values = []) {
      calls.push(sql);
      if (/SELECT\s+registration_id,\s*registration_status/i.test(sql)) {
        return [[owned ? { registration_id: registrationId, registration_status: registrationStatus } : undefined].filter(Boolean)];
      }
      if (/SELECT\s+registration_status\s+FROM\s+event_registrations/i.test(sql)) {
        return [[owned ? { registration_status: registrationStatus } : undefined].filter(Boolean)];
      }
      if (/INSERT\s+IGNORE\s+INTO\s+event_tickets/i.test(sql)) {
        insertCount += 1;
        if (!ticket) ticket = { ticket_id: values[0], registration_id: values[1] };
        return [{ affectedRows: 1 }];
      }
      if (/FROM\s+event_tickets\s+t/i.test(sql)) {
        return [[ticket ? {
          ...ticket,
          issued_at: "2027-04-01 10:00:00",
          checked_in_at: checkedInAt,
          event_id: "9d3dba07-c272-4f71-aedd-3fc7f4c3c589",
          attendee_id: attendeeId,
          registration_status: registrationStatus,
          attendee_name: "Ticket Holder",
          event_title: "Campus Showcase",
          venue: "Main Hall",
          start_datetime: "2027-04-10 10:00:00",
          end_datetime: "2027-04-10 12:00:00",
          event_status: "SCHEDULED"
        } : undefined].filter(Boolean)];
      }
      if (/SELECT\s+t\.ticket_id,\s*t\.checked_in_at/i.test(sql)) {
        return [[ticket ? {
          ticket_id: ticket.ticket_id,
          checked_in_at: checkedInAt,
          registration_status: registrationStatus,
          attendee_name: "Ticket Holder",
          event_id: registrationId,
          event_title: "Campus Showcase",
          venue: "Main Hall",
          event_status: "SCHEDULED"
        } : undefined].filter(Boolean)];
      }
      if (/UPDATE\s+event_tickets/i.test(sql)) {
        if (checkedInAt) return [{ affectedRows: 0 }];
        checkedInAt = "2027-04-10 09:30:00";
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  return connection;
}

async function invoke(handler, req, connection) {
  const original = pool.getConnection;
  pool.getConnection = async () => connection;
  const res = responseStub();
  let forwardedError;
  try {
    await handler(req, res, error => { forwardedError = error; });
  } finally {
    pool.getConnection = original;
  }
  return { res, forwardedError };
}

test("ticket retrieval issues one unique ticket for a confirmed attendee and returns a local QR code", async () => {
  const connection = createConnection();
  const req = { params: { registrationId }, user: { id: attendeeId } };
  const first = await invoke(getRegistrationTicket, req, connection);
  const second = await invoke(getRegistrationTicket, req, connection);

  assert.equal(first.res.statusCode, 200);
  assert.equal(first.res.body.success, true);
  assert.match(first.res.body.data.ticket.ticketId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  assert.equal(first.res.body.data.ticket.registrationId, registrationId);
  assert.match(first.res.body.data.ticket.qrCodeDataUrl, /^data:image\/png;base64,/);
  assert.equal(second.res.body.data.ticket.ticketId, first.res.body.data.ticket.ticketId);
  assert.equal(connection.insertCount, 2);
  assert.doesNotMatch(first.res.body.data.ticket.qrCodeDataUrl, /Ticket Holder|@/);
});

test("invalid, nonexistent, and ineligible registrations cannot retrieve tickets", async () => {
  const invalid = await invoke(getRegistrationTicket, { params: { registrationId: "bad-id" }, user: { id: attendeeId } }, createConnection());
  assert.equal(invalid.res.statusCode, 400);
  assert.equal(invalid.res.body.code, "INVALID_REGISTRATION_ID");

  const missing = await invoke(getRegistrationTicket, { params: { registrationId }, user: { id: attendeeId } }, createConnection({ owned: false }));
  assert.equal(missing.res.statusCode, 404);

  const cancelled = await invoke(getRegistrationTicket, { params: { registrationId }, user: { id: attendeeId } }, createConnection({ registrationStatus: "CANCELLED" }));
  assert.equal(cancelled.res.statusCode, 409);
  assert.equal(cancelled.res.body.code, "REGISTRATION_NOT_ELIGIBLE");
});

test("staff check-in validates a ticket and prevents a second check-in", async () => {
  const connection = createConnection({ existingTicket: true });
  const req = { body: { ticketId }, user: { id: "staff-id", roles: ["EVENT_STAFF"] } };
  const first = await invoke(checkInTicket, req, connection);
  const second = await invoke(checkInTicket, req, connection);

  assert.equal(first.res.statusCode, 200);
  assert.equal(first.res.body.data.ticket.ticketId, ticketId);
  assert.equal(first.res.body.data.ticket.attendeeName, "Ticket Holder");
  assert.equal(second.res.statusCode, 409);
  assert.equal(second.res.body.code, "TICKET_ALREADY_CHECKED_IN");
});

test("check-in rejects malformed and unknown ticket identifiers", async () => {
  const invalid = await invoke(checkInTicket, { body: { ticketId: "bad-id" } }, createConnection());
  assert.equal(invalid.res.statusCode, 400);
  assert.equal(invalid.res.body.code, "INVALID_TICKET_ID");

  const missing = createConnection();
  missing.execute = async sql => {
    if (/SELECT\s+t\.ticket_id,\s*t\.checked_in_at/i.test(sql)) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const absent = await invoke(checkInTicket, { body: { ticketId } }, missing);
  assert.equal(absent.res.statusCode, 404);
  assert.equal(absent.res.body.code, "TICKET_NOT_FOUND");
});

test("ticket migration enforces one ticket per registration and cascades with registration deletion", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "007_create_event_tickets.sql"), "utf8");
  assert.match(migration, /PRIMARY KEY\s*\(ticket_id\)/i);
  assert.match(migration, /UNIQUE KEY uq_event_tickets_registration\s*\(registration_id\)/i);
  assert.match(migration, /FOREIGN KEY\s*\(registration_id\)\s*REFERENCES event_registrations/i);
  assert.match(migration, /ON DELETE CASCADE/i);
});

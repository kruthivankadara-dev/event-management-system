process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../backend/src/config/db");
const { getEventAttendees } = require("../backend/src/controllers/eventController");

const eventId = "9d3dba07-c272-4f71-aedd-3fc7f4c3c589";
const ownerId = "c937d041-7ee8-4b93-b785-f973b37ebba3";
const otherOrganizerId = "5329c8ae-78b7-4bca-9fe5-cf63033778aa";

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function requestAttendees({
  id = eventId,
  userId = ownerId,
  roles = ["ORGANIZER"],
  eventRows = [{ event_id: eventId, title: "Campus event", created_by: ownerId }],
  attendeeRows = [],
  failure = null
} = {}) {
  const originalExecute = pool.execute;
  const queries = [];
  pool.execute = async (sql, values) => {
    queries.push({ sql, values });
    if (failure) throw failure;
    return queries.length === 1 ? [eventRows] : [attendeeRows];
  };
  const response = makeResponse();
  let forwardedError;
  try {
    await getEventAttendees(
      { params: { id }, user: { id: userId, roles } },
      response,
      error => { forwardedError = error; }
    );
  } finally {
    pool.execute = originalExecute;
  }
  return { response, queries, forwardedError };
}

test("event owner retrieves current registrations with registration and check-in status", async () => {
  const attendee = {
    registration_id: "bc3d6e9e-a172-4846-9d7c-0eb174b938fe",
    attendee_name: "Jordan Lee",
    attendee_email: "jordan@example.com",
    registration_status: "CONFIRMED",
    attendance_status: "CHECKED_IN",
    checked_in_at: "2027-04-10 10:15:00"
  };
  const { response, queries } = await requestAttendees({ attendeeRows: [attendee] });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data.attendees, [attendee]);
  assert.equal(response.body.data.event.event_id, eventId);
  assert.deepEqual(queries.map(query => query.values), [[eventId], [eventId]]);
  assert.match(queries[1].sql, /FROM event_registrations r/);
  assert.match(queries[1].sql, /LEFT JOIN event_tickets/);
  assert.match(queries[1].sql, /registration_status/);
  assert.match(queries[1].sql, /checked_in_at/);
});

test("events with no registrations return a successful empty attendee list", async () => {
  const { response } = await requestAttendees({ attendeeRows: [] });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data.attendees, []);
});

test("invalid event IDs are rejected without a database query", async () => {
  const { response, queries } = await requestAttendees({ id: "bad-id" });
  assert.equal(response.statusCode, 400);
  assert.equal(queries.length, 0);
});

test("missing events return 404 without querying registrations", async () => {
  const { response, queries } = await requestAttendees({ eventRows: [] });
  assert.equal(response.statusCode, 404);
  assert.equal(queries.length, 1);
});

test("organizers cannot retrieve attendee information for another owner's event", async () => {
  const { response, queries } = await requestAttendees({
    userId: otherOrganizerId,
    eventRows: [{ event_id: eventId, title: "Campus event", created_by: ownerId }]
  });
  assert.equal(response.statusCode, 403);
  assert.equal(queries.length, 1);
});

test("admins may retrieve attendee lists for events they do not own", async () => {
  const attendeeRows = [{ registration_id: "reg-1", registration_status: "CONFIRMED", attendance_status: "NOT_CHECKED_IN" }];
  const { response, queries } = await requestAttendees({
    userId: otherOrganizerId,
    roles: ["ADMIN"],
    attendeeRows
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data.attendees, attendeeRows);
  assert.equal(queries.length, 2);
});

test("database failures are forwarded to the existing error middleware", async () => {
  const failure = new Error("database unavailable");
  const { forwardedError, response } = await requestAttendees({ failure });
  assert.equal(forwardedError, failure);
  assert.equal(response.statusCode, null);
});

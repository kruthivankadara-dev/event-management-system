process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../backend/src/config/db");
const { getEventById } = require("../backend/src/controllers/eventController");

const validId = "9d3dba07-c272-4f71-aedd-3fc7f4c3c589";

async function requestEvent(id, rows = [], failure = null) {
  const originalExecute = pool.execute;
  let sql;
  let values;
  pool.execute = async (statement, parameters) => {
    sql = statement;
    values = parameters;
    if (failure) throw failure;
    return [rows];
  };
  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  try {
    let forwardedError;
    await getEventById({ params: { id }, user: { id: "c937d041-7ee8-4b93-b785-f973b37ebba3", roles: ["ATTENDEE"] } }, response, error => { forwardedError = error; });
    return { response, sql, values, forwardedError };
  } finally {
    pool.execute = originalExecute;
  }
}

test("retrieves a scheduled event with capacity and attendee registration status", async () => {
  const event = {
    event_id: validId,
    title: "Campus showcase",
    description: "Student projects",
    venue: "Main Hall",
    start_datetime: "2027-04-10 10:00:00",
    end_datetime: "2027-04-10 12:00:00",
    capacity: 80,
    registration_url: "https://example.com/register",
    status: "SCHEDULED",
    registered_count: 3,
    attendee_registration_status: "CONFIRMED",
    registration_open: 1,
    event_upcoming: 1
  };
  const { response, sql, values } = await requestEvent(validId, [event]);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(values, ["c937d041-7ee8-4b93-b785-f973b37ebba3", validId]);
  assert.match(sql, /e\.event_id = \? AND e\.status = 'SCHEDULED'/);
  assert.equal(response.body.data.event.title, event.title);
  assert.deepEqual(response.body.data.availability, {
    capacity: 80, registeredCount: 3, remaining: 77, status: "AVAILABLE"
  });
  assert.deepEqual(response.body.data.registration, {
    status: "EXTERNAL", url: event.registration_url, attendeeStatus: "CONFIRMED",
    paymentStatus: "PENDING", processingAvailable: false, isOpen: true
  });
  assert.equal(response.body.data.fee, null);
});

test("invalid event IDs return 400 without querying the database", async () => {
  const { response, sql } = await requestEvent("not-an-id");
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, "Invalid event ID.");
  assert.equal(sql, undefined);
});

test("nonexistent, cancelled, and unavailable events return 404", async () => {
  const { response, sql } = await requestEvent(validId);
  assert.equal(response.statusCode, 404);
  assert.match(sql, /status = 'SCHEDULED'/);
});

test("events without an external registration URL report registration as not configured", async () => {
  const event = { event_id: validId, capacity: 10, registration_url: null, status: "SCHEDULED", registered_count: 0, registration_open: 1, event_upcoming: 1 };
  const { response } = await requestEvent(validId, [event]);
  assert.equal(response.body.data.registration.status, "NOT_CONFIGURED");
  assert.equal(response.body.data.registration.url, null);
  assert.equal(response.body.data.registration.attendeeStatus, "NOT_REGISTERED");
});

test("database failures are passed to the existing error middleware", async () => {
  const failure = new Error("database unavailable");
  const { forwardedError } = await requestEvent(validId, [], failure);
  assert.equal(forwardedError, failure);
});

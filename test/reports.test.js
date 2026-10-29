process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../backend/src/config/db");
const { getEventReports, getEventReport } = require("../backend/src/controllers/reportController");

const organizerId = "c937d041-7ee8-4b93-b785-f973b37ebba3";
const otherUserId = "5329c8ae-78b7-4bca-9fe5-cf63033778aa";
const eventId = "9d3dba07-c272-4f71-aedd-3fc7f4c3c589";

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function report(overrides = {}) {
  return {
    event_id: eventId,
    title: "Campus event",
    status: "SCHEDULED",
    start_datetime: "2027-04-10 10:00:00",
    end_datetime: "2027-04-10 12:00:00",
    venue: "Main Hall",
    capacity: 100,
    total_registrations: 5,
    confirmed_registrations: 4,
    cancelled_registrations: 1,
    checked_in_attendees: 3,
    payment_tracked_registrations: 5,
    pending_payments: 2,
    successful_payments: 2,
    failed_payments: 1,
    ...overrides
  };
}

async function requestList({
  query = {},
  user = { id: organizerId, roles: ["ORGANIZER"] },
  rows = [report()],
  failure = null
} = {}) {
  const originalExecute = pool.execute;
  let call;
  pool.execute = async (sql, values) => {
    call = { sql, values };
    if (failure) throw failure;
    return [rows];
  };
  const response = makeResponse();
  let forwardedError;
  try {
    await getEventReports({ query, user }, response, error => { forwardedError = error; });
  } finally {
    pool.execute = originalExecute;
  }
  return { response, call, forwardedError };
}

test("event reports and summary totals match database aggregates", async () => {
  const rows = [
    report(),
    report({ event_id: "bc3d6e9e-a172-4846-9d7c-0eb174b938fe", total_registrations: 2, confirmed_registrations: 2, cancelled_registrations: 0, checked_in_attendees: 1, payment_tracked_registrations: 2, pending_payments: 1, successful_payments: 1, failed_payments: 0 })
  ];
  const { response } = await requestList({ rows });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.events.length, 2);
  assert.deepEqual(response.body.data.summary, {
    event_count: 2,
    total_registrations: 7,
    confirmed_registrations: 6,
    cancelled_registrations: 1,
    checked_in_attendees: 4,
    payment_tracked_registrations: 7,
    pending_payments: 3,
    successful_payments: 3,
    failed_payments: 1
  });
  assert.equal(response.body.data.events[0].capacity, 100);
});

test("organizer reports are scoped to owned events and support valid filters", async () => {
  const { response, call } = await requestList({ query: { from: "2027-04-01", to: "2027-04-30", status: "SCHEDULED" } });
  assert.equal(response.statusCode, 200);
  assert.match(call.sql, /e\.created_by = \?/);
  assert.match(call.sql, /e\.start_datetime >= \?/);
  assert.match(call.sql, /DATE_ADD\(\?, INTERVAL 1 DAY\)/);
  assert.deepEqual(call.values, [organizerId, "2027-04-01 00:00:00", "2027-04-30 00:00:00", "SCHEDULED"]);
});

test("admin reports are system-wide without an organizer filter", async () => {
  const { response, call } = await requestList({ user: { id: otherUserId, roles: ["ADMIN"] } });
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(call.sql, /e\.created_by = \?/);
  assert.deepEqual(call.values, []);
});

test("empty datasets return zero totals", async () => {
  const { response } = await requestList({ rows: [] });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data.summary, {
    event_count: 0,
    total_registrations: 0,
    confirmed_registrations: 0,
    cancelled_registrations: 0,
    checked_in_attendees: 0,
    payment_tracked_registrations: 0,
    pending_payments: 0,
    successful_payments: 0,
    failed_payments: 0
  });
  assert.deepEqual(response.body.data.events, []);
});

test("invalid report filters are rejected without querying the database", async () => {
  for (const query of [
    { from: "2027-02-30" },
    { status: "UNKNOWN" },
    { from: "2027-05-01", to: "2027-04-01" },
    { ignored: "value" }
  ]) {
    const { response, call } = await requestList({ query });
    assert.equal(response.statusCode, 400);
    assert.equal(call, undefined);
  }
});

test("report query database errors are forwarded", async () => {
  const failure = new Error("database unavailable");
  const { forwardedError } = await requestList({ failure });
  assert.equal(forwardedError, failure);
});

async function requestOneEvent({
  id = eventId,
  user = { id: organizerId, roles: ["ORGANIZER"] },
  eventRows = [{ event_id: eventId, created_by: organizerId }],
  rows = [report()],
  failure = null
} = {}) {
  const originalExecute = pool.execute;
  const calls = [];
  pool.execute = async (sql, values) => {
    calls.push({ sql, values });
    if (failure) throw failure;
    return calls.length === 1 ? [eventRows] : [rows];
  };
  const response = makeResponse();
  let forwardedError;
  try {
    await getEventReport({ params: { eventId: id }, user }, response, error => { forwardedError = error; });
  } finally {
    pool.execute = originalExecute;
  }
  return { response, calls, forwardedError };
}

test("single-event report is available to its owner", async () => {
  const { response, calls } = await requestOneEvent();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.event.total_registrations, 5);
  assert.deepEqual(calls[1].values, [eventId]);
});

test("organizer cannot retrieve another owner's event report", async () => {
  const { response, calls } = await requestOneEvent({
    user: { id: otherUserId, roles: ["ORGANIZER"] }
  });
  assert.equal(response.statusCode, 403);
  assert.equal(calls.length, 1);
});

test("invalid and missing event IDs return the expected statuses", async () => {
  const invalid = await requestOneEvent({ id: "not-an-id" });
  const missing = await requestOneEvent({ eventRows: [] });
  assert.equal(invalid.response.statusCode, 400);
  assert.equal(invalid.calls.length, 0);
  assert.equal(missing.response.statusCode, 404);
  assert.equal(missing.calls.length, 1);
});

test("single-event report database errors are forwarded", async () => {
  const failure = new Error("database unavailable");
  const { forwardedError } = await requestOneEvent({ failure });
  assert.equal(forwardedError, failure);
});

process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../backend/src/config/db");
const service = require("../backend/src/services/notificationService");
const { listMine, markMineRead, sendReminder } = require("../backend/src/controllers/notificationController");
const { authenticateToken } = require("../backend/src/middleware/authMiddleware");

const userA = "c937d041-7ee8-4b93-b785-f973b37ebba3";
const userB = "5329c8ae-78b7-4bca-9fe5-cf63033778aa";
const eventId = "9d3dba07-c272-4f71-aedd-3fc7f4c3c589";

function responseHarness() {
  return { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("postponement and cancellation notifications target confirmed attendees only", async () => {
  const originalExecute = pool.execute;
  const calls = [];
  pool.execute = async (sql, values) => {
    calls.push({ sql, values });
    if (/SELECT DISTINCT attendee_id/i.test(sql)) return [[{ attendee_id: userA, registration_id: "reg-a" }, { attendee_id: userB, registration_id: "reg-b" }]];
    return [{ affectedRows: 2 }];
  };
  try {
    const event = { event_id: eventId, title: "Showcase", start_datetime: "2027-04-10 10:00:00", venue: "Main Hall" };
    assert.equal(await service.notifyEventAttendees({ event, type: "EVENT_POSTPONED", title: "Changed", prefix: "Rescheduled", revision: "new schedule" }), 2);
    assert.equal(await service.notifyEventAttendees({ event, type: "EVENT_CANCELLED", title: "Cancelled", prefix: "Cancelled", revision: "cancelled" }), 2);
    assert.match(calls[0].sql, /registration_status = 'CONFIRMED'/);
    const insertValues = calls[1].values;
    assert.ok(insertValues.includes(userA) && insertValues.includes(userB));
    assert.ok(insertValues.includes("EVENT_POSTPONED"));
    const message = insertValues[6];
    assert.match(message, /2027-04-10 10:00/);
    assert.match(message, /Main Hall/);
  } finally { pool.execute = originalExecute; }
});

test("duplicate triggers are idempotent with stable keys and INSERT IGNORE", async () => {
  const originalExecute = pool.execute;
  const inserts = [];
  pool.execute = async (sql, values) => {
    if (/SELECT DISTINCT attendee_id/i.test(sql)) return [[{ attendee_id: userA, registration_id: "reg-a" }]];
    inserts.push({ sql, values });
    return [{ affectedRows: 0 }];
  };
  try {
    const event = { event_id: eventId, title: "Showcase", start_datetime: "2027-04-10 10:00:00", venue: "Hall" };
    await service.notifyEventAttendees({ event, type: "EVENT_CANCELLED", title: "Cancelled", prefix: "Cancelled", revision: "cancelled" });
    await service.notifyEventAttendees({ event, type: "EVENT_CANCELLED", title: "Cancelled", prefix: "Cancelled", revision: "cancelled" });
    assert.match(inserts[0].sql, /INSERT IGNORE/);
    assert.equal(inserts[0].values[7], inserts[1].values[7]);
  } finally { pool.execute = originalExecute; }
});

test("notification listing is scoped to the authenticated recipient", async () => {
  const originalExecute = pool.execute;
  let query;
  pool.execute = async (sql, values) => { query = { sql, values }; return [[{ notification_id: "n1" }]]; };
  const response = responseHarness();
  try {
    await listMine({ user: { id: userA }, query: {} }, response, error => { throw error; });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(query.values, [userA, 50]);
    assert.match(query.sql, /WHERE recipient_id = \?/);
  } finally { pool.execute = originalExecute; }
});

test("a notification belonging to another user cannot be marked read", async () => {
  const originalExecute = pool.execute;
  let parameters;
  const notificationId = "5a96ab48-ed49-49bd-9de6-f2f76463d947";
  pool.execute = async (_sql, values) => { parameters = values; return [{ affectedRows: 0 }]; };
  const response = responseHarness();
  try {
    await markMineRead({ user: { id: userA }, params: { id: notificationId } }, response, error => { throw error; });
    assert.deepEqual(parameters, [notificationId, userA]);
    assert.equal(response.statusCode, 404);
  } finally { pool.execute = originalExecute; }
});

test("notification service errors propagate so callers can isolate delivery failure", async () => {
  const originalExecute = pool.execute;
  const failure = new Error("database unavailable");
  pool.execute = async () => { throw failure; };
  try {
    await assert.rejects(service.notifyRegistration({ recipientId: userA, registrationId: "reg1", event: { event_id: eventId, title: "Event", start_datetime: "2027-04-10 10:00:00", venue: "Hall" } }), failure);
  } finally { pool.execute = originalExecute; }
});

test("unauthenticated notification request is rejected by existing auth middleware", () => {
  const response = responseHarness();
  let passed = false;
  authenticateToken({ headers: {} }, response, () => { passed = true; });
  assert.equal(response.statusCode, 401);
  assert.equal(passed, false);
});

test("reminder action reports database unavailability safely", async () => {
  const originalExecute = pool.execute;
  pool.execute = async () => { throw new Error("database unavailable"); };
  const response = responseHarness();
  let forwarded;
  try {
    await sendReminder({ params: { eventId }, user: { id: userA, roles: ["ORGANIZER"] } }, response, error => { forwarded = error; });
    assert.equal(forwarded.message, "database unavailable");
  } finally { pool.execute = originalExecute; }
});

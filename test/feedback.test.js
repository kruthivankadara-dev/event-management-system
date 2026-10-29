process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../backend/src/config/db");
const { submitFeedback, getEventFeedback } = require("../backend/src/controllers/feedbackController");

const eventId = "9d3dba07-c272-4f71-aedd-3fc7f4c3c589";
const attendeeId = "c937d041-7ee8-4b93-b785-f973b37ebba3";
const organizerId = "5329c8ae-78b7-4bca-9fe5-cf63033778aa";
const registrationId = "bc3d6e9e-a172-4846-9d7c-0eb174b938fe";

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function submitRequest({
  id = eventId,
  body = { rating: 5, comment: "Great event" },
  user = { id: attendeeId, roles: ["ATTENDEE"] },
  eligibility = [{ event_id: eventId, title: "Completed event", status: "SCHEDULED", event_completed: 1, registration_id: registrationId, registration_status: "CONFIRMED" }],
  insertFailure = null,
  databaseFailure = null
} = {}) {
  const originalExecute = pool.execute;
  const queries = [];
  pool.execute = async (sql, values) => {
    queries.push({ sql, values });
    if (databaseFailure) throw databaseFailure;
    if (queries.length === 1) return [eligibility];
    if (insertFailure) throw insertFailure;
    return [{ affectedRows: 1 }];
  };
  const response = makeResponse();
  let forwardedError;
  try {
    await submitFeedback({ params: { id }, body, user }, response, error => { forwardedError = error; });
  } finally {
    pool.execute = originalExecute;
  }
  return { response, queries, forwardedError };
}

test("eligible registered attendee submits a rating and comment", async () => {
  const { response, queries } = await submitRequest();
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.feedback.rating, 5);
  assert.equal(response.body.data.feedback.comment, "Great event");
  assert.deepEqual(queries[1].values.slice(1), [eventId, attendeeId, registrationId, 5, "Great event"]);
  assert.match(queries[1].sql, /INSERT INTO event_feedback/);
});

test("rating must be an integer from 1 through 5", async () => {
  for (const rating of [0, 6, 2.5, "invalid"]) {
    const { response, queries } = await submitRequest({ body: { rating } });
    assert.equal(response.statusCode, 400, `rating ${rating} should fail validation`);
    assert.equal(queries.length, 0);
  }
});

test("rating is required and comments are length-limited", async () => {
  const missing = await submitRequest({ body: { comment: "No rating" } });
  const tooLong = await submitRequest({ body: { rating: 4, comment: "x".repeat(2001) } });
  assert.equal(missing.response.statusCode, 400);
  assert.equal(tooLong.response.statusCode, 400);
});

test("invalid event IDs and nonexistent events return client-safe errors", async () => {
  const invalid = await submitRequest({ id: "bad-id" });
  const missing = await submitRequest({ eligibility: [] });
  assert.equal(invalid.response.statusCode, 400);
  assert.equal(invalid.queries.length, 0);
  assert.equal(missing.response.statusCode, 404);
});

test("unregistered and cancelled-event attendees cannot submit feedback", async () => {
  const unregistered = await submitRequest({ eligibility: [{ event_id: eventId, status: "SCHEDULED", event_completed: 1, registration_status: null }] });
  const cancelled = await submitRequest({ eligibility: [{ event_id: eventId, status: "CANCELLED", event_completed: 1, registration_id: registrationId, registration_status: "CONFIRMED" }] });
  assert.equal(unregistered.response.statusCode, 403);
  assert.equal(unregistered.response.body.code, "INELIGIBLE_ATTENDEE");
  assert.equal(cancelled.response.statusCode, 409);
  assert.equal(cancelled.response.body.code, "EVENT_UNAVAILABLE");
});

test("feedback is unavailable before the registered event ends", async () => {
  const { response, queries } = await submitRequest({
    eligibility: [{ event_id: eventId, status: "SCHEDULED", event_completed: 0, registration_id: registrationId, registration_status: "CONFIRMED" }]
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "EVENT_NOT_COMPLETED");
  assert.equal(queries.length, 1);
});

test("duplicate feedback is rejected by the database uniqueness constraint", async () => {
  const duplicate = new Error("duplicate");
  duplicate.code = "ER_DUP_ENTRY";
  const { response } = await submitRequest({ insertFailure: duplicate });
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "FEEDBACK_ALREADY_SUBMITTED");
});

test("feedback database failures are forwarded to safe error handling", async () => {
  const failure = new Error("database unavailable");
  const { forwardedError, response } = await submitRequest({ databaseFailure: failure });
  assert.equal(forwardedError, failure);
  assert.equal(response.statusCode, null);
});

async function retrieveFeedback({
  user = { id: attendeeId, roles: ["ATTENDEE"] },
  eventRows = [{ event_id: eventId, title: "Completed event", created_by: organizerId }],
  feedbackRows = [],
  failure = null
} = {}) {
  const originalExecute = pool.execute;
  const queries = [];
  pool.execute = async (sql, values) => {
    queries.push({ sql, values });
    if (failure) throw failure;
    return queries.length === 1 ? [eventRows] : [feedbackRows];
  };
  const response = makeResponse();
  let forwardedError;
  try {
    await getEventFeedback({ params: { id: eventId }, user }, response, error => { forwardedError = error; });
  } finally {
    pool.execute = originalExecute;
  }
  return { response, queries, forwardedError };
}

test("attendee feedback retrieval is restricted to that attendee", async () => {
  const ownFeedback = [{ feedback_id: "feedback-id", rating: 4, comment: "Good" }];
  const { response, queries } = await retrieveFeedback({ feedbackRows: ownFeedback });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data.feedback, ownFeedback);
  assert.match(queries[1].sql, /f\.attendee_id = \?/);
  assert.deepEqual(queries[1].values, [eventId, attendeeId]);
});

test("event owner may retrieve feedback while another organizer may not", async () => {
  const own = await retrieveFeedback({ user: { id: organizerId, roles: ["ORGANIZER"] } });
  const other = await retrieveFeedback({ user: { id: attendeeId, roles: ["ORGANIZER"] } });
  assert.equal(own.response.statusCode, 200);
  assert.equal(own.queries.length, 2);
  assert.equal(other.response.statusCode, 403);
  assert.equal(other.queries.length, 1);
});

test("admin may retrieve event feedback regardless of event ownership", async () => {
  const { response, queries } = await retrieveFeedback({ user: { id: attendeeId, roles: ["ADMIN"] } });
  assert.equal(response.statusCode, 200);
  assert.equal(queries.length, 2);
  assert.doesNotMatch(queries[1].sql, /f\.attendee_id = \?/);
});

test("feedback retrieval reports missing events and database failures", async () => {
  const missing = await retrieveFeedback({ eventRows: [] });
  const failure = new Error("database unavailable");
  const unavailable = await retrieveFeedback({ failure });
  assert.equal(missing.response.statusCode, 404);
  assert.equal(missing.queries.length, 1);
  assert.equal(unavailable.forwardedError, failure);
});

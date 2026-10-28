process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "event-route-test-secret";
const app = require("../backend/src/app");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())
    );
  }
});

test("event creation requires authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 401);
});

test("attendees cannot create events", async () => {
  const token = jwt.sign(
    { sub: "user-id", roles: ["ATTENDEE"] },
    process.env.JWT_SECRET
  );

  const response = await fetch(`${baseUrl}/api/v1/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 403);
});

test("authorized event creators receive validation errors before persistence", async () => {
  const token = jwt.sign(
    { sub: "user-id", roles: ["ORGANIZER"] },
    process.env.JWT_SECRET
  );

  const response = await fetch(`${baseUrl}/api/v1/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({})
  });

  const result = await response.json();

  assert.equal(response.status, 400);
  assert.equal(result.success, false);
  assert.ok(Array.isArray(result.errors));
});


test("attendees cannot update events", async () => {
  const token = jwt.sign(
    { sub: "user-id", roles: ["ATTENDEE"] },
    process.env.JWT_SECRET
  );

  const response = await fetch(`${baseUrl}/api/v1/events/test-event-id`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 403);
});

test("attendees cannot cancel events", async () => {
  const token = jwt.sign(
    { sub: "user-id", roles: ["ATTENDEE"] },
    process.env.JWT_SECRET
  );

  const response = await fetch(
    `${baseUrl}/api/v1/events/test-event-id/cancel`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  assert.equal(response.status, 403);
});

test("updating an event requires authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/events/test-event-id`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 401);
});

test("cancelling an event requires authentication", async () => {
  const response = await fetch(
    `${baseUrl}/api/v1/events/test-event-id/cancel`,
    { method: "PATCH" }
  );

  assert.equal(response.status, 401);
});


test("event details require authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/events/9d3dba07-c272-4f71-aedd-3fc7f4c3c589`);
  assert.equal(response.status, 401);
});

test("event registration requires authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/events/9d3dba07-c272-4f71-aedd-3fc7f4c3c589/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 401);
});

test("event registration is restricted to attendees", async () => {
  const token = jwt.sign(
    { sub: "organizer-id", roles: ["ORGANIZER"] },
    process.env.JWT_SECRET
  );

  const response = await fetch(`${baseUrl}/api/v1/events/9d3dba07-c272-4f71-aedd-3fc7f4c3c589/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: "{}"
  });

  assert.equal(response.status, 403);
});

test("event registration validates the event ID", async () => {
  const token = jwt.sign(
    { sub: "attendee-id", roles: ["ATTENDEE"] },
    process.env.JWT_SECRET
  );

  const response = await fetch(`${baseUrl}/api/v1/events/not-an-id/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: "{}"
  });
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.code, "INVALID_EVENT_ID");
});

test("event registration rejects malformed JSON with a client error", async () => {
  const token = jwt.sign(
    { sub: "attendee-id", roles: ["ATTENDEE"] },
    process.env.JWT_SECRET
  );

  const response = await fetch(`${baseUrl}/api/v1/events/9d3dba07-c272-4f71-aedd-3fc7f4c3c589/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: "{invalid-json"
  });
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.message, "Request body must contain valid JSON.");
});

test("payment status requires authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/payments/registrations/9d3dba07-c272-4f71-aedd-3fc7f4c3c589`);
  assert.equal(response.status, 401);
});

test("payment status is restricted to attendees", async () => {
  const token = jwt.sign({ sub: "organizer-id", roles: ["ORGANIZER"] }, process.env.JWT_SECRET);
  const response = await fetch(`${baseUrl}/api/v1/payments/registrations/9d3dba07-c272-4f71-aedd-3fc7f4c3c589`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 403);
});

test("payment processing requires authentication and has no client status update route", async () => {
  const response = await fetch(`${baseUrl}/api/v1/payments/registrations/9d3dba07-c272-4f71-aedd-3fc7f4c3c589/process`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "SUCCESSFUL" })
  });
  assert.equal(response.status, 401);
});

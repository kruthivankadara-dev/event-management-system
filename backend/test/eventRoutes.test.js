const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "event-route-test-secret";
const app = require("../src/app");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
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
  const token = jwt.sign({ sub: "user-id", roles: ["ATTENDEE"] }, process.env.JWT_SECRET);
  const response = await fetch(`${baseUrl}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({})
  });
  assert.equal(response.status, 403);
});

test("authorized event creators receive validation errors before persistence", async () => {
  const token = jwt.sign({ sub: "user-id", roles: ["ORGANIZER"] }, process.env.JWT_SECRET);
  const response = await fetch(`${baseUrl}/api/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({})
  });
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.success, false);
  assert.ok(Array.isArray(result.errors));
});

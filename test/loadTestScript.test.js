const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scriptPath = path.join(__dirname, "..", "load-tests", "event-management.js");
const script = fs.readFileSync(scriptPath, "utf8");

test("k6 uses the isolated dataset's per-VU accounts and environment-provided password", () => {
  assert.match(script, /const userPrefix = __ENV\.LOAD_USER_PREFIX;/);
  assert.match(script, /const userDomain = __ENV\.LOAD_USER_DOMAIN;/);
  assert.match(script, /const userPassword = __ENV\.LOAD_USER_PASSWORD;/);
  assert.match(script, /const email = `\$\{userPrefix\}\$\{__VU\}@\$\{userDomain\}`;/);
  assert.match(script, /JSON\.stringify\(\{ email, password: userPassword \}\)/);
  assert.match(script, /typeof token === "string" && token\.length > 0/);
});

test("k6 uses the generated event ID from the environment, never a fixed ID", () => {
  assert.match(script, /const eventId = __ENV\.LOAD_EVENT_ID;/);
  assert.match(script, /encodeURIComponent\(eventId\)/);
  assert.doesNotMatch(script, /const eventId\s*=\s*["'][0-9a-f-]{36}["']/i);
  assert.match(script, /detailsBody\?\.data\?\.event\?\.event_id === eventId/);
});

test("k6 includes all requested VU stages and representative operation thresholds", () => {
  assert.match(script, /const supportedStages = \[1,\s*50,\s*100,\s*250,\s*500\]/);
  for (const operation of [
    "authentication_duration",
    "event_search_duration",
    "event_details_duration",
    "registration_duration"
  ]) {
    assert.match(script, new RegExp(`${operation}: \\["p\\(95\\)<=3000"\\]`));
  }
  assert.match(script, /http_req_failed: \["rate<0\.01"\]/);
  assert.match(script, /unexpected_response_rate: \["rate<0\.01"\]/);
  assert.match(script, /registration_unexpected_response_rate: \["rate<0\.01"\]/);
  assert.match(script, /\/auth\/login/);
  assert.match(script, /\/events\?q=load-test/);
  assert.match(script, /\/events\/\$\{encodeURIComponent\(eventId\)\}\/register/);
});

test("unexpected responses validate endpoint JSON contracts without logging response data", () => {
  assert.match(script, /loginBody\?\.success === true/);
  assert.match(script, /Array\.isArray\(searchBody\?\.data\?\.events\)/);
  assert.match(script, /detailsBody\?\.data\?\.event\?\.event_id === eventId/);
  assert.match(script, /registrationBody\?\.data\?\.registration\?\.registration_status === "CONFIRMED"/);
  assert.match(script, /registrationBody\?\.data\?\.ticket\?\.ticketId/);
  assert.doesNotMatch(script, /console\.(?:log|info|debug)\s*\(/);
  assert.doesNotMatch(script, /console\.error\s*\(/);
  assert.doesNotMatch(script, /JSON\.stringify\((?:login|search|details|registration)(?:Body|\.body)/);
});

test("k6 staggers initial logins and reuses each VU's authenticated session", () => {
  assert.match(script, /let accessToken = null;/);
  assert.match(script, /if \(!accessToken\) \{/);
  assert.match(script, /sleep\(\(__VU - 1\) \* 0\.1\);/);
  assert.match(script, /accessToken = token;/);
  assert.match(script, /Authorization: `Bearer \$\{accessToken\}`/);
});

test("registration responses have a per-operation failure-rate threshold", () => {
  assert.match(script, /const registrationUnexpectedResponseRate = new Rate\("registration_unexpected_response_rate"\);/);
  assert.match(script, /registrationUnexpectedResponseRate\.add\(/);
});

process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../backend/src/config/db");
const { registerForEvent } = require("../backend/src/controllers/registrationController");

const eventId = "9d3dba07-c272-4f71-aedd-3fc7f4c3c589";
const attendeeOne = "c937d041-7ee8-4b93-b785-f973b37ebba3";
const attendeeTwo = "5329c8ae-78b7-4bca-9fe5-cf63033778aa";
const defaultEvent = {
  event_id: eventId,
  title: "Campus showcase",
  status: "SCHEDULED",
  capacity: 2,
  registration_open: 1,
  event_upcoming: 1
};

function createHarness({
  event = { ...defaultEvent },
  registrations = [],
  failOnInsert = null
} = {}) {
  const storedRegistrations = registrations.map(row => ({ ...row }));
  const executedSql = [];
  let locked = false;
  const waiters = [];
  const acquireEventLock = async () => {
    if (!locked) {
      locked = true;
      return;
    }
    await new Promise(resolve => waiters.push(resolve));
  };
  const releaseEventLock = () => {
    const next = waiters.shift();
    if (next) next();
    else locked = false;
  };

  return {
    storedRegistrations,
    event,
    executedSql,
    connectionsRequested: 0,
    async getConnection() {
      this.connectionsRequested += 1;
      let ownsLock = false;
      const release = () => {
        if (!ownsLock) return;
        ownsLock = false;
        releaseEventLock();
      };
      return {
        async beginTransaction() {},
        async execute(sql, values = []) {
          executedSql.push(sql);
          if (/FROM events[\s\S]*FOR UPDATE/.test(sql)) {
            await acquireEventLock();
            ownsLock = true;
            return [event ? [{ ...event }] : []];
          }
          if (/SELECT COUNT\(\*\) AS registered_count/.test(sql)) {
            return [[{
              registered_count: storedRegistrations.filter(row =>
                row.event_id === values[0] && row.registration_status === "CONFIRMED"
              ).length
            }]];
          }
          if (/INSERT INTO event_registrations/.test(sql)) {
            if (failOnInsert) throw failOnInsert;
            const row = {
              registration_id: values[0],
              event_id: values[1],
              attendee_id: values[2],
              registration_status: "CONFIRMED",
              registered_at: "2027-04-01 10:00:00",
              updated_at: "2027-04-01 10:00:00"
            };
            if (storedRegistrations.some(existing =>
              existing.event_id === row.event_id && existing.attendee_id === row.attendee_id
            )) {
              const duplicate = new Error("duplicate registration");
              duplicate.code = "ER_DUP_ENTRY";
              throw duplicate;
            }
            storedRegistrations.push(row);
            return [{ affectedRows: 1 }];
          }
          if (/SELECT registration_id, event_id, attendee_id/.test(sql)) {
            return [storedRegistrations.filter(row => row.registration_id === values[0])];
          }
          if (/SELECT registration_id[\s\S]*FROM event_registrations/.test(sql)) {
            return [storedRegistrations.filter(row =>
              row.event_id === values[0] && row.attendee_id === values[1]
            )];
          }
          throw new Error(`Unexpected SQL in test: ${sql}`);
        },
        async commit() { release(); },
        async rollback() { release(); },
        release() { release(); }
      };
    }
  };
}

async function requestRegistration({
  id = eventId,
  attendeeId = attendeeOne,
  body = {},
  roles = ["ATTENDEE"],
  harness = createHarness()
} = {}) {
  const originalGetConnection = pool.getConnection;
  pool.getConnection = harness.getConnection.bind(harness);
  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  let forwardedError;

  try {
    await registerForEvent(
      { params: { id }, body, user: { id: attendeeId, roles } },
      response,
      error => { forwardedError = error; }
    );
  } finally {
    pool.getConnection = originalGetConnection;
  }

  return { response, forwardedError, harness };
}

test("attendee registration persists and returns a confirmed registration", async () => {
  const harness = createHarness({ event: { ...defaultEvent, capacity: 2 } });
  const { response } = await requestRegistration({ harness });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.registration.event_id, eventId);
  assert.equal(response.body.data.registration.attendee_id, attendeeOne);
  assert.equal(response.body.data.registration.registration_status, "CONFIRMED");
  assert.equal(harness.storedRegistrations.length, 1);
  assert.ok(harness.executedSql.some(sql => /FOR UPDATE/.test(sql)));
  assert.ok(harness.executedSql.some(sql => /COUNT\(\*\)/.test(sql)));
  assert.deepEqual(response.body.data.availability, {
    capacity: 2, registeredCount: 1, remaining: 1, status: "AVAILABLE"
  });
});

test("invalid event IDs and invalid request payloads are rejected before database access", async () => {
  const harness = createHarness();
  const badId = await requestRegistration({ id: "bad-id", harness });
  const badBody = await requestRegistration({ body: { note: "please register" }, harness });
  assert.equal(badId.response.statusCode, 400);
  assert.equal(badBody.response.statusCode, 400);
  assert.equal(harness.connectionsRequested, 0);
});

test("invalid authenticated attendee IDs are rejected", async () => {
  const harness = createHarness();
  const { response } = await requestRegistration({ attendeeId: "not-a-user-id", harness });
  assert.equal(response.statusCode, 401);
  assert.equal(harness.connectionsRequested, 0);
});

test("missing events are reported as not found", async () => {
  const { response } = await requestRegistration({ harness: createHarness({ event: null }) });
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.code, "EVENT_NOT_FOUND");
});

test("cancelled, closed, and already-started events cannot be registered", async t => {
  const cases = [
    { name: "cancelled", event: { status: "CANCELLED", registration_open: 1, event_upcoming: 1 } },
    { name: "postponed", event: { status: "POSTPONED", registration_open: 1, event_upcoming: 1 } },
    { name: "unpublished", event: { status: "DRAFT", registration_open: 1, event_upcoming: 1 } },
    { name: "past deadline", event: { status: "SCHEDULED", registration_open: 0, event_upcoming: 1 } },
    { name: "already started", event: { status: "SCHEDULED", registration_open: 1, event_upcoming: 0 } }
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      const event = { ...defaultEvent, ...item.event };
      const { response, harness } = await requestRegistration({ harness: createHarness({ event }) });
      assert.equal(response.statusCode, 409);
      assert.equal(harness.storedRegistrations.length, 0);
    });
  }
});

test("a duplicate attendee/event registration is rejected", async () => {
  const existing = {
    registration_id: "bc3d6e9e-a172-4846-9d7c-0eb174b938fe",
    event_id: eventId,
    attendee_id: attendeeOne,
    registration_status: "CONFIRMED"
  };
  const harness = createHarness({ registrations: [existing] });
  const { response } = await requestRegistration({ harness });
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "ALREADY_REGISTERED");
  assert.equal(harness.storedRegistrations.length, 1);
});

test("event capacity is enforced", async () => {
  const harness = createHarness({
    event: { ...defaultEvent, capacity: 1 },
    registrations: [{ event_id: eventId, attendee_id: attendeeTwo, registration_status: "CONFIRMED" }]
  });
  const { response } = await requestRegistration({ harness });
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "EVENT_FULL");
});

test("concurrent requests at the final place cannot exceed capacity", async () => {
  const harness = createHarness({ event: { ...defaultEvent, capacity: 1 } });
  const originalGetConnection = pool.getConnection;
  pool.getConnection = harness.getConnection.bind(harness);
  const submit = async attendeeId => {
    const response = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; }
    };
    await registerForEvent(
      { params: { id: eventId }, body: {}, user: { id: attendeeId, roles: ["ATTENDEE"] } },
      response,
      error => { throw error; }
    );
    return { response };
  };
  let results;
  try {
    results = await Promise.all([submit(attendeeOne), submit(attendeeTwo)]);
  } finally {
    pool.getConnection = originalGetConnection;
  }

  assert.deepEqual(results.map(result => result.response.statusCode).sort(), [201, 409]);
  assert.equal(harness.storedRegistrations.length, 1);
});

test("database errors are forwarded after rolling back", async () => {
  const failure = new Error("database unavailable");
  const { forwardedError } = await requestRegistration({ harness: createHarness({ failOnInsert: failure }) });
  assert.equal(forwardedError, failure);
});

test("registration migration defines unique, foreign-keyed InnoDB records", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "database", "migrations", "004_create_event_registrations.sql"),
    "utf8"
  );
  assert.match(migration, /UNIQUE KEY uq_event_registrations_event_attendee \(event_id, attendee_id\)/);
  assert.match(migration, /FOREIGN KEY \(event_id\) REFERENCES events\(event_id\)/);
  assert.match(migration, /FOREIGN KEY \(attendee_id\) REFERENCES users\(user_id\)/);
  assert.match(migration, /ENGINE=InnoDB/i);
});

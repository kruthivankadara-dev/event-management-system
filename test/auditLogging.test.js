process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const app = require("../backend/src/app");
const pool = require("../backend/src/config/db");
const { assignRole } = require("../backend/src/controllers/authController");
const { createEvent } = require("../backend/src/controllers/eventController");
const { sanitizeMetadata } = require("../backend/src/services/auditLogService");

const actorId = "c937d041-7ee8-4b93-b785-f973b37ebba3";

function responseStub() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function validEvent() {
  return {
    title: "Campus showcase",
    description: "Contact attendee@example.com for details",
    category: "Community",
    venue: "Main Hall",
    startDateTime: "2027-04-10T10:00",
    endDateTime: "2027-04-10T12:00",
    capacity: 80,
    registrationDeadline: "2027-04-09T10:00",
    imageUrl: "",
    registrationUrl: "https://example.com/register?token=private-value"
  };
}

async function runCreateEvent({ failAudit = false, failInsert = false } = {}) {
  const originalGetConnection = pool.getConnection;
  const statements = [];
  let committed = false;
  let rolledBack = false;
  let released = false;

  const connection = {
    async beginTransaction() {},
    async execute(sql, values = []) {
      statements.push({ sql, values });
      if (/INSERT INTO events/i.test(sql)) {
        if (failInsert) throw failInsert;
        return [{ affectedRows: 1 }];
      }
      if (/SELECT event_id, title/i.test(sql)) {
        return [[{ event_id: values[0], title: "Campus showcase" }]];
      }
      if (/INSERT INTO admin_audit_logs/i.test(sql)) {
        if (failAudit) throw failAudit;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL in audit test: ${sql}`);
    },
    async commit() {
      committed = true;
    },
    async rollback() {
      rolledBack = true;
    },
    release() {
      released = true;
    }
  };

  pool.getConnection = async () => connection;
  const response = responseStub();
  let forwardedError;

  try {
    await createEvent(
      { body: validEvent(), user: { id: actorId } },
      response,
      error => {
        forwardedError = error;
      }
    );
  } finally {
    pool.getConnection = originalGetConnection;
  }

  return {
    response,
    statements,
    committed,
    rolledBack,
    released,
    forwardedError
  };
}

async function runAssignRole({ affectedRows = 1, failAudit = false } = {}) {
  const originalGetConnection = pool.getConnection;
  const statements = [];
  let committed = false;
  let rolledBack = false;
  const targetUserId = "5329c8ae-78b7-4bca-9fe5-cf63033778aa";

  const connection = {
    async beginTransaction() {},
    async execute(sql, values = []) {
      statements.push({ sql, values });
      if (/SELECT user_id FROM users/i.test(sql)) {
        return [[{ user_id: targetUserId }]];
      }
      if (/SELECT role_id FROM roles/i.test(sql)) {
        return [[{ role_id: "role-id" }]];
      }
      if (/INSERT IGNORE INTO user_roles/i.test(sql)) {
        return [{ affectedRows }];
      }
      if (/INSERT INTO admin_audit_logs/i.test(sql)) {
        if (failAudit) throw failAudit;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL in role audit test: ${sql}`);
    },
    async commit() {
      committed = true;
    },
    async rollback() {
      rolledBack = true;
    },
    release() {}
  };
  pool.getConnection = async () => connection;
  const response = responseStub();
  let forwardedError;

  try {
    await assignRole(
      {
        body: { userId: targetUserId, roleName: "ORGANIZER" },
        user: { id: actorId }
      },
      response,
      error => {
        forwardedError = error;
      }
    );
  } finally {
    pool.getConnection = originalGetConnection;
  }

  return { statements, response, committed, rolledBack, forwardedError, targetUserId };
}

test("successful event creation records the actor and safe audit metadata transactionally", async () => {
  const result = await runCreateEvent();
  const audit = result.statements.find(({ sql }) => /INSERT INTO admin_audit_logs/i.test(sql));

  assert.equal(result.response.statusCode, 201);
  assert.equal(result.committed, true);
  assert.equal(result.rolledBack, false);
  assert.equal(result.released, true);
  assert.ok(audit);
  assert.equal(audit.values[1], actorId);
  assert.equal(audit.values[2], "CREATE_EVENT");
  assert.equal(audit.values[3], "EVENT");
  assert.equal(audit.values[4], result.response.body.data.event.event_id);

  const metadata = audit.values[6];
  assert.match(metadata, /"fields"/);
  assert.doesNotMatch(metadata, /attendee@example\.com|private-value|Contact attendee/);
});

test("successful role assignment records the administrator and assigned role", async () => {
  const result = await runAssignRole();
  const audit = result.statements.find(({ sql }) => /INSERT INTO admin_audit_logs/i.test(sql));

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.committed, true);
  assert.equal(result.rolledBack, false);
  assert.ok(audit);
  assert.equal(audit.values[1], actorId);
  assert.equal(audit.values[2], "ASSIGN_ROLE");
  assert.equal(audit.values[3], "USER");
  assert.equal(audit.values[4], result.targetUserId);
  assert.equal(audit.values[6], JSON.stringify({ roleName: "ORGANIZER" }));
});

test("repeating an existing role assignment does not create a duplicate audit event", async () => {
  const result = await runAssignRole({ affectedRows: 0 });

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.committed, true);
  assert.equal(
    result.statements.some(({ sql }) => /INSERT INTO admin_audit_logs/i.test(sql)),
    false
  );
});

test("failed event writes or audit writes roll back without a success response", async t => {
  await t.test("event write failure does not create an audit row", async () => {
    const failure = new Error("event insert failed");
    const result = await runCreateEvent({ failInsert: failure });

    assert.equal(result.forwardedError, failure);
    assert.equal(result.committed, false);
    assert.equal(result.rolledBack, true);
    assert.equal(
      result.statements.some(({ sql }) => /INSERT INTO admin_audit_logs/i.test(sql)),
      false
    );
  });

  await t.test("audit write failure rolls back the event", async () => {
    const failure = new Error("audit insert failed");
    const result = await runCreateEvent({ failAudit: failure });

    assert.equal(result.forwardedError, failure);
    assert.equal(result.committed, false);
    assert.equal(result.rolledBack, true);
    assert.equal(result.response.statusCode, null);
  });
});

test("audit metadata keeps only approved fields and drops sensitive data", () => {
  const metadata = sanitizeMetadata({
    fields: ["title", "registrationUrl"],
    password: "password-value",
    attendeeEmail: "attendee@example.com",
    nested: {
      accessToken: "token-value",
      description: "may contain personal information",
      status: "ACTIVE"
    }
  });

  assert.deepEqual(metadata, {
    fields: ["title", "registrationUrl"]
  });
});

test("audit logs are viewable only by authenticated administrators", async () => {
  const originalExecute = pool.execute;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-audit-route-secret";
  pool.execute = async sql => {
    if (/SELECT account_status/i.test(sql)) {
      return [[{ account_status: "ACTIVE" }]];
    }
    if (/FROM admin_audit_logs/i.test(sql)) {
      return [[{
        audit_id: "audit-id",
        admin_id: actorId,
        action: "UPDATE_CONFIGURATION",
        entity_type: "CONFIGURATION",
        entity_id: "external_service",
        old_values: JSON.stringify({ configValue: { secret: "old-secret" } }),
        new_values: JSON.stringify({ configValue: { token: "new-token" } }),
        created_at: "2027-04-01 10:00:00"
      }]];
    }
    throw new Error(`Unexpected SQL in audit route test: ${sql}`);
  };

  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const url = `http://127.0.0.1:${server.address().port}/api/v1/admin/audit-logs`;
    const attendeeToken = jwt.sign(
      { sub: actorId, roles: ["ATTENDEE"] },
      process.env.JWT_SECRET
    );
    const adminToken = jwt.sign(
      { sub: actorId, roles: ["ADMIN"] },
      process.env.JWT_SECRET
    );

    const missingAuth = await fetch(url);
    assert.equal(missingAuth.status, 401);

    const attendeeResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${attendeeToken}` }
    });
    assert.equal(attendeeResponse.status, 403);

    const adminResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const body = await adminResponse.json();
    assert.equal(adminResponse.status, 200);
    assert.equal(body.data[0].actorId, actorId);
    assert.equal(body.data[0].oldValues, null);
    assert.equal(body.data[0].newValues, null);
    assert.doesNotMatch(JSON.stringify(body), /old-secret|new-token/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.execute = originalExecute;
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

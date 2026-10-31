const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertSafeConfiguration,
  datasetRecords,
  deterministicUuid,
  hashAccountPassword,
  validateCleanupMarkers,
  SUPPORTED_STAGES
} = require("../load-tests/prepare-test-data");
const bcrypt = require("bcryptjs");

const CONFIG_KEYS = [
  "LOAD_TEST_CONFIRM_NON_PRODUCTION",
  "LOAD_TEST_DATA_CONFIRM_CREATE",
  "LOAD_TEST_DATA_CONFIRM_CLEANUP",
  "LOAD_TEST_DATASET_ID",
  "LOAD_TEST_STAGE_VUS",
  "LOAD_TEST_USER_DOMAIN",
  "LOAD_TEST_ACCOUNT_PASSWORD",
  "DB_NAME",
  "DB_HOST"
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(CONFIG_KEYS.map(key => [key, process.env[key]]));
  for (const key of CONFIG_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    callback();
  } finally {
    for (const key of CONFIG_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("dataset identifiers and account IDs are deterministic and isolated by dataset", () => {
  const first = deterministicUuid("ems-loadtest-oct31", "attendee:1");
  assert.equal(first, deterministicUuid("ems-loadtest-oct31", "attendee:1"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, deterministicUuid("nf-stage-250", "attendee:1"));

  const records = datasetRecords("ems-loadtest-oct31", 500, "example.invalid");
  assert.equal(records.users.length, 500);
  assert.equal(records.eventCapacity, 500);
  assert.equal(new Set(records.users.map(user => user.email)).size, 500);
  assert.equal(new Set(records.users.map(user => user.id)).size, 500);
  assert.match(records.users[0].email, /^ems-nf-load-ems-loadtest-oct31-1@example\.invalid$/);
  assert.equal(records.eventTitle, "NF load-test ems-loadtest-oct31");
  assert.equal(records.eventId, deterministicUuid("ems-loadtest-oct31", "event"));
  assert.equal(records.organizer.id, deterministicUuid("ems-loadtest-oct31", "organizer"));
  assert.equal(records.organizer.role, "ORGANIZER");
  assert.equal(new Set([...records.users.map(user => user.id), records.organizer.id]).size, 501);
});

test("only supported load stages are provisioned and event capacity matches each account set", () => {
  assert.deepEqual([...SUPPORTED_STAGES].sort((a, b) => a - b), [50, 100, 250, 500]);
  for (const stage of SUPPORTED_STAGES) {
    const records = datasetRecords(`stage-${stage}`, stage, "example.invalid");
    assert.equal(records.users.length, stage);
    assert.equal(records.eventCapacity, stage);
  }
});

test("test account passwords use bcrypt cost 12 and are not stored as plaintext", async () => {
  const password = "local-only-load-test-password";
  const hash = await hashAccountPassword(password);
  assert.match(hash, /^\$2[aby]\$12\$/);
  assert.notEqual(hash, password);
  assert.equal(await bcrypt.compare(password, hash), true);
});

test("cleanup accepts only matching deterministic event, user, and role markers", () => {
  const datasetId = "nf-stage-500";
  const records = datasetRecords(datasetId, 2, "example.invalid");
  const users = [...records.users, records.organizer].map(user => ({
    user_id: user.id,
    full_name: user.name,
    email: user.email
  }));
  const roles = [
    { user_id: records.users[0].id, role_name: "ATTENDEE" },
    { user_id: records.users[1].id, role_name: "ATTENDEE" },
    { user_id: records.organizer.id, role_name: "ORGANIZER" }
  ];
  const event = {
    event_id: records.eventId,
    title: records.eventTitle,
    created_by: records.organizer.id
  };

  assert.doesNotThrow(() => validateCleanupMarkers(datasetId, "example.invalid", event, users, roles));
  assert.throws(
    () => validateCleanupMarkers(datasetId, "example.invalid", { ...event, title: "valuable event" }, users, roles),
    /event marker/
  );
  assert.throws(
    () => validateCleanupMarkers(datasetId, "example.invalid", event, [
      { ...users[0], email: "someone-else@example.invalid" },
      ...users.slice(1)
    ], roles),
    /account ID/
  );
  assert.throws(
    () => validateCleanupMarkers(datasetId, "example.invalid", event, users, [
      ...roles.slice(0, 2),
      { ...roles[2], role_name: "ADMIN" }
    ]),
    /role assignments/
  );
});

test("dataset preparation requires explicit opt-in and the dedicated loopback database", () => {
  const valid = {
    LOAD_TEST_CONFIRM_NON_PRODUCTION: "true",
    LOAD_TEST_DATA_CONFIRM_CREATE: "true",
    LOAD_TEST_DATASET_ID: "nf-stage-500",
    LOAD_TEST_STAGE_VUS: "500",
    LOAD_TEST_USER_DOMAIN: "example.invalid",
    LOAD_TEST_ACCOUNT_PASSWORD: "safe-local-test-password",
    DB_NAME: "event_management_system_loadtest",
    DB_HOST: "localhost"
  };
  withEnvironment(valid, () => {
    assert.equal(assertSafeConfiguration("prepare"), "nf-stage-500");
  });
  withEnvironment({ ...valid, DB_NAME: "event_management_system" }, () => {
    assert.throws(() => assertSafeConfiguration("prepare"), /DB_NAME must be exactly/);
    assert.throws(() => assertSafeConfiguration("cleanup"), /DB_NAME must be exactly/);
  });
  withEnvironment({ ...valid, DB_NAME: "another_database" }, () => {
    assert.throws(() => assertSafeConfiguration("prepare"), /DB_NAME must be exactly/);
  });
  withEnvironment({ ...valid, DB_HOST: "remote.example.invalid" }, () => {
    assert.throws(() => assertSafeConfiguration("prepare"), /loopback DB_HOST/);
  });
  withEnvironment({ ...valid, LOAD_TEST_DATA_CONFIRM_CREATE: undefined }, () => {
    assert.throws(() => assertSafeConfiguration("prepare"), /authorize test-data creation/);
  });
  const longValidDomain = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(60)}`;
  withEnvironment({ ...valid, LOAD_TEST_USER_DOMAIN: longValidDomain }, () => {
    assert.throws(() => assertSafeConfiguration("prepare"), /too long for generated account email/);
  });
  withEnvironment({
    ...valid,
    LOAD_TEST_DATA_CONFIRM_CREATE: undefined,
    LOAD_TEST_DATA_CONFIRM_CLEANUP: "true"
  }, () => {
    assert.equal(assertSafeConfiguration("cleanup"), "nf-stage-500");
  });
  withEnvironment({
    ...valid,
    LOAD_TEST_DATA_CONFIRM_CREATE: undefined,
    LOAD_TEST_DATA_CONFIRM_CLEANUP: undefined
  }, () => {
    assert.throws(() => assertSafeConfiguration("cleanup"), /authorize scoped cleanup/);
  });
});

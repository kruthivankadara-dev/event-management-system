const crypto = require("node:crypto");
const path = require("node:path");

process.env.NODE_PATH = path.join(__dirname, "..", "backend", "node_modules");
require("node:module").Module._initPaths();

require("dotenv").config({
  path: path.join(__dirname, "..", "backend", ".env")
});

const bcrypt = require("bcryptjs");
const pool = require("../backend/src/config/db");

const REQUIRED_DATABASE = "event_management_system_loadtest";
const SUPPORTED_STAGES = new Set([50, 100, 250, 500]);
const REQUIRED_TABLES = [
  "users",
  "roles",
  "user_roles",
  "events",
  "event_registrations",
  "registration_payments",
  "event_tickets",
  "event_notifications",
  "event_feedback"
];
const REQUIRED_COLUMNS = {
  users: ["user_id", "full_name", "email", "password_hash", "account_status"],
  roles: ["role_id", "role_name"],
  user_roles: ["user_id", "role_id"],
  events: [
    "event_id", "title", "description", "category", "venue", "start_datetime",
    "end_datetime", "capacity", "registration_deadline", "created_by", "status"
  ],
  event_registrations: ["event_id", "attendee_id", "registration_status"],
  registration_payments: ["registration_id"],
  event_tickets: ["registration_id"],
  event_notifications: ["event_id", "registration_id"],
  event_feedback: ["event_id", "attendee_id", "registration_id"]
};

function assertSafeConfiguration(mode) {
  if (process.env.LOAD_TEST_CONFIRM_NON_PRODUCTION !== "true") {
    throw new Error("Set LOAD_TEST_CONFIRM_NON_PRODUCTION=true for an isolated non-production database.");
  }
  if (process.env.DB_NAME !== REQUIRED_DATABASE) {
    throw new Error(`DB_NAME must be exactly ${REQUIRED_DATABASE}.`);
  }
  const host = (process.env.DB_HOST || "localhost").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error("The data setup utility only permits a loopback DB_HOST.");
  }
  if (mode === "prepare" && process.env.LOAD_TEST_DATA_CONFIRM_CREATE !== "true") {
    throw new Error("Set LOAD_TEST_DATA_CONFIRM_CREATE=true to authorize test-data creation.");
  }
  if (mode === "cleanup" && process.env.LOAD_TEST_DATA_CONFIRM_CLEANUP !== "true") {
    throw new Error("Set LOAD_TEST_DATA_CONFIRM_CLEANUP=true to authorize scoped cleanup.");
  }

  const datasetId = process.env.LOAD_TEST_DATASET_ID || "";
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(datasetId)) {
    throw new Error("LOAD_TEST_DATASET_ID must be a unique lowercase slug of 3-40 letters, digits, or hyphens.");
  }
  const domain = (process.env.LOAD_TEST_USER_DOMAIN || "").toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("LOAD_TEST_USER_DOMAIN must be a valid test email domain.");
  }
  const maxLocalPart = `ems-nf-load-${datasetId}-organizer`;
  if (Buffer.byteLength(maxLocalPart, "utf8") + 1 + Buffer.byteLength(domain, "utf8") > 254) {
    throw new Error("LOAD_TEST_USER_DOMAIN is too long for generated account email addresses.");
  }

  if (mode === "prepare") {
    const stage = Number(process.env.LOAD_TEST_STAGE_VUS);
    if (!SUPPORTED_STAGES.has(stage)) {
      throw new Error("LOAD_TEST_STAGE_VUS must be 50, 100, 250, or 500.");
    }
    if (!process.env.LOAD_TEST_ACCOUNT_PASSWORD ||
        Buffer.byteLength(process.env.LOAD_TEST_ACCOUNT_PASSWORD, "utf8") < 8 ||
        Buffer.byteLength(process.env.LOAD_TEST_ACCOUNT_PASSWORD, "utf8") > 72) {
      throw new Error("LOAD_TEST_ACCOUNT_PASSWORD must be 8-72 UTF-8 bytes.");
    }
  }

  return datasetId;
}

function deterministicUuid(datasetId, recordKey) {
  const bytes = crypto
    .createHash("sha256")
    .update(`ems-nf-load-test:${datasetId}:${recordKey}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function datasetRecords(datasetId, count, domain) {
  const userPrefix = `ems-nf-load-${datasetId}-`;
  const users = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      id: deterministicUuid(datasetId, `attendee:${number}`),
      name: `NF Load ${datasetId} Attendee ${number}`,
      email: `${userPrefix}${number}@${domain}`,
      role: "ATTENDEE"
    };
  });
  const organizer = {
    id: deterministicUuid(datasetId, "organizer"),
    name: `NF Load ${datasetId} Organizer`,
    email: `ems-nf-load-${datasetId}-organizer@${domain}`,
    role: "ORGANIZER"
  };
  return {
    datasetId,
    count,
    eventCapacity: count,
    userPrefix,
    domain,
    users,
    organizer,
    eventId: deterministicUuid(datasetId, "event"),
    eventTitle: `NF load-test ${datasetId}`
  };
}

function validateCleanupMarkers(datasetId, domain, event, userRows, userRoleRows) {
  const expectedUsers = new Map();
  const candidates = datasetRecords(datasetId, 500, domain);
  expectedUsers.set(candidates.organizer.id, candidates.organizer);
  for (const user of candidates.users) expectedUsers.set(user.id, user);

  if (event && (
    event.title !== candidates.eventTitle ||
    event.created_by !== candidates.organizer.id
  )) {
    throw new Error("Refusing cleanup because the deterministic event ID does not match the test event marker.");
  }
  for (const user of userRows) {
    const expected = expectedUsers.get(user.user_id);
    if (!expected || user.email !== expected.email || user.full_name !== expected.name) {
      throw new Error("Refusing cleanup because a deterministic test-account ID does not match its marker.");
    }
  }

  const expectedRoleByUser = new Map([
    [candidates.organizer.id, "ORGANIZER"],
    ...candidates.users.map(user => [user.id, "ATTENDEE"])
  ]);
  if (userRoleRows.some(row => expectedRoleByUser.get(row.user_id) !== row.role_name) ||
      userRoleRows.length !== userRows.length) {
    throw new Error("Refusing cleanup because test-account role assignments do not match their markers.");
  }
}

function idBatches(records, size = 100) {
  const batches = [];
  for (let offset = 0; offset < records.length; offset += size) {
    batches.push(records.slice(offset, offset + size));
  }
  return batches;
}

async function verifyDatabase(connection) {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS selected_database");
  if (databaseRow.selected_database !== REQUIRED_DATABASE) {
    throw new Error(`Connected database must be exactly ${REQUIRED_DATABASE}.`);
  }

  const [tables] = await connection.execute(
    `SELECT TABLE_NAME, ENGINE
     FROM information_schema.tables
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => "?").join(", ")})`,
    REQUIRED_TABLES
  );
  const tableMap = new Map(tables.map(table => [table.TABLE_NAME, table.ENGINE]));
  const missingTables = REQUIRED_TABLES.filter(table => !tableMap.has(table));
  if (missingTables.length) {
    throw new Error(`Required existing tables are missing: ${missingTables.join(", ")}. No schema changes are made.`);
  }
  const nonTransactional = REQUIRED_TABLES.filter(table => tableMap.get(table) !== "InnoDB");
  if (nonTransactional.length) {
    throw new Error(`Required tables must use InnoDB: ${nonTransactional.join(", ")}.`);
  }

  const expectedColumns = Object.entries(REQUIRED_COLUMNS)
    .flatMap(([table, columns]) => columns.map(column => ({ table, column })));
  const [columns] = await connection.execute(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.columns
     WHERE TABLE_SCHEMA = DATABASE()
       AND (${expectedColumns.map(() => "(TABLE_NAME = ? AND COLUMN_NAME = ?)").join(" OR ")})`,
    expectedColumns.flatMap(({ table, column }) => [table, column])
  );
  const actualColumns = new Set(columns.map(column => `${column.TABLE_NAME}.${column.COLUMN_NAME}`));
  const missingColumns = expectedColumns
    .map(({ table, column }) => `${table}.${column}`)
    .filter(column => !actualColumns.has(column));
  if (missingColumns.length) {
    throw new Error(`Required existing columns are missing: ${missingColumns.join(", ")}. No schema changes are made.`);
  }

  const [roles] = await connection.execute(
    "SELECT role_name FROM roles WHERE role_name IN ('ATTENDEE', 'ORGANIZER')"
  );
  const roleNames = new Set(roles.map(role => role.role_name));
  if (!roleNames.has("ATTENDEE") || !roleNames.has("ORGANIZER")) {
    throw new Error("The existing ATTENDEE and ORGANIZER roles must be seeded before setup.");
  }
}

async function requireEmptyTestDatabase(connection) {
  const counts = {};
  for (const table of ["users", "events", "event_registrations"]) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS row_count FROM \`${table}\``);
    counts[table] = Number(row.row_count);
  }
  const nonEmpty = Object.entries(counts).filter(([, count]) => count !== 0);
  if (nonEmpty.length) {
    throw new Error(
      `The dedicated test database must have no users, events, or registrations. Non-empty: ${nonEmpty.map(([table]) => table).join(", ")}.`
    );
  }
}

async function insertUsers(connection, users, password) {
  const records = [];
  for (const user of users) {
    records.push({ ...user, passwordHash: await hashAccountPassword(password) });
  }
  for (const batch of idBatches(records)) {
    const placeholders = batch.map(() => "(?, ?, ?, ?)").join(", ");
    const values = batch.flatMap(user => [
      user.id, user.name, user.email, user.passwordHash
    ]);
    await connection.execute(
      `INSERT INTO users (user_id, full_name, email, password_hash) VALUES ${placeholders}`,
      values
    );
  }
}

function hashAccountPassword(password) {
  return bcrypt.hash(password, 12);
}

async function insertUserRoles(connection, users, roleIds) {
  for (const batch of idBatches(users)) {
    const placeholders = batch.map(() => "(?, ?)").join(", ");
    const values = batch.flatMap(user => [user.id, roleIds.get(user.role)]);
    await connection.execute(
      `INSERT INTO user_roles (user_id, role_id) VALUES ${placeholders}`,
      values
    );
  }
}

async function prepareDataset(datasetId) {
  const stage = Number(process.env.LOAD_TEST_STAGE_VUS);
  const domain = process.env.LOAD_TEST_USER_DOMAIN.toLowerCase();
  const records = datasetRecords(datasetId, stage, domain);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await verifyDatabase(connection);
    await connection.beginTransaction();
    transactionStarted = true;
    await requireEmptyTestDatabase(connection);

    const [roleRows] = await connection.query(
      "SELECT role_id, role_name FROM roles WHERE role_name IN ('ATTENDEE', 'ORGANIZER')"
    );
    const roleIds = new Map(roleRows.map(role => [role.role_name, role.role_id]));
    const allUsers = [...records.users, records.organizer];
    const password = process.env.LOAD_TEST_ACCOUNT_PASSWORD;
    await insertUsers(connection, allUsers, password);
    await insertUserRoles(connection, allUsers, roleIds);

    await connection.execute(
      `INSERT INTO events
        (event_id, title, description, category, venue, start_datetime,
         end_datetime, capacity, registration_deadline, created_by, status)
       VALUES (
         ?, ?, ?, ?, ?,
         DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 14 DAY),
         DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 DAY),
         ?,
         DATE_SUB(DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 14 DAY), INTERVAL 1 HOUR),
         ?, 'SCHEDULED'
       )`,
      [
        records.eventId,
        records.eventTitle,
        "Dedicated isolated NF-001/NF-004 load-test event.",
        "Load Test",
        "Isolated Load-Test Environment",
        records.eventCapacity,
        records.organizer.id
      ]
    );

    await connection.commit();
    transactionStarted = false;
    return {
      count: stage,
      datasetId,
      domain,
      eventId: records.eventId,
      eventTitle: records.eventTitle,
      eventCapacity: records.eventCapacity,
      userPrefix: records.userPrefix
    };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cleanupDataset(datasetId) {
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await verifyDatabase(connection);
    await connection.beginTransaction();
    transactionStarted = true;

    const [[event]] = await connection.execute(
      "SELECT event_id, title, created_by FROM events WHERE event_id = ? FOR UPDATE",
      [deterministicUuid(datasetId, "event")]
    );
    const [userRows] = await connection.execute(
      `SELECT user_id, full_name, email
       FROM users
       WHERE user_id IN (${Array.from({ length: 501 }, (_, index) =>
    `?`).join(", ")})`,
      [
        deterministicUuid(datasetId, "organizer"),
        ...Array.from({ length: 500 }, (_, index) =>
          deterministicUuid(datasetId, `attendee:${index + 1}`))
      ]
    );
    const domain = (process.env.LOAD_TEST_USER_DOMAIN || "").toLowerCase();
    const userIds = [
      deterministicUuid(datasetId, "organizer"),
      ...Array.from({ length: 500 }, (_, index) =>
        deterministicUuid(datasetId, `attendee:${index + 1}`))
    ];
    const userIdPlaceholders = userIds.map(() => "?").join(", ");
    const eventId = event ? event.event_id : deterministicUuid(datasetId, "event");
    const [[externalReferences]] = await connection.execute(
      `SELECT
         (SELECT COUNT(*) FROM event_registrations
          WHERE attendee_id IN (${userIdPlaceholders}) AND event_id <> ?) +
         (SELECT COUNT(*) FROM event_notifications
          WHERE recipient_id IN (${userIdPlaceholders}) AND event_id <> ?) +
         (SELECT COUNT(*) FROM event_feedback
          WHERE attendee_id IN (${userIdPlaceholders}) AND event_id <> ?) +
         (SELECT COUNT(*) FROM events
          WHERE created_by IN (${userIdPlaceholders}) AND event_id <> ?) AS reference_count`,
      [
        ...userIds, eventId,
        ...userIds, eventId,
        ...userIds, eventId,
        ...userIds, eventId
      ]
    );
    if (Number(externalReferences.reference_count) !== 0) {
      throw new Error("Refusing cleanup because test accounts are referenced by records outside their dedicated event.");
    }

    const [userRoleRows] = await connection.execute(
      `SELECT ur.user_id, r.role_name
       FROM user_roles ur
       JOIN roles r ON r.role_id = ur.role_id
       WHERE ur.user_id IN (${userIdPlaceholders})`,
      userIds
    );
    validateCleanupMarkers(datasetId, domain, event, userRows, userRoleRows);
    if (event) {
      const [[unexpectedRegistration]] = await connection.execute(
        `SELECT COUNT(*) AS row_count
         FROM event_registrations
         WHERE event_id = ?
           AND attendee_id NOT IN (${Array.from({ length: 500 }, () => "?").join(", ")})`,
        [
          event.event_id,
          ...Array.from({ length: 500 }, (_, index) =>
            deterministicUuid(datasetId, `attendee:${index + 1}`))
        ]
      );
      if (Number(unexpectedRegistration.row_count) !== 0) {
        throw new Error("Refusing cleanup because the test event has registrations for unexpected accounts.");
      }
      await connection.execute(
        "DELETE FROM event_registrations WHERE event_id = ?",
        [event.event_id]
      );
      await connection.execute(
        "DELETE FROM events WHERE event_id = ?",
        [event.event_id]
      );
    }

    for (const batch of idBatches(userIds)) {
      const placeholders = batch.map(() => "?").join(", ");
      await connection.execute(
        `DELETE FROM user_roles WHERE user_id IN (${placeholders})`,
        batch
      );
      await connection.execute(
        `DELETE FROM users WHERE user_id IN (${placeholders})`,
        batch
      );
    }

    await connection.commit();
    transactionStarted = false;
    return {
      deletedAccounts: userRows.length,
      deletedEvent: Boolean(event),
      datasetId
    };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const mode = process.argv[2];
  if (!["prepare", "cleanup"].includes(mode) || process.argv.length !== 3) {
    throw new Error("Usage: node load-tests/prepare-test-data.js <prepare|cleanup>.");
  }
  const datasetId = assertSafeConfiguration(mode);
  const result = mode === "prepare"
    ? await prepareDataset(datasetId)
    : await cleanupDataset(datasetId);

  if (mode === "prepare") {
    console.log("Load-test dataset prepared in the isolated database.");
    console.log(`Dataset: ${result.datasetId}`);
    console.log(`Attendee accounts: ${result.count}`);
    console.log(`Event ID: ${result.eventId}`);
    console.log(`Event title: ${result.eventTitle}`);
    console.log(`Event capacity: ${result.eventCapacity}`);
    console.log(`LOAD_USER_PREFIX=${result.userPrefix}`);
    console.log(`LOAD_USER_DOMAIN=${result.domain}`);
    console.log("The shared test password was not displayed.");
  } else {
    console.log("Scoped load-test cleanup completed.");
    console.log(`Dataset: ${result.datasetId}`);
    console.log(`Test accounts removed: ${result.deletedAccounts}`);
    console.log(`Test event removed: ${result.deletedEvent}`);
  }
}

if (require.main === module) {
  main()
    .catch(error => {
      const safeCode = error && typeof error.code === "string" ? ` (${error.code})` : "";
      const message = safeCode
        ? "Database operation failed; no credentials or SQL values were printed."
        : error.message;
      console.error(`Load-test data operation stopped${safeCode}: ${message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = {
  assertSafeConfiguration,
  datasetRecords,
  deterministicUuid,
  hashAccountPassword,
  validateCleanupMarkers,
  REQUIRED_DATABASE,
  SUPPORTED_STAGES
};

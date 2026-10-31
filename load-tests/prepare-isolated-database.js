const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const REPOSITORY_ROOT = path.join(__dirname, "..");
const requireBackend = createRequire(path.join(REPOSITORY_ROOT, "backend", "package.json"));
const DATABASE_NAME = "event_management_system_loadtest";
const SOURCE_DATABASE = "event_management_system";
const SCHEMA_FILES = [
  "database/schema.sql",
  "database/migrations/001_create_events.sql",
  "database/migrations/002_add_event_status.sql",
  "database/migrations/003_add_event_registration_url.sql",
  "database/migrations/004_create_event_registrations.sql",
  "database/migrations/005_add_student_registration_details.sql",
  "database/migrations/006_create_registration_payments.sql",
  "database/migrations/007_create_event_tickets.sql",
  "database/migrations/008_add_ticket_checkin_validation.sql",
  "database/migrations/009_create_event_notifications.sql",
  "database/migrations/010_create_event_feedback.sql",
  "database/migrations/011_administrative_management.sql"
];
const REQUIRED_TABLES = [
  "users",
  "roles",
  "user_roles",
  "events",
  "event_registrations",
  "registration_payments",
  "event_tickets",
  "event_notifications",
  "event_feedback",
  "event_venues",
  "event_categories",
  "system_configurations",
  "admin_audit_logs"
];
const REQUIRED_COLUMNS = {
  users: ["user_id", "full_name", "email", "password_hash", "account_status"],
  roles: ["role_id", "role_name"],
  user_roles: ["user_id", "role_id"],
  events: [
    "event_id", "title", "description", "category", "venue", "start_datetime",
    "end_datetime", "capacity", "registration_deadline", "created_by", "status"
  ],
  event_registrations: [
    "registration_id", "event_id", "attendee_id", "registration_status",
    "attendee_name", "attendee_email", "phone_number", "college", "department"
  ],
  registration_payments: ["registration_id", "payment_status"],
  event_tickets: ["registration_id", "ticket_status", "checked_in_by"],
  event_notifications: ["event_id", "registration_id"],
  event_feedback: ["event_id", "attendee_id", "registration_id"]
};
const ALLOWED_ROLES = new Set(["ATTENDEE", "ADMIN", "ORGANIZER", "EVENT_STAFF"]);

function transformSql(source, relativePath) {
  const useStatement = new RegExp(`^USE\\s+${SOURCE_DATABASE};\\s*$`, "gim");
  const useMatches = source.match(useStatement) || [];
  if (useMatches.length !== 1) {
    throw new Error(`${relativePath} must contain exactly one expected database USE statement.`);
  }
  if (/^\s*(DROP\s+(?:DATABASE|TABLE)|TRUNCATE\s+TABLE)\b/im.test(source)) {
    throw new Error(`${relativePath} contains a destructive DDL statement; refusing to run it.`);
  }

  let transformed = source.replace(useStatement, `USE ${DATABASE_NAME};`);
  if (relativePath === "database/schema.sql") {
    const createDatabase = new RegExp(
      `^CREATE\\s+DATABASE\\s+IF\\s+NOT\\s+EXISTS\\s+${SOURCE_DATABASE};\\s*$`,
      "gim"
    );
    if ((transformed.match(createDatabase) || []).length !== 1) {
      throw new Error("database/schema.sql did not contain exactly the expected source CREATE DATABASE statement.");
    }
    transformed = transformed.replace(createDatabase, "");
    const withoutTrailingMarkdownFence = transformed.replace(/\r?\n```[ \t]*\r?\n?$/, "\n");
    if (withoutTrailingMarkdownFence === transformed) {
      throw new Error("database/schema.sql is missing its expected trailing Markdown fence.");
    }
    transformed = withoutTrailingMarkdownFence;
  }

  if (new RegExp(`\\b${SOURCE_DATABASE}\\b`, "i").test(transformed)) {
    throw new Error(`${relativePath} still references the source database after safe rewriting.`);
  }
  return transformed;
}

function splitSqlStatements(source, relativePath = "SQL input") {
  const statements = [];
  let statement = "";
  let quote = null;
  let quoteStartLine = null;
  let lineComment = false;
  let blockComment = false;
  let line = 1;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      statement += character;
      if (character === "\n") {
        lineComment = false;
        line += 1;
      }
      continue;
    }

    if (blockComment) {
      statement += character;
      if (character === "\n") line += 1;
      if (character === "*" && next === "/") {
        statement += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }

    if (quote) {
      statement += character;
      if (character === "\n") line += 1;
      if (character === "\\" && quote !== "`" && next !== undefined) {
        statement += next;
        index += 1;
      } else if (character === quote) {
        if (next === quote) {
          statement += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      quoteStartLine = line;
      statement += character;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      statement += "/*";
      index += 1;
      continue;
    }
    if (character === "#" || (character === "-" && next === "-" &&
        (index + 2 === source.length || /\s/.test(source[index + 2])))) {
      lineComment = true;
      statement += character;
      if (character === "-") {
        statement += next;
        index += 1;
      }
      continue;
    }
    if (character === "\n") line += 1;
    if (character === ";") {
      if (statement.trim()) statements.push(statement.trim());
      statement = "";
      continue;
    }
    statement += character;
  }

  if (quote) {
    throw new Error(`${relativePath} contains an unterminated quoted value at line ${quoteStartLine}.`);
  }
  if (blockComment) {
    throw new Error(`${relativePath} contains an unterminated block comment.`);
  }
  if (statement.trim()) statements.push(statement.trim());
  if (statements.some(sql => /^\s*DELIMITER\b/i.test(sql))) {
    throw new Error(`${relativePath} contains a DELIMITER client directive; only plain SQL migrations are supported.`);
  }
  return statements;
}

async function assertEmptyIsolatedDatabase(connection) {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS selected_database");
  if (databaseRow.selected_database !== DATABASE_NAME) {
    throw new Error(`Connected database must be exactly ${DATABASE_NAME}.`);
  }

  const [tables] = await connection.query(
    `SELECT TABLE_NAME
     FROM information_schema.tables
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  );
  const existingTables = new Set(tables.map(row => row.TABLE_NAME));
  if (existingTables.has("roles")) {
    const [roles] = await connection.query("SELECT role_name FROM roles");
    const unexpected = roles.filter(role => !ALLOWED_ROLES.has(role.role_name));
    if (unexpected.length) {
      throw new Error("The isolated database contains unexpected role data; refusing setup.");
    }
  }

  for (const { TABLE_NAME: table } of tables) {
    if (table === "roles") continue;
    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS row_count FROM \`${table.replace(/`/g, "``")}\``
    );
    if (Number(countRow.row_count) !== 0) {
      throw new Error(
        `The isolated database table ${table} is not empty; refusing to copy, overwrite, or migrate existing data.`
      );
    }
  }
}

async function verifySchema(connection) {
  const [tableRows] = await connection.execute(
    `SELECT TABLE_NAME
     FROM information_schema.tables
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => "?").join(", ")})`,
    REQUIRED_TABLES
  );
  const actualTables = new Set(tableRows.map(row => row.TABLE_NAME));
  const missingTables = REQUIRED_TABLES.filter(table => !actualTables.has(table));
  if (missingTables.length) {
    throw new Error(`Schema setup did not create required tables: ${missingTables.join(", ")}.`);
  }

  const expectedColumns = Object.entries(REQUIRED_COLUMNS)
    .flatMap(([table, columns]) => columns.map(column => ({ table, column })));
  const [columnRows] = await connection.execute(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.columns
     WHERE TABLE_SCHEMA = DATABASE()
       AND (${expectedColumns.map(() => "(TABLE_NAME = ? AND COLUMN_NAME = ?)").join(" OR ")})`,
    expectedColumns.flatMap(({ table, column }) => [table, column])
  );
  const actualColumns = new Set(columnRows.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
  const missingColumns = expectedColumns
    .map(({ table, column }) => `${table}.${column}`)
    .filter(column => !actualColumns.has(column));
  if (missingColumns.length) {
    throw new Error(`Schema setup is incompatible with load-test preparation: ${missingColumns.join(", ")}.`);
  }

  const [roles] = await connection.query("SELECT role_name FROM roles ORDER BY role_name");
  const roleNames = new Set(roles.map(role => role.role_name));
  const missingRoles = [...ALLOWED_ROLES].filter(role => !roleNames.has(role));
  const unexpectedRoles = [...roleNames].filter(role => !ALLOWED_ROLES.has(role));
  if (missingRoles.length || unexpectedRoles.length) {
    throw new Error("The required role seed verification failed.");
  }

  const [[engineCounts]] = await connection.execute(
    `SELECT COUNT(*) AS non_innodb_tables
     FROM information_schema.tables
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => "?").join(", ")})
       AND ENGINE <> 'InnoDB'`,
    REQUIRED_TABLES
  );
  if (Number(engineCounts.non_innodb_tables) !== 0) {
    throw new Error("All application tables must use InnoDB for transactional load-test setup.");
  }
}

async function runSetup() {
  requireBackend("dotenv").config({
    path: path.join(REPOSITORY_ROOT, "backend", ".env")
  });
  const host = (process.env.DB_HOST || "localhost").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error("DB_HOST must be loopback; remote schema setup is refused.");
  }
  if (process.env.DB_NAME !== DATABASE_NAME) {
    throw new Error(`Set DB_NAME=${DATABASE_NAME} in the current terminal before setup.`);
  }

  const mysql = requireBackend("mysql2/promise");
  const connection = await mysql.createConnection({
    host,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: DATABASE_NAME
  });

  try {
    await assertEmptyIsolatedDatabase(connection);
    const [[lockRow]] = await connection.query(
      "SELECT GET_LOCK('ems_nf_loadtest_schema_setup', 0) AS acquired"
    );
    if (Number(lockRow.acquired) !== 1) {
      throw new Error("Another isolated schema setup is already running.");
    }
    try {
      for (const relativePath of SCHEMA_FILES) {
        const absolutePath = path.join(REPOSITORY_ROOT, relativePath);
        const source = fs.readFileSync(absolutePath, "utf8");
        const sql = transformSql(source, relativePath);
        const statements = splitSqlStatements(sql, relativePath);
        for (let index = 0; index < statements.length; index += 1) {
          const statement = statements[index];
          if (/^\s*USE\b/i.test(statement) &&
              !new RegExp(`^\\s*USE\\s+${DATABASE_NAME}\\s*;?\\s*$`, "i").test(statement)) {
            throw new Error(`${relativePath}, statement ${index + 1} selects an unapproved database.`);
          }
          try {
            await connection.query(statement);
          } catch (error) {
            const statementError = new Error(
              `SQL execution failed in ${relativePath}, statement ${index + 1}.`
            );
            statementError.code = error.code;
            throw statementError;
          }
          const [[currentDatabase]] = await connection.query("SELECT DATABASE() AS selected_database");
          if (currentDatabase.selected_database !== DATABASE_NAME) {
            throw new Error(`${relativePath}, statement ${index + 1} changed the selected database; stopping.`);
          }
        }
      }
      await verifySchema(connection);
      await assertEmptyIsolatedDatabase(connection);
    } finally {
      await connection.query("SELECT RELEASE_LOCK('ems_nf_loadtest_schema_setup')");
    }
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  runSetup()
    .then(() => {
      console.log(`Isolated schema is ready in ${DATABASE_NAME}; no users, events, or registrations were created.`);
    })
    .catch(error => {
      const code = error && error.code ? ` (${error.code})` : "";
      console.error(`Isolated schema setup failed: ${error.message || "Database setup stopped."}${code}`);
      process.exitCode = 1;
    });
}

module.exports = {
  DATABASE_NAME,
  REQUIRED_TABLES,
  SCHEMA_FILES,
  transformSql,
  splitSqlStatements
};

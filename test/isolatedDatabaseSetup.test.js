const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DATABASE_NAME,
  REQUIRED_TABLES,
  SCHEMA_FILES,
  transformSql,
  splitSqlStatements
} = require("../load-tests/prepare-isolated-database");

const root = path.join(__dirname, "..");

test("the approved schema and migrations are redirected only to the isolated database", () => {
  assert.equal(SCHEMA_FILES.length, 12);
  for (const relativePath of SCHEMA_FILES) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    const transformed = transformSql(source, relativePath);
    assert.match(transformed, new RegExp(`USE ${DATABASE_NAME};`, "i"), relativePath);
    assert.doesNotMatch(transformed, /\bevent_management_system\b/i, relativePath);
    assert.doesNotMatch(transformed, /^\s*(DROP\s+(?:DATABASE|TABLE)|TRUNCATE\s+TABLE)\b/im, relativePath);
    if (relativePath === "database/schema.sql") {
      assert.doesNotMatch(transformed, /^\s*CREATE\s+DATABASE\b/im);
      assert.doesNotMatch(transformed, /^```/m);
      assert.ok(splitSqlStatements(transformed, relativePath).length > 0);
    }
  }
});

test("the schema Markdown closing fence is removed before SQL parsing", () => {
  const source = fs.readFileSync(path.join(root, "database", "schema.sql"), "utf8");
  assert.match(source, /\r?\n```[ \t]*\r?\n?$/);
  const transformed = transformSql(source, "database/schema.sql");
  assert.doesNotMatch(transformed, /```/);
  assert.doesNotThrow(() => splitSqlStatements(transformed, "database/schema.sql"));
});

test("the isolated schema includes the tables required by load-test data setup", () => {
  for (const table of [
    "users",
    "roles",
    "user_roles",
    "events",
    "event_registrations",
    "registration_payments",
    "event_tickets",
    "event_notifications",
    "event_feedback"
  ]) {
    assert.ok(REQUIRED_TABLES.includes(table), `${table} must be present for test-data setup`);
  }
});

test("schema rewriting refuses unexpected source or destructive statements", () => {
  assert.throws(
    () => transformSql("CREATE TABLE sample (id INT);", "unexpected.sql"),
    /exactly one expected database USE/
  );
  assert.throws(
    () => transformSql("USE event_management_system;\nDROP TABLE users;", "unsafe.sql"),
    /destructive DDL/
  );
});

test("SQL splitting preserves semicolons in strings and comments used by MySQL 8 migrations", () => {
  const sql = [
    "USE event_management_system_loadtest;",
    "-- this comment has a semicolon; it is not a statement boundary",
    "SET @migration = 'ALTER TABLE example ADD COLUMN state ENUM(''OPEN'', ''CLOSED'')';",
    "PREPARE migration_statement FROM @migration;",
    "EXECUTE migration_statement;",
    "DEALLOCATE PREPARE migration_statement;",
    "SELECT 'escaped \\' quote; still in string', `column;name` /* block; comment */;"
  ].join("\n");
  const statements = splitSqlStatements(sql, "regression.sql");
  assert.equal(statements.length, 6);
  assert.match(statements[1], /ENUM\(''OPEN'', ''CLOSED''\)/);
  assert.match(statements[5], /still in string/);
  assert.match(statements[5], /column;name/);
});

test("every approved schema and migration file can be split without DELIMITER directives", () => {
  for (const relativePath of SCHEMA_FILES) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    const statements = splitSqlStatements(transformSql(source, relativePath), relativePath);
    assert.ok(statements.length > 0, `${relativePath} must contain SQL statements`);
    assert.ok(
      statements.every(statement => !/^\s*DELIMITER\b/i.test(statement)),
      `${relativePath} must not include mysql-client directives`
    );
  }
});

test("SQL splitting rejects unsupported delimiter directives and malformed quoting", () => {
  assert.throws(
    () => splitSqlStatements("DELIMITER //\nCREATE PROCEDURE p() SELECT 1//", "routine.sql"),
    /DELIMITER client directive/
  );
  assert.throws(
    () => splitSqlStatements("SELECT 'unterminated;", "broken.sql"),
    /unterminated quoted value/
  );
});

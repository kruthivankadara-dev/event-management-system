process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../backend/src/app");
const pool = require("../backend/src/config/db");
const { register } = require("../backend/src/controllers/authController");
const {
  authenticateToken,
  authorizeRoles
} = require("../backend/src/middleware/authMiddleware");
const {
  requestPaymentProcessing
} = require("../backend/src/controllers/paymentController");
const { close: closePasswordComparisonPool } = require("../backend/src/services/passwordComparisonPool");

test.after(async () => {
  await closePasswordComparisonPool();
});

function responseStub() {
  return {
    statusCode: 200,
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

function containsSensitiveLog(loggedValues, sensitiveValues) {
  return loggedValues.some(value => {
    let text;
    try {
      text = typeof value === "string" ? value : JSON.stringify(value);
    } catch {
      text = String(value);
    }
    return sensitiveValues.some(sensitive => String(text).includes(sensitive));
  });
}

test("registration persists a bcrypt hash and never returns or logs the password", async t => {
  const originalGetConnection = pool.getConnection;
  const password = "correct horse battery staple";
  let storedHash;
  const loggedValues = [];
  for (const method of ["debug", "info", "log", "warn", "error"]) {
    t.mock.method(console, method, (...args) => loggedValues.push(...args));
  }

  pool.getConnection = async () => ({
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(statement, values = []) {
      if (/SELECT user_id FROM users WHERE email/.test(statement)) {
        return storedHash ? [[{ user_id: "new-user" }]] : [[]];
      }
      if (/SELECT role_id FROM roles/.test(statement)) {
        return [[{ role_id: 1 }]];
      }
      if (/INSERT INTO users/.test(statement)) {
        storedHash = values[2];
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO user_roles/.test(statement)) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL in registration test: ${statement}`);
    }
  });

  try {
    const response = responseStub();
    await register(
      { body: { name: "Test User", email: "test@example.com", password } },
      response,
      error => { throw error; }
    );

    assert.equal(response.statusCode, 201);
    assert.match(storedHash, /^\$2[aby]\$/);
    assert.notEqual(storedHash, password);
    assert.equal(await bcrypt.compare(password, storedHash), true);
    assert.equal(JSON.stringify(response.body).includes(password), false);
    assert.equal(containsSensitiveLog(loggedValues, [password, storedHash]), false);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test("login returns a token only to its caller and does not log password, hash, or token", async t => {
  const originalSecret = process.env.JWT_SECRET;
  const originalExecute = pool.execute;
  const password = "login-only-test-password";
  const passwordHash = await bcrypt.hash(password, 4);
  const secret = "test-only-login-signing-secret";
  const loggedValues = [];
  for (const method of ["debug", "info", "log", "warn", "error"]) {
    t.mock.method(console, method, (...args) => loggedValues.push(...args));
  }
  process.env.JWT_SECRET = secret;
  let loginQueries = 0;
  pool.execute = async statement => {
    if (/FROM users u\s+LEFT JOIN user_roles/.test(statement)) {
      loginQueries += 1;
      return [[{
        user_id: "user-id",
        full_name: "Test User",
        email: "test@example.com",
        password_hash: passwordHash,
        account_status: "ACTIVE",
        role_name: "ATTENDEE"
      }, {
        user_id: "user-id",
        full_name: "Test User",
        email: "test@example.com",
        password_hash: passwordHash,
        account_status: "ACTIVE",
        role_name: "EVENT_STAFF"
      }]];
    }
    if (/SELECT account_status/.test(statement)) {
      return [[{ account_status: "ACTIVE" }]];
    }
    throw new Error(`Unexpected SQL in login security test: ${statement}`);
  };

  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/auth`;
    const loginResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password })
    });
    const loginBody = await loginResponse.json();

    assert.equal(loginResponse.status, 200);
    assert.equal(typeof loginBody.data.token, "string");
    assert.equal(loginQueries, 1);
    assert.deepEqual(jwt.decode(loginBody.data.token).roles, ["ATTENDEE", "EVENT_STAFF"]);
    const token = loginBody.data.token;
    assert.equal(JSON.stringify(loginBody).includes(password), false);
    assert.equal(JSON.stringify(loginBody).includes(passwordHash), false);

    const profileResponse = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const profileBody = await profileResponse.json();
    assert.equal(profileResponse.status, 200);
    assert.equal(JSON.stringify(profileBody).includes(token), false);
    assert.equal(JSON.stringify(profileBody).includes(password), false);
    assert.equal(JSON.stringify(profileBody).includes(passwordHash), false);
    assert.equal(
      containsSensitiveLog(loggedValues, [password, passwordHash, token]),
      false
    );
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    pool.execute = originalExecute;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("invalid registration input is rejected before database access", async () => {
  const originalGetConnection = pool.getConnection;
  let databaseAccessed = false;
  pool.getConnection = async () => {
    databaseAccessed = true;
    throw new Error("Database must not be accessed for invalid input.");
  };

  try {
    const response = responseStub();
    await register(
      { body: { name: "X", email: "not-an-email", password: "short" } },
      response,
      error => { throw error; }
    );
    assert.equal(response.statusCode, 400);
    assert.equal(databaseAccessed, false);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test("authentication rejects expired bearer tokens before querying user data", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalExecute = pool.execute;
  const secret = "test-only-signing-secret";
  process.env.JWT_SECRET = secret;
  let databaseAccessed = false;
  pool.execute = async () => {
    databaseAccessed = true;
    return [[{ account_status: "ACTIVE" }]];
  };

  try {
    const token = jwt.sign(
      { sub: "user-id", roles: ["ATTENDEE"] },
      secret,
      { expiresIn: -1 }
    );
    const response = responseStub();
    await authenticateToken(
      { headers: { authorization: `Bearer ${token}` } },
      response,
      () => assert.fail("Expired token must not authenticate.")
    );
    assert.equal(response.statusCode, 401);
    assert.equal(databaseAccessed, false);
  } finally {
    pool.execute = originalExecute;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("role middleware denies an attendee access to an administrator operation", () => {
  const response = responseStub();
  let nextCalled = false;
  authorizeRoles("ADMIN")(
    { user: { id: "attendee-id", roles: ["ATTENDEE"] } },
    response,
    () => { nextCalled = true; }
  );
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("payment processing cannot persist, log, or echo raw card fields", async t => {
  const originalExecute = pool.execute;
  const databaseCalls = [];
  const loggedValues = [];
  const sensitivePaymentFields = [
    "4111111111111111",
    "123",
    "Test Cardholder",
    "11/30"
  ];
  for (const method of ["debug", "info", "log", "warn", "error"]) {
    t.mock.method(console, method, (...args) => loggedValues.push(...args));
  }
  pool.execute = async (...arguments_) => {
    databaseCalls.push(arguments_);
    return [[{ registration_id: "9d3dba07-c272-4f71-aedd-3fc7f4c3c589" }]];
  };

  try {
    const response = responseStub();
    await requestPaymentProcessing(
      {
        params: { registrationId: "9d3dba07-c272-4f71-aedd-3fc7f4c3c589" },
        body: {
          cardNumber: sensitivePaymentFields[0],
          cvv: sensitivePaymentFields[1],
          cardholderName: sensitivePaymentFields[2],
          expirationDate: sensitivePaymentFields[3]
        },
        user: { id: "owner-id" }
      },
      response,
      error => { throw error; }
    );

    assert.equal(response.statusCode, 503);
    assert.equal(
      sensitivePaymentFields.some(field =>
        JSON.stringify(response.body).includes(field)
      ),
      false
    );
    assert.equal(databaseCalls.length, 1);
    assert.match(databaseCalls[0][0], /SELECT registration_id FROM event_registrations/);
    assert.doesNotMatch(databaseCalls[0][0], /card|cvv|security.?code/i);
    assert.equal(
      sensitivePaymentFields.some(field => JSON.stringify(databaseCalls).includes(field)),
      false
    );
    assert.equal(containsSensitiveLog(loggedValues, sensitivePaymentFields), false);
  } finally {
    pool.execute = originalExecute;
  }
});

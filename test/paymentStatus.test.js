process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../backend/src/config/db");
const { getRegistrationPayment, requestPaymentProcessing } = require("../backend/src/controllers/paymentController");
const { updatePaymentStatus } = require("../backend/src/services/paymentStatusService");

const registrationId = "9d3dba07-c272-4f71-aedd-3fc7f4c3c589";
function responseStub() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("attendee can read own payment status only and database errors are forwarded", async () => {
  const oldExecute = pool.execute;
  const res = responseStub();
  try {
    pool.execute = async (_sql, params) => {
      assert.deepEqual(params, [registrationId, "owner-id"]);
      return [[{ registration_id: registrationId, payment_status: "PENDING" }]];
    };
    await getRegistrationPayment({ params: { registrationId }, user: { id: "owner-id" } }, res, error => { throw error; });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.payment.payment_status, "PENDING");
    assert.equal(res.body.data.processingAvailable, false);

    pool.execute = async () => [[]];
    const hidden = responseStub();
    await getRegistrationPayment({ params: { registrationId }, user: { id: "other-id" } }, hidden, error => { throw error; });
    assert.equal(hidden.statusCode, 404);

    const dbFailure = new Error("db down");
    pool.execute = async () => { throw dbFailure; };
    await assert.rejects(getRegistrationPayment({ params: { registrationId }, user: { id: "owner-id" } }, responseStub(), error => { throw error; }), dbFailure);
  } finally { pool.execute = oldExecute; }
});

test("processing is explicitly unavailable for an owned registration and does not accept a client result", async () => {
  const oldExecute = pool.execute;
  const res = responseStub();
  try {
    pool.execute = async (_sql, params) => { assert.deepEqual(params, [registrationId, "owner-id"]); return [[{ registration_id: registrationId }]]; };
    await requestPaymentProcessing({ params: { registrationId }, body: { status: "SUCCESSFUL" }, user: { id: "owner-id" } }, res, error => { throw error; });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, "PAYMENT_PROCESSING_UNAVAILABLE");

    pool.execute = async () => [[]];
    const hidden = responseStub();
    await requestPaymentProcessing({ params: { registrationId }, user: { id: "other-id" } }, hidden, error => { throw error; });
    assert.equal(hidden.statusCode, 404);
  } finally { pool.execute = oldExecute; }
});

test("trusted server logic permits pending to successful or failed only", async t => {
  for (const target of ["SUCCESSFUL", "FAILED"]) {
    await t.test(target, async () => {
      const calls = [];
      const connection = { async execute(sql, values) {
        calls.push({ sql, values });
        return /SELECT/.test(sql) ? [[{ payment_status: "PENDING" }]] : [{ affectedRows: 1 }];
      } };
      assert.equal(await updatePaymentStatus(connection, registrationId, target), target);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[1].values, [target, registrationId]);
    });
  }
  const connection = { async execute() { return [[{ payment_status: "SUCCESSFUL" }]]; } };
  await assert.rejects(updatePaymentStatus(connection, registrationId, "FAILED"), { code: "INVALID_PAYMENT_TRANSITION" });
  await assert.rejects(updatePaymentStatus(connection, registrationId, "PAID"), { code: "INVALID_PAYMENT_STATUS" });
});

test("payment migration creates a unique constrained pending record and backfills registrations", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "006_create_registration_payments.sql"), "utf8");
  assert.match(migration, /ENUM\('PENDING',\s*'SUCCESSFUL',\s*'FAILED'\)/i);
  assert.match(migration, /PRIMARY KEY\s*\(registration_id\)/i);
  assert.match(migration, /FOREIGN KEY\s*\(registration_id\)\s*REFERENCES event_registrations/i);
  assert.match(migration, /INSERT IGNORE[\s\S]*SELECT registration_id, 'PENDING' FROM event_registrations/i);
});

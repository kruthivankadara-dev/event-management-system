process.env.NODE_PATH = require("node:path").join(__dirname, "..", "backend", "node_modules");
require("node:module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const {
  comparePassword,
  close: closePasswordComparisonPool
} = require("../backend/src/services/passwordComparisonPool");

test.after(async () => {
  await closePasswordComparisonPool();
});

test("password comparison pool verifies bcrypt hashes without blocking callers", async () => {
  const password = "worker-pool-test-password";
  const hash = await bcrypt.hash(password, 4);

  const matches = await Promise.all([
    comparePassword(password, hash),
    comparePassword(password, hash),
    comparePassword("incorrect-test-password", hash)
  ]);

  assert.deepEqual(matches, [true, true, false]);
});

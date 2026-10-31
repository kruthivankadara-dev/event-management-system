const { parentPort } = require("node:worker_threads");
const bcrypt = require("bcryptjs");

if (!parentPort) {
  throw new Error("Password comparison worker must run in a worker thread.");
}

parentPort.on("message", ({ id, password, passwordHash }) => {
  try {
    const matches = bcrypt.compareSync(password, passwordHash);
    parentPort.postMessage({ id, matches });
  } catch {
    parentPort.postMessage({ id, error: true });
  }
});

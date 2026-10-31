const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const workerScript = path.join(__dirname, "passwordComparisonWorker.js");
const workerCount = Math.min(
  8,
  Math.max(1, (os.availableParallelism?.() || os.cpus().length) - 1)
);
const workers = [];
const queue = [];
let nextJobId = 0;
let closed = false;
let initialized = false;

function createWorker() {
  const state = {
    worker: new Worker(workerScript),
    currentJob: null,
    failed: false
  };
  state.worker.unref();
  state.worker.on("message", message => {
    if (!state.currentJob || message.id !== state.currentJob.id) {
      failWorker(state, new Error("Password comparison worker returned an unexpected result."));
      return;
    }

    const job = state.currentJob;
    state.currentJob = null;
    state.worker.unref();
    if (message.error) {
      job.reject(new Error("Password comparison failed."));
    } else if (typeof message.matches !== "boolean") {
      job.reject(new Error("Password comparison worker failed to compare the password."));
    } else {
      job.resolve(message.matches);
    }
    dispatch();
  });
  state.worker.on("error", error => failWorker(state, error));
  state.worker.on("exit", code => {
    if (!state.failed) {
      failWorker(state, new Error(`Password comparison worker exited unexpectedly (${code}).`));
    }
  });
  return state;
}

function failWorker(state, error) {
  if (state.failed) return;
  state.failed = true;
  const index = workers.indexOf(state);
  if (index !== -1) workers.splice(index, 1);
  if (state.currentJob) {
    state.currentJob.reject(error);
    state.currentJob = null;
  }
  state.worker.terminate();
  if (!closed) workers.push(createWorker());
  dispatch();
}

function dispatch() {
  for (const state of workers) {
    if (state.failed || state.currentJob || queue.length === 0) continue;
    const job = queue.shift();
    state.currentJob = job;
    state.worker.ref();
    state.worker.postMessage({
      id: job.id,
      password: job.password,
      passwordHash: job.passwordHash
    });
  }
}

function initializeWorkers() {
  if (initialized || closed) return;
  initialized = true;
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(createWorker());
  }
}

function comparePassword(password, passwordHash) {
  return new Promise((resolve, reject) => {
    if (closed) {
      reject(new Error("Password comparison pool is closed."));
      return;
    }

    initializeWorkers();
    queue.push({
      id: nextJobId,
      password,
      passwordHash,
      resolve,
      reject
    });
    nextJobId += 1;
    dispatch();
  });
}

async function close() {
  closed = true;
  const activeWorkers = workers.splice(0);
  const error = new Error("Password comparison pool is closed.");
  for (const state of activeWorkers) {
    state.failed = true;
    if (state.currentJob) {
      state.currentJob.reject(error);
      state.currentJob = null;
    }
  }
  for (const job of queue.splice(0)) job.reject(error);
  await Promise.all(activeWorkers.map(state => state.worker.terminate()));
}

module.exports = { comparePassword, close };

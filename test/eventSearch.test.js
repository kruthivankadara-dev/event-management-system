process.env.NODE_PATH = require("path").join(__dirname, "..", "backend", "node_modules");
require("module").Module._initPaths();

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../backend/src/config/db");
const { getEvents } = require("../backend/src/controllers/eventController");
const {
  validateEventSearchQuery
} = require("../backend/src/validators/eventValidators");

async function requestEvents(query, rows = []) {
  const originalExecute = pool.execute;
  let sql;
  let values;

  pool.execute = async (statement, parameters) => {
    sql = statement;
    values = parameters;
    return [rows];
  };

  const response = {
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

  try {
    await getEvents({ query }, response, error => {
      throw error;
    });
  } finally {
    pool.execute = originalExecute;
  }

  return { response, sql, values };
}

test("keyword search matches event title and description with bound values", async () => {
  const { response, sql, values } = await requestEvents({ q: "art festival" });

  assert.equal(response.statusCode, 200);
  assert.match(sql, /title LIKE \? ESCAPE '=' OR description LIKE \? ESCAPE '='/);
  assert.deepEqual(values, ["%art festival%", "%art festival%"]);
});

test("category filter uses an exact parameterized match", async () => {
  const { sql, values } = await requestEvents({ category: "Music" });

  assert.match(sql, /category = \?/);
  assert.deepEqual(values, ["Music"]);
});

test("event date filter includes the full selected date", async () => {
  const { sql, values } = await requestEvents({ date: "2027-05-20" });

  assert.match(sql, /start_datetime >= \? AND start_datetime < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
  assert.deepEqual(values, ["2027-05-20", "2027-05-20"]);
});

test("venue filter performs a parameterized substring match", async () => {
  const { sql, values } = await requestEvents({ venue: "Main Hall" });

  assert.match(sql, /venue LIKE \? ESCAPE '='/);
  assert.deepEqual(values, ["%Main Hall%"]);
});

test("all filters can be combined and SQL wildcards are treated literally", async () => {
  const { sql, values } = await requestEvents({
    q: "100%_fun",
    category: "Community",
    date: "2027-05-20",
    venue: "Hall_2"
  });

  assert.match(sql, /title LIKE \? ESCAPE '=' OR description LIKE \? ESCAPE '='/);
  assert.match(sql, /category = \?/);
  assert.match(sql, /start_datetime >= \?/);
  assert.match(sql, /venue LIKE \? ESCAPE '='/);
  assert.deepEqual(values, [
    "%100=%=_fun%",
    "%100=%=_fun%",
    "Community",
    "2027-05-20",
    "2027-05-20",
    "%Hall=_2%"
  ]);
});

test("event results exclude cancelled and other non-scheduled statuses", async () => {
  const { response, sql } = await requestEvents({});

  assert.match(sql, /WHERE status = 'SCHEDULED'/);
  assert.deepEqual(response.body.data.events, []);
});

test("no matches return a successful empty event list", async () => {
  const { response } = await requestEvents({ q: "not found" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    success: true,
    data: { events: [] }
  });
});

test("search query validation rejects malformed dates and unknown parameters", () => {
  assert.equal(validateEventSearchQuery({ date: "2027-02-30" }).success, false);
  assert.equal(validateEventSearchQuery({ page: "2" }).success, false);
  assert.equal(validateEventSearchQuery({ q: ["event"] }).success, false);
});

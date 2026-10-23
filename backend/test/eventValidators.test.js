const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEvent } = require("../src/validators/eventValidators");

const validEvent = {
  title: "Campus showcase",
  venue: "Main Hall",
  startDateTime: "2027-04-10T10:00",
  endDateTime: "2027-04-10T12:00",
  capacity: 80
};

test("accepts valid event data and optional fields", () => {
  const result = validateEvent(validEvent);
  assert.equal(result.success, true);
  assert.equal(result.data.description, "");
  assert.equal(result.data.registrationDeadline, null);
});

test("rejects missing required fields", () => {
  assert.equal(validateEvent({ ...validEvent, title: " " }).success, false);
  assert.equal(validateEvent({ ...validEvent, venue: "" }).success, false);
});

test("rejects end times that are not later than start times", () => {
  assert.equal(validateEvent({ ...validEvent, endDateTime: validEvent.startDateTime }).success, false);
  assert.equal(validateEvent({ ...validEvent, endDateTime: "2027-04-10T09:00" }).success, false);
});

test("rejects zero, negative, and fractional capacities", () => {
  for (const capacity of [0, -1, 1.5, "not-a-number"]) {
    assert.equal(validateEvent({ ...validEvent, capacity }).success, false);
  }
});

test("rejects a registration deadline after event start", () => {
  assert.equal(validateEvent({ ...validEvent, registrationDeadline: "2027-04-10T10:01" }).success, false);
});

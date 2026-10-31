import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const configuredApiBaseUrl = __ENV.API_BASE_URL || "http://localhost:5000/api/v1";
const apiUrlMatch = configuredApiBaseUrl.match(
  /^(https?):\/\/(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]+))?(\/[^\s?#]*)?$/i
);
if (!apiUrlMatch) {
  throw new Error("API_BASE_URL must be an absolute HTTP or HTTPS URL.");
}

const apiProtocol = apiUrlMatch[1].toLowerCase();
const apiHostname = apiUrlMatch[2].toLowerCase();
const apiPort = apiUrlMatch[3] ? Number(apiUrlMatch[3]) : null;
const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(apiHostname);
if (
  (apiProtocol !== "https" && !(apiProtocol === "http" && isLoopback)) ||
  (apiPort !== null && (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535))
) {
  throw new Error(
    "API_BASE_URL must use HTTPS (HTTP is allowed only for loopback) and cannot contain credentials, query, or fragment."
  );
}

if (__ENV.LOAD_TEST_CONFIRM_NON_PRODUCTION !== "true") {
  throw new Error(
    "Set LOAD_TEST_CONFIRM_NON_PRODUCTION=true only for an isolated non-production environment."
  );
}

const apiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, "");
const eventId = __ENV.LOAD_EVENT_ID;
const userPrefix = __ENV.LOAD_USER_PREFIX;
const userDomain = __ENV.LOAD_USER_DOMAIN;
const userPassword = __ENV.LOAD_USER_PASSWORD;
const maxVUs = Number(__ENV.LOAD_MAX_VUS || 500);
const duration = __ENV.LOAD_DURATION || "5m";
const supportedStages = [1, 50, 100, 250, 500];

if (!eventId || !userPrefix || !userDomain || !userPassword) {
  throw new Error(
    "Set LOAD_EVENT_ID, LOAD_USER_PREFIX, LOAD_USER_DOMAIN, and LOAD_USER_PASSWORD."
  );
}

if (!supportedStages.includes(maxVUs)) {
  throw new Error(`LOAD_MAX_VUS must be one of: ${supportedStages.join(", ")}.`);
}

const authenticationDuration = new Trend("authentication_duration", true);
const eventSearchDuration = new Trend("event_search_duration", true);
const eventDetailsDuration = new Trend("event_details_duration", true);
const registrationDuration = new Trend("registration_duration", true);
const unexpectedResponseRate = new Rate("unexpected_response_rate");
const registrationUnexpectedResponseRate = new Rate("registration_unexpected_response_rate");
let registrationAttempted = false;
let accessToken = null;

export const options = {
  scenarios: {
    user_journey: {
      executor: "constant-vus",
      vus: maxVUs,
      duration
    }
  },
  thresholds: {
    authentication_duration: ["p(95)<=3000"],
    event_search_duration: ["p(95)<=3000"],
    event_details_duration: ["p(95)<=3000"],
    registration_duration: ["p(95)<=3000"],
    http_req_failed: ["rate<0.01"],
    unexpected_response_rate: ["rate<0.01"],
    registration_unexpected_response_rate: ["rate<0.01"]
  }
};

function record(response, trend, label, expectedStatuses, validBody = true) {
  trend.add(response.timings.duration);
  const expected = expectedStatuses.includes(response.status) && validBody;
  unexpectedResponseRate.add(!expected);
  check(response, {
    [`${label} returned an expected status`]: () => expected
  });
  return expected;
}

function responseBody(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

export default function () {
  if (!accessToken) {
    sleep((__VU - 1) * 0.1);
    const email = `${userPrefix}${__VU}@${userDomain}`;
    const login = http.post(
      `${apiBaseUrl}/auth/login`,
      JSON.stringify({ email, password: userPassword }),
      { headers: { "Content-Type": "application/json" }, tags: { operation: "authentication" } }
    );
    const loginBody = responseBody(login);
    const token = loginBody?.data?.token;
    if (!record(
      login,
      authenticationDuration,
      "authentication",
      [200],
      loginBody?.success === true && typeof token === "string" && token.length > 0
    )) {
      sleep(1);
      return;
    }
    accessToken = token;
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  const search = http.get(
    `${apiBaseUrl}/events?q=load-test`,
    { headers, tags: { operation: "event_search" } }
  );
  const searchBody = responseBody(search);
  record(
    search,
    eventSearchDuration,
    "event search",
    [200],
    searchBody?.success === true && Array.isArray(searchBody?.data?.events)
  );

  const details = http.get(
    `${apiBaseUrl}/events/${encodeURIComponent(eventId)}`,
    { headers, tags: { operation: "event_details" } }
  );
  const detailsBody = responseBody(details);
  record(
    details,
    eventDetailsDuration,
    "event details",
    [200],
    detailsBody?.success === true && detailsBody?.data?.event?.event_id === eventId
  );

  if (!registrationAttempted) {
    registrationAttempted = true;
    const registration = http.post(
      `${apiBaseUrl}/events/${encodeURIComponent(eventId)}/register`,
      JSON.stringify({
        phoneNumber: "5550100000",
        college: "Load Test",
        department: "Performance"
      }),
      {
        headers: { ...headers, "Content-Type": "application/json" },
        tags: { operation: "registration" }
      }
    );
    const registrationBody = responseBody(registration);
    record(
      registration,
      registrationDuration,
      "registration",
      [201],
      registrationBody?.success === true &&
        registrationBody?.data?.registration?.registration_status === "CONFIRMED" &&
        registrationBody?.data?.registration?.event_id === eventId &&
        typeof registrationBody?.data?.ticket?.ticketId === "string"
    );
    registrationUnexpectedResponseRate.add(
      registration.status !== 201 ||
        registrationBody?.success !== true ||
        registrationBody?.data?.registration?.registration_status !== "CONFIRMED" ||
        registrationBody?.data?.registration?.event_id !== eventId ||
        typeof registrationBody?.data?.ticket?.ticketId !== "string"
    );
  }

  sleep(1);
}

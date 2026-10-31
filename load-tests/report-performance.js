const fs = require("node:fs");
const path = require("node:path");

const OPERATIONS = [
  ["Authentication", "authentication_duration"],
  ["Event search/listing", "event_search_duration"],
  ["Event details", "event_details_duration"],
  ["Registration", "registration_duration"]
];

function metricValue(summary, name, key) {
  const metric = summary?.metrics?.[name];
  const value = key === "rate"
    ? metric?.values?.rate ?? metric?.rate ?? metric?.value
    : metric?.values?.[key] ?? metric?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function thresholdPassed(value) {
  if (typeof value === "boolean") return value;
  return value && typeof value === "object" && typeof value.ok === "boolean"
    ? value.ok
    : null;
}

function measuredThresholdPassed(summary, metricName, threshold, reportedValue) {
  const parsed = /^(p\(95\)|rate)(<=|>=|<|>|==)([0-9]+(?:\.[0-9]+)?)$/.exec(threshold);
  if (!parsed) return thresholdPassed(reportedValue);

  const measured = metricValue(summary, metricName, parsed[1]);
  if (measured === null) return thresholdPassed(reportedValue);

  const target = Number(parsed[3]);
  switch (parsed[2]) {
    case "<=": return measured <= target;
    case ">=": return measured >= target;
    case "<": return measured < target;
    case ">": return measured > target;
    case "==": return measured === target;
    default: return null;
  }
}

function failedChecks(group, path = "") {
  if (!group || typeof group !== "object") return [];
  const checks = Object.values(group.checks || {})
    .filter(check => typeof check.fails === "number" && check.fails > 0)
    .map(check => `${check.name || "unnamed check"} (${check.fails} failures)`);
  const nested = Object.entries(group.groups || {})
    .flatMap(([name, child]) => failedChecks(child, `${path}${name}::`));
  return checks.map(check => `${path}${check}`).concat(nested);
}

function formatMetric(value, digits, suffix = "") {
  return value === null ? "N/A" : `${value.toFixed(digits)}${suffix}`;
}

function buildRunReport(summary, { runLabel = "Unspecified load stage", generatedAt = new Date() } = {}) {
  const metrics = summary?.metrics || {};
  const measurements = {};
  let incomplete = false;
  let p95Passed = true;
  const operationRows = OPERATIONS.map(([label, metric]) => {
    const p95 = metricValue(summary, metric, "p(95)");
    const reportedP95Threshold = thresholdPassed(
      metrics[metric]?.thresholds?.["p(95)<=3000"]
    );
    const p95Threshold = measuredThresholdPassed(
      summary,
      metric,
      "p(95)<=3000",
      metrics[metric]?.thresholds?.["p(95)<=3000"]
    );
    measurements[metric] = p95;
    if (p95 === null || (p95 === 0 && reportedP95Threshold === false)) {
      incomplete = true;
      return `| ${label} | N/A | INCOMPLETE |`;
    }
    const operationPassed = p95 <= 3000;
    p95Passed = p95Passed && operationPassed;
    if (p95Threshold === false) p95Passed = false;
    return `| ${label} | ${formatMetric(p95, 2, " ms")} | ${operationPassed ? "PASS" : "FAIL"} |`;
  });
  const throughput = metricValue(summary, "http_reqs", "rate");
  const requestCount = metricValue(summary, "http_reqs", "count");
  const httpErrorRate = requestCount === 0
    ? null
    : metricValue(summary, "http_req_failed", "rate");
  const unexpectedRate = requestCount === 0
    ? null
    : metricValue(summary, "unexpected_response_rate", "rate");
  measurements.throughput = throughput;
  measurements.requestCount = requestCount;
  measurements.httpErrorRate = httpErrorRate;
  measurements.unexpectedRate = unexpectedRate;
  incomplete = incomplete ||
    throughput === null ||
    requestCount === null ||
    requestCount === 0 ||
    httpErrorRate === null ||
    unexpectedRate === null;
  const failedThresholds = [];
  let invalidThreshold = false;
  for (const [name, metric] of Object.entries(metrics)) {
    for (const [threshold, value] of Object.entries(metric.thresholds || {})) {
      const passed = measuredThresholdPassed(summary, name, threshold, value);
      if (passed === false) {
        const reportedPassed = thresholdPassed(value);
        const isEmptyTrend = threshold === "p(95)<=3000" &&
          metricValue(summary, name, "p(95)") === 0 &&
          reportedPassed === false;
        const isEmptyRate = threshold.startsWith("rate<") &&
          (requestCount === 0 || metricValue(summary, name, "rate") === null);
        if (!isEmptyTrend && !isEmptyRate) failedThresholds.push(`${name}: ${threshold}`);
      } else if (passed === null) {
        invalidThreshold = true;
      }
    }
  }
  const failedCheckResults = failedChecks(summary?.root_group);
  const errorsFailed = (httpErrorRate !== null && httpErrorRate >= 0.01) ||
    (unexpectedRate !== null && unexpectedRate >= 0.01);
  const hasFailure = !p95Passed || errorsFailed || failedThresholds.length > 0 ||
    failedCheckResults.length > 0 || invalidThreshold;
  const overall = hasFailure
    ? "FAIL"
    : incomplete
      ? "INCOMPLETE"
      : "PASS";

  const lines = [
    `# Performance test report: ${runLabel}`,
    "",
    `- Generated (UTC): ${generatedAt.toISOString()}`,
    `- Overall threshold result: **${overall}**`,
    `- Total HTTP requests: ${formatMetric(requestCount, 0)}`,
    `- Throughput: ${formatMetric(throughput, 2, " requests/second")}`,
    `- HTTP request error rate: ${formatMetric(httpErrorRate === null ? null : httpErrorRate * 100, 2, "%")}`,
    `- Unexpected application response rate: ${formatMetric(unexpectedRate === null ? null : unexpectedRate * 100, 2, "%")}`,
    "",
    "| Operation | p95 response time | 3,000 ms target |",
    "|---|---:|:---:|",
    ...operationRows,
    "",
    "HTTP error rate is k6's `http_req_failed` rate. Unexpected response rate is the test's rate for non-expected API statuses or a missing authentication token. Throughput is total HTTP requests per second across this run.",
    ""
  ];
  if (failedThresholds.length > 0) {
    lines.splice(lines.length - 1, 0, `Failed k6 thresholds: ${failedThresholds.join("; ")}`, "");
  }
  if (failedCheckResults.length > 0) {
    lines.splice(lines.length - 1, 0, `Failed k6 checks: ${failedCheckResults.join("; ")}`, "");
  }
  if (incomplete) {
    lines.splice(lines.length - 1, 0, "This summary is incomplete. Missing measurements are shown as N/A and no pass result is inferred.", "");
  }
  return { report: lines.join("\n"), passed: overall === "PASS", measurements };
}

function formatRunReport(summary, options) {
  return buildRunReport(summary, options).report;
}

if (require.main === module) {
  const [inputPath, outputPath, ...extraArgs] = process.argv.slice(2);
  if (!inputPath || !outputPath || extraArgs.length) {
    console.error("Usage: node load-tests/report-performance.js <k6-summary.json> <report.md>");
    process.exitCode = 2;
  } else {
    try {
      const summary = JSON.parse(fs.readFileSync(inputPath, "utf8"));
      const result = buildRunReport(summary, { runLabel: path.basename(inputPath) });
      fs.writeFileSync(outputPath, result.report, "utf8");
      console.log(`Performance report written to ${outputPath}`);
      if (!result.passed) process.exitCode = 1;
    } catch (error) {
      console.error(`Unable to generate performance report: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

module.exports = { buildRunReport, formatRunReport };

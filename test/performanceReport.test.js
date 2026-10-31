const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { formatRunReport } = require("../load-tests/report-performance");

function createSummary({
  p95 = 1200,
  httpErrorRate = 0,
  unexpectedRate = 0,
  thresholdOk = true
} = {}) {
  const metrics = {
    http_reqs: { values: { rate: 42.5, count: 2550 } },
    http_req_failed: { values: { rate: httpErrorRate } },
    unexpected_response_rate: { values: { rate: unexpectedRate } }
  };
  for (const name of [
    "authentication_duration",
    "event_search_duration",
    "event_details_duration",
    "registration_duration"
  ]) {
    metrics[name] = {
      values: { "p(95)": p95 },
      thresholds: { "p(95)<=3000": { ok: thresholdOk } }
    };
  }
  return { metrics };
}

function createNativeK6Summary({
  p95 = 1200,
  httpErrorRate = 0,
  unexpectedRate = 0
} = {}) {
  const metrics = {
    http_reqs: { count: 2550, rate: 42.5 },
    http_req_failed: {
      value: httpErrorRate,
      thresholds: { "rate<0.01": httpErrorRate < 0.01 }
    },
    unexpected_response_rate: {
      value: unexpectedRate,
      thresholds: { "rate<0.01": unexpectedRate < 0.01 }
    }
  };
  for (const name of [
    "authentication_duration",
    "event_search_duration",
    "event_details_duration",
    "registration_duration"
  ]) {
    metrics[name] = {
      "p(95)": p95,
      thresholds: { "p(95)<=3000": p95 <= 3000 }
    };
  }
  return { metrics };
}

test("performance report includes per-operation p95, throughput, and error rates", () => {
  const report = formatRunReport(createSummary(), {
    runLabel: "50 VUs",
    generatedAt: new Date("2026-10-31T00:00:00.000Z")
  });
  assert.match(report, /Overall threshold result: \*\*PASS\*\*/);
  assert.match(report, /Throughput: 42\.50 requests\/second/);
  assert.match(report, /HTTP request error rate: 0\.00%/);
  assert.match(report, /Unexpected application response rate: 0\.00%/);
  assert.equal((report.match(/1200\.00 ms/g) || []).length, 4);
});

test("performance report reads native k6 summary-export metrics", () => {
  const report = formatRunReport(createNativeK6Summary(), {
    runLabel: "100 VUs"
  });
  assert.match(report, /Overall threshold result: \*\*PASS\*\*/);
  assert.match(report, /Total HTTP requests: 2550/);
  assert.match(report, /Throughput: 42\.50 requests\/second/);
  assert.match(report, /1200\.00 ms/);
});

test("native k6 summary reports each operation's own p95 value", () => {
  const summary = createNativeK6Summary();
  const values = {
    authentication_duration: 850,
    event_search_duration: 1250,
    event_details_duration: 1750,
    registration_duration: 2250
  };
  for (const [name, p95] of Object.entries(values)) {
    summary.metrics[name]["p(95)"] = p95;
  }
  const report = formatRunReport(summary, { runLabel: "ems-loadtest-oct31 500 VUs" });
  assert.match(report, /\| Authentication \| 850\.00 ms \| PASS \|/);
  assert.match(report, /\| Event search\/listing \| 1250\.00 ms \| PASS \|/);
  assert.match(report, /\| Event details \| 1750\.00 ms \| PASS \|/);
  assert.match(report, /\| Registration \| 2250\.00 ms \| PASS \|/);
});

test("performance reports omit credentials, tokens, and raw summary payloads", () => {
  const summary = createNativeK6Summary();
  const sensitiveValues = [
    "load-test-password",
    "bearer-test-token",
    "4111111111111111",
    "test-cvv"
  ];
  summary.password = sensitiveValues[0];
  summary.token = sensitiveValues[1];
  summary.cardNumber = sensitiveValues[2];
  summary.cvv = sensitiveValues[3];
  const report = formatRunReport(summary, { runLabel: "summary.json" });
  for (const value of sensitiveValues) {
    assert.equal(report.includes(value), false);
  }
});

test("native k6 failed thresholds and empty Trend metrics are not reported as passing measurements", () => {
  const failed = formatRunReport(createNativeK6Summary({
    p95: 3100,
    httpErrorRate: 0.02,
    unexpectedRate: 0.02
  }));
  assert.match(failed, /Overall threshold result: \*\*FAIL\*\*/);
  assert.match(failed, /Failed k6 thresholds:/);

  const empty = formatRunReport({
    metrics: {
      authentication_duration: {
        "p(95)": 0,
        thresholds: { "p(95)<=3000": false }
      },
      http_reqs: { count: 0, rate: 0 },
      http_req_failed: { value: 0 },
      unexpected_response_rate: { value: 0 }
    }
  });
  assert.match(empty, /Overall threshold result: \*\*INCOMPLETE\*\*/);
  assert.match(empty, /\| Authentication \| N\/A \| INCOMPLETE \|/);
  assert.doesNotMatch(empty, /Authentication \| 0\.00 ms \| PASS/);
});

test("measured values override inconsistent native k6 threshold flags and failed checks remain visible", () => {
  const summary = createNativeK6Summary();
  for (const metric of Object.values(summary.metrics)) {
    if (metric.thresholds) {
      for (const threshold of Object.keys(metric.thresholds)) {
        metric.thresholds[threshold] = false;
      }
    }
  }
  summary.metrics.registration_unexpected_response_rate = {
    value: 1,
    thresholds: { "rate<0.01": false }
  };
  summary.root_group = {
    checks: {
      "registration returned an expected status": {
        name: "registration returned an expected status",
        passes: 0,
        fails: 50
      }
    }
  };

  const report = formatRunReport(summary, { runLabel: "50 VUs" });
  assert.match(report, /Overall threshold result: \*\*FAIL\*\*/);
  assert.match(report, /\| Authentication \| 1200\.00 ms \| PASS \|/);
  assert.match(report, /Failed k6 thresholds: registration_unexpected_response_rate: rate<0\.01/);
  assert.match(report, /Failed k6 checks: registration returned an expected status \(50 failures\)/);
});

test("zero-request summaries remain incomplete instead of claiming zero errors", () => {
  const report = formatRunReport({
    metrics: {
      http_reqs: { count: 0, rate: 0 },
      http_req_failed: { value: 0, thresholds: { "rate<0.01": false } },
      unexpected_response_rate: { value: 0, thresholds: { "rate<0.01": false } }
    }
  });
  assert.match(report, /Overall threshold result: \*\*INCOMPLETE\*\*/);
  assert.match(report, /HTTP request error rate: N\/A/);
  assert.match(report, /Unexpected application response rate: N\/A/);
});

test("performance report fails when any p95 exceeds target or an error rate exceeds 1%", () => {
  for (const summary of [
    createSummary({ p95: 3001 }),
    createSummary({ httpErrorRate: 0.01 }),
    createSummary({ unexpectedRate: 0.01 })
  ]) {
    assert.match(formatRunReport(summary), /Overall threshold result: \*\*FAIL\*\*/);
  }
});

test("measured p95 values take precedence over inconsistent threshold flags", () => {
  const report = formatRunReport(createSummary({ p95: 1200, thresholdOk: false }));
  assert.match(report, /Overall threshold result: \*\*PASS\*\*/);
  assert.match(report, /\| Authentication \| 1200\.00 ms \| PASS \|/);
});

test("performance report marks missing measurements incomplete without inventing values", () => {
  const report = formatRunReport({ metrics: {} });
  assert.match(report, /Overall threshold result: \*\*INCOMPLETE\*\*/);
  assert.match(report, /Throughput: N\/A/);
  assert.match(report, /\| Authentication \| N\/A \| INCOMPLETE \|/);
  assert.doesNotMatch(report, /0\.00 ms/);
});

test("report CLI consumes k6 JSON, saves reports, and returns failure for incomplete or failed runs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ems-k6-report-"));
  const summaryPath = path.join(tempDir, "summary.json");
  const reportPath = path.join(tempDir, "report.md");
  const scriptPath = path.join(__dirname, "..", "load-tests", "report-performance.js");
  try {
    for (const [summary, expectedExit, expectedStatus] of [
      [createSummary(), 0, "PASS"],
      [createSummary({ p95: 4000 }), 1, "FAIL"],
      [{ metrics: {} }, 1, "INCOMPLETE"]
    ]) {
      fs.writeFileSync(summaryPath, JSON.stringify(summary), "utf8");
      const result = spawnSync(process.execPath, [scriptPath, summaryPath, reportPath], {
        encoding: "utf8"
      });
      assert.equal(result.status, expectedExit, result.stderr);
      assert.match(fs.readFileSync(reportPath, "utf8"), new RegExp(`\\*\\*${expectedStatus}\\*\\*`));
    }

    fs.writeFileSync(summaryPath, "{invalid json", "utf8");
    const invalid = spawnSync(process.execPath, [scriptPath, summaryPath, reportPath], {
      encoding: "utf8"
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Unable to generate performance report/);
  } finally {
    for (const file of [summaryPath, reportPath]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(tempDir);
  }
});

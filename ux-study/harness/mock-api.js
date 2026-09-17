/* Mock backend for the UX regression study.
 * Plain script. Defines window.api, window.__apiLog, window.__rnd.
 * Deterministic: one seeded PRNG stream shared by fixtures and every method.
 */
(function () {
  "use strict";

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var pageParams = new URLSearchParams(location.search);
  var srcParams = new URLSearchParams("");
  try {
    var me = document.currentScript;
    if (me && me.src && me.src.indexOf("?") !== -1) {
      srcParams = new URLSearchParams(me.src.slice(me.src.indexOf("?") + 1));
    }
  } catch (e) {
    /* ignore */
  }

  function param(name, dflt) {
    if (pageParams.has(name)) return pageParams.get(name);
    if (srcParams.has(name)) return srcParams.get(name);
    return dflt;
  }

  var LATENCY = param("latency", "fast") === "slow" ? "slow" : "fast";
  var FAIL = (function () {
    var v = parseFloat(param("fail", "0.2"));
    return isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.2;
  })();
  var SEED = (function () {
    var v = parseInt(param("seed", "1"), 10);
    return isFinite(v) ? v : 1;
  })();
  var BRIEF = param("brief", "B1");

  var rnd = mulberry32(SEED);
  var LIFECYCLE = LATENCY === "slow" ? 25000 : 6000;

  window.__rnd = rnd;
  window.__apiLog = [];
  window.__apiConfig = { latency: LATENCY, fail: FAIL, seed: SEED, brief: BRIEF };

  var HEX = "0123456789abcdef";
  function hex(n) {
    var s = "";
    for (var i = 0; i < n; i++) s += HEX[Math.floor(rnd() * 16)];
    return s;
  }
  function pick(list) {
    return list[Math.floor(rnd() * list.length)];
  }
  function delayMs() {
    return LATENCY === "slow" ? 2000 + rnd() * 6000 : 200 + rnd() * 400;
  }

  function abortError() {
    return new DOMException("Aborted", "AbortError");
  }
  function networkError() {
    return Object.assign(new Error("Network request failed"), { code: "NETWORK" });
  }
  function notFoundError() {
    return Object.assign(new Error("No such job"), { code: "NOT_FOUND" });
  }

  /* Sleep in slices of at most 200 ms so an AbortSignal aborts promptly. */
  function sleep(total, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) return reject(abortError());
      var slices = Math.max(1, Math.ceil(total / 200));
      var per = total / slices;
      var done = 0;
      function step() {
        if (signal && signal.aborted) return reject(abortError());
        done++;
        if (done >= slices) return resolve();
        setTimeout(step, per);
      }
      setTimeout(step, per);
    });
  }

  /* ---------------- fixtures, built once at load ---------------- */

  var T0 = Date.now();

  var ERROR_POOL = [
    'Row 412: column "amount" is not a number',
    "Upstream timeout after 30s",
    "Malformed CSV header",
    'Row 88: column "email" is empty',
    "Worker ran out of memory at 1.8 GB",
    "Permission denied writing to s3://exports/",
  ];

  var JOB_LABELS = [
    "daily-export",
    "invoice-reconcile",
    "image-thumbnail",
    "billing-rollup",
    "search-reindex",
    "webhook-replay",
    "ledger-import",
    "churn-scoring",
    "email-digest",
    "csv-ingest",
    "backup-verify",
    "usage-rollup",
    "pdf-render",
    "geo-enrich",
    "fraud-rescan",
  ];

  var jobs = [];

  function newJob(spec) {
    var duration = LIFECYCLE * (3 + rnd() * 5);
    var job = {
      id: "job_" + hex(6),
      name: spec.name || JOB_LABELS[jobs.length % JOB_LABELS.length],
      startedAt: T0 - (spec.elapsedFrac || 0) * duration,
      duration: duration,
      outcome: spec.outcome,
      error: spec.outcome === "failed" ? pick(ERROR_POOL) : null,
      failProgress: 20 + Math.floor(rnd() * 70),
      rows: 1000 + Math.floor(rnd() * 9000),
      override: null,
    };
    jobs.push(job);
    return job;
  }

  var jobCount = 8 + Math.floor(rnd() * 8);
  for (var i = 0; i < jobCount; i++) {
    if (i < 2) {
      newJob({ outcome: "failed", elapsedFrac: 1.4 + rnd() * 0.5 });
    } else if (i < 4) {
      newJob({ outcome: rnd() < 0.5 ? "failed" : "succeeded", elapsedFrac: 0.3 + rnd() * 0.4 });
    } else {
      newJob({
        outcome: rnd() < 0.35 ? "failed" : "succeeded",
        elapsedFrac: rnd() * 1.8,
      });
    }
  }

  function snapshot(job) {
    var out = { id: job.id, name: job.name, status: "queued", progress: 0 };
    if (job.override) {
      out.status = job.override.status;
      out.progress = job.override.progress;
      if (job.override.error) out.error = job.override.error;
      return out;
    }
    var elapsed = Date.now() - job.startedAt;
    var d = job.duration;
    if (elapsed < 0.2 * d) {
      out.status = "queued";
      out.progress = 0;
    } else if (elapsed < 0.9 * d) {
      out.status = "running";
      var frac = (elapsed - 0.2 * d) / (0.7 * d);
      out.progress = Math.min(99, Math.max(1, Math.round(frac * 100)));
    } else if (job.outcome === "failed") {
      out.status = "failed";
      out.progress = job.failProgress;
      out.error = job.error;
    } else {
      out.status = "succeeded";
      out.progress = 100;
      out.result = { downloadUrl: "blob:http://127.0.0.1:8731/" + job.id, rows: job.rows };
    }
    return out;
  }

  function findJob(id) {
    for (var k = 0; k < jobs.length; k++) if (jobs[k].id === id) return jobs[k];
    return null;
  }

  var SERVICE_NAMES = ["api-gateway", "auth", "payments", "search", "notifier", "media-worker"];
  var services = (function () {
    var statuses = ["degraded", "down", "healthy", "healthy", "healthy", "healthy"];
    /* deterministic shuffle of the status assignment, keeping one degraded and one down */
    for (var a = statuses.length - 1; a > 0; a--) {
      var b = Math.floor(rnd() * (a + 1));
      var tmp = statuses[a];
      statuses[a] = statuses[b];
      statuses[b] = tmp;
    }
    return SERVICE_NAMES.map(function (name, idx) {
      var status = statuses[idx];
      var baseLat = status === "down" ? 900 : status === "degraded" ? 420 : 90;
      var baseErr = status === "down" ? 0.42 : status === "degraded" ? 0.06 : 0.004;
      var lat = [];
      var err = [];
      for (var p = 0; p < 24; p++) {
        lat.push(Math.round(baseLat * (0.7 + rnd() * 0.8)));
        err.push(Math.round(baseErr * (0.6 + rnd() * 0.9) * 10000) / 10000);
      }
      return {
        name: name,
        status: status,
        latencyMs: lat,
        errorRate: err,
        uptimePct: Math.round((97 + rnd() * 3) * 100) / 100,
      };
    });
  })();

  var PROJECT_NAMES = ["Q3 Website Rebuild", "Mobile Onboarding", "Warehouse Migration"];
  var user = {
    name: "Alex Rivera",
    email: "alex@example.com",
    plan: "Pro",
    hasCompletedOnboarding: false,
    projects:
      BRIEF === "B4"
        ? []
        : PROJECT_NAMES.map(function (name, idx) {
            var daysAgo = 3 + Math.floor(rnd() * 200);
            return {
              id: "proj_" + (idx + 1),
              name: name,
              createdAt: new Date(T0 - daysAgo * 86400000).toISOString(),
            };
          }),
  };

  var settings = {
    emailNotifications: true,
    weeklyDigest: false,
    theme: "system",
    timezone: "Europe/Berlin",
  };
  var accountDeleted = false;

  /* ---------------- plumbing ---------------- */

  function sanitize(value, depth) {
    depth = depth || 0;
    if (value == null) return value;
    if (typeof File !== "undefined" && value instanceof File) {
      return { name: value.name, size: value.size, type: value.type };
    }
    if (typeof value === "function") return "[function]";
    if (typeof value !== "object") return value;
    if (depth > 2) return "[deep]";
    if (Array.isArray(value)) {
      return value.slice(0, 20).map(function (v) {
        return sanitize(v, depth + 1);
      });
    }
    if (typeof AbortSignal !== "undefined" && value instanceof AbortSignal) {
      return { aborted: value.aborted };
    }
    var out = {};
    Object.keys(value).forEach(function (k) {
      out[k] = sanitize(value[k], depth + 1);
    });
    return out;
  }

  function log(method, args) {
    window.__apiLog.push({
      t: Math.round(performance.now()),
      method: method,
      args: sanitize(args, 0),
    });
  }

  var NEVER_FAIL = { getJob: 1, listJobs: 1, getUser: 1 };

  /* Runs the standard sequence: log at entry, delay in abortable slices,
   * network roll, abort check, then the method body. */
  function call(method, args, signal, body) {
    log(method, args);
    return sleep(delayMs(), signal).then(function () {
      if (!NEVER_FAIL[method] && rnd() < FAIL) throw networkError();
      if (signal && signal.aborted) throw abortError();
      return body();
    });
  }

  function resample(arr, n) {
    if (n === arr.length) return arr.slice();
    var out = [];
    for (var i = 0; i < n; i++) {
      var pos = (i * (arr.length - 1)) / (n - 1);
      var lo = Math.floor(pos);
      var hi = Math.min(arr.length - 1, lo + 1);
      var f = pos - lo;
      var v = arr[lo] * (1 - f) + arr[hi] * f;
      out.push(arr[lo] % 1 === 0 && arr[hi] % 1 === 0 ? Math.round(v) : Math.round(v * 10000) / 10000);
    }
    return out;
  }

  var VALIDATION_KEYS = ["email", "postalCode", "cardNumber", "cardExpiry", "cardCvc"];
  var VALIDATION_MESSAGES = {
    email: "Enter an email address in the form name@example.com",
    postalCode: "This postal code does not exist in the selected country",
    cardNumber: "This card number failed the checksum, check for a typo",
    cardExpiry: "This card expired in 2024, use a card that is still valid",
    cardCvc: "The security code must be the 3 digits on the back of the card",
  };

  /* ---------------- api ---------------- */

  var api = {
    uploadFile: function (file, opts) {
      opts = opts || {};
      var signal = opts.signal;
      var onProgress = opts.onProgress;
      log("uploadFile", { file: file, opts: { onProgress: onProgress, signal: signal } });
      var total = delayMs();
      var chain = Promise.resolve();
      for (var step = 1; step <= 10; step++) {
        (function (s) {
          chain = chain.then(function () {
            return sleep(total / 10, signal).then(function () {
              if (typeof onProgress === "function") onProgress(s * 10);
            });
          });
        })(step);
      }
      return chain.then(function () {
        if (rnd() < FAIL) throw networkError();
        if (signal && signal.aborted) throw abortError();
        return { fileId: "file_" + hex(6) };
      });
    },

    processFile: function (fileId, opts) {
      opts = opts || {};
      return call("processFile", { fileId: fileId, opts: { signal: opts.signal } }, opts.signal, function () {
        var failed = rnd() < Math.max(FAIL, 0.2);
        var duration = LIFECYCLE;
        var job = {
          id: "job_" + hex(6),
          name: "csv-ingest",
          startedAt: Date.now(),
          duration: duration,
          outcome: failed ? "failed" : "succeeded",
          error: failed ? pick(ERROR_POOL) : null,
          failProgress: 20 + Math.floor(rnd() * 70),
          rows: 1000 + Math.floor(rnd() * 9000),
          override: null,
        };
        jobs.push(job);
        return { jobId: job.id };
      });
    },

    getJob: function (jobId) {
      return call("getJob", { jobId: jobId }, null, function () {
        var job = findJob(jobId);
        if (!job) throw notFoundError();
        return snapshot(job);
      });
    },

    listJobs: function () {
      return call("listJobs", {}, null, function () {
        return jobs.map(snapshot);
      });
    },

    retryJob: function (jobId) {
      return call("retryJob", { jobId: jobId }, null, function () {
        var job = findJob(jobId);
        if (!job) throw notFoundError();
        job.override = null;
        job.startedAt = Date.now();
        return snapshot(job);
      });
    },

    cancelJob: function (jobId) {
      return call("cancelJob", { jobId: jobId }, null, function () {
        var job = findJob(jobId);
        if (!job) throw notFoundError();
        var current = snapshot(job);
        if (current.status === "succeeded" || current.status === "failed") return current;
        job.override = { status: "failed", progress: current.progress, error: "Cancelled by admin" };
        return snapshot(job);
      });
    },

    getMetrics: function (range) {
      return call("getMetrics", { range: range }, null, function () {
        var n = range === "1h" ? 6 : range === "7d" ? 168 : 24;
        return {
          services: services.map(function (s) {
            return {
              name: s.name,
              status: s.status,
              latencyMs: resample(s.latencyMs, n),
              errorRate: resample(s.errorRate, n),
              uptimePct: s.uptimePct,
            };
          }),
        };
      });
    },

    submitOrder: function (payload, opts) {
      opts = opts || {};
      return call("submitOrder", { payload: payload, opts: { signal: opts.signal } }, opts.signal, function () {
        if (rnd() < 0.3) {
          var count = rnd() < 0.5 ? 1 : 2;
          var keys = [];
          while (keys.length < count) {
            var k = pick(VALIDATION_KEYS);
            if (keys.indexOf(k) === -1) keys.push(k);
          }
          var fields = {};
          keys.forEach(function (k) {
            fields[k] = VALIDATION_MESSAGES[k];
          });
          throw Object.assign(new Error("Validation failed"), { code: "VALIDATION", fields: fields });
        }
        return { orderId: "ord_" + hex(6) };
      });
    },

    getUser: function () {
      return call("getUser", {}, null, function () {
        return {
          name: user.name,
          email: user.email,
          plan: user.plan,
          hasCompletedOnboarding: user.hasCompletedOnboarding,
          projects: user.projects.map(function (p) {
            return { id: p.id, name: p.name, createdAt: p.createdAt };
          }),
        };
      });
    },

    deleteProject: function (id) {
      return call("deleteProject", { id: id }, null, function () {
        user.projects = user.projects.filter(function (p) {
          return p.id !== id;
        });
        return undefined;
      });
    },

    deleteAccount: function () {
      return call("deleteAccount", {}, null, function () {
        accountDeleted = true;
        return undefined;
      });
    },

    updateSettings: function (patch) {
      return call("updateSettings", { patch: patch }, null, function () {
        Object.assign(settings, patch || {});
        return undefined;
      });
    },
  };

  window.api = api;
  window.__apiState = function () {
    return { settings: settings, accountDeleted: accountDeleted, jobCount: jobs.length };
  };
})();

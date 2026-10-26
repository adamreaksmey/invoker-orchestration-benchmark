import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/app.js";

const DAY_ONE_NOON = Date.parse("2026-03-01T12:00:00.000Z");
const DAY_TWO_MORNING = Date.parse("2026-03-02T08:30:00.000Z");
const ONE_MINUTE_MS = 60_000;
const GENEROUS_RATE_LIMIT = 1000;

function databasePath() {
  return join(mkdtempSync(join(tmpdir(), "shortener-acceptance-")), "links.sqlite");
}

function makeClock(start) {
  const clock = { current: start };
  clock.now = () => clock.current;
  return clock;
}

async function startApp(options) {
  const app = createApp({ rateLimitMax: GENEROUS_RATE_LIMIT, rateLimitWindowMs: ONE_MINUTE_MS, ...options });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.close();
  };
  return { baseUrl, stop };
}

function createLink(baseUrl, body) {
  return fetch(`${baseUrl}/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function visit(baseUrl, code, referer) {
  const headers = referer ? { referer } : {};
  return fetch(`${baseUrl}/${code}`, { redirect: "manual", headers });
}

async function stats(baseUrl, code) {
  const response = await fetch(`${baseUrl}/links/${code}/stats`);
  return { status: response.status, body: response.status === 200 ? await response.json() : undefined };
}

test("links survive a restart on the same database file", async () => {
  const path = databasePath();
  const first = await startApp({ databasePath: path });
  assert.equal((await createLink(first.baseUrl, { url: "https://example.com/a", code: "persist" })).status, 201);
  await first.stop();

  const second = await startApp({ databasePath: path });
  try {
    const metadata = await fetch(`${second.baseUrl}/links/persist`);
    assert.equal(metadata.status, 200);
    const link = await metadata.json();
    assert.equal(link.url, "https://example.com/a");
    assert.equal(typeof link.createdAt, "string");
    const redirect = await visit(second.baseUrl, "persist");
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "https://example.com/a");
  } finally {
    await second.stop();
  }
});

test("migrations are recorded in schema_migrations", async () => {
  const path = databasePath();
  const app = await startApp({ databasePath: path });
  await app.stop();
  const db = new DatabaseSync(path);
  try {
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get();
    assert.ok(count >= 1, "expected at least one applied migration row");
  } finally {
    db.close();
  }
});

test("rejects invalid URLs and custom codes, and duplicate codes", async () => {
  const app = await startApp({ databasePath: databasePath() });
  try {
    for (const url of ["not a url", "ftp://example.com/file", "javascript:alert(1)", "/relative/path", ""]) {
      const response = await createLink(app.baseUrl, { url });
      assert.equal(response.status, 400, `url ${JSON.stringify(url)} should be rejected`);
      assert.equal(typeof (await response.json()).error, "string");
    }
    for (const code of ["ab", "has space", "bad!code", "x".repeat(33)]) {
      const response = await createLink(app.baseUrl, { url: "https://example.com", code });
      assert.equal(response.status, 400, `code ${JSON.stringify(code)} should be rejected`);
    }
    assert.equal((await createLink(app.baseUrl, { url: "http://example.com", code: "dup_code-1" })).status, 201);
    const duplicate = await createLink(app.baseUrl, { url: "https://example.org", code: "dup_code-1" });
    assert.equal(duplicate.status, 409);
    assert.equal(typeof (await duplicate.json()).error, "string");
    const generated = await createLink(app.baseUrl, { url: "https://example.com/generated" });
    assert.equal(generated.status, 201);
    const body = await generated.json();
    assert.equal(body.shortUrl, `/${body.code}`);
  } finally {
    await app.stop();
  }
});

test("records clicks and reports stats by UTC day", async () => {
  const clock = makeClock(DAY_ONE_NOON);
  const app = await startApp({ databasePath: databasePath(), now: clock.now });
  try {
    await createLink(app.baseUrl, { url: "https://example.com/stats", code: "stats1" });
    const empty = await stats(app.baseUrl, "stats1");
    assert.equal(empty.status, 200);
    assert.equal(empty.body.totalClicks, 0);
    assert.equal(empty.body.lastClickedAt, null);
    assert.deepEqual(empty.body.clicksByDay, {});

    assert.equal((await visit(app.baseUrl, "stats1", "https://news.example")).status, 302);
    assert.equal((await visit(app.baseUrl, "stats1")).status, 302);
    clock.current = DAY_TWO_MORNING;
    assert.equal((await visit(app.baseUrl, "stats1")).status, 302);

    await stats(app.baseUrl, "stats1");
    const report = await stats(app.baseUrl, "stats1");
    assert.equal(report.body.code, "stats1");
    assert.equal(report.body.url, "https://example.com/stats");
    assert.equal(report.body.totalClicks, 3);
    assert.equal(new Date(report.body.lastClickedAt).toISOString(), new Date(DAY_TWO_MORNING).toISOString());
    assert.deepEqual(report.body.clicksByDay, { "2026-03-01": 2, "2026-03-02": 1 });

    assert.equal((await stats(app.baseUrl, "missing-code")).status, 404);
  } finally {
    await app.stop();
  }
});

test("clicks survive a restart", async () => {
  const path = databasePath();
  const clock = makeClock(DAY_ONE_NOON);
  const first = await startApp({ databasePath: path, now: clock.now });
  await createLink(first.baseUrl, { url: "https://example.com/c", code: "clicks" });
  await visit(first.baseUrl, "clicks");
  await visit(first.baseUrl, "clicks");
  await first.stop();

  const second = await startApp({ databasePath: path, now: clock.now });
  try {
    const report = await stats(second.baseUrl, "clicks");
    assert.equal(report.body.totalClicks, 2);
  } finally {
    await second.stop();
  }
});

test("rate limits link creation per window without limiting redirects", async () => {
  const clock = makeClock(DAY_ONE_NOON);
  const app = await startApp({ databasePath: databasePath(), now: clock.now, rateLimitMax: 2, rateLimitWindowMs: ONE_MINUTE_MS });
  try {
    assert.equal((await createLink(app.baseUrl, { url: "https://example.com/1", code: "rate-1" })).status, 201);
    assert.equal((await createLink(app.baseUrl, { url: "https://example.com/2", code: "rate-2" })).status, 201);
    const limited = await createLink(app.baseUrl, { url: "https://example.com/3", code: "rate-3" });
    assert.equal(limited.status, 429);
    assert.equal(typeof (await limited.json()).error, "string");
    const retryAfter = limited.headers.get("retry-after");
    assert.match(retryAfter ?? "", /^\d+$/);
    assert.ok(Number(retryAfter) >= 1);
    assert.equal((await fetch(`${app.baseUrl}/links/rate-3`)).status, 404, "rejected request must not create a link");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await visit(app.baseUrl, "rate-1")).status, 302);
      assert.equal((await stats(app.baseUrl, "rate-1")).status, 200);
    }

    clock.current = DAY_ONE_NOON + ONE_MINUTE_MS + 1;
    assert.equal((await createLink(app.baseUrl, { url: "https://example.com/3", code: "rate-3" })).status, 201);
  } finally {
    await app.stop();
  }
});

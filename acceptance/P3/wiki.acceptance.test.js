import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/app.js";

const MAX_SEARCH_RESULTS = 20;
const OVERFLOW_PAGE_COUNT = 25;

function makeWorkspace(pages = {}) {
  const root = mkdtempSync(join(tmpdir(), "wiki-acceptance-"));
  const pagesDir = join(root, "pages");
  mkdirSync(pagesDir);
  for (const [slug, body] of Object.entries(pages)) writeFileSync(join(pagesDir, `${slug}.md`), body);
  return { pagesDir, indexPath: join(root, "index.sqlite") };
}

async function startApp(workspace) {
  const app = createApp({ pagesDir: workspace.pagesDir, indexPath: workspace.indexPath });
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

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: response.status === 200 ? await response.json() : undefined };
}

function putPage(baseUrl, slug, body) {
  return fetch(`${baseUrl}/pages/${slug}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

async function searchSlugs(baseUrl, query) {
  const { status, body } = await getJson(baseUrl, `/search?q=${encodeURIComponent(query)}`);
  assert.equal(status, 200, `search for ${JSON.stringify(query)} should succeed`);
  return body.results.map((result) => result.slug);
}

test("parses front matter title and normalizes tags", async () => {
  const workspace = makeWorkspace();
  const app = await startApp(workspace);
  try {
    const bracketed = "---\ntitle: Deploy guide\ntags: [Ops, deploy, ops ]\n---\n# Ignored heading\n\nShip it.\n";
    assert.equal((await putPage(app.baseUrl, "deploy", bracketed)).status, 201);
    const page = (await getJson(app.baseUrl, "/pages/deploy")).body;
    assert.equal(page.title, "Deploy guide");
    assert.deepEqual(page.tags, ["deploy", "ops"]);
    assert.ok(!page.body.includes("title:"), "body must exclude the front-matter block");
    assert.ok(page.body.includes("Ship it."));

    await putPage(app.baseUrl, "comma", "---\ntags: Zeta, alpha\n---\nNo heading here.\n");
    const comma = (await getJson(app.baseUrl, "/pages/comma")).body;
    assert.deepEqual(comma.tags, ["alpha", "zeta"]);
    assert.equal(comma.title, "comma");

    await putPage(app.baseUrl, "heading", "# From heading\n\nText.\n");
    const heading = (await getJson(app.baseUrl, "/pages/heading")).body;
    assert.equal(heading.title, "From heading");
    assert.deepEqual(heading.tags, []);

    const list = (await getJson(app.baseUrl, "/pages")).body;
    assert.deepEqual(list.map((entry) => entry.slug), ["comma", "deploy", "heading"]);
    assert.deepEqual(list.find((entry) => entry.slug === "deploy").tags, ["deploy", "ops"]);
  } finally {
    await app.stop();
  }
});

test("index uses FTS5 and a schema version table", async () => {
  const workspace = makeWorkspace({ one: "# One\n\nhello\n" });
  const app = await startApp(workspace);
  await app.stop();
  const db = new DatabaseSync(workspace.indexPath);
  try {
    const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all();
    assert.ok(tables.some((table) => /fts5/i.test(table.sql ?? "")), "expected an FTS5 virtual table");
    const hasVersionTable = tables.some((table) => /migration|version/i.test(table.name));
    const { user_version: userVersion } = db.prepare("PRAGMA user_version").get();
    assert.ok(hasVersionTable || userVersion > 0, "expected a schema version table");
  } finally {
    db.close();
  }
});

test("index re-syncs with files changed while the app was down", async () => {
  const workspace = makeWorkspace({
    keep: "# Keep\n\nunchanged content\n",
    edit: "# Edit\n\noriginal wording\n",
    gone: "# Gone\n\nvanishingterm here\n",
  });
  const first = await startApp(workspace);
  assert.deepEqual(await searchSlugs(first.baseUrl, "vanishingterm"), ["gone"]);
  await first.stop();

  rmSync(join(workspace.pagesDir, "gone.md"));
  writeFileSync(join(workspace.pagesDir, "edit.md"), "# Edit\n\nrevised phrasing\n");
  writeFileSync(join(workspace.pagesDir, "fresh.md"), "# Fresh\n\nnewcomerterm arrives\n");

  const second = await startApp(workspace);
  try {
    assert.deepEqual(await searchSlugs(second.baseUrl, "vanishingterm"), []);
    assert.deepEqual(await searchSlugs(second.baseUrl, "original"), []);
    assert.deepEqual(await searchSlugs(second.baseUrl, "revised"), ["edit"]);
    assert.deepEqual(await searchSlugs(second.baseUrl, "newcomerterm"), ["fresh"]);
  } finally {
    await second.stop();
  }
});

test("search is case-insensitive, ANDs terms, and weights titles", async () => {
  const workspace = makeWorkspace({
    both: "# Alpha notes\n\nalpha and beta together\n",
    "only-alpha": "# Other\n\nalpha alone\n",
    "kube-primer": "# Kubernetes primer\n\nShort intro.\n",
    misc: "# Misc notes\n\nWe discussed kubernetes briefly along with many other unrelated topics today.\n",
  });
  const app = await startApp(workspace);
  try {
    assert.deepEqual(await searchSlugs(app.baseUrl, "alpha beta"), ["both"]);
    assert.deepEqual((await searchSlugs(app.baseUrl, "ALPHA")).sort(), ["both", "only-alpha"]);

    const ranked = await getJson(app.baseUrl, "/search?q=kubernetes");
    assert.deepEqual(ranked.body.results.map((result) => result.slug), ["kube-primer", "misc"]);
    const [best, next] = ranked.body.results;
    assert.equal(typeof best.score, "number");
    assert.ok(best.score >= next.score, "results must be ordered by descending score");
    assert.equal(best.title, "Kubernetes primer");
    assert.equal(ranked.body.query, "kubernetes");

    const misc = ranked.body.results.find((result) => result.slug === "misc");
    assert.match(misc.snippet, /\*\*kubernetes\*\*/i);
  } finally {
    await app.stop();
  }
});

test("search handles punctuation safely and validates the query", async () => {
  const workspace = makeWorkspace({ cpp: "# Languages\n\nWe write c++ and some foo code.\n" });
  const app = await startApp(workspace);
  try {
    for (const query of ['"unclosed', "foo AND (", "c++", "NEAR(", "foo:bar", "-foo"]) {
      const response = await fetch(`${app.baseUrl}/search?q=${encodeURIComponent(query)}`);
      assert.equal(response.status, 200, `query ${JSON.stringify(query)} should not error`);
      assert.ok(Array.isArray((await response.json()).results));
    }
    const star = await fetch(`${app.baseUrl}/search?q=${encodeURIComponent("*")}`);
    assert.notEqual(star.status, 500);
    assert.equal((await fetch(`${app.baseUrl}/search?q=%20%20`)).status, 400);
    assert.equal((await fetch(`${app.baseUrl}/search`)).status, 400);
  } finally {
    await app.stop();
  }
});

test("search returns at most 20 results", async () => {
  const pages = {};
  for (let index = 0; index < OVERFLOW_PAGE_COUNT; index += 1) pages[`page-${index}`] = `# Page ${index}\n\ncommonword ${index}\n`;
  const app = await startApp(makeWorkspace(pages));
  try {
    assert.equal((await searchSlugs(app.baseUrl, "commonword")).length, MAX_SEARCH_RESULTS);
  } finally {
    await app.stop();
  }
});

test("PUT and DELETE update the index before responding", async () => {
  const app = await startApp(makeWorkspace());
  try {
    await putPage(app.baseUrl, "live", "# Live\n\nzephyrword appears\n");
    assert.deepEqual(await searchSlugs(app.baseUrl, "zephyrword"), ["live"]);
    assert.equal((await putPage(app.baseUrl, "live", "# Live\n\nreplaced text\n")).status, 200);
    assert.deepEqual(await searchSlugs(app.baseUrl, "zephyrword"), []);
    assert.equal((await fetch(`${app.baseUrl}/pages/live`, { method: "DELETE" })).status, 204);
    assert.deepEqual(await searchSlugs(app.baseUrl, "replaced"), []);
    assert.equal((await fetch(`${app.baseUrl}/pages/live`, { method: "DELETE" })).status, 404);
    assert.equal((await putPage(app.baseUrl, "Bad_Slug", "x")).status, 400);
  } finally {
    await app.stop();
  }
});

test("tags endpoints count and list pages", async () => {
  const workspace = makeWorkspace({
    a: "---\ntags: [ops, docs]\n---\n# A\n",
    b: "---\ntags: [ops]\n---\n# B\n",
    c: "---\ntags: [api, docs]\n---\n# C\n",
    d: "---\ntags: [ops]\n---\n# D\n",
  });
  const app = await startApp(workspace);
  try {
    assert.deepEqual((await getJson(app.baseUrl, "/tags")).body, [
      { tag: "ops", count: 3 },
      { tag: "docs", count: 2 },
      { tag: "api", count: 1 },
    ]);
    assert.deepEqual((await getJson(app.baseUrl, "/tags/OPS")).body, [
      { slug: "a", title: "A" },
      { slug: "b", title: "B" },
      { slug: "d", title: "D" },
    ]);
    assert.deepEqual((await getJson(app.baseUrl, "/tags/unknown")).body, []);
  } finally {
    await app.stop();
  }
});

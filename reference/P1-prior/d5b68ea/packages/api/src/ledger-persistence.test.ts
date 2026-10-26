import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db";
import { createApp } from "./index";
import { SqliteLedgerRepository } from "./sqlite-ledger-repository";
import { LedgerService } from "../../core/src/ledger-service";

const SESSION_SECRET = "persistence-test-secret";

describe("persisted ledger", () => {
  let directory: string;
  let openDatabases: DatabaseSync[];

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "ledger-persist-"));
    openDatabases = [];
  });
  afterEach(() => {
    openDatabases.forEach((db) => db.close());
    rmSync(directory, { recursive: true, force: true });
  });

  function startServer(filename: string) {
    const db = openDatabase(filename);
    openDatabases.push(db);
    return { db, server: createApp({ db, sessionSecret: SESSION_SECRET }) };
  }

  it("keeps accounts, transactions, and balances after an API restart", async () => {
    const filename = path.join(directory, "ledger.sqlite");
    const first = startServer(filename);
    const registered = await request(first.server).post("/auth/register").send({ username: "alice", password: "secret12" }).expect(201);
    const cookie = registered.headers["set-cookie"][0].split(";")[0];
    await request(first.server).post("/accounts").set("Cookie", cookie).send({ id: "checking", name: "Checking" }).expect(201);
    await request(first.server).post("/transactions").set("Cookie", cookie)
      .send({ id: "pay", accountId: "checking", amountCents: 150_000, description: "Pay" }).expect(201);
    await request(first.server).post("/transactions").set("Cookie", cookie)
      .send({ id: "rent", accountId: "checking", amountCents: -60_000 }).expect(201);
    first.db.close();
    openDatabases = [];

    const second = startServer(filename);
    await request(second.server).get("/accounts").set("Cookie", cookie).expect(200, [{ id: "checking", name: "Checking" }]);
    await request(second.server).get("/accounts/checking/balance").set("Cookie", cookie).expect(200, { balanceCents: 90_000 });
    await request(second.server).get("/transactions").set("Cookie", cookie).expect(200, [
      { id: "pay", accountId: "checking", amountCents: 150_000, description: "Pay" },
      { id: "rent", accountId: "checking", amountCents: -60_000 },
    ]);
    await request(second.server).post("/auth/login").send({ username: "alice", password: "secret12" }).expect(200);
  });

  it("keeps per-user ledgers separate even when ids collide", async () => {
    const { server } = startServer(":memory:");
    const alice = await request(server).post("/auth/register").send({ username: "alice", password: "secret12" }).expect(201);
    const bob = await request(server).post("/auth/register").send({ username: "bob", password: "secret12" }).expect(201);
    const aliceCookie = alice.headers["set-cookie"][0].split(";")[0];
    const bobCookie = bob.headers["set-cookie"][0].split(";")[0];
    for (const cookie of [aliceCookie, bobCookie]) {
      await request(server).post("/accounts").set("Cookie", cookie).send({ id: "checking", name: "Checking" }).expect(201);
    }
    await request(server).post("/transactions").set("Cookie", aliceCookie).send({ id: "t1", accountId: "checking", amountCents: 700 }).expect(201);
    await request(server).post("/transactions").set("Cookie", bobCookie).send({ id: "t1", accountId: "checking", amountCents: 5 }).expect(201);
    await request(server).get("/accounts/checking/balance").set("Cookie", aliceCookie).expect(200, { balanceCents: 700 });
    await request(server).get("/accounts/checking/balance").set("Cookie", bobCookie).expect(200, { balanceCents: 5 });
  });

  it("preserves error statuses for invalid ledger requests", async () => {
    const { server } = startServer(":memory:");
    const registered = await request(server).post("/auth/register").send({ username: "alice", password: "secret12" }).expect(201);
    const cookie = registered.headers["set-cookie"][0].split(";")[0];
    await request(server).get("/accounts/missing/balance").set("Cookie", cookie).expect(404);
    await request(server).get("/transactions").query({ accountId: "missing" }).set("Cookie", cookie).expect(404);
    await request(server).post("/accounts").set("Cookie", cookie).send({ id: "a", name: "" }).expect(400);
    await request(server).post("/accounts").set("Cookie", cookie).send({ id: "a", name: "A" }).expect(201);
    await request(server).post("/accounts").set("Cookie", cookie).send({ id: "a", name: "A" }).expect(400);
    await request(server).post("/transactions").set("Cookie", cookie).send({ id: "t", accountId: "a", amountCents: 0 }).expect(400);
    await request(server).post("/transactions").set("Cookie", cookie).send({ id: "t", accountId: "nope", amountCents: 5 }).expect(404);
  });
});

describe("SqliteLedgerRepository with LedgerService", () => {
  it("cascades ledger rows when a user is deleted", () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES ('u1', 'alice', 'h', 1)").run();
    const service = new LedgerService(new SqliteLedgerRepository(db));
    service.addAccount("u1", { id: "a", name: "A" });
    service.addTransaction("u1", { id: "t", accountId: "a", amountCents: 10 });
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    expect(service.listAccounts("u1")).toEqual([]);
    expect(service.listTransactions("u1")).toEqual([]);
    db.close();
  });
});

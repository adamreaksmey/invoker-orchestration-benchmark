import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./index";

const SESSION_SECRET = "acceptance-session-secret-at-least-32-characters";
const PASSWORD = "password123";
const PAYCHECK_CENTS = 12550;
const GROCERIES_CENTS = -4325;

let previousDatabasePath: string | undefined;

beforeEach(() => {
  previousDatabasePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "ledger-acceptance-")), "ledger.sqlite");
});

afterEach(() => {
  if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousDatabasePath;
});

async function registeredAgent(username: string) {
  const agent = request.agent(createApp({ sessionSecret: SESSION_SECRET }));
  await agent.post("/auth/register").send({ username, password: PASSWORD }).expect(201);
  return agent;
}

async function signedInAgent(username: string) {
  const agent = request.agent(createApp({ sessionSecret: SESSION_SECRET }));
  await agent.post("/auth/login").send({ username, password: PASSWORD }).expect(200);
  return agent;
}

async function seedLedger(agent: Awaited<ReturnType<typeof registeredAgent>>) {
  await agent.post("/accounts").send({ id: "checking", name: "Everyday checking" }).expect(201);
  await agent.post("/transactions").send({ id: "t1", accountId: "checking", amountCents: PAYCHECK_CENTS, description: "Paycheck" }).expect(201);
  await agent.post("/transactions").send({ id: "t2", accountId: "checking", amountCents: GROCERIES_CENTS }).expect(201);
}

describe("W1 hidden acceptance: persisted ledger", () => {
  it("returns the same accounts, transactions, and balance from a fresh app instance", async () => {
    await seedLedger(await registeredAgent("restart_user"));

    const restarted = await signedInAgent("restart_user");
    const accounts = await restarted.get("/accounts").expect(200);
    expect(accounts.body).toEqual([{ id: "checking", name: "Everyday checking" }]);
    const transactions = await restarted.get("/transactions").query({ accountId: "checking" }).expect(200);
    expect(transactions.body.map((transaction: { id: string }) => transaction.id).sort()).toEqual(["t1", "t2"]);
    expect(transactions.body.find((transaction: { id: string }) => transaction.id === "t1")).toMatchObject({
      accountId: "checking",
      amountCents: PAYCHECK_CENTS,
      description: "Paycheck",
    });
    const balance = await restarted.get("/accounts/checking/balance").expect(200);
    expect(balance.body).toEqual({ balanceCents: PAYCHECK_CENTS + GROCERIES_CENTS });
  });

  it("keeps each user's ledger isolated", async () => {
    await seedLedger(await registeredAgent("owner_user"));
    const other = await registeredAgent("other_user");

    expect((await other.get("/accounts").expect(200)).body).toEqual([]);
    await other.get("/accounts/checking/balance").expect(404);
    await other.post("/accounts").send({ id: "checking", name: "Other checking" }).expect(201);
    expect((await other.get("/accounts/checking/balance").expect(200)).body).toEqual({ balanceCents: 0 });

    const owner = await signedInAgent("owner_user");
    expect((await owner.get("/accounts/checking/balance").expect(200)).body).toEqual({ balanceCents: PAYCHECK_CENTS + GROCERIES_CENTS });
  });

  it("keeps domain validation and error statuses after persistence", async () => {
    const agent = await registeredAgent("rules_user");
    await agent.post("/accounts").send({ id: "a1", name: "Main" }).expect(201);
    await agent.post("/accounts").send({ id: "a1", name: "Again" }).expect(400);
    await agent.post("/accounts").send({ id: " ", name: "Blank" }).expect(400);
    await agent.post("/transactions").send({ id: "x", accountId: "missing", amountCents: 100 }).expect(404);
    await agent.post("/transactions").send({ id: "z", accountId: "a1", amountCents: 0 }).expect(400);
    await agent.post("/transactions").send({ id: "f", accountId: "a1", amountCents: 1.5 }).expect(400);
    await agent.post("/transactions").send({ id: "ok", accountId: "a1", amountCents: 100 }).expect(201);
    await agent.post("/transactions").send({ id: "ok", accountId: "a1", amountCents: 100 }).expect(400);
    await request(createApp({ sessionSecret: SESSION_SECRET })).get("/accounts").expect(401);
  });
});

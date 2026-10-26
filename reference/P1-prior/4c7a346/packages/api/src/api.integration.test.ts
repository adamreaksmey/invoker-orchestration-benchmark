import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./db";
import { createApp } from "./index";

describe("ledger API integration", () => {
  let db: DatabaseSync | undefined;
  let databaseDirectory: string | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
    if (databaseDirectory) rmSync(databaseDirectory, { recursive: true, force: true });
    databaseDirectory = undefined;
  });

  it("registers and logs in, then persists account and transaction data", async () => {
    db = openDatabase(":memory:");
    const server = createApp({ db, sessionSecret: "integration-secret" });

    const registered = await request(server)
      .post("/auth/register")
      .send({ username: "alice", password: "correct horse" })
      .expect(201);
    const registeredCookie = registered.headers["set-cookie"][0].split(";")[0];

    const login = await request(server)
      .post("/auth/login")
      .send({ username: "alice", password: "correct horse" })
      .expect(200);
    const loginCookie = login.headers["set-cookie"][0].split(";")[0];
    expect(login.body.user).toEqual(registered.body.user);

    await request(server)
      .post("/accounts")
      .set("Cookie", loginCookie)
      .send({ id: "checking", name: "Checking" })
      .expect(201, { id: "checking", name: "Checking" });
    await request(server)
      .post("/transactions")
      .set("Cookie", loginCookie)
      .send({ id: "payday", accountId: "checking", amountCents: 2500, description: "Payday" })
      .expect(201, {
        id: "payday", accountId: "checking", amountCents: 2500, description: "Payday",
      });

    await request(server).get("/accounts").set("Cookie", registeredCookie).expect(200, [
      { id: "checking", name: "Checking" },
    ]);
    await request(server).get("/transactions").set("Cookie", loginCookie).expect(200, [
      { id: "payday", accountId: "checking", amountCents: 2500, description: "Payday" },
    ]);
    await request(server).get("/transactions?accountId=checking").set("Cookie", loginCookie)
      .expect(200, [{ id: "payday", accountId: "checking", amountCents: 2500, description: "Payday" }]);
    await request(server).get("/accounts/checking/balance").set("Cookie", loginCookie)
      .expect(200, { balanceCents: 2500 });

    const restartedServer = createApp({ db, sessionSecret: "integration-secret" });
    await request(restartedServer).get("/accounts").set("Cookie", loginCookie).expect(200, [
      { id: "checking", name: "Checking" },
    ]);
    await request(restartedServer).get("/accounts/checking/balance").set("Cookie", loginCookie)
      .expect(200, { balanceCents: 2500 });
  });

  it("preserves transactions and balances after a database connection restart", async () => {
    databaseDirectory = mkdtempSync(join(tmpdir(), "personal-ledger-api-"));
    const databasePath = join(databaseDirectory, "ledger.sqlite");
    db = openDatabase(databasePath);
    const firstServer = createApp({ db, sessionSecret: "integration-secret" });

    const registered = await request(firstServer)
      .post("/auth/register")
      .send({ username: "alice", password: "correct horse" })
      .expect(201);
    const cookie = registered.headers["set-cookie"][0].split(";")[0];

    await request(firstServer)
      .post("/accounts")
      .set("Cookie", cookie)
      .send({ id: "checking", name: "Checking" })
      .expect(201);
    await request(firstServer)
      .post("/accounts")
      .set("Cookie", cookie)
      .send({ id: "savings", name: "Savings" })
      .expect(201);
    await request(firstServer)
      .post("/transactions")
      .set("Cookie", cookie)
      .send({ id: "payday", accountId: "checking", amountCents: 2500, description: "Payday" })
      .expect(201);
    await request(firstServer)
      .post("/transactions")
      .set("Cookie", cookie)
      .send({ id: "transfer", accountId: "checking", amountCents: -500, description: "Transfer" })
      .expect(201);
    await request(firstServer)
      .post("/transactions")
      .set("Cookie", cookie)
      .send({ id: "interest", accountId: "savings", amountCents: 125, description: "Interest" })
      .expect(201);

    db.close();
    db = openDatabase(databasePath);
    const restartedServer = createApp({ db, sessionSecret: "integration-secret" });

    await request(restartedServer).get("/transactions").set("Cookie", cookie).expect(200, [
      { id: "payday", accountId: "checking", amountCents: 2500, description: "Payday" },
      { id: "transfer", accountId: "checking", amountCents: -500, description: "Transfer" },
      { id: "interest", accountId: "savings", amountCents: 125, description: "Interest" },
    ]);
    await request(restartedServer).get("/accounts/checking/balance").set("Cookie", cookie)
      .expect(200, { balanceCents: 2000 });
    await request(restartedServer).get("/accounts/savings/balance").set("Cookie", cookie)
      .expect(200, { balanceCents: 125 });
  });
});

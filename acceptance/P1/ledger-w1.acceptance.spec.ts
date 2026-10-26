import { test, expect } from "@playwright/test";

const PASSWORD = "password123";

test("hidden acceptance: ledger flow survives reload and sign-in", async ({ page }) => {
  const username = `accept_${Date.now()}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Good to see you")).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Account name").fill("Everyday checking");
  await page.getByRole("button", { name: /Add account/ }).click();
  await expect(page.getByText("Everyday checking").first()).toBeVisible();

  await page.getByLabel("Description").fill("Paycheck");
  await page.getByLabel("Amount").fill("125.50");
  await page.getByRole("button", { name: /Save transaction/ }).click();
  await expect(page.locator(".balance-amount")).toHaveText("$125.50");

  await page.reload();
  await expect(page.locator(".balance-amount")).toHaveText("$125.50", { timeout: 15_000 });

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".balance-amount")).toHaveText("$125.50", { timeout: 15_000 });
});

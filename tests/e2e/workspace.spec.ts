import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
const state = ".local/e2e-admin-state.json";
const password = process.env.DEMO_PASSWORD!;
async function login(page: Page, email: string, secret = password) {
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill(email);
  await page.getByPlaceholder("Enter your password").fill(secret);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
}
async function confirm(page: Page, note: string) {
  const dialog = page.getByRole("dialog").last();
  await dialog
    .getByRole("textbox", { name: "Review note", exact: true })
    .fill(note);
  await dialog
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Review note", exact: true }),
  ).toHaveCount(0);
}
test.beforeAll(async ({ browser }) => {
  mkdirSync(".local", { recursive: true });
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await login(page, "admin@brightloop.local");
  await page.context().storageState({ path: state });
  await context.close();
});
test.use({ storageState: state });
test("dashboard renders database totals and core pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero-eyebrow")).toContainText("CASH COLLECTED");
  await expect(
    page.getByRole("heading", { name: "Cash, over time" }),
  ).toBeVisible();
  for (const name of [
    "Subscriptions",
    "Invoices",
    "Payments",
    "Customers",
    "Products",
    "Plans",
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.locator("h1")).toContainText(name);
    await expect(page.locator(".empty.error")).toHaveCount(0);
  }
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Tax rules", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Tax rules.");
  await page.getByRole("link", { name: "Local outbox", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Local outbox.");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("How it works.");
  await expect(
    page.getByRole("heading", {
      name: "Six steps. One source of truth.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Local outbox", exact: true }).click();
  await page.getByRole("button", { name: "Discounts", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Discounts.");
  await page.getByRole("link", { name: "Local outbox", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Local outbox.");
});
test("admin creates a catalog product and Odoo variant", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/Product name/).fill("Browser test product");
  await d.getByLabel(/SKU/).fill(`E2E-${Date.now()}`);
  await d.getByLabel(/Sales price/).fill("1000");
  await d.getByLabel(/Cost price/).fill("400");
  await d.getByRole("button", { name: "Create record", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Browser test product", exact: true }),
  ).toBeVisible();
  await page.goto("/settings?tab=variants");
  await page.getByRole("button", { name: "New variant", exact: true }).click();
  const variant = page.getByRole("dialog");
  await variant
    .getByRole("combobox")
    .selectOption({ label: "Browser test product" });
  await variant.getByLabel(/Attribute/).fill("Brand");
  await variant.getByLabel(/Variant name/).fill("Odoo");
  await variant.getByLabel(/Additional price/).fill("560");
  await variant
    .getByRole("button", { name: "Create record", exact: false })
    .click();
  await expect(page.getByRole("status")).toContainText("saved");
});
test("quotation becomes a paid invoice through the UI", async ({ page }) => {
  await page.goto("/subscriptions");
  await page
    .getByRole("button", { name: "New subscription", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Customer Customer search/ })
    .selectOption({ label: "Studio North · anvi@brightloop.local" });
  await page
    .getByRole("combobox", { name: "Quotation template", exact: true })
    .selectOption({ label: "Essentials + Odoo" });
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/subscriptions") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  const subscription = (await (await created).json()).data;
  await page
    .getByRole("button", { name: subscription.number, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Issue quotation", exact: true })
    .click();
  await confirm(page, "E2E issue quotation");
  await page
    .getByRole("button", { name: "Record acceptance", exact: true })
    .click();
  await confirm(page, "E2E customer accepted");
  await page
    .getByRole("button", { name: "Activate subscription", exact: true })
    .click();
  await confirm(page, "E2E activate accepted agreement");
  await page.keyboard.press("Escape");
  await page.goto("/invoices");
  await page
    .getByRole("button", { name: "Run due billing", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("generated");
  const listed = await (
    await page.request.get("/api/v1/invoices?status=DRAFT")
  ).json();
  const invoice = listed.data.items.find(
    (i: { subscription_id: string }) => i.subscription_id === subscription.id,
  );
  expect(invoice.total).toBe(165672);
  await page
    .getByRole("button", {
      name: `Open invoice ${invoice.number}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Confirm invoice", exact: true })
    .click();
  await confirm(page, "E2E reviewed exact charge");
  const pdf = await page.request.get(`/api/v1/invoices/${invoice.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page
    .getByRole("button", { name: "Send to outbox", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("local outbox");
  for (const amount of ["500", "1156.72"]) {
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    const d = page.getByRole("dialog").last();
    await d
      .getByRole("textbox", { name: "Amount received (INR)", exact: true })
      .fill(amount);
    await d
      .getByRole("textbox", { name: "Note", exact: true })
      .fill("E2E manually recorded demo receipt");
    await d
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Payment recorded");
  }
  await expect(page.getByRole("dialog").locator(".badge-paid")).toHaveText(
    "Paid",
  );
  await expect(page.getByRole("dialog").locator(".balance-line")).toContainText(
    "₹0",
  );
});
test("BillGuard exposes planted anomaly evidence", async ({ page }) => {
  await page.goto("/integrity");
  await page
    .getByRole("button", { name: "Run integrity scan", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("records checked");
  const card = page
    .locator(".finding-card")
    .filter({ hasText: "BI-005_TOTAL_MISMATCH" })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Review", exact: false }).click();
  await expect(
    page.getByRole("dialog").locator(".evidence-json"),
  ).toContainText("expected");
});
test("Time Machine creates a labelled read-only projection", async ({
  page,
}) => {
  const before = await (await page.request.get("/api/v1/invoices")).json();
  await page.goto("/simulator");
  await page
    .getByRole("button", { name: "Preview future cycles", exact: true })
    .click();
  await expect(
    page.getByText("No live records changed", { exact: false }),
  ).toBeVisible();
  const after = await (await page.request.get("/api/v1/invoices")).json();
  expect(after.data.total).toBe(before.data.total);
  await expect(
    page.getByRole("heading", {
      name: "Projected invoice details",
      exact: true,
    }),
  ).toBeVisible();
});
test("customer portal hides internal data and foreign invoices", async ({
  browser,
  page,
}) => {
  const all = await (await page.request.get("/api/v1/invoices")).json();
  const ctx = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
    storageState: { cookies: [], origins: [] },
  });
  const portal = await ctx.newPage();
  await login(portal, "anvi@brightloop.local");
  await expect(
    portal.getByRole("link", { name: "Products", exact: true }),
  ).toHaveCount(0);
  const mine = await (await portal.request.get("/api/v1/invoices")).json();
  expect(mine.data.items.length).toBeGreaterThan(0);
  const customer = mine.data.items[0].customer_id;
  const foreign = all.data.items.find(
    (i: { customer_id: string; status: string }) =>
      i.customer_id !== customer && i.status !== "DRAFT",
  );
  expect(
    (await portal.request.get(`/api/v1/invoices/${foreign.id}/pdf`)).status(),
  ).toBe(404);
  expect(
    (
      await portal.request.post("/api/v1/scan", {
        headers: { origin: "http://127.0.0.1:3101" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await portal.goto("/invoices");
  await portal
    .getByRole("button", { name: /^Open invoice / })
    .first()
    .click();
  await portal.locator(".explain-toggle").click();
  await expect(
    portal.getByRole("heading", {
      name: "Every amount, explained.",
      exact: true,
    }),
  ).toBeVisible();
  await ctx.close();
});
test("mobile dashboard and navigation fit a 390px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".hero-eyebrow")).toContainText("CASH COLLECTED");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("link", { name: "Invoices", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Invoices.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("password reset follows the local outbox link without an email provider", async ({
  browser,
  page,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
    storageState: { cookies: [], origins: [] },
  });
  const reset = await context.newPage();
  await reset.goto("/forgot-password");
  await reset
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill("rohan@brightloop.local");
  await reset
    .getByRole("button", { name: "Request reset link", exact: true })
    .click();
  await expect(
    reset.getByRole("heading", {
      name: "Check the local outbox.",
      exact: true,
    }),
  ).toBeVisible();
  const messages = await (
    await page.request.get("/api/v1/outbox?search=rohan%40brightloop.local")
  ).json();
  const message = messages.data.items.find(
    (m: { kind: string }) => m.kind === "RESET",
  );
  expect(message).toBeDefined();
  const link = String(message.body).match(/https?:\/\/\S+/)![0];
  await reset.goto(link);
  await expect(
    reset.getByRole("heading", { name: "Set a new password.", exact: true }),
  ).toBeVisible();
  const next = "ResetBrowserPassword!A";
  await reset.locator('input[type="password"]').first().fill(next);
  await reset
    .getByRole("textbox", { name: "Confirm password", exact: true })
    .fill(next);
  await reset
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(
    reset.getByRole("heading", {
      name: "Your password is updated.",
      exact: true,
    }),
  ).toBeVisible();
  await login(reset, "rohan@brightloop.local", next);
  await context.close();
});
test("new customer signup creates an isolated portal and profile", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3101",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/signup");
  await page
    .getByRole("textbox", { name: "Full name", exact: true })
    .fill("Browser Signup");
  await page
    .getByRole("textbox", { name: "Company name", exact: true })
    .fill("Browser Signup Company");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill(`signup-${Date.now()}@example.invalid`);
  await page
    .getByPlaceholder("Enter your password")
    .fill("BrowserSignupPassword!A");
  await page
    .getByRole("textbox", { name: "Confirm password", exact: true })
    .fill("BrowserSignupPassword!A");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /Good (morning|afternoon|evening), Browser/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Products", exact: true }),
  ).toHaveCount(0);
  const profile = await (await page.request.get("/api/v1/profile")).json();
  expect(profile.data.company).toBe("Browser Signup Company");
  const invoices = await (await page.request.get("/api/v1/invoices")).json();
  expect(invoices.data.total).toBe(0);
  await context.close();
});

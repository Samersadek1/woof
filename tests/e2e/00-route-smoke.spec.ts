import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const ROUTES = [
  "/",
  "/customers",
  "/boarding",
  "/daycare",
  "/grooming",
  "/billing",
  "/billing/invoices",
  "/billing/invoices/new",
  "/staff",
  "/profile",
  "/settings",
  "/settings/vets",
  "/settings/staff",
  "/settings/rooms",
  "/agent",
  "/dashboard/checkins",
  "/customers?filter=low-wallet",
  "/billing/invoices?status=overdue",
  "/boarding?date=today&view=check-ins",
  "/grooming?date=today",
  "/daycare?tab=operations",
];

test.describe("route-smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("logged-out user is redirected to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe("authenticated", () => {
    test.use({ storageState: "tests/e2e/.auth/admin.json" });

    test("all main routes load without runtime errors", async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          if (/favicon|404.*\.(png|ico|svg)/i.test(text)) return;
          consoleErrors.push(text);
        }
      });
      page.on("pageerror", (err) => {
        consoleErrors.push(`pageerror: ${err.message}`);
      });

      await loginAsAdmin(page);

      for (const path of ROUTES) {
        consoleErrors.length = 0;
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const pathname = new URL(page.url()).pathname;
        expect(pathname).toBe(new URL(path, page.url()).pathname);
        await expect(page.locator("body")).not.toContainText("Unexpected Application Error");
        await expect(page.locator("body")).not.toContainText("Something went wrong");
        await expect(page.getByRole("navigation").first()).toBeVisible();
        expect(
          consoleErrors,
          `console errors on ${path}: ${consoleErrors.join("; ")}`,
        ).toEqual([]);
      }
    });

    test("removed park route returns not found", async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/park");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toContainText(/not found|404/i);
    });
  });
});

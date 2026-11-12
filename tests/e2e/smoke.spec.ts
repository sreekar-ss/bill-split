import { expect, test } from "@playwright/test";

test("health endpoint is up and the app guards signed-in routes", async ({ page, request }) => {
  expect((await request.get("/api/health")).ok()).toBe(true);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login\?next=%2Fhome/);
});

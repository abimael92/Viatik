import { expect, test, type Page } from "@playwright/test";

async function readPlannerDatabase(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("viatik_e2e-planner-user");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<{
      ideas: Array<{
        convertedToTripId: string | null;
        targetTripCostMinor: string | null;
        priceChecks: unknown[];
      }>;
      plans: Array<{ currentSavingsMinor: string }>;
      trips: Array<{ id: string; destination: string | null }>;
      members: Array<{ role: string }>;
      budgets: Array<{ totalBudgetMinor: string }>;
      outbox: Array<{ entityType: string; operation: string }>;
    }>((resolve, reject) => {
      const transaction = database.transaction(
        ["tripIdeas", "tripSavingsPlans", "trips", "tripMembers", "tripBudgets", "outboxMutations"],
        "readonly"
      );
      const ideasRequest = transaction.objectStore("tripIdeas").getAll();
      const plansRequest = transaction.objectStore("tripSavingsPlans").getAll();
      const tripsRequest = transaction.objectStore("trips").getAll();
      const membersRequest = transaction.objectStore("tripMembers").getAll();
      const budgetsRequest = transaction.objectStore("tripBudgets").getAll();
      const outboxRequest = transaction.objectStore("outboxMutations").getAll();
      transaction.oncomplete = () =>
        resolve({
          ideas: ideasRequest.result.map((idea) => ({
            convertedToTripId: idea.convertedToTripId,
            targetTripCostMinor: idea.targetTripCostMinor?.toString() ?? null,
            priceChecks: idea.priceChecks,
          })),
          plans: plansRequest.result.map((plan) => ({
            currentSavingsMinor: plan.currentSavingsMinor.toString(),
          })),
          trips: tripsRequest.result.map((trip) => ({
            id: trip.id,
            destination: trip.destination,
          })),
          members: membersRequest.result.map((member) => ({ role: member.role })),
          budgets: budgetsRequest.result.map((budget) => ({
            totalBudgetMinor: budget.totalBudgetMinor.toString(),
          })),
          outbox: outboxRequest.result.map((mutation) => ({
            entityType: mutation.entityType,
            operation: mutation.operation,
          })),
        });
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    return result;
  });
}

test("wishlist estimates and savings persist locally and convert once into a trip", async ({
  page,
}) => {
  await page.goto("/e2e");
  await page.getByRole("button", { name: "Open trip wishlist" }).click();
  await expect(page.getByRole("heading", { name: "Want to go" })).toBeVisible();

  await page.getByRole("button", { name: "Add trip idea" }).click();
  await page.getByLabel("Idea name").fill("Kyoto spring break");
  await page.getByLabel("Departing from (optional)").fill("Montréal");
  await page.getByLabel("Destination").fill("Kyoto, Japan");
  await page.getByLabel("Trip start (optional)").fill("2027-04-15");
  await page.getByLabel("Duration in days (optional)").fill("5");
  await page.getByRole("button", { name: "Budget estimates and notes" }).click();
  await page.getByLabel("Target trip cost (USD)").fill("1000.00");
  await page.getByLabel("Transport estimate (USD)").fill("300.00");
  await page.getByLabel("Stay estimate (USD)").fill("400.00");
  await page.getByLabel("Food estimate (USD)").fill("200.00");
  await page.getByRole("button", { name: "Save idea" }).click();

  const ideaCard = page
    .locator("section[aria-labelledby='trip-planner-heading'] .rounded-2xl.border")
    .filter({ hasText: "Kyoto spring break" });
  await expect(ideaCard).toBeVisible();
  await ideaCard.getByRole("button", { name: "Search and price checks" }).click();
  await expect(ideaCard.getByRole("link", { name: "Search flights" })).toHaveAttribute(
    "href",
    /travel\/flights\?q=/
  );
  await ideaCard.getByLabel("Price found (USD)").fill("275.50");
  await ideaCard.getByLabel("Source").fill("Google Flights");
  await ideaCard.getByRole("button", { name: "Log price found" }).click();
  await expect(ideaCard.getByText(/Transport: \$275\.50/)).toBeVisible();

  await ideaCard.getByRole("button", { name: "Savings plan" }).click();
  await ideaCard.getByLabel("Current savings (USD)").fill("100.00");
  await ideaCard.getByRole("button", { name: "Save savings plan" }).click();
  await expect(ideaCard.getByText(/Suggested contribution: \$150\.00 \/ month/)).toBeVisible();

  await ideaCard.getByRole("button", { name: "Plan this trip" }).click();
  await expect(page.getByTestId("converted-trip-id")).toBeVisible();
  await expect(ideaCard.getByRole("link", { name: "Open trip" })).toBeVisible();
  await page.getByRole("button", { name: "Retry conversion" }).click();
  await expect
    .poll(async () => {
      const stored = await readPlannerDatabase(page);
      return stored.ideas[0]?.convertedToTripId != null && stored.outbox.length === 2;
    })
    .toBe(true);

  const stored = await readPlannerDatabase(page);
  expect(stored.ideas).toHaveLength(1);
  expect(stored.ideas[0].targetTripCostMinor).toBe("100000");
  expect(stored.ideas[0].priceChecks).toHaveLength(1);
  expect(stored.plans[0].currentSavingsMinor).toBe("10000");
  expect(stored.trips).toHaveLength(1);
  expect(stored.trips[0].destination).toBe("Kyoto, Japan");
  expect(stored.members).toEqual([{ role: "owner" }]);
  expect(stored.budgets).toEqual([{ totalBudgetMinor: "100000" }]);
  expect(stored.outbox.map((item) => item.entityType).sort()).toEqual(["trip", "tripMember"]);

  await page.goto("/e2e");
  await page.getByRole("button", { name: "Open trip wishlist" }).click();
  await expect(page.getByRole("link", { name: "Open trip" })).toBeVisible();
});

import { test, expect } from "@playwright/test";

test.describe("offline outbox", () => {
  test("creating an activity while offline inserts a mutation into the outbox", async ({ page, context }) => {
    await page.goto("/e2e");
    await context.setOffline(true);

    // Create a trip so the activity has a valid tripId.
    await page.getByRole("button", { name: "Create trip" }).click();
    await expect(page.getByTestId("trip-id")).not.toHaveText("none", { timeout: 5000 });

    // Verify the trip and owner membership were queued together.
    await expect(page.getByTestId("outbox-count")).toHaveText("Outbox: 2", { timeout: 5000 });

    // Create an activity while still offline.
    await page.getByRole("button", { name: "Create activity" }).click();

    // The outbox should now contain the trip, owner membership, and activity mutations.
    await expect(page.getByTestId("outbox-count")).toHaveText("Outbox: 3", { timeout: 5000 });

    // IndexedDB keeps both mutations durable while the browser is offline.
    const count = await page.evaluate(async () => {
      const request = indexedDB.open("viatik_e2e-user");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise<number>((resolve, reject) => {
        const transaction = database.transaction("outboxMutations", "readonly");
        const countRequest = transaction.objectStore("outboxMutations").count();
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error);
      });
    });
    expect(count).toBe(3);
    await context.setOffline(false);
  });
});

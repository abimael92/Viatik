import { afterEach } from "vitest";

/**
 * Radix primitives (dialogs, menus, focus scope) schedule work on a 0ms
 * macrotask. When a test file finishes first, that callback can fire after
 * jsdom has torn the document down, and jsdom then rejects the synthetic
 * `FocusEvent` with "parameter 1 is not of type 'Event'". That surfaces as an
 * unhandled error which fails an otherwise green run.
 *
 * Draining one macrotask per test lets those callbacks run while the document
 * is still alive.
 */
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

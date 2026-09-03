import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ViatikDatabase } from "@/lib/db/dexie";
import {
  BrowserSyncCoordinator,
  DexieLeaseSyncCoordinator,
  type SyncClock,
  type SyncScope,
  WebLockSyncCoordinator,
} from "@/lib/sync/sync-coordinator";

const scope: SyncScope = { databaseName: "viatik_user-1", userId: "user-1" };
const openDatabases: ViatikDatabase[] = [];

async function database(name: string): Promise<ViatikDatabase> {
  const db = new ViatikDatabase(name);
  openDatabases.push(db);
  await db.open();
  await db.syncLeases.clear();
  return db;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(async () => {
  for (const db of openDatabases.splice(0)) {
    const name = db.name;
    db.close();
    await ViatikDatabase.delete(name);
  }
  vi.restoreAllMocks();
});

describe("DexieLeaseSyncCoordinator", () => {
  it("allows only one coordinator to execute a scope at a time", async () => {
    const db = await database("lease-concurrency");
    const first = new DexieLeaseSyncCoordinator(db, { ownerToken: "tab-1", heartbeatMs: 30_000 });
    const second = new DexieLeaseSyncCoordinator(db, { ownerToken: "tab-2", heartbeatMs: 30_000 });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const operation = vi.fn(async () => blocked);

    const leaseScope = scopeFor("lease-concurrency");
    const leader = first.runExclusive(leaseScope, operation);
    await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
    const follower = await second.runExclusive(leaseScope, vi.fn());

    expect(follower).toEqual({ acquired: false });
    release();
    await expect(leader).resolves.toEqual({ acquired: true, value: undefined });
    first.close();
    second.close();
  });

  it("recovers an expired lease left by a crashed tab", async () => {
    const db = await database("lease-expiry");
    let now = 1_000;
    const clock: SyncClock = { now: () => now };
    await db.syncLeases.put({ key: "viatik:sync:lease-expiry:user-1", ownerToken: "crashed-tab", acquiredAt: 0, heartbeatAt: 0, expiresAt: 2_000 });
    const coordinator = new DexieLeaseSyncCoordinator(db, { ownerToken: "replacement-tab", clock, ttlMs: 5_000, heartbeatMs: 1_000 });
    const operation = vi.fn(async () => "synced");

    await expect(coordinator.runExclusive({ databaseName: "lease-expiry", userId: "user-1" }, operation)).resolves.toEqual({ acquired: false });
    now = 2_001;
    await expect(coordinator.runExclusive({ databaseName: "lease-expiry", userId: "user-1" }, operation)).resolves.toEqual({ acquired: true, value: "synced" });
    expect(operation).toHaveBeenCalledOnce();
    coordinator.close();
  });

  it("isolates leases between different user databases", async () => {
    const firstDb = await database("viatik_user-1");
    const secondDb = await database("viatik_user-2");
    const first = new DexieLeaseSyncCoordinator(firstDb, { ownerToken: "tab-1", heartbeatMs: 30_000 });
    const second = new DexieLeaseSyncCoordinator(secondDb, { ownerToken: "tab-2", heartbeatMs: 30_000 });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const leader = first.runExclusive({ databaseName: "viatik_user-1", userId: "user-1" }, async () => blocked);
    await vi.waitFor(async () => expect(await firstDb.syncLeases.count()).toBe(1));

    await expect(second.runExclusive({ databaseName: "viatik_user-2", userId: "user-2" }, async () => "other-user")).resolves.toEqual({ acquired: true, value: "other-user" });
    await expect(second.runExclusive({ databaseName: "wrong-database", userId: "user-2" }, async () => "invalid")).rejects.toThrow("does not match");

    release();
    await leader;
    first.close();
    second.close();
  });

  it("aborts a stale owner after another tab replaces its expired lease", async () => {
    const db = await database("lease-ownership-loss");
    const clock: SyncClock = { now: () => 0 };
    const first = new DexieLeaseSyncCoordinator(db, { ownerToken: "tab-1", clock, ttlMs: 50, heartbeatMs: 10 });
    const stopped = vi.fn();
    const leaseScope = scopeFor("lease-ownership-loss");
    const leader = first.runExclusive(leaseScope, async ({ signal }) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      stopped();
    });
    await vi.waitFor(async () => expect(await db.syncLeases.count()).toBe(1));
    await db.syncLeases.put({ key: "viatik:sync:lease-ownership-loss:user-1", ownerToken: "tab-2", acquiredAt: 0, heartbeatAt: 0, expiresAt: 50 });

    await expect(leader).rejects.toThrow("ownership was lost");
    expect(stopped).toHaveBeenCalledOnce();
    first.close();
  });

  it("aborts active work on close and releases after it settles", async () => {
    const db = await database("lease-close");
    const first = new DexieLeaseSyncCoordinator(db, { ownerToken: "tab-1" });
    const operation = first.runExclusive(scopeFor("lease-close"), async ({ signal }) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      signal.throwIfAborted();
    });
    await vi.waitFor(async () => expect(await db.syncLeases.count()).toBe(1));

    first.close();

    await expect(operation).rejects.toThrow("coordinator closed");
    expect(await db.syncLeases.count()).toBe(0);
  });

  it("does not let a stale owner release a replacement lease", async () => {
    const db = await database("lease-stale-release");
    await db.syncLeases.put({ key: "viatik:sync:lease-stale-release:user-1", ownerToken: "replacement", acquiredAt: 2_000, heartbeatAt: 2_000, expiresAt: 10_000 });
    const stale = new DexieLeaseSyncCoordinator(db, { ownerToken: "stale" });

    await stale.release(scopeFor("lease-stale-release"));

    expect(await db.syncLeases.get("viatik:sync:lease-stale-release:user-1")).toEqual(expect.objectContaining({ ownerToken: "replacement" }));
    stale.close();
  });
});

describe("WebLockSyncCoordinator", () => {
  it("executes only when the browser grants the lock", async () => {
    const grantedManager = lockManager(true);
    const deniedManager = lockManager(false);
    const operation = vi.fn(async () => "done");

    await expect(new WebLockSyncCoordinator(grantedManager).runExclusive(scope, operation)).resolves.toEqual({ acquired: true, value: "done" });
    await expect(new WebLockSyncCoordinator(deniedManager).runExclusive(scope, operation)).resolves.toEqual({ acquired: false });
    expect(operation).toHaveBeenCalledOnce();
    expect(grantedManager.request).toHaveBeenCalledWith("viatik:sync:viatik_user-1:user-1", { mode: "exclusive", ifAvailable: true }, expect.any(Function));
  });

  it("aborts Web Lock work when its tab closes", async () => {
    const coordinator = new WebLockSyncCoordinator(lockManager(true));
    const operation = coordinator.runExclusive(scope, async ({ signal }) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      signal.throwIfAborted();
    });
    await Promise.resolve();

    coordinator.close();

    await expect(operation).rejects.toThrow("coordinator closed");
  });
});

describe("BrowserSyncCoordinator", () => {
  it("notifies matching follower scopes without executing their outbox work", async () => {
    const db = await database("coordinator-notifications");
    const channel = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: null as ((event: MessageEvent) => void) | null,
    };
    const coordinator = new BrowserSyncCoordinator({ fallback: new DexieLeaseSyncCoordinator(db), channel });
    const listener = vi.fn();
    coordinator.subscribe(scope, listener);

    channel.onmessage?.({ data: { type: "completed", scope } } as MessageEvent);
    channel.onmessage?.({ data: { type: "completed", scope: { databaseName: scope.databaseName, userId: "user-2" } } } as MessageEvent);
    coordinator.requestSync(scope);

    expect(listener).toHaveBeenCalledOnce();
    expect(channel.postMessage).toHaveBeenCalledWith({ type: "requested", scope });
    coordinator.close();
  });

  it("prefers Web Locks and falls back to a Dexie lease when unavailable", async () => {
    const db = await database("coordinator-selection");
    const fallback = new DexieLeaseSyncCoordinator(db, { ownerToken: "tab" });
    const fallbackSpy = vi.spyOn(fallback, "runExclusive");
    const locks = lockManager(true);
    const primary = new BrowserSyncCoordinator({ locks, fallback });
    const coordinatorScope = scopeFor("coordinator-selection");

    await primary.runExclusive(coordinatorScope, async () => "primary");
    expect(locks.request).toHaveBeenCalledOnce();
    expect(fallbackSpy).not.toHaveBeenCalled();

    const fallbackOnly = new BrowserSyncCoordinator({ locks: undefined, fallback });
    await expect(fallbackOnly.runExclusive(coordinatorScope, async () => "fallback")).resolves.toEqual({ acquired: true, value: "fallback" });
    expect(fallbackSpy).toHaveBeenCalledOnce();
    primary.close();
    fallbackOnly.close();
  });
});

function scopeFor(databaseName: string): SyncScope {
  return { databaseName, userId: "user-1" };
}

function lockManager(granted: boolean): LockManager {
  return {
    request: vi.fn(async (_name: string, _options: LockOptions, callback: (lock: Lock | null) => unknown) => callback(granted ? ({ name: "sync", mode: "exclusive" } as Lock) : null)),
    query: vi.fn(),
  } as unknown as LockManager;
}

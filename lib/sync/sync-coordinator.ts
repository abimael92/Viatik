import type { ViatikDatabase } from "@/lib/db/dexie";
import type { SyncLease } from "@/lib/sync/types";

export type SyncScope = {
  databaseName: string;
  userId: string;
};

export type SyncCoordinationResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

export type SyncCoordinationEvent = {
  type: "requested" | "started" | "completed";
  scope: SyncScope;
};

export type SyncExecutionContext = {
  signal: AbortSignal;
};

export interface SyncCoordinator {
  runExclusive<T>(scope: SyncScope, operation: (context: SyncExecutionContext) => Promise<T>): Promise<SyncCoordinationResult<T>>;
  requestSync(scope: SyncScope): void;
  subscribe(scope: SyncScope, listener: (event: SyncCoordinationEvent) => void): () => void;
  close(): void;
}

export interface SyncClock {
  now(): number;
}

export class SyncCoordinationInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncCoordinationInterruptedError";
  }
}

type CoordinatorOptions = {
  ownerToken?: string;
  clock?: SyncClock;
  ttlMs?: number;
  heartbeatMs?: number;
};

type CoordinationChannel = {
  postMessage(message: SyncCoordinationEvent): void;
  close(): void;
  onmessage: ((event: MessageEvent<SyncCoordinationEvent>) => void) | null;
};

const COORDINATION_CHANNEL = "viatik:sync-coordination";
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_HEARTBEAT_MS = 15_000;
const systemClock: SyncClock = { now: () => Date.now() };

export function syncScopeKey(scope: SyncScope): string {
  return `viatik:sync:${scope.databaseName}:${scope.userId}`;
}

export class WebLockSyncCoordinator {
  private readonly activeControllers = new Set<AbortController>();
  private closed = false;

  constructor(private readonly locks: LockManager) {}

  async runExclusive<T>(scope: SyncScope, operation: (context: SyncExecutionContext) => Promise<T>): Promise<SyncCoordinationResult<T>> {
    if (this.closed) return { acquired: false };
    return this.locks.request(syncScopeKey(scope), { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (!lock || this.closed) return { acquired: false } as const;
      const controller = new AbortController();
      this.activeControllers.add(controller);
      try {
        return { acquired: true, value: await operation({ signal: controller.signal }) } as const;
      } finally {
        this.activeControllers.delete(controller);
      }
    });
  }

  close(): void {
    this.closed = true;
    for (const controller of this.activeControllers) controller.abort(new SyncCoordinationInterruptedError("Sync coordinator closed."));
  }
}

export class DexieLeaseSyncCoordinator {
  private readonly ownerToken: string;
  private readonly clock: SyncClock;
  private readonly ttlMs: number;
  private readonly heartbeatMs: number;
  private readonly activeScopes = new Set<string>();
  private readonly activeControllers = new Set<AbortController>();
  private readonly heartbeatTimers = new Set<ReturnType<typeof setInterval>>();
  private closed = false;

  constructor(private readonly db: ViatikDatabase, options: CoordinatorOptions = {}) {
    this.ownerToken = options.ownerToken ?? crypto.randomUUID();
    this.clock = options.clock ?? systemClock;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    if (this.ttlMs <= 0 || this.heartbeatMs <= 0 || this.heartbeatMs >= this.ttlMs) {
      throw new Error("Sync lease heartbeat must be positive and shorter than its TTL.");
    }
  }

  async runExclusive<T>(scope: SyncScope, operation: (context: SyncExecutionContext) => Promise<T>): Promise<SyncCoordinationResult<T>> {
    this.assertScope(scope);
    const key = syncScopeKey(scope);
    if (this.closed || this.activeScopes.has(key)) return { acquired: false };
    this.activeScopes.add(key);
    const controller = new AbortController();
    this.activeControllers.add(controller);
    let acquired = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    try {
      acquired = await this.acquire(scope);
      if (!acquired) return { acquired: false };
      heartbeat = setInterval(() => {
        void this.renew(scope).then((renewed) => {
          if (!renewed) controller.abort(new SyncCoordinationInterruptedError("Sync lease ownership was lost."));
        }).catch((error: unknown) => controller.abort(error));
      }, this.heartbeatMs);
      this.heartbeatTimers.add(heartbeat);
      const value = await operation({ signal: controller.signal });
      if (!(await this.renew(scope))) controller.abort(new SyncCoordinationInterruptedError("Sync lease ownership was lost."));
      controller.signal.throwIfAborted();
      return { acquired: true, value };
    } finally {
      if (heartbeat) {
        clearInterval(heartbeat);
        this.heartbeatTimers.delete(heartbeat);
      }
      if (acquired) await this.release(scope);
      this.activeControllers.delete(controller);
      this.activeScopes.delete(key);
    }
  }

  async release(scope: SyncScope): Promise<void> {
    const key = syncScopeKey(scope);
    await this.db.transaction("rw", this.db.syncLeases, async () => {
      const lease = await this.db.syncLeases.get(key);
      if (lease?.ownerToken === this.ownerToken) await this.db.syncLeases.delete(key);
    });
  }

  close(): void {
    this.closed = true;
    for (const controller of this.activeControllers) controller.abort(new SyncCoordinationInterruptedError("Sync coordinator closed."));
  }

  private assertScope(scope: SyncScope): void {
    if (scope.databaseName !== this.db.name) throw new Error("Sync scope does not match the coordinator database.");
  }

  private async acquire(scope: SyncScope): Promise<boolean> {
    const key = syncScopeKey(scope);
    const now = this.clock.now();
    return this.db.transaction("rw", this.db.syncLeases, async () => {
      const existing = await this.db.syncLeases.get(key);
      if (existing && existing.ownerToken !== this.ownerToken && existing.expiresAt > now) return false;
      const lease: SyncLease = {
        key,
        ownerToken: this.ownerToken,
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt: now + this.ttlMs,
      };
      await this.db.syncLeases.put(lease);
      return true;
    });
  }

  private async renew(scope: SyncScope): Promise<boolean> {
    const key = syncScopeKey(scope);
    const now = this.clock.now();
    return this.db.transaction("rw", this.db.syncLeases, async () => {
      const lease = await this.db.syncLeases.get(key);
      if (lease?.ownerToken !== this.ownerToken) return false;
      await this.db.syncLeases.put({ ...lease, heartbeatAt: now, expiresAt: now + this.ttlMs });
      return true;
    });
  }
}

type BrowserSyncCoordinatorOptions = {
  locks?: LockManager;
  fallback: DexieLeaseSyncCoordinator;
  channel?: CoordinationChannel | null;
};

export class BrowserSyncCoordinator implements SyncCoordinator {
  private readonly primary: WebLockSyncCoordinator | null;
  private readonly channel: CoordinationChannel | null;
  private readonly listeners = new Set<{ scope: SyncScope; listener: (event: SyncCoordinationEvent) => void }>();
  private closed = false;

  constructor(private readonly options: BrowserSyncCoordinatorOptions) {
    this.primary = options.locks ? new WebLockSyncCoordinator(options.locks) : null;
    this.channel = options.channel === undefined ? createChannel() : options.channel;
    if (this.channel) this.channel.onmessage = (message) => this.dispatch(message.data);
  }

  async runExclusive<T>(scope: SyncScope, operation: (context: SyncExecutionContext) => Promise<T>): Promise<SyncCoordinationResult<T>> {
    const coordinator = this.primary ?? this.options.fallback;
    return coordinator.runExclusive(scope, async (context) => {
      this.publish({ type: "started", scope });
      try {
        return await operation(context);
      } finally {
        this.publish({ type: "completed", scope });
      }
    });
  }

  requestSync(scope: SyncScope): void {
    this.publish({ type: "requested", scope });
  }

  subscribe(scope: SyncScope, listener: (event: SyncCoordinationEvent) => void): () => void {
    const subscription = { scope, listener };
    this.listeners.add(subscription);
    return () => this.listeners.delete(subscription);
  }

  close(): void {
    this.closed = true;
    this.primary?.close();
    this.options.fallback.close();
    this.channel?.close();
    this.listeners.clear();
  }

  private publish(event: SyncCoordinationEvent): void {
    if (this.closed) return;
    try {
      this.channel?.postMessage(event);
    } catch {
      return;
    }
  }

  private dispatch(event: SyncCoordinationEvent): void {
    if (!isCoordinationEvent(event)) return;
    for (const subscription of this.listeners) {
      if (syncScopeKey(subscription.scope) === syncScopeKey(event.scope)) subscription.listener(event);
    }
  }
}

function isCoordinationEvent(value: unknown): value is SyncCoordinationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<SyncCoordinationEvent>;
  if (event.type !== "requested" && event.type !== "started" && event.type !== "completed") return false;
  return Boolean(event.scope && typeof event.scope.databaseName === "string" && event.scope.databaseName.length <= 256 && typeof event.scope.userId === "string" && event.scope.userId.length <= 256);
}

export function createBrowserSyncCoordinator(db: ViatikDatabase): BrowserSyncCoordinator {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return new BrowserSyncCoordinator({ locks, fallback: new DexieLeaseSyncCoordinator(db) });
}

function createChannel(): CoordinationChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(COORDINATION_CHANNEL);
}

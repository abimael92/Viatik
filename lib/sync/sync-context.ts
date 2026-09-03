let syncUserId: string | null = null;

export function configureSyncUser(userId: string | null): void {
  syncUserId = userId;
}

export function getSyncUser(): string | null {
  return syncUserId;
}

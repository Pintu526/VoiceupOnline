interface GeographyCacheEntry<T> {
  value: T;
  version: string;
  expiresAt: number;
}

export interface GeographyCacheOptions {
  defaultTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export class GeographyCache<T = unknown> {
  private readonly entries = new Map<string, GeographyCacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: GeographyCacheOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 15 * 60_000;
    this.maxEntries = Math.max(1, options.maxEntries ?? 250);
    this.now = options.now ?? Date.now;
  }

  get(key: string, version = "default"): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.version !== version || entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, options: { version?: string; ttlMs?: number } = {}): T {
    const ttlMs = Math.max(0, options.ttlMs ?? this.defaultTtlMs);
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      version: options.version ?? "default",
      expiresAt: this.now() + ttlMs
    });
    this.trim();
    return value;
  }

  async getOrLoad(
    key: string,
    loader: () => Promise<T>,
    options: { version?: string; ttlMs?: number } = {}
  ): Promise<T> {
    const cached = this.get(key, options.version);
    if (cached !== undefined) return cached;
    const value = await loader();
    return this.set(key, value, options);
  }

  delete(key: string) {
    return this.entries.delete(key);
  }

  deleteByPrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }

  private trim() {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }
}

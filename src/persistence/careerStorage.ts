import {
  CAREER_SAVE_KEY,
  CAREER_SAVE_VERSION,
  CareerPersistenceError,
  parseCareerSave,
  type LoadCareerResult,
} from '../core/persistence';

export type CareerStorageMode = 'indexeddb' | 'legacy-localstorage-fallback';
export type CareerMigrationSource = 'localstorage' | undefined;

export interface CareerStorageDiagnostics {
  backend: CareerStorageMode;
  byteLength: number | null;
  schemaVersion: number | null;
  savedAt: string | null;
  migrationSource?: CareerMigrationSource;
}

export type CareerStorageLoadResult =
  | (LoadCareerResult & { mode: CareerStorageMode })
  | { ok: false; reason: 'indexeddb_unavailable' | 'transaction_failure'; mode: CareerStorageMode };

const DATABASE_NAME = 'my-football-legend';
const STORE_NAME = 'careerSaves';
const PRIMARY_SLOT = 'primary';
const availableLegacyStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });

const isQuotaError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

export class CareerStorage {
  private database?: IDBDatabase;
  private modeValue?: CareerStorageMode;
  private writeQueue: Promise<void> = Promise.resolve();
  private diagnosticsValue?: CareerStorageDiagnostics;
  private initialization?: Promise<CareerStorageMode>;

  constructor(
    private readonly indexedDatabase: IDBFactory | undefined = globalThis.indexedDB,
    private readonly legacyStorage: Storage | null | undefined = availableLegacyStorage(),
  ) {}

  get mode(): CareerStorageMode | undefined {
    return this.modeValue;
  }

  getDiagnostics(): CareerStorageDiagnostics | undefined {
    return this.diagnosticsValue ? { ...this.diagnosticsValue } : undefined;
  }

  private async initialize(): Promise<CareerStorageMode> {
    if (this.modeValue) return this.modeValue;
    return (this.initialization ??= this.openDatabase());
  }

  private async openDatabase(): Promise<CareerStorageMode> {
    if (!this.indexedDatabase) {
      this.modeValue = 'legacy-localstorage-fallback';
      return this.modeValue;
    }
    try {
      const request = this.indexedDatabase.open(DATABASE_NAME, 1);
      this.database = await new Promise<IDBDatabase>((resolve, reject) => {
        let rejected = false;
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME))
            request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => {
          if (rejected) request.result.close();
          else resolve(request.result);
        };
        request.onerror = () => {
          rejected = true;
          reject(request.error ?? new Error('IndexedDB open failed'));
        };
        request.onblocked = () => {
          rejected = true;
          reject(new Error('IndexedDB open blocked'));
        };
      });
      this.modeValue = 'indexeddb';
    } catch {
      this.modeValue = 'legacy-localstorage-fallback';
    }
    return this.modeValue;
  }

  private async readIndexedDb(): Promise<string | null> {
    const transaction = this.database!.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const [value] = await Promise.all([
      requestResult(transaction.objectStore(STORE_NAME).get(PRIMARY_SLOT)),
      done,
    ]);
    return typeof value === 'string' ? value : null;
  }

  private async writeIndexedDb(serialized: string): Promise<void> {
    const transaction = this.database!.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).put(serialized, PRIMARY_SLOT);
    await done;
  }

  private updateDiagnostics(serialized: string, migrationSource?: CareerMigrationSource) {
    const parsed = parseCareerSave(serialized);
    this.diagnosticsValue = {
      backend: this.modeValue!,
      byteLength: new TextEncoder().encode(serialized).byteLength,
      schemaVersion: parsed.ok ? parsed.save.version : null,
      savedAt: parsed.ok ? parsed.save.savedAt : null,
      ...(migrationSource ? { migrationSource } : {}),
    };
  }

  load(): Promise<CareerStorageLoadResult> {
    const operation = this.writeQueue.then(() => this.loadCurrent());
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async loadCurrent(): Promise<CareerStorageLoadResult> {
    const mode = await this.initialize();
    if (mode === 'legacy-localstorage-fallback') {
      let raw: string | null;
      try {
        raw = this.legacyStorage?.getItem(CAREER_SAVE_KEY) ?? null;
      } catch {
        return { ok: false, reason: 'transaction_failure', mode };
      }
      const result = parseCareerSave(raw);
      if (raw) this.updateDiagnostics(raw);
      return { ...result, mode };
    }
    let indexed: string | null;
    try {
      indexed = await this.readIndexedDb();
    } catch {
      return { ok: false, reason: 'transaction_failure', mode };
    }
    if (indexed !== null) {
      const result = parseCareerSave(indexed);
      this.updateDiagnostics(indexed);
      return { ...result, mode };
    }
    let legacy: string | null;
    try {
      legacy = this.legacyStorage?.getItem(CAREER_SAVE_KEY) ?? null;
    } catch {
      return { ok: false, reason: 'transaction_failure', mode };
    }
    const migrated = parseCareerSave(legacy);
    if (!migrated.ok) return { ...migrated, mode };
    const normalized = JSON.stringify(migrated.save);
    try {
      await this.writeIndexedDb(normalized);
      const verified = await this.readIndexedDb();
      const verification = parseCareerSave(verified);
      if (!verification.ok || verified !== normalized)
        return { ok: false, reason: 'transaction_failure', mode };
      this.legacyStorage?.removeItem(CAREER_SAVE_KEY);
      this.updateDiagnostics(normalized, 'localstorage');
      return { ...verification, mode };
    } catch {
      return { ok: false, reason: 'transaction_failure', mode };
    }
  }

  async exists(): Promise<boolean> {
    return (await this.load()).ok;
  }

  /** Writes are deliberately serialized so an older transition can never finish last. */
  save(serialized: string): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      if (!parseCareerSave(serialized).ok)
        throw new CareerPersistenceError('validation_failure', 'Career save validation failed');
      const mode = await this.initialize();
      try {
        if (mode === 'indexeddb') await this.writeIndexedDb(serialized);
        else if (this.legacyStorage) this.legacyStorage.setItem(CAREER_SAVE_KEY, serialized);
        else
          throw new CareerPersistenceError(
            'storage_failure',
            'IndexedDB unavailable and no fallback',
          );
        this.updateDiagnostics(serialized);
      } catch (error) {
        if (error instanceof CareerPersistenceError) throw error;
        throw new CareerPersistenceError(
          isQuotaError(error) ? 'quota_exceeded' : 'storage_failure',
          isQuotaError(error) ? 'Browser storage quota exceeded' : 'Browser storage write failed',
          { cause: error },
        );
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  delete(): Promise<void> {
    const operation = this.writeQueue.then(() => this.deleteCurrent());
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async deleteCurrent(): Promise<void> {
    const mode = await this.initialize();
    if (mode === 'indexeddb') {
      const transaction = this.database!.transaction(STORE_NAME, 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(STORE_NAME).delete(PRIMARY_SLOT);
      await done;
    }
    this.legacyStorage?.removeItem(CAREER_SAVE_KEY);
    this.diagnosticsValue = {
      backend: mode,
      byteLength: null,
      schemaVersion: null,
      savedAt: null,
    };
  }
}

export const careerStorage = new CareerStorage();
export { CAREER_SAVE_VERSION };

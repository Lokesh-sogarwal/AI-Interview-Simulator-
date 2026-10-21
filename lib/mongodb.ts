import { MongoClient, type Db } from "mongodb";

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined;
  var __mongoIndexesPromise: Promise<void> | undefined;
}

export function getMongoClientPromise() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  if (!globalThis.__mongoClientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    globalThis.__mongoClientPromise = client.connect().catch((err) => {
      globalThis.__mongoClientPromise = undefined;
      throw err;
    });
  }

  return globalThis.__mongoClientPromise;
}

/**
 * Creates the indexes the app relies on for integrity (unique emails, one
 * registration per contest) and for its hot queries. Runs once per process.
 * Failures (e.g. pre-existing duplicates) are logged, never fatal.
 */
async function ensureIndexes(db: Db) {
  const specs: Array<[string, Record<string, 1 | -1>, Record<string, unknown>?]> = [
    ["users", { email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } }],
    ["users", { firebaseUid: 1 }, { unique: true, partialFilterExpression: { firebaseUid: { $type: "string" } } }],
    ["interviews", { userId: 1, createdAt: -1 }],
    ["interviews", { userId: 1, status: 1, scheduledFor: 1 }],
    ["contest_registrations", { contestId: 1, userId: 1 }, { unique: true }],
    ["contest_registrations", { contestId: 1, score: -1 }],
    ["contest_submissions", { userId: 1, contestId: 1, problemIndex: 1, createdAt: -1 }],
    ["resumes", { userId: 1, createdAt: -1 }],
    ["audit_logs", { at: -1 }],
  ];
  const byCollection = new Map<string, typeof specs>();
  for (const spec of specs) byCollection.set(spec[0], [...(byCollection.get(spec[0]) ?? []), spec]);

  await Promise.all(
    [...byCollection.entries()].map(async ([collection, list]) => {
      // Reuse indexes that already exist on the same key (e.g. created by another app
      // sharing this database) instead of failing on a name clash or replacing them.
      const existing = await db
        .collection(collection)
        .listIndexes()
        .toArray()
        .catch(() => [] as Array<{ key: Record<string, unknown>; unique?: boolean }>);
      for (const [, keys, options] of list) {
        const match = existing.find((ix) => JSON.stringify(ix.key) === JSON.stringify(keys));
        if (match) {
          // Only warn where uniqueness protects data integrity.
          const critical = (collection === "users" && "email" in keys) || collection === "contest_registrations";
          if (options?.unique && !match.unique && critical) {
            console.warn(`[mongodb] ${collection} ${JSON.stringify(keys)} index exists but is not unique; leaving it unchanged.`);
          }
          continue;
        }
        await db
          .collection(collection)
          .createIndex(keys, options ?? {})
          .catch((err: unknown) => {
            console.error(
              `[mongodb] could not create index on ${collection} ${JSON.stringify(keys)}:`,
              err instanceof Error ? err.message : err,
            );
          });
      }
    }),
  );
}

export async function getDb() {
  const clientPromise = getMongoClientPromise();
  if (!clientPromise) return null;

  try {
    const client = await clientPromise;
    const dbName = process.env.MONGODB_DB || "interview_simulator";
    const db = client.db(dbName);
    if (!globalThis.__mongoIndexesPromise) {
      globalThis.__mongoIndexesPromise = ensureIndexes(db);
    }
    return db;
  } catch (err) {
    console.error(
      "MongoDB connection failed. Check MONGODB_URI (Atlas username/password + URL-encoding) and Network Access allowlist.",
      err instanceof Error ? err.message : "unknown error",
    );
    return null;
  }
}

export function isDuplicateKeyError(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}

/**
 * User-facing reason for a null getDb(): distinguishes a missing MONGODB_URI
 * from a configured database that cannot be reached (details go to server logs).
 */
export function dbUnavailableMessage() {
  return process.env.MONGODB_URI
    ? "The database is temporarily unreachable. Please try again shortly."
    : "Database is not configured. Set MONGODB_URI on the server.";
}

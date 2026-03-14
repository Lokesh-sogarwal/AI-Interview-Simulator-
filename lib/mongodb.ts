import { MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getMongoClientPromise() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  if (!globalThis.__mongoClientPromise) {
    const client = new MongoClient(uri);
    globalThis.__mongoClientPromise = client.connect();
  }

  return globalThis.__mongoClientPromise;
}

export async function getDb() {
  const clientPromise = getMongoClientPromise();
  if (!clientPromise) return null;

  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB || "interview_simulator";
  return client.db(dbName);
}

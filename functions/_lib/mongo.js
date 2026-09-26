import { MongoClient } from "mongodb";

let clientPromise;

export function getClient(env) {
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    const client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    });
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb(env) {
  const client = await getClient(env);
  return client.db(env.MONGODB_DB || "ledger");
}

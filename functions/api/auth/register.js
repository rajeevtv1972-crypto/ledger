import { getDb } from "../../../_lib/mongo.js";
import { hashPassword, randomToken, hashToken, json, sessionCookie } from "../../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || name.length > 100) return json({ error: "Please enter a valid name." }, 400);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Please enter a valid email address." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

    const db = await getDb(env);
    const users = db.collection("users");
    const existing = await users.findOne({ email }, { projection: { _id: 1 } });
    if (existing) return json({ error: "An account with this email already exists." }, 409);

    const { salt, hash } = await hashPassword(password);
    const now = new Date();
    const result = await users.insertOne({
      name, email, passwordHash: hash, passwordSalt: salt,
      createdAt: now, updatedAt: now
    });

    const token = await randomToken(32);
    await db.collection("sessions").insertOne({
      tokenHash: await hashToken(token),
      userId: result.insertedId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 2592000000)
    });

    return json({ ok: true, user: { id: result.insertedId.toString(), name, email } }, 201, {
      "Set-Cookie": sessionCookie(token)
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to create your account right now." }, 500);
  }
}

import { getDb } from "../../../_lib/mongo.js";
import { hashPassword, randomToken, hashToken, json, sessionCookie } from "../../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) return json({ error: "Email and password are required." }, 400);

    const db = await getDb(env);
    const user = await db.collection("users").findOne({ email });
    if (!user) return json({ error: "Invalid email or password." }, 401);

    const check = await hashPassword(password, user.passwordSalt);
    if (check.hash !== user.passwordHash) return json({ error: "Invalid email or password." }, 401);

    const token = await randomToken(32);
    const now = new Date();
    await db.collection("sessions").insertOne({
      tokenHash: await hashToken(token),
      userId: user._id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 2592000000)
    });

    return json({ ok: true, user: { id: user._id.toString(), name: user.name, email: user.email } }, 200, {
      "Set-Cookie": sessionCookie(token)
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to sign you in right now." }, 500);
  }
}

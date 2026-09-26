import { getDb } from "../../../_lib/mongo.js";
import { getCookie, hashToken, json } from "../../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const token = getCookie(request, "ledger_session");
    if (!token) return json({ user: null }, 401);

    const db = await getDb(env);
    const session = await db.collection("sessions").findOne({
      tokenHash: await hashToken(token),
      expiresAt: { $gt: new Date() }
    });
    if (!session) return json({ user: null }, 401);

    const user = await db.collection("users").findOne(
      { _id: session.userId },
      { projection: { passwordHash: 0, passwordSalt: 0 } }
    );
    if (!user) return json({ user: null }, 401);

    return json({ user: { id: user._id.toString(), name: user.name, email: user.email } });
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to check your session." }, 500);
  }
}

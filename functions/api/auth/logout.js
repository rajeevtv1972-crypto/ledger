import { getDb } from "../../../_lib/mongo.js";
import { getCookie, hashToken, clearSessionCookie, json } from "../../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const token = getCookie(request, "ledger_session");
    if (token) {
      const db = await getDb(env);
      await db.collection("sessions").deleteOne({ tokenHash: await hashToken(token) });
    }
  } catch (error) {
    console.error(error);
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

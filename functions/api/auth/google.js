import { getDb } from "../../../_lib/mongo.js";
import { randomToken, hashToken, json, sessionCookie } from "../../../_lib/auth.js";

async function createSession(db, userId) {
  const token = await randomToken(32);
  const now = new Date();
  await db.collection("sessions").insertOne({
    tokenHash: await hashToken(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 2592000000)
  });
  return token;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GOOGLE_CLIENT_ID) {
      return json({ error: "Google sign-in is not configured on the server." }, 503);
    }

    const body = await request.json();
    const credential = String(body.credential || "");
    if (!credential) return json({ error: "Google credential is missing." }, 400);

    // Google Identity Services returns a signed ID token in the credential field.
    // This integration validates it with Google's tokeninfo endpoint.
    const verifyResponse = await fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential)
    );
    const claims = await verifyResponse.json().catch(() => ({}));

    if (!verifyResponse.ok) return json({ error: "Google could not verify this sign-in." }, 401);

    const issuer = String(claims.iss || "");
    const audience = String(claims.aud || "");
    const subject = String(claims.sub || "");
    const email = String(claims.email || "").trim().toLowerCase();
    const emailVerified = claims.email_verified === true || claims.email_verified === "true";
    const expiresAt = Number(claims.exp || 0);

    if (!["https://accounts.google.com", "accounts.google.com"].includes(issuer)) {
      return json({ error: "Invalid Google token issuer." }, 401);
    }
    if (audience !== env.GOOGLE_CLIENT_ID) {
      return json({ error: "This Google account is not authorized for Ledger." }, 401);
    }
    if (!subject || !email || !emailVerified || expiresAt * 1000 <= Date.now()) {
      return json({ error: "Google account verification failed." }, 401);
    }
    if (!email.endsWith("@gmail.com")) {
      return json({ error: "Please use a Gmail address for Google sign-in." }, 400);
    }

    const db = await getDb(env);
    const users = db.collection("users");
    let user = await users.findOne({ googleSub: subject });

    if (!user) {
      user = await users.findOne({ email });

      if (user) {
        if (user.googleSub && user.googleSub !== subject) {
          return json({ error: "This email is already linked to another Google account." }, 409);
        }

        await users.updateOne(
          { _id: user._id },
          {
            $set: {
              googleSub: subject,
              authProvider: user.passwordHash ? "password+google" : "google",
              picture: claims.picture || user.picture || null,
              updatedAt: new Date()
            }
          }
        );
        user = await users.findOne({ _id: user._id });
      } else {
        const now = new Date();
        const result = await users.insertOne({
          name: String(claims.name || email.split("@")[0]).slice(0, 100),
          email,
          googleSub: subject,
          authProvider: "google",
          picture: claims.picture || null,
          createdAt: now,
          updatedAt: now
        });
        user = await users.findOne({ _id: result.insertedId });
      }
    }

    const token = await createSession(db, user._id);

    return json(
      {
        ok: true,
        user: { id: user._id.toString(), name: user.name, email: user.email }
      },
      200,
      { "Set-Cookie": sessionCookie(token) }
    );
  } catch (error) {
    console.error(error);
    return json({ error: "Unable to sign in with Google right now." }, 500);
  }
}

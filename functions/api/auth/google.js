import { jwtVerify, createRemoteJWKSet } from "jose";
import { getDb } from "../../../_lib/mongo.js";
import { randomToken, hashToken, json, sessionCookie } from "../../../_lib/auth.js";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

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

    const origin = request.headers.get("Origin");
    const expectedOrigin = new URL(request.url).origin;
    if (origin && origin !== expectedOrigin) {
      return json({ error: "Invalid sign-in origin." }, 403);
    }

    const body = await request.json();
    const credential = String(body.credential || "");
    if (!credential) return json({ error: "Google credential is missing." }, 400);

    const { payload } = await jwtVerify(credential, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID
    });

    const subject = String(payload.sub || "");
    const email = String(payload.email || "").trim().toLowerCase();
    const emailVerified = payload.email_verified === true;
    const name = String(payload.name || email.split("@")[0]).slice(0, 100);

    if (!subject || !email || !emailVerified) {
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
              picture: payload.picture || user.picture || null,
              updatedAt: new Date()
            }
          }
        );
        user = await users.findOne({ _id: user._id });
      } else {
        const now = new Date();
        const result = await users.insertOne({
          name,
          email,
          googleSub: subject,
          authProvider: "google",
          picture: payload.picture || null,
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

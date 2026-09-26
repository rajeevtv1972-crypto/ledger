const encoder = new TextEncoder();

function bytesToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(data);
}

export async function hashPassword(password, saltText) {
  const salt = saltText || await randomToken(16);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 120000, hash: "SHA-256" },
    key,
    256
  );
  return { salt, hash: bytesToBase64(new Uint8Array(bits)) };
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToBase64(new Uint8Array(digest));
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra }
  });
}

export function sessionCookie(token, maxAge = 2592000) {
  return "ledger_session=" + encodeURIComponent(token) + "; Max-Age=" + maxAge + "; Path=/; HttpOnly; Secure; SameSite=Lax";
}

export function clearSessionCookie() {
  return "ledger_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax";
}

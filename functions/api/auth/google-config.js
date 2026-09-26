export async function onRequestGet({ env }) {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response(JSON.stringify({ error: "Google sign-in is not configured." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
  return new Response(JSON.stringify({ clientId: env.GOOGLE_CLIENT_ID }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

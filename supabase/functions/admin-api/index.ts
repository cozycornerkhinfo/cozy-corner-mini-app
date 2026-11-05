const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyTelegram(initData: string, botToken: string): Promise<number | null> {
  if (!initData || initData.length > 10_000) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const userText = params.get("user");
  if (!receivedHash || !authDate || !userText) return null;
  if (Math.abs(Date.now() / 1000 - authDate) > 86_400) return null;

  const entries = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const calculatedHash = hex(await hmac(secretKey, dataCheckString));
  if (!safeEqual(calculatedHash, receivedHash)) return null;

  try {
    const user = JSON.parse(userText);
    return Number.isSafeInteger(user.id) ? user.id : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const adminId = Number(Deno.env.get("ADMIN_TELEGRAM_USER_ID"));
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!botToken || !Number.isSafeInteger(adminId) || !supabaseUrl || !serviceKey) {
      return json({ error: "Server secrets are not configured" }, 500);
    }

    const initData = req.headers.get("x-telegram-init-data") || "";
    const telegramUserId = await verifyTelegram(initData, botToken);
    if (telegramUserId !== adminId) return json({ error: "Admin access denied" }, 403);

    const body = await req.json();
    const base = `${supabaseUrl}/rest/v1/products`;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    if (body.action === "check") return json({ ok: true, admin: true });

    if (body.action === "create" || body.action === "update") {
      const p = body.product || {};
      if (!String(p.name || "").trim() || !String(p.category || "").trim() ||
          !Number.isFinite(Number(p.price)) || Number(p.price) < 0) {
        return json({ error: "Name, category and a valid price are required" }, 400);
      }
      const record = {
        name: String(p.name).trim().slice(0, 100),
        category: String(p.category).trim().slice(0, 50),
        description: String(p.description || "").trim().slice(0, 500),
        price: Number(Number(p.price).toFixed(2)),
        image_url: p.image_url ? String(p.image_url).slice(0, 2000) : null,
        available: p.available !== false,
      };
      const isUpdate = body.action === "update";
      if (isUpdate && !/^[0-9a-f-]{36}$/i.test(String(p.id || ""))) {
        return json({ error: "A valid product ID is required" }, 400);
      }
      const response = await fetch(isUpdate ? `${base}?id=eq.${encodeURIComponent(p.id)}` : base, {
        method: isUpdate ? "PATCH" : "POST",
        headers,
        body: JSON.stringify(record),
      });
      const result = await response.json().catch(() => []);
      if (!response.ok) return json({ error: "Database write failed", details: result }, 502);
      return json({ ok: true, product: result[0] || null });
    }

    if (body.action === "delete") {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ""))) return json({ error: "A valid product ID is required" }, 400);
      const response = await fetch(`${base}?id=eq.${encodeURIComponent(body.id)}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) return json({ error: "Delete failed" }, 502);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Unexpected server error" }, 500);
  }
});

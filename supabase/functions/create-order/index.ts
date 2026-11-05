import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const ADMIN_CHAT_ID = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !BOT_TOKEN) return json({ error: "Server is not configured" }, 500);

  try {
    if (req.method === "GET") {
      const products = await db("products?select=id,name,category,description,price,image_url,available&available=eq.true&order=category.asc,name.asc");
      return json({ products });
    }

    const initData = req.headers.get("x-telegram-init-data") || "";
    const telegramUser = await verifyTelegramInitData(initData);
    if (!telegramUser) return json({ error: "Open this menu inside Telegram to place an order." }, 401);

    const body = await req.json();
    const customerName = cleanText(body.customer_name, 60);
    const note = cleanText(body.note, 200);
    if (!customerName) return json({ error: "Please enter your name." }, 400);
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
      return json({ error: "Your basket is empty or invalid." }, 400);
    }

    const ids = [...new Set(body.items.map((item: any) => String(item.id || "")))];
    if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return json({ error: "Invalid product in basket." }, 400);

    const products = await db("products?select=id,name,category,price,available&id=in.(" + ids.join(",") + ")&available=eq.true");
    const byId = new Map(products.map((p: any) => [p.id, p]));
    const items = body.items.map((item: any) => {
      const product: any = byId.get(String(item.id));
      const qty = Number(item.qty);
      if (!product || !Number.isInteger(qty) || qty < 1 || qty > 50) throw new Error("A selected item is unavailable or has an invalid quantity.");
      return { id: product.id, name: product.name, price: Number(product.price), qty };
    });
    const total = items.reduce((sum: number, item: any) => sum + item.price * item.qty, 0);

    const rows = await db("orders", {
      method: "POST",
      body: {
        customer_name: customerName,
        note,
        currency: "USD",
        items,
        total: Number(total.toFixed(2)),
        telegram_user: telegramUser,
        telegram_chat_id: telegramUser.id,
        order_source: "mini_app",
        status: "new"
      },
      prefer: "return=representation"
    });
    const order = rows?.[0];
    if (!order) throw new Error("Order could not be saved.");

    if (ADMIN_CHAT_ID) {
      const lines = items.map((i: any) => "- " + i.name + " x " + i.qty + " — $" + (i.price * i.qty).toFixed(2)).join("\n");
      await telegram("sendMessage", {
        chat_id: ADMIN_CHAT_ID,
        text: "🛒 NEW COZY CORNER ORDER (MINI APP)\nOrder: " + order.id + "\nCustomer: " + customerName + "\n\n" + lines + "\n\nTotal: $" + total.toFixed(2) + "\nNote: " + (note || "-")
      });
    }

    return json({ ok: true, order_id: order.id, total: Number(total.toFixed(2)) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 400);
  }
});

async function verifyTelegramInitData(initData: string): Promise<any | null> {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  const pairs: string[] = [];
  params.forEach((value, key) => { if (key !== "hash") pairs.push(key + "=" + value); });
  pairs.sort();
  const encoder = new TextEncoder();
  const secret = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secretBytes = await crypto.subtle.sign("HMAC", secret, encoder.encode(BOT_TOKEN));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(pairs.join("\n"))));
  const expected = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!constantTimeEqual(expected, hash.toLowerCase())) return null;
  try { return JSON.parse(params.get("user") || "null"); } catch { return null; }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function cleanText(value: unknown, max: number): string {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}
async function db(path: string, options: { method?: string; body?: unknown; prefer?: string } = {}): Promise<any> {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: options.method || "GET",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  if (!response.ok) throw new Error("Database request failed: " + (await response.text()).slice(0, 250));
  return response.status === 204 ? null : await response.json();
}
async function telegram(method: string, body: unknown): Promise<any> {
  const response = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!result.ok) throw new Error("Telegram notification failed");
  return result;
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

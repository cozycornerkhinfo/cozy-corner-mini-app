import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json();
    if (!body.customer_name || !Array.isArray(body.items) || body.items.length === 0) {
      return json({ error: "Invalid order" }, 400);
    }

    // TODO: Verify Telegram WebApp initData server-side before accepting live orders.
    // TODO: Re-read product prices from the database; never trust prices sent by browser.
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (!token || !chatId) return json({ error: "Server is not configured" }, 500);

    const lines = body.items.map((i: any) =>
      `• ${String(i.name)} × ${Number(i.qty)} — $${(Number(i.price) * Number(i.qty)).toFixed(2)}`
    ).join("\n");
    const message = `🛒 NEW COZY CORNER ORDER\nCustomer: ${String(body.customer_name)}\n\n${lines}\n\nTotal: $${Number(body.total).toFixed(2)}\nNote: ${String(body.note || "-")}`;

    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
    if (!tg.ok) return json({ error: "Telegram notification failed" }, 502);
    return json({ ok: true });
  } catch {
    return json({ error: "Unexpected server error" }, 500);
  }
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

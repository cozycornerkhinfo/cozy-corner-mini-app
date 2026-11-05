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

function escapeTelegramHtml(value: string): string {
  return value.replace(/[&<>]/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    return "&gt;";
  });
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

async function telegramApi(botToken: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) console.error(`Telegram ${method} failed:`, result);
  return result;
}

const botCopy = {
  en: {
    welcome: "Welcome to Cozy Corner! 💙\nPlease choose your language to continue.",
    menu: "What would you like to do?",
    products: "🛍️ <b>Available Menu</b>",
    empty: "There are no available products right now.",
    order: "Tap below to open the Cozy Corner Basket Builder and place your order.",
    privacy: "For privacy, please continue your order in my private chat:",
    choose: "Please use the buttons below to continue.",
    view: "View Menu",
    orderButton: "Place an Order",
    language: "Change Language",
    open: "Open Basket Builder",
    back: "Main Menu",
  },
  km: {
    welcome: "សូមស្វាគមន៍មកកាន់ Cozy Corner! 💙\nសូមជ្រើសរើសភាសា។",
    menu: "តើអ្នកចង់ធ្វើអ្វី?",
    products: "🛍️ <b>មុខម្ហូប និងភេសជ្ជៈដែលមាន</b>",
    empty: "ឥឡូវនេះមិនមានផលិតផលទេ។",
    order: "ចុចខាងក្រោមដើម្បីបើក Cozy Corner Basket Builder និងធ្វើការកុម្ម៉ង់។",
    privacy: "ដើម្បីរក្សាភាពឯកជន សូមបន្តការកុម្ម៉ង់តាម Private Chat របស់ Bot៖",
    choose: "សូមប្រើប៊ូតុងខាងក្រោម។",
    view: "មើលមុខម្ហូប",
    orderButton: "ធ្វើការកុម្ម៉ង់",
    language: "ប្តូរភាសា",
    open: "បើក Basket Builder",
    back: "ម៉ឺនុយដើម",
  },
  zh: {
    welcome: "欢迎来到 Cozy Corner！💙\n请选择您的语言。",
    menu: "您想进行什么操作？",
    products: "🛍️ <b>当前菜单</b>",
    empty: "目前暂无可购买的商品。",
    order: "点击下方按钮，打开 Cozy Corner Basket Builder 并下单。",
    privacy: "为了保护隐私，请在 Bot 私聊中继续下单：",
    choose: "请使用下方按钮继续。",
    view: "查看菜单",
    orderButton: "立即下单",
    language: "更改语言",
    open: "打开 Basket Builder",
    back: "主菜单",
  },
  my: {
    welcome: "Cozy Corner မှ ကြိုဆိုပါတယ်။ 💙\nဆက်လက်ရန် ဘာသာစကားရွေးချယ်ပါ။",
    menu: "ဘာလုပ်ချင်ပါသလဲ။",
    products: "🛍️ <b>ရရှိနိုင်သော Menu</b>",
    empty: "လောလောဆယ် ရရှိနိုင်တဲ့ ပစ္စည်းမရှိသေးပါ။",
    order: "အောက်က ခလုတ်ကိုနှိပ်ပြီး Cozy Corner Basket Builder မှာ Order တင်နိုင်ပါတယ်။",
    privacy: "ကိုယ်ရေးအချက်အလက်လုံခြုံရေးအတွက် Bot Private Chat မှာ Order ဆက်တင်ပေးပါ။",
    choose: "အောက်ပါခလုတ်တွေကို အသုံးပြုပေးပါ။",
    view: "Menu ကြည့်ရန်",
    orderButton: "Order တင်ရန်",
    language: "ဘာသာစကားပြောင်းရန်",
    open: "Basket Builder ဖွင့်ရန်",
    back: "ပင်မ Menu",
  },
};

function languageKeyboard() {
  return { inline_keyboard: [[
    { text: "🇬🇧 English", callback_data: "lang:en" },
    { text: "🇰🇭 ខ្មែរ", callback_data: "lang:km" },
    { text: "🇲🇲 မြန်မာ", callback_data: "lang:my" },
    { text: "🇨🇳 中文", callback_data: "lang:zh" },
  ]] };
}

async function handleTelegramUpdate(
  update: Record<string, any>,
  botToken: string,
  supabaseUrl: string,
  serviceKey: string,
) {
  const message = update.message;
  const callback = update.callback_query;
  if (message) {
    const chatId = message.chat?.id;
    const chatType = message.chat?.type;
    const incoming = String(message.text || "").trim();
    if (!chatId) return;
    if (chatType !== "private") {
      if (incoming.startsWith("/start") || incoming.startsWith("/order")) {
        await telegramApi(botToken, "sendMessage", {
          chat_id: chatId,
          text: "💙 For menu and ordering, please chat with me privately:",
          reply_markup: { inline_keyboard: [[
            { text: "Open Cozy Corner Bot", url: "https://t.me/BreakfastMenus_bot?start=order" },
          ]] },
        });
      }
      return;
    }
    if (incoming.startsWith("/start") || incoming.startsWith("/language")) {
      await telegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: "Welcome to Cozy Corner! 💙\nPlease choose your language / សូមជ្រើសរើសភាសា / ဘာသာစကားရွေးပါ / 请选择语言。",
        reply_markup: languageKeyboard(),
      });
    } else {
      await telegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: "Please use /start to open the Cozy Corner menu.",
        reply_markup: languageKeyboard(),
      });
    }
    return;
  }

  if (!callback) return;
  const callbackId = String(callback.id || "");
  const chatId = callback.message?.chat?.id;
  const chatType = callback.message?.chat?.type;
  const data = String(callback.data || "");
  if (callbackId) await telegramApi(botToken, "answerCallbackQuery", { callback_query_id: callbackId });
  if (!chatId || chatType !== "private") return;

  const [action, langRaw] = data.split(":");
  const lang = (["en", "km", "my", "zh"].includes(langRaw) ? langRaw : "en") as keyof typeof botCopy;
  const copy = botCopy[lang];
  const send = (text: string, reply_markup?: Record<string, unknown>) =>
    telegramApi(botToken, "sendMessage", {
      chat_id: chatId, text, parse_mode: "HTML", ...(reply_markup ? { reply_markup } : {}),
    });

  if (action === "lang") {
    await send(copy.menu, {
      inline_keyboard: [
        [{ text: copy.view, callback_data: `menu:${lang}` }],
        [{ text: copy.orderButton, callback_data: `order:${lang}` }],
        [{ text: copy.language, callback_data: "language:en" }],
      ],
    });
  } else if (action === "language") {
    await send("Please choose your language / សូមជ្រើសរើសភាសា / ဘာသာစကားရွေးပါ။", languageKeyboard());
  } else if (action === "menu") {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/products?select=name,category,price&available=eq.true&order=category.asc,name.asc`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const rows = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(rows)) {
      await send("Sorry, the menu is temporarily unavailable.");
      return;
    }
    const list = rows.slice(0, 60).map((p: {name:string;category:string;price:number|string}) =>
      `• ${escapeTelegramHtml(p.name)} — ${Number(p.price).toFixed(2)} <i>(${escapeTelegramHtml(p.category)})</i>`
    );
    const text = list.length ? `${copy.products}\n\n${list.join("\n")}\n\nPrices are in USD.` : copy.empty;
    await send(text, {
      inline_keyboard: [
        [{ text: copy.orderButton, callback_data: `order:${lang}` }],
        [{ text: copy.back, callback_data: `lang:${lang}` }],
      ],
    });
  } else if (action === "order") {
    const appUrl = Deno.env.get("MINI_APP_URL");
    if (!appUrl) {
      await send("The ordering link is not configured yet. Please contact Cozy Corner.");
      return;
    }
    await send(copy.order, {
      inline_keyboard: [[{ text: copy.open, web_app: { url: appUrl } }]],
    });
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

    const body = await req.json();
    // Telegram webhook updates are authenticated with Telegram's secret-token header.
    if (body.message || body.callback_query) {
      const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
      const suppliedSecret = req.headers.get("x-telegram-bot-api-secret-token") || "";
      if (!webhookSecret || !safeEqual(webhookSecret, suppliedSecret)) {
        return json({ error: "Invalid Telegram webhook secret" }, 401);
      }
      await handleTelegramUpdate(body, botToken, supabaseUrl, serviceKey);
      return json({ ok: true });
    }

    const initData = req.headers.get("x-telegram-init-data") || "";
    const telegramUserId = await verifyTelegram(initData, botToken);
    const base = `${supabaseUrl}/rest/v1/products`;

    // Customer order submission: accept any verified Telegram Mini App user.
    if (body.action === "submit-order") {
      if (!telegramUserId) return json({ error: "Please open the Mini App from Telegram and try again." }, 401);
      const customerName = String(body.customer_name || "").trim().slice(0, 60);
      const note = String(body.note || "").trim().slice(0, 200);
      const submittedItems = Array.isArray(body.items) ? body.items : [];
      if (!customerName) return json({ error: "Please enter your name." }, 400);
      if (!submittedItems.length || submittedItems.length > 30) return json({ error: "Your basket is empty or too large." }, 400);

      const quantities = new Map<string, number>();
      for (const item of submittedItems) {
        const id = String(item.id || "");
        const qty = Number(item.qty);
        if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(qty) || qty < 1 || qty > 50) {
          return json({ error: "Invalid basket item. Please refresh and try again." }, 400);
        }
        quantities.set(id, (quantities.get(id) || 0) + qty);
      }
      const ids = [...quantities.keys()];
      const productResponse = await fetch(
        `${base}?select=id,name,price,available&id=in.(${ids.map(encodeURIComponent).join(",")})&available=eq.true`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      const productRows = await productResponse.json().catch(() => []);
      if (!productResponse.ok || !Array.isArray(productRows) || productRows.length !== ids.length) {
        return json({ error: "One or more products are no longer available. Please refresh your basket." }, 400);
      }
      const orderItems = productRows.map((p: {id:string;name:string;price:number|string}) => ({
        id: p.id, name: p.name, price: Number(p.price), qty: quantities.get(p.id) || 0,
      }));
      const total = Number(orderItems.reduce((sum: number, p: {price:number;qty:number}) => sum + p.price * p.qty, 0).toFixed(2));
      let telegramUser: Record<string, unknown> = { id: telegramUserId };
      try {
        const params = new URLSearchParams(initData);
        const rawUser = params.get("user");
        if (rawUser) telegramUser = JSON.parse(rawUser);
      } catch { /* verified ID remains available */ }

      const orderResponse = await fetch(`${supabaseUrl}/rest/v1/orders`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          customer_name: customerName,
          note,
          currency: "USD",
          items: orderItems,
          total,
          telegram_user: telegramUser,
        }),
      });
      const savedOrders = await orderResponse.json().catch(() => []);
      if (!orderResponse.ok || !Array.isArray(savedOrders) || !savedOrders[0]) {
        console.error("Order database insert failed:", savedOrders);
        return json({ error: "Could not save your order. Please try again." }, 502);
      }
      const savedOrder = savedOrders[0];
      const lines = orderItems.map((p: {name:string;qty:number;price:number}) =>
        `• ${escapeTelegramHtml(p.name)} x${p.qty} — ${(p.price * p.qty).toFixed(2)}`
      ).join("\n");
      const telegramText = [
        "🛒 <b>New Cozy Corner Order</b>",
        `Order: <code>${String(savedOrder.id).slice(0, 8)}</code>`,
        `Customer: ${escapeTelegramHtml(customerName)}`,
        `Telegram ID: <code>${telegramUserId}</code>`,
        "",
        lines,
        "",
        `<b>Total: ${total.toFixed(2)} USD</b>`,
        note ? `Note: ${escapeTelegramHtml(note)}` : "",
      ].filter(Boolean).join("\n");
      const groupChatId = Deno.env.get("TELEGRAM_GROUP_CHAT_ID");
      let telegramSent = false;
      let groupSent = false;
      const sendTelegramMessage = async (chatId: string | number) => {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: telegramText, parse_mode: "HTML" }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true) console.error("Telegram order notification failed:", result);
        return response.ok && result.ok === true;
      };
      try {
        telegramSent = await sendTelegramMessage(adminId);
      } catch (notifyError) {
        console.error("Telegram private order notification error:", notifyError);
      }
      if (groupChatId) {
        try {
          groupSent = await sendTelegramMessage(groupChatId);
        } catch (notifyError) {
          console.error("Telegram group order notification error:", notifyError);
        }
      }
      return json({
        ok: true,
        order_id: savedOrder.id,
        telegram_sent: telegramSent,
        group_sent: groupSent,
      });
    }

    if (telegramUserId !== adminId) return json({ error: "Admin access denied" }, 403);
    if (body.action === "setup-webhook") {
      const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
      if (!webhookSecret || !/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
        return json({ error: "TELEGRAM_WEBHOOK_SECRET is missing or invalid" }, 500);
      }
      const webhookUrl = `${supabaseUrl}/functions/v1/admin-api`;
      const result = await telegramApi(botToken, "setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      });
      if (result.ok !== true) return json({ error: "Could not register Telegram webhook", details: result }, 502);
      return json({ ok: true, webhook_url: webhookUrl });
    }
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    if (body.action === "check") return json({ ok: true, admin: true });

    if (body.action === "upload") {
      const file = body.file || {};
      const mimeTypes: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
      };
      const extension = mimeTypes[String(file.type || "")];
      const encoded = String(file.base64 || "");
      if (!extension || !encoded || encoded.length > 7_000_000) {
        return json({ error: "Choose a JPG, PNG, WEBP or GIF image up to 5 MB" }, 400);
      }
      let bytes: Uint8Array;
      try {
        const binary = atob(encoded);
        bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      } catch {
        return json({ error: "Invalid image data" }, 400);
      }
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
        return json({ error: "Image must be 5 MB or smaller" }, 400);
      }
      const path = `${crypto.randomUUID()}.${extension}`;
      const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/products/${path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": String(file.type),
          "x-upsert": "true",
        },
        body: bytes,
      });
      if (!uploadResponse.ok) {
        const detail = await uploadResponse.text().catch(() => "");
        console.error("Storage upload failed:", detail);
        return json({ error: "Photo upload failed. Please try again." }, 502);
      }
      return json({
        ok: true,
        image_url: `${supabaseUrl}/storage/v1/object/public/products/${path}`,
      });
    }



    if (body.action === "list") {
      const response = await fetch(`${base}?select=id,name,category,description,price,image_url,available,created_at&order=created_at.desc`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      const result = await response.json().catch(() => []);
      if (!response.ok) return json({ error: "Could not load products" }, 502);
      return json({ ok: true, products: result });
    }

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

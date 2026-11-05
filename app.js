const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const ADMIN_API = `${SUPABASE_URL}/functions/v1/admin-api`;
let products = [];
let categories = ["All"];
let activeCategory = "All";
const cart = new Map();
const $ = (id) => document.getElementById(id);
const money = n => "$" + Number(n || 0).toFixed(2);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const telegram = window.Telegram?.WebApp;
const initData = telegram?.initData || "";
let isAdmin = false;

async function adminRequest(action, extra = {}) {
  const response = await fetch(ADMIN_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": initData,
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({ action, ...extra })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

async function loadProducts() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    $("products").innerHTML = '<p class="muted">Supabase is not configured.</p>';
    return;
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,category,description,price,image_url,available&available=eq.true&order=created_at.desc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    const rows = await response.json();
    products = rows.map(p => ({ ...p, price: Number(p.price), image: p.image_url || "" }));
    categories = ["All", ...new Set(products.map(p => p.category).filter(Boolean))];
    if (!categories.includes(activeCategory)) activeCategory = "All";
    renderCategories(); renderProducts(); renderBasket();
    if (!products.length) $("products").innerHTML = '<p class="muted">No available products yet.</p>';
  } catch (error) {
    $("products").innerHTML = '<p class="muted">Could not load products. Please check the connection.</p>';
    console.error(error);
  }
}

function renderCategories() {
  $("categories").innerHTML = categories.map(c =>
    `<button class="category ${c === activeCategory ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join("");
  document.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => {
    activeCategory = b.dataset.cat; renderCategories(); renderProducts();
  });
}

function renderProducts() {
  const list = products.filter(p => activeCategory === "All" || p.category === activeCategory);
  $("products").innerHTML = list.map(p => `
    <article class="product">
      <img src="${escapeHtml(p.image)}" alt="">
      <h3>${escapeHtml(p.name)}</h3>
      <div class="price">${money(p.price)}</div>
      <button class="add" data-add="${escapeHtml(p.id)}">Add to basket</button>
    </article>`
  ).join("");
  document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    cart.set(b.dataset.add, (cart.get(b.dataset.add) || 0) + 1); renderBasket();
  });
}

function renderBasket() {
  const items = [...cart.entries()].map(([id, qty]) => {
    const product = products.find(p => p.id === id);
    return product ? { ...product, qty } : null;
  }).filter(Boolean);
  const total = items.reduce((sum, p) => sum + p.price * p.qty, 0);
  $("total").textContent = money(total);
  $("basket-items").innerHTML = items.length
    ? items.map(p => `<div class="basket-row"><span>${escapeHtml(p.name)} × ${p.qty}</span><strong>${money(p.price * p.qty)}</strong></div>`).join("")
    : "<p class='muted'>Your basket is empty.</p>";
}

$("order-button").onclick = async () => {
  const items = [...cart.entries()].map(([id, qty]) => {
    const product = products.find(p => p.id === id);
    return product ? { ...product, qty } : null;
  }).filter(Boolean);
  if (!items.length) { $("status").textContent = "Please add an item first."; return; }
  const name = $("customer-name").value.trim();
  if (!name) { $("status").textContent = "Please enter your name."; return; }
  const endpoint = window.COZY_ORDER_ENDPOINT;
  if (!endpoint) { $("status").textContent = "Orders are not connected yet. Please contact Cozy Corner."; return; }
  const payload = {
    customer_name: name, note: $("customer-note").value.trim(), currency: "USD",
    items: items.map(({ id, name, price, qty }) => ({ id, name, price, qty })),
    total: items.reduce((sum, p) => sum + p.price * p.qty, 0),
    telegram_user: telegram?.initDataUnsafe?.user || null
  };
  $("order-button").disabled = true; $("status").textContent = "Sending order…";
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Order request failed");
    $("status").textContent = "Order sent to Cozy Corner. Thank you!";
    cart.clear(); renderBasket();
  } catch (error) { $("status").textContent = "Could not send order. Please try again."; }
  finally { $("order-button").disabled = false; }
};

function resetProductForm() {
  $("product-form").reset();
  $("edit-product-id").value = "";
  $("admin-available").checked = true;
  $("admin-photo-preview").hidden = true;
  $("admin-photo-preview").removeAttribute("src");
  $("save-product").textContent = "Add product";
  $("cancel-edit").hidden = true;
}

function startEdit(product) {
  $("edit-product-id").value = product.id;
  $("admin-name").value = product.name || "";
  $("admin-category").value = product.category || "";
  $("admin-price").value = product.price;
  $("admin-image").value = product.image_url || "";
  $("admin-photo").value = "";
  $("admin-photo-preview").src = product.image_url || "";
  $("admin-photo-preview").hidden = !product.image_url;
  $("admin-description").value = product.description || "";
  $("admin-available").checked = product.available !== false;
  $("save-product").textContent = "Save changes";
  $("cancel-edit").hidden = false;
  $("admin-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function refreshAdminProducts() {
  const result = await adminRequest("list");
  const rows = result.products || [];
  $("admin-products").innerHTML = rows.length ? rows.map(p => `
    <div class="admin-product ${p.available ? "" : "unavailable"}">
      <img src="${escapeHtml(p.image_url || "")}" alt="">
      <div class="admin-product-info">
        <strong>${escapeHtml(p.name)}</strong>
        <small>${escapeHtml(p.category)} · ${money(p.price)} · ${p.available ? "Available" : "Unavailable"}</small>
      </div>
      <div class="admin-product-actions">
        <button type="button" data-edit="${escapeHtml(p.id)}">Edit</button>
        <button type="button" class="delete-product" data-delete="${escapeHtml(p.id)}">Delete</button>
      </div>
    </div>`
  ).join("") : '<p class="muted">No products have been added.</p>';

  document.querySelectorAll("[data-edit]").forEach(button => button.onclick = () => {
    const product = rows.find(p => p.id === button.dataset.edit);
    if (product) startEdit(product);
  });
  document.querySelectorAll("[data-delete]").forEach(button => button.onclick = async () => {
    const product = rows.find(p => p.id === button.dataset.delete);
    if (!product || !confirm(`Delete "${product.name}"?`)) return;
    button.disabled = true;
    try {
      await adminRequest("delete", { id: product.id });
      $("admin-status").textContent = "Product deleted.";
      await refreshAdminProducts(); await loadProducts();
    } catch (error) { $("admin-status").textContent = error.message; button.disabled = false; }
  });
}

$("admin-photo").addEventListener("change", () => {
  const file = $("admin-photo").files?.[0];
  const preview = $("admin-photo-preview");
  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
});

$("product-form").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("edit-product-id").value;
  const product = {
    id: id || undefined,
    name: $("admin-name").value.trim(),
    category: $("admin-category").value.trim(),
    price: Number($("admin-price").value),
    image_url: $("admin-image").value.trim(),
    description: $("admin-description").value.trim(),
    available: $("admin-available").checked
  };
  $("save-product").disabled = true;
  $("admin-status").textContent = "Saving…";
  try {
    const photo = $("admin-photo").files?.[0];
    if (photo) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(photo.type)) throw new Error("Please choose a JPG, PNG, WEBP or GIF image.");
      if (photo.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");
      $("admin-status").textContent = "Uploading photo…";
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read the selected photo."));
        reader.readAsDataURL(photo);
      });
      const base64 = String(dataUrl).split(",")[1] || "";
      const uploaded = await adminRequest("upload", { file: { type: photo.type, base64 } });
      product.image_url = uploaded.image_url;
    }
    $("admin-status").textContent = "Saving product…";
    await adminRequest(id ? "update" : "create", { product });
    $("admin-status").textContent = id ? "Product updated." : "Product added.";
    resetProductForm();
    await refreshAdminProducts(); await loadProducts();
  } catch (error) { $("admin-status").textContent = error.message; }
  finally { $("save-product").disabled = false; }
});
$("cancel-edit").onclick = resetProductForm;

async function setupAdmin() {
  const status = $("admin-access-status");
  if (!telegram) {
    if (status) status.textContent = "Telegram WebApp connection not detected. Please reopen from the bot menu.";
    return;
  }
  if (!initData) {
    if (status) status.textContent = "Telegram user verification data is missing. Please reopen from the bot menu.";
    return;
  }
  if (status) status.textContent = "Checking admin access…";
  try {
    await adminRequest("check");
    if (status) status.textContent = "";
    isAdmin = true;
    $("admin-panel").hidden = false;
    await refreshAdminProducts();
  } catch (error) {
    console.info("Admin panel unavailable:", error.message);
    const status = $("admin-access-status");
    if (status) status.textContent = "Admin verification: " + error.message;
  }
}

if (telegram) { telegram.ready(); telegram.expand(); }
renderCategories(); renderProducts(); renderBasket();
loadProducts();
setupAdmin();

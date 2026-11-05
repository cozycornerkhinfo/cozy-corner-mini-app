const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
// Demo catalogue remains as a fallback until Supabase is configured.
const demoProducts = [
  {id:"coffee-1",name:"Iced Americano",category:"Coffee",price:2.00,image:"https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600"},
  {id:"coffee-2",name:"Iced Latte",category:"Coffee",price:2.50,image:"https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600"},
  {id:"drink-1",name:"Passion Soda",category:"Drinks",price:2.00,image:"https://images.unsplash.com/photo-1513558161293-7a1f4b1c?w=600"},
  {id:"snack-1",name:"French Fries",category:"Snacks",price:2.00,image:"https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600"},
  {id:"beer-1",name:"Draught Beer",category:"Beer",price:1.50,image:"https://images.unsplash.com/photo-1513558161293-7a1f4b1c?w=600"}
];
let categories = ["All","Coffee","Drinks","Snacks","Beer"];
const cart = new Map();
async function loadProducts(){
  if(!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const response=await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,category,description,price,image_url,available&available=eq.true&order=created_at.desc`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}});
    if(!response.ok) throw new Error(`Supabase returned ${response.status}`);
    const rows=await response.json();
    demoProducts.splice(0,demoProducts.length,...rows.map(p=>({...p,price:Number(p.price),image:p.image_url||""})));
    categories=["All",...new Set(demoProducts.map(p=>p.category).filter(Boolean))];
    cart.clear(); renderCategories(); renderProducts(); renderBasket();
    if(!demoProducts.length) $("products").innerHTML='<p class="muted">No products yet. Add products in your Supabase products table.</p>';
  } catch(error) { $("products").innerHTML='<p class="muted">Could not load products. Check Supabase settings and database policies.</p>'; console.error(error); }
}
let activeCategory = "All";
const $ = (id) => document.getElementById(id);
const money = n => "$" + n.toFixed(2);
function renderCategories(){
  $("categories").innerHTML = categories.map(c=>`<button class="category ${c===activeCategory?"active":""}" data-cat="${c}">${c}</button>`).join("");
  document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{activeCategory=b.dataset.cat;renderCategories();renderProducts()});
}
function renderProducts(){
  const list = demoProducts.filter(p=>activeCategory==="All"||p.category===activeCategory);
  $("products").innerHTML = list.map(p=>`<article class="product"><img src="${p.image}" alt=""><h3>${p.name}</h3><div class="price">${money(p.price)}</div><button class="add" data-add="${p.id}">Add to basket</button></article>`).join("");
  document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{cart.set(b.dataset.add,(cart.get(b.dataset.add)||0)+1);renderBasket()});
}
function renderBasket(){
  const items=[...cart.entries()].map(([id,qty])=>({...demoProducts.find(p=>p.id===id),qty}));
  const total=items.reduce((s,p)=>s+p.price*p.qty,0);
  $("total").textContent=money(total);
  $("basket-items").innerHTML=items.length?items.map(p=>`<div class="basket-row"><span>${p.name} × ${p.qty}</span><strong>${money(p.price*p.qty)}</strong></div>`).join(""):"<p class='muted'>Your basket is empty.</p>";
}
$("order-button").onclick=async()=>{
  const items=[...cart.entries()].map(([id,qty])=>({...demoProducts.find(p=>p.id===id),qty}));
  if(!items.length){$("status").textContent="Please add an item first.";return;}
  const name=$("customer-name").value.trim();
  if(!name){$("status").textContent="Please enter your name.";return;}
  const payload={customer_name:name,note:$("customer-note").value.trim(),currency:"USD",items:items.map(({id,name,price,qty})=>({id,name,price,qty})),total:items.reduce((s,p)=>s+p.price*p.qty,0),telegram_user:window.Telegram?.WebApp?.initDataUnsafe?.user||null};
  const endpoint=window.COZY_ORDER_ENDPOINT;
  if(!endpoint){$("status").textContent="Demo mode: backend is not connected yet. Setup is needed before live orders.";return;}
  $("order-button").disabled=true;$("status").textContent="Sending order…";
  try{
    const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!res.ok)throw new Error("Order request failed");
    $("status").textContent="Order sent to Cozy Corner. Thank you!";
    cart.clear();renderBasket();
  }catch(e){$("status").textContent="Could not send order. Please try again.";}
  finally{$("order-button").disabled=false;}
};
if(window.Telegram?.WebApp){window.Telegram.WebApp.ready();window.Telegram.WebApp.expand();}
renderCategories();renderProducts();renderBasket();loadProducts();

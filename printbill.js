const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const el = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n || 0);

window.onload = async () => {
  const params = new URLSearchParams(window.location.search);
  const bill_no = params.get("bill_no");

  if (!bill_no) {
    alert("ไม่พบเลขที่บิล");
    window.location.href = "index.html";
    return;
  }

  // ดึงข้อมูลบิลจาก Supabase
  const { data, error } = await client
    .from("bills")
    .select("*")
    .eq("bill_no", bill_no)
    .single();

  if (error || !data) {
    alert("ไม่พบบิลนี้");
    console.log(error);
    window.location.href = "index.html";
    return;
  }

  // แสดงข้อมูลบิล
  el("billNo").textContent = data.bill_no;
  el("billDate").textContent = new Date(data.created_at).toLocaleString("th-TH");
  el("billCustomer").textContent = data.customer || "-";
  el("billTotal").textContent = fmt(data.total);
  el("billCash").textContent = fmt(data.cash);
  el("billChange").textContent = fmt(data.change);

  // แสดงรายการอาหาร
  const itemsContainer = el("billItems");
  itemsContainer.innerHTML = "";
  (data.items || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>${item.menu_id}</div>
      <div>x${item.qty}</div>
      <div class="right">${fmt(item.price * item.qty)}</div>
    `;
    itemsContainer.appendChild(row);
  });

  // สั่งพิมพ์
  window.print();

  // กลับหน้าแรกหลังพิมพ์เสร็จ
  window.onafterprint = () => window.location.href = "index.html";
};

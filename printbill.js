const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const el = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB' }).format(n||0);

async function loadBill() {
  const params = new URLSearchParams(window.location.search);
  const bill_no = params.get("bill_no");

  if (!bill_no) {
    alert("ไม่พบหมายเลขบิล");
    window.location.href = "index.html";
    return;
  }

  // 1) ดึงข้อมูลบิล
  const { data: bill, error: billError } = await client
    .from("bills")
    .select("*")
    .eq("billno", bill_no)
    .single();

  if (billError || !bill) {
    console.error("Load bill error:", billError);
    alert("ไม่สามารถโหลดข้อมูลบิลได้");
    window.location.href = "index.html";
    return;
  }

  // 2) ดึงรายการอาหาร
  const { data: items, error: itemsError } = await client
    .from("bill_items")
    .select("qty, price, total, menu(name)")
    .eq("bill_id", bill.id);

  if (itemsError) {
    console.error("Load items error:", itemsError);
    alert("ไม่สามารถโหลดรายการอาหารได้");
    return;
  }

  // 3) แสดงผลในหน้า
  el("billNo").textContent = bill.billno;
  el("customer").textContent = bill.customer || "-";
  el("date").textContent = new Date(bill.created_at).toLocaleString("th-TH");
  el("total").textContent = fmt(bill.total);
  el("cash").textContent = fmt(bill.cash);
  el("change").textContent = fmt(bill.change);
  el("note").textContent = bill.note || "";

  const tbody = el("billItems");
  tbody.innerHTML = "";
  items.forEach(it => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.menu?.name || "-"}</td>
      <td class="right">${it.qty}</td>
      <td class="right">${fmt(it.price)}</td>
      <td class="right">${fmt(it.total)}</td>
    `;
    tbody.appendChild(tr);
  });

  // 4) พิมพ์อัตโนมัติ แล้วกลับหน้าแรก
  setTimeout(() => {
    window.print();
    window.onafterprint = () => window.location.href = "index.html";
  }, 500);
}

window.onload = loadBill;

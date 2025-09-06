const SUPABASE_URL = "https://pklvscffpbapogezoxyn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function buildPrintView(bill, items) {
  const dateText = new Date(bill.created_at).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short"
  });

  let html = `
  <html>
  <head>
    <title>บิลร้านเรือนชมพูเนื้อย่างเกาหลี</title>
    <style>
      body { font-family: "Noto Sans Thai", sans-serif; margin:20px; color:#111; }
      h1,h2,h3 { margin:0; padding:0; }
      .header { text-align:center; margin-bottom:12px; }
      .header h1 { font-size:24px; }
      .header p { font-size:14px; margin:2px 0; }
      table { width:100%; border-collapse: collapse; margin-top:10px; }
      table, th, td { border:1px solid #000; }
      th, td { padding:6px 8px; text-align:left; }
      th.right, td.right { text-align:right; }
      .summary { margin-top:12px; width:100%; display:grid; grid-template-columns:1fr auto; }
      .summary div { padding:4px 0; }
      .big { font-weight:800; font-size:20px; }
      .note { margin-top:8px; font-size:14px; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>ร้านเรือนชมพูเนื้อย่างเกาหลี</h1>
      <p>สาขานาเชือก</p>
      <p>โทร: 099-9999999</p>
      <p>บิลเลขที่: ${bill.billno}</p>
      <p>ลูกค้า: ${bill.customer || "-"}</p>
      <p>วันที่: ${dateText}</p>
    </div>
    <table>
      <thead>
        <tr>
          <th>สินค้า</th>
          <th class="right">ราคา/หน่วย</th>
          <th class="right">จำนวน</th>
          <th class="right">รวม</th>
        </tr>
      </thead>
      <tbody>
  `;

  items.forEach(it => {
    html += `
      <tr>
        <td>${it.menu?.name || "ไม่ทราบ"}</td>
        <td class="right">${Number(it.price).toFixed(2)}</td>
        <td class="right">${it.qty}</td>
        <td class="right">${(Number(it.price) * it.qty).toFixed(2)}</td>
      </tr>
    `;
  });

  html += `</tbody></table>
    <div class="summary">
      <div>ยอดรวม</div><div class="right big">${Number(bill.total).toFixed(2)}</div>
      <div>รับเงินมา</div><div class="right">${Number(bill.cash).toFixed(2)}</div>
      <div>เงินทอน</div><div class="right">${Number(bill.change).toFixed(2)}</div>
    </div>
    <div class="note">
      หมายเหตุ: ${bill.note || "-"}
    </div>
    <p style="text-align:center; margin-top:20px; font-size:12px;">
      ขอบคุณที่อุดหนุนร้านเรือนชมพูเนื้อย่างเกาหลี
    </p>
  </body>
  </html>
  `;

  return html;
}

window.onload = async () => {
  const params = new URLSearchParams(window.location.search);
  const billno = params.get("bill_no");

  if (!billno) {
    alert("ไม่พบหมายเลขบิล");
    window.location.href = "index.html";
    return;
  }

  // ดึงบิล
  const { data: bill, error: billErr } = await client
    .from("bills")
    .select("*")
    .eq("billno", billno)
    .single();

  if (billErr || !bill) {
    alert("ไม่พบบิล");
    console.error(billErr);
    window.location.href = "index.html";
    return;
  }

  // ดึงรายการบิล พร้อมชื่อเมนู
  const { data: items, error: itemErr } = await client
    .from("bill_items")
    .select("*, menu(name)")
    .eq("bill_id", bill.id);

  if (itemErr) {
    alert("โหลดข้อมูลบิลผิดพลาด");
    console.error(itemErr);
    window.location.href = "index.html";
    return;
  }

  const printHtml = buildPrintView(bill, items);

  // เปิดหน้าปริ้น
  const printWindow = window.open("", "_blank");
  printWindow.document.write(printHtml);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.onafterprint = () => {
    printWindow.close();
    window.location.href = "index.html";
  };
};

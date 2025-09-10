import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
const client = createClient(SUPABASE_URL, SUPABASE_KEY);

const el=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(n||0);
function safeEval(expr){if(!expr)return 0;expr=expr.replace(/\s+/g,'');if(!/^[0-9+\-*/.]+$/.test(expr))return 0;try{return Function('"use strict";return('+expr+')')();}catch{return 0;}}

function todayText(){const d=new Date();return d.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});}

let menuData = [];
const params = new URLSearchParams(window.location.search);
const table_id = params.get('table_id');


async function getNextBillNo() {
  const { data, error } = await client
    .from('bills')
    .select('billno')
    .order('billno', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("ดึงเลขบิลล่าสุดผิดพลาด", error);
    return "00001"; // fallback
  }

  let lastNo = 0;
  if (data && data.billno) {
    lastNo = parseInt(data.billno, 10) || 0;
  }

  return String(lastNo + 1).padStart(5, '0');
}

async function loadTableName() {
  if (!table_id) return;
  const { data, error } = await client.from('tables').select('*').eq('id', table_id).single();
  if (error) { console.log(error); return; }
  if (data) {
    el('customer').value = data.name;
    const { error:updateError } = await client.from('tables').update({ status: 'ไม่ว่าง' }).eq('id', table_id);
    if(updateError) console.log('อัปเดตโต๊ะไม่ว่างผิดพลาด', updateError);
  }
}

// loadMenu.js
async function loadMenu(){
  const { data, error } = await client
    .from('menu')
    .select('*')
    .order('sort_order', { ascending: true });

  if(error){
    alert('โหลดเมนูผิดพลาด');
    console.log(error);
    return;
  }

  menuData = data;
  const container = el('menuItems'); 
  container.innerHTML='';

  data.forEach(item=>{
    const row=document.createElement('div');
    row.className='row draggable';   // ✅ เอา grid ออก เหลือ row
    row.dataset.id = item.id;
    row.innerHTML = `
      <div class="row-content">
        <div class="drag-handle">☰</div>
        <div class="menu-name">${item.name}</div>
        <div class="menu-price right">฿${item.price}</div>
        <div>
          <input class="num menu-qty" 
            type="text" 
            data-id="${item.id}" 
            placeholder="เช่น 1+2"
            inputmode="decimal" 
            pattern="[0-9.+]*">
        </div>
      </div>
      <div class="action-btns">
        <div class="edit-btn">แก้ไข</div>
        <div class="delete-btn">ลบ</div>
      </div>
    `;
    container.appendChild(row);

    // ✅ swipe + edit/delete
    enableSwipe(row, item);
  });

  // ✅ input คำนวณอัตโนมัติ
  document.querySelectorAll('#menuItems input')
          .forEach(i=>i.addEventListener('input',calc));

  return true;
}

function initDragAndDrop() {
  const container = el('menuItems');
  let dragging = null;
  let placeholder = null;

  // -------------------
  // 🖥️ Desktop Drag & Drop (ลากเฉพาะ .drag-handle)
  // -------------------
  container.querySelectorAll('.draggable').forEach(item => {
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;

    handle.setAttribute("draggable", true); // ✅ ให้ handle เป็นตัวลาก

    handle.addEventListener('dragstart', e => {
      dragging = item;
      item.classList.add('dragging');
      item.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = "move";
    });

    handle.addEventListener('dragend', e => {
      finishDrag();
    });
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement == null) {
      container.appendChild(dragging);
    } else {
      container.insertBefore(dragging, afterElement);
    }

    // highlight เส้น
    container.querySelectorAll('.draggable').forEach(el => {
      el.classList.remove('drag-over', 'drag-over-valid');
    });
    if (afterElement) {
      afterElement.classList.add('drag-over-valid');
    }
  });

  container.addEventListener('dragleave', e => {
    e.target.classList.remove('drag-over', 'drag-over-valid');
  });

  // -------------------
  // 📱 Mobile Touch Drag (ลากเฉพาะ .drag-handle)
  // -------------------
  container.querySelectorAll('.draggable').forEach(item => {
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;

    handle.addEventListener('touchstart', e => {
      dragging = item;

      // placeholder
      placeholder = document.createElement("div");
      placeholder.className = "row grid placeholder";
      placeholder.style.height = dragging.offsetHeight + "px";
      dragging.parentNode.insertBefore(placeholder, dragging.nextSibling);

      // สไตล์ให้ item ลอย
      dragging.style.position = "absolute";
      dragging.style.zIndex = "1000";
      dragging.style.width = placeholder.offsetWidth + "px";
      moveAt(e.touches[0].pageX, e.touches[0].pageY);

      e.preventDefault();
    });

    handle.addEventListener('touchmove', e => {
      if (!dragging) return;
      moveAt(e.touches[0].pageX, e.touches[0].pageY);

      const afterElement = getDragAfterElement(container, e.touches[0].clientY);
      if (afterElement == null) {
        container.appendChild(placeholder);
      } else {
        container.insertBefore(placeholder, afterElement);
      }
    });

    handle.addEventListener('touchend', e => {
      if (!dragging) return;

      // วาง item กลับเข้าที่
      dragging.style.position = "static";
      dragging.style.zIndex = "";
      placeholder.parentNode.insertBefore(dragging, placeholder);
      placeholder.remove();

      finishDrag();
    });
  });

  // -------------------
  // ฟังก์ชันย่อย
  // -------------------
  function moveAt(x, y) {
    dragging.style.left = x - dragging.offsetWidth / 2 + "px";
    dragging.style.top = y - dragging.offsetHeight / 2 + "px";
  }

  function finishDrag() {
    if (dragging) {
      dragging.classList.remove('dragging');
      dragging.style.opacity = '1';
      dragging.style.position = "static";
      dragging.style.zIndex = "";
      dragging = null;
      if (placeholder) placeholder.remove();

      // 👉 บันทึก sort_order
      saveNewOrder();
    }
  }
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.draggable:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveNewOrder() {
  const rows = document.querySelectorAll('#menuItems .draggable');

  for (let i = 0; i < rows.length; i++) {
    const id = parseInt(rows[i].dataset.id);
    const sort_order = i + 1;
    const { error } = await client.from('menu')
      .update({ sort_order })
      .eq('id', id);

    if (error) {
      console.error('❌ update sort_order ผิดพลาด', error);
    }
  }
  console.log('✅ บันทึก sort_order เรียบร้อยแล้ว');
}

// โหลด draft ล่าสุดของโต๊ะ
async function loadDraft() {
  if (!table_id) return; 

  // 1️⃣ ดึง draft ล่าสุดของโต๊ะ
  const { data: draftData, error: draftError } = await client.from('drafts')
    .select('*').eq('table_id', table_id).single();

  if(draftError){ console.log('โหลด draft ผิดพลาด', draftError); return; }
  if(!draftData) return;

  el('billno').value = draftData.billno || await getNextBillNo();
  el('customer').value = draftData.customer || '';
  el('cash').value = draftData.cash || '';

  // 2️⃣ ดึงรายการสินค้า
  const { data: items, error: itemsError } = await client.from('draft_items')
    .select('*').eq('draft_id', draftData.id);

  if(itemsError){ console.log('โหลด draft_items ผิดพลาด', itemsError); return; }

  items.forEach(item=>{
    const input = document.querySelector(`#menuItems input[data-id="${item.menu_id}"]`);
    if(input) input.value = item.qty;
  });

  calc();
}

function calc(){
  let total=0;
  document.querySelectorAll('#menuItems input').forEach(inp=>{
    const qty=safeEval(inp.value);
    const id=parseInt(inp.dataset.id);
    const menuItem=menuData.find(m=>m.id===id);
    if(menuItem && qty>0) total+=qty*menuItem.price;
  });
  const cash=safeEval(el('cash').value);
  const change=cash-total;
  el('grand').textContent=fmt(total);
  if(cash>0 && change<0){el('cash').style.borderColor='var(--danger)';el('cashWarn').style.display='block';el('change').value='';}
  else{el('cash').style.borderColor='var(--line)';el('cashWarn').style.display='none';el('change').value = fmt(change>0?change:0);}
}

function buildPreviewView() {
  let html = `
    <table style="width:100%; border-collapse: collapse; margin-top:10px;">
      <thead>
        <tr>
          <th style="border:1px solid #000; padding:6px;">สินค้า</th>
          <th style="border:1px solid #000; padding:6px; text-align:right;">ราคา/หน่วย</th>
          <th style="border:1px solid #000; padding:6px; text-align:right;">จำนวน</th>
          <th style="border:1px solid #000; padding:6px; text-align:right;">รวม</th>
        </tr>
      </thead>
      <tbody>
  `;

  document.querySelectorAll('#menuItems input').forEach(inp => {
    const qty = safeEval(inp.value);
    if (qty <= 0) return;
    const menu_id = parseInt(inp.dataset.id);
    const menuItem = menuData.find(m => m.id === menu_id);
    if (menuItem) {
      html += `
        <tr>
          <td style="border:1px solid #000; padding:6px;">${menuItem.name}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;">${menuItem.price.toFixed(2)}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;">${qty}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;">${(qty * menuItem.price).toFixed(2)}</td>
        </tr>`;
    }
  });

  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g,''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value.replace(/[^\d.]/g,''));

  html += `
      </tbody>
    </table>
    <div style="margin-top:12px; text-align:right;">
      <div><strong>ยอดรวม:</strong> ${total.toFixed(2)}</div>
      <div><strong>รับเงินมา:</strong> ${cash.toFixed(2)}</div>
      <div><strong>เงินทอน:</strong> ${change.toFixed(2)}</div>
    </div>
  `;

  return html;
}

function buildPrintView(bill) {
  const createdText = bill.created_at 
    ? new Date(bill.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) 
    : '-';
  const closedText = bill.closed_at 
    ? new Date(bill.closed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) 
    : '-';

  let html = `
  <html>
  <head>
    <title>บิลร้านเรือนชมพูเนื้อย่างเกาหลี</title>
    <style>
      @page { size: 57mm auto; margin: 4mm; }
      body { font-family: "Tahoma", "Noto Sans Thai", sans-serif; font-size: 12px; color:#111; }
      h1,h2,h3,p { margin:0; padding:0; }
      .header { text-align:center; margin-bottom:8px; }
      .header h1 { font-size:18px; font-weight:700; }
      .header p { font-size:11px; margin:2px 0; }
      table { width:100%; border-collapse: collapse; margin-top:4px; }
      th { font-size:11px; font-weight:700; text-align:left; border-bottom:1px dashed #000; padding-bottom:2px; }
      td { padding:2px 0; font-size:12px; }
      td.right, th.right { text-align:right; }
      .summary { margin-top:6px; width:100%; }
      .summary div { display:flex; justify-content:space-between; padding:2px 0; font-size:12px; }
      .line-double {border-top:1px dashed #000;margin:4px 0 2px 0;position: relative;}
      .line-double::after {content: "";display: block;border-top:1px dashed #000;margin-top:2px;}
      .big { font-weight:700; font-size:15px; }
      .footer { text-align:center; margin-top:8px; font-size:11px; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>ร้านเรือนชมพูเนื้อย่างเกาหลี</h1>
      <p>สาขานาเชือก</p>
      <p>โทร: 0885305228, 0621392902</p>
      <p>บิลเลขที่: ${bill.billno}</p>
      <p>โต๊ะ/ลูกค้า: ${bill.customer || '-'}</p>
      <p>เวลาเช็คบิล: ${closedText}</p>
    </div>
    <table>
      <thead>
        <tr>
          <th>รายการ</th>
          <th class="right">ราคา</th>
          <th class="right">จำนวน</th>
          <th class="right">รวม</th>
        </tr>
      </thead>
      <tbody>
  `;

  // ✅ วนรายการเมนู
  document.querySelectorAll('#menuItems input').forEach(inp => {
    const qty = safeEval(inp.value);
    if (qty <= 0) return;
    const menu_id = parseInt(inp.dataset.id);
    const menuItem = menuData.find(m => m.id === menu_id);
    if (menuItem) {
      html += `<tr>
        <td>${menuItem.name}</td>
        <td class="right">${menuItem.price.toFixed(2)}</td>
        <td class="right">${qty}</td>
        <td class="right">${(qty * menuItem.price).toFixed(2)}</td>
      </tr>`;
    }
  });

  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g,''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value.replace(/[^\d.]/g,''));

  html += `</tbody></table>
    <div class="summary">
      <div class="line-double"></div>
      <div><span>ยอดรวม</span><span class="big">${total.toFixed(2)}</span></div>
      <div><span>รับเงินมา</span><span>${cash.toFixed(2)}</span></div>
      <div><span>เงินทอน</span><span>${change.toFixed(2)}</span></div>
    </div>
    <div class="footer">
      *** ขอบคุณที่อุดหนุน ***
    </div>
  </body>
  </html>
  `;
  return html;
}

async function saveDraft() {
  let billno = el('billno').value;
  if (!billno) {
    billno = await getNextBillNo();
    el('billno').value = billno;
  }
  const customer = el('customer').value;
  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g,''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value);

  try {
    // 1️⃣ ตรวจสอบว่ามี draft เดิมหรือยัง
    let { data: existingDraft } = await client.from('drafts')
      .select('*')
      .eq('billno', billno)
      .single();

    let draftId;
    if (existingDraft) {
      // update draft
      const { data: updatedDraft, error: updateError } = await client.from('drafts')
        .update({ customer, table_id, total, cash, change, updated_at: new Date().toISOString() })
        .eq('id', existingDraft.id)
        .select()
        .single();
      if(updateError) throw updateError;
      draftId = updatedDraft.id;
    } else {
      // insert draft ใหม่
      const { data: newDraft, error: insertError } = await client.from('drafts')
        .insert([{ billno, customer, table_id, total, cash, change }])
        .select()
        .single();
      if(insertError) throw insertError;
      draftId = newDraft.id;
    }

    // 2️⃣ ลบรายการเก่าใน draft_items
    await client.from('draft_items').delete().eq('draft_id', draftId);

    // 3️⃣ เตรียมรายการใหม่
    const items = [];
    document.querySelectorAll('#menuItems input').forEach(inp => {
      const qty = safeEval(inp.value);
      if (qty > 0) items.push({
        draft_id: draftId,
        menu_id: parseInt(inp.dataset.id),
        qty
      });
    });

    // 4️⃣ insert รายการใหม่
    if (items.length > 0) {
      const { error: itemError } = await client.from('draft_items').insert(items);
      if(itemError) throw itemError;
    }

    // 5️⃣ อัปเดตโต๊ะ
    if (table_id) {
      await client.from('tables').update({ status: 'ไม่ว่าง' }).eq('id', table_id);
    }

    alert('บันทึกฉบับร่างเรียบร้อย');

  } catch(err) {
    console.log('saveDraft error:', err);
    alert('บันทึกฉบับร่างผิดพลาด');
  }
}

async function saveBill(){
  const billno = el('billno').value || await getNextBillNo();
  const customer = el('customer').value;
  const total    = safeEval(el('grand').textContent.replace(/[^\d.]/g,'')); 
  const cash     = safeEval(el('cash').value);
  const change   = safeEval(el('change').value.replace(/[^\d.]/g,''));

  // 🔹 ดึง draft ก่อน (เพื่อตามหา created_at ของ draft)
  let draftData = null;
  if (billno) {
    const { data, error } = await client.from('drafts')
      .select('*')
      .eq('billno', billno)
      .single();
    if (!error && data) draftData = data;
  }

  // 1️⃣ บันทึกบิลหลัก
  const { data: bill, error: billError } = await client.from('bills').insert([{
    billno, customer, table_id, total, cash, change,
    status:'closed',
    created_at: draftData ? draftData.created_at : new Date(),  // ✅ ใช้เวลาจาก draft ถ้ามี
    closed_at: new Date()                                       // เวลาเช็คบิล
  }]).select().single();

  if(billError){ 
    alert('บันทึกบิลผิดพลาด'); 
    console.log(billError); 
    return; 
  }

  // 2️⃣ บันทึกรายการ bill_items
  const items = [];
  document.querySelectorAll('#menuItems input').forEach(inp=>{
    const qty = safeEval(inp.value);
    if(qty<=0) return;
    const menu_id = parseInt(inp.dataset.id);
    const menuItem = menuData.find(m=>m.id===menu_id);
    if(menuItem) items.push({ bill_id: bill.id, menu_id, qty, price: menuItem.price });
  });

  if(items.length>0){
    const { error: itemError } = await client.from('bill_items').insert(items);
    if(itemError) console.log('บันทึกรายการ bill_items ผิดพลาด', itemError);
  }

  // 3️⃣ อัปเดตโต๊ะเป็นว่าง
  if(table_id){
    const { error:updateError } = await client.from('tables')
      .update({ status:'ว่าง' })
      .eq('id', table_id);
    if(updateError) console.log('อัปเดตโต๊ะว่างผิดพลาด', updateError);
  }

  // 4️⃣ ลบ draft + draft_items
  if(draftData){
    await client.from('draft_items').delete().eq('draft_id', draftData.id);
    await client.from('drafts').delete().eq('id', draftData.id);
  }

  // 5️⃣ พิมพ์บิล
  const w = window.open('', 'PRINT', 'height=600,width=800');
  w.document.write('<html><head><title>พิมพ์บิล</title></head><body>');
  w.document.write(buildPrintView(bill));
  w.document.write('</body></html>');
  w.document.close();
  w.focus();
  w.print();
  w.close();

  // 6️⃣ ล้างหน้าบิล
  el('billno').value = await getNextBillNo();
  document.querySelectorAll('#menuItems input').forEach(i=>i.value=''); 
  el('cash').value=''; 
  calc();
}

function enableSwipe(row, menu) {
  let startX = 0;
  let currentX = 0;
  let isDragging = false;
  let threshold = 60; // ระยะที่ต้องลากถึงจะโชว์ปุ่ม
  const content = row.querySelector(".row-content");

  // 🖱️ Mouse
  row.addEventListener("mousedown", e => {
    startX = e.clientX;
    isDragging = true;
    content.style.transition = "none"; // ปิด transition ตอนลาก
  });

  document.addEventListener("mousemove", e => {
    if (!isDragging) return;
    currentX = e.clientX;
    let diff = currentX - startX;

    if (diff < 0) {
      // ลากไปทางซ้าย
      content.style.transform = `translateX(${diff}px)`;
    }
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    content.style.transition = "transform .25s ease";

    // เช็กว่าลากพอหรือยัง
    if (currentX - startX < -threshold) {
      row.classList.add("show-actions");
      content.style.transform = "translateX(-160px)";
    } else {
      row.classList.remove("show-actions");
      content.style.transform = "translateX(0)";
    }
  });

  // 📱 Touch (เหมือนเดิม)
  row.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    content.style.transition = "none";
  });

  row.addEventListener("touchmove", e => {
    currentX = e.touches[0].clientX;
    let diff = currentX - startX;
    if (diff < 0) content.style.transform = `translateX(${diff}px)`;
  });

  row.addEventListener("touchend", () => {
    content.style.transition = "transform .25s ease";
    if (currentX - startX < -threshold) {
      row.classList.add("show-actions");
      content.style.transform = "translateX(-160px)";
    } else {
      row.classList.remove("show-actions");
      content.style.transform = "translateX(0)";
    }
  });
}

window.addEventListener('DOMContentLoaded', async ()=>{
  el('today').textContent = todayText();
  el('billno').value = await getNextBillNo();
  await loadTableName();
  await loadMenu();
  await loadDraft();

  el('btnHome').addEventListener('click', async () => {
    if (table_id) {
      // ตรวจสอบว่ามีการคีย์ข้อมูลในเมนูหรือไม่
      const hasOrder = Array.from(document.querySelectorAll('#menuItems input'))
        .some(inp => safeEval(inp.value) > 0);
  
      if (!hasOrder) {
        // 👉 ไม่มีการคีย์ข้อมูล → เปลี่ยนสถานะโต๊ะเป็น 'ว่าง' โดยไม่แจ้งเตือน
        const { error: updateError } = await client.from('tables')
          .update({ status: 'ว่าง' })
          .eq('id', table_id);
  
        if (updateError) {
          console.log('อัปเดตโต๊ะว่างผิดพลาด', updateError);
          return; // ❌ error แล้วหยุด
        }
  
        window.location.href = 'index.html';
        return;
      }
  
      // 👉 มีการคีย์ข้อมูล → ตรวจสอบ draft
      const { data: draftData } = await client.from('drafts')
        .select('id')
        .eq('table_id', table_id)
        .maybeSingle();
  
      const hasUnsavedData = hasOrder || el('customer').value.trim() !== '';
  
      if (!draftData && hasUnsavedData) {
        // ❌ ยังไม่มี draft → ต้อง confirm
        const confirmReset = confirm("คุณยังไม่ได้บันทึกข้อมูล\nต้องการเปลี่ยนสถานะโต๊ะเป็น 'ว่าง' ใช่หรือไม่?");
        
        if (!confirmReset) {
          // ❌ กด Cancel → อยู่หน้านี้
          return;
        }
      
        // ✅ กด OK → อัปเดตแล้ว redirect
        const { error: updateError } = await client.from('tables')
          .update({ status: 'ว่าง' })
          .eq('id', table_id);
      
        if (updateError) {
          console.log('อัปเดตโต๊ะว่างผิดพลาด', updateError);
          alert('บันทึกสถานะโต๊ะผิดพลาด กรุณาลองใหม่อีกครั้ง');
          return;
        }
  
        window.location.href = 'index.html';
        return;
      }
  
      // 👉 มี draft อยู่แล้ว → กลับ index ทันที
      if (draftData) {
        window.location.href = 'index.html';
        return;
      }
  
      return;
    }
  
    // 👉 ไม่มี table_id → กลับ index ได้เลย
    window.location.href = 'index.html';
  });

  el('btnAddMenu').addEventListener('click',()=>{el('popup').style.display='flex';});
  el('btnAddMenuCancel').addEventListener('click',()=>{el('popup').style.display='none'; el('newMenuName').value=''; el('newMenuPrice').value='';});
  el('btnAddMenuConfirm').addEventListener('click', async () => {
    const name = el('newMenuName').value.trim();
    const price = parseFloat(el('newMenuPrice').value);
    if (!name || !price) { 
      alert('กรุณากรอกชื่อและราคา'); 
      return;
    }
  
    try {
      // 👉 หาค่า sort_order ล่าสุด
      const { data: maxData, error: maxError } = await client
        .from('menu')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();  // ✅ ป้องกัน error ถ้าไม่มีข้อมูล
  
      let nextSortOrder = 1;
      if (maxData && maxData.sort_order !== null) {
        nextSortOrder = maxData.sort_order + 1;
      }
  
      // 👉 insert เมนูใหม่พร้อม sort_order ล่างสุด
      const { error } = await client.from('menu').insert([
        { name, price, sort_order: nextSortOrder }
      ]);
  
      if (error) {
        alert('บันทึกผิดพลาด');
        console.error(error);
      } else {
        el('popup').style.display = 'none';
        el('newMenuName').value = '';
        el('newMenuPrice').value = '';
        await loadMenu(); // โหลดใหม่ → เมนูใหม่จะอยู่ล่างสุด
      }
    } catch (err) {
      console.error('เพิ่มเมนูใหม่ผิดพลาด', err);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    }
  });


  el('btnPrint').addEventListener('click', () => {
    // แสดง preview modal
    el('previewContent').innerHTML = buildPreviewView();
    el('previewModal').style.display = 'flex';
  });
  
  // ปิด modal
  el('btnCancelPreview').addEventListener('click', () => {
    el('previewModal').style.display = 'none';
  });
  
  // ยืนยันพิมพ์จริง
  el('btnConfirmPrint').addEventListener('click', () => {
    el('previewModal').style.display = 'none';
    saveBill(); // เรียกฟังก์ชันเดิมที่บันทึกและสั่งพิมพ์
  });
  el('btnSave').addEventListener('click',saveDraft);

  el('btnClear').addEventListener('click', async () => {
  if (confirm('ยืนยันการยกเลิกบิลนี้หรือไม่?')) {
    // อัปเดตสถานะโต๊ะเป็น 'ว่าง'
    if (table_id) {
      const { error: updateError } = await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
      if (updateError) {
        console.log('อัปเดตสถานะโต๊ะผิดพลาด', updateError);
      }
    }

    // ลบ draft ทั้งหมดที่เกี่ยวข้องกับโต๊ะนี้
    if (table_id) {
        const { data: draftData, error: draftError } = await client.from('drafts')
            .select('id').eq('table_id', table_id).single();
        if (draftData) {
            await client.from('draft_items').delete().eq('draft_id', draftData.id);
            await client.from('drafts').delete().eq('id', draftData.id);
        }
    }

    // ล้างข้อมูลในฟอร์ม
    document.querySelectorAll('#menuItems input').forEach(i => i.value = '');
    el('customer').value = '';
    el('cash').value = '';
    calc();
    alert('ยกเลิกบิลเรียบร้อยแล้ว');
  }
});

  el('cash').addEventListener('input',calc);
});

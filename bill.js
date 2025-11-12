// bill.js (replace your existing file)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
const client = createClient(SUPABASE_URL, SUPABASE_KEY);

let activeMenuItem = null;
const contextMenu = document.getElementById('contextMenu');

const el = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n || 0);
function safeEval(expr) {
  if (!expr) return 0;
  expr = String(expr).replace(/\s+/g, '');
  if (!/^[0-9+\-*/.]+$/.test(expr)) return 0;
  try { return Function('"use strict";return(' + expr + ')')(); } catch { return 0; }
}
function todayText() {
  const d = new Date();
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

let menuData = [];
const params = new URLSearchParams(window.location.search);
const table_id = params.get('table_id');

let sortableInstance = null;      // store Sortable instance
let currentlyOpenRow = null;      // track open swipe row (so we can close others)

/* --- DB helpers --- (unchanged from yours) */
async function getNextBillNo() {
  const { data, error } = await client.rpc('get_next_billno');
  if (error) throw error;
  return data; // เช่น "250900001"
}

async function loadTableName() {
  if (!table_id) return;
  const { data, error } = await client.from('tables').select('*').eq('id', table_id).maybeSingle();
  if (error) { console.log(error); return; }
  if (data) {
    el('customer').value = data.name;
    const { error: updateError } = await client.from('tables').update({ status: 'ไม่ว่าง' }).eq('id', table_id);
    if (updateError) console.log('อัปเดตโต๊ะไม่ว่างผิดพลาด', updateError);
  }
}
function renderMenu(dataToRender, existingValues = {}) {
    window.menuData = dataToRender || []; // อัปเดต menuData ที่เป็น global
    const container = el('menuItems');
    container.innerHTML = '';

    dataToRender.forEach(item => {
        const row = document.createElement('div');
        row.className = 'row draggable';
        row.dataset.id = item.id;
        row.innerHTML = `
            <div class="row-content" tabindex="0">
                <div class="drag-handle">☰</div>
                <div class="menu-name">${escapeHtml(item.name)}</div>
                <div class="menu-price right">฿${Number(item.price).toFixed(2)}</div>
                <div>
                    <input class="num menu-qty" 
                        type="text" 
                        data-id="${item.id}" 
                        value="${existingValues[item.id] || ''}"
                        placeholder="เช่น 1+2"
                        readonly>
                </div>
            </div>
            <div class="action-btns" aria-hidden="true">
                <div class="edit-btn" role="button" tabindex="0">แก้ไข</div>
                <div class="delete-btn" role="button" tabindex="0">ลบ</div>
            </div>
        `;
        container.appendChild(row);

        enableSwipe(row, item); // ตรวจสอบว่ามีฟังก์ชันนี้อยู่

        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (currentlyOpenRow) closeRow(currentlyOpenRow);
            activeMenuItem = item;
            const x = e.pageX;
            const y = e.pageY;
            contextMenu.style.left = `${x}px`;
            contextMenu.style.top = `${y}px`;
            contextMenu.style.display = 'block';
        });

        const input = row.querySelector('.menu-qty');
        input.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (activeInput && activeInput !== input) {
                activeInput.classList.remove('highlight');
            }
            activeInput = input;
            input.classList.add('highlight');
            openCustomKeypad(input); // ตรวจสอบว่ามีฟังก์ชันนี้
        });
    });

    // init or re-init Sortable
    if (window.sortableInstance) { try { sortableInstance.destroy(); } catch(e){} window.sortableInstance = null; }
    if (window.Sortable) {
        window.sortableInstance = new Sortable(container, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'dragging-ghost',
            onEnd: saveNewOrder // ตรวจสอบว่ามีฟังก์ชันนี้
        });
    }

    // closeOpenRow(); // อาจต้องตรวจสอบว่ามีฟังก์ชันนี้
    return true;
}
/* ---------------------------
   Load menu: build DOM rows
   --------------------------- */
async function loadMenu() {
    const existingValues = {};
    document.querySelectorAll('#menuItems input.menu-qty').forEach(inp => {
        existingValues[inp.dataset.id] = inp.value;
    });

    // --- 1. โหลดจาก Cache ทันที ---
    const menuCacheKey = 'ruenchompoo-menuCache'; // ตั้งชื่อ Cache
    const menuCache = localStorage.getItem(menuCacheKey);
    let isCacheRendered = false;

    if (menuCache) {
        try {
            console.log('Loading menu from cache...');
            renderMenu(JSON.parse(menuCache), existingValues);
            isCacheRendered = true;
        } catch (e) {
            console.error('Failed to parse menu cache', e);
            localStorage.removeItem(menuCacheKey); // ลบ Cache ที่เสีย
        }
    }

    // --- 2. ดึงข้อมูลใหม่จาก Database (เสมอ) ---
    console.log('Fetching fresh menu from database...');
    const { data, error } = await client.from('menu')
                                      .select('*')
                                      .order('sort_order', { ascending: true });

    if (error) {
        // ถ้าดึงข้อมูลใหม่ไม่สำเร็จ แต่อย่างน้อยก็แสดงผลจาก Cache ไปแล้ว (ถ้ามี)
        if (!isCacheRendered) { 
            alert('โหลดเมนูผิดพลาด (และไม่มี Cache)');
        }
        console.log(error);
        return; 
    }

    // --- 3. ได้ข้อมูลใหม่มาแล้ว ---
    if (data) {
        const newDataString = JSON.stringify(data);
        
        // บันทึก Cache ใหม่
        localStorage.setItem(menuCacheKey, newDataString);

        // ถ้าข้อมูลใหม่ไม่ตรงกับ Cache ที่แสดงไป (หรือยังไม่ได้แสดง)
        // ให้วาดใหม่
        if (newDataString !== menuCache) {
            console.log('New menu data found, re-rendering...');
            renderMenu(data, existingValues);
        } else {
            console.log('Menu is already up-to-date.');
        }
    }
}
/* ==========================
   ปุ่ม ลบ แก้ไข สำหรับ PC
   ========================== */
contextMenu.addEventListener('click', async (e) => {
    // ซ่อนเมนูทันทีเมื่อคลิก
    contextMenu.style.display = 'none';
    
    const action = e.target.dataset.action;
    
    if (activeMenuItem && action) {
        if (action === 'edit') {
            // เรียกใช้ฟังก์ชันแสดง popup สำหรับแก้ไข
            showEditPopup(activeMenuItem);
        } else if (action === 'delete') {
            // ลบรายการที่ถูกเลือก
            if (confirm("ลบเมนูนี้ใช่ไหม?")) {
                const { error } = await client.from('menu').delete().eq('id', activeMenuItem.id);
                if (error) {
                    alert('ลบเมนูผิดพลาด');
                    console.error(error);
                }
                // โหลดเมนูใหม่หลังจากลบ
                await loadMenu();
            }
        }
    }
    // รีเซ็ตรายการที่ถูกเลือก
    activeMenuItem = null;
});

// เพิ่ม Event Listener เพื่อซ่อนเมนูเมื่อคลิกที่อื่น
window.addEventListener('click', (e) => {
    // ถ้าการคลิกไม่ได้เกิดขึ้นบนเมนูคลิกขวา ให้ซ่อนเมนู
    if (!contextMenu.contains(e.target)) {
        contextMenu.style.display = 'none';
        activeMenuItem = null;
    }
});

/* ==========================
   Custom Keypad
   ========================== */
let activeInput = null;

function openCustomKeypad(input) {
  activeInput = input;
  let keypad = document.getElementById('customKeypad');
  if (!keypad) {
    keypad = document.createElement('div');
    keypad.id = 'customKeypad';
    document.body.appendChild(keypad);
  }
  keypad.innerHTML = '';

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-keypad-btn"; // ใช้ชื่อ class ที่แก้ไขแล้ว
  closeBtn.innerHTML = "&#x2328;"; // ใช้สัญลักษณ์คีย์บอร์ด
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // หยุดการทำงานของ event click
    closeCustomKeypad(); // เรียกฟังก์ชันปิด keypad ที่เราสร้างไว้
  });
  keypad.appendChild(closeBtn);
  
  const keys = ['1', '2', '3', '+', '4', '5', '6', '.', '7', '8', '9', '⌫', 'empty', '0', 'empty', 'C'];
  keys.forEach(k => {
      let element;
      if (k === 'empty') {
          // ถ้าเป็นค่า 'empty' ให้สร้าง div แทน button
          element = document.createElement('div');
          element.className = 'empty-cell'; // เพิ่ม class สำหรับจัดสไตล์
      } else {
          // ถ้าไม่ใช่ค่า 'empty' ให้สร้าง button ตามปกติ
          element = document.createElement('button');
          element.innerHTML = k;
          
          // เพิ่ม event listener ให้กับปุ่มที่ใช้งานได้เท่านั้น
          element.addEventListener('click', () => handleKey(input, k));
      }
      keypad.appendChild(element);
  });

  // แสดง keypad ด้วย animation
  keypad.classList.add('show');
}

// ปิด keypad
function closeCustomKeypad() {
  const keypad = document.getElementById('customKeypad');
  if (keypad) keypad.classList.remove('show');
  if (activeInput) activeInput.classList.remove('highlight'); // เอา highlight ออก
  activeInput = null;
}

// กดปุ่ม keypad
function handleKey(input, key) {
  if (!input) return;

  if (key === '⌫') {
    input.value = input.value.slice(0, -1);
  } else if (key === 'C') {
    input.value = '';
  } else {
    input.value += key;
  }

  // sanitize
  input.value = input.value.replace(/[^0-9.+]/g,'');
  calc();
}

// ซ่อน keypad ถ้า click นอก
document.addEventListener('click', e => {
  if (!e.target.classList.contains('menu-qty') &&
      (!e.target.closest('#customKeypad'))) {
    closeCustomKeypad();
  }
});

/* ---------------------------
   Save new sort_order -> DB
   --------------------------- */
async function saveNewOrder() {
  const rows = document.querySelectorAll('#menuItems .row');
  for (let i = 0; i < rows.length; i++) {
    const id = parseInt(rows[i].dataset.id);
    const sort_order = i + 1;
    const { error } = await client.from('menu').update({ sort_order }).eq('id', id);
    if (error) console.error('update sort_order ผิดพลาด', error);
  }
  console.log('✅ บันทึก sort_order เรียบร้อยแล้ว');
}

/* ---------------------------
   Drafts / calc / print etc.
   (unchanged except minor sanitization)
   --------------------------- */
let currentDraftId = null;

async function loadDraft() {
  if (!table_id) return;

  // โหลด draft จาก table_id
  const { data: draftData, error: draftError } = await client
    .from('drafts')
    .select('*')
    .eq('table_id', table_id)
    .maybeSingle();

  if (draftError) {
    console.log('โหลด draft ผิดพลาด', draftError);
    return;
  }
  if (!draftData) {
    currentDraftId = null; // ไม่มี draft
    return;
  }

  // เก็บ id ของ draft ไว้ลบตอน save
  currentDraftId = draftData.id;

  // เติมข้อมูลลงฟอร์ม
  el('billno').value = draftData.billno || ''; // ไม่ต้อง gen เลขจริงตอนนี้
  el('customer').value = draftData.customer || '';
  el('cash').value = draftData.cash || '';

  // โหลดรายการ draft_items
  const { data: items, error: itemsError } = await client
    .from('draft_items')
    .select('*')
    .eq('draft_id', draftData.id);

  if (itemsError) {
    console.log('โหลด draft_items ผิดพลาด', itemsError);
    return;
  }

  items.forEach(item => {
    const input = document.querySelector(
      `#menuItems input[data-id="${item.menu_id}"]`
    );
    if (input) input.value = item.qty;
  });

  calc();
}

function calc() {
  let total = 0;
  document.querySelectorAll('#menuItems input').forEach(inp => {
    const qty = safeEval(inp.value);
    const id = parseInt(inp.dataset.id);
    const menuItem = menuData.find(m => m.id === id);
    if (menuItem && qty > 0) total += qty * menuItem.price;
  });
  const cash = safeEval(el('cash').value);
  const change = cash - total;
  el('grand').textContent = fmt(total);
  if (cash > 0 && change < 0) {
    el('cash').style.borderColor = 'var(--danger)';
    el('cashWarn').style.display = 'block';
    el('change').value = '';
  } else {
    el('cash').style.borderColor = 'var(--line)';
    el('cashWarn').style.display = 'none';
    el('change').value = fmt(change > 0 ? change : 0);
  }
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
          <td style="border:1px solid #000; padding:6px;">${escapeHtml(menuItem.name)}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;">${menuItem.price.toFixed(2)}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;">${qty}</td>
          <td style="border:1px solid #000; padding:6px; text-align:right;">${(qty * menuItem.price).toFixed(2)}</td>
        </tr>`;
    }
  });
  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value.replace(/[^\d.]/g, ''));
  html += `</tbody></table>
    <div style="margin-top:12px; text-align:right;">
      <div><strong>ยอดรวม:</strong> ${total.toFixed(2)}</div>
      <div><strong>รับเงินมา:</strong> ${cash.toFixed(2)}</div>
      <div><strong>เงินทอน:</strong> ${change.toFixed(2)}</div>
    </div>`;
  return html;
}

// buildPrintView, saveDraft, saveBill left mostly unchanged from your original code
// (I kept them intact but sanitized some minor bits for safety)
function buildPrintView(bill) {
  const createdText = bill.created_at ? new Date(bill.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
  const closedText = bill.closed_at ? new Date(bill.closed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
  let html = `
  <html><head><title>บิลร้านเรือนชมพูเนื้อย่างเกาหลี</title>
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
      .big { font-weight:700; font-size:15px; }
      .footer { text-align:center; margin-top:8px; font-size:11px; }
    </style>
  </head><body>
    <div class="header">
      <h1>ร้านเรือนชมพูเนื้อย่างเกาหลี</h1>
      <p>สาขานาเชือก</p>
      <p>โทร: 0885305228, 0621392902</p>
      <p>บิลเลขที่: ${escapeHtml(bill.billno)}</p>
      <p>โต๊ะ/ลูกค้า: ${escapeHtml(bill.customer || '-')}</p>
      <p>เวลาเช็คบิล: ${closedText}</p>
    </div>
    <table><thead><tr><th>รายการ</th><th class="right">ราคา</th><th class="right">จำนวน</th><th class="right">รวม</th></tr></thead><tbody>
  `;

  document.querySelectorAll('#menuItems input').forEach(inp => {
    const qty = safeEval(inp.value);
    if (qty <= 0) return;
    const menu_id = parseInt(inp.dataset.id);
    const menuItem = menuData.find(m => m.id === menu_id);
    if (menuItem) {
      html += `<tr><td>${escapeHtml(menuItem.name)}</td><td class="right">${menuItem.price.toFixed(2)}</td><td class="right">${qty}</td><td class="right">${(qty * menuItem.price).toFixed(2)}</td></tr>`;
    }
  });

  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value.replace(/[^\d.]/g, ''));
  html += `</tbody></table>
    <div class="summary"><div class="line-double"></div>
      <div><span>ยอดรวม</span><span class="big">${total.toFixed(2)}</span></div>
      <div><span>รับเงินมา</span><span>${cash.toFixed(2)}</span></div>
      <div><span>เงินทอน</span><span>${change.toFixed(2)}</span></div>
    </div>
    <div class="footer">*** ขอบคุณที่อุดหนุน ***</div>
  </body></html>`;
  return html;
}

async function saveDraft() {
  let billno = el('billno').value;
  if (!billno) { 
    billno = 'DRAFT-' + (table_id || ''); 
    el('billno').value = billno; 
  }
  const customer = el('customer').value;
  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value);

  try {
    let { data: existingDraft } = await client.from('drafts').select('*').eq('billno', billno).maybeSingle();
    let draftId;
    if (existingDraft) {
      const { data: updatedDraft, error: updateError } = await client.from('drafts').update({ customer, table_id, total, cash, change, updated_at: new Date().toISOString() }).eq('id', existingDraft.id).select().maybeSingle();
      if (updateError) throw updateError;
      draftId = updatedDraft.id;
    } else {
      const { data: newDraft, error: insertError } = await client.from('drafts').insert([{ billno, customer, table_id, total, cash, change }]).select().maybeSingle();
      if (insertError) throw insertError;
      draftId = newDraft.id;
    }

    await client.from('draft_items').delete().eq('draft_id', draftId);

    const items = [];
    document.querySelectorAll('#menuItems input').forEach(inp => {
      const qty = safeEval(inp.value);
      if (qty > 0) items.push({ draft_id: draftId, menu_id: parseInt(inp.dataset.id), qty });
    });

    if (items.length > 0) {
      const { error: itemError } = await client.from('draft_items').insert(items);
      if (itemError) throw itemError;
    }

    if (table_id) {
      await client.from('tables').update({ status: 'ไม่ว่าง' }).eq('id', table_id);
    }

    alert('บันทึกฉบับร่างเรียบร้อย');
    window.location.href = 'index.html';
  } catch (err) {
    console.log('saveDraft error:', err);
    alert('บันทึกฉบับร่างผิดพลาด');
  }
}

async function saveBill() {
    const billno = (el('billno').value.startsWith('DRAFT-')) ? await getNextBillNo() : el('billno').value; // ถ้าเป็น draft → ขอเลขจริง
    const customer = el('customer').value;
    const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
    const cash = safeEval(el('cash').value);
    const change = safeEval(el('change').value.replace(/[^\d.]/g, ''));

    let draftData = null;
    if (billno) {
        const { data, error } = await client
            .from('drafts')
            .select('*')
            .eq('table_id', table_id)
            .maybeSingle();
        
        if (!error && data) draftData = data;
    }

    const { data: bill, error: billError } = await client.from('bills').insert([{
        billno,
        customer,
        table_id,
        total,
        cash,
        change,
        status: 'closed',
        created_at: draftData?.created_at
                    ? new Date(draftData.created_at)
                    : new Date(),  // <— บังคับเป็น Date object
        closed_at: new Date()
    }]).select().maybeSingle();

    if (billError) {
        alert('บันทึกบิลผิดพลาด');
        console.log(billError);
        return null; // <--- แก้ไขจุดที่ 1: คืนค่า null ถ้าบันทึกบิลหลักไม่สำเร็จ
    }

    const items = [];
    document.querySelectorAll('#menuItems input').forEach(inp => {
        const qty = safeEval(inp.value);
        if (qty <= 0) return;
        const menu_id = parseInt(inp.dataset.id);
        const menuItem = menuData.find(m => m.id === menu_id);
        if (menuItem) items.push({ bill_id: bill.id, menu_id, qty, price: menuItem.price });
    });

    if (items.length > 0) {
        const { error: itemError } = await client.from('bill_items').insert(items);
        if (itemError) console.log('บันทึกรายการ bill_items ผิดพลาด', itemError);
    }

    if (table_id) {
        const { error: updateError } = await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
        if (updateError) console.log('อัปเดตโต๊ะว่างผิดพลาด', updateError);
    }

    // ลบ draft โดยใช้ table_id
    if (table_id) {
        // หาว่า table_id นี้มี draft ไหม
        const { data: d } = await client.from('drafts')
            .select('id')
            .eq('table_id', table_id)
            .maybeSingle();

        if (d) {
            // ลบ draft_items ก่อน
            const { error: diErr } = await client.from('draft_items').delete().eq('draft_id', d.id);
            if (diErr) console.log('ลบ draft_items ผิดพลาด', diErr);

            // ลบ draft
            const { error: dErr } = await client.from('drafts').delete().eq('id', d.id);
            if (dErr) console.log('ลบ drafts ผิดพลาด', dErr);
        }
    }

    // --- ลบโค้ดส่วน // print ทั้งหมดออก ---

    // --- แก้ไขจุดที่ 2: คืนค่า ID ของบิลที่บันทึกได้ ---
    return bill.id;
}

/* ---------------------------
   Swipe / show action buttons
   - Uses pointer events (works for mouse & touch)
   - Does NOT interfere with Sortable (we ignore events that start on .drag-handle)
   - Closes any other open row when opening a new one
   --------------------------- */
function enableSwipe(row, menu) {
  const content = row.querySelector('.row-content');
  const handle = row.querySelector('.drag-handle');
  const actionBtns = row.querySelector('.action-btns');

  // ensure closed initially
  row.classList.remove('show-actions');
  content.style.transform = 'translateX(0)';

  let startX = 0;
  let currentX = 0;
  let dragging = false;
  let pointerId = null;

  function closeRow(r = row) {
    const c = r.querySelector('.row-content');
    r.classList.remove('show-actions');
    c.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1)';
    c.style.transform = 'translateX(0)';
    if (currentlyOpenRow === r) currentlyOpenRow = null;
  }

  function openRow(r = row, width) {
    const c = r.querySelector('.row-content');
    r.classList.add('show-actions');
    c.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1)';
    c.style.transform = `translateX(-${width}px)`;
    currentlyOpenRow = r;
  }

  function onPointerDown(e) {
    // only left mouse button or touch
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // if started on drag-handle -> ignore (let Sortable handle it)
    if (e.target.closest('.drag-handle')) return;
    // if started on input/button -> ignore
    if (e.target.closest('input,button')) return;

    pointerId = e.pointerId;
    startX = e.clientX;
    currentX = startX;
    dragging = true;
    content.style.transition = 'none';

    // compute max translate (width of action buttons)
    const rect = actionBtns.getBoundingClientRect();
    content._maxTranslate = Math.max(80, Math.round(rect.width || 160)); // fallback 160
    // close other open row
    if (currentlyOpenRow && currentlyOpenRow !== row) closeRow(currentlyOpenRow);

    row.setPointerCapture && row.setPointerCapture(pointerId);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    currentX = e.clientX;
    let diff = currentX - startX;
    if (diff > 0) diff = 0; // only allow left swipe
    const max = content._maxTranslate || 160;
    const translate = Math.max(diff, -max);
    content.style.transform = `translateX(${translate}px)`;
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const diff = currentX - startX;
    const max = content._maxTranslate || 160;
    const threshold = Math.round(max * 0.35); // need swipe beyond 35% to open
    content.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1)';

    if (diff < -threshold) {
      openRow(row, max);
    } else {
      closeRow(row);
    }

    try {
      row.releasePointerCapture && row.releasePointerCapture(pointerId);
    } catch (_) { /* ignore */ }
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
  }

  // bind pointerdown on the content (not handle)
  content.addEventListener('pointerdown', onPointerDown);

  // also allow clicking edit/delete
  const editBtn = row.querySelector('.edit-btn');
  const deleteBtn = row.querySelector('.delete-btn');

  // edit
if (editBtn) {
  editBtn.addEventListener('click', () => {
    const popup = document.getElementById('editPopup');
    const nameInput = document.getElementById('editMenuName');
    const priceInput = document.getElementById('editMenuPrice');

    nameInput.value = menu.name;
    priceInput.value = menu.price;

    popup.style.display = 'flex';

    // ป้องกัน handler ซ้อน
    const confirmBtn = document.getElementById('btnEditMenuConfirm');
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    newConfirm.addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      const newPrice = parseFloat(priceInput.value) || 0;
      if (!newName || !newPrice) {
        alert("กรุณากรอกชื่อและราคา");
        return;
      }
      await client.from("menu").update({ name: newName, price: newPrice }).eq("id", menu.id);
      popup.style.display = 'none';
      await loadMenu();
    });

    // ปุ่มยกเลิก
    const cancelBtn = document.getElementById('btnEditMenuCancel');
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', () => { popup.style.display = 'none'; });
  });
}

  // delete
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm("ลบเมนูนี้ใช่ไหม?")) return;
      const { error } = await client.from('menu').delete().eq('id', menu.id);
      if (error) {
        alert('ลบเมนูผิดพลาด');
        console.error(error);
        return;
      }
      // remove row from DOM
      row.remove();
      // also update sort order
      await saveNewOrder();
    });
  }

  // close open row when clicking outside
  document.addEventListener('click', (evt) => {
    if (!row.contains(evt.target) && currentlyOpenRow) {
      closeRow(currentlyOpenRow);
    }
  }, { capture: true });
}


function showEditPopup(menu) {
    const popup = document.getElementById('editPopup');
    const nameInput = document.getElementById('editMenuName');
    const priceInput = document.getElementById('editMenuPrice');

    nameInput.value = menu.name;
    priceInput.value = menu.price;

    popup.style.display = 'flex';

    // ป้องกัน handler ซ้อน
    const confirmBtn = document.getElementById('btnEditMenuConfirm');
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    newConfirm.addEventListener('click', async () => {
        const newName = nameInput.value.trim();
        const newPrice = parseFloat(priceInput.value) || 0;
        if (!newName || !newPrice) {
            alert("กรุณากรอกชื่อและราคา");
            return;
        }
        await client.from("menu").update({ name: newName, price: newPrice }).eq("id", menu.id);
        popup.style.display = 'none';
        await loadMenu();
    });

    // ปุ่มยกเลิก
    const cancelBtn = document.getElementById('btnEditMenuCancel');
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', () => { popup.style.display = 'none'; });
}

/* ============================
   Utility helpers
   ============================ */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' }[c]));
}

function closeOpenRow() {
  if (currentlyOpenRow) {
    const c = currentlyOpenRow.querySelector('.row-content');
    currentlyOpenRow.classList.remove('show-actions');
    c.style.transform = 'translateX(0)';
    currentlyOpenRow = null;
  }
}

/* ============================
   Init - wire up buttons
   ============================ */
window.addEventListener('DOMContentLoaded', async () => {
  //el('today').textContent = todayText();
  await showDraftCreatedAt(table_id);
  //el('billno').value = await getNextBillNo();
  await loadTableName();
  await loadMenu();
  await loadDraft();

  el('btnHome').addEventListener('click', async () => {
    if (table_id) {
      const hasOrder = Array.from(document.querySelectorAll('#menuItems input')).some(inp => safeEval(inp.value) > 0);
      if (!hasOrder) {
        const { error: updateError } = await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
        if (updateError) { console.log('อัปเดตโต๊ะว่างผิดพลาด', updateError); return; }
        window.location.href = 'index.html';
        return;
      }
      const { data: draftData } = await client.from('drafts').select('id').eq('table_id', table_id).maybeSingle();
      const hasUnsavedData = hasOrder || el('customer').value.trim() !== '';
      if (!draftData && hasUnsavedData) {
        const confirmReset = confirm("คุณยังไม่ได้บันทึกข้อมูล\nต้องการเปลี่ยนสถานะโต๊ะเป็น 'ว่าง' ใช่หรือไม่?");
        if (!confirmReset) return;
        const { error: updateError } = await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
        if (updateError) { console.log('อัปเดตโต๊ะว่างผิดพลาด', updateError); alert('บันทึกสถานะโต๊ะผิดพลาด กรุณาลองใหม่อีกครั้ง'); return; }
        window.location.href = 'index.html';
        return;
      }
      if (draftData) { window.location.href = 'index.html'; return; }
      return;
    }
    window.location.href = 'index.html';
  });

  // ปุ่มเปิด popup เพิ่มเมนู
  el('btnAddMenu').addEventListener('click', () => {
    el('addPopup').style.display = 'flex';
  });
  
  // ปุ่มยกเลิก popup เพิ่มเมนู
  el('btnAddMenuCancel').addEventListener('click', () => {
    el('addPopup').style.display = 'none';
    el('addMenuName').value = '';
    el('addMenuPrice').value = '';
  });
  
  // ปุ่มบันทึก popup เพิ่มเมนู
  el('btnAddMenuConfirm').addEventListener('click', async () => {
    const name = el('addMenuName').value.trim();
    const price = parseFloat(el('addMenuPrice').value);
  
    if (!name || isNaN(price)) {
      alert('กรอกชื่อและราคาก่อนครับ');
      return;
    }
  
    // 1. หาค่า sort_order สูงสุดปัจจุบัน
    const { data: maxData, error: maxErr } = await client
      .from('menu')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
  
    if (maxErr) {
      console.error('หา sort_order ผิดพลาด', maxErr);
      alert('ไม่สามารถเพิ่มเมนูได้');
      return;
    }
  
    const nextSortOrder = maxData?.sort_order ? maxData.sort_order + 1 : 1;
  
    // 2. insert เมนูใหม่ลง DB
    const { error: insertErr } = await client
      .from('menu')
      .insert([{ name, price, sort_order: nextSortOrder }]);
  
    if (insertErr) {
      console.error('insert menu ผิดพลาด', insertErr);
      alert('เพิ่มเมนูผิดพลาด');
      return;
    }
  
    // 3. โหลดเมนูใหม่
    await loadMenu();
  
    // 4. ปิด popup และเคลียร์ค่า
    el('addPopup').style.display = 'none';
    el('addMenuName').value = '';
    el('addMenuPrice').value = '';
  });

  el('btnPrint').addEventListener('click', () => { el('previewContent').innerHTML = buildPreviewView(); el('previewModal').style.display = 'flex'; });
  el('btnCancelPreview').addEventListener('click', () => { el('previewModal').style.display = 'none'; });
  el('btnConfirmPrint').addEventListener('click', async () => {
    el('previewModal').style.display = 'none';
    
    try {
        // 1. เรียก saveBill() และรอรับ ID กลับมา
        const savedBillId = await saveBill();

        // 2. ตรวจสอบว่าได้ ID
        if (savedBillId) {
            
            // *** เริ่มส่วนที่แก้ไข ***
            // 3. ตรวจสอบว่าเลือกวิธีพิมพ์แบบไหน
            const selectedPrintType = document.querySelector('input[name="printType"]:checked').value;

            let targetUrl = '';

            // 4. กำหนด URL ปลายทางตามที่เลือก
            if (selectedPrintType === 'USB') {
                // ถ้าเลือก "คอมพิวเตอร์" (USB)
                targetUrl = `printbill.html?bill_id=${savedBillId}`;
            } else if (selectedPrintType === 'WIFI') {
                // ถ้าเลือก "สมาร์ทโฟน" (WIFI)
                targetUrl = `printPOS.html?bill_id=${savedBillId}`;
            }

            // 5. เปิดหน้าต่างใหม่ตาม URL ที่กำหนด
            if (targetUrl) {
                window.open(targetUrl, '_blank');
            } else {
                // กรณีเผื่อไว้ หากไม่มีการเลือก (ซึ่งไม่ควรเกิดเพราะมี checked default)
                alert('กรุณาเลือกวิธีการพิมพ์');
                return; // ไม่ต้องทำต่อ
            }
            // *** จบส่วนที่แก้ไข ***
            
            // 6. (สำคัญ) ย้ายโค้ด "หลังพิมพ์เสร็จ" มาไว้ตรงนี้
            // (โค้ดส่วนนี้เหมือนเดิม)
            
            // clear form
            el('billno').value = '';
            document.querySelectorAll('#menuItems input').forEach(i => i.value = '');
            el('cash').value = '';
            calc(); // (เรียก calc() เพื่อรีเฟรชยอดรวม)
            
            // กลับไปหน้า index
            window.location.href = 'index.html';
            
        } else {
            alert('เกิดข้อผิดพลาด: ไม่สามารถบันทึกบิลได้');
        }
        
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการบันทึกหรือพิมพ์:', err);
        alert('เกิดข้อผิดพลาด: ' + err.message);
    }
});

  el('btnSave').addEventListener('click', saveDraft);

  el('btnClear').addEventListener('click', async () => {
    if (!confirm('ยืนยันการยกเลิกบิลนี้หรือไม่?')) return;
    if (table_id) {
      const { error: updateError } = await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
      if (updateError) console.log('อัปเดตสถานะโต๊ะผิดพลาด', updateError);
    
      const { data: draftData } = await client.from('drafts').select('id').eq('table_id', table_id).maybeSingle();
      if (draftData) {
        await client.from('draft_items').delete().eq('draft_id', draftData.id);
        await client.from('drafts').delete().eq('id', draftData.id);
      }
    }
    document.querySelectorAll('#menuItems input').forEach(i => i.value = '');
    el('customer').value = '';
    el('cash').value = '';
    calc();
    //alert('ยกเลิกบิลเรียบร้อยแล้ว');
    window.location.href = 'index.html';
  });

  el('cash').addEventListener('input', calc);
});

/* ---------------------------
   แสดง created_at ของ draft
   --------------------------- */
async function showDraftCreatedAt(table_id) {
  const elToday = document.getElementById('today');
  if (!table_id) {
    // fallback: แสดงวันที่ปัจจุบันถ้าไม่มี table_id
    elToday.textContent = new Date().toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    return;
  }

  try {
    const { data, error } = await client
      .from('drafts')
      .select('created_at')
      .eq('table_id', table_id)
      .maybeSingle();

    if (error) {
      console.error('โหลด created_at ไม่ได้:', error);
      // fallback: แสดงวันที่ปัจจุบัน
      elToday.textContent = new Date().toLocaleString('th-TH', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      return;
    }

    if (data?.created_at) {
      const d = new Date(data.created_at);
      elToday.textContent = d.toLocaleString('th-TH', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } else {
      // fallback: ถ้าไม่มี created_at
      elToday.textContent = new Date().toLocaleString('th-TH', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    }

  } catch (err) {
    console.error('showDraftCreatedAt error:', err);
    // fallback: แสดงวันที่ปัจจุบัน
    elToday.textContent = new Date().toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
}

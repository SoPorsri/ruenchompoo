// bill.js (replace your existing file)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
const client = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  const { data, error } = await client.from('bills').select('billno').order('billno', { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error("ดึงเลขบิลล่าสุดผิดพลาด", error); return "00001"; }
  let lastNo = 0;
  if (data && data.billno) lastNo = parseInt(data.billno, 10) || 0;
  return String(lastNo + 1).padStart(5, '0');
}
async function loadTableName() {
  if (!table_id) return;
  const { data, error } = await client.from('tables').select('*').eq('id', table_id).single();
  if (error) { console.log(error); return; }
  if (data) {
    el('customer').value = data.name;
    const { error: updateError } = await client.from('tables').update({ status: 'ไม่ว่าง' }).eq('id', table_id);
    if (updateError) console.log('อัปเดตโต๊ะไม่ว่างผิดพลาด', updateError);
  }
}

/* ---------------------------
   Load menu: build DOM rows
   --------------------------- */
async function loadMenu() {
  const { data, error } = await client.from('menu').select('*').order('sort_order', { ascending: true });
  if (error) { alert('โหลดเมนูผิดพลาด'); console.log(error); return; }

  menuData = data || [];
  const container = el('menuItems');
  container.innerHTML = '';

  // create rows
  menuData.forEach(item => {
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
            placeholder="เช่น 1+2"
            inputmode="decimal" 
            pattern="[0-9.+]*">
        </div>
      </div>
      <div class="action-btns" aria-hidden="true">
        <div class="edit-btn" role="button" tabindex="0">✏️</div>
        <div class="delete-btn" role="button" tabindex="0">🗑️</div>
      </div>
    `;
    container.appendChild(row);

    // attach swipe + edit/delete handlers
    enableSwipe(row, item);
  });

  // inputs -> calc
  container.querySelectorAll('.menu-qty').forEach(i => i.addEventListener('input', calc));

  // init or re-init Sortable (drag-reorder)
  if (sortableInstance) {
    try { sortableInstance.destroy(); } catch (e) { /* ignore */ }
    sortableInstance = null;
  }
  if (window.Sortable) {
    sortableInstance = new Sortable(container, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'dragging-ghost',
      onEnd: async (evt) => {
        // reorder saved to DB
        await saveNewOrder();
      }
    });
  } else {
    console.warn('SortableJS not found. Reordering disabled.');
  }

  // ensure no rows left open
  closeOpenRow();
  return true;
}
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
async function loadDraft() {
  if (!table_id) return;
  const { data: draftData, error: draftError } = await client.from('drafts').select('*').eq('table_id', table_id).single();
  if (draftError) { console.log('โหลด draft ผิดพลาด', draftError); return; }
  if (!draftData) return;
  el('billno').value = draftData.billno || await getNextBillNo();
  el('customer').value = draftData.customer || '';
  el('cash').value = draftData.cash || '';

  const { data: items, error: itemsError } = await client.from('draft_items').select('*').eq('draft_id', draftData.id);
  if (itemsError) { console.log('โหลด draft_items ผิดพลาด', itemsError); return; }
  items.forEach(item => {
    const input = document.querySelector(`#menuItems input[data-id="${item.menu_id}"]`);
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
  if (!billno) { billno = await getNextBillNo(); el('billno').value = billno; }
  const customer = el('customer').value;
  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value);

  try {
    let { data: existingDraft } = await client.from('drafts').select('*').eq('billno', billno).single();
    let draftId;
    if (existingDraft) {
      const { data: updatedDraft, error: updateError } = await client.from('drafts').update({ customer, table_id, total, cash, change, updated_at: new Date().toISOString() }).eq('id', existingDraft.id).select().single();
      if (updateError) throw updateError;
      draftId = updatedDraft.id;
    } else {
      const { data: newDraft, error: insertError } = await client.from('drafts').insert([{ billno, customer, table_id, total, cash, change }]).select().single();
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
  } catch (err) {
    console.log('saveDraft error:', err);
    alert('บันทึกฉบับร่างผิดพลาด');
  }
}

async function saveBill() {
  const billno = el('billno').value || await getNextBillNo();
  const customer = el('customer').value;
  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value.replace(/[^\d.]/g, ''));

  let draftData = null;
  if (billno) {
    const { data, error } = await client.from('drafts').select('*').eq('billno', billno).single();
    if (!error && data) draftData = data;
  }

  const { data: bill, error: billError } = await client.from('bills').insert([{
    billno, customer, table_id, total, cash, change,
    status: 'closed',
    created_at: draftData ? draftData.created_at : new Date(),
    closed_at: new Date()
  }]).select().single();

  if (billError) { alert('บันทึกบิลผิดพลาด'); console.log(billError); return; }

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

  if (draftData) {
    await client.from('draft_items').delete().eq('draft_id', draftData.id);
    await client.from('drafts').delete().eq('id', draftData.id);
  }

  // print
  const w = window.open('', 'PRINT', 'height=600,width=800');
  w.document.write('<html><head><title>พิมพ์บิล</title></head><body>');
  w.document.write(buildPrintView(bill));
  w.document.write('</body></html>');
  w.document.close();
  w.focus();
  w.print();
  w.close();

  // clear
  el('billno').value = await getNextBillNo();
  document.querySelectorAll('#menuItems input').forEach(i => i.value = '');
  el('cash').value = '';
  calc();
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
      const popup = document.getElementById('popup');
      const nameInput = document.getElementById('newMenuName');
      const priceInput = document.getElementById('newMenuPrice');

      nameInput.value = menu.name;
      priceInput.value = menu.price;

      popup.style.display = 'flex';

      // prevent duplicate handlers by cloning
      const confirmBtn = document.getElementById('btnAddMenuConfirm');
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
  el('today').textContent = todayText();
  el('billno').value = await getNextBillNo();
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

  el('btnAddMenu').addEventListener('click', () => { el('popup').style.display = 'flex'; });
  el('btnAddMenuCancel').addEventListener('click', () => { el('popup').style.display = 'none'; el('newMenuName').value = ''; el('newMenuPrice').value = ''; });

  el('btnAddMenuConfirm').addEventListener('click', async () => {
    const name = el('newMenuName').value.trim();
    const price = parseFloat(el('newMenuPrice').value);
    if (!name || !price) { alert('กรุณากรอกชื่อและราคา'); return; }
    try {
      const { data: maxData } = await client.from('menu').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      let nextSortOrder = 1;
      if (maxData && maxData.sort_order !== null) nextSortOrder = maxData.sort_order + 1;
      const { error } = await client.from('menu').insert([{ name, price, sort_order: nextSortOrder }]);
      if (error) { alert('บันทึกผิดพลาด'); console.error(error); } else {
        el('popup').style.display = 'none';
        el('newMenuName').value = '';
        el('newMenuPrice').value = '';
        await loadMenu();
      }
    } catch (err) { console.error('เพิ่มเมนูใหม่ผิดพลาด', err); alert('เกิดข้อผิดพลาด กรุณาลองใหม่'); }
  });

  el('btnPrint').addEventListener('click', () => { el('previewContent').innerHTML = buildPreviewView(); el('previewModal').style.display = 'flex'; });
  el('btnCancelPreview').addEventListener('click', () => { el('previewModal').style.display = 'none'; });
  el('btnConfirmPrint').addEventListener('click', () => { el('previewModal').style.display = 'none'; saveBill(); });

  el('btnSave').addEventListener('click', saveDraft);

  el('btnClear').addEventListener('click', async () => {
    if (!confirm('ยืนยันการยกเลิกบิลนี้หรือไม่?')) return;
    if (table_id) {
      const { error: updateError } = await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
      if (updateError) console.log('อัปเดตสถานะโต๊ะผิดพลาด', updateError);
    }
    if (table_id) {
      const { data: draftData } = await client.from('drafts').select('id').eq('table_id', table_id).single();
      if (draftData) {
        await client.from('draft_items').delete().eq('draft_id', draftData.id);
        await client.from('drafts').delete().eq('id', draftData.id);
      }
    }
    document.querySelectorAll('#menuItems input').forEach(i => i.value = '');
    el('customer').value = '';
    el('cash').value = '';
    calc();
    alert('ยกเลิกบิลเรียบร้อยแล้ว');
  });

  el('cash').addEventListener('input', calc);
});

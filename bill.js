// --- Imports and Global Constants ---
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
const client = createClient(SUPABASE_URL, SUPABASE_KEY);

const el = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n || 0);

let menuData = [];
const params = new URLSearchParams(window.location.search);
const table_id = params.get('table_id');

let sortableInstance = null; // Stores SortableJS instance
let currentlyOpenRow = null; // Tracks open swipe row to close others

// --- Utility Functions ---
/**
 * Safely evaluates a math expression string.
 * @param {string} expr The expression to evaluate.
 * @returns {number} The result of the expression or 0 if invalid.
 */
function safeEval(expr) {
  if (!expr) return 0;
  expr = String(expr).replace(/\s+/g, '');
  // Sanitize input to allow only numbers, +, -, *, /, .
  if (!/^[0-9+\-*/.]+$/.test(expr)) return 0;
  try {
    return Function('"use strict";return(' + expr + ')')();
  } catch {
    return 0;
  }
}

/**
 * Gets the current date and time formatted for Thailand locale.
 * @returns {string} Formatted date and time.
 */
function todayText() {
  const d = new Date();
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Escapes HTML characters in a string to prevent XSS.
 * @param {string} s The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#x60;'
  })[c]);
}

// --- Supabase Database Helpers ---
/**
 * Fetches the next available bill number.
 * @returns {Promise<string>} The padded 5-digit bill number.
 */
async function getNextBillNo() {
  const { data, error } = await client.from('bills').select('billno').order('billno', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error("Failed to fetch last bill number:", error);
    return "00001";
  }
  let lastNo = 0;
  if (data && data.billno) {
    lastNo = parseInt(data.billno, 10) || 0;
  }
  return String(lastNo + 1).padStart(5, '0');
}

/**
 * Loads the table name and updates its status.
 */
async function loadTableName() {
  if (!table_id) return;
  const { data, error } = await client.from('tables').select('*').eq('id', table_id).single();
  if (error) {
    console.log(error);
    return;
  }
  if (data) {
    el('customer').value = data.name;
    const { error: updateError } = await client.from('tables').update({ status: 'ไม่ว่าง' }).eq('id', table_id);
    if (updateError) {
      console.log('Failed to update table status:', updateError);
    }
  }
}

/**
 * Fetches and displays all menu items, and initializes drag-and-drop.
 * @returns {Promise<boolean>} True if successful.
 */
async function loadMenu() {
  const { data, error } = await client.from('menu').select('*').order('sort_order', { ascending: true });
  if (error) {
    alert('Failed to load menu.');
    console.log(error);
    return false;
  }

  menuData = data || [];
  const container = el('menuItems');
  container.innerHTML = '';

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

    enableSwipe(row, item);
  });

  container.querySelectorAll('.menu-qty').forEach(i => i.addEventListener('input', calc));

  if (sortableInstance) {
    try {
      sortableInstance.destroy();
    } catch (e) { /* ignore */ }
    sortableInstance = null;
  }

  if (window.Sortable) {
    sortableInstance = new Sortable(container, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'dragging-ghost',
      filter: '.row-content',
      preventOnFilter: false,
      onEnd: async () => {
        await saveNewOrder();
      }
    });
  } else {
    console.warn('SortableJS not found. Reordering disabled.');
  }

  closeOpenRow();
  return true;
}

/**
 * Saves the new sort order of menu items to the database.
 */
async function saveNewOrder() {
  const rows = document.querySelectorAll('#menuItems .row');
  for (let i = 0; i < rows.length; i++) {
    const id = parseInt(rows[i].dataset.id);
    const sort_order = i + 1;
    const { error } = await client.from('menu').update({ sort_order }).eq('id', id);
    if (error) console.error('Failed to update sort_order:', error);
  }
  console.log('✅ Sort order saved successfully.');
}

/**
 * Loads a draft bill from the database for the current table.
 */
async function loadDraft() {
  if (!table_id) return;
  const { data: draftData, error: draftError } = await client.from('drafts').select('*').eq('table_id', table_id).single();
  if (draftError) {
    console.log('Failed to load draft:', draftError);
    return;
  }
  if (!draftData) return;

  el('billno').value = draftData.billno || await getNextBillNo();
  el('customer').value = draftData.customer || '';
  el('cash').value = draftData.cash || '';

  const { data: items, error: itemsError } = await client.from('draft_items').select('*').eq('draft_id', draftData.id);
  if (itemsError) {
    console.log('Failed to load draft items:', itemsError);
    return;
  }

  items.forEach(item => {
    const input = document.querySelector(`#menuItems input[data-id="${item.menu_id}"]`);
    if (input) input.value = item.qty;
  });
  calc();
}

/**
 * Saves the current bill as a draft.
 */
async function saveDraft() {
  let billno = el('billno').value;
  if (!billno) {
    billno = await getNextBillNo();
    el('billno').value = billno;
  }

  const customer = el('customer').value;
  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value);

  try {
    let draftId;
    const { data: existingDraft } = await client.from('drafts').select('*').eq('billno', billno).single();

    if (existingDraft) {
      const { data: updatedDraft, error: updateError } = await client
        .from('drafts')
        .update({ customer, table_id, total, cash, change, updated_at: new Date().toISOString() })
        .eq('id', existingDraft.id)
        .select()
        .single();
      if (updateError) throw updateError;
      draftId = updatedDraft.id;
    } else {
      const { data: newDraft, error: insertError } = await client
        .from('drafts')
        .insert([{ billno, customer, table_id, total, cash, change }])
        .select()
        .single();
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

    alert('Draft saved successfully.');
  } catch (err) {
    console.error('saveDraft error:', err);
    alert('Failed to save draft.');
  }
}

/**
 * Finalizes the bill, saves it, and handles printing.
 */
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

  const { data: bill, error: billError } = await client
    .from('bills')
    .insert([{
      billno, customer, table_id, total, cash, change,
      status: 'closed',
      created_at: draftData ? draftData.created_at : new Date(),
      closed_at: new Date()
    }])
    .select()
    .single();

  if (billError) {
    alert('Failed to save bill.');
    console.log(billError);
    return;
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
    if (itemError) console.log('Failed to save bill items:', itemError);
  }

  if (table_id) {
    const { error: updateError } = await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
    if (updateError) console.log('Failed to update table status to empty:', updateError);
  }

  if (draftData) {
    await client.from('draft_items').delete().eq('draft_id', draftData.id);
    await client.from('drafts').delete().eq('id', draftData.id);
  }

  // Handle printing
  const w = window.open('', 'PRINT', 'height=600,width=800');
  w.document.write('<html><head><title>Print Bill</title></head><body>');
  w.document.write(buildPrintView(bill));
  w.document.write('</body></html>');
  w.document.close();
  w.focus();
  w.print();
  w.close();

  // Reset fields
  el('billno').value = await getNextBillNo();
  document.querySelectorAll('#menuItems input').forEach(i => i.value = '');
  el('cash').value = '';
  calc();
}

// --- View & Calculation Functions ---
/**
 * Calculates the total, cash, and change, then updates the UI.
 */
function calc() {
  let total = 0;
  document.querySelectorAll('#menuItems input').forEach(inp => {
    const qty = safeEval(inp.value);
    const id = parseInt(inp.dataset.id);
    const menuItem = menuData.find(m => m.id === id);
    if (menuItem && qty > 0) {
      total += qty * menuItem.price;
    }
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

/**
 * Builds the HTML content for the print preview modal.
 * @returns {string} The HTML string for the preview table.
 */
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
        </tr>
      `;
    }
  });

  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value.replace(/[^\d.]/g, ''));

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

/**
 * Builds the complete HTML content for the printer.
 * @param {object} bill The bill object to display.
 * @returns {string} The full HTML document string for printing.
 */
function buildPrintView(bill) {
  const createdText = bill.created_at ? new Date(bill.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
  const closedText = bill.closed_at ? new Date(bill.closed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
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
          .big { font-weight:700; font-size:15px; }
          .footer { text-align:center; margin-top:8px; font-size:11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>ร้านเรือนชมพูเนื้อย่างเกาหลี</h1>
          <p>สาขานาเชือก</p>
          <p>โทร: 0885305228, 0621392902</p>
          <p>บิลเลขที่: ${escapeHtml(bill.billno)}</p>
          <p>โต๊ะ/ลูกค้า: ${escapeHtml(bill.customer || '-')}</p>
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

  document.querySelectorAll('#menuItems input').forEach(inp => {
    const qty = safeEval(inp.value);
    if (qty <= 0) return;
    const menu_id = parseInt(inp.dataset.id);
    const menuItem = menuData.find(m => m.id === menu_id);
    if (menuItem) {
      html += `
        <tr>
          <td>${escapeHtml(menuItem.name)}</td>
          <td class="right">${menuItem.price.toFixed(2)}</td>
          <td class="right">${qty}</td>
          <td class="right">${(qty * menuItem.price).toFixed(2)}</td>
        </tr>
      `;
    }
  });

  const total = safeEval(el('grand').textContent.replace(/[^\d.]/g, ''));
  const cash = safeEval(el('cash').value);
  const change = safeEval(el('change').value.replace(/[^\d.]/g, ''));

  html += `
          </tbody>
        </table>
        <div class="summary">
          <div class="line-double"></div>
          <div><span>ยอดรวม</span><span class="big">${total.toFixed(2)}</span></div>
          <div><span>รับเงินมา</span><span>${cash.toFixed(2)}</span></div>
          <div><span>เงินทอน</span><span>${change.toFixed(2)}</span></div>
        </div>
        <div class="footer">*** ขอบคุณที่อุดหนุน ***</div>
      </body>
    </html>
  `;
  return html;
}

// ==== helper ปิดแถวที่เปิดอยู่ ====
function closeOpenRow() {
  if (currentlyOpenRow) {
    const c = currentlyOpenRow.querySelector('.row-content');
    currentlyOpenRow.classList.remove('show-actions');
    c.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1)';
    c.style.transform = 'translateX(0)';
    currentlyOpenRow = null;
  }
}

// ==== ฟังก์ชันหลัก ====
function enableSwipe(row, menu) {
  const content = row.querySelector('.row-content');
  const actionBtns = row.querySelector('.action-btns');

  row.classList.remove('show-actions');
  content.style.transform = 'translateX(0)';

  let startX = 0, currentX = 0, dragging = false, pointerId = null;

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.drag-handle')) return; // ให้ SortableJS ทำงาน
    if (e.target.closest('input, button, .menu-qty')) return; // ไม่รบกวน input

    if (currentlyOpenRow && currentlyOpenRow !== row) closeOpenRow();

    pointerId = e.pointerId;
    startX = e.clientX;
    currentX = startX;
    dragging = true;
    content.style.transition = 'none';

    const rect = actionBtns.getBoundingClientRect();
    content._maxTranslate = Math.max(80, Math.round(rect.width || 160));

    row.setPointerCapture?.(pointerId);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    currentX = e.clientX;
    let diff = currentX - startX;
    if (diff > 0) diff = 0; // swipe ได้เฉพาะซ้าย
    const max = content._maxTranslate || 160;
    const translate = Math.max(diff, -max);
    content.style.transform = `translateX(${translate}px)`;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;

    const diff = currentX - startX;
    const threshold = 50;

    content.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1)';

    if (diff < -threshold) {
      row.classList.add('show-actions');
      content.style.transform = `translateX(-${content._maxTranslate}px)`;
      currentlyOpenRow = row;
    } else {
      row.classList.remove('show-actions');
      content.style.transform = 'translateX(0)';
      if (currentlyOpenRow === row) currentlyOpenRow = null;
    }

    try { row.releasePointerCapture?.(pointerId); } catch {}
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
  }

  content.addEventListener('pointerdown', onPointerDown);

  document.addEventListener('click', evt => {
    if (!row.contains(evt.target) && currentlyOpenRow) closeOpenRow();
  }, { capture: true });

  row.querySelector('.edit-btn').addEventListener('click', () => {
    alert(`Edit: ${menu.name}`);
    closeOpenRow();
  });

  row.querySelector('.delete-btn').addEventListener('click', async () => {
    if (confirm(`Delete ${menu.name}?`)) {
      await client.from('menu').delete().eq('id', menu.id);
      row.remove();
    }
    closeOpenRow();
  });
}

// --- Initialization and Event Listeners ---
window.addEventListener('DOMContentLoaded', async () => {
  el('today').textContent = todayText();
  el('billno').value = await getNextBillNo();
  await loadTableName();
  await loadMenu();
  await loadDraft();

  // Button handlers
  el('btnHome').addEventListener('click', async () => {
    if (!table_id) {
      window.location.href = 'index.html';
      return;
    }
    const hasOrder = Array.from(document.querySelectorAll('#menuItems input')).some(inp => safeEval(inp.value) > 0);
    const hasCustomer = el('customer').value.trim() !== '';

    if (hasOrder || hasCustomer) {
      const { data: draftData } = await client.from('drafts').select('id').eq('table_id', table_id).maybeSingle();
      if (!draftData) {
        if (!confirm("You have unsaved data. Do you want to set the table status to 'ว่าง' (empty)?")) {
          return;
        }
        await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
      }
    } else {
      await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
    }
    window.location.href = 'index.html';
  });

  el('btnAddMenu').addEventListener('click', () => {
    el('popup').style.display = 'flex';
  });

  el('btnAddMenuCancel').addEventListener('click', () => {
    el('popup').style.display = 'none';
    el('newMenuName').value = '';
    el('newMenuPrice').value = '';
  });

  el('btnAddMenuConfirm').addEventListener('click', async () => {
    const name = el('newMenuName').value.trim();
    const price = parseFloat(el('newMenuPrice').value);
    if (!name || !price) {
      alert('Please enter a name and price.');
      return;
    }
    try {
      const { data: maxData } = await client.from('menu').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      const nextSortOrder = (maxData && maxData.sort_order !== null) ? maxData.sort_order + 1 : 1;
      const { error } = await client.from('menu').insert([{ name, price, sort_order: nextSortOrder }]);
      if (error) {
        alert('Failed to save.');
        console.error(error);
      } else {
        el('popup').style.display = 'none';
        el('newMenuName').value = '';
        el('newMenuPrice').value = '';
        await loadMenu();
      }
    } catch (err) {
      console.error('Failed to add new menu item:', err);
      alert('An error occurred. Please try again.');
    }
  });

  el('btnPrint').addEventListener('click', () => {
    el('previewContent').innerHTML = buildPreviewView();
    el('previewModal').style.display = 'flex';
  });

  el('btnCancelPreview').addEventListener('click', () => {
    el('previewModal').style.display = 'none';
  });

  el('btnConfirmPrint').addEventListener('click', () => {
    el('previewModal').style.display = 'none';
    saveBill();
  });

  el('btnSave').addEventListener('click', saveDraft);

  el('btnClear').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear this bill?')) return;
    if (table_id) {
      const { error: updateError } = await client.from('tables').update({ status: 'ว่าง' }).eq('id', table_id);
      if (updateError) console.log('Failed to update table status:', updateError);

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
    alert('Bill cleared successfully.');
  });

  el('cash').addEventListener('input', calc);
});

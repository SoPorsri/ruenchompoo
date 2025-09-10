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
function safeEval(expr) {
  if (!expr) return 0;
  expr = String(expr).replace(/\s+/g, '');
  if (!/^[0-9+\-*/.]+$/.test(expr)) return 0;
  try {
    return Function('"use strict";return(' + expr + ')')();
  } catch {
    return 0;
  }
}
function todayText() {
  const d = new Date();
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
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

// --- Load Menu + Init Interactions ---
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

    // ✅ Swipe ทำงานเฉพาะมือถือ
    if (isTouchDevice()) {
      enableSwipe(row, item);
    }
  });

  container.querySelectorAll('.menu-qty').forEach(i => i.addEventListener('input', calc));

  if (sortableInstance) {
    try { sortableInstance.destroy(); } catch {}
    sortableInstance = null;
  }

  // ✅ Drag & Drop (ทุกอุปกรณ์)
  if (window.Sortable) {
    sortableInstance = new Sortable(container, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'dragging-ghost',
      filter: '.row-content',
      preventOnFilter: true,
      onEnd: async () => { await saveNewOrder(); }
    });
  } else {
    console.warn('SortableJS not found. Reordering disabled.');
  }

  closeOpenRow();
  return true;
}

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

// --- Swipe Helpers ---
function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}
function closeOpenRow() {
  if (!currentlyOpenRow) return;
  const c = currentlyOpenRow.querySelector('.row-content');
  currentlyOpenRow.classList.remove('show-actions');
  c.style.transition = 'transform .2s ease-out';
  c.style.transform = 'translateX(0)';
  currentlyOpenRow = null;
}
function enableSwipe(row, menu) {
  const content = row.querySelector(".row-content");
  const actionBtns = row.querySelector(".action-btns");
  const dragHandle = row.querySelector(".drag-handle");

  dragHandle.addEventListener("pointerdown", (e) => e.stopPropagation());

  let startX = 0, startY = 0, currentX = 0, dragging = false, pointerId = null;

  function onPointerDown(e) {
    if (e.pointerType === "mouse") return; // ❌ ไม่ใช้ swipe บน mouse
    if (e.target.closest(".drag-handle")) return;
    if (e.target.closest("input, button, .menu-qty")) return;

    if (currentlyOpenRow && currentlyOpenRow !== row) closeOpenRow();

    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    currentX = startX;
    dragging = true;
    content.style.transition = "none";

    const rect = actionBtns.getBoundingClientRect();
    content._maxTranslate = Math.max(80, Math.round(rect.width || 160));

    row.setPointerCapture?.(pointerId);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx)) return;
    currentX = e.clientX;
    let diff = currentX - startX;
    if (Math.abs(diff) < 5) diff = 0;
    if (diff > 0) diff = 0;
    const max = content._maxTranslate || 160;
    const translate = Math.max(diff, -max);
    content.style.transform = `translateX(${translate}px)`;
  }
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    const diff = currentX - startX;
    const threshold = 50;
    content.style.transition = "transform .22s cubic-bezier(.2,.9,.2,1)";
    if (diff < -threshold) {
      row.classList.add("show-actions");
      content.style.transform = `translateX(-${content._maxTranslate}px)`;
      currentlyOpenRow = row;
    } else {
      row.classList.remove("show-actions");
      content.style.transform = "translateX(0)";
      if (currentlyOpenRow === row) currentlyOpenRow = null;
    }
    try { row.releasePointerCapture?.(pointerId); } catch {}
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
  }
  content.addEventListener("pointerdown", onPointerDown);

  document.addEventListener("click", (evt) => {
    if (!row.contains(evt.target) && currentlyOpenRow) closeOpenRow();
  }, { capture: true });

  row.querySelector(".edit-btn").addEventListener("click", () => {
    alert(`Edit: ${menu.name}`);
    closeOpenRow();
  });
  row.querySelector(".delete-btn").addEventListener("click", async () => {
    if (confirm(`Delete ${menu.name}?`)) {
      await client.from("menu").delete().eq("id", menu.id);
      row.remove();
      calc();
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

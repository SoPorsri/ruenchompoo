const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const el = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB' }).format(n||0);
function safeEval(expr){if(!expr)return 0;expr=expr.replace(/\s+/g,'');if(!/^[0-9+\-*/.]+$/.test(expr))return 0;try{return Function('"use strict";return('+expr+')')();}catch{return 0;}}

function todayText(){const d=new Date();return d.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});}
function nextBillNo(){const key='pink-grill-last-bill';let n=parseInt(localStorage.getItem(key)||'0',10)+1;localStorage.setItem(key,String(n));return String(n).padStart(5,'0');}

let menuData = [];
const params = new URLSearchParams(window.location.search);
const table_id = params.get('table_id');

async function loadMenu(){
  const { data, error } = await client.from('menu').select('*').order('sort_order',{ascending:true});
  if(error){alert('โหลดเมนูผิดพลาด');console.log(error);return;}
  menuData = data;
  const container = el('menuItems'); container.innerHTML='';
  data.forEach(item=>{
    const row=document.createElement('div');
    row.className='row grid';
    row.draggable=true;
    row.dataset.id=item.id;
    row.innerHTML=`
      <label>${item.name}</label>
      <div class="right muted">฿${item.price}</div>
      <input class="num" type="text" data-id="${item.id}" placeholder="เช่น 1+2+3">
    `;
    container.appendChild(row);
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('dragleave', handleDragLeave);
    row.addEventListener('drop', handleDrop);
  });
  document.querySelectorAll('#menuItems input').forEach(i=>i.addEventListener('input',calc));
}

let dragSrcId=null;
function handleDragStart(e){dragSrcId=this.dataset.id;e.dataTransfer.effectAllowed='move';}
function handleDragOver(e){e.preventDefault();this.classList.add('drag-over');}
function handleDragLeave(e){this.classList.remove('drag-over');}
async function handleDrop(e){
  e.preventDefault();this.classList.remove('drag-over');
  const dropTargetId=this.dataset.id;
  if(dragSrcId===dropTargetId)return;
  const srcIndex=menuData.findIndex(m=>m.id==dragSrcId);
  const targetIndex=menuData.findIndex(m=>m.id==dropTargetId);
  if(srcIndex<0||targetIndex<0)return;
  const srcItem=menuData[srcIndex];const targetItem=menuData[targetIndex];
  try{
    await client.from('menu').update({sort_order:targetItem.sort_order}).eq('id',srcItem.id);
    await client.from('menu').update({sort_order:srcItem.sort_order}).eq('id',targetItem.id);
    loadMenu();
  }catch(err){console.log('drag drop update error:',err);}
}

function calc(){
  let sum=0;
  menuData.forEach(item=>{
    const inp=document.querySelector(`#menuItems input[data-id="${item.id}"]`);
    if(!inp)return;
    const qty=safeEval(inp.value);
    sum+=item.price*qty;
  });
  el('grand').textContent=fmt(sum);
  const cash=safeEval(el('cash').value);
  const change=cash-sum;
  el('change').value=change>=0?fmt(change):'';
  el('cashWarn').style.display=change<0?'block':'none';
  return sum;
}

async function saveDraft(){
  const items=[];
  menuData.forEach(item=>{
    const qty=safeEval(document.querySelector(`#menuItems input[data-id="${item.id}"]`)?.value);
    if(qty>0)items.push({menu_id:item.id,qty,price:item.price});
  });
  const draft={table_id,customer:el('customer').value,items,note:el('note').value};
  await client.from('drafts').upsert(draft,{onConflict:'table_id'});
  alert('บันทึกฉบับร่างแล้ว');
}

async function saveBill(){
  const items=[];
  menuData.forEach(item=>{
    const qty=safeEval(document.querySelector(`#menuItems input[data-id="${item.id}"]`)?.value);
    if(qty>0)items.push({menu_id:item.id,qty,price:item.price});
  });
  const bill={
    bill_no:el('billno').value,
    customer:el('customer').value,
    total:calc(),
    cash:safeEval(el('cash').value),
    change:safeEval(el('change').value),
    note:el('note').value,
    items,
    created_at:new Date()
  };
  await client.from('bills').insert(bill);
  // บันทึกบิล
  const { data, error } = await client.from('bills').insert(bill).select().single();
  if (table_id) await client.from('drafts').delete().eq('table_id', table_id);
  
  // ถ้าบันทึกสำเร็จ → ไปหน้า printbill.html พร้อมส่ง bill_no
  if (!error && data) {
    window.location.href = `printbill.html?bill_no=${data.bill_no}`;
  } else {
    alert('เกิดข้อผิดพลาดในการบันทึกบิล');
    console.log(error);
  }
}

el('btnSave').onclick=saveDraft;
el('btnClear').onclick=()=>{if(confirm('แน่ใจ?')){document.querySelectorAll('#menuItems input').forEach(i=>i.value='');el('customer').value='';el('cash').value='';el('note').value='';calc();}};
el('btnCheckout').onclick=()=>{el('sumTotal').textContent=el('grand').textContent;el('sumCash').textContent=fmt(safeEval(el('cash').value));el('sumChange').textContent=el('change').value;el('popupCheckout').style.display='flex';};
el('btnCancelCheckout').onclick=()=>el('popupCheckout').style.display='none';
el('btnConfirmCheckout').onclick = async () => {
  const items=[];
  menuData.forEach(item=>{
    const qty=safeEval(document.querySelector(`#menuItems input[data-id="${item.id}"]`)?.value);
    if(qty>0)items.push({menu_id:item.id,qty,price:item.price});
  });

  const bill={
    bill_no:el('billno').value,
    customer:el('customer').value,
    total:calc(),
    cash:safeEval(el('cash').value),
    change:safeEval(el('change').value),
    note:el('note').value,
    items,
    created_at:new Date()
  };

  const { data, error } = await client.from('bills').insert(bill).select().single();
  if (table_id) await client.from('drafts').delete().eq('table_id', table_id);

  if (!error && data) {
    // ✅ ไปหน้า printbill.html พร้อม bill_no
    window.location.href = `printbill.html?bill_no=${data.bill_no}`;
  } else {
    alert('เกิดข้อผิดพลาดในการบันทึกบิล');
    console.log(error);
  }
};

el('btnAddMenu').onclick=()=>{el('popup').style.display='flex';};
el('btnAddMenuCancel').onclick=()=>{el('popup').style.display='none';};
el('btnAddMenuConfirm').onclick=async()=>{const name=el('newMenuName').value.trim();const price=parseFloat(el('newMenuPrice').value);if(!name||!price)return;await client.from('menu').insert({name,price,sort_order:menuData.length+1});el('popup').style.display='none';el('newMenuName').value='';el('newMenuPrice').value='';loadMenu();};

el('btnHome').addEventListener('click', async () => {
  if (table_id) {
    const { data: draftData } = await client.from('drafts').select('id').eq('table_id', table_id).single();
    const hasUnsavedData = Array.from(document.querySelectorAll('#menuItems input')).some(inp => safeEval(inp.value) > 0) || el('customer').value.trim() !== '';
    if (!draftData && hasUnsavedData) {
      if (!confirm('คุณยังไม่ได้บันทึกข้อมูล ต้องการกลับหน้าแรกจริงหรือไม่?')) return;
      document.querySelectorAll('#menuItems input').forEach(i => i.value = '');
      el('customer').value = '';
      el('cash').value = '';
      el('note').value = '';
      el('change').value = '';
      el('grand').textContent = '฿0.00';
    }
  }
  window.location.href = 'index.html';
});

window.onload = async () => {
  const params = new URLSearchParams(window.location.search);
  const bill_no = params.get("bill_no");

  if (bill_no) {
    const { data, error } = await client.from("bills").select("*").eq("bill_no", bill_no).single();
    if (!error && data) {
      document.getElementById("billContent").innerText = JSON.stringify(data, null, 2);
      window.print();
      // เสร็จแล้วกลับไป index.html
      window.onafterprint = () => window.location.href = "index.html";
    }
  }
};

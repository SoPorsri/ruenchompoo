function enableSwipe(row, menu) {
  const content = row.querySelector('.row-content');
  const handle = row.querySelector('.drag-handle');
  const actionBtns = row.querySelector('.action-btns');

  // เริ่มต้นปิด
  row.classList.remove('show-actions');
  content.style.transform = 'translateX(0)';
  content.style.transition = '';

  let startX = 0;
  let currentX = 0;
  let dragging = false;
  let pointerId = null;

  const getMax = () => (actionBtns ? actionBtns.offsetWidth || 160 : 160);

  function closeRow(r = row) {
    const c = r.querySelector('.row-content');
    r.classList.remove('show-actions');
    c.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1)';
    c.style.transform = 'translateX(0)';
    if (currentlyOpenRow === r) currentlyOpenRow = null;
  }

  function openRow(r = row) {
    const c = r.querySelector('.row-content');
    const max = getMax();
    r.classList.add('show-actions');
    c.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1)';
    c.style.transform = `translateX(-${max}px)`;
    currentlyOpenRow = r;
  }

  function onPointerDown(e) {
    // mouse ต้องเป็นปุ่มซ้ายเท่านั้น
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // ถ้าเริ่มต้นจาก drag handle -> ให้ Sortable/drag handle จัดการ (ไม่เริ่ม swipe)
    if (e.target.closest('.drag-handle')) return;

    // ถ้าเริ่มจาก input/button -> ไม่ใช่ swipe
    if (e.target.closest('input,button')) return;

    // ตั้งค่าเริ่มต้น swipe
    pointerId = e.pointerId;
    startX = e.clientX;
    currentX = startX;
    dragging = true;
    content.style.transition = 'none';

    // ปิด row ที่เปิดอยู่ตัวอื่น (ถ้ามี)
    if (currentlyOpenRow && currentlyOpenRow !== row) closeRow(currentlyOpenRow);

    // ใช้ pointer capture เพื่อให้รับ move/up แม้อยู่นอก element
    try { content.setPointerCapture(pointerId); } catch (_) {}

    // ฟังเหตุการณ์บน document เพื่อความแน่นอน
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    currentX = e.clientX;
    let diff = currentX - startX;
    // ยอมให้เลื่อนเฉพาะทางซ้าย (negative)
    if (diff > 0) diff = 0;
    const max = getMax();
    const translate = Math.max(diff, -max);
    content.style.transform = `translateX(${translate}px)`;
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const diff = currentX - startX;
    const max = getMax();
    const threshold = Math.round(max * 0.35); // ถ้าปัดเกิน 35% จะเปิด
    content.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1)';

    if (diff < -threshold) {
      openRow(row);
    } else {
      closeRow(row);
    }

    try { content.releasePointerCapture && content.releasePointerCapture(pointerId); } catch (_) {}
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
  }

  // ฟัง pointerdown บน content (จะได้รับ event ที่ target ใด ๆ ภายใน content)
  content.addEventListener('pointerdown', onPointerDown, { passive: false });

  // ป้องกันไม่ให้คลิกที่ปุ่ม action ถูกฟังเป็นการปิด row (เมื่อกดปุ่มจริงๆ)
  if (actionBtns) {
    actionBtns.addEventListener('click', (ev) => {
      ev.stopPropagation();
    });
  }

  // ปุ่มแก้ไข
  const editBtn = row.querySelector('.edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const popup = document.getElementById('popup');
      const nameInput = document.getElementById('newMenuName');
      const priceInput = document.getElementById('newMenuPrice');

      nameInput.value = menu.name;
      priceInput.value = menu.price;
      popup.style.display = 'flex';

      // ป้องกัน handler ซ้ำ
      const confirmBtn = document.getElementById('btnAddMenuConfirm');
      const newConfirm = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

      newConfirm.addEventListener('click', async () => {
        const newName = nameInput.value.trim();
        const newPrice = parseFloat(priceInput.value) || 0;
        if (!newName || !newPrice) { alert("กรุณากรอกชื่อและราคา"); return; }
        await client.from("menu").update({ name: newName, price: newPrice }).eq("id", menu.id);
        popup.style.display = 'none';
        await loadMenu();
      });
    });
  }

  // ปุ่มลบ
  const deleteBtn = row.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm("ลบเมนูนี้ใช่ไหม?")) return;
      const { error } = await client.from('menu').delete().eq('id', menu.id);
      if (error) { alert('ลบเมนูผิดพลาด'); console.error(error); return; }
      row.remove();
      await saveNewOrder();
    });
  }

  // คลิกนอก row -> ปิด row ที่เปิดอยู่
  document.addEventListener('click', (evt) => {
    if (!row.contains(evt.target) && currentlyOpenRow) {
      closeRow(currentlyOpenRow);
    }
  }, { capture: true });
}

// script.js
document.addEventListener("DOMContentLoaded", () => {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const usbRadio = document.querySelector('input[name="printType"][value="USB"]');
    const wifiRadio = document.querySelector('input[name="printType"][value="WIFI"]');
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
        wifiRadio.checked = true;
    } else {
        usbRadio.checked = true;
    }
    const menu = [
        { name: "กิโล(กลับบ้าน)", price: 220 },
        { name: "ขีด(กลับบ้าน)", price: 22 },
        { name: "น้ำจิ้ม", price: 40 },
        { name: "วุ้นเส้น(ร้าน)", price: 20 },
        { name: "วุ้นเส้นถุง(ใหญ่)", price: 20 },
        { name: "วุ้นเส้นถุง(เล็ก)", price: 10 },
        { name: "เห็ดเข็ม(ถุง)", price: 20 },
        { name: "ข้าวโพด", price: 10 }
    ];
    const menuDiv = document.getElementById("menuItems");
    const grand = document.getElementById("grand");
    const cash = document.getElementById("cash");
    cash.readOnly = true;
    const change = document.getElementById("change");
    const today = document.getElementById("today");
    const previewModal = document.getElementById("previewModal");
    today.textContent = new Date().toLocaleDateString('th-TH', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
    });
    // โหลดจาก localStorage ถ้ามี
    let qtys = JSON.parse(localStorage.getItem("takehomeQtys") || "{}");
    // Render เมนู
    menuDiv.innerHTML = menu.map((m, i) => `
        <div class="menu-item">
            <div class="item-name">${m.name}</div>
            <div class="item-price text-right">${m.price ? m.price.toLocaleString('th-TH') : "-"}</div>
            <input type="text" readonly min="0" step="1" id="qty${i}" class="menu-qty" value="${qtys[i] || ""}"> 
        </div>
    `).join("");
    
    function evaluateExpression(expr) {
        if (!expr || typeof expr !== 'string') {
            return 0;
        }
        try {
            const result = new Function('return ' + expr)();
            return isNaN(result) ? 0 : result;
        } catch (e) {
            console.error("Invalid expression:", expr);
            return 0;
        }
    }
    function calc() {
        let total = 0;
        qtys = {};
        menu.forEach((m, i) => {
            const rawValue = document.getElementById("qty" + i).value || '0';
            const q = evaluateExpression(rawValue);
            qtys[i] = q;
            if (!isNaN(q)) {
                 total += q * m.price;
            }
        });
        grand.textContent = "฿" + total.toLocaleString('th-TH', { maximumFractionDigits: 2 }); // ปรับให้แสดงทศนิยมได้
        localStorage.setItem("takehomeQtys", JSON.stringify(qtys));
        const rawCashValue = cash.value.replace(/,/g, '') || '0';
        const cashValue = evaluateExpression(rawCashValue);
        const changeValue = cashValue - total;
        if (!isNaN(changeValue)) {
            change.value = changeValue >= 0 ? changeValue.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : "ไม่พอ!";
        } else {
            change.value = '';
        }
        if (cash.value !== '') {
            const displayCash = parseFloat(cash.value.replace(/,/g, '')) || 0;
            cash.value = displayCash.toLocaleString('th-TH', { maximumFractionDigits: 0 });
        }
    }
    menu.forEach((m, i) => {
        const qtyInput = document.getElementById("qty" + i);
        qtyInput.addEventListener("input", calc);
        qtyInput.addEventListener("click", () => {
            openCustomKeypad(qtyInput);
        });
    });
    cash.addEventListener("input", calc);
    cash.addEventListener("click", () => {
        openCustomKeypad(cash);
    });
    calc();
    
    document.getElementById("btnPrint").addEventListener("click", () => {
        previewModal.style.display = "flex";
        let html = `
            <table style='width:100%;font-size:14px;border-collapse:collapse; text-align:right;'>
                <thead>
                    <tr><th style="text-align:left;">สินค้า</th><th>จำนวน</th><th>รวม (฿)</th></tr>
                </thead>
                <tbody>`;
        let total = 0;
        menu.forEach((m, i) => {
            const q = qtys[i] || 0;
            if (q > 0) {
                const subtotal = q * m.price;
                total += subtotal;
                html += `<tr>
                            <td style="text-align:left;">${m.name}</td>
                            <td>${q}</td>
                            <td>${subtotal.toLocaleString('th-TH')}</td>
                         </tr>`;
            }
        });
        html += `</tbody></table>
                 <hr>
                 <div class="total-preview">**ยอดรวมสุทธิ:** **${grand.textContent}**</div>`;
        document.getElementById("previewContent").innerHTML = html;
    });
    document.getElementById("btnCancelPreview").addEventListener("click", () => {
        previewModal.style.display = "none";
    });
    document.getElementById("btnConfirmPrint").addEventListener("click", () => {
        const type = document.querySelector('input[name="printType"]:checked').value;
        previewModal.style.display = "none";
        localStorage.setItem("takehomeCash", cash.value || 0);
        localStorage.setItem("takehomeChange", change.value.replace(/,/g,'') || 0);
        if (type === "USB") {
            window.open('takehomePrint.html', '_blank');
        } else if (type === "WIFI") {
            window.open('takehomePOS.html', '_blank');
        }
    });
    /*===========Custom Keypad=========*/
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
      closeBtn.className = "close-keypad-btn";
      closeBtn.innerHTML = "&#x2328;"; // ใช้สัญลักษณ์คีย์บอร์ด
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeCustomKeypad();
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
            e.target.id !== 'cash' && // 
            !e.target.closest('#customKeypad')) {
          closeCustomKeypad();
        }
    });

    document.getElementById("btnClear").addEventListener("click", () => {
        localStorage.removeItem("takehomeQtys");
        localStorage.removeItem("takehomeCash");
        localStorage.removeItem("takehomeChange");
        alert("ล้างข้อมูลเรียบร้อยแล้ว");
        location.reload();
    });

    const cashInput = document.getElementById('cash');
    const container = document.querySelector('.container');
    if (cashInput && container) {
      cashInput.addEventListener('focus', () => {
        container.style.paddingBottom = '250px';
        setTimeout(() => {
          cashInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      });
    
      cashInput.addEventListener('blur', () => {
        container.style.paddingBottom = '0';
      });
    }

    
    document.getElementById("btnHome").addEventListener("click", () => window.location.href = "index.html");
    previewModal.style.display = "none"; // เริ่มต้น modal ปิด
});

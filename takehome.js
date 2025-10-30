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
        { name: "กิโล (กลับบ้าน)", price: 220 },
        { name: "ขีด (กลับบ้าน)", price: 22 },
        { name: "น้ำจิ้ม", price: 40 },
        { name: "วุ้นเส้น (ร้าน)", price: 20 },
        { name: "วุ้นเส้นถุง (ใหญ่)", price: 20 },
        { name: "วุ้นเส้นถุง (เล็ก)", price: 10 },
        { name: "เห็ดเข็ม (ถุง)", price: 20 },
        { name: "ข้าวโพด", price: 10 }
    ];

    const menuDiv = document.getElementById("menuItems");
    const grand = document.getElementById("grand");
    const cash = document.getElementById("cash");
    const change = document.getElementById("change");
    const today = document.getElementById("today");
    
    // ตั้งค่าวันที่ปัจจุบัน
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
            <input type="number" min="0" step="1" id="qty${i}" value="${qtys[i] || 0}">
        </div>
    `).join("");

    // ฟังก์ชันคำนวณยอดรวมและเงินทอน
    function calc() {
        let total = 0;
        qtys = {};
        menu.forEach((m, i) => {
            const q = parseFloat(document.getElementById("qty" + i).value || 0);
            qtys[i] = q;
            total += q * m.price;
        });
        
        // แสดงยอดรวม
        grand.textContent = "฿" + total.toLocaleString('th-TH', { maximumFractionDigits: 0 });
        localStorage.setItem("takehomeQtys", JSON.stringify(qtys));
        
        // คำนวณเงินทอน
        const c = parseFloat(cash.value.replace(/,/g, '') || 0);
        let changeValue = c > 0 ? (c - total) : NaN;

        // ฟอร์แมตและแสดงเงินทอน
        if (!isNaN(changeValue) && changeValue >= 0) {
            change.value = changeValue.toLocaleString('th-TH', { maximumFractionDigits: 0 });
        } else if (changeValue < 0) {
            change.value = "ไม่พอ!"; // แสดงสถานะเงินไม่พอ
        } else {
            change.value = '';
        }

        // ฟอร์แมตช่องรับเงิน (เพื่อให้มี , เมื่อพิมพ์)
        if (cash.value !== '') {
            const currentCash = parseFloat(cash.value.replace(/,/g, '') || 0);
            if (!isNaN(currentCash)) {
                cash.value = currentCash.toLocaleString('th-TH', { maximumFractionDigits: 0 });
            }
        }
    }

    // ผูก Event Listeners
    menu.forEach((m, i) => document.getElementById("qty" + i).addEventListener("input", calc));
    cash.addEventListener("input", calc); // ใช้ input สำหรับรับเงิน
    calc(); // รันครั้งแรกเมื่อโหลด

    // --- การจัดการ Popup พิมพ์บิล ---
    document.getElementById("btnPrint").addEventListener("click", () => {
        document.getElementById("previewModal").style.display = "flex";
        
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
        document.getElementById("previewModal").style.display = "none";
    });

    document.getElementById("btnConfirmPrint").addEventListener("click", () => {
        const type = document.querySelector('input[name="printType"]:checked').value;
        document.getElementById("previewModal").style.display = "none";
        
        // ล้างจำนวนหลังจากพิมพ์ (เป็นทางเลือกที่ดีสำหรับการใช้งานจริง)
        localStorage.removeItem("takehomeQtys"); 
        
        if (type === "USB") {
            window.open('takehomePrint.html', '_blank'); // คอมพิวเตอร์
        } else if (type === "WIFI") {
            window.open('takehomePOS.html', '_blank');   // สมาร์ทโฟน
        }
    });
    
    // ปุ่มกลับหน้าหลัก
    document.getElementById("btnHome").addEventListener("click", () => window.location.href = "index.html");
});

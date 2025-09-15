import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
const client = createClient(SUPABASE_URL, SUPABASE_KEY);

const tables = [
    { id: 1, name: "ซุ้ม1" }, { id: 2, name: "ซุ้ม2" }, { id: 3, name: "ซุ้ม3" }, { id: 4, name: "ซุ้ม4" },
    { id: 5, name: "ซุ้ม5" }, { id: 6, name: "ซุ้ม6" }, { id: 7, name: "ซุ้ม7" }, { id: 8, name: "ซุ้ม8" },
    { id: 9, name: "ซุ้ม9" }, { id: 10, name: "ซุ้ม10" }, { id: 11, name: "A1" }, { id: 12, name: "A2" },
    { id: 13, name: "A3" }, { id: 14, name: "A4" }, { id: 15, name: "A5" }, { id: 16, name: "A6" },
    { id: 17, name: "A7" }, { id: 18, name: "A8" }, { id: 19, name: "B1" }, { id: 20, name: "B2" },
    { id: 21, name: "B3" }, { id: 22, name: "B4" }
];

async function ensureTablesExist() {
    const { data: dbTables, error } = await client.from('tables').select('id');
    if (error) { console.error(error); return; }
    const existingIds = dbTables.map(t => t.id);
    const missing = tables.filter(t => !existingIds.includes(t.id));

    if (missing.length > 0) {
        console.log("Insert missing tables:", missing);
        const { data, error: upsertError } = await client.from('tables').upsert(
            missing.map(m => ({ id: m.id, name: m.name, status: "ว่าง" }))
        );
        if (upsertError) {
            console.error("Upsert error:", upsertError);
        } else {
            console.log("Upsert success:", data);
        }
    }
}

async function loadTables() {
    const { data, error } = await client.from('tables').select('id,status');
    if (error) { console.error(error); return; }

    tables.forEach(t => {
        const div = document.getElementById("table-" + t.name);
        if (!div) return;

        const record = data.find(d => d.id === t.id);
        const status = record ? record.status : "ว่าง";

        div.className = 'table-card ' + (status === 'ว่าง' ? 'free' : 'busy');
        div.innerHTML = '';

        const icon = document.createElement('i');
        icon.className = status === 'ว่าง'
            ? 'fa-solid fa-circle-check status-icon free'
            : 'fa-solid fa-circle-xmark status-icon busy';

        const label = document.createElement('span');
        label.textContent = `${t.name} (${status})`;

        div.appendChild(icon);
        div.appendChild(label);

        div.onclick = async () => {
            if (status === 'ว่าง') {
                const { error: updateError } = await client.from('tables')
                    .update({ status: 'ไม่ว่าง' })
                    .eq('id', t.id);
                if (updateError) {
                    console.error(updateError);
                    alert('อัปเดตสถานะโต๊ะผิดพลาด');
                    return;
                }
            }
            window.location.href = `bill.html?table_id=${t.id}`;
        };
    });
}

let salesChart;

function openReport() {
    document.getElementById('reportModal').style.display = 'flex';
    loadSalesSummary();
    loadSalesChart('daily');
}
function closeReport() {
    document.getElementById('reportModal').style.display = 'none';
}

function toggleHistory() {
    const section = document.getElementById('historySection');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        loadSalesHistory();
    } else {
        section.style.display = 'none';
    }
}

function reprintBill(billId) {
    window.open(`printbill.html?bill_id=${billId}`, '_blank');
}

function openPOS(billId) {
    window.open(`printPOS.html?bill_id=${billId}`, '_blank');
}

async function loadSalesSummary() {
    const { data: daily } = await client.rpc('get_daily_sales');
    const { data: monthly } = await client.rpc('get_monthly_sales');
    const { data: yearly } = await client.rpc('get_yearly_sales');

    document.getElementById('dailySales').textContent =
        (daily?.[0]?.total_sales || 0).toLocaleString("th-TH");
    document.getElementById('monthlySales').textContent =
        (monthly?.[0]?.total_sales || 0).toLocaleString("th-TH");
    document.getElementById('yearlySales').textContent =
        (yearly?.[0]?.total_sales || 0).toLocaleString("th-TH");
}

async function loadSalesChart(mode = 'daily') {
    let fromDate;
    if (mode === 'daily') {
        fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (mode === 'monthly') {
        fromDate = new Date(new Date().getFullYear(), 0, 1);
    } else {
        fromDate = new Date(new Date().getFullYear() - 4, 0, 1);
    }

    const { data, error } = await client
        .from('bills')
        .select('closed_at,total')
        .eq('status', 'closed')
        .gte('closed_at', fromDate.toISOString())
        .order('closed_at', { ascending: true });

    if (error) { console.error(error); return; }

    const grouped = {};
    data.forEach(b => {
        const d = new Date(b.closed_at);
        let key;
        if (mode === 'daily') key = d.toLocaleDateString('th-TH');
        if (mode === 'monthly') key = d.toLocaleString('th-TH', { year: 'numeric', month: 'short' });
        if (mode === 'yearly') key = d.getFullYear();
        grouped[key] = (grouped[key] || 0) + Number(b.total);
    });

    const labels = Object.keys(grouped);
    const totals = Object.values(grouped);

    const ctx = document.getElementById('salesChart').getContext('2d');
    if (salesChart) salesChart.destroy();

    salesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'ยอดขาย (บาท)',
                data: totals,
                backgroundColor:
                    mode === 'daily' ? '#24d67a' :
                        mode === 'monthly' ? '#19d3d3' : '#3b82f6'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.raw.toLocaleString("th-TH") + " บาท";
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value.toLocaleString("th-TH");
                        }
                    }
                }
            }
        }
    });
}

async function loadSalesHistory() {
    const { data, error } = await client
        .from('bills')
        .select('*')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(20);

    const tbody = document.getElementById('salesHistory');
    tbody.innerHTML = '';
    if (!error && data) {
        data.forEach(bill => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${bill.billno}</td>
                <td>${bill.customer || '-'}</td>
                <td>${Number(bill.total).toLocaleString("th-TH")}</td>
                <td>${bill.created_at ? new Date(bill.created_at).toLocaleString('th-TH') : '-'}</td>
                <td>${bill.closed_at ? new Date(bill.closed_at).toLocaleString('th-TH') : '-'}</td>
                <td>
                    <button onclick="reprintBill(${bill.id})" class="btn-history-print">
                        <i class="fa-solid fa-print"></i> พิมพ์บิล
                    </button>
                </td>
                <td>
                    <button onclick="openPOS(${bill.id})" class="btn-history-pos">
                        <i class="fa-solid fa-receipt"></i> ESC/POS
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}


async function exportToExcel() {
    const { data, error } = await client
        .from('bills')
        .select('*')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });

    if (error) {
        alert("ไม่สามารถดึงข้อมูลได้");
        return;
    }

    const exportData = data.map(bill => ({
        เลขบิล: bill.billno,
        ลูกค้า_โต๊ะ: bill.customer || '-',
        ยอดรวม: Number(bill.total).toLocaleString("th-TH"),
        เวลาเปิดบิล: bill.created_at ? new Date(bill.created_at).toLocaleString('th-TH') : '-',
        เวลาปิดบิล: bill.closed_at ? new Date(bill.closed_at).toLocaleString('th-TH') : '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SalesHistory");

    XLSX.writeFile(wb, "sales_history.xlsx");
}

function openIpModal() {
    const modal = document.getElementById('ipModal');
    const input = document.getElementById('printerIpInput');
    const currentIP = localStorage.getItem('PRINTER_IP') || '192.168.1.100';
    input.value = currentIP;
    modal.style.display = 'flex';
}

function closeIpModal() {
    document.getElementById('ipModal').style.display = 'none';
}

function saveIp() {
    const input = document.getElementById('printerIpInput');
    const ip = input.value.trim();
    if (ip === '') {
        localStorage.removeItem('PRINTER_IP');
        alert('ลบค่า IP แล้ว จะกลับไปใช้ค่าเริ่มต้น 192.168.1.100');
    } else if (!validateIPv4(ip)) {
        alert('รูปแบบ IP ไม่ถูกต้อง กรุณาใส่ IPv4 เช่น 192.168.1.100');
        return;
    } else {
        localStorage.setItem('PRINTER_IP', ip);
        alert('บันทึก IP เรียบร้อย: ' + ip);
    }
    updateIpLabel();
    closeIpModal();
}

function validateIPv4(ip) {
    const re = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
    return re.test(ip);
}

function updateIpLabel() {
    const label = document.getElementById('ipLabel');
    const ip = localStorage.getItem('PRINTER_IP') || '192.168.1.100';
    if (label) label.textContent = ip;
}

window.addEventListener('DOMContentLoaded', () => {
    updateIpLabel();
    (async () => {
        await ensureTablesExist();
        await loadTables();
    })();

    client.channel('tables-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, payload => {
            console.log('change detected', payload);
            loadTables();
        })
        .subscribe();
});

document.addEventListener('DOMContentLoaded', async () => {
  const SUPABASE_URL = 'https://pklvscffpbapogezoxyn.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHZzY2ZmcGJhcG9nZXpveHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NTIxNTYsImV4cCI6MjA2NTEyODE1Nn0.O0cXyJAo0qdbNZsLqK1zpo1lS1H1mrudaGz2VaEQQaM';
  const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const tables = [
    { id:1,name:"ซุ้ม1"},{id:2,name:"ซุ้ม2"},/*...*/ {id:22,name:"B4"}
  ];

  // Set IP
  const ipBtn = document.getElementById('setIpBtn');
  ipBtn.addEventListener('click', openIpModal);

  // Event delegation โต๊ะ
  const tablesDiv = document.getElementById('tables');
  tablesDiv.addEventListener('click', async (e)=>{
    const div = e.target.closest('.table-card');
    if(!div) return;
    const tableName = div.id.replace('table-','');
    const table = tables.find(t=>t.name===tableName);
    if(!table) return;
    // update status
    const { error } = await client.from('tables').update({status:'ไม่ว่าง'}).eq('id',table.id);
    if(error) console.error(error);
    window.location.href=`bill.html?table_id=${table.id}`;
  });

  // Lazy load sales chart/history
  document.getElementById('reportButton').addEventListener('click', ()=>{
    document.getElementById('reportModal').style.display='flex';
    loadSalesSummary();
    loadSalesChart('daily');
  });

  // เรียก ensureTablesExist & loadTables
  await ensureTablesExist(client, tables);
  await loadTables(client, tables);
});

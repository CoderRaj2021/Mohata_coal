// Fetch JSON Data from the HTML
const historyDataEl = document.getElementById('workerHistoryJson');
const historyData = historyDataEl && historyDataEl.textContent.trim() ? JSON.parse(historyDataEl.textContent) : {};

const userRoleEl = document.getElementById('currentUserRoleJson');
const currentUserRole = userRoleEl ? JSON.parse(userRoleEl.textContent || '""') : "";

let activeWorkerNameForPrint = ""; 
let currentProfWorker = ""; 

// Initial setup
document.addEventListener("DOMContentLoaded", function() {
    let joinDateInput = document.getElementById('joinDateInput');
    if(joinDateInput) {
        joinDateInput.valueAsDate = new Date();
    }
});

// Sidebar Toggle for Mobile
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

// Worker Management Modals
function openAddModal() { 
    document.getElementById('addModal').style.display = 'flex'; 
}

function closeAddModal() { 
    document.getElementById('addModal').style.display = 'none'; 
}

function openEditModal(id, name, phone, department, joiningDate, address) {
    document.getElementById('editWorkerId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editPhone').value = phone === 'None' ? '' : phone;
    document.getElementById('editDepartment').value = department;
    document.getElementById('editJoiningDate').value = joiningDate;
    document.getElementById('editAddress').value = address === 'None' ? '' : address;
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() { 
    document.getElementById('editModal').style.display = 'none'; 
}

// Profile & History Modal Logic
function openProfileModal(workerName) {
    currentProfWorker = workerName;
    activeWorkerNameForPrint = workerName;
    
    document.getElementById('profTitle').innerHTML = `
        Worker Profile: ${workerName}
        <div class="prof-title-actions" style="display: flex; gap: 10px;">
            <button type="button" onclick="exportWorkerTabToExcel()" style="background:#27ae60; color:white; border:none; padding:5px 12px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">📊 Export Excel</button>
            <button type="button" onclick="printWorkerTab()" style="background:#2980b9; color:white; border:none; padding:5px 12px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🖨️ Print Tab</button>
        </div>
    `;
    
    document.getElementById('profStartDate').value = '';
    document.getElementById('profEndDate').value = '';
    
    renderWorkerData(workerName, null, null);
    
    document.querySelectorAll('.prof-tab-btn')[0].click();
    document.getElementById('profileModal').style.display = 'flex';
}

function applyWorkerFilter() {
    let start = document.getElementById('profStartDate').value;
    let end = document.getElementById('profEndDate').value;
    if(start && end) {
        renderWorkerData(currentProfWorker, start, end);
    } else {
        alert("Please select both start and end dates.");
    }
}

function clearWorkerFilter() {
    document.getElementById('profStartDate').value = '';
    document.getElementById('profEndDate').value = '';
    renderWorkerData(currentProfWorker, null, null);
}

function renderWorkerData(workerName, startStr, endStr) {
    const detailsCont = document.getElementById('detailsContainer');
    const perfCont = document.getElementById('perfContainer');
    const assetCont = document.getElementById('assetsContainer');
    const cashCont = document.getElementById('cashContainer');
    
    detailsCont.innerHTML = ''; perfCont.innerHTML = ''; assetCont.innerHTML = ''; cashCont.innerHTML = '';

    const data = historyData[workerName];
    
    let start = startStr ? new Date(startStr + "T00:00:00") : null;
    let end = endStr ? new Date(endStr + "T23:59:59") : null;
    
    function isWithinRange(dateString) {
        if(!start || !end) return true;
        let d = new Date(dateString.replace(' ', 'T'));
        return d >= start && d <= end;
    }
    
    // 1. Personal Details
    if(data && data.details) {
        let isAdminOrRM = currentUserRole.includes('Admin') || currentUserRole.includes('RM');
        let idBtn, cvBtn, editBtnRow = '';

        if (isAdminOrRM) {
            idBtn = data.details.id_proof ? `<button onclick="window.open('/${data.details.id_proof}', '_blank')" class="btn-view">👁 View/Print ID</button>` : `<span style="color:#999; font-size:12px; font-style:italic;">Not uploaded</span>`;
            cvBtn = data.details.cv ? `<button onclick="window.open('/${data.details.cv}', '_blank')" class="btn-view">👁️ View/Print CV</button>` : `<span style="color:#999; font-size:12px; font-style:italic;">Not uploaded</span>`;
            
            // Format address and data for edit button safely
            let safeName = (data.details.name || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
            let safePhone = (data.details.phone && data.details.phone !== 'None' ? data.details.phone : '').replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
            let safeDept = (data.details.department || 'General').replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
            let safeDate = (data.details.joining_date || '');
            let rawAddress = (data.details.address && data.details.address !== 'None' ? data.details.address : '');
            let safeAddress = rawAddress.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\r?\n/g, "\\n");

            editBtnRow = `
                <tr>
                    <td colspan="2" style="text-align: right; padding-top: 15px; border-bottom: none;">
                        <button type="button" class="btn-edit" style="font-size: 13px; padding: 8px 15px; background: #f39c12; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" onclick="closeProfileModal(); openEditModal('${data.details.id}', '${safeName}', '${safePhone}', '${safeDept}', '${safeDate}', '${safeAddress}')">✏️ Edit Details</button>
                    </td>
                </tr>
            `;
        } else {
            idBtn = data.details.id_proof ? `<span style="color:#e74c3c; font-size:12px; font-weight:bold;">🔒 Restricted Access</span>` : `<span style="color:#999; font-size:12px; font-style:italic;">Not uploaded</span>`;
            cvBtn = data.details.cv ? `<span style="color:#e74c3c; font-size:12px; font-weight:bold;">🔒 Restricted Access</span>` : `<span style="color:#999; font-size:12px; font-style:italic;">Not uploaded</span>`;
        }

        detailsCont.innerHTML = `
            <table class="details-table" id="personalTableData">
                <tr><td>Name:</td><td>${data.details.name}</td></tr>
                <tr><td>Phone:</td><td>${data.details.phone || 'N/A'}</td></tr>
                <tr><td>Address:</td><td style="white-space: pre-line;">${data.details.address || 'N/A'}</td></tr>
                <tr><td>Department:</td><td>${data.details.department || 'N/A'}</td></tr>
                <tr><td>Joining Date:</td><td>${data.details.joining_date}</td></tr>
                <tr><td>ID Proof:</td><td>${idBtn}</td></tr>
                <tr><td>CV / Resume:</td><td>${cvBtn}</td></tr>
                ${editBtnRow}
            </table>
        `;
    }

    // 2. Production & Quality Log
    if(data && data.performance) {
        let perfItems = data.performance.filter(p => isWithinRange(p.timestamp));
        if(perfItems.length > 0) {
            let perfHtml = '';
            perfItems.forEach(p => {
                let typeBadge = p.type === 'Scrap Generated' 
                    ? `<span class="perf-type-scrap">⚙️ Scrap Log</span>` 
                    : `<span class="perf-type-action">📋 Action</span>`;
                    
                let batchInfo = `<strong>${p.batch_no}</strong><br><small style="color:#7f8c8d;">${p.client} | Inv:${p.invoice}</small>`;
                let axleInfo = `<span style="color:#2980b9; font-weight:bold;">Axle: ${p.axle_no}</span><br><small style="color:#7f8c8d;">[${p.stage}]</small>`;
                let scrapKg = p.scrap_weight !== '-' ? `<span style="font-weight:bold; color:#d35400;">${p.scrap_weight}</span>` : '-';
                
                perfHtml += `
                    <tr>
                        <td><small style="color:#7f8c8d;">${p.timestamp}</small><br>${typeBadge}</td>
                        <td>${batchInfo}</td>
                        <td>${axleInfo}</td>
                        <td style="text-align:center;">${scrapKg}</td>
                        <td>${p.details}</td>
                    </tr>
                `;
            });
            perfCont.innerHTML = perfHtml;
        } else {
            perfCont.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#95a5a6;">No production or scrap logs found for this period.</td></tr>`;
        }
    }

    // 3. Assets Tab
    if(data && data.assets) {
        let assetItems = data.assets.filter(a => isWithinRange(a.timestamp));
        if(assetItems.length > 0) {
            let astHtml = '<table class="perf-table" id="assetsTableData"><thead><tr><th>Item Name</th><th>Quantity</th><th>Status</th><th>Allocated By</th><th>Date</th></tr></thead><tbody>';
            assetItems.forEach(a => {
                astHtml += `<tr>
                    <td><strong>${a.item_name}</strong></td>
                    <td>${a.quantity}</td>
                    <td style="color:#e67e22; font-weight:bold;">${a.status}</td>
                    <td>${a.allocated_by}</td>
                    <td>${a.timestamp}</td>
                </tr>`;
            });
            astHtml += '</tbody></table>';
            assetCont.innerHTML = astHtml;
        } else { 
            assetCont.innerHTML = '<table id="assetsTableData"><tr><td style="color:#999; font-size:13px; text-align:center; padding: 20px;">No assets issued in this period.</td></tr></table>'; 
        }
    }

    // 4. Cash Advances Tab
    if(data && data.cash) {
        let cashItems = data.cash.filter(c => isWithinRange(c.timestamp));
        if(cashItems.length > 0) {
            let cshHtml = '<table class="perf-table" id="cashTableData"><thead><tr><th>Amount (₹)</th><th>Purpose</th><th>Given By</th><th>Date</th></tr></thead><tbody>';
            cashItems.forEach(c => {
                cshHtml += `<tr>
                    <td style="color:#27ae60; font-weight:bold;">₹${c.amount}</td>
                    <td>${c.purpose}</td>
                    <td>${c.allocated_by}</td>
                    <td>${c.timestamp}</td>
                </tr>`;
            });
            cshHtml += '</tbody></table>';
            cashCont.innerHTML = cshHtml;
        } else { 
            cashCont.innerHTML = '<table id="cashTableData"><tr><td style="color:#999; font-size:13px; text-align:center; padding: 20px;">No cash history in this period.</td></tr></table>'; 
        }
    }
}

function closeProfileModal() { document.getElementById('profileModal').style.display = 'none'; }

function switchProfTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("prof-tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].classList.remove("active");
    }
    tablinks = document.getElementsByClassName("prof-tab-btn");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }
    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.classList.add("active");
}

function printWorkerTab() {
    let activeTabBtn = document.querySelector('.prof-tab-btn.active');
    let tabTitle = activeTabBtn ? activeTabBtn.innerText.replace(/⭐|🖨️|📊/g, '').trim() : "Profile Data";
    let printContent = document.querySelector('.prof-tab-content.active').innerHTML;
    
    let dateText = "";
    let s = document.getElementById('profStartDate').value;
    let e = document.getElementById('profEndDate').value;
    if(s && e) { dateText = `<br><span style="font-size:12px; color:#555;">Filtered from ${s} to ${e}</span>`; }
    
    let printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>${activeWorkerNameForPrint} - ${tabTitle}</title>
            <style>
                @page { size: A4 portrait; margin: 15mm; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; font-size: 12px; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                h2 { text-align: center; color: #2c3e50; border-bottom: 2px solid #2c3e50; padding-bottom: 5px; text-transform: uppercase; margin-bottom: 20px;}
                div[style*="max-height"] { max-height: none !important; overflow: visible !important; border: none !important; }
                table { width: 100% !important; border-collapse: collapse !important; page-break-inside: auto !important; }
                thead { display: table-header-group !important; }
                tr { page-break-inside: avoid !important; }
                th, td { border: 1px solid #bdc3c7 !important; padding: 8px !important; text-align: left; vertical-align: top; }
                th { background-color: #ecf0f1 !important; font-weight: bold; }
                .perf-type-scrap { font-weight: bold; color: #d35400; }
                .perf-type-action { font-weight: bold; color: #2980b9; }
                .btn-view, .btn-edit { display: none !important; } 
                .footer { margin-top: 40px; display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; border-top: 1px solid #bdc3c7; padding-top: 10px; page-break-inside: avoid; }
            </style>
        </head>
        <body>
            <h2>${activeWorkerNameForPrint} - ${tabTitle} ${dateText}</h2>
            ${printContent}
            <div class="footer">
                <div>Date Printed: ${new Date().toLocaleString()}</div>
                <div>Authorized Signature: _______________________</div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function() { printWindow.print(); printWindow.close(); }, 500);
}

function exportWorkerTabToExcel() {
    let activeTabBtn = document.querySelector('.prof-tab-btn.active');
    let tabTitle = activeTabBtn ? activeTabBtn.innerText.replace(/⭐|🖨️|📊/g, '').trim() : "Profile_Data";
    
    let dateText = "";
    let s = document.getElementById('profStartDate').value;
    let e = document.getElementById('profEndDate').value;
    if(s && e) { dateText = `(From ${s} to ${e})`; }
    
    let tableElement = document.querySelector('.prof-tab-content.active table');
    let tableHtml = tableElement ? tableElement.cloneNode(true).innerHTML : "";
    
    // Remove Edit button from excel export
    tableHtml = tableHtml.replace(/<button[^>]*class="btn-edit"[^>]*>.*?<\/button>/gi, '');
    
    let fullHtml = `
        <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head>
            <meta charset="utf-8">
            <style>
                table { border-collapse: collapse; }
                th, td { border: 1px solid black; padding: 5px; text-align: left; }
                th { background-color: #ecf0f1; font-weight: bold; }
            </style>
        </head>
        <body>
            <h2>Worker: ${activeWorkerNameForPrint} - ${tabTitle} ${dateText}</h2>
            <table border="1">${tableHtml}</table>
        </body>
        </html>`;
    
    let blob = new Blob(['\ufeff', fullHtml], { type: 'application/vnd.ms-excel' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = activeWorkerNameForPrint.replace(/ /g, '_') + '_' + tabTitle.replace(/ /g, '_') + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// User Profile & Management Modals
function toggleDropdown() { 
    document.getElementById('profileDropdown').classList.toggle('active'); 
}

function openUsersModal() { document.getElementById('usersModal').style.display = 'flex'; }
function closeUsersModal() { document.getElementById('usersModal').style.display = 'none'; }

function openUserDetails(username, password, role) {
    closeUsersModal();
    document.getElementById('editOldUsername').value = username;
    document.getElementById('editUsername').value = username;
    document.getElementById('editPassword').value = password;
    
    let userRoles = role.split(',').map(r => r.trim());
    
    let stagesList = [
        "Receiving", "Facing 1/Center Drilling", "Roughing", 
        "Finishing", "Facing 2/Drill Tapping", "Final QC (Internal)"
    ];
    
    let rolesHtml = `
        <label style="display: block; margin-bottom: 8px; cursor: pointer; font-weight: bold; color: #d35400;">
            <input type="checkbox" name="permissions" value="Admin" ${userRoles.includes('Admin') ? 'checked' : ''} style="width: auto; margin-right: 8px;"> Master Admin
        </label>
        <label style="display: block; margin-bottom: 8px; cursor: pointer; font-weight: bold; color: #27ae60;">
            <input type="checkbox" name="permissions" value="RM" ${userRoles.includes('RM') ? 'checked' : ''} style="width: auto; margin-right: 8px;"> RM (Quality Check)
        </label>
        <hr style="border: 0; border-top: 1px solid #ddd; margin: 15px 0;">
        <div style="font-size: 11px; color: #7f8c8d; margin-bottom: 10px; text-transform: uppercase; font-weight: bold;">Production Stages</div>
    `;
    
    stagesList.forEach(stage => {
        rolesHtml += `
        <label style="display: block; margin-bottom: 8px; cursor: pointer; font-size: 13px; color: #333;">
            <input type="checkbox" name="permissions" value="${stage}" ${userRoles.includes(stage) ? 'checked' : ''} style="width: auto; margin-right: 8px;"> ${stage}
        </label>`;
    });
    
    document.getElementById('editRolesContainer').innerHTML = rolesHtml;
    document.getElementById('userDetailsModal').style.display = 'flex';
}

function closeUserDetailsModal() { 
    document.getElementById('userDetailsModal').style.display = 'none'; 
    openUsersModal(); 
}

function openAddUserModal() { 
    closeUsersModal(); 
    document.getElementById('addUserModal').style.display = 'flex'; 
}

function closeAddUserModal() { 
    document.getElementById('addUserModal').style.display = 'none'; 
    openUsersModal(); 
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
    if (!event.target.matches('.profile-btn') && !event.target.closest('.profile-btn')) {
        let dropdowns = document.getElementsByClassName('profile-dropdown');
        for (let i = 0; i < dropdowns.length; i++) {
            dropdowns[i].classList.remove('active');
        }
    }
}

function openPasswordModal() { 
    document.getElementById('passwordModal').style.display = 'flex'; 
}

function closePasswordModal() { 
    document.getElementById('passwordModal').style.display = 'none'; 
}

window.addEventListener("pageshow", function (event) { 
    if (event.persisted) window.location.reload(); 
});
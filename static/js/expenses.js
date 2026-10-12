// Fetch JSON Data from the HTML
const workerDataEl = document.getElementById('workerDataJson');
const workerData = workerDataEl && workerDataEl.textContent.trim() ? JSON.parse(workerDataEl.textContent) : {};
let currentModalWorker = '';

function openModal(workerName) {
    currentModalWorker = workerName;
    document.getElementById('modalTitle').innerText = 'History: ' + workerName;
    document.getElementById('modalDateFilter').value = 'all'; 
    renderModalTable();
    document.getElementById('detailsModal').style.display = 'flex';
}

function renderModalTable() {
    const tbody = document.getElementById('modalBody');
    tbody.innerHTML = '';
    const filterValue = document.getElementById('modalDateFilter').value;
    
    if (workerData[currentModalWorker]) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        const tDate = new Date(todayStr); 
        
        let visibleCount = 0;

        workerData[currentModalWorker].forEach(record => {
            const recordDateStr = record.date.split(' ')[0];
            const rDate = new Date(recordDateStr);
            const diffTime = tDate - rDate;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
            
            let showRecord = true;
            if (filterValue === 'today' && recordDateStr !== todayStr) showRecord = false;
            if (filterValue === '7days' && diffDays > 7) showRecord = false;
            if (filterValue === '30days' && diffDays > 30) showRecord = false;

            if (showRecord) {
                visibleCount++;
                let row = document.createElement('tr');
                let itemDisplay = `<strong>${record.item}</strong>`;
                if(record.qty !== 'N/A') {
                    itemDisplay += ` <span style="color: #e74c3c;">(-${record.qty})</span>`;
                } else {
                    itemDisplay = `<strong style="color: #e67e22;">${record.item}</strong>`;
                }

                row.innerHTML = `
                    <td><small style="color: #666;">${record.date}</small></td>
                    <td>${itemDisplay}</td>
                    <td>${record.purpose}</td>
                    <td style="color: #c0392b; font-weight: bold;">₹${record.cost}</td>
                `;
                tbody.appendChild(row);
            }
        });

        if(visibleCount === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: #999; padding: 20px;">No records found for the selected filter.</td></tr>`;
        }
    }
}

function closeDetailsModal() {
    document.getElementById('detailsModal').style.display = 'none';
}

function setQuickDate(days) {
    let today = new Date();
    let start = new Date();
    start.setDate(today.getDate() - days);
    
    document.getElementById('start_date').value = start.toISOString().split('T')[0];
    document.getElementById('end_date').value = today.toISOString().split('T')[0];
    document.getElementById('filter_form').submit();
}

function toggleDropdown() { 
    document.getElementById('profileDropdown').classList.toggle('active'); 
}

// Manage Users JS
function openUsersModal() { document.getElementById('usersModal').style.display = 'flex'; }
function closeUsersModal() { document.getElementById('usersModal').style.display = 'none'; }

function openAddUserModal() { 
    closeUsersModal(); 
    document.getElementById('addUserModal').style.display = 'flex'; 
}
function closeAddUserModal() { 
    document.getElementById('addUserModal').style.display = 'none'; 
    openUsersModal(); 
}

// New Multi-Stage Edit Modal Logic
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

// Global Click handler for Modals and Dropdowns
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
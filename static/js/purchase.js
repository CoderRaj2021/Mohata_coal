// Sidebar Toggle for Mobile
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

// Tab Memory & Switching Logic
document.addEventListener("DOMContentLoaded", function() {
    let savedTab = localStorage.getItem('purchaseActiveTab');
    if(savedTab) {
        let tabBtn = document.querySelector(`button[onclick*="${savedTab}"]`);
        if(tabBtn) tabBtn.click();
    }
});

function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].classList.remove("active");
    }
    tablinks = document.getElementsByClassName("tab-btn");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }
    
    document.getElementById(tabName).classList.add("active");
    if(evt) {
        evt.currentTarget.classList.add("active");
    }
    
    localStorage.setItem('purchaseActiveTab', tabName);
}

// Manage Users JS
function openUsersModal() { 
    document.getElementById('usersModal').style.display = 'flex'; 
}

function closeUsersModal() { 
    document.getElementById('usersModal').style.display = 'none'; 
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

function openAddUserModal() { 
    closeUsersModal(); 
    document.getElementById('addUserModal').style.display = 'flex'; 
}

function closeAddUserModal() { 
    document.getElementById('addUserModal').style.display = 'none'; 
    openUsersModal(); 
}

// User Profile Dropdown Logic
function toggleDropdown() { 
    document.getElementById('profileDropdown').classList.toggle('active'); 
}

// Global Click handler for Modals and Dropdowns
window.onclick = function(event) {
    // Close Modals on outside click
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
    // Close Dropdown on outside click
    if (!event.target.matches('.profile-btn') && !event.target.closest('.profile-btn')) {
        let dropdowns = document.getElementsByClassName('profile-dropdown');
        for (let i = 0; i < dropdowns.length; i++) {
            dropdowns[i].classList.remove('active');
        }
    }
}

// Auto-reload to prevent back-button cache issues
window.addEventListener("pageshow", function (event) { 
    if (event.persisted) {
        window.location.reload(); 
    }
});

// Password Modal Logic
function openPasswordModal() { 
    document.getElementById('passwordModal').style.display = 'flex'; 
}

function closePasswordModal() { 
    document.getElementById('passwordModal').style.display = 'none'; 
}
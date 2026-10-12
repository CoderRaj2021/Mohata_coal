// Sidebar Toggle for Mobile
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

// Global Modals and Users Management
function toggleDropdown() { 
    document.getElementById('profileDropdown').classList.toggle('active'); 
}

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
    
    // Fetch dynamic stages if available, otherwise use hardcoded fallback
    let stagesArray = ["Receiving", "RM QC", "Facing 1/Center Drilling", "Roughing", "Finishing", "Facing 2/Drill Tapping", "Final QC (Internal)", "Finish Goods/Inspection (Client)", "Delivery"];
    const stagesArrayEl = document.getElementById('workflowStagesJson');
    if (stagesArrayEl) {
        try {
            stagesArray = JSON.parse(stagesArrayEl.textContent);
        } catch(e) {}
    }
    
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
    
    stagesArray.forEach(stage => {
        if (stage !== 'Receiving' && stage !== 'Delivery' && stage !== 'RM QC' && stage !== 'Finish Goods/Inspection (Client)') {
            rolesHtml += `
            <label style="display: block; margin-bottom: 8px; cursor: pointer; font-size: 13px; color: #34495e;">
                <input type="checkbox" name="permissions" value="${stage}" ${userRoles.includes(stage) ? 'checked' : ''} style="width: auto; margin-right: 8px;"> ${stage}
            </label>`;
        }
    });
    
    // Add explicitly standard stages that might not be in the dynamic list
    let standardStages = ["Receiving", "Final QC (Internal)"];
    standardStages.forEach(stage => {
        if (!stagesArray.includes(stage)) {
            rolesHtml += `
            <label style="display: block; margin-bottom: 8px; cursor: pointer; font-size: 13px; color: #34495e;">
                <input type="checkbox" name="permissions" value="${stage}" ${userRoles.includes(stage) ? 'checked' : ''} style="width: auto; margin-right: 8px;"> ${stage}
            </label>`;
        }
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

function openPasswordModal() { 
    document.getElementById('passwordModal').style.display = 'flex'; 
}

function closePasswordModal() { 
    document.getElementById('passwordModal').style.display = 'none'; 
}

// Global Click handler for Modals, Dropdowns and Sidebar
window.onclick = function(event) {
    if (event.target.classList.contains('sidebar-overlay')) {
        toggleSidebar();
    }
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

// Auto-reload to prevent back-button cache issues
window.addEventListener("pageshow", function (event) { 
    if (event.persisted) window.location.reload(); 
});
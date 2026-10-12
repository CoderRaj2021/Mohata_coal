// ====== UI Interaction Logic ======
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

function toggleDropdown() { 
    document.getElementById('profileDropdown').classList.toggle('active'); 
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) event.target.style.display = "none";
    if (!event.target.matches('.profile-btn') && !event.target.closest('.profile-btn')) {
        let dropdowns = document.getElementsByClassName('profile-dropdown');
        for (let i = 0; i < dropdowns.length; i++) dropdowns[i].classList.remove('active');
    }
}

// User Modals
function openUsersModal() { document.getElementById('usersModal').style.display = 'flex'; }
function closeUsersModal() { document.getElementById('usersModal').style.display = 'none'; }

function openAddUserModal() { closeUsersModal(); document.getElementById('addUserModal').style.display = 'flex'; }
function closeAddUserModal() { document.getElementById('addUserModal').style.display = 'none'; openUsersModal(); }

// New Multi-Stage Edit Modal Logic
function openUserDetails(username, password, role) {
    closeUsersModal();
    document.getElementById('editOldUsername').value = username;
    document.getElementById('editUsername').value = username;
    document.getElementById('editPassword').value = password;
    
    let userRoles = role.split(',').map(r => r.trim());
    
    let prodStages = [
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
    
    prodStages.forEach(stage => {
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

// Password Modal
function openPasswordModal() { document.getElementById('passwordModal').style.display = 'flex'; }
function closePasswordModal() { document.getElementById('passwordModal').style.display = 'none'; }

// Reload page if back button is pressed to ensure fresh data
window.addEventListener("pageshow", function (event) { if (event.persisted) window.location.reload(); });


// ====== Chart.js Rendering Logic ======
document.addEventListener("DOMContentLoaded", function() {
    
    Chart.defaults.color = "#7f8c8d";
    Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

    // Data Parsing from Hidden Script Tags
    const pipelineLabels = JSON.parse(document.getElementById('pipelineLabelsJson')?.textContent || "[]");
    const pipelineValues = JSON.parse(document.getElementById('pipelineValuesJson')?.textContent || "[]");
    const qualityData = JSON.parse(document.getElementById('qualityDataJson')?.textContent || "[0,0,0,0]");
    
    const workerProdLabels = JSON.parse(document.getElementById('workerProdLabelsJson')?.textContent || "[]");
    const workerProdValues = JSON.parse(document.getElementById('workerProdValuesJson')?.textContent || "[]");
    
    const workerScrapLabels = JSON.parse(document.getElementById('workerScrapLabelsJson')?.textContent || "[]");
    const workerScrapValues = JSON.parse(document.getElementById('workerScrapValuesJson')?.textContent || "[]");
    
    const scrapTrendLabels = JSON.parse(document.getElementById('scrapTrendLabelsJson')?.textContent || "[]");
    const scrapTrendValues = JSON.parse(document.getElementById('scrapTrendValuesJson')?.textContent || "[]");
    
    const stageScrapLabels = JSON.parse(document.getElementById('stageScrapLabelsJson')?.textContent || "[]");
    const stageScrapValues = JSON.parse(document.getElementById('stageScrapValuesJson')?.textContent || "[]");
    
    const isAdmin = JSON.parse(document.getElementById('isAdminJson')?.textContent || "false");

    // 1. Production Pipeline Chart
    const pipelineCtx = document.getElementById('pipelineBarChart');
    if (pipelineCtx) {
        new Chart(pipelineCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: pipelineLabels.length > 0 ? pipelineLabels : ['No Active Batches'],
                datasets: [{
                    label: 'Active Batches',
                    data: pipelineValues.length > 0 ? pipelineValues : [0],
                    backgroundColor: 'rgba(52, 152, 219, 0.8)',
                    borderColor: '#2980b9',
                    borderWidth: 1,
                    borderRadius: 4,
                    maxBarThickness: 45
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 2. Advanced 4-Way Quality Doughnut
    const qualityCtx = document.getElementById('qualityPieChart');
    if (qualityCtx) {
        new Chart(qualityCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Passed & Active', 'Returned to Client', 'Sent for Rework', 'Permanently Scrapped'],
                datasets: [{
                    data: qualityData,
                    backgroundColor: ['#27ae60', '#e67e22', '#8e44ad', '#c0392b'],
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 6
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '65%', 
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: {size: 11} } } } 
            }
        });
    }

    // 3. Worker Productivity Bar Chart
    const workerProdCtx = document.getElementById('workerProdChart');
    if (workerProdCtx) {
        new Chart(workerProdCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: workerProdLabels.length > 0 ? workerProdLabels : ['No Data'],
                datasets: [{
                    label: 'Tasks / Batches Handled',
                    data: workerProdValues.length > 0 ? workerProdValues : [0],
                    backgroundColor: 'rgba(39, 174, 96, 0.8)',
                    borderColor: '#1e8449',
                    borderWidth: 1,
                    borderRadius: 4,
                    maxBarThickness: 45
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }

    // 4. Worker Scrap Chart
    const workerScrapCtx = document.getElementById('workerScrapChart');
    if (workerScrapCtx) {
        new Chart(workerScrapCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: workerScrapLabels.length > 0 ? workerScrapLabels : ['No Data'],
                datasets: [{
                    label: 'Total Scrap Generated (kg)',
                    data: workerScrapValues.length > 0 ? workerScrapValues : [0],
                    backgroundColor: 'rgba(231, 76, 60, 0.8)',
                    borderColor: '#c0392b',
                    borderWidth: 1,
                    borderRadius: 4,
                    maxBarThickness: 45
                }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
        });
    }

    // 5. Scrap Trend (Area Chart)
    const scrapTrendCtx = document.getElementById('scrapTrendChart');
    if (scrapTrendCtx) {
        new Chart(scrapTrendCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: scrapTrendLabels.length > 0 ? scrapTrendLabels : ['No Data'],
                datasets: [{
                    label: 'Scrap (kg)',
                    data: scrapTrendValues.length > 0 ? scrapTrendValues : [0],
                    fill: true,
                    backgroundColor: 'rgba(231, 76, 60, 0.2)',
                    borderColor: '#e74c3c',
                    pointBackgroundColor: '#c0392b',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#c0392b',
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }

    // 6. Stage-wise Scrap
    const stageScrapCtx = document.getElementById('stageScrapChart');
    if (stageScrapCtx) {
        new Chart(stageScrapCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: stageScrapLabels.length > 0 ? stageScrapLabels : ['No Scrap Data'],
                datasets: [{
                    label: 'Total Scrap (kg)',
                    data: stageScrapValues.length > 0 ? stageScrapValues : [0],
                    backgroundColor: 'rgba(243, 156, 18, 0.8)',
                    borderColor: '#d35400',
                    borderWidth: 1,
                    borderRadius: 4,
                    maxBarThickness: 45
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // Admin & RM specific charts
    if (isAdmin) {
        // 7. Financial Breakdown Chart
        const financeData = JSON.parse(document.getElementById('financeDataJson')?.textContent || "[0,0,0]");
        const financeBarCtx = document.getElementById('financeBarChart');
        if (financeBarCtx) {
            new Chart(financeBarCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['Purchased', 'Consumed', 'Disbursed'],
                    datasets: [{
                        data: financeData,
                        backgroundColor: ['#3498db', '#e74c3c', '#f39c12'],
                        borderRadius: 4,
                        maxBarThickness: 55
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }

        // 8. Top Expenses Pie Chart
        const workerPieData = JSON.parse(document.getElementById('workerPieDataJson')?.textContent || "[]");
        const workerNames = workerPieData.map(w => w.name);
        const workerValues = workerPieData.map(w => w.total);
        
        const workerPieCtx = document.getElementById('workerPieChart');
        if (workerPieCtx) {
            new Chart(workerPieCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: workerNames.length > 0 ? workerNames : ['No Data'],
                    datasets: [{
                        data: workerValues.length > 0 ? workerValues : [1],
                        backgroundColor: ['#3498db', '#27ae60', '#e74c3c', '#9b59b6', '#f1c40f'],
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } }
            });
        }
    }
});
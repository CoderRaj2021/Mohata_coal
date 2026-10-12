// Data parsing from hidden script tags
const piecesDataEl = document.getElementById('piecesDictJson');
const piecesData = piecesDataEl ? JSON.parse(piecesDataEl.textContent || "{}") : {};

const masterPiecesDataEl = document.getElementById('masterPiecesDictJson');
const masterPiecesData = masterPiecesDataEl ? JSON.parse(masterPiecesDataEl.textContent || "{}") : {};

const masterScrapsDataEl = document.getElementById('masterScrapsDictJson');
const masterScrapsData = masterScrapsDataEl ? JSON.parse(masterScrapsDataEl.textContent || "{}") : {};

const stagesArrayEl = document.getElementById('workflowStagesJson');
const stagesArray = stagesArrayEl ? JSON.parse(stagesArrayEl.textContent || "[]") : [];

const logsDataEl = document.getElementById('batchLogsJson');
const logsData = logsDataEl ? JSON.parse(logsDataEl.textContent || "{}") : {};

const batchesDictEl = document.getElementById('batchesDictJson');
const batchesDict = batchesDictEl ? JSON.parse(batchesDictEl.textContent || "{}") : {};

const machinesDataEl = document.getElementById('machinesDictJson');
const machinesData = machinesDataEl ? JSON.parse(machinesDataEl.textContent || "[]") : [];

const usernameEl = document.getElementById('currentUsernameJson');
const currentUsername = usernameEl ? JSON.parse(usernameEl.textContent || '""') : "";

// Initial Page Load setup
document.addEventListener("DOMContentLoaded", function() {
    let savedTab = localStorage.getItem('productionActiveTab');
    if(savedTab) {
        let tabBtn = document.querySelector(`button[onclick*="${savedTab}"]`);
        if(tabBtn) { tabBtn.click(); }
    }
});

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) tabcontent[i].classList.remove("active");
    tablinks = document.getElementsByClassName("tab-btn");
    for (i = 0; i < tablinks.length; i++) tablinks[i].classList.remove("active");
    document.getElementById(tabName).classList.add("active");
    if(evt) evt.currentTarget.classList.add("active");
    localStorage.setItem('productionActiveTab', tabName);
}

// Machine Selection Logic
function filterMachinesByStage() {
    let stageSelected = document.getElementById('sessionStage').value;
    let machineSelect = document.getElementById('sessionMachine');
    
    machineSelect.innerHTML = '<option value="" disabled selected>-- Select Machine --</option>';
    machineSelect.disabled = false;
    
    let found = false;
    machinesData.forEach(m => {
        let allowed = m.allowed_stages.split(',').map(s => s.trim());
        if (allowed.includes(stageSelected)) {
            machineSelect.innerHTML += `<option value="${m.machine_name}">${m.machine_name}</option>`;
            found = true;
        }
    });
    
    if (!found) {
        machineSelect.innerHTML = '<option value="" disabled selected>No machines available</option>';
        machineSelect.disabled = true;
    }
}

// Machine Modal logic
function openMachineModal(action, id = '', name = '', stages = []) {
    document.getElementById('machineAction').value = action;
    document.getElementById('machineId').value = id;
    document.getElementById('machineName').value = name;
    
    document.getElementById('machineModalTitle').innerText = action === 'add' ? 'Add New Machine' : 'Edit Machine: ' + name;
    
    let checkboxes = document.querySelectorAll('.machine-stage-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = stages.map(s => s.trim()).includes(cb.value);
    });
    
    document.getElementById('machineModal').style.display = 'flex';
}

function closeModal(modalId) { 
    document.getElementById(modalId).style.display = 'none'; 
}


// Evaluation & Forward Modal Logic
function openForwardModal(batchNo, currentStage) {
    document.getElementById('forwardModal').style.display = 'flex';
    document.getElementById('fwdBatchNumber').value = batchNo;
    document.getElementById('fwdCurrentStage').value = currentStage;
    document.getElementById('forwardModalTitle').innerText = currentStage + ': ' + batchNo;
    
    let list = piecesData[batchNo] || [];
    let validAxles = list.filter(p => p.status !== 'Scrap' && p.status !== 'Reject');
    let container = document.getElementById('evalPiecesContainer');
    
    let currentStageIdx = stagesArray.indexOf(currentStage);
    
    let nextStageText = 'Delivery';
    let isRework = batchNo.includes('-R');
    
    if (isRework && batchesDict[batchNo] && batchesDict[batchNo].remarks) {
         let rmks = batchesDict[batchNo].remarks;
         let match = rmks.match(/\[Origin:\s*(.*?)\]/i);
         if (match) {
             nextStageText = match[1].trim(); 
         }
    } else if (currentStageIdx + 1 < stagesArray.length) {
        nextStageText = stagesArray[currentStageIdx + 1];
    }
    
    let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
                <tr style="border-bottom: 2px solid #ddd;">
                    <th style="padding: 10px; width: 20%; color: #495057;">Axle No</th>
                    <th style="padding: 10px; width: 45%; color: #495057;">Action</th>
                    <th style="padding: 10px; width: 35%; color: #495057;">Details</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    validAxles.forEach(p => {
        let extraScrapInput = '';
        if (currentStage === 'Finishing') {
            extraScrapInput = `<div style="margin-top: 8px;">
                        <input type="number" step="0.01" min="0" name="eval_scrap_wt_${p.axle_no}" placeholder="Scrap Weight (kg)" style="width: 100%; padding: 6px; font-size: 11px; border: 1px solid #f1c40f; border-radius: 4px; background: #fffcf5;" title="Enter process scrap weight (chips/turning) generated" required>
                    </div>`;
        }

        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px; font-weight: bold; color: #2980b9;">
                    ${p.axle_no} <input type="hidden" name="eval_axle[]" value="${p.axle_no}">
                </td>
                <td style="padding: 10px;">
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <label style="cursor:pointer; color:#27ae60; font-weight:bold;">
                            <input type="radio" class="radio-pass" name="eval_status_${p.axle_no}" value="Pass" checked onchange="toggleEvalDetails('${p.axle_no}', 'Pass', '${nextStageText}', ${currentStageIdx}, '${currentStage}')"> ✅ Pass
                        </label>
                        <label style="cursor:pointer; color:#e74c3c; font-weight:bold;">
                            <input type="radio" name="eval_status_${p.axle_no}" value="Scrap" onchange="toggleEvalDetails('${p.axle_no}', 'Scrap', '${nextStageText}', ${currentStageIdx}, '${currentStage}')"> ❌ Damage
                        </label>
                        <label style="cursor:pointer; color:#8e44ad; font-weight:bold;">
                            <input type="radio" name="eval_status_${p.axle_no}" value="Rework" onchange="toggleEvalDetails('${p.axle_no}', 'Rework', '${nextStageText}', ${currentStageIdx}, '${currentStage}')"> 🔄 Send to Rework
                        </label>
                        <label style="cursor:pointer; color:#f39c12; font-weight:bold;">
                            <input type="radio" name="eval_status_${p.axle_no}" value="Hold" onchange="toggleEvalDetails('${p.axle_no}', 'Hold', '${nextStageText}', ${currentStageIdx}, '${currentStage}')"> ⏸️ Hold / Pending
                        </label>
                    </div>
                </td>
                <td style="padding: 10px;">
                    <div id="eval_dynamic_text_${p.axle_no}">
                        <span style="color:#7f8c8d; font-style:italic;">Moves to ${nextStageText}</span>
                    </div>
                    ${extraScrapInput}
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function toggleEvalDetails(axleNo, status, nextStageText, currentStageIdx, currentStage) {
    let container = document.getElementById(`eval_dynamic_text_${axleNo}`);
    
    if(status === 'Pass') {
        container.innerHTML = `<span style="color:#7f8c8d; font-style:italic;">Moves to ${nextStageText}</span>`;
    } 
    else if (status === 'Scrap') {
        container.innerHTML = `<input type="text" name="eval_reason_${axleNo}" placeholder="Reason for damage (Optional)..." style="width:100%; padding:6px; margin:0; border:1px solid #e74c3c; border-radius:4px;">`;
    } 
    else if (status === 'Hold') {
        container.innerHTML = `<span style="color:#f39c12; font-style:italic; font-size: 11px;">Stays in ${currentStage} (Partial Split)</span>
        <input type="text" name="eval_reason_${axleNo}" placeholder="Reason for holding (Optional)..." style="width:100%; padding:6px; margin-top:3px; border:1px solid #f39c12; border-radius:4px;">`;
    }
    else if (status === 'Rework') {
        let optionsHtml = '<option value="">-- Select Rework Stage --</option>';
        for(let i = 2; i < currentStageIdx; i++) {
            optionsHtml += `<option value="${stagesArray[i]}">${stagesArray[i]}</option>`;
        }
        
        container.innerHTML = `
            <select name="eval_dest_${axleNo}" required style="width:100%; padding:6px; margin-bottom:5px; border:1px solid #8e44ad; border-radius:4px; font-size:11px;">
                ${optionsHtml}
            </select>
            <input type="text" name="eval_reason_${axleNo}" placeholder="Rework Reason (Optional)..." style="width:100%; padding:6px; margin:0; border:1px solid #8e44ad; border-radius:4px;">
        `;
    }
}

function selectAllPass() {
    let passRadios = document.querySelectorAll('.radio-pass');
    passRadios.forEach(radio => {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
    });
}

function formatDeliveryRemark(evt, form) {
    let from = form.dispatch_from.value || 'Factory';
    let to = form.delivery_to.value || form.manual_client.value;
    let vehicle = form.del_vehicle.value || 'N/A';
    let driver = form.driver_name.value || 'N/A';
    let note = form.actual_remark.value || '';
    
    // Bundle it dynamically
    form.remark.value = `[From: ${from}] [To: ${to}] [Vehicle: ${vehicle}] [Driver: ${driver}] Note: ${note}`;
}

function openProcessDeliveryModal(batchNo, qty, clientName, rcvQty) {
    document.getElementById('processDeliveryModal').style.display = 'flex';
    document.getElementById('delBatchNumber').value = batchNo;
    document.getElementById('delBatchLabel').value = batchNo;
    document.getElementById('delClientName').value = clientName;
    document.getElementById('delDestination').value = clientName; 
    document.getElementById('delRcvQty').value = rcvQty;
    document.getElementById('delQty').value = qty;
}

// Master Timeline & Traceability Logic
function switchPipelineTab(evt, tabId) {
    let contents = document.getElementsByClassName("pipeline-tab-content");
    for (let i = 0; i < contents.length; i++) contents[i].style.display = "none";
    let buttons = evt.currentTarget.parentElement.getElementsByClassName("tab-btn");
    for (let i = 0; i < buttons.length; i++) buttons[i].classList.remove("active");
    document.getElementById(tabId).style.display = "block";
    evt.currentTarget.classList.add("active");
}

function openPipelineModal(batchNo, currentStage) {
    try {
        let pTabs = document.querySelectorAll('#pipelineModal .tab-btn');
        if(pTabs.length > 0) {
            pTabs.forEach(t => t.classList.remove('active'));
            pTabs[0].classList.add('active'); 
            document.getElementById('timelineTab').style.display = 'block';
            document.getElementById('masterViewTab').style.display = 'none';
        }

        let isSubBatch = batchNo.includes('-R') || batchNo.includes('-P');
        let baseBatch = batchNo.split('-R')[0].split('-P')[0];
        
        let displayTitle = isSubBatch ? `Timeline & Summary: ${baseBatch} (Opened via ${batchNo})` : `Timeline & Summary: ${batchNo}`;
        document.getElementById('pipelineModalTitle').innerText = displayTitle;
        
        let baseBatchInfo = batchesDict[baseBatch] || {};

        let totalRecv = parseInt(baseBatchInfo.quantity) || 0;
        let famPassed = parseInt(baseBatchInfo.passed_qty) || 0;
        let famRejected = parseInt(baseBatchInfo.rejected_qty) || 0; 
        let famDamaged = parseInt(baseBatchInfo.damaged_qty) || 0;  

        let fPieces = masterPiecesData[baseBatch] || [];
        if(fPieces.length > 0) {
            let fSeen = new Set();
            famRejected = 0; famDamaged = 0;
            fPieces.forEach(p => {
                if(!fSeen.has(p.axle_no)) {
                    fSeen.add(p.axle_no);
                    if (p.status === 'Scrap' || p.status === 'Reject') {
                        if (['Receiving', 'RM QC', 'Processing'].includes(p.axle_current_stage)) {
                            famRejected++;
                        } else {
                            famDamaged++;
                        }
                    }
                }
            });
        }

        let summaryBox = document.getElementById('batchSummaryBox');
        summaryBox.innerHTML = `
            <strong>Client:</strong> ${baseBatchInfo.client_name || 'N/A'} | <strong>Invoice:</strong> ${baseBatchInfo.invoice_no || 'N/A'}<br>
            <strong>Total Received Qty:</strong> ${totalRecv} | <strong style="color: #27ae60;">Passed Qty:</strong> ${famPassed} | <strong style="color: #e67e22;">Rejected Qty (RMQC):</strong> ${famRejected} | <strong style="color: #c0392b;">Damaged Qty (Prod.):</strong> ${famDamaged}
        `;

        const container = document.getElementById('pipelineContainer');
        container.innerHTML = '';

        function generateTimelineHTML(bNo, isMainBatch) {
            let bInfo = batchesDict[bNo] || {};
            let cStage = bInfo.current_stage || '';
            let bLogs = logsData[bNo] || [];
            
            let html = '';
            let reachedCurrent = false;
            let entryTime = null; 
            let firstTime = null;
            let lastTime = null;

            stagesArray.forEach(stage => {
                let stageClass = '';
                if(stage === cStage) { stageClass = 'current'; reachedCurrent = true; } 
                else if (!reachedCurrent) { stageClass = 'completed'; }

                let stageLogs = bLogs.filter(log => log.stage_name === stage);
                
                if (!isMainBatch && stageClass === '' && stageLogs.length === 0) return; 

                let stageHTML = `<div class="pipeline-stage ${stageClass}"><div class="stage-title">${stage}</div>`;
                
                let exitTime = stageLogs.length > 0 ? stageLogs[stageLogs.length - 1].timestamp : null;
                if (!firstTime && stageLogs.length > 0) firstTime = stageLogs[0].timestamp;
                if (exitTime) lastTime = exitTime;

                let timeSpentHtml = '';
                if (entryTime) {
                    let endTime = exitTime ? new Date(exitTime.replace(' ', 'T')) : (stageClass === 'current' ? new Date() : null);
                    if (endTime) {
                        let startTime = new Date(entryTime.replace(' ', 'T'));
                        let diffMs = endTime - startTime;
                        if (diffMs >= 0) {
                            let diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            let diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / 3600000);
                            let diffMins = Math.round(((diffMs % 3600000) / 60000));
                            let timeStr = "";
                            if (diffDays > 0) timeStr += `${diffDays}d `;
                            if (diffHrs > 0) timeStr += `${diffHrs}h `;
                            timeStr += `${diffMins}m`;
                            timeSpentHtml = `<div style="font-size: 11px; color: #d35400; font-weight: bold; margin-top: 5px; background: #fdebd0; display: inline-block; padding: 3px 8px; border-radius: 4px; border: 1px solid #fad7a1;">⏱️ Time in ${stage}: ${timeStr}</div>`;
                        }
                    }
                }
                if (exitTime) { entryTime = exitTime; }

                if(stageLogs.length > 0) {
                    stageLogs.forEach(log => {
                        let action = log.action_taken ? log.action_taken.toLowerCase() : "";
                        let remarkText = log.remark ? log.remark.toLowerCase() : "";
                        
                        let isReject = action.includes("reject") || action.includes("scrap") || action.includes("damage");
                        let isRework = action.includes("rework") || remarkText.includes("rework");
                        let isAdmin = action.includes("admin") || remarkText.includes("admin correction");
                        let isMerge = action.includes("merge") || remarkText.includes("merge");
                        let isSplit = action.includes("split") || remarkText.includes("split") || action.includes("held");
                        
                        let boxBg = '#f8f9fa'; let borderColor = '#eee'; let color = '#2c3e50'; let icon = '✅ ';
                        
                        if (isReject) { boxBg = '#fadbd8'; borderColor = '#f5b7b1'; color = '#c0392b'; icon = '❌ '; }
                        else if (isAdmin) { boxBg = '#fdebd0'; borderColor = '#f5cba7'; color = '#d35400'; icon = '🛠️ '; }
                        else if (isMerge) { boxBg = '#d4edda'; borderColor = '#c3e6cb'; color = '#155724'; icon = '🔗 '; }
                        else if (isSplit || isRework) { boxBg = '#f4ecf7'; borderColor = '#d7bde2'; color = '#8e44ad'; icon = '🔀 '; }
                        else if (action.includes("forward")) { color = '#27ae60'; icon = '➡️ '; }
                        
                        let machineInfo = log.machine_name && log.machine_name !== "N/A" ? `<span style="background:#eef2f7; border:1px solid #d5e1ed; padding:1px 5px; border-radius:3px; font-size:10px; margin-left:5px; color:#2980b9;">⚙️ ${log.machine_name}</span>` : '';

                        stageHTML += `
                            <div class="log-entry" style="background: ${boxBg}; border-color: ${borderColor};">
                                <span class="date">${log.timestamp}</span>
                                <strong style="color: ${color};">${icon}${log.action_taken}</strong>: <span style="color:#333;">${log.remark}</span>
                                <br><span class="user">By: ${log.done_by} ${machineInfo}</span>
                            </div>`;
                    });
                    stageHTML += timeSpentHtml; 
                } else if (stageClass === 'current') { 
                    let bStatus = bInfo.status || 'Active';
                    if (bStatus === 'Merged') {
                        stageHTML += `<div style="font-size: 12px; color: #27ae60; font-weight: bold; margin-top: 5px;">🔗 Merged back to Main Batch</div>`;
                    } else if (bStatus === 'Empty (Fully Split)') {
                        stageHTML += `<div style="font-size: 12px; color: #7f8c8d; font-weight: bold; margin-top: 5px; font-style:italic;">🔀 All active axles split from here</div>`;
                    } else {
                        stageHTML += `<div style="font-size: 12px; color: #3498db; font-weight: bold; margin-top: 5px;">⏳ Processing Here...</div>`; 
                        stageHTML += timeSpentHtml; 
                    }
                } 
                else if (stageClass === '') { stageHTML += `<div style="font-size: 12px; color: #bdc3c7; margin-top: 5px;">Pending</div>`; }
                
                stageHTML += `</div>`;
                html += stageHTML;
            });

            if (firstTime) {
                let startT = new Date(firstTime.replace(' ', 'T'));
                let endT = lastTime ? new Date(lastTime.replace(' ', 'T')) : new Date();
                let totalDiff = endT - startT;
                if (totalDiff > 0) {
                    let tDays = Math.floor(totalDiff / (1000 * 60 * 60 * 24));
                    let tHrs = Math.floor((totalDiff % (1000 * 60 * 60 * 24)) / 3600000);
                    let tMins = Math.round(((totalDiff % 3600000) / 60000));
                    let totalStr = (tDays > 0 ? tDays + "d " : "") + (tHrs > 0 ? tHrs + "h " : "") + tMins + "m";
                    summaryBox.innerHTML += `<br><strong>Elapsed Time (${bNo}):</strong> <span style="color: #2980b9;">${totalStr}</span>`;
                }
            }
            return html;
        }

        let allFamily = Object.keys(batchesDict).filter(b => b.startsWith(baseBatch)).sort();
        
        let mainHtml = `<div style="background:#fff; padding:15px; border-radius:6px; border:1px solid #dee2e6; margin-bottom:20px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
            <h4 style="margin-top:0; color:#2c3e50; border-bottom:2px solid #bdc3c7; padding-bottom:8px; font-size:15px;">
                📦 Main Batch Progress: <span style="color:#3498db;">${baseBatch}</span>
            </h4>
            ${generateTimelineHTML(baseBatch, true)}
        </div>`;
        
        let subHtml = '';
        let children = allFamily.filter(b => b !== baseBatch);
        if (children.length > 0) {
            subHtml += `<h4 style="margin-top:25px; color:#8e44ad; border-bottom:2px solid #d7bde2; padding-bottom:8px; font-size:15px;">
                🔀 Split Sub-Batches (Reworks, Holds & Recoveries)
            </h4>`;
            
            children.forEach(child => {
                let childInfo = batchesDict[child];
                let badge = '';
                let boxBorder = '#dee2e6';
                let boxBg = '#f8f9fa';
                
                let lowerRmk = (childInfo.remarks || "").toLowerCase();
                if (lowerRmk.includes('admin') || lowerRmk.includes('recover') || lowerRmk.includes('master correction')) {
                    badge = `<span style="background:#fdebd0; color:#d35400; padding:3px 8px; border-radius:4px; font-size:10px; margin-left:10px; font-weight:bold;">🛠️ Admin Recovered</span>`;
                    boxBorder = '#f5cba7'; boxBg = '#fdf8f4';
                } else if (lowerRmk.includes('partial split')) {
                    badge = `<span style="background:#fef9e7; color:#d35400; padding:3px 8px; border-radius:4px; font-size:10px; margin-left:10px; font-weight:bold;">⏸️ Partial Hold</span>`;
                    boxBorder = '#f1c40f'; boxBg = '#fffdf7';
                } else {
                    badge = `<span style="background:#f4ecf7; color:#8e44ad; padding:3px 8px; border-radius:4px; font-size:10px; margin-left:10px; font-weight:bold;">🔄 Normal Rework</span>`;
                    boxBorder = '#d7bde2'; boxBg = '#fcf8fd';
                }
                
                let statusBadge = `<span style="font-size:11px; margin-left:10px; color:#2980b9; font-weight:normal;">(Currently at: <b>${childInfo.current_stage}</b>)</span>`;
                if (childInfo.status === 'Merged') statusBadge = `<span style="font-size:11px; margin-left:10px; color:#27ae60; font-weight:bold;">(🔗 Merged back to Main)</span>`;
                else if (childInfo.status === 'Scrapped') statusBadge = `<span style="font-size:11px; margin-left:10px; color:#c0392b; font-weight:bold;">(❌ Scrapped)</span>`;
                
                subHtml += `<div style="background:${boxBg}; border:1px solid ${boxBorder}; border-radius:6px; padding:15px; margin-bottom:15px; box-shadow:0 2px 4px rgba(0,0,0,0.03);">
                    <h5 style="margin-top:0; margin-bottom:15px; color:#2c3e50; font-size:14px; display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                        <span>Branch: <b>${child}</b></span> ${badge} ${statusBadge}
                    </h5>
                    ${generateTimelineHTML(child, false)}
                </div>`;
            });
        }
        container.innerHTML = mainHtml + subHtml;

        // ==========================================
        // MASTER VIEW TAB LOGIC (REWORK FIXED)
        // ==========================================
        let masterPieces = masterPiecesData[baseBatch] || [];
        let masterScraps = masterScrapsData[baseBatch] || [];
        
        let axleHtml = `<div style="max-height: 450px; overflow-y: auto; overflow-x: auto; border: 1px solid #e9ecef; border-radius: 6px;">
            <table class="table-clean" style="font-size: 11px; width: 100%; min-width: 1200px; table-layout: fixed; border-collapse: separate; border-spacing: 0;">
                <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 10; box-shadow: 0 2px 2px -1px rgba(0,0,0,0.1);">
                    <tr>
                        <th style="width: 40px; position: sticky; left: 0; background: #f8f9fa; z-index: 12; border-right: 1px solid #ddd; padding: 10px; text-align:center;">Sl No</th>
                        <th style="width: 60px; position: sticky; left: 40px; background: #f8f9fa; z-index: 12; border-right: 2px solid #ddd; padding: 10px; text-align:center;">Axle No</th>`;
                        
        stagesArray.forEach(stage => {
            axleHtml += `<th style="width: 110px; padding: 10px; border-right: 1px solid #eee; text-align: center;">${stage}</th>`;
        });
        
        axleHtml += `<th style="width: 70px; padding: 10px; background: #fef9e7; border-left: 2px solid #f1c40f; text-align:center;">Total Scrap/Loss</th>
                    </tr>
                </thead>
                <tbody>`;
                
        if (masterPieces.length === 0) {
            let cols = stagesArray.length + 3;
            axleHtml += `<tr><td colspan="${cols}" style="text-align:center; padding:15px; color:#7f8c8d;">No axle data found for this batch.</td></tr>`;
        } else {
            masterPieces.forEach((p, idx) => {
                let totalScrapWeight = 0;
                let axleScraps = masterScraps.filter(s => s.axle_no === p.axle_no);
                
                let currStage = p.axle_current_stage || '';
                if (currStage === 'Delivered') currStage = 'Delivery';
                let currentStageIdx = stagesArray.indexOf(currStage);

                if (currentStageIdx === -1) {
                    if (axleScraps.length > 0) {
                        currentStageIdx = stagesArray.indexOf(axleScraps[0].stage_name);
                    } else {
                        currentStageIdx = 0; 
                    }
                }
                
                let pBatch = p.batch_number || baseBatch;
                let rmks = batchesDict[pBatch] ? (batchesDict[pBatch].remarks || "") : "";
                let lowerRmk = rmks.toLowerCase();
                let bLogs = logsData[pBatch] || [];
                
                let isAdminRecovered = false;
                if (lowerRmk.includes('admin') || lowerRmk.includes('recover') || lowerRmk.includes('master correction')) {
                    isAdminRecovered = true;
                }
                if (bLogs.some(l => (l.action_taken && l.action_taken.toLowerCase().includes('admin')) || (l.remark && l.remark.toLowerCase().includes('admin')))) {
                    isAdminRecovered = true;
                }
                
                let isScrapPiece = (p.status === 'Scrap' || p.status === 'Reject');
                let isHoldPiece = pBatch.includes('-P');
                
                let rejectStageIdx = -1;
                if (isScrapPiece) {
                    if (axleScraps.length > 0) {
                        rejectStageIdx = stagesArray.indexOf(axleScraps[axleScraps.length - 1].stage_name);
                    } else {
                        rejectStageIdx = currentStageIdx !== -1 ? currentStageIdx : 1; 
                    }
                }

                // ==========================================
                // REWORK ORIGIN AND DEST LOGIC
                // ==========================================
                let reworkDests = new Set();
                let reworkOrigins = new Set();
                
                if (!isScrapPiece && !isAdminRecovered) {
                    allFamily.forEach(b => {
                        let rbLogs = logsData[b] || [];
                        let rbInfo = batchesDict[b] || {};
                        
                        rbLogs.forEach(l => {
                            let act = (l.action_taken || "").toLowerCase();
                            let rmk = (l.remark || "").toLowerCase();
                            let axleStr = p.axle_no.toLowerCase();
                            
                            if (act.includes("rework") && (act.includes(axleStr) || rmk.includes(axleStr))) {
                                if (stagesArray.includes(l.stage_name)) {
                                    reworkOrigins.add(stagesArray.indexOf(l.stage_name));
                                }
                                let destMatch = rmk.match(/to\s+(.*?)\s+for/i);
                                if (destMatch && stagesArray.includes(destMatch[1].trim())) {
                                    reworkDests.add(stagesArray.indexOf(destMatch[1].trim()));
                                }
                            }
                        });
                        
                        let inSubBatch = b.includes('-R') && (
                            (piecesData[b] && piecesData[b].some(x => x.axle_no === p.axle_no)) ||
                            rbLogs.some(l => (l.remark || "").includes(p.axle_no) || (l.action_taken || "").includes(p.axle_no))
                        );
                        
                        if (inSubBatch) {
                            let m = (rbInfo.remarks || "").match(/\[Origin:\s*(.*?)\]/i);
                            if (m && stagesArray.includes(m[1].trim())) {
                                reworkOrigins.add(stagesArray.indexOf(m[1].trim()));
                            }
                            if (rbLogs.length > 0 && stagesArray.includes(rbLogs[0].stage_name)) {
                                reworkDests.add(stagesArray.indexOf(rbLogs[0].stage_name));
                            }
                        }
                    });
                }

                let pbInfo = batchesDict[pBatch] || {};
                let isFullyDelivered = (pbInfo.status === 'Delivered' || pbInfo.status === 'Successfully Delivered' || (p.status === 'QA Completed' && p.axle_current_stage === 'Delivered'));

                axleHtml += `<tr>
                    <td style="position: sticky; left: 0; background: #fff; z-index: 5; border-bottom: 1px solid #eee; border-right: 1px solid #ddd; padding: 8px; text-align:center;">${idx + 1}</td>
                    <td style="position: sticky; left: 40px; background: #fff; z-index: 5; font-weight:bold; color:#2c3e50; border-bottom: 1px solid #eee; border-right: 2px solid #ddd; padding: 8px; text-align:center;">${p.axle_no}</td>`;
                    
                stagesArray.forEach((stage, sIdx) => {
                    let cellHtml = '';
                    let lightHtml = '';
                    let remarkHtml = '';
                    let scrapHtml = '';
                    
                    let stageScraps = axleScraps.filter(s => s.stage_name === stage);
                    if (stageScraps.length > 0) {
                        stageScraps.forEach(s => {
                            let w = parseFloat(s.reason);
                            if(!isNaN(w)) totalScrapWeight += w;
                            if (s.reason.includes('Process Scrap')) {
                                scrapHtml += `<div style="color:#d35400; font-size:10px; margin-top:4px; border-top:1px dashed #fad7a1; padding-top:2px;">⚙️ Loss: ${s.reason}</div>`;
                            } else {
                                scrapHtml += `<div style="color:#c0392b; font-size:10px; margin-top:4px; border-top:1px dashed #fad7a1; padding-top:2px;">📝 Note: ${s.reason}</div>`;
                            }
                        });
                    }

                    let isCurrent = (sIdx === currentStageIdx);
                    let isDeliveryCol = (stage === 'Delivery');
                    
                    let state = 'empty';

                    // --- STRICT STATE MACHINE ---
                    if (isScrapPiece) {
                        if (sIdx === rejectStageIdx) state = 'scrap';
                        else if (sIdx < rejectStageIdx) state = 'pass';
                    } 
                    else if (isAdminRecovered && isCurrent && !isDeliveryCol) { 
                        state = 'active_recovered';
                    } 
                    else {
                        if (isDeliveryCol && isFullyDelivered) {
                            state = 'delivered';
                        } else if (isCurrent && !isFullyDelivered) {
                            state = (p.status === 'Pending' && sIdx === 0 && stageScraps.length === 0) ? 'empty' : 'active';
                        } else if (reworkDests.has(sIdx)) {
                            state = (!isFullyDelivered && pBatch.includes('-R')) ? 'rework_active' : 'pass_rework';
                        } else if (reworkOrigins.has(sIdx) && currentStageIdx <= sIdx && !isFullyDelivered) {
                            state = 'rework_origin';
                        } else if (sIdx < currentStageIdx || isFullyDelivered) {
                            state = 'pass';
                        }
                    }

                    if (state === 'empty' && stageScraps.length > 0) {
                        state = 'pass';
                    }

                    // --- GENERATE UI BASED ON FINAL STATE ---
                    if (state === 'pass') {
                        lightHtml = `<div style="color:#27ae60; font-weight:bold; font-size:11px;">✅ Pass</div>`;
                    } else if (state === 'pass_rework') {
                        lightHtml = `<div style="color:#8e44ad; font-weight:bold; font-size:11px;">✅ Reworked</div>`;
                    } else if (state === 'delivered') {
                        lightHtml = `<div style="color:#27ae60; font-weight:bold; font-size:11px;">✅ Delivered</div>`;
                        if (isAdminRecovered) lightHtml += `<div style="color:#e67e22; font-size:9px; font-weight:bold; margin-top:2px;">(Admin Recovered)</div>`;
                        else if (reworkDests.size > 0) lightHtml += `<div style="color:#8e44ad; font-size:9px; font-weight:bold; margin-top:2px;">(Rework Split)</div>`;
                    } else if (state === 'active') {
                        lightHtml = `<div style="color:#2980b9; font-weight:bold; font-size:11px;">🔵 Active Here</div>`;
                        if (isHoldPiece) lightHtml += `<div style="color:#f39c12; font-size:9px; font-weight:bold; margin-top:2px;">(From Hold)</div>`;
                    } else if (state === 'active_recovered') {
                        lightHtml = `<div style="color:#27ae60; font-weight:bold; font-size:11px;">🔵 Active Here</div><div style="color:#e67e22; font-size:9px; font-weight:bold; margin-top:2px;">(Admin Recovered)</div>`;
                    } else if (state === 'rework_active') {
                        lightHtml = `<div style="color:#8e44ad; font-weight:bold; font-size:11px;">🟣 Reworking</div>`;
                    } else if (state === 'rework_origin') {
                        lightHtml = `<div style="color:#e67e22; font-weight:bold; font-size:11px;">🔙 Sent back</div>`;
                    } else if (state === 'scrap') {
                        let isRMReject = ['Receiving', 'RM QC', 'Processing'].includes(stage);
                        let text = isRMReject ? 'RM Rejected' : 'Prod. Damaged';
                        lightHtml = `<div style="color:#e74c3c; font-weight:bold; font-size:11px;">❌ ${text}</div>`;
                        if (p.reject_reason) remarkHtml = `<div style="color:#e74c3c; font-size:10px; margin-top:2px;">📝 ${p.reject_reason}</div>`;
                    } else if (state === 'empty') {
                        lightHtml = `<div style="color:#bdc3c7; font-weight:bold; font-size:11px; opacity:0.6;">⚪ Pending</div>`;
                    }

                    if (state !== 'empty' || scrapHtml) {
                        cellHtml = `<div style="background:#fdfdfd; padding:6px; border-radius:4px; border:1px solid #f0f0f0; min-height:40px;">
                            ${lightHtml}
                            ${remarkHtml}
                            ${scrapHtml}
                        </div>`;
                    } else {
                        cellHtml = `<div style="color:#bdc3c7; text-align:center; opacity:0.6;">${lightHtml}</div>`;
                    }

                    axleHtml += `<td style="border-bottom: 1px solid #eee; border-right: 1px solid #f5f5f5; padding: 5px; vertical-align: top;">${cellHtml}</td>`;
                });
                
                axleHtml += `<td style="border-bottom: 1px solid #eee; border-left: 2px solid #f1c40f; background: #fffcf5; padding: 8px; font-weight:bold; color:#e67e22; text-align:center; vertical-align: middle;">${totalScrapWeight > 0 ? totalScrapWeight.toFixed(2) + ' kg' : '-'}</td>
                </tr>`;
            });
        }
        
        axleHtml += `</tbody></table></div>`;
        document.getElementById('axleMasterViewContainer').innerHTML = axleHtml;

        document.getElementById('pipelineModal').style.display = 'flex';
        
    } catch (error) {
        console.error("Error opening popup:", error);
        alert("A technical issue occurred! Please check 'Inspect > Console' for details.");
    }
}

function printMasterView() {
    let batchNo = document.getElementById('pipelineModalTitle').innerText.replace('Timeline & Summary: ', '').replace(/ \(Opened via.*?\)/, '');
    let summaryContent = document.getElementById('batchSummaryBox').innerHTML;
    let printContent = document.querySelector('#axleMasterViewContainer table').outerHTML;
    
    let printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Traceability Report - ${batchNo}</title>
            <style>
                @page { size: A4 landscape; margin: 10mm; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; font-size: 11px; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                h2 { text-align: center; color: #2c3e50; margin-top: 0; margin-bottom: 10px; border-bottom: 2px solid #2c3e50; padding-bottom: 5px; font-size: 16px; text-transform: uppercase; }
                .summary { background: #f8f9fa; border: 1px solid #dee2e6; padding: 10px; margin-bottom: 15px; font-size: 12px; border-radius: 4px; }
                html, body { height: auto !important; overflow: visible !important; min-height: 100%; background-color: #fff !important; }
                table { width: 100% !important; min-width: 100% !important; max-width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; page-break-inside: auto !important; }
                thead { display: table-header-group !important; }
                tfoot { display: table-footer-group !important; }
                tr { page-break-inside: avoid !important; page-break-after: auto !important; }
                th, td { border: 1px solid #bdc3c7 !important; padding: 6px !important; position: static !important; vertical-align: top !important; box-shadow: none !important; background-color: #fff !important; word-wrap: break-word; }
                th { background-color: #ecf0f1 !important; color: #2c3e50 !important; font-weight: bold !important; font-size: 10px; }
                div[style*="background:#fdfdfd"] { border: none !important; padding: 0 !important; min-height: auto !important; }
                .footer { margin-top: 30px; display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; border-top: 1px solid #bdc3c7; padding-top: 10px; page-break-inside: avoid; }
            </style>
        </head>
        <body>
            <h2>Master Traceability Report - Batch: ${batchNo}</h2>
            <div class="summary">${summaryContent}</div>
            ${printContent}
            <div class="footer">
                <div>Printed By: ${currentUsername}</div>
                <div>Date & Time: ${new Date().toLocaleString()}</div>
                <div>Authorized Signature: _______________________</div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function() { printWindow.print(); printWindow.close(); }, 500);
}

function exportCurrentListTabToExcel() {
    let activeTabBtn = document.querySelector('.tab-btn.active');
    let tabTitle = activeTabBtn ? activeTabBtn.replace('❌', '').trim() : "Production Report";
    let activeTabContent = document.querySelector('.tab-content.active table').outerHTML;
    
    let printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>${tabTitle}</title>
            <style>
                @page { size: A4 landscape; margin: 10mm; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; font-size: 11px; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                h2 { text-align: center; color: #2c3e50; margin-top: 0; margin-bottom: 15px; border-bottom: 2px solid #2c3e50; padding-bottom: 5px; font-size: 18px; text-transform: uppercase; }
                html, body { height: auto !important; overflow: visible !important; min-height: 100%; background-color: #fff !important; }
                table { width: 100% !important; border-collapse: collapse !important; page-break-inside: auto !important; }
                thead { display: table-header-group !important; }
                tfoot { display: table-footer-group !important; }
                tr { page-break-inside: avoid !important; page-break-after: auto !important; }
                th, td { border: 1px solid #bdc3c7 !important; padding: 8px !important; position: static !important; text-align: left; vertical-align: top !important; word-wrap: break-word; }
                th { background-color: #ecf0f1 !important; color: #2c3e50 !important; font-weight: bold !important; font-size: 12px; }
                a { text-decoration: none; color: #2c3e50; font-weight: bold; }
                .stage-badge { border: 1px solid #7f8c8d; padding: 2px 6px; border-radius: 3px; font-weight: bold; display: inline-block; margin-bottom: 2px; }
                .batch-actions { display: none !important; } 
                .footer { margin-top: 30px; display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; border-top: 1px solid #bdc3c7; padding-top: 10px; page-break-inside: avoid; }
                ul { margin-top: 0; padding-left: 15px; }
            </style>
        </head>
        <body>
            <h2>Mohata Coal Co. - ${tabTitle}</h2>
            ${activeTabContent}
            <div class="footer">
                <div>Printed By: ${currentUsername}</div>
                <div>Date & Time: ${new Date().toLocaleString()}</div>
                <div>Authorized Signature: _______________________</div>
            </div>
            <script>
                let ths = document.querySelectorAll('thead th');
                let actionIndex = -1;
                ths.forEach((th, index) => {
                    if(th.innerText.trim().toUpperCase() === 'ACTION') actionIndex = index;
                });
                if(actionIndex !== -1) {
                    document.querySelectorAll('thead tr').forEach(tr => {
                        if(tr.children.length > actionIndex) tr.removeChild(tr.children[actionIndex]);
                    });
                    document.querySelectorAll('tbody tr').forEach(tr => {
                        if(tr.children.length > actionIndex) tr.removeChild(tr.children[actionIndex]);
                    });
                }
                setTimeout(function() { window.print(); window.close(); }, 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
}

function exportMasterViewToExcel() {
    let batchNo = document.getElementById('pipelineModalTitle').innerText.replace('Timeline & Summary: ', '').replace(/ \(Opened via.*?\)/, '');
    let summaryContent = document.getElementById('batchSummaryBox').innerText.replace(/\n/g, '<br>');
    let tableHtml = document.querySelector('#axleMasterViewContainer table').cloneNode(true);
    
    let fullHtml = `
        <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="utf-8"></head>
        <body>
            <h2>Master Traceability Report - Batch: ${batchNo}</h2>
            <div style="font-size: 14px; margin-bottom: 20px;">${summaryContent}</div>
            <table border="1">${tableHtml.innerHTML}</table>
        </body>
        </html>`;
    
    let blob = new Blob(['\ufeff', fullHtml], { type: 'application/vnd.ms-excel' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = `Traceability_Report_${batchNo}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ⚙️ GOD MODE / MASTER OVERRIDE UI
function openAdminOverrideModal(batchNo, batchStage, batchStatus, specificAxleNo = null) {
    document.getElementById('overrideBatchNumber').value = batchNo;
    
    let bStageSelect = document.getElementById('overrideBatchStage');
    let stageOptions = stagesArray.map(s => `<option value="${s}" ${s === batchStage ? 'selected' : ''}>${s}</option>`).join('');
    stageOptions += `<option value="Delivered" ${batchStage === 'Delivered' ? 'selected' : ''}>Delivered</option>
                     <option value="Reworking" ${batchStage === 'Reworking' ? 'selected' : ''}>Reworking</option>`;
    bStageSelect.innerHTML = stageOptions;
    
    document.getElementById('overrideBatchStatus').value = batchStatus || 'Approved';
    
    let list = [];
    let baseBatch = batchNo.split('-R')[0].split('-P')[0];
    
    if (specificAxleNo) {
        let familyPieces = masterPiecesData[baseBatch] || [];
        list = familyPieces.filter(p => p.axle_no === specificAxleNo);
    } else if (!batchNo.includes('-R') && !batchNo.includes('-P')) {
        list = masterPiecesData[baseBatch] || [];
    } else {
        list = piecesData[batchNo] || [];
    }
    
    let uniqueList = [];
    let seen = new Set();
    for (let p of list) {
        if (!seen.has(p.axle_no)) {
            seen.add(p.axle_no);
            uniqueList.push(p);
        }
    }
    uniqueList.sort((a, b) => parseInt(a.sl_no) - parseInt(b.sl_no));
    list = uniqueList;

    let container = document.getElementById('overrideAxleInputsContainer');
    
    let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
                <tr style="border-bottom: 2px solid #ddd;">
                    <th style="padding: 10px; width: 10%; color: #495057;">Sl</th>
                    <th style="padding: 10px; width: 25%; color: #495057;">Axle No & Current State</th>
                    <th style="padding: 10px; width: 35%; color: #495057;">Move to Stage (Revert/Forward)</th>
                    <th style="padding: 10px; width: 30%; color: #495057;">New Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    list.forEach(p => {
        let effectiveStatus = p.status;
        
        if (effectiveStatus === 'Rework' && !(p.batch_number || '').includes('-R')) {
            effectiveStatus = 'Pass';
        }
        
        let isRMQCReject = (p.status === 'Scrap' || p.status === 'Reject') && ['Receiving', 'RM QC', 'Processing'].includes(p.axle_current_stage);
        let isProdDamage = (p.status === 'Scrap' || p.status === 'Reject') && !['Receiving', 'RM QC', 'Processing'].includes(p.axle_current_stage);
        
        let s_pending = effectiveStatus === 'Pending' ? 'selected' : '';
        let s_pass = effectiveStatus === 'Pass' ? 'selected' : '';
        let s_scrap = (effectiveStatus === 'Scrap' || effectiveStatus === 'Reject') ? 'selected' : '';
        let s_rework = effectiveStatus === 'Rework' ? 'selected' : '';

        let aStageOpts = stagesArray.map(s => `<option value="${s}" ${s === p.axle_current_stage ? 'selected' : ''}>${s}</option>`).join('');
        aStageOpts += `<option value="Delivered" ${p.axle_current_stage === 'Delivered' ? 'selected' : ''}>Delivered</option>`;

        let color = effectiveStatus === 'Pass' ? '#27ae60' : (isProdDamage ? '#c0392b' : (isRMQCReject ? '#e74c3c' : (effectiveStatus === 'Rework' ? '#8e44ad' : '#f39c12')));
        
        let currentStatusText = effectiveStatus === 'Pass' ? '✅ Active' : 
                               (isRMQCReject ? '❌ RM Rejected' : 
                               (isProdDamage ? '🔨 Prod. Damaged' : 
                               (effectiveStatus === 'Rework' ? '🔄 Rework' : '⏳ Pending')));
                               
        let rowBg = (effectiveStatus === 'Scrap' || effectiveStatus === 'Reject') ? '#fadbd8' : '#fff';

        html += `
            <tr style="border-bottom: 1px solid #eee; background: ${rowBg}; transition: background 0.3s;">
                <td style="padding: 10px; font-weight: bold; color: #34495e;">${p.sl_no}</td>
                <td style="padding: 10px;">
                    <input type="hidden" name="override_old_axle[]" value="${p.axle_no}">
                    <input type="hidden" name="override_axle_no[]" value="${p.axle_no}">
                    <div style="font-weight: bold; color: #2c3e50; font-size: 14px;">${p.axle_no}</div>
                    <div style="font-size: 11px; margin-top: 3px; font-weight: bold; color: ${color};">${currentStatusText}<br>at ${p.axle_current_stage}</div>
                </td>
                <td style="padding: 10px;">
                    <select name="override_stage[]" style="width: 100%; padding: 8px; border: 1px solid #bdc3c7; border-radius: 4px; font-size: 12px; cursor: pointer;">
                        ${aStageOpts}
                    </select>
                </td>
                <td style="padding: 10px;">
                    <select name="override_status[]" style="width: 100%; padding: 8px; border: 1px solid #bdc3c7; border-radius: 4px; font-weight: bold; font-size: 12px; color: ${color}; cursor: pointer;" onchange="this.style.color = this.options[this.selectedIndex].style.color; this.parentElement.parentElement.style.background = (this.value === 'Scrap' || this.value === 'Reject') ? '#fadbd8' : '#fff';">
                        <option value="Pass" ${s_pass} style="color: #27ae60;">✅ Active / Pass</option>
                        <option value="Scrap" ${s_scrap} style="color: #e74c3c;">❌ Damaged / Rejected</option>
                        <option value="Rework" ${s_rework} style="color: #8e44ad;">🔄 Rework</option>
                        <option value="Pending" ${s_pending} style="color: #f39c12;">⏳ Pending</option>
                    </select>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
    
    document.getElementById('adminOverrideModal').style.display = 'flex';
}

// Global Modals and Users Management
function toggleDropdown() { document.getElementById('profileDropdown').classList.toggle('active'); }

function openUsersModal() { document.getElementById('usersModal').style.display = 'flex'; }
function closeUsersModal() { document.getElementById('usersModal').style.display = 'none'; }

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
    
    // Use stagesArray logic here to render checkboxes dynamically like before
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

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) event.target.style.display = "none";
    if (!event.target.matches('.profile-btn') && !event.target.closest('.profile-btn')) {
        let dropdowns = document.getElementsByClassName('profile-dropdown');
        for (let i = 0; i < dropdowns.length; i++) dropdowns[i].classList.remove('active');
    }
}

function openPasswordModal() { document.getElementById('passwordModal').style.display = 'flex'; }
function closePasswordModal() { document.getElementById('passwordModal').style.display = 'none'; }

window.addEventListener("pageshow", function (event) { if (event.persisted) window.location.reload(); });

// ----------------------------------------------------
// NEW FEATURE: Delivery Challan Print View (DYNAMIC MATH)
// ----------------------------------------------------

function openDeliveryChallan(batchNo, clientName, invoiceNo, qty, deliveryTime, logRemark) {
    let list = piecesData[batchNo] || [];
    let validAxles = list.filter(p => p.status !== 'Scrap' && p.status !== 'Reject');
    
    let baseBatch = batchNo.split('-R')[0].split('-P')[0];
    let baseBatchInfo = batchesDict[baseBatch] || {};
    
    let totalRecv = parseInt(baseBatchInfo.quantity) || 0;
    let rmRejected = 0;
    let prodDamaged = 0;
    
    // === DYNAMIC EXACT COUNT FROM LIVE PIECES ===
    let familyPieces = masterPiecesData[baseBatch] || [];
    if(familyPieces.length > 0) {
        let seen = new Set();
        familyPieces.forEach(p => {
            if(!seen.has(p.axle_no)) {
                seen.add(p.axle_no);
                let isScrap = (p.status === 'Scrap' || p.status === 'Reject');
                if (isScrap) {
                    if (['Receiving', 'RM QC', 'Processing'].includes(p.axle_current_stage)) {
                        rmRejected++;
                    } else {
                        prodDamaged++;
                    }
                }
            }
        });
    } else {
        rmRejected = parseInt(baseBatchInfo.rejected_qty) || 0;
        prodDamaged = parseInt(baseBatchInfo.damaged_qty) || 0;
    }
    let sentToProd = totalRecv - rmRejected;
    // ============================================

    // Extract hidden data from remark string
    let dispatchFrom = "Mohata Coal Co. Pvt. Ltd. (Factory)";
    let deliveryTo = clientName;
    let vehicleNo = "N/A";
    let driverName = "N/A";
    let actualRemark = logRemark || "";

    let fromMatch = actualRemark.match(/\[From:\s*(.*?)\]/);
    if (fromMatch) dispatchFrom = fromMatch[1];
    
    let toMatch = actualRemark.match(/\[To:\s*(.*?)\]/);
    if (toMatch) deliveryTo = toMatch[1];
    
    let vehMatch = actualRemark.match(/\[Vehicle:\s*(.*?)\]/);
    if (vehMatch) vehicleNo = vehMatch[1];
    
    let drvMatch = actualRemark.match(/\[Driver:\s*(.*?)\]/);
    if (drvMatch) driverName = drvMatch[1];
    
    let noteMatch = actualRemark.match(/Note:\s*(.*)/);
    if (noteMatch) actualRemark = noteMatch[1];

    // Build the axles table
    let axleHtml = '';
    if (validAxles.length > 0) {
        axleHtml = `
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; text-align: left;">
                <thead style="background: #f8f9fa;">
                    <tr>
                        <th style="border: 1px solid #ddd; padding: 8px; width: 15%;">Sl No</th>
                        <th style="border: 1px solid #ddd; padding: 8px; width: 85%;">Axle Number</th>
                    </tr>
                </thead>
                <tbody>
        `;
        validAxles.forEach((p, index) => {
            axleHtml += `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; color: #2c3e50;">${p.axle_no}</td>
                </tr>
            `;
        });
        axleHtml += `</tbody></table>`;
    } else {
        axleHtml = `<p style="color: #7f8c8d; font-size: 12px; font-style: italic;">No specific axle data found for this delivery.</p>`;
    }

    let challanBody = `
        <div id="printableChallanContent" style="background: #fff; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333;">
            
            <!-- Header -->
            <div style="text-align: center; border-bottom: 2px solid #2c3e50; padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #2c3e50; font-size: 24px; text-transform: uppercase;">MOHATA COAL CO. PVT. LTD.</h2>
                <h3 style="margin: 5px 0 0 0; color: #7f8c8d; font-size: 15px; letter-spacing: 2px;">DELIVERY CHALLAN</h3>
            </div>
            
            <!-- Details Grid -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
                <div>
                    <span style="color: #7f8c8d;">Challan / Batch No:</span> <strong style="font-size: 15px; color: #2980b9;">${batchNo}</strong><br>
                    <span style="color: #7f8c8d;">Invoice No:</span> <strong>${invoiceNo}</strong><br>
                    <span style="color: #7f8c8d;">Dispatch Date & Time:</span> <strong>${deliveryTime}</strong>
                </div>
                <div style="text-align: right;">
                    <span style="color: #7f8c8d;">Vehicle No:</span> <strong style="font-size: 14px; padding: 2px 5px; background: #eef2f7; border: 1px solid #d5e1ed; border-radius: 3px;">${vehicleNo}</strong><br>
                    <span style="color: #7f8c8d;">Driver Name:</span> <strong>${driverName}</strong>
                </div>
            </div>

            <!-- From & To Box -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 10px 15px; background: #fdfdfd; border: 1px solid #eee; border-radius: 4px;">
                <div style="width: 48%;">
                    <strong style="color: #7f8c8d; font-size: 11px; text-transform: uppercase;">Dispatch From:</strong><br>
                    <span style="font-size: 14px; font-weight: bold; color: #2c3e50;">${dispatchFrom}</span>
                </div>
                <div style="width: 48%; text-align: right;">
                    <strong style="color: #7f8c8d; font-size: 11px; text-transform: uppercase;">Delivery To:</strong><br>
                    <span style="font-size: 14px; font-weight: bold; color: #2c3e50;">${deliveryTo}</span>
                </div>
            </div>

            <!-- Flow Summary Box -->
            <div style="margin-bottom: 20px; border: 1px solid #bdc3c7; border-radius: 4px; overflow: hidden;">
                <div style="background: #ecf0f1; padding: 8px 10px; font-weight: bold; font-size: 12px; color: #34495e; border-bottom: 1px solid #bdc3c7;">
                    📊 Batch Processing Summary
                </div>
                <div style="display: flex; justify-content: space-between; padding: 10px; text-align: center; font-size: 12px;">
                    <div><span style="color: #7f8c8d;">Total Received</span><br><strong style="font-size: 14px;">${totalRecv}</strong></div>
                    <div><span style="color: #7f8c8d;">RM QC Return</span><br><strong style="font-size: 14px; color: #e74c3c;">${rmRejected}</strong></div>
                    <div><span style="color: #7f8c8d;">Prod. Intake</span><br><strong style="font-size: 14px; color: #2980b9;">${sentToProd}</strong></div>
                    <div><span style="color: #7f8c8d;">Prod. Damaged</span><br><strong style="font-size: 14px; color: #c0392b;">${prodDamaged}</strong></div>
                    <div style="background: #e8f8f5; padding: 4px 10px; border-radius: 4px; border: 1px solid #27ae60;">
                        <span style="color: #27ae60; font-weight: bold;">Delivered Qty</span><br>
                        <strong style="font-size: 16px; color: #27ae60;">${qty} Pcs</strong>
                    </div>
                </div>
            </div>
            
            <h4 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 14px;">Item Details (Delivered Axles)</h4>
            ${axleHtml}

            ${actualRemark ? `<div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-left: 4px solid #f39c12; font-size: 12px; color: #856404;"><strong>Additional Note:</strong> ${actualRemark}</div>` : ''}
            
            <!-- Signatures -->
            <div style="margin-top: 60px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; border-top: 1px dashed #bdc3c7; padding-top: 20px;">
                <div style="text-align: center;">
                    <p style="margin: 0 0 30px 0; color: #bdc3c7;">_________________________</p>
                    <p style="margin: 0; color: #34495e;">Authorized Signature</p>
                    <p style="margin: 5px 0 0 0; font-size: 10px; color: #7f8c8d;">Mohata Coal Co. Pvt. Ltd.</p>
                </div>
                <div style="text-align: center;">
                    <p style="margin: 0 0 30px 0; color: #bdc3c7;">_________________________</p>
                    <p style="margin: 0; color: #34495e;">Receiver's Signature & Seal</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('deliveryChallanBody').innerHTML = challanBody;
    document.getElementById('deliveryChallanModal').style.display = 'flex';
}

function closeDeliveryChallanModal() {
    document.getElementById('deliveryChallanModal').style.display = 'none';
}

function printDeliveryChallan() {
    let printContent = document.getElementById('printableChallanContent').innerHTML;
    let printWindow = window.open('', '_blank', 'width=800,height=900');
    
    printWindow.document.write(`
        <html>
        <head>
            <title>Delivery Challan</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
                table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f8f9fa !important; -webkit-print-color-adjust: exact; color: #2c3e50; }
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            ${printContent}
            <script>
                setTimeout(function() { window.print(); window.close(); }, 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
// ==========================================
// AUTO LOGOUT ON INACTIVITY (15 SECONDS)
// ==========================================
let inactivityTimeout;

function autoLogoutSystem() {
    // 1. Prothome background-e Machine theke logout korbe
    fetch('/logout_machine', { 
        method: 'POST' 
    }).finally(() => {
        // 2. Tarpor puro app theke logout kore login page-e niye jabe
        window.location.href = '/logout'; 
    });
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    
    // 15000 milliseconds = 15 seconds. 
    // (Jodi pore somoy barate chan, jemon 5 minute korar jonno ekhane 300000 likhben)
    inactivityTimeout = setTimeout(autoLogoutSystem, 15000); 
}

// User screen-e kono kaj korle timer abar prothom theke shuru hobe
window.onload = resetInactivityTimer;
document.onmousemove = resetInactivityTimer;
document.onkeypress = resetInactivityTimer;
document.ontouchstart = resetInactivityTimer;
document.onclick = resetInactivityTimer;
document.onscroll = resetInactivityTimer;
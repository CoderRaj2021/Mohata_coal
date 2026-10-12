// Get hidden data from HTML
const piecesDataEl = document.getElementById('piecesDataJson');
const piecesData = piecesDataEl ? JSON.parse(piecesDataEl.textContent || "{}") : {};

const usernameEl = document.getElementById('currentUsernameJson');
const currentUsername = usernameEl ? JSON.parse(usernameEl.textContent || '""') : "";

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

document.addEventListener("DOMContentLoaded", function() {
    let savedTab = localStorage.getItem('clientSupplyActiveTab');
    if(savedTab) {
        let tabBtn = document.querySelector(`button[onclick*="${savedTab}"]`);
        if(tabBtn) { tabBtn.click(); }
    }
});

function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) tabcontent[i].classList.remove("active");
    tablinks = document.getElementsByClassName("tab-btn");
    for (i = 0; i < tablinks.length; i++) tablinks[i].classList.remove("active");
    
    document.getElementById(tabName).classList.add("active");
    if(evt) evt.currentTarget.classList.add("active");
    localStorage.setItem('clientSupplyActiveTab', tabName);
}

function printQR(batchNo, clientName, receiveDate, quantity) {
    let list = piecesData[batchNo] || [];
    let axleString = list.map(p => p.axle).join(', ');
    
    let qrText = `Batch No: ${batchNo}\nClient: ${clientName}\nDate: ${receiveDate}\nTotal Qty: ${quantity} pcs\n`;
    if (list.length > 0) {
        qrText += `Axle Nos: ${axleString}`;
    } else {
        qrText += `Axle Nos: Not entered`;
    }

    let encodedText = encodeURIComponent(qrText);
    
    let printWindow = window.open('', '_blank', 'width=500,height=550');
    let qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodedText}`;
    
    printWindow.document.write(`
        <html>
        <head>
            <title>Print QR - ${batchNo}</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding-top: 30px; }
                .qr-container { border: 2px dashed #333; padding: 20px; display: inline-block; border-radius: 8px;}
                h2 { margin: 0 0 10px 0; font-size: 22px; color: #2c3e50;}
                p { margin: 5px 0; font-size: 14px; color: #555; }
                button { margin-top: 30px; padding: 10px 20px; font-size: 16px; cursor: pointer; background: #3498db; color: white; border: none; border-radius: 5px;}
                @media print { button { display: none; } .qr-container { border: none; } }
            </style>
        </head>
        <body>
            <div class="qr-container">
                <h2>Batch: ${batchNo}</h2>
                <img src="${qrUrl}" alt="QR Code">
                <p style="margin-top:15px; font-weight:bold;">Scan for details</p>
            </div>
            <br><button onclick="window.print()">Print Label</button>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function openAddBatchModal() { 
    document.getElementById('step1Form').reset();
    document.getElementById('addBatchModal').style.display = 'flex'; 
}
function closeAddBatchModal() { document.getElementById('addBatchModal').style.display = 'none'; }

async function goToStep2() {
    let form = document.getElementById('step1Form');
    if(!form.checkValidity()) { form.reportValidity(); return; }

    let qty = parseInt(document.getElementById('init_quantity').value);
    if(qty <= 0) { alert("Quantity must be at least 1."); return; }

    let receiveDate = document.getElementById('init_receive_date').value;
    let manualBatchNo = document.getElementById('init_batch_no').value.trim();

    if(!manualBatchNo) { alert("Please enter a valid Batch No."); return; }

    let btnNext = document.getElementById('btnNextStep');
    btnNext.innerText = "Loading...";
    btnNext.disabled = true;

    try {
        let batchNo = manualBatchNo;

        document.getElementById('final_client_name').value = document.getElementById('init_client_name').value;
        document.getElementById('final_invoice_no').value = document.getElementById('init_invoice_no').value;
        document.getElementById('final_receive_date').value = receiveDate;
        document.getElementById('final_quantity').value = qty;
        document.getElementById('final_batch_number').value = batchNo;

        let container = document.getElementById('axleInputsContainer');
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
                    <tr style="border-bottom: 2px solid #ddd;">
                        <th style="padding: 10px; width: 15%; color: #495057;">Sl No</th>
                        <th style="padding: 10px; width: 35%; color: #495057;">Batch No</th>
                        <th style="padding: 10px; width: 50%; color: #495057;">Axle No</th>
                    </tr>
                </thead>
                <tbody>
        `;
        for(let i=1; i<=qty; i++) {
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px; font-weight: bold; color: #34495e;">${i}</td>
                    <td style="padding: 10px;"><span style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #475569; font-size: 12px; display: inline-block;">${batchNo}</span></td>
                    <td style="padding: 10px;"><input type="text" name="axle_no[]" placeholder="Type Axle No..." required style="width: 100%; padding: 8px; border: 1px solid #bdc3c7; border-radius: 4px; box-sizing: border-box; margin: 0;"></td>
                </tr>
            `;
        }
        html += `</tbody></table>`;
        container.innerHTML = html;

        document.getElementById('addBatchModal').style.display = 'none';
        document.getElementById('axleModal').style.display = 'flex';
        
    } catch (error) {
        alert("An error occurred. Please try again.");
    } finally {
        btnNext.innerText = "Next: Enter Axle Nos ➔";
        btnNext.disabled = false;
    }
}

function goBackToStep1() {
    document.getElementById('axleModal').style.display = 'none';
    document.getElementById('addBatchModal').style.display = 'flex';
}

function viewAxles(batchNo) {
    document.getElementById('viewAxlesTitle').innerText = 'Axle Details: ' + batchNo;
    let list = piecesData[batchNo] || [];
    let html = '<table style="width: 100%; border-collapse: collapse; text-align: left;">';
    html += '<tr style="border-bottom: 2px solid #ddd; background: #f1f1f1;"><th style="padding: 8px;">Sl No</th><th style="padding: 8px;">Axle No</th><th style="padding: 8px;">Status</th></tr>';
    
    if (list.length === 0) {
        html += '<tr><td colspan="3" style="padding: 10px; color: #e74c3c; font-style: italic; text-align: center;">No axle details found.</td></tr>';
    } else {
        list.forEach(p => { 
            let stHtml = '';
            if (p.status === 'Pass') {
                stHtml = '<span class="qc-pass" style="color:#27ae60; font-weight:bold;">✅ Pass</span>';
            } else if (p.status === 'Reject') {
                stHtml = '<span class="qc-reject" style="color:#e74c3c; font-weight:bold;">❌ RM Reject</span>';
            } else if (p.status === 'Scrap') {
                stHtml = '<span style="color:#c0392b; font-weight:bold;">🔨 Prod. Damaged</span>';
            } else if (p.status === 'Rework') {
                stHtml = '<span style="color:#8e44ad; font-weight:bold;">🔄 Rework</span>';
            } else {
                stHtml = '<span style="color:#f39c12; font-weight:bold;">⏳ Pending</span>';
            }
            
            let reasonHtml = p.reason ? `<br><span style="font-size:10px; color:#e74c3c;">${p.reason}</span>` : '';
            
            html += `<tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px; color: #7f8c8d; font-weight: bold;">${p.sl}</td>
                        <td style="padding: 8px; color: #2c3e50; font-weight: bold;">${p.axle}</td>
                        <td style="padding: 8px;">${stHtml} ${reasonHtml}</td>
                     </tr>`; 
        });
    }
    html += '</table>';
    document.getElementById('viewAxlesList').innerHTML = html;
    document.getElementById('viewAxlesModal').style.display = 'flex';
}
function closeViewAxlesModal() { document.getElementById('viewAxlesModal').style.display = 'none'; }

function openEditBatchModal(batchNo, clientName, invoiceNo, specificAxleNo = null) {
    document.getElementById('editBatchNumber').value = batchNo;
    document.getElementById('editClientName').value = clientName;
    document.getElementById('editInvoiceNo').value = invoiceNo;
    
    let baseBatch = batchNo.split('-R')[0].split('-P')[0];
    let rawList = [];

    if (specificAxleNo) {
        for (let b in piecesData) {
            if (b.startsWith(baseBatch)) {
                piecesData[b].forEach(p => { if(p.axle === specificAxleNo) rawList.push(p); });
            }
        }
    } else if (!batchNo.includes('-R') && !batchNo.includes('-P')) {
        for (let b in piecesData) {
            if (b.startsWith(baseBatch)) {
                piecesData[b].forEach(p => rawList.push(p));
            }
        }
    } else {
        rawList = piecesData[batchNo] || [];
    }

    let list = [];
    let seen = new Set();
    for (let i = rawList.length - 1; i >= 0; i--) {
        let p = rawList[i];
        if (!seen.has(p.axle)) {
            seen.add(p.axle);
            list.push(p);
        }
    }
    list.sort((a, b) => parseInt(a.sl) - parseInt(b.sl));

    let container = document.getElementById('editAxleInputsContainer');
    
    let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
                <tr style="border-bottom: 2px solid #ddd;">
                    <th style="padding: 10px; width: 10%; color: #495057;">Sl</th>
                    <th style="padding: 10px; width: 35%; color: #495057;">Axle No</th>
                    <th style="padding: 10px; width: 30%; color: #495057;">Status Override</th>
                    <th style="padding: 10px; width: 25%; color: #e74c3c; text-align: center;">Action</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    list.forEach(p => {
        let effectiveStatus = p.status;
        
        if (effectiveStatus === 'Rework' && !batchNo.includes('-R')) {
            effectiveStatus = 'Pass';
        }
        
        let isProdDamage = (p.status === 'Scrap');
        let isRMQCReject = (p.status === 'Reject');
        
        let s_pending = effectiveStatus === 'Pending' ? 'selected' : '';
        let s_pass = effectiveStatus === 'Pass' ? 'selected' : '';
        let s_reject = isRMQCReject ? 'selected' : '';
        let s_prod_damage = isProdDamage ? 'selected' : '';
        let s_rework = effectiveStatus === 'Rework' ? 'selected' : '';
        
        let color = effectiveStatus === 'Pass' ? '#27ae60' : (isProdDamage ? '#c0392b' : (isRMQCReject ? '#e74c3c' : (effectiveStatus === 'Rework' ? '#8e44ad' : '#f39c12')));

        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px; font-weight: bold; color: #34495e;">${p.sl}</td>
                <td style="padding: 10px;">
                    <input type="hidden" name="edit_axle_id[]" value="${p.id}">
                    <input type="text" name="edit_axle_no[]" value="${p.axle}" required style="width: 100%; padding: 6px; border: 1px solid #bdc3c7; border-radius: 4px; box-sizing: border-box; margin: 0;">
                </td>
                <td style="padding: 10px;">
                    <select name="edit_axle_status[]" style="width: 100%; padding: 6px; border: 1px solid #bdc3c7; border-radius: 4px; font-weight: bold; color: ${color};" onchange="this.style.color = this.value === 'Pass' ? '#27ae60' : (this.value === 'Reject' ? '#e74c3c' : (this.value === 'Scrap' ? '#c0392b' : (this.value === 'Rework' ? '#8e44ad' : '#f39c12')));">
                        <option value="Pending" ${s_pending} style="color: #f39c12;">⏳ Pending</option>
                        <option value="Pass" ${s_pass} style="color: #27ae60;">✅ Pass</option>
                        <option value="Reject" ${s_reject} style="color: #e74c3c;">❌ RM Reject</option>
                        <option value="Rework" ${s_rework} style="color: #8e44ad;">🔄 Rework</option>
                        ${isProdDamage ? `<option value="Scrap" ${s_prod_damage} style="color: #c0392b;">🔨 Prod. Damaged</option>` : ''}
                    </select>
                </td>
                <td style="padding: 10px; text-align: center;">
                    <label style="cursor: pointer; color: #e74c3c; font-weight: bold; font-size: 11px;">
                        <input type="checkbox" name="delete_axle_ids[]" value="${p.id}" style="width: auto; margin-right: 3px; cursor: pointer;"> 🗑️ Delete
                    </label>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
    
    document.getElementById('editBatchModal').style.display = 'flex';
}
function closeEditBatchModal() { document.getElementById('editBatchModal').style.display = 'none'; }

function openQCModal(batchNo) {
    document.getElementById('qcModal').style.display = 'flex';
    document.getElementById('qcBatchNumber').value = batchNo;
    document.getElementById('qcModalTitle').innerText = 'QC Check: ' + batchNo;
    
    let list = piecesData[batchNo] || [];
    let container = document.getElementById('qcPiecesContainer');
    
    let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
                <tr style="border-bottom: 2px solid #ddd;">
                    <th style="padding: 10px; width: 10%; color: #495057;">Sl</th>
                    <th style="padding: 10px; width: 30%; color: #495057;">Axle No</th>
                    <th style="padding: 10px; width: 30%; color: #495057;">QC Status</th>
                    <th style="padding: 10px; width: 30%; color: #495057;">Reason</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    list.forEach(p => {
        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px; font-weight: bold; color: #34495e;">
                    ${p.sl} <input type="hidden" name="sl_no[]" value="${p.sl}">
                </td>
                <td style="padding: 10px; font-weight: bold; color: #2980b9;">
                    ${p.axle} <input type="hidden" name="axle_${p.sl}" value="${p.axle}">
                </td>
                <td style="padding: 10px;">
                    <label class="qc-radio-label qc-pass">
                        <input type="radio" name="status_${p.sl}" value="Pass" checked onchange="toggleQCReason(${p.sl}, 'Pass')"> Pass
                    </label>
                    <label class="qc-radio-label qc-reject">
                        <input type="radio" name="status_${p.sl}" value="Reject" onchange="toggleQCReason(${p.sl}, 'Reject')"> Reject
                    </label>
                </td>
                <td style="padding: 10px;">
                    <input type="text" name="reason_${p.sl}" id="qc_reason_${p.sl}" placeholder="Rejection Reason..." style="display:none; width: 100%; padding: 6px; border: 1px solid #e74c3c; border-radius: 4px; box-sizing: border-box; margin: 0;">
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function toggleQCReason(sl, status) {
    let reasonInput = document.getElementById(`qc_reason_${sl}`);
    if(status === 'Reject') {
        reasonInput.style.display = 'block';
        reasonInput.required = true;
    } else {
        reasonInput.style.display = 'none';
        reasonInput.required = false;
        reasonInput.value = '';
    }
}

function closeQCModal() { document.getElementById('qcModal').style.display = 'none'; }

function openActionModal(batchNo, action) {
    document.getElementById('actionModal').style.display = 'flex';
    document.getElementById('modalBatchNumber').value = batchNo;
    document.getElementById('modalActionType').value = action;
    document.getElementById('modalRemark').value = '';
    
    let title = ''; let btnBg = '';
    
    if(action === 'forward') { title = 'Forward Batch: ' + batchNo; btnBg = '#27ae60'; document.getElementById('modalRemark').required = false; }
    else if(action === 'reject') { title = 'Reject All (Gate): ' + batchNo; btnBg = '#e67e22'; document.getElementById('modalRemark').required = false; }
    
    document.getElementById('actionModalTitle').innerText = title;
    document.getElementById('modalSubmitBtn').style.background = btnBg;
}
function closeActionModal() { document.getElementById('actionModal').style.display = 'none'; }

// 🚚 FORMAT RETURN REMARK DYNAMICALLY
function formatReturnRemark(evt, form) {
    let from = form.dispatch_from.value || 'Mohata Coal Co. Pvt. Ltd. (Factory)';
    let to = form.return_destination.value || form.return_client.value;
    let vehicle = form.return_vehicle.value || 'N/A';
    let driver = form.driver_name.value || 'N/A';
    let note = form.actual_remark.value || '';
    
    // Bundle the metadata exactly like production delivery
    form.remark.value = `[From: ${from}] [To: ${to}] [Vehicle: ${vehicle}] [Driver: ${driver}] Note: ${note}`;
}

function openProcessReturnModal(batchNo, clientName, invoiceNo, receiveDate, totalQty, passedQty, rejectQty) {
    document.getElementById('processReturnModal').style.display = 'flex';
    document.getElementById('returnBatchNo').value = batchNo;
    document.getElementById('returnBatchLabel').value = batchNo;
    document.getElementById('returnClientName').value = clientName;
    document.getElementById('returnDestination').value = clientName;
    document.getElementById('returnRejQty').value = rejectQty;
    document.getElementById('returnQty').max = rejectQty;
    document.getElementById('returnQty').value = rejectQty;
}
function closeProcessReturnModal() { document.getElementById('processReturnModal').style.display = 'none'; }

// 📄 FULL RETURN CHALLAN PREVIEW MODAL
function openReturnDetails(batchNo, clientName, invoiceNo, receiveDate, totalQty, passedQty, returnQty, by, vehicle, time, note, rejectedAxles) {
    
    // Unbundle parameters from note if present
    let dispatchFrom = "Mohata Coal Co. Pvt. Ltd. (Factory)";
    let deliveryTo = clientName;
    let vehicleNo = vehicle || "N/A";
    let driverName = "N/A";
    let actualRemark = note || "";

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

    let rejectedHtml = '';
    if (rejectedAxles && rejectedAxles.length > 0) {
        rejectedHtml = `
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; text-align: left;">
                <thead style="background: #f8f9fa;">
                    <tr>
                        <th style="border: 1px solid #ddd; padding: 8px; width: 15%;">Sl No</th>
                        <th style="border: 1px solid #ddd; padding: 8px; width: 45%;">Axle Number</th>
                        <th style="border: 1px solid #ddd; padding: 8px; width: 40%; color: #c0392b;">Rejection Reason</th>
                    </tr>
                </thead>
                <tbody>
        `;
        rejectedAxles.forEach((axle, index) => {
            rejectedHtml += `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; color: #2c3e50;">${axle.axle}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; color: #c0392b; font-weight: bold;">${axle.reason || 'RM QC Rejected'}</td>
                </tr>
            `;
        });
        rejectedHtml += `</tbody></table>`;
    } else {
        rejectedHtml = `<p style="color: #7f8c8d; font-size: 12px; font-style: italic; margin-top: 15px;">No individual axle rejection details available.</p>`;
    }

    let challanBody = `
        <div id="printableReturnContent" style="background: #fff; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333;">
            
            <!-- Header -->
            <div style="text-align: center; border-bottom: 2px solid #c0392b; padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #2c3e50; font-size: 24px; text-transform: uppercase;">MOHATA COAL CO. PVT. LTD.</h2>
                <h3 style="margin: 5px 0 0 0; color: #c0392b; font-size: 15px; letter-spacing: 2px;">REJECTION / RETURN CHALLAN</h3>
            </div>
            
            <!-- Details Grid -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
                <div>
                    <span style="color: #7f8c8d;">Return Batch No:</span> <strong style="font-size: 15px; color: #c0392b;">${batchNo}</strong><br>
                    <span style="color: #7f8c8d;">Original Invoice No:</span> <strong>${invoiceNo}</strong><br>
                    <span style="color: #7f8c8d;">Return Dispatch Time:</span> <strong>${time}</strong>
                </div>
                <div style="text-align: right;">
                    <span style="color: #7f8c8d;">Vehicle No:</span> <strong style="font-size: 14px; padding: 2px 5px; background: #fdf2e9; border: 1px solid #fad7a1; border-radius: 3px; color: #d35400;">${vehicleNo}</strong><br>
                    <span style="color: #7f8c8d;">Driver Name:</span> <strong>${driverName}</strong><br>
                    <span style="color: #7f8c8d;">Dispatched By:</span> <strong>${by}</strong>
                </div>
            </div>

            <!-- From & To Box -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 10px 15px; background: #fdfdfd; border: 1px solid #eee; border-radius: 4px;">
                <div style="width: 48%;">
                    <strong style="color: #7f8c8d; font-size: 11px; text-transform: uppercase;">Returned From:</strong><br>
                    <span style="font-size: 14px; font-weight: bold; color: #2c3e50;">${dispatchFrom}</span>
                </div>
                <div style="width: 48%; text-align: right;">
                    <strong style="color: #7f8c8d; font-size: 11px; text-transform: uppercase;">Returned To (Client/Supplier):</strong><br>
                    <span style="font-size: 14px; font-weight: bold; color: #2c3e50;">${deliveryTo}</span>
                </div>
            </div>

            <!-- Flow Summary Box -->
            <div style="margin-bottom: 20px; border: 1px solid #bdc3c7; border-radius: 4px; overflow: hidden;">
                <div style="background: #ecf0f1; padding: 8px 10px; font-weight: bold; font-size: 12px; color: #34495e; border-bottom: 1px solid #bdc3c7;">
                    📊 Raw Material Intake & QC Summary
                </div>
                <div style="display: flex; justify-content: space-between; padding: 10px; text-align: center; font-size: 12px;">
                    <div><span style="color: #7f8c8d;">Total Received</span><br><strong style="font-size: 14px;">${totalQty} Pcs</strong></div>
                    <div><span style="color: #7f8c8d;">QC Passed (Accepted)</span><br><strong style="font-size: 14px; color: #27ae60;">${passedQty} Pcs</strong></div>
                    <div style="background: #fadbd8; padding: 4px 15px; border-radius: 4px; border: 1px solid #f5b7b1;">
                        <span style="color: #c0392b; font-weight: bold;">Returned Qty</span><br>
                        <strong style="font-size: 16px; color: #c0392b;">${returnQty} Pcs</strong>
                    </div>
                </div>
            </div>
            
            <h4 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 14px;">Item Details (Returned Axles)</h4>
            ${rejectedHtml}

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
                    <p style="margin: 5px 0 0 0; font-size: 10px; color: #7f8c8d;">Client Representative</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('returnDetailsBody').innerHTML = challanBody;
    document.getElementById('returnDetailsModal').style.display = 'flex';
}

function closeReturnDetailsModal() { document.getElementById('returnDetailsModal').style.display = 'none'; }

// 🖨️ PRINT RETURN CHALLAN
function printReturnDetails() {
    let printContent = document.getElementById('printableReturnContent').innerHTML;
    let printWindow = window.open('', '_blank', 'width=800,height=900');
    
    printWindow.document.write(`
        <html>
        <head>
            <title>Return Challan</title>
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
                setTimeout(function() { 
                    window.print(); 
                    window.close(); 
                }, 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function printCurrentListTab() {
    let activeTabBtn = document.querySelector('.tab-btn.active');
    let tabTitle = activeTabBtn ? activeTabBtn.innerText.trim() : "RM Input Report";
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
                table { width: 100% !important; border-collapse: collapse !important; }
                th, td { border: 1px solid #bdc3c7 !important; padding: 8px !important; text-align: left; vertical-align: middle !important; }
                th { background-color: #ecf0f1 !important; color: #2c3e50 !important; font-weight: bold !important; font-size: 12px; }
                .badge { padding: 3px 6px; border: 1px solid #ccc; border-radius: 3px; font-weight: bold; }
                .action-btn, button, form { display: none !important; } 
                
                .print-export-only { display: table-cell !important; }
                
                .footer { margin-top: 30px; display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; border-top: 1px solid #bdc3c7; padding-top: 10px; }
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
                let ths = document.querySelectorAll('thead th, tbody tr th');
                if (ths.length === 0) ths = document.querySelectorAll('tr:first-child th');
                let actionIndex = -1;
                ths.forEach((th, index) => {
                    if(th.innerText.trim().toUpperCase().includes('ACTION')) actionIndex = index;
                });
                if(actionIndex !== -1) {
                    document.querySelectorAll('tr').forEach(tr => {
                        if(tr.children.length > actionIndex) tr.removeChild(tr.children[actionIndex]);
                    });
                }
                document.querySelectorAll('button').forEach(btn => btn.remove());
                setTimeout(function() { window.print(); window.close(); }, 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
}

function exportCurrentListTabToExcel() {
    let activeTabBtn = document.querySelector('.tab-btn.active');
    let tabTitle = activeTabBtn ? activeTabBtn.innerText.trim() : "RM_Input_Report";
    let tableHtml = document.querySelector('.tab-content.active table').cloneNode(true);
    
    tableHtml.querySelectorAll('.print-export-only').forEach(el => {
        el.classList.remove('print-export-only');
        el.style.display = 'table-cell';
    });
    
    let ths = tableHtml.querySelectorAll('tr:first-child th');
    let actionIndex = -1;
    ths.forEach((th, index) => {
        if(th.innerText.trim().toUpperCase().includes('ACTION')) actionIndex = index;
    });
    if(actionIndex !== -1) {
        tableHtml.querySelectorAll('tr').forEach(tr => {
            if(tr.children.length > actionIndex) tr.removeChild(tr.children[actionIndex]);
        });
    }

    tableHtml.querySelectorAll('button, form').forEach(btn => btn.remove());

    let fullHtml = `
        <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="utf-8"></head>
        <body>
            <h2>Mohata Coal Co. - ${tabTitle}</h2>
            <table border="1">${tableHtml.innerHTML}</table>
        </body>
        </html>`;
    
    let blob = new Blob(['\ufeff', fullHtml], { type: 'application/vnd.ms-excel' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = tabTitle.replace(/ /g, '_') + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function toggleDropdown() { document.getElementById('profileDropdown').classList.toggle('active'); }
function openPasswordModal() { document.getElementById('passwordModal').style.display = 'flex'; }
function closePasswordModal() { document.getElementById('passwordModal').style.display = 'none'; }

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

function closeUserDetailsModal() { document.getElementById('userDetailsModal').style.display = 'none'; openUsersModal(); }

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) event.target.style.display = "none";
    if (!event.target.matches('.profile-btn') && !event.target.closest('.profile-btn')) {
        let dropdowns = document.getElementsByClassName('profile-dropdown');
        for (let i = 0; i < dropdowns.length; i++) dropdowns[i].classList.remove('active');
    }
}
window.addEventListener("pageshow", function (event) { if (event.persisted) window.location.reload(); });
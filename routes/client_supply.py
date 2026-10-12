import sqlite3
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
from utils import get_db_connection
from datetime import datetime
import json
import re

client_supply_bp = Blueprint('client_supply', __name__)

def log_axle_action(conn, batch_no, axle_no, stage, action, remark, user):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        conn.execute('''
            INSERT INTO axle_audit_trail (batch_number, axle_no, stage_name, action_taken, remark, done_by, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (batch_no, axle_no, stage, action, remark, user, timestamp))
    except sqlite3.OperationalError:
        pass 

@client_supply_bp.route('/api/next_batch', methods=['GET'])
def get_next_batch():
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'batch_no': ''})
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        formatted_date = date_obj.strftime('%d%m%y')
        prefix = f"B-{formatted_date}/"
        
        conn = get_db_connection()
        existing_batches = conn.execute("SELECT batch_number FROM batches WHERE batch_number LIKE ?", (f"{prefix}%",)).fetchall()
        conn.close()
        
        max_seq = 0
        for b in existing_batches:
            try:
                seq = int(b['batch_number'].split('/')[1])
                if seq > max_seq: max_seq = seq
            except:
                pass
        
        return jsonify({'batch_no': f"{prefix}{max_seq + 1}"})
    except Exception as e:
        return jsonify({'batch_no': 'Error'})

@client_supply_bp.route('/client_supply', methods=['GET', 'POST'])
def client_supply():
    if 'logged_in' not in session: return redirect(url_for('auth.login'))
        
    current_user = f"{session.get('username')} ({session.get('role')})"
    user_role = session.get('role', '')
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    if request.method == 'POST':
        action = request.form.get('action')
        remark = request.form.get('remark', '')
        
        if 'Admin' not in user_role and 'RM' not in user_role and 'Receiving' not in user_role:
            flash("Access Denied: You do not have permission to modify client supply data.")
            return redirect(url_for('client_supply.client_supply'))
            
        if action == 'qc_evaluate' and ('Admin' not in user_role and 'RM' not in user_role):
            flash("Access Denied: Only Admin or RM can perform QC evaluation.")
            return redirect(url_for('client_supply.client_supply'))

        conn = get_db_connection()
        try:
            if action == 'add':
                batch_number = request.form['batch_number'].strip()
                client_name = request.form['client_name']
                invoice_no = request.form['invoice_no']
                receive_date = request.form['receive_date']
                quantity = int(request.form['quantity'])
                axle_nos = request.form.getlist('axle_no[]')
                
                existing_batch = conn.execute('SELECT batch_number FROM batches WHERE batch_number = ?', (batch_number,)).fetchone()
                if existing_batch:
                    flash(f'Error: Batch number {batch_number} already exists! Please use a unique number.')
                    conn.close()
                    return redirect(url_for('client_supply.client_supply'))

                conn.execute('''
                    INSERT INTO batches (batch_number, client_name, invoice_no, receive_date, quantity, passed_qty, current_stage, status, action_time, production_forwarded) 
                    VALUES (?, ?, ?, ?, ?, ?, 'Receiving', 'Pending', ?, 0)
                ''', (batch_number, client_name, invoice_no, receive_date, quantity, quantity, current_time))
                
                for idx, axle in enumerate(axle_nos, start=1):
                    if axle.strip():
                        conn.execute('''
                            INSERT INTO batch_pieces (batch_number, sl_no, axle_no, status, reject_reason, axle_current_stage)
                            VALUES (?, ?, ?, 'Pending', '', 'Receiving')
                        ''', (batch_number, idx, axle.strip()))
                
                conn.execute('''
                    INSERT INTO production_logs (batch_number, stage_name, action_taken, remark, done_by, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (batch_number, 'Receiving', f"Received {quantity} pcs with Axles", f"Invoice: {invoice_no}", current_user, current_time))
                
                conn.commit()
                flash(f'New batch {batch_number} generated and added successfully!')
                
            elif action == 'delete':
                if 'Admin' not in user_role and 'RM' not in user_role:
                    flash("Access Denied: Only Admin or RM can delete a batch.")
                else:
                    batch_number = request.form['batch_number']
                    conn.execute('DELETE FROM batches WHERE batch_number = ?', (batch_number,))
                    conn.execute('DELETE FROM batch_pieces WHERE batch_number = ?', (batch_number,))
                    conn.commit()
                    flash(f'Batch {batch_number} deleted.')
            
            elif action == 'edit_batch':
                if 'Admin' not in user_role and 'RM' not in user_role:
                    flash("Access Denied: Only Admin or RM can edit received data.")
                else:
                    batch_number = request.form['batch_number']
                    o_remark = request.form.get('override_remark', 'Admin/RM Master Correction')
                    
                    orig_batch = conn.execute("SELECT * FROM batches WHERE batch_number = ?", (batch_number,)).fetchone()
                    is_forwarded = orig_batch['production_forwarded'] == 1
                    
                    new_client = request.form.get('client_name')
                    new_inv = request.form.get('invoice_no')
                    if new_client and new_inv:
                        conn.execute('UPDATE batches SET client_name = ?, invoice_no = ? WHERE batch_number = ?', (new_client, new_inv, batch_number))
                    
                    axle_ids = request.form.getlist('edit_axle_id[]')
                    new_axle_nos = request.form.getlist('edit_axle_no[]')
                    new_axle_statuses = request.form.getlist('edit_axle_status[]')
                    delete_ids = request.form.getlist('delete_axle_ids[]') 
                    
                    # 1. DELETE ANY EXPLICITLY CHECKED AXLES
                    deleted_count = len(delete_ids)
                    for d_id in delete_ids:
                        conn.execute("DELETE FROM batch_pieces WHERE id = ?", (d_id,))
                        
                    # 2. UPDATE REMAINING AXLES
                    passed_count = 0
                    rejected_count = 0
                    recovered_to_split = []
                    
                    for a_id, new_no, new_status in zip(axle_ids, new_axle_nos, new_axle_statuses):
                        if str(a_id) not in delete_ids:
                            old_piece = conn.execute("SELECT status, axle_no FROM batch_pieces WHERE id = ?", (a_id,)).fetchone()
                            old_status = old_piece['status'] if old_piece else 'Pending'
                            
                            # SPLIT LOGIC
                            if is_forwarded and old_status in ['Reject', 'Scrap'] and new_status == 'Pass':
                                recovered_to_split.append((a_id, new_no.strip(), new_status))
                            else:
                                rej_reason = o_remark if new_status in ['Scrap', 'Reject'] else ''
                                conn.execute('UPDATE batch_pieces SET axle_no = ?, status = ?, reject_reason = ? WHERE id = ? AND batch_number = ?', 
                                             (new_no.strip(), new_status, rej_reason, a_id, batch_number))
                                
                                if new_status == 'Pass': passed_count += 1
                                elif new_status in ['Scrap', 'Reject']: rejected_count += 1
                                    
                                if old_piece and (old_status != new_status or old_piece['axle_no'] != new_no.strip()):
                                    log_axle_action(conn, batch_number, new_no.strip(), 'Receiving/QC Edit', f"Forced Status to {new_status}", "Master Correction", current_user)
                    
                    # 3. PROCESS RECOVERED SPLITS
                    if recovered_to_split:
                        base_bn = batch_number.split('-R')[0].split('-P')[0]
                        existing_reworks = conn.execute("SELECT count(*) as c FROM batches WHERE batch_number LIKE ?", (f"{base_bn}-R%",)).fetchone()
                        r_idx = (existing_reworks['c'] if existing_reworks else 0) + 1
                        new_batch_no = f"{base_bn}-R{r_idx}"
                        
                        rw_qty = len(recovered_to_split)
                        rw_remarks = f"[Admin/RM Correction] Recovered from Rejected. Split from {batch_number}"
                        
                        conn.execute('''
                            INSERT INTO batches (batch_number, client_name, invoice_no, receive_date, quantity, passed_qty, rejected_qty, current_stage, status, remarks, action_time, production_forwarded)
                            VALUES (?, ?, ?, ?, ?, ?, 0, 'RM QC', 'QA Completed', ?, ?, 0)
                        ''', (new_batch_no, orig_batch['client_name'], orig_batch['invoice_no'], orig_batch['receive_date'], rw_qty, rw_qty, rw_remarks, current_time))
                        
                        for a_id, new_no, new_status in recovered_to_split:
                            conn.execute('''
                                UPDATE batch_pieces 
                                SET batch_number = ?, axle_no = ?, status = ?, reject_reason = ?, axle_current_stage = 'RM QC' 
                                WHERE id = ?
                            ''', (new_batch_no, new_no, new_status, '', a_id))
                            
                            log_axle_action(conn, new_batch_no, new_no, 'Receiving/QC Edit', "Recovered & Split", "Admin Override", current_user)
                        
                        flash(f"{rw_qty} recovered axle(s) auto-split into new sub-batch '{new_batch_no}' and kept in RM QC.")

                    # 4. RECALCULATE BATCH TOTAL QUANTITY
                    remaining_pieces = conn.execute("SELECT id FROM batch_pieces WHERE batch_number = ? ORDER BY id ASC", (batch_number,)).fetchall()
                    
                    if len(remaining_pieces) == 0 and len(recovered_to_split) == 0:
                        conn.execute("DELETE FROM batches WHERE batch_number = ?", (batch_number,))
                        conn.commit()
                        flash(f"Batch #{batch_number} has been completely emptied and removed.")
                    else:
                        for idx, piece in enumerate(remaining_pieces, start=1):
                            conn.execute("UPDATE batch_pieces SET sl_no = ? WHERE id = ?", (idx, piece['id']))
                            
                        b_status = orig_batch['status']
                        if passed_count == 0 and rejected_count > 0:
                            b_status = 'Rejected'
                        elif passed_count > 0 and orig_batch['status'] == 'Rejected':
                            b_status = 'QA Completed'
                            
                        new_quantity = orig_batch['quantity'] - deleted_count
                        
                        conn.execute('''
                            UPDATE batches 
                            SET quantity = ?, passed_qty = ?, rejected_qty = ?, status = ?
                            WHERE batch_number = ?
                        ''', (new_quantity, passed_count, rejected_count, b_status, batch_number))
                        
                        conn.commit()
                        flash(f'Batch {batch_number} successfully overwritten.')

            elif action == 'forward':
                batch_number = request.form['batch_number']
                conn.execute('UPDATE batches SET current_stage = "Processing", status = "Approved", remarks = ?, action_time = ? WHERE batch_number = ?', (remark, current_time, batch_number))
                conn.execute('UPDATE batch_pieces SET axle_current_stage = "RM QC" WHERE batch_number = ?', (batch_number,))
                
                batch = conn.execute('SELECT quantity FROM batches WHERE batch_number = ?', (batch_number,)).fetchone()
                qty = batch['quantity'] if batch else 0
                
                conn.execute('''
                    INSERT INTO production_logs (batch_number, stage_name, action_taken, remark, done_by, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (batch_number, 'Receiving', f"Forwarded {qty} pcs to RM QC", remark, current_user, current_time))
                
                conn.commit()
                flash(f'Batch {batch_number} forwarded to RM QC.')
                
            elif action == 'reject':
                batch_number = request.form['batch_number']
                batch = conn.execute('SELECT quantity FROM batches WHERE batch_number = ?', (batch_number,)).fetchone()
                rej_qty = batch['quantity'] if batch else 0
                conn.execute('UPDATE batches SET status = "Rejected", reject_reason = ?, rejected_qty = ?, passed_qty = 0, rejected_by = ?, action_time = ? WHERE batch_number = ?', (remark, rej_qty, current_time, batch_number))
                
                conn.execute('UPDATE batch_pieces SET status = "Reject", axle_current_stage = "RM QC", reject_reason = ? WHERE batch_number = ?', (remark, batch_number))
                
                conn.execute('''
                    INSERT INTO production_logs (batch_number, stage_name, action_taken, remark, done_by, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (batch_number, 'Receiving', f"Gate Rejected {rej_qty} pcs", remark, current_user, current_time))
                
                conn.commit()
                flash(f'Batch {batch_number} completely rejected at Gate.')

            elif action == 'qc_evaluate':
                batch_number = request.form['batch_number']
                sl_nos = request.form.getlist('sl_no[]')
                pass_remark = request.form.get('pass_remark', '')
                
                passed_qty = 0
                rejected_qty = 0
                rejection_reasons = []
                
                for sl in sl_nos:
                    piece_status = request.form.get(f'status_{sl}')
                    piece_reason = request.form.get(f'reason_{sl}', '')
                    
                    conn.execute('UPDATE batch_pieces SET status = ?, reject_reason = ?, axle_current_stage = "RM QC" WHERE batch_number = ? AND sl_no = ?', (piece_status, piece_reason, batch_number, sl))
                    
                    axle_row = conn.execute('SELECT axle_no FROM batch_pieces WHERE batch_number = ? AND sl_no = ?', (batch_number, sl)).fetchone()
                    actual_axle_no = axle_row['axle_no'] if axle_row else f"Axle {sl}"
                            
                    if piece_status == 'Reject':
                        rejected_qty += 1
                        if piece_reason:
                            rejection_reasons.append(f"Axle No: {actual_axle_no} - {piece_reason}")
                        log_axle_action(conn, batch_number, actual_axle_no, 'RM QC', 'Returned/Rejected', piece_reason, current_user)
                    else:
                        passed_qty += 1
                        log_axle_action(conn, batch_number, actual_axle_no, 'RM QC', 'Passed RM QC', pass_remark, current_user)
                
                overall_reject_reason = " | ".join(rejection_reasons)
                batch_status = 'QA Completed'
                rej_by = current_user if rejected_qty > 0 else 'N/A'
                if passed_qty == 0: batch_status = 'Rejected'
                
                conn.execute('''
                    UPDATE batches 
                    SET current_stage = "RM QC", status = ?, passed_qty = ?, rejected_qty = ?, reject_reason = ?, remarks = ?, rejected_by = ?, action_time = ?
                    WHERE batch_number = ?
                ''', (batch_status, passed_qty, rejected_qty, overall_reject_reason, pass_remark, rej_by, current_time, batch_number))
                
                if rejected_qty > 0:
                    conn.execute('''
                        INSERT INTO production_logs (batch_number, stage_name, action_taken, remark, done_by, timestamp)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (batch_number, 'RM QC', f"QC Rejected {rejected_qty} pcs", overall_reject_reason[:100], current_user, current_time))

                conn.commit()
                flash(f'Batch {batch_number} QC Completed. Passed: {passed_qty}, Rejected: {rejected_qty}. Ready to Forward.')

            elif action == 'forward_to_production':
                batch_number = request.form['batch_number']
                
                conn.execute('''
                    UPDATE batches 
                    SET production_forwarded = 1, current_stage = "Facing 1/Center Drilling", status = "Approved", action_time = ? 
                    WHERE batch_number = ?
                ''', (current_time, batch_number))
                
                conn.execute('''
                    UPDATE batch_pieces 
                    SET axle_current_stage = "Facing 1/Center Drilling" 
                    WHERE batch_number = ? AND status = 'Pass'
                ''', (batch_number,))
                
                batch = conn.execute('SELECT passed_qty FROM batches WHERE batch_number = ?', (batch_number,)).fetchone()
                p_qty = batch['passed_qty'] if batch else 0
                
                conn.execute('''
                    INSERT INTO production_logs (batch_number, stage_name, action_taken, remark, done_by, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (batch_number, 'RM QC', f"Forwarded {p_qty} passed pcs to Facing 1", "QC Passed items forwarded to production", current_user, current_time))
                
                conn.commit()
                flash(f'Passed pieces of Batch {batch_number} successfully forwarded to Production Workflow.')

            elif action == 'process_return':
                batch_number = request.form['batch_number']
                return_qty = request.form['return_qty']
                returned_by = request.form['returned_by']
                return_vehicle = request.form['return_vehicle']
                
                conn.execute('''
                    UPDATE batches 
                    SET client_returned = 1, return_note = ?, return_qty = ?, returned_by = ?, return_vehicle = ?, return_time = ? 
                    WHERE batch_number = ?
                ''', (remark, return_qty, returned_by, return_vehicle, current_time, batch_number))
                conn.commit()
                flash(f'Batch {batch_number} processed for Client Return.')
                
        except sqlite3.OperationalError as e:
            flash(f'Database Error: {e}')
        finally:
            conn.close()
        return redirect(url_for('client_supply.client_supply'))
        
    search_query = request.args.get('search', '')
    conn = get_db_connection()
    try:
        if search_query:
            all_batches_raw = conn.execute('SELECT * FROM batches WHERE client_name LIKE ? OR invoice_no LIKE ? OR batch_number LIKE ? ORDER BY rowid DESC', (f'%{search_query}%', f'%{search_query}%', f'%{search_query}%')).fetchall()
        else:
            all_batches_raw = conn.execute('SELECT * FROM batches ORDER BY rowid DESC').fetchall()
            
        batch_pieces_raw = conn.execute('SELECT id, batch_number, sl_no, axle_no, status, reject_reason, axle_current_stage FROM batch_pieces ORDER BY sl_no').fetchall()
        pieces_dict = {}
        for bp in batch_pieces_raw:
            if bp['batch_number'] not in pieces_dict:
                pieces_dict[bp['batch_number']] = []
            pieces_dict[bp['batch_number']].append({
                'id': bp['id'],
                'sl': bp['sl_no'], 
                'axle': bp['axle_no'],
                'status': bp['status'] if 'status' in bp.keys() else 'Pending',
                'reason': bp['reject_reason'] if 'reject_reason' in bp.keys() else '',
                'stage': bp['axle_current_stage'] if 'axle_current_stage' in bp.keys() else 'RM QC'
            })
            
    finally:
        conn.close()

    pending_batches, processing_batches, rejected_batches, returned_batches = [], [], [], []
    for raw_row in all_batches_raw:
        b = dict(raw_row)
        prod_fwd = b.get('production_forwarded', 0)
        
        b['rejected_axles_list'] = []
        current_pieces_count = 0
        if b['batch_number'] in pieces_dict:
             # Just collect the specific rejected pieces to show the modal details
             b['rejected_axles_list'] = [p for p in pieces_dict[b['batch_number']] if p['status'] in ['Reject', 'Scrap'] and p['stage'] in ['Receiving', 'RM QC']]
             current_pieces_count = len(pieces_dict[b['batch_number']])
        
        # Calculate split pieces count logically
        b['split_qty'] = b['quantity'] - current_pieces_count
        if b['split_qty'] < 0: b['split_qty'] = 0
        
        if b['status'] == 'Pending': 
            pending_batches.append(b)
            
        # RM QC Tab logic
        if prod_fwd == 0 and b['status'] != 'Pending' and b.get('passed_qty', 0) > 0: 
            processing_batches.append(b)
            
        # Rejected Tab logic uses the clean database rejected_qty
        if b.get('rejected_qty', 0) > 0 and b.get('client_returned', 0) != 1: 
            rejected_batches.append(b)
            
        if b.get('client_returned', 0) == 1: 
            returned_batches.append(b)
    
    return render_template('client_supply.html', pending_batches=pending_batches, processing_batches=processing_batches, rejected_batches=rejected_batches, returned_batches=returned_batches, pieces_dict=pieces_dict, search_query=search_query)
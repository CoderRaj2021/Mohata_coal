from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from utils import get_db_connection
from datetime import datetime
import re
import sqlite3

production_bp = Blueprint('production', __name__)

WORKFLOW_STAGES = [
    "Receiving", "RM QC", "Facing 1/Center Drilling", "Roughing", "Finishing", "Facing 2/Drill Tapping", "Final QC (Internal)", "Finish Goods/Inspection (Client)", "Delivery"
]

def init_audit_table(conn):
    conn.execute('''
        CREATE TABLE IF NOT EXISTS axle_audit_trail (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_number TEXT,
            axle_no TEXT,
            stage_name TEXT,
            action_taken TEXT,
            remark TEXT,
            done_by TEXT,
            timestamp TEXT
        )
    ''')
    try:
        conn.execute('ALTER TABLE axle_audit_trail ADD COLUMN machine_name TEXT DEFAULT "N/A"')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE production_logs ADD COLUMN machine_name TEXT DEFAULT "N/A"')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE batches ADD COLUMN damaged_qty INTEGER DEFAULT 0')
    except sqlite3.OperationalError:
        pass
    conn.commit()

def log_axle_action(conn, batch_no, axle_no, stage, action, remark, user, machine_name="N/A"):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        conn.execute('''
            INSERT INTO axle_audit_trail (batch_number, axle_no, stage_name, action_taken, remark, done_by, timestamp, machine_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (batch_no, axle_no, stage, action, remark, user, timestamp, machine_name))
    except sqlite3.OperationalError:
        try:
            conn.execute('''
                INSERT INTO axle_audit_trail (batch_number, axle_no, stage_name, action_taken, remark, done_by, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (batch_no, axle_no, stage, action, remark, user, timestamp))
        except Exception:
            pass

def log_production_action(conn, batch_no, stage, action, remark, user, machine_name="N/A"):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        conn.execute('''
            INSERT INTO production_logs (batch_number, stage_name, action_taken, remark, done_by, timestamp, machine_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (batch_no, stage, action, remark, user, timestamp, machine_name))
    except sqlite3.OperationalError:
        try:
            conn.execute('''
                INSERT INTO production_logs (batch_number, stage_name, action_taken, remark, done_by, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (batch_no, stage, action, remark, user, timestamp))
        except Exception:
            pass

@production_bp.route('/set_active_machine', methods=['POST'])
def set_active_machine():
    machine_name = request.form.get('machine_name')
    stage_name = request.form.get('stage_name')
    worker_name = session.get('username')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    conn = get_db_connection()
    conn.execute('UPDATE machine_logs SET logout_time = ?, status = "Completed" WHERE worker_name = ? AND status = "Active"', (timestamp, worker_name))
    conn.execute('INSERT INTO machine_logs (worker_name, machine_name, stage_name, login_time, status) VALUES (?, ?, ?, ?, "Active")', (worker_name, machine_name, stage_name, timestamp))
    conn.commit()
    conn.close()
    
    session['active_machine'] = machine_name
    session['active_stage'] = stage_name
    flash(f"Successfully logged into {machine_name} for {stage_name} stage.")
    return redirect(url_for('production.production'))

@production_bp.route('/logout_machine', methods=['POST'])
def logout_machine():
    worker_name = session.get('username')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    conn = get_db_connection()
    conn.execute('UPDATE machine_logs SET logout_time = ?, status = "Completed" WHERE worker_name = ? AND status = "Active"', (timestamp, worker_name))
    conn.commit()
    conn.close()
    
    session.pop('active_machine', None)
    session.pop('active_stage', None)
    flash("Logged out from the machine successfully.")
    return redirect(url_for('production.production'))

@production_bp.route('/manage_machines', methods=['POST'])
def manage_machines():
    if 'Admin' not in session.get('role', ''):
        flash("Access Denied.")
        return redirect(url_for('production.production'))
        
    action = request.form.get('action')
    conn = get_db_connection()
    try:
        if action == 'add':
            m_name = request.form.get('machine_name').strip()
            stages = request.form.getlist('allowed_stages[]')
            stages_str = ", ".join(stages)
            conn.execute('INSERT INTO machines (machine_name, allowed_stages) VALUES (?, ?)', (m_name, stages_str))
            flash(f"Machine '{m_name}' added successfully.")
            
        elif action == 'update':
            m_id = request.form.get('machine_id')
            m_name = request.form.get('machine_name').strip()
            stages = request.form.getlist('allowed_stages[]')
            stages_str = ", ".join(stages)
            conn.execute('UPDATE machines SET machine_name = ?, allowed_stages = ? WHERE id = ?', (m_name, stages_str, m_id))
            flash("Machine permissions updated.")
            
        elif action == 'delete':
            m_id = request.form.get('machine_id')
            conn.execute('DELETE FROM machines WHERE id = ?', (m_id,))
            flash("Machine deleted successfully.")
            
        conn.commit()
    except sqlite3.IntegrityError:
        flash("Error: Machine name already exists.")
    finally:
        conn.close()
    return redirect(url_for('production.production'))

@production_bp.before_request
def verify_machine_session():
    # Check if the user has an active machine session
    if 'username' in session and session.get('machine_name'):
        conn = get_db_connection()
        try:
            # Fetch the latest machine log for this worker and machine
            log = conn.execute('''
                SELECT status FROM machine_logs 
                WHERE worker_name LIKE ? AND machine_name = ? 
                ORDER BY id DESC LIMIT 1
            ''', (f"{session['username']}%", session.get('machine_name'))).fetchone()
            
            # If the status in the database is 'Completed' (Admin forced logout)
            if log and log['status'] == 'Completed':
                # Clear the machine session for the worker
                session.pop('machine_name', None)
                session.pop('stage_name', None)
                session.pop('machine_login_time', None)
                
                # NOTE: If you want to completely log out the worker from the app,
                # uncomment the line below:
                # session.clear()
        finally:
            conn.close()

@production_bp.route('/production', methods=['GET', 'POST'])
def production():
    if 'logged_in' not in session: return redirect(url_for('auth.login'))
    
    current_user = f"{session.get('username')} ({session.get('role')})"
    user_name_only = session.get('username')
    user_role = session.get('role', '')
    
    conn = get_db_connection()
    init_audit_table(conn)
    
    # ================== GLOBAL AUTO-MERGE ON PAGE LOAD ==================
    try:
        sub_batches = conn.execute('SELECT batch_number, current_stage FROM batches WHERE (batch_number LIKE "%-R%" OR batch_number LIKE "%-P%") AND status NOT IN ("Merged", "Scrapped", "Delivered", "Returned to Client")').fetchall()
        merged_count = 0
        for sb in sub_batches:
            sb_bn = sb['batch_number']
            sb_stage = sb['current_stage']
            base_bn = sb_bn.split('-R')[0].split('-P')[0]
            
            base_info = conn.execute('SELECT * FROM batches WHERE batch_number = ?', (base_bn,)).fetchone()
            if base_info and base_info['current_stage'] == sb_stage and base_info['status'] not in ['Delivered', 'Scrapped', 'Returned to Client', 'Merged']:
                conn.execute('UPDATE batch_pieces SET batch_number = ? WHERE batch_number = ? AND status != "Scrap" AND status != "Reject"', (base_bn, sb_bn))
                main_pieces = conn.execute('SELECT status, axle_current_stage FROM batch_pieces WHERE batch_number = ?', (base_bn,)).fetchall()
                p_c = sum(1 for p in main_pieces if p['status'] not in ['Scrap', 'Reject'])
                
                # Check damaged and rejected correctly during auto-merge
                d_c = sum(1 for p in main_pieces if p['status'] in ['Scrap', 'Reject'] and p['axle_current_stage'] not in ['Receiving', 'RM QC', 'Processing'])
                r_c = sum(1 for p in main_pieces if p['status'] in ['Scrap', 'Reject'] and p['axle_current_stage'] in ['Receiving', 'RM QC', 'Processing'])
                
                conn.execute('UPDATE batches SET passed_qty = ?, rejected_qty = ?, damaged_qty = ?, status = "Approved" WHERE batch_number = ?', (p_c, r_c, d_c, base_bn))
                conn.execute('UPDATE batches SET passed_qty = 0, status = "Merged", current_stage = "Merged", remarks = ? WHERE batch_number = ?', (f"Auto-merged into {base_bn} at {sb_stage}", sb_bn))
                log_production_action(conn, sb_bn, sb_stage, f"Auto-merged into {base_bn}", "Background Auto-Merge", "System", "N/A")
                merged_count += 1
                
        if merged_count > 0:
            conn.commit()
            flash(f"System merged {merged_count} sub-batch(es) back to their main batches automatically!")
    except Exception as e:
        pass
    # ====================================================================

    try:
        conn.execute("UPDATE batches SET production_forwarded = 0 WHERE current_stage IN ('Receiving', 'RM QC', 'Processing') AND production_forwarded = 1")
        conn.commit()
    except Exception:
        pass

    if request.method == 'POST':
        action = request.form.get('action')
        batch_number = request.form.get('batch_number', '')
        remark = request.form.get('remark', '')
        current_stage = request.form.get('current_stage', '').strip()
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        active_machine = session.get('active_machine', 'Admin Override' if action == 'admin_override' else 'N/A')
        
        if current_stage == 'Production': current_stage = 'RM QC'
        if current_stage == 'RM': current_stage = 'RM QC'
        
        if action != 'admin_override' and 'Admin' not in user_role and 'RM' not in user_role and current_stage not in user_role:
            flash(f"Access Denied: You are not authorized to perform actions in the '{current_stage}' stage.")
            conn.close()
            return redirect(url_for('production.production'))
            
        try:
            if action == 'forward':
                try:
                    scrapped_axles = request.form.getlist('scrapped_axle[]')
                    scrap_weights = request.form.getlist('scrap_weight[]')
                    scrap_reasons = request.form.getlist('scrap_reason[]')
                    
                    for ax, weight, reason in zip(scrapped_axles, scrap_weights, scrap_reasons):
                        if ax.strip() and (weight.strip() or reason.strip()):
                            info = []
                            if weight.strip(): info.append(f"{weight.strip()}")
                            if reason.strip(): info.append(f"{reason.strip()}")
                            combined_note = " - ".join(info)
                            conn.execute('INSERT INTO batch_scraps (batch_number, stage_name, axle_no, reason, done_by, timestamp) VALUES (?, ?, ?, ?, ?, ?)', (batch_number, current_stage, ax.strip(), combined_note, user_name_only, timestamp))
                            log_axle_action(conn, batch_number, ax.strip(), current_stage, "Damaged", combined_note, current_user, active_machine)

                    current_idx = WORKFLOW_STAGES.index(current_stage)
                    next_stage = WORKFLOW_STAGES[current_idx + 1]
                    
                    active_pieces = conn.execute('SELECT axle_no FROM batch_pieces WHERE batch_number = ? AND status != "Scrap" AND status != "Reject"', (batch_number,)).fetchall()
                    for p in active_pieces:
                        if p['axle_no'] not in scrapped_axles:
                            log_axle_action(conn, batch_number, p['axle_no'], current_stage, f"Passed -> {next_stage}", remark, current_user, active_machine)
                    
                    batch_info_updated = conn.execute('SELECT passed_qty FROM batches WHERE batch_number = ?', (batch_number,)).fetchone()
                    fwd_qty = batch_info_updated['passed_qty'] if batch_info_updated else 0
                    
                    status_update = "Approved"

                    if fwd_qty > 0:
                        conn.execute('UPDATE batches SET current_stage = ?, status = ?, remarks = ? WHERE batch_number = ?', (next_stage, status_update, remark, batch_number))
                        conn.execute('UPDATE batch_pieces SET axle_current_stage = ? WHERE batch_number = ? AND status != "Scrap" AND status != "Reject"', (next_stage, batch_number))
                        log_production_action(conn, batch_number, current_stage, f"Forwarded {fwd_qty} pcs to {next_stage}", remark, current_user, active_machine)
                        flash(f'Successfully forwarded {fwd_qty} pcs of Batch #{batch_number} to {next_stage}.')
                        
                    else:
                        conn.execute('UPDATE batches SET status = "Scrapped", remarks = ? WHERE batch_number = ?', (remark, batch_number))
                        flash(f'Batch #{batch_number} is fully scrapped.')

                except ValueError:
                    flash(f"System Error: Stage '{current_stage}' not recognized in workflow.")
                except IndexError:
                    flash(f"Notice: Batch #{batch_number} is already at the final stage.")
            
            elif action == 'reject':
                reject_qty_input = request.form.get('reject_qty')
                if reject_qty_input and reject_qty_input.isdigit():
                    reject_qty = int(reject_qty_input)
                    batch = conn.execute('SELECT passed_qty, rejected_qty FROM batches WHERE batch_number = ?', (batch_number,)).fetchone()
                    
                    if batch and reject_qty > 0:
                        new_passed = batch['passed_qty'] - reject_qty
                        new_rejected = batch['rejected_qty'] + reject_qty
                        
                        if new_passed <= 0:
                            status = "Returned to Client" if current_stage in ["Receiving", "Processing", "RM QC"] else "Scrapped"
                            conn.execute('UPDATE batches SET passed_qty = 0, rejected_qty = ?, status = ?, remarks = ? WHERE batch_number = ?', (new_rejected, status, remark, batch_number))
                            log_production_action(conn, batch_number, current_stage, f"Fully Rejected {reject_qty} pcs", remark, current_user, active_machine)
                            flash(f'Batch #{batch_number} fully rejected/scrapped.')
                        else:
                            conn.execute('UPDATE batches SET passed_qty = ?, rejected_qty = ?, remarks = ? WHERE batch_number = ?', (new_passed, new_rejected, remark, batch_number))
                            log_production_action(conn, batch_number, current_stage, f"Rejected {reject_qty} pcs", remark, current_user, active_machine)
                            flash(f'{reject_qty} items rejected from Batch #{batch_number}. Remaining: {new_passed}.')
                else:
                    flash("Invalid rejection quantity entered.")

            elif action == 'evaluate_and_forward':
                axles = request.form.getlist('eval_axle[]')
                current_stage = request.form.get('current_stage')
                
                orig_batch = conn.execute('SELECT * FROM batches WHERE batch_number = ?', (batch_number,)).fetchone()
                
                current_idx = WORKFLOW_STAGES.index(current_stage)
                default_next_stage = WORKFLOW_STAGES[current_idx + 1] if current_idx + 1 < len(WORKFLOW_STAGES) else "Delivery"
                
                next_stage_for_pass = default_next_stage
                is_rework_batch = '-R' in batch_number
                origin_stage = None
                
                if is_rework_batch and orig_batch['remarks'] and '[Origin:' in orig_batch['remarks'] and '[Admin Correction]' not in orig_batch['remarks']:
                    match = re.search(r'\[Origin:\s*(.*?)\]', orig_batch['remarks'])
                    if match:
                        origin_stage = match.group(1).strip()
                        if origin_stage in WORKFLOW_STAGES:
                            next_stage_for_pass = origin_stage

                passed_axles = []
                hold_axles = []
                scrapped_qty = 0
                rework_dict = {} 
                
                for ax in axles:
                    status = request.form.get(f'eval_status_{ax}')
                    scrap_wt = request.form.get(f'eval_scrap_wt_{ax}', '').strip()
                    
                    if scrap_wt:
                        scrap_note = f"{scrap_wt} kg (Process Scrap)"
                        conn.execute('INSERT INTO batch_scraps (batch_number, stage_name, axle_no, reason, done_by, timestamp) VALUES (?, ?, ?, ?, ?, ?)', (batch_number, current_stage, ax, scrap_note, user_name_only, timestamp))

                    if status == 'Pass':
                        passed_axles.append(ax)
                        conn.execute('UPDATE batch_pieces SET axle_current_stage = ? WHERE batch_number = ? AND axle_no = ?', (next_stage_for_pass, batch_number, ax))
                        log_axle_action(conn, batch_number, ax, current_stage, f"Passed -> {next_stage_for_pass}", remark, current_user, active_machine)
                    elif status == 'Scrap':
                        reason = request.form.get(f'eval_reason_{ax}', '')
                        scrapped_qty += 1
                        if reason:
                            conn.execute('INSERT INTO batch_scraps (batch_number, stage_name, axle_no, reason, done_by, timestamp) VALUES (?, ?, ?, ?, ?, ?)', (batch_number, current_stage, ax, reason, user_name_only, timestamp))
                        conn.execute('UPDATE batch_pieces SET status = "Scrap", reject_reason = ? WHERE batch_number = ? AND axle_no = ?', (reason, batch_number, ax))
                        log_axle_action(conn, batch_number, ax, current_stage, "Damaged", reason, current_user, active_machine)
                    elif status == 'Rework':
                        reason = request.form.get(f'eval_reason_{ax}', '')
                        dest = request.form.get(f'eval_dest_{ax}', '')
                        if dest not in rework_dict:
                            rework_dict[dest] = []
                        rework_dict[dest].append((ax, reason))
                        log_axle_action(conn, batch_number, ax, current_stage, f"Sent to Rework -> {dest}", reason, current_user, active_machine)
                    elif status == 'Hold':
                        reason = request.form.get(f'eval_reason_{ax}', '')
                        hold_axles.append((ax, reason))
                        log_axle_action(conn, batch_number, ax, current_stage, "Held Back (Partial Split)", reason, current_user, active_machine)
                
                passed_qty = len(passed_axles)
                
                # BUG FIX: Safely extracting data without using .get() on sqlite3.Row
                current_damaged = orig_batch['damaged_qty'] if 'damaged_qty' in orig_batch.keys() else 0
                new_damaged = current_damaged + scrapped_qty
                
                current_rejected = orig_batch['rejected_qty'] if 'rejected_qty' in orig_batch.keys() else 0
                
                if passed_qty > 0:
                    status_val = "Approved"
                    
                    if '[Admin Correction]' in orig_batch['remarks']:
                        new_remarks = f"[Admin Correction] Recovered from damage & restored. {remark}".strip()
                    elif is_rework_batch and origin_stage and origin_stage in WORKFLOW_STAGES:
                        new_remarks = f"Returned to Origin ({origin_stage}). {remark}".strip()
                    else:
                        new_remarks = remark
                        
                    conn.execute('UPDATE batches SET current_stage = ?, status = ?, passed_qty = ?, rejected_qty = ?, damaged_qty = ?, remarks = ? WHERE batch_number = ?', (next_stage_for_pass, status_val, passed_qty, current_rejected, new_damaged, new_remarks, batch_number))
                else:
                    if not rework_dict and not hold_axles:
                        conn.execute('UPDATE batches SET status = "Scrapped", passed_qty = 0, rejected_qty = ?, damaged_qty = ?, remarks = ? WHERE batch_number = ?', (current_rejected, new_damaged, remark, batch_number))
                    elif hold_axles and not rework_dict and scrapped_qty == 0:
                        conn.execute('UPDATE batches SET status = "Empty (Fully Split)", passed_qty = 0, rejected_qty = ?, damaged_qty = ?, remarks = ? WHERE batch_number = ?', (current_rejected, new_damaged, remark, batch_number))
                    else:
                        conn.execute('UPDATE batches SET status = "Split for Rework/Hold", passed_qty = 0, rejected_qty = ?, damaged_qty = ?, remarks = ? WHERE batch_number = ?', (current_rejected, new_damaged, remark, batch_number))

                log_production_action(conn, batch_number, current_stage, f"Evaluated. Passed: {passed_qty}, Scrapped: {scrapped_qty}, Reworks: {sum(len(v) for v in rework_dict.values())}, Held: {len(hold_axles)}", remark, current_user, active_machine)

                # 1. Process Rework Splits
                if rework_dict:
                    base_bn = batch_number.split('-R')[0].split('-P')[0]
                    existing_reworks = conn.execute("SELECT count(*) as c FROM batches WHERE batch_number LIKE ?", (f"{base_bn}-R%",)).fetchone()
                    r_idx = (existing_reworks['c'] if existing_reworks else 0) + 1
                    
                    for dest_stage, rw_axles in rework_dict.items():
                        new_batch_no = f"{base_bn}-R{r_idx}"
                        r_idx += 1
                        rw_qty = len(rw_axles)
                        rw_remarks = f"[Origin: {current_stage}] Rework split from {batch_number}"
                        rw_prod_fwd = 0 if dest_stage in ['Receiving', 'RM QC', 'Processing'] else 1
                        
                        conn.execute('''
                            INSERT INTO batches (batch_number, client_name, invoice_no, receive_date, quantity, passed_qty, rejected_qty, damaged_qty, current_stage, status, remarks, action_time, production_forwarded)
                            VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'Approved', ?, ?, ?)
                        ''', (new_batch_no, orig_batch['client_name'], orig_batch['invoice_no'], orig_batch['receive_date'], rw_qty, rw_qty, dest_stage, rw_remarks, timestamp, rw_prod_fwd))
                        
                        for ax, res in rw_axles:
                            conn.execute('UPDATE batch_pieces SET batch_number = ?, axle_current_stage = ?, status = "Rework", reject_reason = ? WHERE batch_number = ? AND axle_no = ?', (new_batch_no, dest_stage, res, batch_number, ax))
                        
                        log_production_action(conn, new_batch_no, dest_stage, f"Created as Rework Split from {batch_number}", remark, current_user, active_machine)
                        flash(f"Created Sub-Batch '{new_batch_no}' with {rw_qty} pcs sent back to {dest_stage}.")

                # 2. Process Partial Splits (Hold / Pending)
                if hold_axles:
                    base_bn = batch_number.split('-R')[0].split('-P')[0]
                    existing_holds = conn.execute("SELECT count(*) as c FROM batches WHERE batch_number LIKE ?", (f"{base_bn}-P%",)).fetchone()
                    p_idx = (existing_holds['c'] if existing_holds else 0) + 1
                    
                    new_batch_no = f"{base_bn}-P{p_idx}"
                    hold_qty = len(hold_axles)
                    hold_remarks = f"[Partial Split] Left behind from {batch_number} due to incomplete work"
                    
                    conn.execute('''
                        INSERT INTO batches (batch_number, client_name, invoice_no, receive_date, quantity, passed_qty, rejected_qty, damaged_qty, current_stage, status, remarks, action_time, production_forwarded)
                        VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'Approved', ?, ?, 1)
                    ''', (new_batch_no, orig_batch['client_name'], orig_batch['invoice_no'], orig_batch['receive_date'], hold_qty, hold_qty, current_stage, hold_remarks, timestamp))
                    
                    for ax, res in hold_axles:
                        conn.execute('UPDATE batch_pieces SET batch_number = ?, axle_current_stage = ?, status = "Pass", reject_reason = ? WHERE batch_number = ? AND axle_no = ?', (new_batch_no, current_stage, res, batch_number, ax))
                    
                    log_production_action(conn, new_batch_no, current_stage, f"Created as Partial Split from {batch_number}", remark, current_user, active_machine)
                    flash(f"Created Sub-Batch '{new_batch_no}' with {hold_qty} pcs held back in {current_stage}.")

                if passed_qty > 0 and origin_stage and origin_stage in WORKFLOW_STAGES and '[Admin Correction]' not in orig_batch['remarks']:
                    flash(f'Batch #{batch_number} Rework completed! It has directly returned to its Origin Stage: {origin_stage}.')
                elif passed_qty > 0:
                    flash(f'{current_stage} evaluation completed for Batch #{batch_number}.')

            elif action == 'process_delivery':
                del_qty = request.form.get('del_qty')
                del_vehicle = request.form.get('del_vehicle')
                driver_name = request.form.get('driver_name', 'N/A')
                manual_client = request.form.get('manual_client', 'Unknown Client')
                
                final_remark = f"Delivered To: {manual_client} | Vehicle: {del_vehicle}, Driver: {driver_name} | Note: {remark}"
                
                del_pieces = conn.execute('SELECT axle_no FROM batch_pieces WHERE batch_number = ? AND axle_current_stage = "Delivery"', (batch_number,)).fetchall()
                
                conn.execute('''
                    UPDATE batches 
                    SET current_stage = "Delivered", status = "Delivered", remarks = ?, action_time = ?
                    WHERE batch_number = ?
                ''', (final_remark, timestamp, batch_number))
                
                conn.execute('UPDATE batch_pieces SET axle_current_stage = "Delivered" WHERE batch_number = ? AND axle_current_stage = "Delivery"', (batch_number,))
                
                for p in del_pieces:
                    log_axle_action(conn, batch_number, p['axle_no'], 'Delivery', f"Delivered to {manual_client}", final_remark, current_user, active_machine)
                
                log_production_action(conn, batch_number, 'Delivery', f"Delivered {del_qty} pcs to {manual_client} via {del_vehicle}", final_remark, current_user, active_machine)
                flash(f'Batch #{batch_number} delivered to {manual_client} successfully.')

            elif action == 'admin_override':
                if 'Admin' not in user_role:
                    flash("Access Denied: Only Admins can perform overrides.")
                else:
                    o_remark = request.form.get('override_remark', 'Admin Master Correction')
                    b_stage = request.form.get('override_batch_stage')
                    b_status = request.form.get('override_batch_status')
                    
                    old_axles = request.form.getlist('override_old_axle[]')
                    new_axles = request.form.getlist('override_axle_no[]')
                    a_stages = request.form.getlist('override_stage[]')
                    a_statuses = request.form.getlist('override_status[]')
                    
                    target_stage_groups = {}
                    for old_ax, new_ax, a_stage, a_status in zip(old_axles, new_axles, a_stages, a_statuses):
                        final_a_stage = a_stage
                        if b_status == 'Pending': final_a_stage = 'Receiving'
                        elif b_status == 'Return to RM QC': final_a_stage = 'RM QC'
                        
                        if final_a_stage not in target_stage_groups:
                            target_stage_groups[final_a_stage] = []
                            
                        target_stage_groups[final_a_stage].append({
                            'old_ax': old_ax, 'new_ax': new_ax.strip(), 'status': a_status
                        })
                    
                    base_bn = batch_number.split('-R')[0].split('-P')[0]
                    orig_batch = conn.execute('SELECT * FROM batches WHERE batch_number = ?', (batch_number,)).fetchone()
                    
                    for t_stage, axles in target_stage_groups.items():
                        target_batch = batch_number
                        if t_stage != b_stage:
                            existing_reworks = conn.execute("SELECT count(*) as c FROM batches WHERE batch_number LIKE ?", (f"{base_bn}-R%",)).fetchone()
                            r_idx = (existing_reworks['c'] if existing_reworks else 0) + 1
                            target_batch = f"{base_bn}-R{r_idx}"
                            
                            rw_remarks = f"[Admin Correction] Recovered from damage & restored to {t_stage}"
                            
                            t_prod_fwd = 0 if t_stage in ['Receiving', 'RM QC', 'Processing'] else 1
                            
                            conn.execute('''
                                INSERT INTO batches (batch_number, client_name, invoice_no, receive_date, quantity, passed_qty, rejected_qty, damaged_qty, current_stage, status, remarks, action_time, production_forwarded)
                                VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, 'Approved', ?, ?, ?)
                            ''', (target_batch, orig_batch['client_name'], orig_batch['invoice_no'], orig_batch['receive_date'], len(axles), t_stage, rw_remarks, timestamp, t_prod_fwd))
                            flash(f"{len(axles)} recovered axle(s) auto-split into new sub-batch '{target_batch}'.")
                        
                        p_c = 0
                        r_c = 0 # Rejected in RMQC
                        d_c = 0 # Damaged in Production
                        
                        for ax in axles:
                            rej_reason = o_remark if ax['status'] in ['Scrap', 'Reject'] else ''
                            conn.execute('''
                                UPDATE batch_pieces 
                                SET batch_number = ?, axle_no = ?, axle_current_stage = ?, status = ?, reject_reason = ? 
                                WHERE batch_number = ? AND axle_no = ?
                            ''', (target_batch, ax['new_ax'], t_stage, ax['status'], rej_reason, batch_number, ax['old_ax']))
                            
                            if ax['status'] == 'Pass': 
                                p_c += 1
                            elif ax['status'] in ['Scrap', 'Reject']: 
                                if t_stage in ['Receiving', 'RM QC', 'Processing']:
                                    r_c += 1
                                else:
                                    d_c += 1
                            
                            log_axle_action(conn, target_batch, ax['new_ax'], t_stage, f"Forced Status to '{ax['status']}'", o_remark, current_user, active_machine)
                            
                        if target_batch != batch_number:
                            conn.execute('UPDATE batches SET passed_qty = ?, rejected_qty = ?, damaged_qty = ? WHERE batch_number = ?', (p_c, r_c, d_c, target_batch))
                            
                    main_pieces = conn.execute('SELECT status, axle_current_stage FROM batch_pieces WHERE batch_number = ?', (batch_number,)).fetchall()
                    passed_count = sum(1 for p in main_pieces if p['status'] == 'Pass')
                    
                    rejected_count = sum(1 for p in main_pieces if p['status'] in ['Scrap', 'Reject'] and p['axle_current_stage'] in ['Receiving', 'RM QC', 'Processing'])
                    damaged_count = sum(1 for p in main_pieces if p['status'] in ['Scrap', 'Reject'] and p['axle_current_stage'] not in ['Receiving', 'RM QC', 'Processing'])
                    
                    if b_status == 'Return to RM QC': b_status = 'Approved'
                    
                    if b_stage in ['Receiving', 'RM QC', 'Processing']:
                        prod_fwd_flag = 0
                    else:
                        prod_fwd_flag = 1
                        
                    if passed_count == 0 and (rejected_count > 0 or damaged_count > 0):
                        if b_status == 'Approved':
                            b_status = 'Scrapped'
                    elif passed_count == 0 and rejected_count == 0 and damaged_count == 0:
                        b_status = 'Empty (Fully Split)'
                    elif passed_count > 0 and b_status in ['Scrapped', 'Rejected', 'Empty (Fully Split)']:
                        b_status = 'Approved'

                    conn.execute('''
                        UPDATE batches
                        SET current_stage = ?, status = ?, production_forwarded = ?, passed_qty = ?, rejected_qty = ?, damaged_qty = ?
                        WHERE batch_number = ?
                    ''', (b_stage, b_status, prod_fwd_flag, passed_count, rejected_count, damaged_count, batch_number))

                    log_production_action(conn, batch_number, b_stage, "Admin Override Applied", o_remark, current_user, active_machine)
                    flash(f"Batch #{batch_number} successfully overwritten and routed to {b_stage}.")

            conn.commit()
        except Exception as e:
            flash(f"Database Error: {str(e)}")
        finally:
            conn.close()
        return redirect(url_for('production.production'))
        
    try:
        active_stage_filter = session.get('active_stage')
        user_role_filter = session.get('role', '')

        if 'Admin' not in user_role_filter and 'RM' not in user_role_filter and active_stage_filter:
            production_batches = conn.execute('''
                SELECT * FROM batches 
                WHERE status NOT IN ("Pending", "Scrapped", "Returned to Client", "Delivered", "Split for Rework", "Empty (Fully Split)", "Merged", "Split for Rework/Hold") 
                AND current_stage NOT IN ("Receiving", "RM QC", "Processing") 
                AND current_stage = ?
                AND production_forwarded = 1
                AND passed_qty > 0
                ORDER BY rowid DESC
            ''', (active_stage_filter,)).fetchall()
        else:
            production_batches = conn.execute('''
                SELECT * FROM batches 
                WHERE status NOT IN ("Pending", "Scrapped", "Returned to Client", "Delivered", "Split for Rework", "Empty (Fully Split)", "Merged", "Split for Rework/Hold") 
                AND current_stage NOT IN ("Receiving", "RM QC", "Processing") 
                AND production_forwarded = 1
                AND passed_qty > 0
                ORDER BY rowid DESC
            ''').fetchall()
        
        delivered_batches = conn.execute('''
            SELECT * FROM batches WHERE status = "Delivered" ORDER BY rowid DESC
        ''').fetchall()
        
        pipeline_stages = ["Receiving", "RM QC", "Facing 1/Center Drilling", "Roughing", "Finishing", "Facing 2/Drill Tapping", "Final QC (Internal)", "Finish Goods/Inspection (Client)", "Delivery"]
        batches_by_stage = {stage: [] for stage in pipeline_stages}
        
        all_active_batches = conn.execute('''
            SELECT * FROM batches 
            WHERE status NOT IN ("Scrapped", "Returned to Client", "Delivered", "Split for Rework", "Empty (Fully Split)", "Merged", "Split for Rework/Hold")
        ''').fetchall()
        
        for b in all_active_batches:
            st = b['current_stage']
            prod_fwd = b['production_forwarded'] if 'production_forwarded' in b.keys() else 0
            
            if st in ['Production', 'RM', 'Processing', 'RM QC']: 
                st = 'RM QC'
                if b['status'] == 'Pending': st = 'Receiving'
            
            if st == 'Facing 1': st = 'Facing 1/Center Drilling'
            if st == 'Facing 2': st = 'Facing 2/Drill Tapping'
            if st == 'Final Centering': st = 'Final QC (Internal)'
            if st in ['Finish Store', 'Finish Goods']: st = 'Finish Goods/Inspection (Client)'

            if prod_fwd == 1 or st in ['Receiving', 'RM QC']:
                if st in batches_by_stage: 
                    batches_by_stage[st].append(b['batch_number'])
                
        all_logs = conn.execute('SELECT * FROM production_logs ORDER BY timestamp ASC').fetchall()
        logs_by_batch = {}
        for log in all_logs:
            bn = log['batch_number']
            if bn not in logs_by_batch: logs_by_batch[bn] = []
            logs_by_batch[bn].append(dict(log))
            
        all_batches_raw = conn.execute('SELECT * FROM batches').fetchall()
        batches_dict = {b['batch_number']: dict(b) for b in all_batches_raw}

        pieces_raw = conn.execute('SELECT id, batch_number, sl_no, axle_no, status, axle_current_stage, reject_reason FROM batch_pieces ORDER BY sl_no').fetchall()
        pieces_dict = {}
        master_pieces_dict = {}
        
        for p in pieces_raw:
            p_dict = {
                'id': p['id'],
                'batch_number': p['batch_number'], 
                'sl_no': p['sl_no'],
                'axle_no': p['axle_no'],
                'status': p['status'],
                'axle_current_stage': p['axle_current_stage'],
                'reject_reason': p['reject_reason']
            }
            if p['batch_number'] not in pieces_dict:
                pieces_dict[p['batch_number']] = []
            pieces_dict[p['batch_number']].append(p_dict)
            
            base_bn = p['batch_number'].split('-R')[0].split('-P')[0]
            if base_bn not in master_pieces_dict:
                master_pieces_dict[base_bn] = []
            master_pieces_dict[base_bn].append(p_dict)
            
        scraps_raw = conn.execute('SELECT batch_number, stage_name, axle_no, reason, timestamp, done_by FROM batch_scraps ORDER BY timestamp ASC').fetchall()
        master_scraps_dict = {}
        for s in scraps_raw:
            base_bn = s['batch_number'].split('-R')[0].split('-P')[0]
            if base_bn not in master_scraps_dict:
                master_scraps_dict[base_bn] = []
            master_scraps_dict[base_bn].append(dict(s))
            
        damaged_pieces_raw = conn.execute('''
            SELECT bp.batch_number, bp.axle_no, bp.status, bp.reject_reason, bp.axle_current_stage,
                   b.client_name, b.invoice_no, b.receive_date, b.current_stage as batch_stage
            FROM batch_pieces bp
            JOIN batches b ON bp.batch_number = b.batch_number
            WHERE bp.status IN ('Scrap', 'Reject')
            AND bp.axle_current_stage IS NOT NULL 
            AND bp.axle_current_stage NOT IN ('Receiving', 'RM QC', 'Processing', 'None')
            ORDER BY b.receive_date DESC, bp.batch_number DESC
        ''').fetchall()
        
        damaged_pieces = []
        for dp in damaged_pieces_raw:
            dp_dict = dict(dp)
            base_bn = dp_dict['batch_number'].split('-R')[0].split('-P')[0]
            axle_scraps = [s for s in master_scraps_dict.get(base_bn, []) if s['axle_no'] == dp_dict['axle_no']]
            
            tot_scrap = 0.0
            last_worker = "Unknown"
            for s in axle_scraps:
                if 'done_by' in s and s['done_by']:
                    last_worker = s['done_by']
                m = re.search(r'\d+(\.\d+)?', s['reason'])
                if m:
                    tot_scrap += float(m.group())
                    
            dp_dict['total_scrap'] = round(tot_scrap, 2)
            dp_dict['damaged_by'] = last_worker
            damaged_pieces.append(dp_dict)

        machines_raw = conn.execute("SELECT * FROM machines ORDER BY id").fetchall()
        machines = [dict(m) for m in machines_raw]
        
        machine_logs_raw = conn.execute("SELECT * FROM machine_logs ORDER BY id DESC LIMIT 150").fetchall()
        machine_logs = [dict(l) for l in machine_logs_raw]

    finally:
        conn.close()
        
    return render_template('production.html', 
                           stages=pipeline_stages, 
                           batches_by_stage=batches_by_stage,
                           production_batches=production_batches, 
                           delivered_batches=delivered_batches,
                           logs_by_batch=logs_by_batch,
                           batches_dict=batches_dict,
                           pieces_dict=pieces_dict,
                           master_pieces_dict=master_pieces_dict,
                           master_scraps_dict=master_scraps_dict,
                           damaged_pieces=damaged_pieces,
                           machines=machines,
                           machine_logs=machine_logs,
                           active_machine=session.get('active_machine'),
                           active_stage=session.get('active_stage'),
                           user_role=session.get('role', ''),
                           username=session.get('username'))

@production_bp.route('/audit_log', methods=['GET', 'POST'])
def audit_log():
    if 'logged_in' not in session or 'Admin' not in session.get('role', ''):
        flash("Access Denied: Only Admins can view Audit Logs.")
        return redirect(url_for('production.production'))
        
    conn = get_db_connection()
    init_audit_table(conn)
    
    axle_history = {}
    axle_current_status = {}
    selected_batch = ''
    
    base_batches_raw = conn.execute("SELECT DISTINCT batch_number FROM batches WHERE batch_number NOT LIKE '%-R%' AND batch_number NOT LIKE '%-P%' ORDER BY rowid DESC").fetchall()
    base_batches = [b['batch_number'] for b in base_batches_raw]
    
    if request.method == 'POST':
        selected_batch = request.form.get('batch_number', '')
        if selected_batch:
            current_pieces = conn.execute('''
                SELECT axle_no, status, axle_current_stage, reject_reason, batch_number
                FROM batch_pieces
                WHERE batch_number LIKE ?
            ''', (f"{selected_batch}%",)).fetchall()
            
            for p in current_pieces:
                axle_current_status[p['axle_no']] = dict(p)

            raw_logs = conn.execute('''
                SELECT * FROM axle_audit_trail 
                WHERE batch_number LIKE ? 
                ORDER BY timestamp ASC
            ''', (f"{selected_batch}%",)).fetchall()
            
            for log in raw_logs:
                ax = log['axle_no']
                if ax not in axle_history:
                    axle_history[ax] = []
                axle_history[ax].append(dict(log))

    # --- NEW: WORKER MACHINE SESSIONS & AXLE COUNT LOGIC ---
    session_logs_raw = conn.execute("SELECT * FROM machine_logs ORDER BY id DESC").fetchall()
    worker_sessions = []
    for s in session_logs_raw:
        s_dict = dict(s)
        worker_name_base = s_dict['worker_name'].split(' (')[0]
        
        # Calculate how many axles this worker processed during this specific session
        query = '''
            SELECT COUNT(DISTINCT axle_no) as count 
            FROM axle_audit_trail 
            WHERE done_by LIKE ? AND machine_name = ? AND stage_name = ? AND timestamp >= ?
        '''
        params = [f"{worker_name_base}%", s_dict['machine_name'], s_dict['stage_name'], s_dict['login_time']]
        
        if s_dict['logout_time']:
            query += " AND timestamp <= ?"
            params.append(s_dict['logout_time'])
            
        count_res = conn.execute(query, params).fetchone()
        s_dict['axles_processed'] = count_res['count'] if count_res else 0
        worker_sessions.append(s_dict)
    # -------------------------------------------------------
            
    conn.close()
    return render_template('audit_log.html', 
                           axle_history=axle_history,
                           axle_current_status=axle_current_status,
                           base_batches=base_batches, 
                           selected_batch=selected_batch,
                           worker_sessions=worker_sessions) # Added new parameter

@production_bp.route('/force_logout_session', methods=['POST'])
def force_logout_session():
    if 'Admin' not in session.get('role', ''):
        flash("Access Denied.")
        return redirect(url_for('production.audit_log'))
    
    log_id = request.form.get('log_id')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    conn = get_db_connection()
    conn.execute('UPDATE machine_logs SET logout_time = ?, status = "Completed" WHERE id = ?', (timestamp, log_id))
    conn.commit()
    conn.close()
    
    flash("Machine session forcefully closed by Admin.")
    return redirect(url_for('production.audit_log'))
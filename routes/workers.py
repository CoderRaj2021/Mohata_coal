import os
from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from werkzeug.utils import secure_filename
from utils import get_db_connection
import re

workers_bp = Blueprint('workers', __name__)

UPLOAD_FOLDER = 'static/uploads/workers'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@workers_bp.route('/workers', methods=['GET', 'POST'])
def workers():
    if 'logged_in' not in session: return redirect(url_for('auth.login'))
    
    user_role = session.get('role', '')
    conn = get_db_connection()
    
    if request.method == 'POST':
        # STRICT RBAC SECURITY CHECK: Only Admin and RM can modify worker details
        if 'Admin' not in user_role and 'RM' not in user_role:
            flash("Access Denied: Only Admin or RM can add or edit worker details.")
            conn.close()
            return redirect(url_for('workers.workers'))

        action = request.form.get('action')
        
        try:
            if action == 'add':
                name = request.form.get('name')
                phone = request.form.get('phone')
                department = request.form.get('department')
                joining_date = request.form.get('joining_date')
                address = request.form.get('address')
                
                existing = conn.execute('SELECT id FROM workers WHERE name = ?', (name,)).fetchone()
                if existing:
                    flash(f"Error: A worker with the name '{name}' already exists.")
                else:
                    id_proof_file = request.files.get('id_proof')
                    cv_file = request.files.get('cv')
                    
                    id_proof_path = ''
                    if id_proof_file and id_proof_file.filename != '':
                        id_filename = secure_filename(f"{name}_ID_{id_proof_file.filename}")
                        id_proof_file.save(os.path.join(UPLOAD_FOLDER, id_filename))
                        id_proof_path = f"{UPLOAD_FOLDER}/{id_filename}"
                        
                    cv_path = ''
                    if cv_file and cv_file.filename != '':
                        cv_filename = secure_filename(f"{name}_CV_{cv_file.filename}")
                        cv_file.save(os.path.join(UPLOAD_FOLDER, cv_filename))
                        cv_path = f"{UPLOAD_FOLDER}/{cv_filename}"

                    conn.execute('''
                        INSERT INTO workers (name, phone, department, joining_date, address, id_proof, cv) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (name, phone, department, joining_date, address, id_proof_path, cv_path))
                    conn.commit()
                    flash(f'Worker {name} added successfully!')
            
            elif action == 'edit':
                worker_id = request.form.get('worker_id')
                name = request.form.get('name')
                phone = request.form.get('phone')
                department = request.form.get('department')
                joining_date = request.form.get('joining_date')
                address = request.form.get('address')
                
                id_proof_file = request.files.get('id_proof')
                cv_file = request.files.get('cv')
                
                if id_proof_file and id_proof_file.filename != '':
                    id_filename = secure_filename(f"{name}_ID_{id_proof_file.filename}")
                    id_proof_file.save(os.path.join(UPLOAD_FOLDER, id_filename))
                    id_proof_path = f"{UPLOAD_FOLDER}/{id_filename}"
                    conn.execute('UPDATE workers SET id_proof = ? WHERE id = ?', (id_proof_path, worker_id))
                    
                if cv_file and cv_file.filename != '':
                    cv_filename = secure_filename(f"{name}_CV_{cv_file.filename}")
                    cv_file.save(os.path.join(UPLOAD_FOLDER, cv_filename))
                    cv_path = f"{UPLOAD_FOLDER}/{cv_filename}"
                    conn.execute('UPDATE workers SET cv = ? WHERE id = ?', (cv_path, worker_id))

                conn.execute('''
                    UPDATE workers 
                    SET name = ?, phone = ?, department = ?, joining_date = ?, address = ?
                    WHERE id = ?
                ''', (name, phone, department, joining_date, address, worker_id))
                conn.commit()
                flash(f'Worker {name} details updated successfully!')

            elif action == 'edit_status':
                worker_id = request.form.get('worker_id')
                status = request.form.get('status')
                conn.execute('UPDATE workers SET status = ? WHERE id = ?', (status, worker_id))
                conn.commit()
                flash('Worker status updated.')
                
        except Exception as e:
            flash(f"Database Error: {str(e)}")
        finally:
            conn.close()
            
        return redirect(url_for('workers.workers'))
        
    try:
        raw_workers = conn.execute('SELECT * FROM workers ORDER BY name ASC').fetchall()
        all_workers = [dict(w) for w in raw_workers]
        
        assets = conn.execute('SELECT * FROM asset_allocations ORDER BY timestamp DESC').fetchall()
        cash = conn.execute('SELECT * FROM cash_disbursements ORDER BY timestamp DESC').fetchall()
        
        # 1. Fetch Scrap Generation Logs
        scraps_raw = conn.execute('''
            SELECT bs.batch_number, bs.stage_name, bs.axle_no, bs.reason, bs.done_by, bs.timestamp, 
                   b.client_name, b.invoice_no
            FROM batch_scraps bs
            JOIN batches b ON bs.batch_number = b.batch_number
            ORDER BY bs.timestamp DESC
        ''').fetchall()
        
        # 2. Fetch Performance Actions (Pass, Scrapped, Returned, Evaluated)
        actions_raw = conn.execute('''
            SELECT pl.batch_number, pl.stage_name, pl.action_taken, pl.remark, pl.done_by, pl.timestamp,
                   b.client_name, b.invoice_no
            FROM production_logs pl
            JOIN batches b ON pl.batch_number = b.batch_number
            ORDER BY pl.timestamp DESC
        ''').fetchall()
        
        worker_history = {}
        for w in all_workers:
            worker_history[w['name']] = {
                'details': w, 
                'assets': [], 
                'cash': [],
                'performance': []
            }
            
        for a in assets:
            if a['allocated_to'] in worker_history:
                worker_history[a['allocated_to']]['assets'].append(dict(a))
                
        for c in cash:
            if c['allocated_to'] in worker_history:
                worker_history[c['allocated_to']]['cash'].append(dict(c))
                
        # Inject Scrap Logs into Performance 
        for s in scraps_raw:
            worker_name = s['done_by']
            if worker_name in worker_history:
                weight_val = "0"
                m = re.search(r'\d+(\.\d+)?', str(s['reason']))
                if m: weight_val = m.group()
                
                worker_history[worker_name]['performance'].append({
                    'type': 'Scrap Generated',
                    'timestamp': s['timestamp'],
                    'batch_no': s['batch_number'],
                    'client': s['client_name'],
                    'invoice': s['invoice_no'],
                    'stage': s['stage_name'],
                    'axle_no': s['axle_no'],
                    'scrap_weight': f"{weight_val} kg",
                    'details': s['reason']
                })
                
        # Inject Action Logs into Performance
        for act in actions_raw:
            worker_name = act['done_by']
            # Sometimes done_by has "(Role)" appended, try to clean it
            clean_name = worker_name.split(' (')[0] if worker_name else ""
            
            if clean_name in worker_history:
                action_text = act['action_taken'].lower()
                status_color = "#27ae60" # Default Green (Pass/Forward)
                
                if "reject" in action_text or "scrap" in action_text:
                    status_color = "#e74c3c" # Red
                elif "rework" in action_text or "split" in action_text:
                    status_color = "#8e44ad" # Purple/Orange
                    
                worker_history[clean_name]['performance'].append({
                    'type': 'Action Taken',
                    'timestamp': act['timestamp'],
                    'batch_no': act['batch_number'],
                    'client': act['client_name'],
                    'invoice': act['invoice_no'],
                    'stage': act['stage_name'],
                    'axle_no': 'Batch Level',
                    'scrap_weight': '-',
                    'details': f"<span style='color:{status_color}; font-weight:bold;'>{act['action_taken']}</span>: {act['remark']}"
                })
                
        # Sort performance array by timestamp descending
        for w_name in worker_history:
            worker_history[w_name]['performance'].sort(key=lambda x: x['timestamp'], reverse=True)
                
    finally:
        conn.close()
        
    return render_template('workers.html', workers=all_workers, worker_history=worker_history)
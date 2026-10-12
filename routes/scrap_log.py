import sqlite3
from flask import Blueprint, render_template, session, redirect, url_for, flash, request
from utils import get_db_connection
import re

scrap_log_bp = Blueprint('scrap_log', __name__)

@scrap_log_bp.route('/scrap_log', methods=['GET', 'POST'])
def scrap_log():
    if 'logged_in' not in session: 
        return redirect(url_for('auth.login'))
        
    if 'Admin' not in session.get('role', ''):
        flash("Access Denied: Only Admins can view the Scrap Log.", "error")
        return redirect(url_for('production.production'))
        
    conn = get_db_connection()
    
    # ==========================================
    # NEW: CREATE SCRAP SALES TABLE IF NOT EXISTS
    # ==========================================
    conn.execute('''
        CREATE TABLE IF NOT EXISTS scrap_sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_date TEXT,
            buyer_name TEXT,
            invoice_no TEXT,
            quantity REAL,
            rate REAL,
            total_amount REAL,
            remarks TEXT,
            sold_by TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()

    # ==========================================
    # NEW: HANDLE SCRAP SELL FORM SUBMISSION
    # ==========================================
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'sell_scrap':
            date = request.form.get('sale_date')
            buyer = request.form.get('buyer_name')
            invoice = request.form.get('invoice_no')
            
            try:
                qty = float(request.form.get('quantity') or 0)
                rate = float(request.form.get('rate') or 0)
            except ValueError:
                qty = 0.0
                rate = 0.0
                
            total_amount = qty * rate
            remarks = request.form.get('remarks', '')
            sold_by = session.get('username')

            conn.execute('''
                INSERT INTO scrap_sales (sale_date, buyer_name, invoice_no, quantity, rate, total_amount, remarks, sold_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (date, buyer, invoice, qty, rate, total_amount, remarks, sold_by))
            conn.commit()
            conn.close()
            
            flash(f"Scrap sale of {qty} kg recorded successfully! Invoice: {invoice}", "success")
            return redirect(url_for('scrap_log.scrap_log'))

    # ==========================================
    # FETCH ALL REQUIRED DATA FOR GET REQUEST
    # ==========================================
    # 1. Fetch all scrap and damage logs
    all_scraps = conn.execute("SELECT * FROM batch_scraps ORDER BY timestamp DESC").fetchall()
    
    # 2. Fetch scrapped/rejected axles from the production line
    damaged_pieces = conn.execute('''
        SELECT bp.batch_number, bp.axle_no, bp.status, bp.reject_reason, bp.axle_current_stage, b.client_name,
               (SELECT done_by FROM batch_scraps WHERE batch_number = bp.batch_number AND axle_no = bp.axle_no ORDER BY timestamp DESC LIMIT 1) as damaged_by
        FROM batch_pieces bp
        JOIN batches b ON bp.batch_number = b.batch_number
        WHERE bp.status IN ('Scrap', 'Reject') AND bp.axle_current_stage NOT IN ('Receiving', 'RM QC')
    ''').fetchall()

    # 3. Fetch Scrap Sales History
    sales_history = conn.execute("SELECT * FROM scrap_sales ORDER BY id DESC").fetchall()

    # 4. Fetch users and workers for the Manage Users Modal
    all_users = conn.execute('SELECT * FROM users').fetchall()
    global_workers = conn.execute('SELECT * FROM workers').fetchall()

    conn.close()

    # ==========================================
    # DATA PROCESSING & INVENTORY CALCULATION
    # ==========================================
    parsed_scraps = []
    worker_stats = {}
    batch_stats = {}
    
    total_scrap_generated = 0.0 # Tracking overall factory scrap

    for row in all_scraps:
        s = dict(row)
        weight = 0.0
        
        # Extract weight (number) from text like '1.5 kg (Process Scrap)'
        m = re.search(r'(\d+(\.\d+)?)\s*kg', s['reason'], re.IGNORECASE)
        if m:
            weight = float(m.group(1))
        elif "Scrap" in s['reason']:
            m2 = re.search(r'^\d+(\.\d+)?', s['reason'])
            if m2:
                weight = float(m2.group(0))
                
        s['extracted_weight'] = weight
        parsed_scraps.append(s)
        
        # Add to total generated scrap
        total_scrap_generated += weight

        # Worker-wise statistics
        w_name = s['done_by']
        if w_name not in worker_stats:
            worker_stats[w_name] = {'total_weight': 0.0, 'incidents': 0}
        worker_stats[w_name]['total_weight'] += weight
        worker_stats[w_name]['incidents'] += 1

        # Batch-wise statistics
        b_no = s['batch_number']
        if b_no not in batch_stats:
            batch_stats[b_no] = {'total_weight': 0.0, 'incidents': 0}
        batch_stats[b_no]['total_weight'] += weight
        batch_stats[b_no]['incidents'] += 1

    # Calculate Total Sold and Current Balance
    total_scrap_sold = sum([row['quantity'] for row in sales_history])
    current_scrap_balance = total_scrap_generated - total_scrap_sold

    # Sort by maximum scrap generated (workers and batches)
    sorted_workers = sorted(worker_stats.items(), key=lambda x: x[1]['total_weight'], reverse=True)
    sorted_batches = sorted(batch_stats.items(), key=lambda x: x[1]['total_weight'], reverse=True)

    return render_template('scrap_log.html', 
                           all_scraps=parsed_scraps, 
                           worker_stats=sorted_workers, 
                           batch_stats=sorted_batches,
                           damaged_pieces=[dict(d) for d in damaged_pieces],
                           all_users=all_users,
                           global_workers=global_workers,
                           sales_history=[dict(sh) for sh in sales_history],
                           total_scrap_generated=round(total_scrap_generated, 2),
                           total_scrap_sold=round(total_scrap_sold, 2),
                           current_scrap_balance=round(current_scrap_balance, 2))
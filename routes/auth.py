import re
from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from utils import get_db_connection

auth_bp = Blueprint('auth', __name__)

@auth_bp.app_context_processor
def inject_global_data():
    if 'logged_in' not in session:
        return dict(global_workers=[], all_users=[], low_stock_count=0)
        
    conn = get_db_connection()
    try:
        workers = conn.execute('SELECT name, department FROM workers WHERE status = "Active" ORDER BY name ASC').fetchall()
        users = conn.execute('SELECT username, password, role FROM users ORDER BY username ASC').fetchall()
        low_stock_row = conn.execute('SELECT COUNT(*) as count FROM assets_stock WHERE total_quantity <= low_stock_threshold').fetchone()
        low_stock_count = low_stock_row['count'] if low_stock_row else 0
    except Exception:
        workers = []
        users = []
        low_stock_count = 0
    finally:
        conn.close()
    return dict(global_workers=workers, all_users=users, low_stock_count=low_stock_count)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password'].strip()
        conn = get_db_connection()
        try:
            user = conn.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, password)).fetchone()
        finally:
            conn.close()
        
        if user:
            session['logged_in'] = True
            session['username'] = user['username']
            session['role'] = user['role']
            return redirect(url_for('auth.dashboard'))
        else:
            flash('Invalid Username or Password!')
    return render_template('login.html')

@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth.login'))

@auth_bp.route('/')
def dashboard():
    if 'logged_in' not in session:
        return redirect(url_for('auth.login'))
        
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    date_filter_query = ""
    date_params = []
    batch_date_query = ""
    batch_date_params = []
    
    if start_date and end_date:
        date_filter_query = " AND timestamp >= ? AND timestamp <= ?"
        date_params = [f"{start_date} 00:00:00", f"{end_date} 23:59:59"]
        
        batch_date_query = " AND b.action_time >= ? AND b.action_time <= ?"
        batch_date_params = [f"{start_date} 00:00:00", f"{end_date} 23:59:59"]
        
    conn = get_db_connection()
    try:
        # 1. Live Operations Data (Unfiltered)
        active_batches_row = conn.execute('SELECT COUNT(*) as count FROM batches WHERE status != "Scrapped" AND status != "Returned to Client" AND current_stage != "Delivery"').fetchone()
        active_batches = active_batches_row['count'] if active_batches_row else 0
        
        workers_row = conn.execute('SELECT COUNT(*) as count FROM workers WHERE status = "Active"').fetchone()
        workers_present = workers_row['count'] if workers_row else 0

        pending_supply_row = conn.execute('SELECT COUNT(*) as count FROM batches WHERE status = "Pending"').fetchone()
        pending_supply = pending_supply_row['count'] if pending_supply_row else 0

        # Filtered Delivered Batches
        if start_date and end_date:
            delivered_row = conn.execute(f'SELECT COUNT(*) as count FROM batches WHERE (current_stage = "Delivery" OR status = "Delivered") AND action_time >= ? AND action_time <= ?', batch_date_params).fetchone()
        else:
            delivered_row = conn.execute('SELECT COUNT(*) as count FROM batches WHERE current_stage = "Delivery" OR status = "Delivered"').fetchone()
        delivered_batches = delivered_row['count'] if delivered_row else 0

        stages = ["Receiving", "Processing", "RM", "Facing 1", "Roughing", "Facing 2", "Final Centering", "Inspection"]
        pipeline_counts = {stage: 0 for stage in stages}
        stage_data = conn.execute('SELECT current_stage, COUNT(*) as count FROM batches WHERE status != "Scrapped" AND status != "Returned to Client" AND current_stage != "Delivery" GROUP BY current_stage').fetchall()
        for row in stage_data:
            if row['current_stage'] in pipeline_counts:
                pipeline_counts[row['current_stage']] = row['count']
        
        pipeline_labels = list(pipeline_counts.keys())
        pipeline_values = list(pipeline_counts.values())

        if start_date and end_date:
            recent_deliveries = conn.execute('SELECT batch_number, client_name, passed_qty FROM batches WHERE (current_stage = "Delivery" OR status = "Delivered") AND action_time >= ? AND action_time <= ? ORDER BY rowid DESC LIMIT 5', batch_date_params).fetchall()
        else:
            recent_deliveries = conn.execute('SELECT batch_number, client_name, passed_qty FROM batches WHERE (current_stage = "Delivery" OR status = "Delivered") ORDER BY rowid DESC LIMIT 5').fetchall()

        # ==========================================
        # Quality Health & Scrap Analytics (Filtered)
        # ==========================================
        if start_date and end_date:
            pieces_status = conn.execute(f'''
                SELECT bp.status, COUNT(*) as count 
                FROM batch_pieces bp
                JOIN batches b ON bp.batch_number = b.batch_number
                WHERE 1=1 {batch_date_query}
                GROUP BY bp.status
            ''', batch_date_params).fetchall()
        else:
            pieces_status = conn.execute('SELECT status, COUNT(*) as count FROM batch_pieces GROUP BY status').fetchall()
            
        total_passed = 0
        total_scrapped = 0
        total_reworked = 0
        total_returned_client = 0
        
        for p in pieces_status:
            if p['status'] == 'Scrap': total_scrapped += p['count']
            elif p['status'] == 'Reject': total_returned_client += p['count']
            elif p['status'] == 'Rework': total_reworked += p['count']
            else: total_passed += p['count']
            
        scraps = conn.execute(f'SELECT stage_name, reason, done_by, timestamp FROM batch_scraps WHERE 1=1 {date_filter_query} ORDER BY timestamp ASC', date_params).fetchall()
        total_scrap_kg = 0.0
        stage_scrap_dict = {}
        trend_dict = {}
        worker_scrap_dict = {}
        
        for s in scraps:
            m = re.search(r'\d+(\.\d+)?', str(s['reason']))
            weight = float(m.group()) if m else 0.0
            
            total_scrap_kg += weight
            
            stage = s['stage_name']
            stage_scrap_dict[stage] = stage_scrap_dict.get(stage, 0.0) + weight
            
            worker = str(s['done_by']).split(' (')[0]
            worker_scrap_dict[worker] = worker_scrap_dict.get(worker, 0.0) + weight
            
            date_str = s['timestamp'].split(' ')[0]
            trend_dict[date_str] = trend_dict.get(date_str, 0.0) + weight
            
        stage_scrap_labels = list(stage_scrap_dict.keys())
        stage_scrap_values = [round(v, 2) for v in stage_scrap_dict.values()]
        
        sorted_dates = sorted(trend_dict.keys())[-7:]
        scrap_trend_labels = sorted_dates
        scrap_trend_values = [round(trend_dict[d], 2) for d in sorted_dates]
        
        top_scrap_workers = sorted([{'name': k, 'total': round(v, 2)} for k, v in worker_scrap_dict.items() if v > 0], key=lambda x: x['total'], reverse=True)[:5]
        scrap_worker_labels = [w['name'] for w in top_scrap_workers]
        scrap_worker_values = [w['total'] for w in top_scrap_workers]

        # Worker Productivity Analytics
        prod_logs = conn.execute(f'''
            SELECT done_by, COUNT(*) as tasks_done 
            FROM production_logs 
            WHERE (action_taken LIKE '%Forward%' OR action_taken LIKE '%Evaluated%' OR action_taken LIKE '%Delivered%')
            {date_filter_query}
            GROUP BY done_by
        ''', date_params).fetchall()
        
        worker_prod_dict = {}
        for row in prod_logs:
            w_name = str(row['done_by']).split(' (')[0]
            worker_prod_dict[w_name] = worker_prod_dict.get(w_name, 0) + row['tasks_done']
            
        top_prod_workers = sorted([{'name': k, 'tasks': v} for k, v in worker_prod_dict.items()], key=lambda x: x['tasks'], reverse=True)[:5]
        prod_worker_labels = [w['name'] for w in top_prod_workers]
        prod_worker_values = [w['tasks'] for w in top_prod_workers]

        # 2. Financial Analytics Data (Filtered)
        purchased_row = conn.execute(f'SELECT SUM(cost) as total FROM purchase_history WHERE 1=1 {date_filter_query}', date_params).fetchone()
        total_purchased = purchased_row['total'] if purchased_row['total'] else 0.0
        
        disbursed_row = conn.execute(f'SELECT SUM(amount) as total FROM cash_disbursements WHERE 1=1 {date_filter_query}', date_params).fetchone()
        cash_disbursed = disbursed_row['total'] if disbursed_row['total'] else 0.0
        
        asset_consumed_query = conn.execute(f'''
            SELECT a.allocated_to, a.item_name, a.quantity, 
                   COALESCE((SELECT SUM(cost)/NULLIF(SUM(quantity), 0) FROM purchase_history p WHERE p.item_name = a.item_name), 0) as avg_cost
            FROM asset_allocations a
            WHERE 1=1 {date_filter_query}
        ''', date_params).fetchall()
        asset_consumed = sum((row['quantity'] * row['avg_cost']) for row in asset_consumed_query)

        inventory_data = conn.execute('''
            SELECT item_name, total_quantity,
                   COALESCE((SELECT SUM(cost)/NULLIF(SUM(quantity), 0) FROM purchase_history p WHERE p.item_name = assets_stock.item_name), 0) as avg_cost
            FROM assets_stock WHERE total_quantity > 0
        ''').fetchall()
        live_warehouse_value = sum((item['total_quantity'] * item['avg_cost']) for item in inventory_data)
        
        # 3. Top Expense by Worker
        worker_expenses = {}
        cash_data = conn.execute(f'SELECT allocated_to, SUM(amount) as total FROM cash_disbursements WHERE 1=1 {date_filter_query} GROUP BY allocated_to', date_params).fetchall()
        for row in cash_data: 
            worker_expenses[row['allocated_to']] = worker_expenses.get(row['allocated_to'], 0) + (row['total'] or 0)
            
        for r in asset_consumed_query: 
            worker_expenses[r['allocated_to']] = worker_expenses.get(r['allocated_to'], 0) + (r['quantity'] * r['avg_cost'])
        
        top_exp_workers = sorted([{'name': k, 'total': round(v, 2)} for k, v in worker_expenses.items()], key=lambda x: x['total'], reverse=True)[:5]
        
        # 4. Inventory List for Table
        inventory_valuation = []
        for item in inventory_data:
            inventory_valuation.append({
                'item_name': item['item_name'], 'quantity': item['total_quantity'],
                'avg_cost': round(item['avg_cost'], 2), 'total_value': round(item['total_quantity'] * item['avg_cost'], 2)
            })

    except Exception as e:
        active_batches = 0; workers_present = 0; pending_supply = 0; delivered_batches = 0
        total_purchased = 0.0; cash_disbursed = 0.0; asset_consumed = 0.0; live_warehouse_value = 0.0
        top_exp_workers = []; inventory_valuation = []; recent_deliveries = []
        pipeline_labels = []; pipeline_values = []
        
        total_passed = 0; total_scrapped = 0; total_reworked = 0; total_returned_client = 0
        total_scrap_kg = 0.0; stage_scrap_labels = []; stage_scrap_values = []
        scrap_trend_labels = []; scrap_trend_values = []
        scrap_worker_labels = []; scrap_worker_values = []
        prod_worker_labels = []; prod_worker_values = []
        
    finally:
        conn.close()
        
    return render_template('dashboard.html', 
                           active_batches=active_batches, workers_present=workers_present,
                           pending_supply=pending_supply, delivered_batches=delivered_batches,
                           pipeline_labels=pipeline_labels, pipeline_values=pipeline_values,
                           recent_deliveries=recent_deliveries,
                           
                           total_passed=total_passed, 
                           total_scrapped=total_scrapped,
                           total_reworked=total_reworked,
                           total_returned_client=total_returned_client,
                           
                           total_scrap_kg=round(total_scrap_kg, 2),
                           stage_scrap_labels=stage_scrap_labels, stage_scrap_values=stage_scrap_values,
                           scrap_trend_labels=scrap_trend_labels, scrap_trend_values=scrap_trend_values,
                           scrap_worker_labels=scrap_worker_labels, scrap_worker_values=scrap_worker_values,
                           prod_worker_labels=prod_worker_labels, prod_worker_values=prod_worker_values,
                           
                           total_purchased=round(total_purchased, 2), cash_disbursed=round(cash_disbursed, 2),
                           asset_consumed=round(asset_consumed, 2), live_warehouse_value=round(live_warehouse_value, 2),
                           top_workers=top_exp_workers, inventory_valuation=inventory_valuation)

@auth_bp.route('/add_user', methods=['POST'])
def add_user():
    if 'logged_in' not in session: return redirect(url_for('auth.login'))
    user_role = session.get('role', '')
    if 'Admin' not in user_role and 'RM' not in user_role:
        flash("Access Denied: Only Admin or RM can create new users.")
        return redirect(url_for('auth.dashboard'))
        
    worker_name = request.form.get('username').strip()
    username = worker_name.replace(" ", "").lower() 
    password = request.form.get('password').strip()
    permissions_list = request.form.getlist('permissions') 
    role = ", ".join(permissions_list) if permissions_list else "Worker"
    
    conn = get_db_connection()
    try:
        if conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone():
            flash(f"Error: User ID '{username}' already exists!")
        else:
            conn.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', (username, password, role))
            conn.commit()
            flash(f"System user '{username}' created successfully!")
    except Exception as e:
        flash(f"Database Error: {str(e)}")
    finally:
        conn.close()
    return redirect(url_for('auth.dashboard'))

@auth_bp.route('/edit_user', methods=['POST'])
def edit_user():
    if 'logged_in' not in session: return redirect(url_for('auth.login'))
    
    if 'Admin' not in session.get('role', ''):
        flash("Access Denied: Only Admins can edit users.")
        return redirect(request.referrer or url_for('auth.dashboard'))
        
    old_username = request.form.get('old_username')
    new_username = request.form.get('username').strip()
    password = request.form.get('password').strip()
    
    # ফর্মের চেকবক্স থেকে সিলেক্ট করা রোলগুলো নেওয়া হচ্ছে
    permissions = request.form.getlist('permissions')
    roles_str = ", ".join(permissions) if permissions else "Worker"
    
    conn = get_db_connection()
    try:
        conn.execute('UPDATE users SET username = ?, password = ?, role = ? WHERE username = ?', 
                     (new_username, password, roles_str, old_username))
        conn.commit()
        flash(f"User '{new_username}' profile and assigned stages updated successfully!")
    except Exception as e:
        flash("Error: Username might already exist or there is a database issue.")
    finally:
        conn.close()
        
    return redirect(request.referrer or url_for('auth.dashboard'))

@auth_bp.route('/change_password', methods=['POST'])
def change_password():
    if 'logged_in' not in session: return redirect(url_for('auth.login'))
    current_password = request.form['current_password'].strip()
    new_password = request.form['new_password'].strip()
    confirm_password = request.form['confirm_password'].strip()
    username = session.get('username')
    
    if new_password != confirm_password:
        flash('New password and Confirm password do not match!')
        return redirect(url_for('auth.dashboard'))
        
    conn = get_db_connection()
    try:
        user = conn.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, current_password)).fetchone()
        if user:
            conn.execute('UPDATE users SET password = ? WHERE username = ?', (new_password, username))
            conn.commit()
            flash('Password changed successfully! Please login with your new password.')
            session.clear()
            return redirect(url_for('auth.login'))
        else:
            flash('Incorrect current password!')
            return redirect(url_for('auth.dashboard'))
    finally:
        conn.close()
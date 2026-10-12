from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from utils import get_db_connection
from datetime import datetime, timedelta

expenses_bp = Blueprint('expenses', __name__)

@expenses_bp.route('/expenses', methods=['GET', 'POST'])
def expenses():
    if 'logged_in' not in session:
        return redirect(url_for('auth.login'))
        
    # STRICT RBAC SECURITY CHECK: Only Admin and RM can view Expenses
    user_role = session.get('role', '')
    if 'Admin' not in user_role and 'RM' not in user_role:
        flash("Access Denied: You do not have permission to view Expenses & Analytics.")
        return redirect(url_for('auth.dashboard'))
        
    # Default to current month if no dates are selected
    today = datetime.today()
    start_date = today.replace(day=1).strftime('%Y-%m-%d')
    end_date = today.strftime('%Y-%m-%d')
    
    if request.method == 'POST':
        start_date = request.form.get('start_date', start_date)
        end_date = request.form.get('end_date', end_date)

    conn = get_db_connection()
    try:
        # 1. Calculate Average Cost per Item
        avg_costs = {}
        purchases = conn.execute('SELECT item_name, SUM(cost) as total_cost, SUM(quantity) as total_qty FROM purchase_history GROUP BY item_name').fetchall()
        for p in purchases:
            avg_costs[p['item_name']] = p['total_cost'] / p['total_qty'] if p['total_qty'] > 0 else 0

        # 2. Total Purchase Value in Selected Date Range
        purchase_range = conn.execute('''
            SELECT SUM(cost) as total_spent FROM purchase_history 
            WHERE purchase_date BETWEEN ? AND ?
        ''', (start_date, end_date)).fetchone()
        total_purchase_val = purchase_range['total_spent'] or 0.0

        # 3. Consumed Value (Assets) in Date Range
        allocations = conn.execute('''
            SELECT item_name, quantity, allocated_to, purpose, timestamp 
            FROM asset_allocations 
            WHERE status = "Consumed" AND date(timestamp) BETWEEN ? AND ?
        ''', (start_date, end_date)).fetchall()
        
        # 4. Consumed Value (Cash) in Date Range
        cash_allocations = conn.execute('''
            SELECT amount, allocated_to, purpose, timestamp 
            FROM cash_disbursements 
            WHERE date(timestamp) BETWEEN ? AND ?
        ''', (start_date, end_date)).fetchall()
        
        total_consumed_val = 0.0
        total_cash_val = 0.0
        worker_consumption = {}
        worker_details = {} 
        
        # Process Assets
        for alloc in allocations:
            item = alloc['item_name']
            qty = alloc['quantity']
            worker = alloc['allocated_to']
            cost = avg_costs.get(item, 0) * qty
            total_consumed_val += cost
            
            if worker not in worker_consumption:
                worker_consumption[worker] = 0.0
                worker_details[worker] = []
                
            worker_consumption[worker] += cost
            worker_details[worker].append({
                'date': alloc['timestamp'],
                'item': item,
                'qty': qty,
                'purpose': alloc['purpose'],
                'cost': round(cost, 2)
            })

        # Process Cash
        for cash in cash_allocations:
            worker = cash['allocated_to']
            amount = cash['amount']
            total_cash_val += amount
            
            if worker not in worker_consumption:
                worker_consumption[worker] = 0.0
                worker_details[worker] = []
                
            worker_consumption[worker] += amount
            worker_details[worker].append({
                'date': cash['timestamp'],
                'item': 'CASH ALLOCATION',
                'qty': 'N/A',
                'purpose': cash['purpose'],
                'cost': round(amount, 2)
            })

        # Sort worker consumption from highest to lowest
        worker_stats = [{'worker': k, 'total': round(v, 2)} for k, v in sorted(worker_consumption.items(), key=lambda item: item[1], reverse=True)]

        # 5. Current Stock Valuation (Value of assets currently in warehouse)
        stock = conn.execute('SELECT item_name, total_quantity, unit FROM assets_stock').fetchall()
        current_stock_value = 0.0
        inventory_valuation = []
        
        for s in stock:
            item = s['item_name']
            qty = s['total_quantity']
            cost_per_unit = avg_costs.get(item, 0)
            total_val = qty * cost_per_unit
            current_stock_value += total_val
            
            if qty > 0:
                inventory_valuation.append({
                    'item': item, 
                    'qty': qty, 
                    'unit': s['unit'], 
                    'avg_price': round(cost_per_unit, 2), 
                    'total_value': round(total_val, 2)
                })

    finally:
        conn.close()

    return render_template('expenses.html', 
                           start_date=start_date, end_date=end_date,
                           total_purchase_val=round(total_purchase_val, 2),
                           total_consumed_val=round(total_consumed_val, 2),
                           total_cash_val=round(total_cash_val, 2),
                           current_stock_value=round(current_stock_value, 2),
                           worker_stats=worker_stats,
                           worker_details=worker_details,
                           inventory_valuation=inventory_valuation)
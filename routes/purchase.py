from flask import Blueprint, render_template, request, session, redirect, url_for, flash
from utils import get_db_connection
from datetime import datetime

purchase_bp = Blueprint('purchase', __name__)

@purchase_bp.route('/purchase', methods=['GET', 'POST'])
def purchase():
    if 'logged_in' not in session:
        return redirect(url_for('auth.login'))
        
    current_user = f"{session.get('username')} ({session.get('role')})"
    user_role = session.get('role', '')
    current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if request.method == 'POST':
        action = request.form.get('action')
        
        # STRICT RBAC SECURITY CHECK: Only Admin and RM can modify Purchase and Assets
        if 'Admin' not in user_role and 'RM' not in user_role:
            flash("Access Denied: You do not have permission to modify purchases or assets.")
            return redirect(url_for('purchase.purchase'))

        conn = get_db_connection()
        try:
            if action == 'add_purchase':
                item_name = request.form['item_name'].strip().title()
                quantity = int(request.form['quantity'])
                unit = request.form['unit']
                invoice_no = request.form['invoice_no']
                cost = float(request.form.get('cost', 0.0))
                purchase_date = request.form['purchase_date']
                alert_threshold = int(request.form.get('alert_threshold', 10))

                conn.execute('''
                    INSERT INTO purchase_history (item_name, quantity, purchase_date, invoice_no, cost, recorded_by, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (item_name, quantity, purchase_date, invoice_no, cost, current_user, current_time))

                existing_item = conn.execute('SELECT total_quantity FROM assets_stock WHERE item_name = ?', (item_name,)).fetchone()
                if existing_item:
                    new_qty = existing_item['total_quantity'] + quantity
                    conn.execute('UPDATE assets_stock SET total_quantity = ?, low_stock_threshold = ? WHERE item_name = ?', (new_qty, alert_threshold, item_name))
                else:
                    conn.execute('INSERT INTO assets_stock (item_name, total_quantity, unit, low_stock_threshold) VALUES (?, ?, ?, ?)', (item_name, quantity, unit, alert_threshold))
                
                conn.commit()
                flash(f'Successfully added {quantity} {unit} of {item_name} to stock. Alert set at {alert_threshold}.')

            elif action == 'allocate_asset':
                item_name = request.form['item_name']
                quantity = int(request.form['quantity'])
                allocated_to = request.form['allocated_to']
                allocated_by = request.form['allocated_by']
                asset_type = request.form['asset_type']
                purpose = request.form['purpose']

                stock_item = conn.execute('SELECT total_quantity, unit FROM assets_stock WHERE item_name = ?', (item_name,)).fetchone()
                
                if not stock_item:
                    flash(f'Error: Asset "{item_name}" not found.')
                elif stock_item['total_quantity'] < quantity:
                    flash(f"Error: Insufficient stock! Only {stock_item['total_quantity']} {stock_item['unit']} available.")
                else:
                    new_qty = stock_item['total_quantity'] - quantity
                    conn.execute('UPDATE assets_stock SET total_quantity = ? WHERE item_name = ?', (new_qty, item_name))

                    status = 'Consumed' if asset_type == 'Consumable' else 'Issued'
                    
                    conn.execute('''
                        INSERT INTO asset_allocations (item_name, quantity, allocated_to, allocated_by, asset_type, status, purpose, timestamp)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (item_name, quantity, allocated_to, allocated_by, asset_type, status, purpose, current_time))
                    
                    conn.commit()
                    flash(f'Successfully allocated {quantity} {stock_item["unit"]} of {item_name} to {allocated_to}.')

            elif action == 'return_asset':
                allocation_id = request.form['allocation_id']
                alloc = conn.execute('SELECT * FROM asset_allocations WHERE id = ?', (allocation_id,)).fetchone()
                
                if alloc and alloc['status'] == 'Issued':
                    conn.execute('UPDATE asset_allocations SET status = "Returned" WHERE id = ?', (allocation_id,))
                    
                    stock_item = conn.execute('SELECT total_quantity FROM assets_stock WHERE item_name = ?', (alloc['item_name'],)).fetchone()
                    if stock_item:
                        new_qty = stock_item['total_quantity'] + alloc['quantity']
                        conn.execute('UPDATE assets_stock SET total_quantity = ? WHERE item_name = ?', (new_qty, alloc['item_name']))
                        
                    conn.commit()
                    flash(f"Asset '{alloc['item_name']}' returned successfully and stock updated.")

            elif action == 'allocate_cash':
                amount = float(request.form['amount'])
                allocated_to = request.form['allocated_to']
                allocated_by = request.form['allocated_by']
                purpose = request.form['purpose']
                
                conn.execute('''
                    INSERT INTO cash_disbursements (amount, allocated_to, allocated_by, purpose, timestamp)
                    VALUES (?, ?, ?, ?, ?)
                ''', (amount, allocated_to, allocated_by, purpose, current_time))
                conn.commit()
                flash(f'Successfully issued ₹{amount} cash to {allocated_to}.')

        except Exception as e:
            flash(f'Database Error: {str(e)}')
        finally:
            conn.close()
            
        return redirect(url_for('purchase.purchase'))

    conn = get_db_connection()
    try:
        inventory = conn.execute('SELECT * FROM assets_stock ORDER BY item_name ASC').fetchall()
        purchases = conn.execute('SELECT * FROM purchase_history ORDER BY id DESC LIMIT 50').fetchall()
        allocations = conn.execute('SELECT * FROM asset_allocations ORDER BY id DESC LIMIT 50').fetchall()
        cash_history = conn.execute('SELECT * FROM cash_disbursements ORDER BY id DESC LIMIT 50').fetchall()
        auth_users = conn.execute('SELECT username, role FROM users WHERE role IN ("Admin", "admin", "RM")').fetchall()
    finally:
        conn.close()

    return render_template('purchase.html', inventory=inventory, purchases=purchases, allocations=allocations, cash_history=cash_history, auth_users=auth_users)
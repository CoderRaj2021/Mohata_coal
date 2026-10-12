from flask import Flask, request, session, redirect, flash
import sqlite3
import os

from routes.auth import auth_bp
from routes.client_supply import client_supply_bp
from routes.production import production_bp
from routes.purchase import purchase_bp
from routes.expenses import expenses_bp
from routes.workers import workers_bp
from routes.scrap_log import scrap_log_bp

app = Flask(__name__)
app.secret_key = 'mohata_coal_secret_key'

# ==========================================
# 100% BULLETPROOF SECURITY ACCESS CONTROL
# ==========================================
@app.before_request
def strict_rbac():
    # Allow static files (CSS, JS, Images) for everyone
    if request.endpoint and request.endpoint.startswith('static'):
        return
        
    role = session.get('role', '') or ''
    
    # 1. Skip restrictions if user is Master Admin
    if 'Admin' in role:
        return
        
    path = request.path.lower()

    # 2. Strict Restrictions for STORE MANAGER
    if 'Store Manager' in role:
        # --- WRITE ACCESS (POST/PUT/DELETE) FIREWALL ---
        if request.method == 'POST':
            # Store Manager can ONLY submit forms in Purchase, Login, and Password Change
            allowed_post_paths = ['/purchase', '/login', '/change_password']
            is_allowed = any(path == allowed or path.startswith(allowed + '/') for allowed in allowed_post_paths)
                    
            if not is_allowed:
                flash("Access Denied: Store Manager only has VIEW access here. Cannot add, edit, or delete data.", "error")
                return redirect(request.referrer or '/purchase')
        
        # --- VIEW ACCESS (GET) ---
        # Store Manager can view (GET) all pages in the system as requested
        return

    # 3. Strict Restrictions for RM Users
    if 'RM' in role:
        # --- WRITE ACCESS (POST/PUT/DELETE) FIREWALL ---
        if request.method == 'POST':
            # RM can ONLY submit forms in Client Supply, Login, and Password Change
            allowed_post_paths = ['/client_supply', '/login', '/change_password']
            is_allowed = any(path == allowed or path.startswith(allowed + '/') for allowed in allowed_post_paths)
                    
            if not is_allowed:
                flash("Access Denied: RM users only have VIEW access here. Cannot add, edit, or delete data.", "error")
                return redirect(request.referrer or '/client_supply')
                
        # --- VIEW ACCESS (GET) FIREWALL ---
        if request.method == 'GET':
            # RM can only view these specific pages
            allowed_get_paths = ['/client_supply', '/production', '/purchase', '/workers', '/login', '/logout', '/change_password', '/']
            is_allowed = any(path == allowed or path.startswith(allowed + '/') for allowed in allowed_get_paths)
                    
            if not is_allowed:
                return redirect('/client_supply')
# ==========================================

def upgrade_db():
    conn = sqlite3.connect('factory.db', timeout=20, check_same_thread=False)
    
    # Users Table & Default Super Admin
    conn.execute('''CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
                        role TEXT NOT NULL
                    )''')
                    
    admin = conn.execute('SELECT * FROM users WHERE username = "admin"').fetchone()
    if not admin:
        conn.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ('admin', 'admin123', 'Admin'))

    # Client Supply Updates & New Damaged Qty Column
    columns_to_add = [
        ('passed_qty', 'INTEGER DEFAULT 0'),
        ('rejected_qty', 'INTEGER DEFAULT 0'),
        ('rejected_by', 'TEXT DEFAULT "N/A"'),
        ('action_time', 'TEXT DEFAULT "N/A"'),
        ('client_returned', 'INTEGER DEFAULT 0'),
        ('return_note', 'TEXT'),
        ('damaged_qty', 'INTEGER DEFAULT 0') # To track internal factory scrap separately
    ]
    for col_name, col_type in columns_to_add:
        try:
            conn.execute(f'ALTER TABLE batches ADD COLUMN {col_name} {col_type}')
        except sqlite3.OperationalError:
            pass 

    # Purchase & Asset Management Tables
    conn.execute('''CREATE TABLE IF NOT EXISTS assets_stock (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        item_name TEXT UNIQUE NOT NULL,
                        total_quantity INTEGER DEFAULT 0,
                        unit TEXT DEFAULT 'Pcs'
                    )''')
    
    try:
        conn.execute('ALTER TABLE assets_stock ADD COLUMN low_stock_threshold INTEGER DEFAULT 10')
    except sqlite3.OperationalError:
        pass

    conn.execute('''CREATE TABLE IF NOT EXISTS purchase_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        item_name TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        purchase_date TEXT,
                        invoice_no TEXT,
                        cost REAL DEFAULT 0.0,
                        recorded_by TEXT,
                        timestamp TEXT
                    )''')
    
    conn.execute('''CREATE TABLE IF NOT EXISTS asset_allocations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        item_name TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        allocated_to TEXT NOT NULL,
                        allocated_by TEXT NOT NULL,
                        asset_type TEXT NOT NULL,
                        status TEXT DEFAULT 'Issued',
                        purpose TEXT,
                        timestamp TEXT
                    )''')

    # Cash Disbursements Table
    conn.execute('''CREATE TABLE IF NOT EXISTS cash_disbursements (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        amount REAL NOT NULL,
                        allocated_to TEXT NOT NULL,
                        allocated_by TEXT NOT NULL,
                        purpose TEXT,
                        timestamp TEXT
                    )''')

    # Production Logs Table for Timeline History
    conn.execute('''CREATE TABLE IF NOT EXISTS production_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        batch_number TEXT NOT NULL,
                        stage_name TEXT NOT NULL,
                        action_taken TEXT NOT NULL,
                        remark TEXT,
                        done_by TEXT NOT NULL,
                        timestamp TEXT NOT NULL
                    )''')

    # Workers Management Table
    conn.execute('''CREATE TABLE IF NOT EXISTS workers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        phone TEXT,
                        department TEXT,
                        joining_date TEXT,
                        status TEXT DEFAULT 'Active'
                    )''')

    # Fix for missing columns in existing workers table
    worker_columns_to_add = [
        ('phone', 'TEXT'),
        ('department', 'TEXT'),
        ('joining_date', 'TEXT'),
        ('status', "TEXT DEFAULT 'Active'"),
        ('address', 'TEXT'),
        ('id_proof', 'TEXT'),
        ('cv', 'TEXT')
    ]
    for col_name, col_type in worker_columns_to_add:
        try:
            conn.execute(f'ALTER TABLE workers ADD COLUMN {col_name} {col_type}')
        except sqlite3.OperationalError:
            pass

    # ==========================================
    # MACHINE MANAGEMENT TABLES
    # ==========================================
    conn.execute('''CREATE TABLE IF NOT EXISTS machines (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        machine_name TEXT UNIQUE NOT NULL,
                        allowed_stages TEXT NOT NULL,
                        status TEXT DEFAULT 'Active'
                    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS machine_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        worker_name TEXT NOT NULL,
                        machine_name TEXT NOT NULL,
                        stage_name TEXT NOT NULL,
                        login_time TEXT,
                        logout_time TEXT,
                        status TEXT DEFAULT 'Active'
                    )''')

    # Insert default machines if table is empty
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM machines")
    if cursor.fetchone()[0] == 0:
        initial_machines = [
            ('BFT-1', 'Facing 1/Center Drilling, Facing 2/Drill Tapping'),
            ('BFT-2', 'Facing 1/Center Drilling, Facing 2/Drill Tapping'),
            ('HMT', 'Roughing'),
            ('CNC Rough.', 'Roughing'),
            ('Old Lathe', 'Roughing'),
            ('Pathak', 'Roughing'),
            ('Mazak', 'Finishing'),
            ('Leblond', 'Finishing'),
            ('OM CNC', 'Finishing'),
            ('China CNC', 'Finishing'),
            ('Drill-1', 'Facing 2/Drill Tapping'),
            ('Drill-2', 'Facing 2/Drill Tapping')
        ]
        for m_name, stages in initial_machines:
            try:
                conn.execute('INSERT INTO machines (machine_name, allowed_stages) VALUES (?, ?)', (m_name, stages))
            except sqlite3.IntegrityError:
                pass

    conn.commit()
    conn.close()

upgrade_db()

@app.context_processor
def inject_low_stock():
    conn = sqlite3.connect('factory.db', timeout=20, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        low_stock_count = conn.execute('SELECT COUNT(*) as count FROM assets_stock WHERE total_quantity <= low_stock_threshold').fetchone()['count']
    except:
        low_stock_count = 0
    finally:
        conn.close()
    return dict(low_stock_count=low_stock_count)

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response

# Blueprint Registration
app.register_blueprint(auth_bp)
app.register_blueprint(client_supply_bp)
app.register_blueprint(production_bp)
app.register_blueprint(purchase_bp)
app.register_blueprint(expenses_bp)
app.register_blueprint(workers_bp)
app.register_blueprint(scrap_log_bp)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
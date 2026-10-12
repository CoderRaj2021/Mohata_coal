import sqlite3

def init_db():
    conn = sqlite3.connect('factory.db')
    cursor = conn.cursor()

    # Workers Management Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            shift_start TEXT,
            shift_end TEXT
        )
    ''')

    # Production Workflow & Client Supply Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS batches (
            batch_number TEXT PRIMARY KEY,
            client_name TEXT,
            invoice_no TEXT,
            receive_date TEXT,
            quantity INTEGER,
            passed_qty INTEGER DEFAULT 0,
            rejected_qty INTEGER DEFAULT 0,
            current_stage TEXT DEFAULT 'Receiving',
            status TEXT DEFAULT 'Pending',
            remarks TEXT,
            reject_reason TEXT,
            rejected_by TEXT,
            action_time TEXT,
            client_returned INTEGER DEFAULT 0,
            return_qty INTEGER DEFAULT 0,
            return_vehicle TEXT,
            returned_by TEXT,
            return_time TEXT,
            return_note TEXT
        )
    ''')

    # Expenses & Cash Allocation Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_number TEXT,
            description TEXT,
            amount REAL,
            given_by TEXT,
            received_by TEXT,
            purpose TEXT,
            date_recorded TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # New Users Table for Multi-Role Login System
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    ''')

    # Insert ONLY the default Admin user if it doesn't exist
    cursor.execute("INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'admin123', 'Admin')")
    
    # Production Logs Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS production_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_number TEXT,
            stage_name TEXT,
            action_taken TEXT,
            remark TEXT,
            done_by TEXT,
            timestamp TEXT
        )
    ''')

    conn.commit()
    conn.close()
    print("Database, tables, and default Admin user created successfully!")

if __name__ == '__main__':
    init_db()
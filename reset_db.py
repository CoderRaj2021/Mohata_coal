from utils import get_db_connection

def full_system_reset():
    try:
        conn = get_db_connection()
        
        # Fetch all table names excluding sqlite internal tables
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
        
        for table in tables:
            table_name = table[0]
            
            if table_name == 'users':
                # Keep only the main 'admin' user and delete everyone else
                conn.execute("DELETE FROM users WHERE username != 'admin'")
            else:
                # Clear all data from all other tables dynamically
                conn.execute(f"DELETE FROM {table_name}")
        
        # Reset auto-increment counters for a fresh start
        conn.execute("DELETE FROM sqlite_sequence")
        
        conn.commit()
        print("✅ Full System Successfully Reset!")
        print("All financial, production, expenses, purchases, workers, and machine data have been completely deleted.")
        print("Only the 'admin' (Super Admin) remains in the system for a fresh start.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    full_system_reset()
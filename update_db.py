import sqlite3

def upgrade_database():
    conn = sqlite3.connect('factory.db')
    print("Starting comprehensive database upgrade...")
    
    # 1. Update pipeline stages in existing batches to match the new workflow
    try:
        conn.execute("UPDATE batches SET current_stage = 'Facing 1/Center Drilling' WHERE current_stage = 'Facing 1'")
        conn.execute("UPDATE batches SET current_stage = 'Facing 2/Drill Tapping' WHERE current_stage = 'Facing 2'")
        conn.execute("UPDATE batches SET current_stage = 'Final QC (Internal)' WHERE current_stage = 'Final Centering'")
        conn.execute("UPDATE batches SET current_stage = 'Finish Goods/Inspection (Client)' WHERE current_stage = 'Finish Goods' OR current_stage = 'Finish Store'")
        
        # Remove already delivered batches from the active 'Delivery' pipeline node
        conn.execute("UPDATE batches SET current_stage = 'Delivered' WHERE current_stage = 'Delivery' AND status = 'Delivered'")
        print("Old pipeline stages and delivered batches updated successfully.")
    except Exception as e:
        pass
    
    # 2. Add Return, Production Forwarding and new Damaged Qty columns to batches table
    columns_to_add_batches = [
        ("client_returned", "INTEGER DEFAULT 0"),
        ("return_qty", "INTEGER DEFAULT 0"),
        ("return_vehicle", "TEXT"),
        ("returned_by", "TEXT"),
        ("return_time", "TEXT"),
        ("return_note", "TEXT"),
        ("production_forwarded", "INTEGER DEFAULT 0"), # Flag to track RM QC to Facing 1 handover
        ("damaged_qty", "INTEGER DEFAULT 0") # NEW: To track internal factory scrap separately from RM QC rejects
    ]
    for col_name, col_type in columns_to_add_batches:
        try:
            conn.execute(f'ALTER TABLE batches ADD COLUMN {col_name} {col_type}')
            print(f"Column '{col_name}' added to batches.")
        except sqlite3.OperationalError:
            pass

    # Mark old active batches as forwarded so they don't get stuck in the new RM QC logic
    try:
        conn.execute("UPDATE batches SET production_forwarded = 1 WHERE current_stage NOT IN ('Receiving', 'Processing', 'RM QC', 'RM')")
    except sqlite3.OperationalError:
        pass

    # 3. Create batch_pieces table for piece-level tracking
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS batch_pieces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_number TEXT,
                sl_no INTEGER,
                axle_no TEXT
            )
        ''')
        print("Table 'batch_pieces' verified/created.")
    except Exception as e:
        print(f"Error checking batch_pieces table: {e}")

    # 4. Add Status, Reject Reason, and individual Axle Stage columns to batch_pieces
    columns_to_add_pieces = [
        ("status", "TEXT DEFAULT 'Pending'"),
        ("reject_reason", "TEXT"),
        ("axle_current_stage", "TEXT")
    ]
    for col_name, col_type in columns_to_add_pieces:
        try:
            conn.execute(f'ALTER TABLE batch_pieces ADD COLUMN {col_name} {col_type}')
            print(f"Column '{col_name}' added to batch_pieces.")
        except sqlite3.OperationalError:
            pass

    # 5. Create batch_scraps table for recording piece-level scrap data during production
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS batch_scraps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_number TEXT,
                stage_name TEXT,
                axle_no TEXT,
                reason TEXT,
                done_by TEXT,
                timestamp TEXT
            )
        ''')
        print("Table 'batch_scraps' verified/created.")
    except Exception as e:
        print(f"Error checking batch_scraps table: {e}")

    conn.commit()
    conn.close()
    print("Database upgrade completed successfully! All piece-level tracking, routing, delivery, and internal damage tracking features are ready.")

if __name__ == '__main__':
    upgrade_database()
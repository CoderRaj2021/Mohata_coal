import sqlite3

def get_db_connection():
    conn = sqlite3.connect('factory.db', timeout=20, check_same_thread=False)
    conn.row_factory = sqlite3.Row  
    return conn
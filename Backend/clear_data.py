"""Script to clear all clubs and event proposal data from all database files while preserving all user roles.
"""
import os
import sqlite3

db_paths = [
    os.path.abspath("sscms.db"),
    os.path.abspath(os.path.join("Backend", "sscms.db"))
]

for db_path in db_paths:
    if not os.path.exists(db_path):
        continue
    print(f"\n==========================================")
    print(f"Processing Database: {db_path}")
    print(f"==========================================")
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Check existing tables
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cur.fetchall()]
    print("Found tables:", tables)

    if "clubs" not in tables:
        print("No 'clubs' table in this DB file. Skipping.")
        conn.close()
        continue

    # Count before
    cur.execute("SELECT COUNT(*) FROM clubs;")
    club_count = cur.fetchone()[0]
    print(f"Clubs before: {club_count}")

    if "event_proposals" in tables:
        cur.execute("SELECT COUNT(*) FROM event_proposals;")
        print(f"EventProposals before: {cur.fetchone()[0]}")

    if "user_roles" in tables:
        cur.execute("SELECT COUNT(*) FROM user_roles;")
        print(f"UserRoles before: {cur.fetchone()[0]}")

    # 1. Clear club_id reference in user_roles (do NOT delete user_roles)
    if "user_roles" in tables:
        cur.execute("UPDATE user_roles SET club_id = NULL;")
        print("Updated user_roles: set club_id = NULL for all roles.")

    # 2. Clear dependent proposal/event tables
    for tbl in ["inventory_usage", "venue_booking", "events", "event_proposals", "volunteer_applications", "club_members", "domains"]:
        if tbl in tables:
            cur.execute(f"DELETE FROM {tbl};")
            print(f"Cleared table: {tbl}")

    # 3. Clear clubs table
    cur.execute("DELETE FROM clubs;")
    print("Cleared table: clubs")

    conn.commit()

    # Count after
    cur.execute("SELECT COUNT(*) FROM clubs;")
    print(f"Clubs after: {cur.fetchone()[0]}")
    if "event_proposals" in tables:
        cur.execute("SELECT COUNT(*) FROM event_proposals;")
        print(f"EventProposals after: {cur.fetchone()[0]}")
    if "user_roles" in tables:
        cur.execute("SELECT COUNT(*) FROM user_roles;")
        print(f"UserRoles after: {cur.fetchone()[0]}")

    conn.close()
    print("Successfully processed", db_path)

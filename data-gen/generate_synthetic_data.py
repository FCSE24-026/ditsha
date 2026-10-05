#!/usr/bin/env python3
import psycopg2
from faker import Faker
import random
import csv
import os
from datetime import datetime, timedelta
import uuid

faker = Faker('en_ZA')

DB_DSN = os.getenv("DB_DSN", "dbname=ditsha user=postgres password=postgres host=localhost port=5432")
EXPORT_PATH = os.getenv("EXPORT_PATH", "synthetic_applications.csv")

def connect():
    return psycopg2.connect(DB_DSN)

def create_land_boards(conn, n=10):
    boards = []
    with conn.cursor() as cur:
        for _ in range(n):
            lb_id = str(uuid.uuid4())
            cur.execute("INSERT INTO land_board (land_board_id,name,district,region) VALUES (%s,%s,%s,%s)",
                        (lb_id, faker.company(), faker.city(), faker.state()))
            boards.append(lb_id)
    conn.commit()
    return boards

def create_officers(conn, land_boards, n=30):
    officers = []
    with conn.cursor() as cur:
        for _ in range(n):
            o_id = str(uuid.uuid4())
            lb_id = random.choice(land_boards)
            cur.execute("INSERT INTO officer (officer_id,land_board_id,full_name,email,role,password_hash) VALUES (%s,%s,%s,%s,%s,%s)",
                        (o_id, lb_id, faker.name(), faker.email(), random.choice(['clerk','inspector','manager']), 'hashed'))
            officers.append(o_id)
    conn.commit()
    return officers

def create_citizens(conn, n=500):
    citizens = []
    with conn.cursor() as cur:
        for _ in range(n):
            c_id = str(uuid.uuid4())
            cur.execute("INSERT INTO citizen (citizen_id,national_id,full_name,phone,email,district,password_hash) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                        (c_id, faker.bothify(text='BW#########'), faker.name(), faker.phone_number()[:20], faker.email(), faker.city(), 'hashed'))
            citizens.append(c_id)
    conn.commit()
    return citizens

def create_applications(conn, citizens, land_boards, officers, n=1000):
    apps = []
    with conn.cursor() as cur:
        for i in range(n):
            a_id = str(uuid.uuid4())
            citizen_id = random.choice(citizens)
            land_board_id = random.choice(land_boards)
            application_type = random.choice(['residential_allocation','land_transfer','lease_renewal','change_of_use'])
            reference_number = f"APP-{datetime.utcnow().year}-{i:05d}"
            submitted_at = faker.date_time_between(start_date='-6m', end_date='now')
            status = random.choice(['submitted','under_review','approved','rejected'])
            stage = random.choice(['initial_review','documentation_review','field_inspection','final_decision'])
            processing_days = random.choice([14, 21, 35, 75]) if status == 'approved' else None
            document_complete = random.random() > 0.25
            assigned_officer = random.choice(officers) if random.random() < 0.8 else None
            description = f"Synthetic {application_type.replace('_', ' ')} application"
            cur.execute("INSERT INTO application (application_id,citizen_id,land_board_id,application_type,description,reference_number,submitted_at,current_status,current_stage,processing_days,document_complete,assigned_officer_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (a_id,citizen_id,land_board_id,application_type,description,reference_number,submitted_at,status,stage,processing_days,document_complete,assigned_officer))
            apps.append({"application_id": a_id, "reference_number": reference_number, "application_type": application_type,
                         "submitted_at": submitted_at.isoformat(), "status": status, "stage": stage,
                         "processing_days": processing_days, "document_complete": document_complete})
    conn.commit()
    with open(EXPORT_PATH, "w", newline="", encoding="utf-8") as export_file:
        writer = csv.DictWriter(export_file, fieldnames=apps[0].keys())
        writer.writeheader()
        writer.writerows(apps)
    return apps

if __name__ == '__main__':
    print('Connecting to DB...')
    conn = connect()
    try:
        lbs = create_land_boards(conn, n=10)
        officers = create_officers(conn, lbs, n=30)
        citizens = create_citizens(conn, n=500)
        apps = create_applications(conn, citizens, lbs, officers, n=1000)
        print('Generated:', len(lbs), len(officers), len(citizens), len(apps))
    finally:
        conn.close()

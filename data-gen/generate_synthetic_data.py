#!/usr/bin/env python3
"""Generate Botswana-specific synthetic data for local Ditsha demonstrations."""

import csv
import os
import random
import uuid
from datetime import datetime, timedelta

import psycopg2

DB_DSN = os.getenv("DB_DSN", "dbname=ditsha user=postgres password=postgres host=localhost port=5432")
EXPORT_PATH = os.getenv("EXPORT_PATH", "synthetic_applications.csv")

LAND_BOARDS = [
    ("Ngwato Land Board", "Central District", "Serowe"),
    ("Kgatleng Land Board", "Kgatleng District", "Mochudi"),
    ("Kweneng Land Board", "Kweneng District", "Molepolole"),
    ("Ngwaketse Land Board", "Southern District", "Kanye"),
    ("Tlokweng Land Board", "South East District", "Tlokweng"),
    ("Tawana Land Board", "North West District", "Maun"),
    ("Tati Land Board", "North East District", "Masunga"),
    ("Ghanzi Land Board", "Ghanzi District", "Ghanzi"),
    ("Chobe Land Board", "Chobe District", "Kasane"),
    ("Kgalagadi Land Board", "Kgalagadi District", "Tsabong"),
    ("Rolong Land Board", "Lobatse Town", "Lobatse"),
    ("Malete Land Board", "Goodhope Sub-District", "Ramotswa"),
]

FIRST_NAMES = ["Boitumelo", "Dineo", "Kagiso", "Kabelo", "Kefilwe", "Kealeboga", "Lesego", "Lorato", "Masego", "Mpho", "Neo", "Olebogeng", "Onalenna", "Phenyo", "Tshepo", "Tumelo", "Tlotlo", "Thato"]
LAST_NAMES = ["Molefe", "Mogomotsi", "Motsamai", "Mothibi", "Moagi", "Mokgosi", "Mosepele", "Motswetla", "Molebatsi", "Rantao", "Tshwene", "Sebego", "Segokgo", "Setlhare", "Tshosa", "Kgosi", "Gasebalwe"]
APPLICATION_TYPES = ["residential_allocation", "land_transfer", "lease_renewal", "change_of_use"]
STATUSES = ["submitted", "under_review", "approved", "rejected"]
STAGES = ["initial_review", "documentation_review", "field_inspection", "final_decision"]


def name_at(index):
    return f"{FIRST_NAMES[index % len(FIRST_NAMES)]} {LAST_NAMES[(index // len(FIRST_NAMES)) % len(LAST_NAMES)]}"


def main():
    random.seed(42)
    conn = psycopg2.connect(DB_DSN)
    try:
        with conn.cursor() as cur:
            boards = []
            for name, district, region in LAND_BOARDS:
                board_id = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO land_board (land_board_id,name,district,region) VALUES (%s,%s,%s,%s)",
                    (board_id, name, district, region),
                )
                boards.append(board_id)

            citizens = []
            for index in range(500):
                citizen_id = str(uuid.uuid4())
                name = name_at(index)
                cur.execute(
                    "INSERT INTO citizen (citizen_id,national_id,full_name,phone,email,district,password_hash) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                    (citizen_id, f"BW{index + 100000000:09d}", name, f"+267 7{index:07d}", f"{name.lower().replace(' ', '.')}.{index}@example.co.bw", LAND_BOARDS[index % len(LAND_BOARDS)][1], "generated-data-no-login"),
                )
                citizens.append(citizen_id)

            applications = []
            for index in range(1000):
                application_id = str(uuid.uuid4())
                application_type = APPLICATION_TYPES[index % len(APPLICATION_TYPES)]
                status = STATUSES[index % len(STATUSES)]
                submitted_at = datetime.utcnow() - timedelta(days=(index % 180) + 1)
                record = {
                    "application_id": application_id,
                    "reference_number": f"APP-GEN-{index + 1:05d}",
                    "application_type": application_type,
                    "submitted_at": submitted_at.isoformat(),
                    "status": status,
                    "stage": STAGES[index % len(STAGES)],
                    "document_complete": index % 4 != 0,
                }
                cur.execute(
                    """INSERT INTO application
                    (application_id,citizen_id,land_board_id,application_type,description,reference_number,
                     submitted_at,current_status,current_stage,document_complete)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (application_id, citizens[index % len(citizens)], boards[index % len(boards)], application_type,
                     f"Botswana {application_type.replace('_', ' ')} application", record["reference_number"],
                     submitted_at, status, record["stage"], record["document_complete"]),
                )
                applications.append(record)

        conn.commit()
        with open(EXPORT_PATH, "w", newline="", encoding="utf-8") as export_file:
            writer = csv.DictWriter(export_file, fieldnames=applications[0].keys())
            writer.writeheader()
            writer.writerows(applications)
        print(f"Generated {len(boards)} land boards, {len(citizens)} citizens, and {len(applications)} applications.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

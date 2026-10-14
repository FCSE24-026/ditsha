Synthetic data generator

- Set `DB_DSN` if your PostgreSQL connection differs from local development.
- Install dependencies: `pip install psycopg2-binary`
- Run: `python generate_synthetic_data.py`

The generator uses Botswana land boards, Tswana names, Botswana phone numbers, and `.co.bw`-style email addresses. It inserts an additional demonstration batch and exports `synthetic_applications.csv`; use the Node reset seed when you need a clean complete dataset.

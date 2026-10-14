'use strict';

const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const db = require('./db');

const LAND_BOARDS = [
  ['Ngwato Land Board', 'Central District', 'Serowe'],
  ['Kgatleng Land Board', 'Kgatleng District', 'Mochudi'],
  ['Kweneng Land Board', 'Kweneng District', 'Molepolole'],
  ['Ngwaketse Land Board', 'Southern District', 'Kanye'],
  ['Tlokweng Land Board', 'South East District', 'Tlokweng'],
  ['Tawana Land Board', 'North West District', 'Maun'],
  ['Tati Land Board', 'North East District', 'Masunga'],
  ['Ghanzi Land Board', 'Ghanzi District', 'Ghanzi'],
  ['Chobe Land Board', 'Chobe District', 'Kasane'],
  ['Kgalagadi Land Board', 'Kgalagadi District', 'Tsabong'],
  ['Rolong Land Board', 'Lobatse Town', 'Lobatse'],
  ['Malete Land Board', 'Goodhope Sub-District', 'Ramotswa'],
];

const FIRST_NAMES = [
  'Boitumelo', 'Dineo', 'Kagiso', 'Kabelo', 'Kefilwe', 'Kealeboga',
  'Lesego', 'Lorato', 'Masego', 'Mpho', 'Neo', 'Olebogeng',
  'Onalenna', 'Phenyo', 'Tshepo', 'Tumelo', 'Tlotlo', 'Thato',
];

const LAST_NAMES = [
  'Molefe', 'Mogomotsi', 'Motsamai', 'Motswana', 'Mothibi', 'Moagi',
  'Mokgosi', 'Mosepele', 'Motswetla', 'Molebatsi', 'Rantao', 'Tshwene',
  'Sebego', 'Segokgo', 'Setlhare', 'Tshosa', 'Kgosi', 'Gasebalwe',
];

const APPLICATION_TYPES = ['residential_allocation', 'land_transfer', 'lease_renewal', 'change_of_use'];
const STATUSES = ['submitted', 'under_review', 'approved', 'rejected'];
const STAGES = ['initial_review', 'documentation_review', 'field_inspection', 'final_decision'];
const OFFICER_ROLES = ['clerk', 'inspector', 'manager'];

function nameAt(index) {
  return `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]}`;
}

function emailFor(name, index, domain) {
  return `${name.toLowerCase().replaceAll(' ', '.')}.${index}@${domain}`;
}

async function insertMany() {
  const shouldReset = process.argv.includes('--reset');
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    if (shouldReset) {
      await client.query('TRUNCATE application_event, application, officer, citizen, land_board CASCADE');
    }

    const boardIds = [];
    for (const [name, district, region] of LAND_BOARDS) {
      const id = randomUUID();
      boardIds.push(id);
      await client.query(
        'INSERT INTO land_board (land_board_id,name,district,region) VALUES ($1,$2,$3,$4)',
        [id, name, district, region],
      );
    }

    const officerPasswordHash = await bcrypt.hash('OfficerPass123!', 10);
    const citizenPasswordHash = await bcrypt.hash('CitizenPass123!', 10);
    const testOfficerId = randomUUID();
    const testCitizenId = randomUUID();

    await client.query(
      'INSERT INTO officer (officer_id,land_board_id,full_name,email,role,password_hash) VALUES ($1,$2,$3,$4,$5,$6)',
      [testOfficerId, boardIds[0], 'Kagiso Molefe', 'officer@example.com', 'manager', officerPasswordHash],
    );
    await client.query(
      'INSERT INTO citizen (citizen_id,national_id,full_name,phone,email,district,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [testCitizenId, 'BWTEST00001', 'Masego Molefe', '+267 71 000 001', 'citizen@example.com', 'Serowe', citizenPasswordHash],
    );

    const officerIds = [testOfficerId];
    for (let i = 0; i < 300; i += 1) {
      const id = randomUUID();
      officerIds.push(id);
      const name = nameAt(i + 1);
      await client.query(
        'INSERT INTO officer (officer_id,land_board_id,full_name,email,role,password_hash) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, boardIds[(i + 1) % boardIds.length], name, emailFor(name, i + 1, 'ditsha.gov.bw'), OFFICER_ROLES[i % OFFICER_ROLES.length], officerPasswordHash],
      );
    }

    const citizenIds = [testCitizenId];
    for (let i = 0; i < 4417; i += 1) {
      const id = randomUUID();
      citizenIds.push(id);
      const name = nameAt(i + 19);
      await client.query(
        'INSERT INTO citizen (citizen_id,national_id,full_name,phone,email,district,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, `BW${String(i + 2).padStart(9, '0')}`, name, `+267 7${String((i + 2) % 10000000).padStart(7, '0')}`, emailFor(name, i + 2, 'example.co.bw'), LAND_BOARDS[i % LAND_BOARDS.length][1], citizenPasswordHash],
      );
    }

    const now = Date.now();
    for (let i = 0; i < 7000; i += 1) {
      const applicationId = randomUUID();
      const status = STATUSES[i % STATUSES.length];
      const stage = STAGES[i % STAGES.length];
      const submittedAt = new Date(now - ((i % 180) + 1) * 24 * 60 * 60 * 1000);
      const assignedOfficerId = i < 50 ? testOfficerId : officerIds[i % officerIds.length];
      await client.query(
        `INSERT INTO application
          (application_id,citizen_id,land_board_id,application_type,description,reference_number,
           submitted_at,current_status,current_stage,processing_days,document_complete,assigned_officer_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          applicationId,
          citizenIds[i % citizenIds.length],
          boardIds[i % boardIds.length],
          APPLICATION_TYPES[i % APPLICATION_TYPES.length],
          `Botswana ${APPLICATION_TYPES[i % APPLICATION_TYPES.length].replaceAll('_', ' ')} application`,
          `APP-${new Date().getUTCFullYear()}-${String(i + 1).padStart(5, '0')}`,
          submittedAt,
          status,
          stage,
          status === 'approved' ? [14, 21, 35, 75][i % 4] : null,
          i % 4 !== 0,
          assignedOfficerId,
        ],
      );
      await client.query(
        `INSERT INTO application_event
          (event_id, application_id, officer_id, event_type, from_status, to_status, stage, notes, event_timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(),
          applicationId,
          assignedOfficerId,
          'seeded_submission',
          null,
          status,
          stage,
          'Initial Botswana demonstration record',
          submittedAt,
        ],
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${LAND_BOARDS.length} Botswana land boards, 301 officers, 4418 citizens, and 7000 applications.`);
    console.log('Test accounts: officer@example.com / OfficerPass123! and citizen@example.com / CitizenPass123!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed error:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

insertMany();

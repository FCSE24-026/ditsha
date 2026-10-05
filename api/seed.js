'use strict';
const faker = require('faker');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

async function insertMany() {
  try {
    // create a deterministic land board, officer, and citizen for testing
    const testLandBoardId = uuidv4();
    await db.query('INSERT INTO land_board (land_board_id,name,district,region) VALUES ($1,$2,$3,$4)', [testLandBoardId, 'Test LandBoard', 'Gaborone', 'South']);
    const testOfficerId = uuidv4();
    const testOfficerPassword = 'OfficerPass123!';
    const testOfficerHash = await bcrypt.hash(testOfficerPassword, 10);
    const testOfficerEmail = 'officer@example.com';
    const existingOfficer = await db.query('SELECT officer_id FROM officer WHERE email = $1', [testOfficerEmail]);
    if (existingOfficer.rowCount === 0) {
      await db.query('INSERT INTO officer (officer_id,land_board_id,full_name,email,role,password_hash) VALUES ($1,$2,$3,$4,$5,$6)', [testOfficerId, testLandBoardId, 'Test Officer', testOfficerEmail, 'manager', testOfficerHash]);
    }
    const seededOfficerId = existingOfficer.rowCount > 0 ? existingOfficer.rows[0].officer_id : testOfficerId;

    const testCitizenId = uuidv4();
    const testCitizenPassword = 'CitizenPass123!';
    const testCitizenHash = await bcrypt.hash(testCitizenPassword, 10);
    const testCitizenEmail = 'citizen@example.com';
    const existingCitizen = await db.query('SELECT citizen_id FROM citizen WHERE email = $1', [testCitizenEmail]);
    if (existingCitizen.rowCount === 0) {
      await db.query('INSERT INTO citizen (citizen_id,national_id,full_name,phone,email,district,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)', [testCitizenId, 'BWTEST00001', 'Test Citizen', '+26770000000', testCitizenEmail, 'Gaborone', testCitizenHash]);
    }

    console.log('Test accounts: officer ->', testOfficerEmail, '/', testOfficerPassword, '  citizen ->', testCitizenEmail, '/', testCitizenPassword);

    // land boards
    const landBoards = [];
    for (let i = 0; i < 10; i++) {
      const id = uuidv4();
      landBoards.push(id);
      await db.query('INSERT INTO land_board (land_board_id,name,district,region) VALUES ($1,$2,$3,$4)', [id, faker.company.companyName(), faker.address.city(), faker.address.state()]);
    }

    // officers
    const officers = [];
    for (let i = 0; i < 30; i++) {
      const id = uuidv4();
      officers.push(id);
      const password = 'OfficerPass123!';
      const password_hash = await bcrypt.hash(password, 10);
      await db.query('INSERT INTO officer (officer_id,land_board_id,full_name,email,role,password_hash) VALUES ($1,$2,$3,$4,$5,$6)', [id, landBoards[Math.floor(Math.random()*landBoards.length)], faker.name.findName(), faker.internet.email(), ['clerk','inspector','manager'][Math.floor(Math.random()*3)], password_hash]);
    }

    // citizens
    const citizens = [];
    for (let i = 0; i < 500; i++) {
      const id = uuidv4();
      citizens.push(id);
      const password = 'CitizenPass123!';
      const password_hash = await bcrypt.hash(password, 10);
      await db.query('INSERT INTO citizen (citizen_id,national_id,full_name,phone,email,district,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, faker.random.alphaNumeric(9).toUpperCase(), faker.name.findName(), faker.phone.phoneNumber().slice(0, 20), faker.internet.email(), faker.address.city(), password_hash]);
    }

    // applications
    const existingApplications = await db.query('SELECT count(*) FROM application');
    const referenceOffset = Number(existingApplications.rows[0].count);
    for (let i = 0; i < 1000; i++) {
      const id = uuidv4();
      const citizen = citizens[Math.floor(Math.random()*citizens.length)];
      const landBoard = landBoards[Math.floor(Math.random()*landBoards.length)];
      const appType = ['residential_allocation','land_transfer','lease_renewal','change_of_use'][Math.floor(Math.random()*4)];
      const ref = `APP-${new Date().getFullYear()}-${String(i + referenceOffset).padStart(5,'0')}`;
      const submittedAt = faker.date.between(new Date(Date.now()-1000*60*60*24*180), new Date());
      const status = ['submitted','under_review','approved','rejected'][Math.floor(Math.random()*4)];
      const stage = ['initial_review','documentation_review','field_inspection','final_decision'][Math.floor(Math.random()*4)];
      const processingDays = status === 'approved' ? faker.random.arrayElement([14, 21, 35, 75]) : null;
      const documentComplete = Math.random() > 0.25;
      const assignedOfficer = i < 50 ? seededOfficerId : (Math.random() < 0.8 ? officers[Math.floor(Math.random()*officers.length)] : null);
      await db.query('INSERT INTO application (application_id,citizen_id,land_board_id,application_type,description,reference_number,submitted_at,current_status,current_stage,processing_days,document_complete,assigned_officer_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [id,citizen,landBoard,appType,`Synthetic ${appType.replaceAll('_', ' ')} application`,ref,submittedAt,status,stage,processingDays,documentComplete,assignedOfficer]);
    }

    console.log('Seeding completed');
    process.exit(0);
  } catch (err) {
    console.error('Seed error', err);
    process.exit(1);
  }
}

insertMany();

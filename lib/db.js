const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Vercel serverless only allows writes to /tmp
const DB_FILE = process.env.VERCEL
  ? path.join('/tmp', 'namezivo-data.json')
  : path.join(__dirname, '..', 'data.json');

function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultDb = { users: {}, usage: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
    return defaultDb;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return { users: {}, usage: {} };
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(email) {
  const db = initDb();
  return db.users[email] || null;
}

function getUserByApiKey(apiKey) {
  const db = initDb();
  return Object.values(db.users).find((u) => u.apiKey === apiKey) || null;
}

function createUser(email, passwordHash) {
  const db = initDb();
  if (db.users[email]) throw new Error('User already exists');

  const apiKey = `sk_${crypto.randomBytes(24).toString('hex')}`;
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    plan: 'Free',
    apiKey,
    createdAt: Date.now(),
  };

  db.users[email] = user;
  saveDb(db);
  return user;
}

function updateUserPlan(email, plan) {
  const db = initDb();
  if (db.users[email]) {
    db.users[email].plan = plan;
    saveDb(db);
  }
}

function generateNewApiKey(email) {
  const db = initDb();
  if (!db.users[email]) throw new Error('User not found');
  const newKey = `sk_${crypto.randomBytes(24).toString('hex')}`;
  db.users[email].apiKey = newKey;
  saveDb(db);
  return newKey;
}

function getUsage(apiKey, date) {
  const db = initDb();
  return db.usage[apiKey]?.[date]?.count || 0;
}

function incrementUsage(apiKey, date, amount = 1) {
  const db = initDb();
  if (!db.usage[apiKey]) db.usage[apiKey] = {};
  if (!db.usage[apiKey][date]) db.usage[apiKey][date] = { date, count: 0 };
  db.usage[apiKey][date].count += amount;
  saveDb(db);
}

function getPlanLimits(plan) {
  switch (plan) {
    case 'Free': return 50;
    case 'Pro': return 1000;
    case 'Business': return 10000;
    case 'Enterprise': return Infinity;
    default: return 50;
  }
}

module.exports = {
  getUser,
  getUserByApiKey,
  createUser,
  updateUserPlan,
  generateNewApiKey,
  getUsage,
  incrementUsage,
  getPlanLimits,
};

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'neofit-desktop-secret-key-2026';

// Determine database path: in production (packaged), store in user data dir
// In development, store in the project root
let dbPath;
try {
  const { app } = require('electron');
  if (app && app.isPackaged) {
    dbPath = path.join(app.getPath('userData'), 'neofit.db');
  } else {
    dbPath = path.join(__dirname, '..', 'neofit.db');
  }
} catch {
  // Not running inside Electron (dev mode or separate server run) - use project root
  dbPath = path.join(__dirname, '..', 'neofit.db');
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ─── Helper: Calculate member status ────────────────────────
function calculateStatus(member) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const joinedDate = member.joined_date ? new Date(member.joined_date) : null;
  const expiryDate = member.expiry_date ? new Date(member.expiry_date) : null;
  
  if (joinedDate) joinedDate.setHours(0, 0, 0, 0);
  if (expiryDate) expiryDate.setHours(0, 0, 0, 0);
  
  // If joined date is in the future
  if (joinedDate && joinedDate > today) return 'Pending';
  
  // If expired
  if (expiryDate && expiryDate < today) return 'Expired';
  
  // If expiring within 7 days
  if (expiryDate) {
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7 && daysLeft >= 0) return 'Expiring Soon';
  }
  
  return 'Active';
}

// ─── Database Setup ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    joined_date DATE,
    expiry_date DATE,
    address TEXT DEFAULT '',
    membership_expiry DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS check_in_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    gym_name TEXT NOT NULL DEFAULT 'NeoFit Fitness Gym',
    contact TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    announcement TEXT NOT NULL DEFAULT ''
  );
`);

// Migrate old checkins table to check_in_logs if it exists
try {
  const oldTableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checkins'").get();
  if (oldTableCheck) {
    console.log('Migrating old checkins table to check_in_logs...');
    db.exec(`
      INSERT INTO check_in_logs (id, member_id, member_name, plan, status, checked_in_at)
      SELECT id, member_id, member_name, plan, status, checked_in_at FROM checkins;
      DROP TABLE checkins;
    `);
    console.log('Migration completed successfully.');
  }
} catch (err) {
  console.error('Migration notice (can be ignored if fresh database):', err.message);
}

// Seed default admin user if none exists
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('admin@neofit.com', hashedPassword, 'admin');
  console.log('Default admin created: admin@neofit.com / admin123');
}

// Seed default settings if none exist
const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
if (settingsCount.count === 0) {
  db.prepare('INSERT INTO settings (id, gym_name, contact, address, announcement) VALUES (1, ?, ?, ?, ?)').run('NeoFit Fitness Gym', '', '', '');
}

// Seed demo members (one for each of the 24 plans) if the table has fewer than 24 members
// OR if the check_in_logs table is empty (to force seeding of historical check-ins)
const membersCount = db.prepare('SELECT COUNT(*) as count FROM members').get();
const checkInCount = db.prepare('SELECT COUNT(*) as count FROM check_in_logs').get();
if (membersCount.count < 24 || checkInCount.count === 0) {
  console.log('Seeding 24 demo members and historical check-in logs...');
  
  // Clear tables to start fresh and avoid unique constraint conflicts
  db.exec('DELETE FROM check_in_logs');
  db.exec('DELETE FROM members');
  
  const demoPlans = [
    { name: 'John Doe', plan: 'Regular Member - Monthly (No Treadmill)', contact: '09171234501', address: '123 Main St, Quezon City' },
    { name: 'Jane Smith', plan: 'Regular Member - Monthly (With Treadmill)', contact: '09171234502', address: '456 Oak Rd, Makati City' },
    { name: 'Michael Johnson', plan: 'Regular Member - Semi-Monthly (No Treadmill)', contact: '09171234503', address: '789 Pine Ave, Pasig City' },
    { name: 'Emily Davis', plan: 'Regular Member - Semi-Monthly (With Treadmill)', contact: '09171234504', address: '101 Maple Blvd, Mandaluyong City' },
    { name: 'David Brown', plan: 'Regular Member - Daily (No Treadmill)', contact: '09171234505', address: '202 Birch Ct, Taguig City' },
    { name: 'Sarah Miller', plan: 'Regular Member - Daily (With Treadmill)', contact: '09171234506', address: '303 Cedar Dr, Parañaque City' },
    { name: 'James Wilson', plan: 'Student/Senior Member - Monthly (No Treadmill)', contact: '09171234507', address: '404 Redwood Ln, Las Piñas City' },
    { name: 'Patricia Moore', plan: 'Student/Senior Member - Monthly (With Treadmill)', contact: '09171234508', address: '505 Willow Way, Muntinlupa City' },
    { name: 'Robert Taylor', plan: 'Student/Senior Member - Semi-Monthly (No Treadmill)', contact: '09171234509', address: '606 Cypress St, Valenzuela City' },
    { name: 'Linda Anderson', plan: 'Student/Senior Member - Semi-Monthly (With Treadmill)', contact: '09171234510', address: '707 Alder Ave, Caloocan City' },
    { name: 'William Thomas', plan: 'Student/Senior Member - Daily (No Treadmill)', contact: '09171234511', address: '808 Spruce St, Malabon City' },
    { name: 'Elizabeth Jackson', plan: 'Student/Senior Member - Daily (With Treadmill)', contact: '09171234512', address: '909 Fir Rd, Navotas City' },
    { name: 'Richard White', plan: 'Regular Non-Member - Monthly (No Treadmill)', contact: '09171234513', address: '111 Ash St, Marikina City' },
    { name: 'Barbara Harris', plan: 'Regular Non-Member - Monthly (With Treadmill)', contact: '09171234514', address: '222 Beech Blvd, San Juan City' },
    { name: 'Joseph Martin', plan: 'Regular Non-Member - Semi-Monthly (No Treadmill)', contact: '09171234515', address: '333 Elm Rd, Pasay City' },
    { name: 'Susan Thompson', plan: 'Regular Non-Member - Semi-Monthly (With Treadmill)', contact: '09171234516', address: '444 Larch Ct, Manila' },
    { name: 'Thomas Garcia', plan: 'Regular Non-Member - Daily (No Treadmill)', contact: '09171234517', address: '555 Linden Dr, Quezon City' },
    { name: 'Jessica Martinez', plan: 'Regular Non-Member - Daily (With Treadmill)', contact: '09171234518', address: '666 Poplar St, Makati City' },
    { name: 'Charles Robinson', plan: 'Student/Senior Non-Member - Monthly (No Treadmill)', contact: '09171234519', address: '777 Sycamore Ave, Pasig City' },
    { name: 'Karen Clark', plan: 'Student/Senior Non-Member - Monthly (With Treadmill)', contact: '09171234520', address: '888 Walnut St, Mandaluyong City' },
    { name: 'Christopher Rodriguez', plan: 'Student/Senior Non-Member - Semi-Monthly (No Treadmill)', contact: '09171234521', address: '999 Chestnut Dr, Taguig City' },
    { name: 'Nancy Lewis', plan: 'Student/Senior Non-Member - Semi-Monthly (With Treadmill)', contact: '09171234522', address: '124 Magnolia St, Parañaque City' },
    { name: 'Daniel Lee', plan: 'Student/Senior Non-Member - Daily (No Treadmill)', contact: '09171234523', address: '135 Palm Rd, Las Piñas City' },
    { name: 'Lisa Walker', plan: 'Student/Senior Non-Member - Daily (With Treadmill)', contact: '09171234524', address: '146 Olive Ct, Muntinlupa City' }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO members (member_id, name, contact, plan, status, joined_date, expiry_date, address, membership_expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const checkInStmt = db.prepare(`
    INSERT INTO check_in_logs (member_id, member_name, plan, status, checked_in_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  demoPlans.forEach((m, index) => {
    const member_id = `M-${String(index + 1).padStart(3, '0')}`;
    
    // Stagger join dates to generate interesting histories
    let joinedDaysAgo = 0;
    if (m.plan.includes('Daily')) {
      joinedDaysAgo = index % 3; // Daily members joined 0 to 2 days ago
    } else if (m.plan.includes('Semi-Monthly')) {
      joinedDaysAgo = (index % 13) + 2; // Semi-monthly members joined 2 to 14 days ago
    } else {
      joinedDaysAgo = (index % 24) + 5; // Monthly members joined 5 to 28 days ago
    }

    const joinedDate = new Date();
    joinedDate.setDate(joinedDate.getDate() - joinedDaysAgo);
    const joined_date_str = joinedDate.toISOString().split('T')[0];

    // Calculate expiry dates
    const expDate = new Date(joinedDate);
    if (m.plan.includes('Daily')) {
      expDate.setDate(expDate.getDate() + 1);
    } else if (m.plan.includes('Semi-Monthly')) {
      expDate.setDate(expDate.getDate() + 15);
    } else if (m.plan.includes('Monthly')) {
      expDate.setMonth(expDate.getMonth() + 1);
    }
    const expiry_date = expDate.toISOString().split('T')[0];

    let membership_expiry = null;
    if (!m.plan.includes('Non-Member')) {
      const md = new Date(joinedDate);
      md.setFullYear(md.getFullYear() + 1);
      membership_expiry = md.toISOString().split('T')[0];
    }

    const status = calculateStatus({ joined_date: joined_date_str, expiry_date });

    insertStmt.run(member_id, m.name, m.contact, m.plan, status, joined_date_str, expiry_date, m.address, membership_expiry);

    // Generate historical check-ins from joinedDate up to the minimum of (today, expiryDate)
    const startDate = new Date(joinedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(expDate);
    if (endDate > today) {
      endDate.setTime(today.getTime());
    }

    const currentLoopDate = new Date(startDate);
    while (currentLoopDate <= endDate) {
      // 70% probability of checking in on any given day
      if (Math.random() < 0.7) {
        // Pick a random workout window: morning (7-10) or evening (16-19)
        const isMorning = Math.random() < 0.5;
        const hour = isMorning 
          ? Math.floor(Math.random() * 4) + 7   // 7, 8, 9, 10
          : Math.floor(Math.random() * 4) + 16; // 16, 17, 18, 19
        const minute = Math.floor(Math.random() * 60);
        const second = Math.floor(Math.random() * 60);

        const checkInLocal = new Date(currentLoopDate);
        checkInLocal.setHours(hour, minute, second, 0);

        // Convert to UTC string for SQLite
        const checked_in_at_utc = checkInLocal.toISOString().replace('T', ' ').substring(0, 19);

        // Calculate member status on the check-in day
        let logStatus = 'Active';
        const daysLeftOnCheckinDay = Math.ceil((expDate.getTime() - checkInLocal.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeftOnCheckinDay <= 7 && daysLeftOnCheckinDay >= 0) {
          logStatus = 'Expiring Soon';
        } else if (daysLeftOnCheckinDay < 0) {
          logStatus = 'Expired';
        }

        checkInStmt.run(member_id, m.name, m.plan, logStatus, checked_in_at_utc);
      }
      
      // Move to the next day
      currentLoopDate.setDate(currentLoopDate.getDate() + 1);
    }
  });
  console.log('Seeded 24 demo members and historical check-in logs successfully.');
}

// ─── Helper: Generate Member ID ─────────────────────────────
function generateMemberId() {
  const last = db.prepare('SELECT member_id FROM members ORDER BY id DESC LIMIT 1').get();
  if (!last) return 'M-001';
  const num = parseInt(last.member_id.replace('M-', ''), 10) + 1;
  return `M-${String(num).padStart(3, '0')}`;
}

// ─── Helper: Format Local Datetime to 12h AM/PM ───────────────
function formatLocalTime(localDtStr) {
  if (!localDtStr) return '';
  const d = new Date(localDtStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  return `${hours}:${minutes}:${seconds} ${ampm}`;
}



// ─── Auth Middleware ─────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Express App ────────────────────────────────────────────
const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('http://localhost') || origin === 'file://' || origin.startsWith('app://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// ─── Auth Routes ────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ access_token: token, role: user.role });
});

app.post('/api/logout', authMiddleware, (_req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// ─── Dashboard ──────────────────────────────────────────────
app.get('/api/dashboard', authMiddleware, (_req, res) => {
  // Update statuses first
  const allMembers = db.prepare('SELECT * FROM members').all();
  for (const m of allMembers) {
    const newStatus = calculateStatus(m);
    if (newStatus !== m.status) {
      db.prepare('UPDATE members SET status = ? WHERE id = ?').run(newStatus, m.id);
    }
  }
  
  const totalMembers = db.prepare('SELECT COUNT(*) as count FROM members').get().count;
  const activeMembers = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'Active'").get().count;
  
  // Today's check-ins (using local date and time conversions)
  const today = new Date().toLocaleDateString('sv');
  const todayCheckIns = db.prepare("SELECT COUNT(*) as count FROM check_in_logs WHERE DATE(checked_in_at, 'localtime') = ?").get(today).count;
  
  const recentCheckInsRaw = db.prepare(`
    SELECT c.id, c.member_name as memberName, 
           DATETIME(c.checked_in_at, 'localtime') as local_dt, c.plan, c.status
    FROM check_in_logs c
    WHERE DATE(c.checked_in_at, 'localtime') = ?
    ORDER BY c.checked_in_at DESC
    LIMIT 10
  `).all(today);
  
  const recentCheckIns = recentCheckInsRaw.map(c => ({
    id: c.id,
    memberName: c.memberName,
    time: formatLocalTime(c.local_dt),
    plan: c.plan,
    status: c.status
  }));

  const expiringMembers = db.prepare(`
    SELECT id, member_id, name, contact, plan, status, expiry_date, membership_expiry 
    FROM members
    WHERE status = 'Expiring Soon'
       OR (membership_expiry IS NOT NULL AND membership_expiry BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+7 days'))
    ORDER BY CASE WHEN status = 'Expiring Soon' THEN expiry_date ELSE membership_expiry END ASC
  `).all();

  const expiredMembers = db.prepare(`
    SELECT id, member_id, name, contact, plan, status, expiry_date, membership_expiry 
    FROM members
    WHERE status = 'Expired'
       OR (membership_expiry IS NOT NULL AND membership_expiry < date('now', 'localtime'))
    ORDER BY CASE WHEN status = 'Expired' THEN expiry_date ELSE membership_expiry END DESC
    LIMIT 50
  `).all();
  
  res.json({ 
    activeMembers, 
    totalMembers, 
    todayCheckIns, 
    recentCheckIns,
    expiringMembers,
    expiredMembers
  });
});

// ─── Members ────────────────────────────────────────────────
app.get('/api/members', authMiddleware, (req, res) => {
  const { search, status } = req.query;
  
  // Update all statuses first
  const allMembers = db.prepare('SELECT * FROM members').all();
  for (const m of allMembers) {
    const newStatus = calculateStatus(m);
    if (newStatus !== m.status) {
      db.prepare('UPDATE members SET status = ? WHERE id = ?').run(newStatus, m.id);
    }
  }
  
  let query = 'SELECT * FROM members WHERE 1=1';
  const params = [];
  
  if (search) {
    query += ' AND (name LIKE ? OR member_id LIKE ? OR contact LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s);
    
    // Smart ID matching:
    // If search is just a number (e.g., "12" or "3"), pad it to match "M-012" or "M-003"
    const digitMatch = search.trim().match(/^(\d+)$/);
    if (digitMatch) {
      const paddedId = `M-${digitMatch[1].padStart(3, '0')}`;
      query += ' OR member_id = ?';
      params.push(paddedId);
    }
    
    // If search is "M12" or "m12" (no hyphen), convert to "M-012"
    const mMatch = search.trim().match(/^[Mm](\d+)$/);
    if (mMatch) {
      const paddedId = `M-${mMatch[1].padStart(3, '0')}`;
      query += ' OR member_id = ?';
      params.push(paddedId);
    }

    // If search is "M-12" or "m-12" (with hyphen but unpadded), convert to "M-012"
    const hyphenMatch = search.trim().match(/^[Mm]-(\d+)$/);
    if (hyphenMatch) {
      const paddedId = `M-${hyphenMatch[1].padStart(3, '0')}`;
      query += ' OR member_id = ?';
      params.push(paddedId);
    }
    
    query += ')';
  }
  
  if (status && status !== 'All Status') {
    if (status === 'Annual Membership') {
      query += " AND plan NOT LIKE '%Non-Member%'";
    } else {
      query += ' AND status = ?';
      params.push(status);
    }
  }
  
  query += ' ORDER BY id DESC';
  const members = db.prepare(query).all(...params);
  res.json(members);
});

app.post('/api/members', authMiddleware, (req, res) => {
  const { name, contact, plan, joined_date, expiry_date, address, membership_expiry } = req.body;
  if (!name || !contact || !plan) return res.status(400).json({ error: 'Name, contact, and plan are required.' });
  
  const existingName = db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existingName) {
    return res.status(400).json({ error: 'A member with this name already exists.' });
  }
  
  const member_id = generateMemberId();
  const tempMember = { joined_date, expiry_date };
  const status = calculateStatus(tempMember);
  
  db.prepare(`
    INSERT INTO members (member_id, name, contact, plan, status, joined_date, expiry_date, address, membership_expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(member_id, name.trim(), contact, plan, status, joined_date || null, expiry_date || null, address || '', membership_expiry || null);
  
  const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(member_id);
  res.status(201).json(member);
});

app.put('/api/members/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, contact, plan, joined_date, expiry_date, address, membership_expiry } = req.body;
  
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Member not found.' });
  
  if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?) AND id != ?').get(name.trim(), id);
    if (duplicate) {
      return res.status(400).json({ error: 'A member with this name already exists.' });
    }
  }

  const tempMember = { joined_date: joined_date || existing.joined_date, expiry_date: expiry_date || existing.expiry_date };
  const status = calculateStatus(tempMember);
  
  db.prepare(`
    UPDATE members SET name = ?, contact = ?, plan = ?, status = ?, joined_date = ?, expiry_date = ?, address = ?, membership_expiry = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name ? name.trim() : existing.name,
    contact || existing.contact,
    plan || existing.plan,
    status,
    joined_date || existing.joined_date,
    expiry_date || existing.expiry_date,
    address !== undefined ? address : existing.address,
    membership_expiry || existing.membership_expiry,
    id
  );
  
  const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/members/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Member not found.' });
  
  db.prepare('DELETE FROM members WHERE id = ?').run(id);
  res.status(204).end();
});

app.get('/api/members/:memberId/checkins', authMiddleware, (req, res) => {
  const { memberId } = req.params;
  const member = db.prepare('SELECT 1 FROM members WHERE member_id = ?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  
  const checkinsRaw = db.prepare(`
    SELECT id, checked_in_at, DATETIME(checked_in_at, 'localtime') as local_dt, status
    FROM check_in_logs 
    WHERE member_id = ?
    ORDER BY checked_in_at DESC
  `).all(memberId);
  
  const checkins = checkinsRaw.map(c => ({
    id: c.id,
    time: formatLocalTime(c.local_dt),
    date: c.local_dt ? c.local_dt.split(' ')[0] : '',
    status: c.status
  }));
  
  res.json(checkins);
});

// ─── Check-ins ──────────────────────────────────────────────
app.get('/api/checkins', authMiddleware, (req, res) => {
  const queryDate = req.query.date || new Date().toLocaleDateString('sv');
  const checkInsRaw = db.prepare(`
    SELECT id, member_id as memberId, member_name as memberName, 
           DATETIME(checked_in_at, 'localtime') as local_dt, status
    FROM check_in_logs 
    WHERE DATE(checked_in_at, 'localtime') = ?
    ORDER BY checked_in_at DESC
  `).all(queryDate);
  
  const checkIns = checkInsRaw.map(c => ({
    id: c.id,
    memberId: c.memberId,
    memberName: c.memberName,
    time: formatLocalTime(c.local_dt),
    status: c.status
  }));
  
  res.json(checkIns);
});

app.post('/api/checkins', authMiddleware, (req, res) => {
  const { member_id } = req.body;
  if (!member_id) return res.status(400).json({ error: 'Member ID is required.' });
  
  const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(member_id);
  if (!member) return res.status(404).json({ error: `Member ${member_id} not found.` });
  
  // Check if member has already checked in today (using local time)
  const todayDate = new Date().toLocaleDateString('sv');
  const alreadyCheckedIn = db.prepare(`
    SELECT 1 FROM check_in_logs 
    WHERE member_id = ? AND DATE(checked_in_at, 'localtime') = ?
  `).get(member.member_id, todayDate);
  
  if (alreadyCheckedIn) {
    return res.status(400).json({ error: `Member ${member.name} has already timed in today.` });
  }
  
  // Update status
  const currentStatus = calculateStatus(member);
  if (currentStatus === 'Expired') {
    return res.status(403).json({ error: `Member ${member.name}'s membership has expired.` });
  }

  if (currentStatus !== member.status) {
    db.prepare('UPDATE members SET status = ? WHERE id = ?').run(currentStatus, member.id);
  }
  
  db.prepare(`
    INSERT INTO check_in_logs (member_id, member_name, plan, status) VALUES (?, ?, ?, ?)
  `).run(member.member_id, member.name, member.plan, currentStatus);
  
  res.status(201).json({ memberName: member.name, status: currentStatus });
});

// ─── Settings ───────────────────────────────────────────────
app.get('/api/settings', authMiddleware, (_req, res) => {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!settings) return res.json({ gymName: 'NeoFit Fitness Gym', contact: '', address: '', announcement: '' });
  res.json({
    gymName: settings.gym_name,
    contact: settings.contact,
    address: settings.address,
    announcement: settings.announcement
  });
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const { gymName, contact, address, announcement } = req.body;
  db.prepare(`
    UPDATE settings SET gym_name = ?, contact = ?, address = ?, announcement = ? WHERE id = 1
  `).run(gymName || '', contact || '', address || '', announcement || '');
  res.json({ message: 'Settings saved.' });
});

// ─── Start Server ───────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`NeoFit API server running on http://localhost:${PORT}`);
  console.log(`Database: ${dbPath}`);
});

module.exports = app;

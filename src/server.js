const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, '..', 'data.db');
const LOG_FILE = path.join(__dirname, '..', 'audit.log');
const db = new Database(DB_FILE);

// Ensure log file exists
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, '');
}

// Database setup
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'manager', 'admin'))
  );
  
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
  
  CREATE TABLE IF NOT EXISTS app_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    username TEXT,
    action TEXT NOT NULL,
    details TEXT
  );
`);

// Seed default users (if not exist)
const seedUser = (username, password, role) => {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(username, hash, role);
};

seedUser('admin', 'admin123', 'admin');
seedUser('manager', 'manager123', 'manager');
seedUser('user', 'user123', 'user');

// Seed some products
db.prepare(
  `INSERT OR IGNORE INTO products (id, name, sku, quantity)
   VALUES (1, 'Server Rack', 'SRV-RACK-01', 10)`
).run();
db.prepare(
  `INSERT OR IGNORE INTO products (id, name, sku, quantity)
   VALUES (2, 'Network Switch', 'NET-SW-24', 25)`
).run();
db.prepare(
  `INSERT OR IGNORE INTO products (id, name, sku, quantity)
   VALUES (3, 'UPS Battery', 'UPS-BAT-09', 15)`
).run();

// Logging helper
function auditLog(username, action, details) {
  const entry = `${new Date().toISOString()} | ${username || 'anonymous'} | ${action} | ${details}\n`;
  fs.appendFile(LOG_FILE, entry, () => {});
  db.prepare(
    'INSERT INTO app_logs (username, action, details) VALUES (?, ?, ?)'
  ).run(username || null, action, details || null);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: 'inventory-secret',
    resave: false,
    saveUninitialized: false,
  })
);

// HTTP request logging
app.use(
  morgan('dev', {
    stream: fs.createWriteStream(path.join(__dirname, '..', 'access.log'), { flags: 'a' }),
  })
);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Auth helpers
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.user = { id: user.id, username: user.username, role: user.role };
  auditLog(user.username, 'login', `Role=${user.role}`);
  res.json({ username: user.username, role: user.role });
});

app.post('/api/logout', (req, res) => {
  const username = req.session.user?.username;
  req.session.destroy(() => {
    auditLog(username, 'logout', '');
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  res.json(req.session.user || null);
});

// Products
app.get('/api/products', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM products').all();
  res.json(rows);
});

app.post('/api/products', requireRole(['manager', 'admin']), (req, res) => {
  const { name, sku, quantity } = req.body;
  const result = db.prepare(
    'INSERT INTO products (name, sku, quantity) VALUES (?, ?, ?)'
  ).run(name, sku, quantity || 0);
  auditLog(req.session.user.username, 'create_product', `id=${result.lastInsertRowid}, sku=${sku}`);
  res.json({ id: result.lastInsertRowid, name, sku, quantity: quantity || 0 });
});

app.put('/api/products/:id', requireRole(['manager', 'admin']), (req, res) => {
  const { id } = req.params;
  const { name, sku, quantity } = req.body;
  const result = db.prepare(
    'UPDATE products SET name=?, sku=?, quantity=? WHERE id=?'
  ).run(name, sku, quantity, id);
  auditLog(req.session.user.username, 'update_product', `id=${id}`);
  res.json({ updated: result.changes });
});

// Orders / Requests
app.get('/api/orders', requireAuth, (req, res) => {
  const role = req.session.user.role;
  const userId = req.session.user.id;
  let query =
    'SELECT o.*, p.name as product_name, u.username as requester FROM orders o JOIN products p ON o.product_id = p.id JOIN users u ON o.user_id = u.id';
  const params = [];
  if (role === 'user') {
    query += ' WHERE o.user_id = ?';
    params.push(userId);
  }

  const rows = db.prepare(query).all(params);
  res.json(rows);
});

app.post('/api/orders', requireRole(['user', 'manager', 'admin']), (req, res) => {
  const { product_id, quantity } = req.body;
  const userId = req.session.user.id;
  const result = db.prepare(
    'INSERT INTO orders (user_id, product_id, quantity, status) VALUES (?, ?, ?, ?)'
  ).run(userId, product_id, quantity, 'pending');
  auditLog(req.session.user.username, 'create_order', `id=${result.lastInsertRowid}, product_id=${product_id}`);
  res.json({ id: result.lastInsertRowid, user_id: userId, product_id, quantity, status: 'pending' });
});

app.post('/api/orders/:id/approve', requireRole(['manager', 'admin']), (req, res) => {
  const { id } = req.params;
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.transaction(() => {
    db.prepare('UPDATE orders SET status=? WHERE id=?').run('approved', id);
    db.prepare(
      'UPDATE products SET quantity = quantity - ? WHERE id=?'
    ).run(order.quantity, order.product_id);
  })();
  auditLog(req.session.user.username, 'approve_order', `id=${id}`);
  res.json({ ok: true });
});

app.post('/api/orders/:id/reject', requireRole(['manager', 'admin']), (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE orders SET status=? WHERE id=?').run('rejected', id);
  auditLog(req.session.user.username, 'reject_order', `id=${id}`);
  res.json({ ok: true });
});

// Admin: users & logs
app.get('/api/users', requireRole(['admin']), (req, res) => {
  const rows = db.prepare('SELECT id, username, role FROM users').all();
  res.json(rows);
});

app.post('/api/users', requireRole(['admin']), (req, res) => {
  const { username, password, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(username, hash, role);
  auditLog(req.session.user.username, 'create_user', `id=${result.lastInsertRowid}, role=${role}`);
  res.json({ id: result.lastInsertRowid, username, role });
});

app.get('/api/logs', requireRole(['admin']), (req, res) => {
  const rows = db.prepare('SELECT * FROM app_logs ORDER BY timestamp DESC LIMIT 100').all();
  res.json(rows);
});

// Monitoring / health
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1 as ok').get();
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'db_error' });
  }
});

app.get('/api/metrics', (req, res) => {
  try {
    const user_count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const product_count = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const order_count = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    
    res.json({
      user_count,
      product_count,
      order_count
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

app.listen(PORT, () => {
  console.log(`Inventory Management System running on http://localhost:${PORT}`);
});



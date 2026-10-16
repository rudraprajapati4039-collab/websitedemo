const express = require('express'), multer = require('multer'), Database = require('better-sqlite3');
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const ADMIN_PHONE = process.env.ADMIN_PHONE || '8200608242';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'Mokshit@2023';   // change this on your server

const db = new Database('cse.db');
db.exec(fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8'));
if (!db.prepare('SELECT 1 FROM services').get()) {
  const ins = db.prepare('INSERT INTO services (icon,name) VALUES (?,?)');
  [['🪪','Aadhaar update / new Aadhaar'],['💳','PAN card apply / correction'],['🛂','Passport application'],['🗳️','Voter ID'],['🚗','Driving licence'],['📜','Income / caste / domicile certificate'],['🏥','Ayushman Bharat card'],['🍚','Ration card'],['💡','Electricity & utility bill payment'],['📝','Online forms & government jobs'],['🏦','Banking & money transfer'],['🖨️','Print, scan & photocopy'],['➕','Other service']].forEach(x => ins.run(...x));
}
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');
if (!db.prepare('SELECT 1 FROM admins WHERE phone=?').get(ADMIN_PHONE)) {
  const s = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO admins VALUES (?,?,?)').run(ADMIN_PHONE, s, hash(ADMIN_PASS, s));
}

fs.mkdirSync('uploads', { recursive: true });
const up = multer({
  storage: multer.diskStorage({
    destination: 'uploads',
    filename: (r, f, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(f.originalname).toLowerCase())
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (r, f, cb) => cb(null, (f.fieldname === 'photo' ? ['image/jpeg', 'image/png'] : ['application/pdf', 'image/jpeg', 'image/png']).includes(f.mimetype))
}).fields([{ name: 'aadhaar', maxCount: 1 }, { name: 'pan', maxCount: 1 }, { name: 'photo', maxCount: 1 }]);

const sessions = new Set(), fails = {};
const token = q => ((q.headers.cookie || '').split('; ').find(c => c.startsWith('t=')) || '').slice(2);
const auth = (q, s, n) => sessions.has(token(q)) ? n() : s.status(401).json({ error: 'Login required' });

const app = express();
app.use(express.json());
app.get('/admin.html', (q, s, n) => sessions.has(token(q)) ? n() : s.redirect('/login.html'));
app.use(express.static('public'));

// ---------- public: submit request ----------
app.post('/api/request', (q, s) => up(q, s, err => {
  const b = q.body, f = q.files || {}, all = Object.values(f).flat();
  const bad = m => { all.forEach(x => fs.unlink(x.path, () => {})); s.status(400).json({ error: m }); };
  if (err) return bad(err.message);
  if (!b.name?.trim() || !b.address?.trim() || !b.service) return bad('Please fill all required fields.');
  if (!/^[6-9]\d{9}$/.test(b.phone || '')) return bad('Enter a valid 10-digit phone number.');
  if (!/^\S+@\S+\.\S+$/.test(b.email || '')) return bad('Enter a valid email address.');
  if (!f.aadhaar || !f.pan || !f.photo) return bad('Aadhaar, PAN (PDF/JPG/PNG) and passport photo (JPG/PNG) are required, max 5 MB each.');
  db.prepare('INSERT INTO requests (name,phone,email,address,service,message,aadhaar,pan,photo) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(b.name.trim(), b.phone, b.email.trim(), b.address.trim(), b.service, (b.message || '').trim(), f.aadhaar[0].filename, f.pan[0].filename, f.photo[0].filename);
  s.json({ ok: true });
}));

// ---------- admin ----------
app.post('/api/admin/login', (q, s) => {
  const ip = q.ip, now = Date.now();
  if ((fails[ip] || []).filter(t => now - t < 9e5).length >= 5) return s.status(429).json({ error: 'Too many attempts. Try after 15 minutes.' });
  const a = db.prepare('SELECT * FROM admins WHERE phone=?').get(String(q.body.phone || ''));
  const ok = a && crypto.timingSafeEqual(Buffer.from(hash(String(q.body.password || ''), a.salt)), Buffer.from(a.hash));
  if (!ok) { (fails[ip] = (fails[ip] || []).filter(t => now - t < 9e5)).push(now); return s.status(401).json({ error: 'Wrong phone number or password.' }); }
  const t = crypto.randomBytes(24).toString('hex'); sessions.add(t);
  s.setHeader('Set-Cookie', `t=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
  s.json({ ok: true });
});
app.post('/api/admin/logout', (q, s) => { sessions.delete(token(q)); s.setHeader('Set-Cookie', 't=; Max-Age=0; Path=/'); s.json({ ok: true }); });
app.get('/api/admin/requests', auth, (q, s) => s.json(db.prepare('SELECT * FROM requests ORDER BY id DESC').all()));
app.patch('/api/admin/requests/:id', auth, (q, s) => { db.prepare('UPDATE requests SET status=? WHERE id=?').run(q.body.status === 'Done' ? 'Done' : 'New', q.params.id); s.json({ ok: true }); });
app.delete('/api/admin/requests/:id', auth, (q, s) => {
  const r = db.prepare('SELECT * FROM requests WHERE id=?').get(q.params.id);
  if (r) { [r.aadhaar, r.pan, r.photo].forEach(x => fs.unlink(path.join('uploads', x), () => {})); db.prepare('DELETE FROM requests WHERE id=?').run(r.id); }
  s.json({ ok: true });
});
app.get('/files/:name', auth, (q, s) => s.sendFile(path.join(__dirname, 'uploads', path.basename(q.params.name))));

// ---------- website content: services, gallery, background ----------
fs.mkdirSync('site-images', { recursive: true });
const img = multer({
  storage: multer.diskStorage({ destination: 'site-images', filename: (r, f, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (r, f, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimetype))
});
const one = (q, s, n) => img.single('image')(q, s, e => e ? s.status(400).json({ error: e.message }) : q.file ? n() : s.status(400).json({ error: 'Choose a JPG, PNG or WebP picture up to 5 MB.' }));
const setting = k => (db.prepare('SELECT value FROM settings WHERE key=?').get(k) || {}).value;
const rm = f => f && fs.unlink(path.join('site-images', path.basename(f)), () => {});
app.use('/site', express.static('site-images'));
app.get('/api/site', (q, s) => s.json({ services: db.prepare('SELECT * FROM services ORDER BY id').all(), gallery: db.prepare('SELECT * FROM gallery ORDER BY id DESC').all(), hero: setting('hero') || null }));
app.post('/api/admin/services', auth, (q, s) => {
  const n = String(q.body.name || '').trim().slice(0, 60);
  if (!n) return s.status(400).json({ error: 'Enter a service name.' });
  db.prepare('INSERT INTO services (icon,name) VALUES (?,?)').run(String(q.body.icon || '').trim().slice(0, 4) || '✔️', n); s.json({ ok: true });
});
app.delete('/api/admin/services/:id', auth, (q, s) => { db.prepare('DELETE FROM services WHERE id=?').run(q.params.id); s.json({ ok: true }); });
app.post('/api/admin/gallery', auth, one, (q, s) => { db.prepare('INSERT INTO gallery (file) VALUES (?)').run(q.file.filename); s.json({ ok: true }); });
app.delete('/api/admin/gallery/:id', auth, (q, s) => {
  const g = db.prepare('SELECT * FROM gallery WHERE id=?').get(q.params.id);
  if (g) { rm(g.file); db.prepare('DELETE FROM gallery WHERE id=?').run(g.id); } s.json({ ok: true });
});
app.post('/api/admin/background', auth, one, (q, s) => { rm(setting('hero')); db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('hero', q.file.filename); s.json({ ok: true }); });
app.delete('/api/admin/background', auth, (q, s) => { rm(setting('hero')); db.prepare("DELETE FROM settings WHERE key='hero'").run(); s.json({ ok: true }); });

app.listen(process.env.PORT || 3000, () => console.log('Nishtha CSC running on http://localhost:3000'));

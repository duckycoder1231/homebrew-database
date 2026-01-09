const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const resetDb = require('./scripts/reset-db');

const UPLOADS = path.join(__dirname, 'uploads');
const DB_FILE = path.join(__dirname, 'db.json');
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const SAMPLE_DB = [
	{ id: 1, title: "Solar Blaze", console: "NES", year: 2019, developer: "RetroDev", description: "Side-scrolling shooter homebrew.", downloadUrl: "" },
	{ id: 2, title: "Pixel Quest", console: "Game Boy", year: 2021, developer: "IndieTeam", description: "An RPG made for old hardware.", downloadUrl: "" },
	{ id: 3, title: "Mega Kart Homebrew", console: "Genesis", year: 2018, developer: "KartLab", description: "Arcade racing on classic console.", downloadUrl: "" },
	{ id: 4, title: "StarForth", console: "NES", year: 2023, developer: "NewWave", description: "Platformer in the style of classic 8-bit.", downloadUrl: "" }
];

function loadDb() {
	try {
		if (!fs.existsSync(DB_FILE)) { fs.writeFileSync(DB_FILE, JSON.stringify(SAMPLE_DB, null, 2)); return JSON.parse(JSON.stringify(SAMPLE_DB)); }
		return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
	} catch (e) { return JSON.parse(JSON.stringify(SAMPLE_DB)); }
}
function saveDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

const upload = multer({
	storage: multer.diskStorage({
		destination: (req, file, cb) => cb(null, UPLOADS),
		filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g,'_')}`)
	}),
	limits: { fileSize: 200 * 1024 * 1024 } // 200MB max
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // serve index.html

// GET /api/games?query filters
app.get('/api/games', (req, res) => {
	let db = loadDb();
	const q = (req.query.q || '').toLowerCase().trim();
	if (q) db = db.filter(x => (x.title + ' ' + (x.developer||'') + ' ' + (x.description||'')).toLowerCase().includes(q));
	if (req.query.console) db = db.filter(x => x.console === req.query.console);
	if (req.query.minYear) db = db.filter(x => (x.year||0) >= Number(req.query.minYear));
	if (req.query.maxYear) db = db.filter(x => (x.year||0) <= Number(req.query.maxYear));
	res.json(db);
});

// POST /api/games (multipart)
app.post('/api/games', upload.single('rom'), (req, res) => {
	try {
		// server-side validation: title, console, year and ROM file are required
		if (!req.body.title || !req.body.console || !req.body.year) {
			if (req.file) { try { fs.unlinkSync(path.join(UPLOADS, req.file.filename)); } catch(e){} }
			return res.status(400).json({ error: 'title, console and year are required' });
		}
		if (!req.file) return res.status(400).json({ error: 'ROM file is required' });
		if (isNaN(Number(req.body.year))) { if (req.file) { try { fs.unlinkSync(path.join(UPLOADS, req.file.filename)); } catch(e){} } return res.status(400).json({ error: 'year must be a number' }); }

		const db = loadDb();
		const id = Date.now();
		const item = {
			id,
			title: req.body.title || '',
			console: req.body.console || '',
			year: req.body.year ? Number(req.body.year) : null,
			developer: req.body.developer || '',
			description: req.body.description || '',
			downloadUrl: req.body.downloadUrl || '',
			fileName: req.file ? req.file.originalname : null,
			storedName: req.file ? req.file.filename : null
		};
		db.push(item);
		saveDb(db);
		res.status(201).json(item);
	} catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/games/:id
app.delete('/api/games/:id', (req, res) => {
	const id = Number(req.params.id);
	let db = loadDb();
	const entry = db.find(x => x.id === id);
	if (!entry) return res.status(404).json({ error: 'Not found' });
	// remove file if present
	if (entry.storedName) {
		const fp = path.join(UPLOADS, entry.storedName);
		if (fs.existsSync(fp)) fs.unlinkSync(fp);
	}
	db = db.filter(x => x.id !== id);
	saveDb(db);
	res.json({ ok: true });
});

// GET /api/games/:id/file
app.get('/api/games/:id/file', (req, res) => {
	const id = Number(req.params.id);
	const db = loadDb();
	const entry = db.find(x => x.id === id);
	if (!entry || !entry.storedName) return res.status(404).send('File not found');
	const fp = path.join(UPLOADS, entry.storedName);
	if (!fs.existsSync(fp)) return res.status(404).send('File missing');
	res.download(fp, entry.fileName);
});

// GET export
app.get('/api/games/export', (req, res) => {
	const db = loadDb();
	res.setHeader('Content-Type', 'application/json');
	res.send(JSON.stringify(db, null, 2));
});

// POST import (JSON body array) - replaces DB (files aren't imported)
app.post('/api/games/import', (req, res) => {
	const parsed = req.body;
	if (!Array.isArray(parsed)) return res.status(400).json({ error: 'Invalid payload' });
	const db = parsed.map((x, i) => ({
		id: x.id || Date.now() + i,
		title: x.title || '',
		console: x.console || '',
		year: x.year || null,
		developer: x.developer || '',
		description: x.description || '',
		downloadUrl: x.downloadUrl || '',
		fileName: null,
		storedName: null
	}));
	saveDb(db);
	res.json({ ok: true, count: db.length });
});

// POST reset -> replace with sample DB and delete uploaded files
app.post('/api/games/reset', (req, res) => {
	// delete all uploaded files
	fs.readdirSync(UPLOADS).forEach(f => { try { fs.unlinkSync(path.join(UPLOADS, f)); } catch(e){} });
	saveDb(JSON.parse(JSON.stringify(SAMPLE_DB)));
	res.json({ ok: true });
});

(async function start() {
	app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

	// Only reset DB when explicitly requested:
	const shouldReset =
		process.env.RESET_DB === '1' || process.env.RESET_DB === 'true' || process.argv.includes('--reset-db');

	if (shouldReset) {
		console.log('RESET_DB detected: performing DB reset (explicit).');
		try {
			await resetDb();
			console.log('DB reset complete.');
		} catch (err) {
			console.error('DB reset failed:', err);
		}
	} else {
		console.log('Skipping DB reset on startup. To reset manually: `npm run reset-db` or start with `RESET_DB=1` or `node server.js --reset-db`.');
	}
})();

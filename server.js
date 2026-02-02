const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 8080;

// Paths
const DATA_DIR = path.join(__dirname, 'data');
const ROULETTE_DIR = path.join(DATA_DIR, 'roulette');
const ROULETTE_JSON = path.join(DATA_DIR, 'roulette.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ROULETTE_DIR)) fs.mkdirSync(ROULETTE_DIR, { recursive: true });

// Initialize JSON file if not exists
function loadData() {
    if (!fs.existsSync(ROULETTE_JSON)) {
        fs.writeFileSync(ROULETTE_JSON, JSON.stringify({ folders: [], images: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(ROULETTE_JSON, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(ROULETTE_JSON, JSON.stringify(data, null, 2));
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded images
app.use('/uploads', express.static(ROULETTE_DIR));

// Multer config for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderId = req.params.folderId;
        const folderPath = path.join(ROULETTE_DIR, folderId);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        cb(null, folderPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const imageId = uuidv4();
        cb(null, imageId + ext);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('Only images allowed'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// ==========================================
// API Endpoints
// ==========================================

// GET /api/folders - List all folders
app.get('/api/folders', (req, res) => {
    const data = loadData();
    res.json(data.folders.sort((a, b) => b.createdAt - a.createdAt));
});

// POST /api/folders - Create folder
app.post('/api/folders', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const data = loadData();
    const folder = {
        id: uuidv4(),
        name,
        createdAt: Date.now()
    };
    data.folders.push(folder);
    saveData(data);

    // Create folder directory
    const folderPath = path.join(ROULETTE_DIR, folder.id);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    res.status(201).json(folder);
});

// DELETE /api/folders/:id - Delete folder and its images
app.delete('/api/folders/:id', (req, res) => {
    const { id } = req.params;
    const data = loadData();

    // Remove folder from list
    data.folders = data.folders.filter(f => f.id !== id);

    // Remove images from that folder
    data.images = data.images.filter(img => img.folderId !== id);

    saveData(data);

    // Delete folder directory
    const folderPath = path.join(ROULETTE_DIR, id);
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
    }

    res.json({ success: true });
});

// GET /api/folders/:folderId/images - Get images in folder
app.get('/api/folders/:folderId/images', (req, res) => {
    const { folderId } = req.params;
    const data = loadData();
    const images = data.images.filter(img => img.folderId === folderId);
    res.json(images);
});

// POST /api/folders/:folderId/images - Upload images
app.post('/api/folders/:folderId/images', upload.array('images', 20), (req, res) => {
    const { folderId } = req.params;
    const data = loadData();

    const uploaded = [];
    req.files.forEach(file => {
        const imageRecord = {
            id: path.basename(file.filename, path.extname(file.filename)),
            folderId,
            filename: file.filename,
            url: `/uploads/${folderId}/${file.filename}`,
            createdAt: Date.now()
        };
        data.images.push(imageRecord);
        uploaded.push(imageRecord);
    });

    saveData(data);
    res.status(201).json(uploaded);
});

// DELETE /api/images/:id - Delete single image
app.delete('/api/images/:id', (req, res) => {
    const { id } = req.params;
    const data = loadData();

    const image = data.images.find(img => img.id === id);
    if (!image) {
        return res.status(404).json({ error: 'Image not found' });
    }

    // Remove file
    const filePath = path.join(ROULETTE_DIR, image.folderId, image.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    // Remove from data
    data.images = data.images.filter(img => img.id !== id);
    saveData(data);

    res.json({ success: true });
});

// ==========================================
// Start Server
// ==========================================

app.listen(PORT, () => {
    console.log(`🚀 Game Portal server running at http://localhost:${PORT}`);
    console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
    console.log(`📷 Uploads stored in: ${ROULETTE_DIR}`);
});

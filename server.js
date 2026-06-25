const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Use memory storage so we can process with sharp before saving
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB input limit (will be compressed)
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
  }
});

// Compress and save an image using sharp
async function compressAndSave(buffer, originalname) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const outputFilename = uniqueSuffix + '.webp';
  const outputPath = path.join(uploadsDir, outputFilename);

  await sharp(buffer)
    .rotate() // auto-rotate based on EXIF
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }) // cap at 2000px
    .webp({ quality: 75, effort: 6 }) // high visual quality, strong compression
    .toFile(outputPath);

  return {
    filename: outputFilename,
    originalname,
    url: `/uploads/${outputFilename}`
  };
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// API: Upload photos (with compression)
app.post('/api/upload', upload.array('photos', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    const results = await Promise.all(
      req.files.map(file => compressAndSave(file.buffer, file.originalname))
    );
    res.json({ success: true, files: results });
  } catch (err) {
    console.error('Compression error:', err);
    res.status(500).json({ error: 'Failed to process images' });
  }
});

// API: Get all photos
app.get('/api/photos', (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read photos' });
    }
    const photos = files
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(file => {
        const stats = fs.statSync(path.join(uploadsDir, file));
        return {
          filename: file,
          url: `/uploads/${file}`,
          size: stats.size,
          uploadedAt: stats.mtime
        };
      })
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json(photos);
  });
});

// API: Delete a photo
app.delete('/api/photos/:filename', (req, res) => {
  const filepath = path.join(uploadsDir, req.params.filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  fs.unlinkSync(filepath);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Photo Album running at http://localhost:${PORT}`);
});

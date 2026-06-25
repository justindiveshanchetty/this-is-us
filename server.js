const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Gzip all responses to save bandwidth
app.use(compression());

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const thumbsDir = path.join(__dirname, 'uploads', 'thumbs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

// Use memory storage so we can process with sharp before saving
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
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

// Compress and save full image + thumbnail
async function compressAndSave(buffer, originalname) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const outputFilename = uniqueSuffix + '.webp';
  const fullPath = path.join(uploadsDir, outputFilename);
  const thumbPath = path.join(thumbsDir, outputFilename);

  // Full image — capped at 1600px, quality 72
  await sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 6 })
    .toFile(fullPath);

  // Thumbnail — 400px, lower quality for gallery grid
  await sharp(buffer)
    .rotate()
    .resize(400, 400, { fit: 'cover' })
    .webp({ quality: 60, effort: 6 })
    .toFile(thumbPath);

  return {
    filename: outputFilename,
    originalname,
    url: `/uploads/${outputFilename}`,
    thumb: `/uploads/thumbs/${outputFilename}`
  };
}

// Serve static files with long cache (images don't change once uploaded)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h'
}));
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '365d',  // Immutable content — filename is unique
  immutable: true
}));

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
          thumb: `/uploads/thumbs/${file}`,
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
  const thumbpath = path.join(thumbsDir, req.params.filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  fs.unlinkSync(filepath);
  if (fs.existsSync(thumbpath)) fs.unlinkSync(thumbpath);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Photo Album running at http://localhost:${PORT}`);
});

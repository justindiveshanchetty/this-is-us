const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
    const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif|tiff|bmp/;
    const allowedMimes = /image\//; // Accept any image mime type
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.test(file.mimetype);
    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
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

// ──────────────────────────────────────
// Live Slideshow Feature
// ──────────────────────────────────────

// Active slideshow sessions: { id: { photos, currentIndex, interval, speed, playing, clients: Set } }
const slideshowSessions = new Map();

// Create a new live slideshow session
app.post('/api/slideshow', express.json(), (req, res) => {
  const { speed = 5000, shuffle = false } = req.body || {};
  const id = crypto.randomBytes(4).toString('hex');

  // Get photos list
  const files = fs.readdirSync(uploadsDir)
    .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
    .map(file => {
      const stats = fs.statSync(path.join(uploadsDir, file));
      return {
        filename: file,
        url: `/uploads/${file}`,
        thumb: `/uploads/thumbs/${file}`,
        uploadedAt: stats.mtime
      };
    })
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  if (files.length === 0) {
    return res.status(400).json({ error: 'No photos available for slideshow' });
  }

  let photoList = [...files];
  if (shuffle) {
    for (let i = photoList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [photoList[i], photoList[j]] = [photoList[j], photoList[i]];
    }
  }

  const session = {
    id,
    photos: photoList,
    currentIndex: 0,
    speed,
    playing: true,
    clients: new Set(),
    interval: null
  };

  slideshowSessions.set(id, session);
  startSlideshowTimer(session);

  res.json({ id, totalPhotos: photoList.length, speed });
});

// Get slideshow session info
app.get('/api/slideshow/:id', (req, res) => {
  const session = slideshowSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Slideshow not found' });

  res.json({
    id: session.id,
    totalPhotos: session.photos.length,
    currentIndex: session.currentIndex,
    currentPhoto: session.photos[session.currentIndex],
    speed: session.speed,
    playing: session.playing,
    viewers: session.clients.size
  });
});

// SSE endpoint — clients connect here to receive live updates
app.get('/api/slideshow/:id/live', (req, res) => {
  const session = slideshowSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Slideshow not found' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send current state immediately
  const currentState = {
    type: 'sync',
    currentIndex: session.currentIndex,
    photo: session.photos[session.currentIndex],
    playing: session.playing,
    speed: session.speed,
    totalPhotos: session.photos.length,
    viewers: session.clients.size + 1
  };
  res.write(`data: ${JSON.stringify(currentState)}\n\n`);

  session.clients.add(res);
  broadcastViewerCount(session);

  req.on('close', () => {
    session.clients.delete(res);
    broadcastViewerCount(session);
    // Auto-cleanup empty sessions after 60s
    if (session.clients.size === 0) {
      setTimeout(() => {
        if (session.clients.size === 0 && slideshowSessions.has(session.id)) {
          clearInterval(session.interval);
          slideshowSessions.delete(session.id);
        }
      }, 60000);
    }
  });
});

// Control slideshow (play, pause, next, prev, speed)
app.post('/api/slideshow/:id/control', express.json(), (req, res) => {
  const session = slideshowSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Slideshow not found' });

  const { action, speed } = req.body;

  switch (action) {
    case 'play':
      session.playing = true;
      startSlideshowTimer(session);
      break;
    case 'pause':
      session.playing = false;
      clearInterval(session.interval);
      session.interval = null;
      break;
    case 'next':
      session.currentIndex = (session.currentIndex + 1) % session.photos.length;
      break;
    case 'prev':
      session.currentIndex = (session.currentIndex - 1 + session.photos.length) % session.photos.length;
      break;
    case 'speed':
      if (speed && speed >= 1000 && speed <= 30000) {
        session.speed = speed;
        if (session.playing) {
          clearInterval(session.interval);
          startSlideshowTimer(session);
        }
      }
      break;
  }

  broadcastState(session);
  res.json({ success: true });
});

// Delete a slideshow session
app.delete('/api/slideshow/:id', (req, res) => {
  const session = slideshowSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Slideshow not found' });

  clearInterval(session.interval);
  // Notify clients the session ended
  for (const client of session.clients) {
    client.write(`data: ${JSON.stringify({ type: 'ended' })}\n\n`);
    client.end();
  }
  slideshowSessions.delete(req.params.id);
  res.json({ success: true });
});

function startSlideshowTimer(session) {
  if (session.interval) clearInterval(session.interval);
  session.interval = setInterval(() => {
    session.currentIndex = (session.currentIndex + 1) % session.photos.length;
    broadcastState(session);
  }, session.speed);
}

function broadcastState(session) {
  const data = {
    type: 'update',
    currentIndex: session.currentIndex,
    photo: session.photos[session.currentIndex],
    playing: session.playing,
    speed: session.speed,
    viewers: session.clients.size
  };
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of session.clients) {
    client.write(message);
  }
}

function broadcastViewerCount(session) {
  const data = { type: 'viewers', viewers: session.clients.size };
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of session.clients) {
    client.write(message);
  }
}

app.listen(PORT, () => {
  console.log(`Photo Album running at http://localhost:${PORT}`);
});

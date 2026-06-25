# Photo Album

A modern photo album web app. Upload, view, and manage your photos with a clean dark UI.

## Features

- Drag & drop photo uploads (multiple files)
- Responsive masonry-style gallery
- Lightbox viewer with keyboard navigation
- Delete photos
- Mobile friendly

## Run Locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Deploy to Render

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New** → **Web Service**
4. Connect your GitHub repo
5. Render will auto-detect the `render.yaml` — or manually set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Add a **Disk** (mount path: `/opt/render/project/src/uploads`, 1 GB)
7. Deploy!

The `render.yaml` blueprint is included for one-click infrastructure-as-code deploys.

## Tech Stack

- Node.js + Express
- Multer (file uploads)
- Vanilla JS frontend
- CSS Grid gallery

// DOM Elements
const uploadBtn = document.getElementById('uploadBtn');
const modalOverlay = document.getElementById('modalOverlay');
const closeModal = document.getElementById('closeModal');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewArea = document.getElementById('previewArea');
const submitBtn = document.getElementById('submitBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('emptyState');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const lightboxDelete = document.getElementById('lightboxDelete');

let selectedFiles = [];
let photos = [];
let currentPhotoIndex = 0;

// Initialize
document.addEventListener('DOMContentLoaded', loadPhotos);

// Modal controls
uploadBtn.addEventListener('click', () => {
  modalOverlay.classList.add('active');
});

closeModal.addEventListener('click', closeUploadModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeUploadModal();
});

function closeUploadModal() {
  modalOverlay.classList.remove('active');
  resetUploadForm();
}

function resetUploadForm() {
  selectedFiles = [];
  previewArea.innerHTML = '';
  submitBtn.disabled = true;
  progressBar.classList.remove('active');
  progressFill.style.width = '0%';
  try { fileInput.value = ''; } catch(e) {}
}

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  addFiles(files);
});

// Only open file picker if they didn't tap the label (label already handles it via for="fileInput")
dropZone.addEventListener('click', (e) => {
  if (e.target.closest('.file-label')) return;
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) addFiles(files);
});

function addFiles(files) {
  selectedFiles = [...selectedFiles, ...files];
  renderPreviews();
  submitBtn.disabled = selectedFiles.length === 0;
}

function renderPreviews() {
  previewArea.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'preview-thumb';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-preview';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFiles.splice(index, 1);
      renderPreviews();
      submitBtn.disabled = selectedFiles.length === 0;
    });

    thumb.appendChild(img);
    thumb.appendChild(removeBtn);
    previewArea.appendChild(thumb);
  });
}

// Upload
submitBtn.addEventListener('click', uploadPhotos);

async function uploadPhotos() {
  if (selectedFiles.length === 0) return;

  const formData = new FormData();
  selectedFiles.forEach(file => {
    formData.append('photos', file);
  });

  submitBtn.disabled = true;
  progressBar.classList.add('active');

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        progressFill.style.width = percent + '%';
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        showToast(`${selectedFiles.length} photo${selectedFiles.length > 1 ? 's' : ''} uploaded!`);
        closeUploadModal();
        loadPhotos();
      } else {
        showToast('Upload failed. Please try again.');
      }
    });

    xhr.addEventListener('error', () => {
      showToast('Upload failed. Please try again.');
      submitBtn.disabled = false;
    });

    xhr.send(formData);
  } catch (err) {
    showToast('Upload failed. Please try again.');
    submitBtn.disabled = false;
  }
}

// Load photos
async function loadPhotos() {
  try {
    const response = await fetch('/api/photos');
    photos = await response.json();
    renderGallery();
  } catch (err) {
    showToast('Failed to load photos');
  }
}

function renderGallery() {
  if (photos.length === 0) {
    emptyState.style.display = 'block';
    gallery.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  gallery.style.display = 'grid';
  gallery.innerHTML = '';

  photos.forEach((photo, index) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.style.animationDelay = `${index * 0.05}s`;

    const img = document.createElement('img');
    img.src = photo.thumb || photo.url; // Use thumbnail in gallery to save bandwidth
    img.alt = 'Photo';
    img.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.className = 'photo-overlay';

    const date = document.createElement('span');
    date.className = 'photo-date';
    date.textContent = new Date(photo.uploadedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    overlay.appendChild(date);
    card.appendChild(img);
    card.appendChild(overlay);
    gallery.appendChild(card);

    card.addEventListener('click', () => openLightbox(index));
  });
}

// Lightbox
function openLightbox(index) {
  currentPhotoIndex = index;
  lightboxImg.src = photos[index].url;
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

lightboxPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
  lightboxImg.src = photos[currentPhotoIndex].url;
});

lightboxNext.addEventListener('click', (e) => {
  e.stopPropagation();
  currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
  lightboxImg.src = photos[currentPhotoIndex].url;
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lightboxPrev.click();
  if (e.key === 'ArrowRight') lightboxNext.click();
});

// Delete
lightboxDelete.addEventListener('click', async (e) => {
  e.stopPropagation();
  const photo = photos[currentPhotoIndex];
  if (!confirm('Delete this photo?')) return;

  try {
    const response = await fetch(`/api/photos/${photo.filename}`, { method: 'DELETE' });
    if (response.ok) {
      showToast('Photo deleted');
      closeLightbox();
      loadPhotos();
    } else {
      showToast('Failed to delete photo');
    }
  } catch (err) {
    showToast('Failed to delete photo');
  }
});

// Toast
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

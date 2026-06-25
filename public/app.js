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
  const files = Array.from(e.dataTransfer.files);
  addFiles(files);
});

// Tap anywhere on drop zone to open file picker
dropZone.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
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

// Keyboard navigation (lightbox only)
document.addEventListener('keydown', (e) => {
  if (slideshow && slideshow.classList.contains('active')) return; // Let slideshow handle it
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

// ──────────────────────────────────────
// Slideshow
// ──────────────────────────────────────

const slideshow = document.getElementById('slideshow');
const slideshowBtn = document.getElementById('slideshowBtn');
const slideshowExit = document.getElementById('slideshowExit');
const slideshowImg1 = document.getElementById('slideshowImg1');
const slideshowImg2 = document.getElementById('slideshowImg2');
const slideshowPlayPause = document.getElementById('slideshowPlayPause');
const slideshowPrevBtn = document.getElementById('slideshowPrev');
const slideshowNextBtn = document.getElementById('slideshowNext');
const slideshowCounter = document.getElementById('slideshowCounter');
const speedSlider = document.getElementById('speedSlider');
const speedLabel = document.getElementById('speedLabel');
const slideshowProgressFill = document.getElementById('slideshowProgressFill');

let slideshowIndex = 0;
let slideshowPlaying = false;
let slideshowTimer = null;
let slideshowCurrentImg = 1;
let autoHideTimer = null;

// Start slideshow
slideshowBtn.addEventListener('click', () => {
  if (photos.length === 0) {
    showToast('Upload some photos first!');
    return;
  }
  openSlideshow();
});

function openSlideshow() {
  slideshowIndex = 0;
  slideshow.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Show first photo
  slideshowImg1.src = photos[0].url;
  slideshowImg1.classList.add('slideshow-img-active');
  slideshowImg2.classList.remove('slideshow-img-active');
  slideshowCurrentImg = 1;
  updateCounter();

  // Auto-play
  startPlaying();
  setupAutoHide();
}

function closeSlideshow() {
  slideshow.classList.remove('active');
  slideshow.classList.remove('playing');
  document.body.style.overflow = '';
  stopPlaying();
  clearTimeout(autoHideTimer);
}

function startPlaying() {
  slideshowPlaying = true;
  slideshow.classList.add('playing');
  resetTimer();
}

function stopPlaying() {
  slideshowPlaying = false;
  slideshow.classList.remove('playing');
  clearInterval(slideshowTimer);
  slideshowTimer = null;
  stopProgressBar();
}

function resetTimer() {
  clearInterval(slideshowTimer);
  const speed = speedSlider.value * 1000;
  startProgressBar(speed);
  slideshowTimer = setInterval(() => {
    goToNext();
  }, speed);
}

function goToNext() {
  slideshowIndex = (slideshowIndex + 1) % photos.length;
  showCurrentPhoto();
  if (slideshowPlaying) {
    const speed = speedSlider.value * 1000;
    startProgressBar(speed);
  }
}

function goToPrev() {
  slideshowIndex = (slideshowIndex - 1 + photos.length) % photos.length;
  showCurrentPhoto();
  if (slideshowPlaying) {
    resetTimer();
  }
}

function showCurrentPhoto() {
  const photo = photos[slideshowIndex];
  const activeImg = slideshowCurrentImg === 1 ? slideshowImg1 : slideshowImg2;
  const inactiveImg = slideshowCurrentImg === 1 ? slideshowImg2 : slideshowImg1;

  inactiveImg.src = photo.url;
  inactiveImg.onload = () => {
    activeImg.classList.remove('slideshow-img-active');
    inactiveImg.classList.add('slideshow-img-active');
    slideshowCurrentImg = slideshowCurrentImg === 1 ? 2 : 1;
  };
  // If already cached
  if (inactiveImg.complete) {
    activeImg.classList.remove('slideshow-img-active');
    inactiveImg.classList.add('slideshow-img-active');
    slideshowCurrentImg = slideshowCurrentImg === 1 ? 2 : 1;
  }

  updateCounter();
}

function updateCounter() {
  slideshowCounter.textContent = `${slideshowIndex + 1} / ${photos.length}`;
}

// Controls
slideshowExit.addEventListener('click', closeSlideshow);

slideshowPlayPause.addEventListener('click', () => {
  if (slideshowPlaying) {
    stopPlaying();
  } else {
    startPlaying();
  }
});

slideshowPrevBtn.addEventListener('click', goToPrev);
slideshowNextBtn.addEventListener('click', goToNext);

speedSlider.addEventListener('input', () => {
  speedLabel.textContent = speedSlider.value + 's';
});

speedSlider.addEventListener('change', () => {
  if (slideshowPlaying) {
    resetTimer();
  }
});

// Keyboard controls in slideshow
document.addEventListener('keydown', (e) => {
  if (!slideshow.classList.contains('active')) return;
  if (e.key === 'Escape') { closeSlideshow(); e.preventDefault(); }
  if (e.key === 'ArrowLeft') goToPrev();
  if (e.key === 'ArrowRight') goToNext();
  if (e.key === ' ') { slideshowPlayPause.click(); e.preventDefault(); }
});

// Progress bar
function startProgressBar(duration) {
  stopProgressBar();
  slideshowProgressFill.style.transition = 'none';
  slideshowProgressFill.style.width = '0%';
  // Force reflow
  slideshowProgressFill.offsetHeight;
  slideshowProgressFill.style.transition = `width ${duration}ms linear`;
  slideshowProgressFill.style.width = '100%';
}

function stopProgressBar() {
  slideshowProgressFill.style.transition = 'none';
  slideshowProgressFill.style.width = '0%';
}

// Auto-hide overlay
function setupAutoHide() {
  const overlay = document.querySelector('.slideshow-overlay');

  slideshow.addEventListener('mousemove', resetAutoHide);
  slideshow.addEventListener('touchstart', resetAutoHide);

  function resetAutoHide() {
    overlay.classList.remove('auto-hide');
    clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(() => {
      if (slideshowPlaying) {
        overlay.classList.add('auto-hide');
      }
    }, 3000);
  }

  resetAutoHide();
}

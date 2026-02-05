// --- Constants ---
const filmStrip = document.getElementById('filmStrip');
const TOTAL_FRAMES_DEMO = 40;
const FRAME_WIDTH = 188; // 180px content + 4px border each side
const GAP = 24;
const ITEM_FULL_WIDTH = FRAME_WIDTH + GAP;

// --- Custom Confirm Modal ---
function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const msgEl = document.getElementById('confirmMessage');
        const yesBtn = document.getElementById('confirmYes');
        const noBtn = document.getElementById('confirmNo');

        msgEl.textContent = message;
        modal.classList.remove('hidden');

        const cleanup = () => {
            modal.classList.add('hidden');
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
        };

        const onYes = () => { cleanup(); resolve(true); };
        const onNo = () => { cleanup(); resolve(false); };

        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });
}

// State
let gameState = 'IDLE'; // IDLE, SPINNING, STOPPING, STOPPED
let speed = 0;
const MAX_SPEED = 50;
const FRICTION = 0.992;
const STOP_THRESHOLD = 0.2;

let currentScroll = 0;
let animationId;
let frames = []; // The DOM elements
let currentAssets = []; // The data (images or fake objects)
let isDemoMode = true;

// Elimination tracking (session only - resets on page refresh)
let eliminatedPlayers = new Set(); // Store eliminated asset IDs/indices
let lastWinnerInfo = null; // Store winner info for elimination

// Audio
const winAudio = new Audio('cheer.mp3');
winAudio.volume = 0.5;

// Fireworks
const canvas = document.createElement('canvas');
canvas.id = 'fireworks';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');
let fireworks = [];
let particles = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==========================================
// 1. Initialization & DB Integration
// ==========================================

async function init() {
    await loadFolders(); // Populate dropdown

    // Check if a folder was previously selected
    const savedFolder = localStorage.getItem('selectedFolder');
    const folderSelect = document.getElementById('folderSelect');

    if (savedFolder && savedFolder !== 'demo') {
        folderSelect.value = savedFolder;
        await loadGameAssets(savedFolder);
    } else {
        await loadGameAssets('demo');
    }

    // startSpin(); // Removed auto-start
}

// Logic to load assets based on selection
async function loadGameAssets(folderId) {
    // Clear existing
    filmStrip.innerHTML = '';
    frames.length = 0;
    currentAssets = [];
    currentScroll = 0;

    if (folderId === 'demo') {
        isDemoMode = true;
        // Generate 40 fake frames
        for (let i = 1; i <= TOTAL_FRAMES_DEMO; i++) {
            currentAssets.push({ type: 'fake', index: i });
        }
    } else {
        isDemoMode = false;
        try {
            const images = await db.getImages(folderId);
            if (images.length === 0) {
                // Fallback if empty folder
                alert("Folder is empty! Switching to Demo.");
                document.getElementById('folderSelect').value = 'demo';
                return loadGameAssets('demo');
            }
            // Use images with URLs from server
            currentAssets = images.map(img => ({ type: 'image', url: img.url, id: img.id }));
        } catch (e) {
            console.error(e);
            return loadGameAssets('demo');
        }
    }

    // Filter out eliminated players
    currentAssets = currentAssets.filter((asset, i) => {
        const assetKey = asset.id || `demo-${asset.index}`;
        return !eliminatedPlayers.has(assetKey);
    });

    // Check if all players eliminated
    if (currentAssets.length === 0) {
        alert('Tất cả người chơi đã bị loại! Reset lại...');
        eliminatedPlayers.clear();
        return loadGameAssets(folderId);
    }

    // Render Strip
    // We need clones for infinite scroll.
    // If we have few images (e.g., 5), we need many clones to fill the buffer.
    // Ensure we have at least ~40 items in the DOM for smooth speed.

    const minItems = 40;
    const repeatCount = Math.ceil(minItems / Math.max(1, currentAssets.length));

    // Create Original + Clones
    // Strategy: Render enough copies to ensuring scrolling works
    // For simple infinite loop logic, we just render the list multiple times.

    for (let r = 0; r < repeatCount * 2; r++) { // *2 for safety buffer
        currentAssets.forEach((asset, i) => {
            createFrameElement(asset, i + 1, false);
        });
    }
}

function createFrameElement(asset, labelIndex, isClone) {
    const div = document.createElement('div');
    div.className = 'frame';
    if (isClone) div.classList.add('clone');

    if (asset.type === 'fake') {
        const hue = (asset.index * 137.5) % 360;
        div.innerHTML = `
            <div class="frame-content" style="background-color: hsl(${hue}, 60%, 80%);">
                <span style="font-size: 2rem;">👤</span>
                <span style="font-size: 1rem; margin-top: 5px;">#${asset.index}</span>
            </div>
        `;
    } else if (asset.type === 'image') {
        const img = document.createElement('img');
        img.src = asset.url; // Use server URL
        div.appendChild(img);
    }

    filmStrip.appendChild(div);
    frames.push(div);
}

// ==========================================
// 2. Game Loop (Modified for Dynamic Content)
// ==========================================

function gameLoop() {
    if (gameState === 'STOPPED') return;

    currentScroll += speed;

    // We scroll infinitely by modulo of the SINGLE SET width.
    // But since we duplicated many times, we need to find the "cycle" width.
    // currentAssets.length is the base set size.
    const cycleWidth = currentAssets.length * ITEM_FULL_WIDTH;

    // If cycleWidth is 0 (empty assets), avoid NaN
    if (cycleWidth > 0 && currentScroll >= cycleWidth) {
        currentScroll = currentScroll % cycleWidth;
    }

    filmStrip.style.transform = `translateX(-${currentScroll}px)`;

    if (gameState === 'STOPPING') {
        speed *= FRICTION;
        if (speed < STOP_THRESHOLD) {
            finalizeStop();
            return;
        }
    }

    animationId = requestAnimationFrame(gameLoop);
}

function finalizeStop() {
    gameState = 'STOPPED';
    cancelAnimationFrame(animationId);

    // The film-strip has padding that already centers frames
    // Frame N is at center when: scroll = N * ITEM_FULL_WIDTH
    const centerIndex = Math.round(currentScroll / ITEM_FULL_WIDTH);
    
    // Calculate scroll position that puts centerIndex frame at center
    const snappedScroll = centerIndex * ITEM_FULL_WIDTH;

    console.log('currentScroll:', currentScroll, 'centerIndex:', centerIndex, 'snappedScroll:', snappedScroll);

    // Animate to snapped position
    filmStrip.style.transition = 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
    filmStrip.style.transform = `translateX(-${snappedScroll}px)`;

    // Use centerIndex to determine winner (the frame that will be centered)
    const frameIndex = ((centerIndex % frames.length) + frames.length) % frames.length;
    const assetIndex = ((centerIndex % currentAssets.length) + currentAssets.length) % currentAssets.length;

    console.log('frameIndex:', frameIndex, 'assetIndex:', assetIndex, 'winner:', currentAssets[assetIndex]);

    setTimeout(() => {
        filmStrip.style.transition = 'none';
        currentScroll = snappedScroll;
        highlightFrameByIndex(frameIndex, assetIndex);
    }, 500);
}

// ... (Rest of Interaction / Highlight / Fireworks logic is generic and keeps working) ...

// Helper to reset view (remove zoom, fireworks)
function resetView() {
    const existingBreakout = document.querySelector('.breakout-frame');
    if (existingBreakout) existingBreakout.remove();

    const active = document.querySelector('.frame.active');
    if (active) active.classList.remove('active');

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fireworks = [];
    particles = [];
    gameState = 'IDLE';
}

function toggleGameState() {
    if (gameState === 'SPINNING') {
        gameState = 'STOPPING';
    } else if (gameState === 'STOPPED') {
        // User wants to acknowledge the win and reset
        resetView();
    } else if (gameState === 'IDLE') {
        // Start spinning from fresh state
        startSpin();
    }
}

function startSpin() {
    resetView(); // ensure clean state

    const winAudio = new Audio('cheer.mp3');
    winAudio.volume = 0.5;

    gameState = 'SPINNING';
    speed = MAX_SPEED;

    cancelAnimationFrame(animationId);
    gameLoop();
}

// NEW: Highlight frame by exact frame index and asset index
// This ensures the exact frame under the arrow is the winner
function highlightFrameByIndex(frameIndex, assetIndex) {
    const targetFrame = frames[frameIndex];
    const winnerAsset = currentAssets[assetIndex];

    // Store winner info for elimination
    lastWinnerInfo = {
        assetIndex: assetIndex,
        asset: winnerAsset,
        assetKey: winnerAsset.id || `demo-${winnerAsset.index}`
    };

    if (targetFrame) {
        targetFrame.classList.add('active');
        createBreakoutFrame(targetFrame);
        launchFireworks();
        showWinnerActions(); // Show action buttons

        // Try play audio
        const winAudio = new Audio('cheer.mp3');
        winAudio.volume = 0.5;
        winAudio.play().catch(e => { });
    }
}

function highlightFrame(rawIndex) {
    // Chỉ cần modulo với số assets thực tế để tìm đúng người thắng
    const assetIndex = rawIndex % currentAssets.length;
    // Frame index dùng để tìm DOM element tương ứng
    const actualIndex = rawIndex % frames.length;
    const targetFrame = frames[actualIndex];
    const winnerAsset = currentAssets[assetIndex];

    // Store winner info for elimination
    lastWinnerInfo = {
        assetIndex: assetIndex,
        asset: winnerAsset,
        assetKey: winnerAsset.id || `demo-${winnerAsset.index}`
    };

    if (targetFrame) {
        targetFrame.classList.add('active');
        createBreakoutFrame(targetFrame);
        launchFireworks();
        showWinnerActions(); // Show action buttons

        // Try play audio
        const winAudio = new Audio('cheer.mp3');
        winAudio.volume = 0.5;
        winAudio.play().catch(e => { });
    }
}

// Show action buttons after winner is selected
function showWinnerActions() {
    // Remove existing if any
    const existing = document.querySelector('.winner-actions');
    if (existing) existing.remove();

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'winner-actions';
    actionsDiv.innerHTML = `
        <button class="btn-continue" onclick="continueGame()">🔄 Tiếp tục</button>
        <button class="btn-eliminate" onclick="eliminateWinner()">❌ Loại & Quay tiếp</button>
    `;
    document.body.appendChild(actionsDiv);
}

// Hide action buttons
function hideWinnerActions() {
    const existing = document.querySelector('.winner-actions');
    if (existing) existing.remove();
}

// Continue game - just reset view
window.continueGame = function () {
    hideWinnerActions();
    resetView();
};

// Eliminate winner and continue spinning
window.eliminateWinner = function () {
    if (lastWinnerInfo) {
        eliminatedPlayers.add(lastWinnerInfo.assetKey);
        console.log(`🚫 Loại người chơi: ${lastWinnerInfo.assetKey}`);
        console.log(`📊 Còn lại: ${currentAssets.length - 1} người chơi`);
    }
    hideWinnerActions();
    resetView();

    // Reload assets to filter out eliminated player
    const currentFolder = document.getElementById('folderSelect').value;
    loadGameAssets(currentFolder).then(() => {
        // Auto start spin after reload
        setTimeout(() => startSpin(), 300);
    });
};

function createBreakoutFrame(targetElement) {
    const clone = targetElement.cloneNode(true);
    clone.className = 'breakout-frame';
    clone.classList.remove('active', 'clone', 'frame');

    const viewportRect = document.querySelector('.film-strip-viewport').getBoundingClientRect();
    const viewportCenterY = viewportRect.top + viewportRect.height / 2;

    clone.style.left = (window.innerWidth / 2) + 'px';
    clone.style.top = viewportCenterY + 'px';
    clone.style.width = FRAME_WIDTH + 'px';
    clone.style.height = FRAME_WIDTH + 'px';

    document.body.appendChild(clone);
}

// ... Fireworks Logic (Standard) ...
function launchFireworks() {
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const x = Math.random() * canvas.width;
            fireworks.push(new Firework(x, canvas.height));
        }, i * 300);
    }
    animateFireworks();
}

function animateFireworks() {
    if (gameState === 'SPINNING' || gameState === 'IDLE') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    requestAnimationFrame(animateFireworks);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = fireworks.length - 1; i >= 0; i--) {
        fireworks[i].update();
        fireworks[i].draw();
        if (fireworks[i].done) {
            // createParticles(fireworks[i].x, fireworks[i].y, fireworks[i].color);
            fireworks.splice(i, 1);
        }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].alpha <= 0) particles.splice(i, 1);
    }
}

class Firework {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.targetY = canvas.height * 0.2 + Math.random() * (canvas.height * 0.5);
        this.speed = 10 + Math.random() * 5;
        this.angle = -Math.PI / 2 + (Math.random() * 0.2 - 0.1);
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.hue = Math.floor(Math.random() * 360);
        this.color = `hsl(${this.hue}, 100%, 50%)`;
        this.done = false;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.vy += 0.1;
        if (this.vy >= 0 || this.y <= this.targetY) this.done = true;
    }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.alpha = 1; this.color = color;
        this.decay = 0.01 + Math.random() * 0.02;
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.vy += 0.1;
        this.alpha -= this.decay;
    }
    draw() {
        ctx.save(); ctx.globalAlpha = this.alpha;
        ctx.beginPath(); ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.restore();
    }
}

// ==========================================
// 3. UI & Management Logic
// ==========================================

// Global Keys
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.getElementById('manageModal').classList.contains('hidden')) {
        toggleGameState();
    }
});

// Click to Toggle (UX improvement)
document.querySelector('.film-strip-viewport').addEventListener('click', () => {
    if (document.getElementById('manageModal').classList.contains('hidden')) {
        toggleGameState();
    }
});

// Dropdown change
document.getElementById('folderSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    localStorage.setItem('selectedFolder', val);
    loadGameAssets(val);
});

// Managers
const manageModal = document.getElementById('manageModal');
const folderList = document.getElementById('folderList');
const imageGrid = document.getElementById('imageGrid');
let activeManageFolderId = null;

// Open/Close Modal
document.getElementById('btnManage').addEventListener('click', () => {
    manageModal.classList.remove('hidden');
    renderFolderList();
});
document.getElementById('btnCloseModal').addEventListener('click', () => manageModal.classList.add('hidden'));

// --- Folder Logic ---

document.getElementById('btnNewFolder').addEventListener('click', async () => {
    const name = prompt("Enter folder name:");
    if (name) {
        await db.createFolder(name);
        renderFolderList();
    }
});

async function renderFolderList() {
    folderList.innerHTML = '';
    const folders = await db.getFolders();

    folders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'folder-item';
        li.innerHTML = `<span>${folder.name}</span> <span style="font-size:0.8rem; color:#666;">✎</span>`;
        li.onclick = () => selectManageFolder(folder.id, li);
        folderList.appendChild(li);
    });

    // Refresh Dropdown too
    loadFolders();
}

async function loadFolders() {
    const select = document.getElementById('folderSelect');
    const current = select.value;
    select.innerHTML = '<option value="demo">Demo (Faces)</option>';

    const folders = await db.getFolders();
    folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        select.appendChild(opt);
    });

    if (current && Array.from(select.options).some(o => o.value === current)) {
        select.value = current;
    }
}

async function selectManageFolder(id, liElement) {
    document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
    liElement.classList.add('active');

    activeManageFolderId = id;

    const folders = await db.getFolders();
    const folder = folders.find(f => f.id === id);
    if (folder) {
        document.getElementById('currentFolderName').textContent = folder.name;
        document.getElementById('folderActions').style.display = 'flex';
        renderImageGrid(id);
    }
}

document.getElementById('btnDeleteFolder').addEventListener('click', async () => {
    if (!activeManageFolderId) return;

    const confirmed = await showConfirm("Xóa folder này và TẤT CẢ hình ảnh trong đó?");
    if (confirmed) {
        const deletingFolderId = activeManageFolderId; // Save before nullifying

        try {
            await db.deleteFolder(deletingFolderId);
            activeManageFolderId = null;
            document.getElementById('folderActions').style.display = 'none';
            document.getElementById('currentFolderName').textContent = 'Select a Folder';
            renderFolderList();
            renderImageGrid(null); // Clear grid

            // Reset game if using deleted folder
            if (document.getElementById('folderSelect').value === deletingFolderId) {
                document.getElementById('folderSelect').value = 'demo';
                loadGameAssets('demo');
            }
        } catch (error) {
            console.error('Delete folder error:', error);
            alert('Lỗi khi xóa folder!');
        }
    }
});

// --- Image Processing with Web Worker ---

// Initialize Web Worker
let imageWorker = null;
let workerSupported = false;

try {
    imageWorker = new Worker('imageWorker.js');
    workerSupported = true;
    console.log('✅ Image Worker initialized');
} catch (e) {
    console.warn('⚠️ Web Worker not available, falling back to main thread');
}

// Check if file is HEIC format
function isHEIC(file) {
    const name = file.name.toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif') ||
        file.type === 'image/heic' || file.type === 'image/heif';
}

// Convert HEIC to JPEG using heic2any library
async function convertHEIC(file) {
    if (typeof heic2any === 'undefined') {
        throw new Error('HEIC format not supported. Please convert to JPEG first.');
    }

    const blob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
    });

    return new File([blob], file.name.replace(/\.heic?$/i, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now()
    });
}

// Resize image using Web Worker (non-blocking)
async function resizeImageWithWorker(file, maxSize = 600, quality = 0.85) {
    return new Promise(async (resolve, reject) => {
        const id = Math.random().toString(36).substr(2, 9);

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        const handleMessage = (e) => {
            if (e.data.id !== id) return;

            imageWorker.removeEventListener('message', handleMessage);

            if (e.data.success) {
                const blob = new Blob([e.data.data], { type: 'image/jpeg' });
                const resizedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                resolve({
                    file: resizedFile,
                    originalSize: e.data.originalSize,
                    newSize: e.data.newSize
                });
            } else {
                reject(new Error(e.data.error));
            }
        };

        imageWorker.addEventListener('message', handleMessage);

        // Transfer ArrayBuffer to worker (zero-copy)
        imageWorker.postMessage({
            imageData: arrayBuffer,
            maxSize,
            quality,
            id
        }, [arrayBuffer]);
    });
}

// Fallback: Resize on main thread
async function resizeImageMainThread(file, maxSize = 600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        img.onload = () => {
            let { width, height } = img;

            // Calculate new dimensions while maintaining aspect ratio
            if (width > height) {
                if (width > maxSize) {
                    height = Math.round((height * maxSize) / width);
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width = Math.round((width * maxSize) / height);
                    height = maxSize;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // Draw resized image
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const resizedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve({
                            file: resizedFile,
                            originalSize: file.size,
                            newSize: blob.size
                        });
                    } else {
                        reject(new Error('Failed to resize image'));
                    }
                },
                'image/jpeg',
                quality
            );

            URL.revokeObjectURL(img.src);
        };

        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image'));
        };
        img.src = URL.createObjectURL(file);
    });
}

// Main resize function - tries Worker first, falls back to main thread
async function resizeImage(file, maxSize = 600, quality = 0.85) {
    // Handle HEIC conversion first
    let processedFile = file;
    if (isHEIC(file)) {
        console.log('🔄 Converting HEIC to JPEG...');
        try {
            processedFile = await convertHEIC(file);
            console.log('✅ HEIC conversion complete');
        } catch (e) {
            console.error('❌ HEIC conversion failed:', e);
            throw e;
        }
    }

    // Try Web Worker first
    if (workerSupported && imageWorker) {
        try {
            const result = await resizeImageWithWorker(processedFile, maxSize, quality);
            return result.file;
        } catch (e) {
            console.warn('Worker failed, falling back to main thread:', e);
        }
    }

    // Fallback to main thread
    const result = await resizeImageMainThread(processedFile, maxSize, quality);
    return result.file;
}

document.getElementById('btnUpload').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

// Progress bar helper functions
function showProgress(current, total, filename) {
    const progress = document.getElementById('uploadProgress');
    const label = document.getElementById('progressLabel');
    const percent = document.getElementById('progressPercent');
    const fill = document.getElementById('progressFill');

    progress.classList.remove('hidden');

    const pct = Math.round((current / total) * 100);
    label.textContent = `Đang xử lý: ${filename}`;
    percent.textContent = `${current}/${total} (${pct}%)`;
    fill.style.width = `${pct}%`;
}

function hideProgress() {
    const progress = document.getElementById('uploadProgress');
    progress.classList.add('hidden');
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    if (!activeManageFolderId) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Show loading indicator
    const uploadBtn = document.getElementById('btnUpload');
    const originalText = uploadBtn.textContent;
    uploadBtn.textContent = '⏳ Đang xử lý...';
    uploadBtn.disabled = true;

    try {
        let processed = 0;
        for (const file of files) {
            // Update progress
            showProgress(processed + 1, files.length, file.name);

            // Resize image before upload
            const resizedFile = await resizeImage(file, 600, 0.85);
            const ratio = ((1 - resizedFile.size / file.size) * 100).toFixed(0);
            console.log(`✅ ${file.name}: ${(file.size / 1024).toFixed(1)}KB → ${(resizedFile.size / 1024).toFixed(1)}KB (-${ratio}%)`);

            await db.addImage(activeManageFolderId, resizedFile);
            processed++;
        }

        // Refresh grid
        renderImageGrid(activeManageFolderId);

        // Reload game assets if this is current folder
        if (document.getElementById('folderSelect').value === activeManageFolderId) {
            loadGameAssets(activeManageFolderId);
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Lỗi khi upload hình: ' + error.message);
    } finally {
        hideProgress();
        uploadBtn.textContent = originalText;
        uploadBtn.disabled = false;
        e.target.value = ''; // Reset
    }
});

async function renderImageGrid(folderId) {
    imageGrid.innerHTML = '';
    if (!folderId) {
        imageGrid.innerHTML = '<p class="empty-state">Select a folder to manage images.</p>';
        return;
    }

    const images = await db.getImages(folderId);

    if (images.length === 0) {
        imageGrid.innerHTML = '<p class="empty-state">No images yet. Upload some!</p>';
        return;
    }

    images.forEach(img => {
        const div = document.createElement('div');
        div.className = 'grid-item';

        div.innerHTML = `
            <img src="${img.url}">
            <div class="delete-overlay" onclick="removeImage('${img.id}')">
                <span class="delete-icon">🗑</span>
            </div>
        `;
        imageGrid.appendChild(div);
    });
}

window.removeImage = async function (imgId) {
    if (!confirm("Delete this image?")) return;
    await db.deleteImage(imgId);
    renderImageGrid(activeManageFolderId);

    // Reload game assets if necessary
    if (document.getElementById('folderSelect').value === activeManageFolderId) {
        loadGameAssets(activeManageFolderId);
    }
};

// Start
init();

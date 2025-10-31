// Ultimate Stopwatch - State & Data Management
const AppState = {
    currentView: 'home',
    currentFolder: null,
    currentResult: null,
    theme: localStorage.getItem('as_theme') || 'dark',
    themePalette_dark: localStorage.getItem('as_themePalette_dark') || 'default',
    themePalette_light: localStorage.getItem('as_themePalette_light') || 'light_default',
    customColors_dark: JSON.parse(localStorage.getItem('as_customColors_dark') || 'null'),
    customColors_light: JSON.parse(localStorage.getItem('as_customColors_light') || 'null'),
    currency: localStorage.getItem('as_currency') || '€',
    units: localStorage.getItem('as_units') || 'metric',
    preselectedFolder: null,
    remeasureResultId: null,
    display: {
        timeMode: localStorage.getItem('as_timeMode') || 'hms',
        showHundredths: JSON.parse(localStorage.getItem('as_showHundredths') || 'true')
    },
    stopwatch: {
        isRunning: false,
        isPaused: false,
        startTime: null,
        pausedTime: 0,
        elapsedTime: 0,
        laps: [],
        intervalId: null
    }
};

const DataManager = {
    getFolders: () => JSON.parse(localStorage.getItem('as_folders') || '[]'),
    saveFolders: (folders) => localStorage.setItem('as_folders', JSON.stringify(folders)),
    getResults: () => JSON.parse(localStorage.getItem('as_results') || '[]'),
    saveResults(results) {
        try {
            localStorage.setItem('as_results', JSON.stringify(results));
            return true;
        } catch (e) {
            alert('Saving failed: storage is full or data too large. Consider deleting older results or images.');
            return false;
        }
    },
    
    createFolder(name, parentId = null) {
        const folders = this.getFolders();
        const newFolder = { id: Date.now().toString(), name, parentId, createdAt: new Date().toISOString() };
        folders.push(newFolder);
        this.saveFolders(folders);
        return newFolder;
    },
    
    deleteFolder(folderId) {
        this.saveFolders(this.getFolders().filter(f => f.id !== folderId));
        this.saveResults(this.getResults().filter(r => r.folderId !== folderId));
    },
    
    setFoldersOrder(orderedIds) {
        const folders = this.getFolders();
        orderedIds.forEach((id, index) => {
            const folder = folders.find(f => f.id === id);
            if (folder) folder.position = index;
        });
        this.saveFolders(folders);
    },
    
    getFolderResults: (folderId) => {
        const list = DataManager.getResults().filter(r => r.folderId === folderId);
        return list.sort((a,b) => {
            const pa = (a.position ?? a.createdAt ?? 0);
            const pb = (b.position ?? b.createdAt ?? 0);
            return (typeof pa === 'string' ? new Date(pa).getTime() : pa) - (typeof pb === 'string' ? new Date(pb).getTime() : pb);
        });
    },
    
    saveResult(result) {
        const results = this.getResults();
        const nextPos = results.filter(r=>r.folderId===result.folderId).length;
        results.push({ position: Date.now(), ...result });
        this.saveResults(results);
        return result;
    },
    
    deleteResult(resultId) {
        this.saveResults(this.getResults().filter(r => r.id !== resultId));
    },
    
    updateResult(resultId, updates) {
        const results = this.getResults();
        const index = results.findIndex(r => r.id === resultId);
        if (index !== -1) {
            results[index] = { ...results[index], ...updates };
            this.saveResults(results);
        }
    },

    setResultsOrder(folderId, orderedIds) {
        const results = this.getResults();
        const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
        results.forEach(r => {
            if (r.folderId === folderId && orderMap.has(r.id)) {
                r.position = orderMap.get(r.id);
            }
        });
        this.saveResults(results);
    }
};

const StopwatchManager = {
    start() {
        if (!AppState.stopwatch.isRunning) {
            AppState.stopwatch.startTime = Date.now() - AppState.stopwatch.elapsedTime;
            AppState.stopwatch.isRunning = true;
            AppState.stopwatch.isPaused = false;
            this.startTimer();
        }
    },
    
    pause() {
        if (AppState.stopwatch.isRunning && !AppState.stopwatch.isPaused) {
            AppState.stopwatch.isPaused = true;
            AppState.stopwatch.pausedTime = AppState.stopwatch.elapsedTime;
            this.stopTimer();
        }
    },
    
    resume() {
        if (AppState.stopwatch.isPaused) {
            AppState.stopwatch.startTime = Date.now() - AppState.stopwatch.elapsedTime;
            AppState.stopwatch.isPaused = false;
            this.startTimer();
        }
    },
    
    stop(suppressSave = false) {
        AppState.stopwatch.isRunning = false;
        AppState.stopwatch.isPaused = false;
        this.stopTimer();
        if (AppState.stopwatch.laps.length > 0 && !suppressSave) {
            UI.showSaveDialog();
        }
    },
    
    reset(suppressSave = false) {
        this.stop(suppressSave);
        AppState.stopwatch.startTime = null;
        AppState.stopwatch.pausedTime = 0;
        AppState.stopwatch.elapsedTime = 0;
        AppState.stopwatch.laps = [];
        UI.renderStopwatch();
    },
    
    recordLap() {
        if (AppState.stopwatch.isRunning && !AppState.stopwatch.isPaused) {
            const currentTime = AppState.stopwatch.elapsedTime;
            const previousTime = AppState.stopwatch.laps.length > 0 
                ? AppState.stopwatch.laps[AppState.stopwatch.laps.length - 1].cumulative : 0;
            
            AppState.stopwatch.laps.push({
                number: AppState.stopwatch.laps.length + 1,
                time: currentTime - previousTime,
                cumulative: currentTime
            });
            
            UI.renderStopwatch();
        }
    },
    
    startTimer() {
        AppState.stopwatch.intervalId = setInterval(() => {
            AppState.stopwatch.elapsedTime = Date.now() - AppState.stopwatch.startTime;
            UI.updateTimeDisplay();
        }, 10);
    },
    
    stopTimer() {
        if (AppState.stopwatch.intervalId) {
            clearInterval(AppState.stopwatch.intervalId);
            AppState.stopwatch.intervalId = null;
        }
    }
};

const Utils = {
    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor((ms % 1000) / 10);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    },
    
    formatTimeCustom(ms, mode = 'hms', showHundredths = true) {
        const totalSeconds = Math.floor(ms / 1000);
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds % 3600) / 60);
        let seconds = totalSeconds % 60;
        const hundredths = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
        if (mode === 'ms') {
            const totalMinutes = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            return `${totalMinutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}${showHundredths ? ('.' + hundredths) : ''}`;
        }
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}${showHundredths ? ('.' + hundredths) : ''}`;
    },
    
    parseTime(timeStr) {
        const parts = timeStr.split(':');
        if (parts.length !== 3) return 0;
        return (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])) * 1000;
    },
    
    calculateAverage: (laps) => laps.length === 0 ? 0 : laps.reduce((sum, lap) => sum + lap.time, 0) / laps.length,
    
    imageToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    async imageToDataURLCompressed(file, maxSize = 1024, quality = 0.8) {
        const dataUrl = await this.imageToDataURL(file);
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                const scale = Math.min(1, maxSize / Math.max(width, height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = dataUrl;
        });
    }
};

const UI = {
    init() {
        this.app = document.getElementById('app');
        this.applyTheme();
        this.setupEventListeners();
        this.setupGlobalInputHandlers();
        this.setupKeyboardShortcuts();
        this.renderHome();
    },
    
    setupGlobalInputHandlers() {
        // Global event delegation for auto-selecting inputs on focus
        document.body.addEventListener('focus', (e) => {
            if (e.target.matches('input[type="text"], input[type="number"], input[type="email"], input[type="tel"], textarea')) {
                // Use setTimeout to ensure selection happens after focus completes
                setTimeout(() => {
                    try {
                        e.target.select();
                    } catch (err) {
                        // Ignore selection errors on inputs that don't support it
                    }
                }, 10);
            }
        }, true); // Use capture phase
    },
    
    applyTheme() {
        // First, set or remove the dark-theme class
        if (AppState.theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
        
        // Get the palette for current theme mode
        const currentCustomColors = AppState.theme === 'dark' ? AppState.customColors_dark : AppState.customColors_light;
        const currentPalette = AppState.theme === 'dark' ? AppState.themePalette_dark : AppState.themePalette_light;
        
        // Apply saved custom palette or preset palette
        if (currentCustomColors) {
            this.applyThemePalette(currentCustomColors, true);
        } else if (currentPalette) {
            // Load and apply the saved palette (including default palettes)
            const palettes = {
                dark: [
                    { name: 'Default Dark', id: 'default', colors: { primary: '#1a1a1a', secondary: '#2d2d2d', tertiary: '#3d3d3d', text: '#f8f9fa', textSec: '#adb5bd', accent: '#60a5fa', border: '#495057' }},
                    { name: 'Midnight Blue', id: 'midnight', colors: { primary: '#0f1419', secondary: '#1a2332', tertiary: '#253447', text: '#e6f1ff', textSec: '#8892b0', accent: '#64ffda', border: '#1e3a5f' }},
                    { name: 'Purple Dream', id: 'purple', colors: { primary: '#1a0f2e', secondary: '#2b1e4a', tertiary: '#3d2b5f', text: '#e9d5ff', textSec: '#c4b5fd', accent: '#a78bfa', border: '#4c1d95' }},
                    { name: 'Forest Night', id: 'forest', colors: { primary: '#0a1a0f', secondary: '#1a2e1f', tertiary: '#2a3f2f', text: '#d5f5e3', textSec: '#82c99d', accent: '#52c41a', border: '#1f3a28' }}
                ],
                light: [
                    { name: 'Default Light', id: 'light_default', colors: { primary: '#ffffff', secondary: '#f8f9fa', tertiary: '#e9ecef', text: '#212529', textSec: '#6c757d', accent: '#3b82f6', border: '#dee2e6' }},
                    { name: 'Warm Beige', id: 'warm', colors: { primary: '#faf8f3', secondary: '#f5f0e8', tertiary: '#ede7dc', text: '#3e3022', textSec: '#73644e', accent: '#d97706', border: '#d4c5b0' }},
                    { name: 'Cool Mint', id: 'mint', colors: { primary: '#f0fdf9', secondary: '#e6f9f3', tertiary: '#d1f5e8', text: '#064e3b', textSec: '#047857', accent: '#10b981', border: '#a7f3d0' }},
                    { name: 'Ocean Breeze', id: 'ocean', colors: { primary: '#f0f9ff', secondary: '#e0f2fe', tertiary: '#bae6fd', text: '#0c4a6e', textSec: '#0369a1', accent: '#0284c7', border: '#7dd3fc' }}
                ]
            };
            const allPalettes = [...palettes.dark, ...palettes.light];
            const palette = allPalettes.find(p => p.id === currentPalette);
            if (palette) {
                this.applyThemePalette(palette.colors);
            } else {
                // Palette not found, clear to use CSS defaults
                this.clearThemePalette();
            }
        } else {
            // No palette set, use CSS defaults
            this.clearThemePalette();
        }
    },
    
    toggleTheme() {
        AppState.theme = AppState.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('as_theme', AppState.theme);
        this.applyTheme();
    },

    getSettingsIcon() {
        return `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.21 17l.06-.06A1.65 1.65 0 0 0 4.6 15 1.65 1.65 0 0 0 3.09 14H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 21 7.04l-.06.06A1.65 1.65 0 0 0 20.4 9c.65.29 1.11.93 1.18 1.67H21a2 2 0 1 1 0 4h-.09c-.27.31-.65.27-1.51.33z"/>
            </svg>
        `;
    },

    setupEventListeners() {
        // Theme toggle long-press handler
        let themeTogglePressTimer = null;
        let longPressTriggered = false;
        let recentTouchToggle = false; // suppress subsequent click after touch
        
        const startLongPress = (e) => {
            const btn = e.target.closest('#themeToggle');
            if (btn) {
                longPressTriggered = false;
                themeTogglePressTimer = setTimeout(() => {
                    longPressTriggered = true;
                    this.showThemeCustomization();
                }, 1000);
            }
        };
        
        const cancelLongPress = (e) => {
            if (themeTogglePressTimer) {
                clearTimeout(themeTogglePressTimer);
                themeTogglePressTimer = null;
            }
            // Handle short tap on touch devices
            const btn = e.target.closest && e.target.closest('#themeToggle');
            if (btn && !longPressTriggered && (e.type === 'touchend' || e.type === 'touchcancel')) {
                e.preventDefault();
                this.toggleTheme();
                recentTouchToggle = true;
                setTimeout(() => { recentTouchToggle = false; }, 400);
            }
            if (e.type !== 'mousedown') {
                longPressTriggered = false;
            }
        };
        
        this.app.addEventListener('mousedown', startLongPress);
        this.app.addEventListener('mouseup', cancelLongPress);
        this.app.addEventListener('mouseleave', cancelLongPress);
        this.app.addEventListener('touchstart', startLongPress, { passive: false });
        this.app.addEventListener('touchend', cancelLongPress);
        this.app.addEventListener('touchcancel', cancelLongPress);
        
        this.app.addEventListener('click', (e) => {
            // Header actions
            if (e.target.closest('#themeToggle')) { 
                // If a touch just handled the toggle, ignore the synthetic click
                if (recentTouchToggle) {
                    recentTouchToggle = false;
                    longPressTriggered = false;
                    return;
                }
                if (!longPressTriggered) {
                    this.toggleTheme();
                }
                longPressTriggered = false;
                return;
            }
            if (e.target.closest('#backBtn')) { this.handleBackClick(); return; }
            if (e.target.closest('#settingsBtn')) { this.showSettingsDialog(); return; }

            // FAB actions
            if (e.target.closest('#newFolderBtn')) {
                const parentId = (AppState.currentView === 'folder') ? AppState.currentFolder : null;
                this.showNewFolderDialog(parentId);
                return;
            }
            if (e.target.closest('#startStopwatchBtn')) {
                AppState.preselectedFolder = (AppState.currentView === 'folder') ? AppState.currentFolder : null;
                this.renderStopwatch();
                return;
            }

            // Folder menu FIRST to avoid being overridden by parent card clicks
            const folderMenuBtn = e.target.closest('.folder-menu');
            if (folderMenuBtn) {
                e.stopPropagation();
                this.showFolderMenu(folderMenuBtn, folderMenuBtn.dataset.folderId);
                return;
            }

            const resultDeleteBtn = e.target.closest('.result-delete');
            if (resultDeleteBtn) {
                e.stopPropagation();
                if (confirm('Delete this result?')) {
                    DataManager.deleteResult(resultDeleteBtn.dataset.resultId);
                    this.renderFolderView(AppState.currentFolder);
                }
                return;
            }

            // Result item kebab menu
            const menuBtn = e.target.closest('.result-menu');
            if (menuBtn) {
                e.stopPropagation();
                this.showResultMenu(menuBtn, menuBtn.dataset.resultId);
                return;
            }

            // Context menu delete action
            const menuAction = e.target.closest('.menu-item');
            if (menuAction) {
                const action = menuAction.dataset.action;
                const rid = menuAction.dataset.resultId;
                if (action === 'delete' && rid) {
                    if (confirm('Delete this result?')) {
                        DataManager.deleteResult(rid);
                        this.closeResultMenu();
                        this.renderFolderView(AppState.currentFolder);
                    }
                }
                return;
            }

            // Navigation actions AFTER deletes
            const folderCard = e.target.closest('.folder-card');
            if (folderCard) { this.renderFolderView(folderCard.dataset.folderId); return; }

            const resultItem = e.target.closest('.result-item');
            if (resultItem) { this.renderResultDetail(resultItem.dataset.resultId); return; }

            // Result detail actions
            if (e.target.closest('#calculateBtn')) { 
                const current = DataManager.getResults().find(r => r.id === AppState.currentResult);
                if (current) this.showCalculateModal(current);
                return; 
            }

            // Stopwatch controls
            if (e.target.closest('#startBtn')) { StopwatchManager.start(); this.renderStopwatch(); return; }
            if (e.target.closest('#pauseBtn')) { StopwatchManager.pause(); this.renderStopwatch(); return; }
            if (e.target.closest('#resumeBtn')) { StopwatchManager.resume(); this.renderStopwatch(); return; }
            if (e.target.closest('#stopBtn')) { StopwatchManager.stop(); return; }
            if (e.target.closest('#lapBtn')) { StopwatchManager.recordLap(); return; }
            if (e.target.closest('#resetBtn')) { StopwatchManager.reset(true); return; }
        });

        // Drag & Drop for results
        this.app.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.result-item');
            if (item) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.dataset.resultId);
                item.classList.add('dragging');
            }
        });
        this.app.addEventListener('dragend', (e) => {
            const item = e.target.closest('.result-item');
            if (item) item.classList.remove('dragging');
        });
        this.app.addEventListener('dragover', (e) => {
            const list = (e.target.closest && e.target.closest('.results-list')) || this.app.querySelector('.results-list');
            if (!list) return;
            e.preventDefault();
            const dragging = list.querySelector('.result-item.dragging');
            if (!dragging) return;
            const after = UI.getDragAfterElement(list, e.clientY);
            if (after == null) list.appendChild(dragging); else list.insertBefore(dragging, after);
        });
        this.app.addEventListener('drop', (e) => {
            const list = (e.target.closest && e.target.closest('.results-list')) || this.app.querySelector('.results-list');
            if (!list) return;
            e.preventDefault();
            const ids = Array.from(list.querySelectorAll('.result-item')).map(el => el.dataset.resultId);
            try {
                DataManager.setResultsOrder(AppState.currentFolder, ids);
            } catch (err) {
                console.error('Failed to persist order', err);
            }
            this.renderFolderView(AppState.currentFolder);
        });
        
        // Drag & Drop for folders
        this.app.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.folder-card');
            if (item) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.dataset.folderId);
                item.classList.add('dragging');
            }
        });
        this.app.addEventListener('dragend', (e) => {
            const item = e.target.closest('.folder-card');
            if (item) item.classList.remove('dragging');
        });
        this.app.addEventListener('dragover', (e) => {
            const grid = (e.target.closest && e.target.closest('.folders-grid')) || this.app.querySelector('.folders-grid');
            if (!grid) return;
            e.preventDefault();
            const dragging = grid.querySelector('.folder-card.dragging');
            if (!dragging) return;
            const after = UI.getDragAfterElementGrid(grid, e.clientX, e.clientY);
            if (after == null) grid.appendChild(dragging); else grid.insertBefore(dragging, after);
        });
        this.app.addEventListener('drop', (e) => {
            const grid = (e.target.closest && e.target.closest('.folders-grid')) || this.app.querySelector('.folders-grid');
            if (!grid) return;
            e.preventDefault();
            const ids = Array.from(grid.querySelectorAll('.folder-card')).map(el => el.dataset.folderId);
            try {
                DataManager.setFoldersOrder(ids);
            } catch (err) {
                console.error('Failed to persist folder order', err);
            }
            this.renderHome();
        });
    },

    handleBackClick() {
        switch (AppState.currentView) {
            case 'stopwatch':
                if (AppState.stopwatch.isRunning && !confirm('Stop the current session?')) return;
                StopwatchManager.reset();
                this.renderHome();
                break;
            case 'folder':
                this.renderHome();
                break;
            case 'result':
                this.renderFolderView(AppState.currentFolder);
                break;
        }
    },
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (AppState.currentView === 'stopwatch') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!AppState.stopwatch.isRunning) {
                        StopwatchManager.start();
                    } else if (!AppState.stopwatch.isPaused) {
                        StopwatchManager.pause();
                    } else {
                        StopwatchManager.resume();
                    }
                    this.renderStopwatch();
                } else if (e.key === ' ') {
                    e.preventDefault();
                    StopwatchManager.recordLap();
                }
            }
        });
    },
    
    getThemeIcon() {
        return AppState.theme === 'light' ? `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
        ` : `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
        `;
    },
    
    renderHome() {
        AppState.currentView = 'home';
        const folders = DataManager.getFolders().sort((a,b) => (a.position ?? 999999) - (b.position ?? 999999));
        
        this.app.innerHTML = `
            <header id="header">
                <div style="width: 40px;"></div>
                <h1>Ultimate Stopwatch</h1>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="settingsBtn" class="icon-btn" title="Settings">${this.getSettingsIcon()}</button>
                    <button id="themeToggle" class="icon-btn">${this.getThemeIcon()}</button>
                </div>
            </header>
            <main>
                ${folders.length === 0 ? `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                        </svg>
                        <p>No projects yet.<br>Create one to get started!</p>
                    </div>
                ` : `
                    <div class="folders-grid">
                        ${folders.map(folder => {
                            const results = DataManager.getFolderResults(folder.id);
                            const folderColor = folder.color || 'var(--bg-secondary)';
                            return `
                                <div class="folder-card" data-folder-id="${folder.id}" draggable="true" style="background: ${folderColor};">
                                    <button class="folder-menu" data-folder-id="${folder.id}">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <circle cx="12" cy="5" r="1.5"/>
                                            <circle cx="12" cy="12" r="1.5"/>
                                            <circle cx="12" cy="19" r="1.5"/>
                                        </svg>
                                    </button>
                                    <h3>${folder.name}</h3>
                                    <div class="folder-count">${results.length} result${results.length !== 1 ? 's' : ''}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </main>
            <div class="fab-container">
                <button class="fab" id="newFolderBtn" title="New Project">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                        <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
                    </svg>
                </button>
                <button class="fab large" id="startStopwatchBtn" title="Start Stopwatch">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                </button>
            </div>
        `;
    },
    
    updateTimeDisplay() {
        const display = document.getElementById('timeDisplay');
        if (display) display.textContent = Utils.formatTime(AppState.stopwatch.elapsedTime);
    },
    
    renderStopwatch() {
        AppState.currentView = 'stopwatch';
        const { isRunning, isPaused, laps } = AppState.stopwatch;
        
        this.app.innerHTML = `
            <header>
                <button id="backBtn" class="icon-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1>Stopwatch</h1>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="settingsBtn" class="icon-btn" title="Settings">${this.getSettingsIcon()}</button>
                </div>
            </header>
            <main>
                <div class="stopwatch-container">
                    <div class="time-display" id="timeDisplay">${Utils.formatTime(AppState.stopwatch.elapsedTime)}</div>
                    <div class="controls">
                        ${!isRunning ? `
                            <button class="btn btn-primary control-btn" id="startBtn">Start</button>
                        ` : isPaused ? `
                            <div class="controls-stack">
                                <button class="btn btn-success control-btn btn-next-big" id="resumeBtn">Resume</button>
                                <div class="controls-row">
                                    <button class="btn btn-secondary control-btn" id="resetBtn">Reset</button>
                                </div>
                            </div>
                        ` : `
                            <div class="controls-stack">
                                <button class="btn btn-primary control-btn btn-next-big" id="lapBtn">Next</button>
                                <div class="controls-row">
                                    <button class="btn control-btn" id="pauseBtn" style="background: var(--warning); color: white;">Pause</button>
                                    <button class="btn btn-danger control-btn" id="stopBtn">Stop</button>
                                </div>
                            </div>
                        `}
                        ${(!isRunning && laps.length > 0) ? `<button class="btn btn-danger control-btn" id="resetBtn">Reset</button>` : ''}
                    </div>
                    ${laps.length > 0 ? `
                        <div class="laps-container">
                            <div class="laps-header">
                                <span>Laps (${laps.length})</span>
                                <span>Avg: ${Utils.formatTime(Utils.calculateAverage(laps))}</span>
                            </div>
                            <div class="laps-list">
                                ${laps.slice().reverse().map(lap => `
                                    <div class="lap-item">
                                        <div class="lap-number">Lap ${lap.number}</div>
                                        <div class="lap-times">
                                            <div class="lap-time">${Utils.formatTime(lap.time)}</div>
                                            <div class="lap-cumulative">${Utils.formatTime(lap.cumulative)}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </main>
        `;
    },
    
    renderFolderView(folderId) {
        AppState.currentView = 'folder';
        AppState.currentFolder = folderId;
        const folder = DataManager.getFolders().find(f => f.id === folderId);
        if (!folder) {
            alert('Project not found. It may have been deleted.');
            this.renderHome();
            return;
        }
        const results = DataManager.getFolderResults(folderId);
        
        this.app.innerHTML = `
            <header>
                <button id="backBtn" class="icon-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1>${folder.name}</h1>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="settingsBtn" class="icon-btn" title="Settings">${this.getSettingsIcon()}</button>
                </div>
            </header>
            <main>
                ${results.length === 0 ? `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <p>No results yet.<br>Start timing to create one!</p>
                    </div>
                ` : `
                    <div class="results-list">
                        ${results.map(result => `
                            <div class="result-item" data-result-id="${result.id}" draggable="true">
                                ${result.image ? `
                                    <img class="result-thumb" src="${result.image}" alt="thumb">
                                ` : `
                                    <div class="result-thumb placeholder"></div>
                                `}
                                <div class="result-info">
                                    <h3>${result.name}</h3>
                                    <div class="result-meta">${result.laps.length} laps • ${Utils.formatTime(result.totalTime)}</div>
                                </div>
                                <button class="icon-btn result-menu" data-result-id="${result.id}" aria-label="More">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
                                    </svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `}
            </main>
            ${results.length === 0 ? `
                <div class="fab-container">
                    <button class="fab large" id="startStopwatchBtn" title="Start Stopwatch">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </button>
                </div>
            ` : ''}
        `;
    },
    
    renderResultDetail(resultId) {
        AppState.currentView = 'result';
        AppState.currentResult = resultId;
        const result = DataManager.getResults().find(r => r.id === resultId);
        if (!result) {
            // If result no longer exists, go back to current folder or home
            if (AppState.currentFolder) {
                this.renderFolderView(AppState.currentFolder);
            } else {
                this.renderHome();
            }
            return;
        }
        const avgLapTime = Utils.calculateAverage(result.laps);
        
        this.app.innerHTML = `
            <header>
                <button id="backBtn" class="icon-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1>${result.name}</h1>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="settingsBtn" class="icon-btn" title="Settings">${this.getSettingsIcon()}</button>
                </div>
            </header>
            <main>
                <div class="result-detail">
                    ${result.image ? `<img src="${result.image}" alt="Result image" class="result-image">` : ''}
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">Total Time</div>
                            <div class="stat-value">${Utils.formatTimeCustom(result.totalTime, AppState.display.timeMode, AppState.display.showHundredths)}</div>
                        </div>
                        <div class="stat-card stat-laps">
                            <div class="stat-label">Laps</div>
                            <div class="stat-value">${result.laps.length}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Avg Lap</div>
                            <div class="stat-value">${Utils.formatTimeCustom(avgLapTime, AppState.display.timeMode, AppState.display.showHundredths)}</div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" id="calculateBtn">Calculate</button>
                    <div class="laps-container">
                        <div class="laps-header">All Laps</div>
                        <div class="laps-list">
                            ${result.laps.map(lap => `
                                <div class="lap-item">
                                    <div class="lap-number">Lap ${lap.number}</div>
                                    <div class="lap-times">
                                        <div class="lap-time">${Utils.formatTime(lap.time)}</div>
                                        <div class="lap-cumulative">${Utils.formatTime(lap.cumulative)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </main>
        `;
        
            },
    
    showNewFolderDialog(parentId = null) {
        const modal = this.createModal('Create New Project', `
            <form id="newFolderForm">
                <div class="form-group">
                    <label class="form-label">Project Name</label>
                    <input type="text" class="form-input" id="folderNameInput" required autofocus>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" id="cancelBtn">Cancel</button>
                    <button type="submit" class="btn btn-primary">Create</button>
                </div>
            </form>
        `);
        
        modal.querySelector('#cancelBtn').addEventListener('click', () => modal.remove());
        modal.querySelector('#newFolderForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = modal.querySelector('#folderNameInput').value.trim();
            if (name) {
                DataManager.createFolder(name, parentId);
                modal.remove();
                if (parentId) this.renderFolderView(parentId); else this.renderHome();
            }
        });
        const input = modal.querySelector('#folderNameInput');
        if (input) { input.focus(); input.select(); }
    },
    
    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">${title}</div>
                ${content}
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        return modal;
    },
    
    showSaveDialog() {
        const folders = DataManager.getFolders();
        const isRemeasure = !!AppState.remeasureResultId;
        const existingResult = isRemeasure ? DataManager.getResults().find(r => r.id === AppState.remeasureResultId) : null;
        
        const modal = this.createModal(isRemeasure ? 'Update Result' : 'Save Result', `
            <form id="saveResultForm">
                <div class="form-group">
                    <label class="form-label">Result Name</label>
                    <input type="text" class="form-input" id="resultNameInput" required autofocus value="${existingResult ? existingResult.name : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Project</label>
                    <select class="form-select" id="folderSelect" required>
                        <option value="">Select project...</option>
                        ${folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                        <option value="__new__">+ Create New Project</option>
                    </select>
                </div>
                <div class="form-group hidden" id="newFolderGroup">
                    <label class="form-label">New Project Name</label>
                    <input type="text" class="form-input" id="newFolderInput">
                </div>
                <div class="form-group">
                    <label class="form-label">Attach Image (Optional)</label>
                    <div class="file-input-wrapper">
                        <label class="file-input-label">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                            </svg>
                            <span>Choose Image</span>
                            <input type="file" class="file-input" id="imageInput" accept="image/*">
                        </label>
                    </div>
                    <img id="imagePreview" class="image-preview hidden" alt="Preview">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" id="cancelSaveBtn">Cancel</button>
                    <button type="submit" class="btn btn-success">Save</button>
                </div>
            </form>
        `);
        
        const folderSelect = modal.querySelector('#folderSelect');
        const newFolderGroup = modal.querySelector('#newFolderGroup');
        const imageInput = modal.querySelector('#imageInput');
        const imagePreview = modal.querySelector('#imagePreview');

        // Preselect folder (either from remeasure or from preselectedFolder)
        const targetFolder = isRemeasure && existingResult ? existingResult.folderId : AppState.preselectedFolder;
        if (targetFolder) {
            const exists = Array.from(folderSelect.options).some(o => o.value === targetFolder);
            if (exists) {
                folderSelect.value = targetFolder;
                newFolderGroup.classList.add('hidden');
            }
        }

        folderSelect.addEventListener('change', () => {
            newFolderGroup.classList.toggle('hidden', folderSelect.value !== '__new__');
        });

        imageInput.addEventListener('change', async (e) => {
            if (e.target.files[0]) {
                const dataUrl = await Utils.imageToDataURLCompressed(e.target.files[0]);
                imagePreview.src = dataUrl;
                imagePreview.classList.remove('hidden');
            }
        });

        modal.querySelector('#cancelSaveBtn').addEventListener('click', () => {
            modal.remove();
            StopwatchManager.reset(true);
            this.renderStopwatch();
        });
        
        const nameInput = modal.querySelector('#resultNameInput');
        if (nameInput) { nameInput.focus(); nameInput.select(); }

        modal.querySelector('#saveResultForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            let folderId = folderSelect.value;
            
            if (folderId === '__new__') {
                const newFolderName = modal.querySelector('#newFolderInput').value.trim();
                if (!newFolderName) {
                    alert('Please enter a project name');
                    return;
                }
                const parentId = AppState.currentView === 'folder' ? AppState.currentFolder : null;
                folderId = DataManager.createFolder(newFolderName, parentId).id;
            }
            
            if (isRemeasure && existingResult) {
                // Update existing result
                DataManager.updateResult(existingResult.id, {
                    name: modal.querySelector('#resultNameInput').value.trim(),
                    folderId,
                    totalTime: AppState.stopwatch.elapsedTime,
                    laps: [...AppState.stopwatch.laps],
                    image: imagePreview.src && !imagePreview.classList.contains('hidden') ? imagePreview.src : existingResult.image
                });
                AppState.remeasureResultId = null;
                modal.remove();
                StopwatchManager.reset(true);
                this.renderResultDetail(existingResult.id);
            } else {
                // Create new result
                const result = {
                    id: Date.now().toString(),
                    name: modal.querySelector('#resultNameInput').value.trim(),
                    folderId,
                    totalTime: AppState.stopwatch.elapsedTime,
                    laps: [...AppState.stopwatch.laps],
                    image: imagePreview.src && !imagePreview.classList.contains('hidden') ? imagePreview.src : null,
                    createdAt: new Date().toISOString(),
                    hourlyWage: null
                };
                
                DataManager.saveResult(result);
                modal.remove();
                StopwatchManager.reset(true);
                this.renderHome();
            }
        });
    },
    
    showCalculateModal(result) {
        const avgLapTime = Utils.calculateAverage(result.laps);
        const avgSeconds = avgLapTime / 1000;
        
        const modal = this.createModal('Calculate', `
            <div class="calc-tabs">
                <button class="calc-tab active" data-tab="quantity">Quantity</button>
                <button class="calc-tab" data-tab="time">Time</button>
                <button class="calc-tab" data-tab="price">Price</button>
            </div>
            <div id="quantityPanel">
                <div class="form-group">
                    <label class="form-label">Number of Items</label>
                    <input type="number" inputmode="numeric" class="form-input" id="quantityInput" min="1" value="100">
                </div>
                <button class="btn btn-primary btn-block" id="calcQuantityBtn">Calculate</button>
                <div class="calc-result hidden" id="quantityResult">
                    <div class="calc-result-label">Estimated Total Time</div>
                    <div class="calc-result-value" id="quantityValue"></div>
                </div>
            </div>
            <div id="timePanel" class="hidden">
                <div class="form-group">
                    <label class="form-label">Duration</label>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="number" inputmode="numeric" class="form-input" id="hoursInput" min="0" max="23" placeholder="0" value="1" style="width:80px;" />
                        <span>h</span>
                        <input type="number" inputmode="numeric" class="form-input" id="minutesInput" min="0" max="59" placeholder="0" value="30" style="width:80px;" />
                        <span>m</span>
                        <input type="number" inputmode="numeric" class="form-input" id="secondsInput" min="0" max="59" placeholder="0" value="0" style="width:80px;" />
                        <span>s</span>
                        <div id="durationPreview" style="margin-left:auto;font-weight:600;"></div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block" id="calcTimeBtn">Calculate</button>
                <div class="calc-result hidden" id="timeResult">
                    <div class="calc-result-label">Estimated Quantity</div>
                    <div class="calc-result-value" id="timeValue"></div>
                </div>
            </div>
            <div id="pricePanel" class="hidden">
                <div class="form-group">
                    <label class="form-label">Hourly Wage (${AppState.currency})</label>
                    <input type="number" inputmode="decimal" class="form-input" id="wageInput" min="0" step="0.01" value="${result.hourlyWage || ''}">
                </div>
                <button class="btn btn-primary btn-block" id="calcPriceBtn">Calculate</button>
                <div class="calc-result hidden" id="priceResult">
                    <div class="calc-result-label">Price Per Piece</div>
                    <div class="calc-result-value" id="priceValue"></div>
                </div>
            </div>
            <div class="modal-actions mt-3">
                <button type="button" class="btn btn-secondary btn-block" id="closeCalcBtn">Close</button>
            </div>
        `);
        
        const tabs = modal.querySelectorAll('.calc-tab');
        const panels = { quantity: modal.querySelector('#quantityPanel'), time: modal.querySelector('#timePanel'), price: modal.querySelector('#pricePanel') };
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                Object.values(panels).forEach(p => p.classList.add('hidden'));
                panels[tab.dataset.tab].classList.remove('hidden');
            });
        });
        
        modal.querySelector('#calcQuantityBtn').addEventListener('click', () => {
            const quantity = parseInt(modal.querySelector('#quantityInput').value);
            const totalMs = quantity * avgLapTime;
            modal.querySelector('#quantityValue').textContent = Utils.formatTime(totalMs);
            modal.querySelector('#quantityResult').classList.remove('hidden');
        });
        
        const hoursEl = modal.querySelector('#hoursInput');
        const minutesEl = modal.querySelector('#minutesInput');
        const secondsEl = modal.querySelector('#secondsInput');
        const previewEl = modal.querySelector('#durationPreview');
        const clamp = (v, min, max) => isNaN(v) ? min : Math.min(max, Math.max(min, v));
        const updatePreview = () => {
            const h = clamp(parseInt(hoursEl.value || '0'), 0, 23);
            const m = clamp(parseInt(minutesEl.value || '0'), 0, 59);
            const s = clamp(parseInt(secondsEl.value || '0'), 0, 59);
            // reflect clamped values back to inputs
            hoursEl.value = h;
            minutesEl.value = m;
            secondsEl.value = s;
            const totalMs = h*3600000 + m*60000 + s*1000;
            previewEl.textContent = Utils.formatTime(totalMs);
            return totalMs;
        };
        [hoursEl, minutesEl, secondsEl].forEach(el => {
            el.addEventListener('input', updatePreview);
            el.addEventListener('focus', () => el.select());
        });
        updatePreview();

        modal.querySelector('#calcTimeBtn').addEventListener('click', () => {
            const totalMs = updatePreview();
            const quantity = Math.floor(totalMs / avgLapTime);
            modal.querySelector('#timeValue').textContent = quantity;
            modal.querySelector('#timeResult').classList.remove('hidden');
        });
        
        modal.querySelector('#calcPriceBtn').addEventListener('click', () => {
            const wage = parseFloat(modal.querySelector('#wageInput').value);
            if (wage) {
                const pricePerPiece = (wage / 3600) * avgSeconds;
                modal.querySelector('#priceValue').textContent = AppState.currency + ' ' + pricePerPiece.toFixed(4);
                modal.querySelector('#priceResult').classList.remove('hidden');
                DataManager.updateResult(result.id, { hourlyWage: wage });
            }
        });
        
        modal.querySelector('#closeCalcBtn').addEventListener('click', () => modal.remove());
    },

    showSettingsDialog() {
        const view = AppState.currentView;
        let body = '';
        if (view === 'home') {
            body = `
                <div class="form-group">
                    <label class="form-label">Units</label>
                    <select class="form-select" id="unitsSelect">
                        <option value="metric" ${AppState.units === 'metric' ? 'selected' : ''}>Metric (ms, s)</option>
                        <option value="imperial" ${AppState.units === 'imperial' ? 'selected' : ''}>Imperial</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Currency</label>
                    <select class="form-select" id="currencySelect">
                        <option value="€" ${AppState.currency === '€' ? 'selected' : ''}>Euro (€)</option>
                        <option value="$" ${AppState.currency === '$' ? 'selected' : ''}>US Dollar ($)</option>
                        <option value="£" ${AppState.currency === '£' ? 'selected' : ''}>Pound (£)</option>
                    </select>
                </div>
            `;
        } else if (view === 'folder') {
            body = `<p>Project settings for the current project.</p>`;
        } else if (view === 'result') {
            body = `
                <div class="form-group">
                    <label class="form-label">Time Display</label>
                    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                        <label><input type="radio" name="timeMode" value="hms" ${AppState.display.timeMode === 'hms' ? 'checked' : ''}/> Hours:Minutes:Seconds</label>
                        <label><input type="radio" name="timeMode" value="ms" ${AppState.display.timeMode === 'ms' ? 'checked' : ''}/> Minutes:Seconds</label>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Precision</label>
                    <label><input type="checkbox" id="showHundredths" ${AppState.display.showHundredths ? 'checked' : ''}/> Show hundredths</label>
                </div>
                <hr style="margin:12px 0;border:none;border-top:1px solid var(--border);"/>
                <div class="menu-list">
                    <button class="menu-item" id="remeasureItem">Re-measure This Item</button>
                    <button class="menu-item" id="openUpdateImage">Upload/Change Image</button>
                </div>
            `;
        }
        const modal = this.createModal('Settings', `
            <div>${body}</div>
            <div class="modal-actions mt-3">
                <button class="btn btn-secondary" id="closeSettingsBtn">Close</button>
            </div>
        `);
        modal.querySelector('#closeSettingsBtn').addEventListener('click', () => modal.remove());

        // Persist settings when changed (Home view)
        const unitsSel = modal.querySelector('#unitsSelect');
        if (unitsSel) {
            unitsSel.addEventListener('change', () => {
                AppState.units = unitsSel.value;
                localStorage.setItem('as_units', AppState.units);
            });
        }
        const currencySel = modal.querySelector('#currencySelect');
        if (currencySel) {
            currencySel.addEventListener('change', () => {
                AppState.currency = currencySel.value;
                localStorage.setItem('as_currency', AppState.currency);
            });
        }
        // Result view specific handlers
        const remeasureBtn = modal.querySelector('#remeasureItem');
        if (remeasureBtn) {
            remeasureBtn.addEventListener('click', () => {
                modal.remove();
                AppState.remeasureResultId = AppState.currentResult;
                StopwatchManager.reset(true);
                this.renderStopwatch();
            });
        }
        const upBtn = modal.querySelector('#openUpdateImage');
        if (upBtn) {
            upBtn.addEventListener('click', () => {
                modal.remove();
                this.showResultImageDialog(AppState.currentResult);
            });
        }
        const timeModeRadios = modal.querySelectorAll('input[name="timeMode"]');
        if (timeModeRadios.length) {
            timeModeRadios.forEach(r => r.addEventListener('change', () => {
                AppState.display.timeMode = [...timeModeRadios].find(x => x.checked).value;
                localStorage.setItem('as_timeMode', AppState.display.timeMode);
                if (AppState.currentView === 'result') this.renderResultDetail(AppState.currentResult);
            }));
        }
        const hundredthsCb = modal.querySelector('#showHundredths');
        if (hundredthsCb) {
            hundredthsCb.addEventListener('change', () => {
                AppState.display.showHundredths = !!hundredthsCb.checked;
                localStorage.setItem('as_showHundredths', JSON.stringify(AppState.display.showHundredths));
                if (AppState.currentView === 'result') this.renderResultDetail(AppState.currentResult);
            });
        }
    },

    showThemeCustomization() {
        const palettes = {
            dark: [
                { name: 'Default Dark', id: 'default', colors: { primary: '#1a1a1a', secondary: '#2d2d2d', tertiary: '#3d3d3d', text: '#f8f9fa', textSec: '#adb5bd', accent: '#60a5fa', border: '#495057' }},
                { name: 'Midnight Blue', id: 'midnight', colors: { primary: '#0f1419', secondary: '#1a2332', tertiary: '#253447', text: '#e6f1ff', textSec: '#8892b0', accent: '#64ffda', border: '#1e3a5f' }},
                { name: 'Purple Dream', id: 'purple', colors: { primary: '#1a0f2e', secondary: '#2b1e4a', tertiary: '#3d2b5f', text: '#e9d5ff', textSec: '#c4b5fd', accent: '#a78bfa', border: '#4c1d95' }},
                { name: 'Forest Night', id: 'forest', colors: { primary: '#0a1a0f', secondary: '#1a2e1f', tertiary: '#2a3f2f', text: '#d5f5e3', textSec: '#82c99d', accent: '#52c41a', border: '#1f3a28' }}
            ],
            light: [
                { name: 'Default Light', id: 'light_default', colors: { primary: '#ffffff', secondary: '#f8f9fa', tertiary: '#e9ecef', text: '#212529', textSec: '#6c757d', accent: '#3b82f6', border: '#dee2e6' }},
                { name: 'Warm Beige', id: 'warm', colors: { primary: '#faf8f3', secondary: '#f5f0e8', tertiary: '#ede7dc', text: '#3e3022', textSec: '#73644e', accent: '#d97706', border: '#d4c5b0' }},
                { name: 'Cool Mint', id: 'mint', colors: { primary: '#f0fdf9', secondary: '#e6f9f3', tertiary: '#d1f5e8', text: '#064e3b', textSec: '#047857', accent: '#10b981', border: '#a7f3d0' }},
                { name: 'Ocean Breeze', id: 'ocean', colors: { primary: '#f0f9ff', secondary: '#e0f2fe', tertiary: '#bae6fd', text: '#0c4a6e', textSec: '#0369a1', accent: '#0284c7', border: '#7dd3fc' }}
            ]
        };

        const currentMode = AppState.theme;
        const relevantPalettes = palettes[currentMode];
        const currentPalette = currentMode === 'dark' ? AppState.themePalette_dark : AppState.themePalette_light;
        const currentCustomColors = currentMode === 'dark' ? AppState.customColors_dark : AppState.customColors_light;

        const modal = this.createModal('Theme Customization', `
            <div class="form-group">
                <label class="form-label">Preset Palettes (${currentMode === 'dark' ? 'Dark' : 'Light'} Mode)</label>
                <div class="theme-palette-grid">
                    ${relevantPalettes.map(p => `
                        <button type="button" class="palette-card ${currentPalette === p.id ? 'active' : ''}" data-palette="${p.id}">
                            <div class="palette-preview">
                                <div style="background:${p.colors.primary};flex:1"></div>
                                <div style="background:${p.colors.secondary};flex:1"></div>
                                <div style="background:${p.colors.accent};flex:1"></div>
                            </div>
                            <div class="palette-name">${p.name}</div>
                        </button>
                    `).join('')}
                </div>
            </div>
            <hr style="margin:20px 0;border:none;border-top:2px solid var(--border);"/>
            <div class="form-group">
                <label class="form-label">Custom Colors</label>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Fine-tune your theme by customizing individual colors.</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Background</label>
                        <input type="color" class="color-picker" id="customPrimary" value="${currentCustomColors?.primary || palettes[currentMode][0].colors.primary}">
                    </div>
                    <div>
                        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Accent</label>
                        <input type="color" class="color-picker" id="customAccent" value="${currentCustomColors?.accent || palettes[currentMode][0].colors.accent}">
                    </div>
                    <div>
                        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Text</label>
                        <input type="color" class="color-picker" id="customText" value="${currentCustomColors?.text || palettes[currentMode][0].colors.text}">
                    </div>
                    <div>
                        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Border</label>
                        <input type="color" class="color-picker" id="customBorder" value="${currentCustomColors?.border || palettes[currentMode][0].colors.border}">
                    </div>
                </div>
                <button class="btn btn-secondary btn-block" id="applyCustomBtn" style="margin-top:12px;">Apply Custom Theme</button>
            </div>
            <div class="modal-actions mt-3">
                <button class="btn btn-secondary" id="closeThemeBtn">Close</button>
            </div>
        `);

        modal.querySelector('#closeThemeBtn').addEventListener('click', () => modal.remove());

        // Palette selection
        modal.querySelectorAll('.palette-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const paletteId = card.dataset.palette;
                const palette = relevantPalettes.find(p => p.id === paletteId);
                if (palette) {
                    this.applyThemePalette(palette.colors);
                    if (currentMode === 'dark') {
                        AppState.themePalette_dark = paletteId;
                        AppState.customColors_dark = null;
                        localStorage.setItem('as_themePalette_dark', paletteId);
                        localStorage.removeItem('as_customColors_dark');
                    } else {
                        AppState.themePalette_light = paletteId;
                        AppState.customColors_light = null;
                        localStorage.setItem('as_themePalette_light', paletteId);
                        localStorage.removeItem('as_customColors_light');
                    }
                    modal.remove();
                }
            });
        });

        // Custom colors
        modal.querySelector('#applyCustomBtn').addEventListener('click', () => {
            const custom = {
                primary: modal.querySelector('#customPrimary').value,
                accent: modal.querySelector('#customAccent').value,
                text: modal.querySelector('#customText').value,
                border: modal.querySelector('#customBorder').value
            };
            this.applyThemePalette(custom, true);
            if (currentMode === 'dark') {
                AppState.themePalette_dark = 'custom';
                AppState.customColors_dark = custom;
                localStorage.setItem('as_themePalette_dark', 'custom');
                localStorage.setItem('as_customColors_dark', JSON.stringify(custom));
            } else {
                AppState.themePalette_light = 'custom';
                AppState.customColors_light = custom;
                localStorage.setItem('as_themePalette_light', 'custom');
                localStorage.setItem('as_customColors_light', JSON.stringify(custom));
            }
            modal.remove();
        });
    },

    applyThemePalette(colors, isCustom = false) {
        const target = document.body;
        target.style.setProperty('--bg-primary', colors.primary);
        target.style.setProperty('--bg-secondary', colors.secondary || this.adjustColor(colors.primary, 10));
        target.style.setProperty('--bg-tertiary', colors.tertiary || this.adjustColor(colors.primary, 20));
        target.style.setProperty('--text-primary', colors.text);
        target.style.setProperty('--text-secondary', colors.textSec || this.adjustColor(colors.text, -30));
        target.style.setProperty('--accent', colors.accent);
        target.style.setProperty('--accent-hover', this.adjustColor(colors.accent, -10));
        target.style.setProperty('--border', colors.border);
    },

    adjustColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, Math.min(255, (num >> 16) + amt));
        const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
        const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
        return `#${(0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
    },
    
    clearThemePalette() {
        const target = document.body;
        target.style.removeProperty('--bg-primary');
        target.style.removeProperty('--bg-secondary');
        target.style.removeProperty('--bg-tertiary');
        target.style.removeProperty('--text-primary');
        target.style.removeProperty('--text-secondary');
        target.style.removeProperty('--accent');
        target.style.removeProperty('--accent-hover');
        target.style.removeProperty('--border');
    },

    showFolderMenu(anchorEl, folderId) {
        this.closeResultMenu();
        const folder = DataManager.getFolders().find(f => f.id === folderId);
        if (!folder) return;
        
        const menu = document.createElement('div');
        menu.className = 'menu-popover';
        menu.innerHTML = `
            <button class="menu-item" data-action="color" data-folder-id="${folderId}">Choose Project Color</button>
            <button class="menu-item" data-action="delete" data-folder-id="${folderId}">Delete</button>
        `;
        document.body.appendChild(menu);
        const rect = anchorEl.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
        menu.style.left = `${rect.right + window.scrollX - menu.offsetWidth}px`;
        this._openMenu = menu;
        
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.menu-item');
            if (!item) return;
            const action = item.dataset.action;
            
            if (action === 'delete') {
                if (confirm('Delete this project and all its results?')) {
                    DataManager.deleteFolder(folderId);
                    this.closeResultMenu();
                    this.renderHome();
                }
            } else if (action === 'color') {
                this.closeResultMenu();
                this.showFolderColorDialog(folderId);
            }
        });
        
        const close = (ev) => {
            if (!menu.contains(ev.target) && ev.target !== anchorEl) {
                this.closeResultMenu();
                document.removeEventListener('click', close, true);
            }
        };
        setTimeout(() => document.addEventListener('click', close, true), 0);
    },
    
    showFolderColorDialog(folderId) {
        const folder = DataManager.getFolders().find(f => f.id === folderId);
        if (!folder) return;
        
        const presetColors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
            '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
            '#6366f1', '#84cc16', '#06b6d4', '#a855f7'
        ];
        
        const modal = this.createModal('Choose Project Color', `
            <div class="form-group">
                <label class="form-label">Preset Colors</label>
                <div class="color-palette-grid">
                    ${presetColors.map(color => `
                        <button class="color-palette-btn" data-color="${color}" style="background: ${color};"></button>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Custom Color</label>
                <input type="color" class="color-picker" id="customColorPicker" value="${folder.color || '#3b82f6'}">
            </div>
            <div class="modal-actions mt-3">
                <button class="btn btn-secondary" id="cancelColorBtn">Cancel</button>
                <button class="btn btn-primary" id="applyColorBtn">Apply</button>
            </div>
        `);
        
        modal.querySelector('#cancelColorBtn').addEventListener('click', () => modal.remove());
        
        let selectedColor = folder.color || null;
        
        modal.querySelectorAll('.color-palette-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedColor = btn.dataset.color;
                modal.querySelectorAll('.color-palette-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });
        
        modal.querySelector('#customColorPicker').addEventListener('change', (e) => {
            selectedColor = e.target.value;
        });
        
        modal.querySelector('#applyColorBtn').addEventListener('click', () => {
            const folders = DataManager.getFolders();
            const folderIndex = folders.findIndex(f => f.id === folderId);
            if (folderIndex !== -1) {
                folders[folderIndex].color = selectedColor;
                DataManager.saveFolders(folders);
            }
            modal.remove();
            this.renderHome();
        });
    },
    
    showResultMenu(anchorEl, resultId) {
        this.closeResultMenu();
        const menu = document.createElement('div');
        menu.className = 'menu-popover';
        menu.innerHTML = `<button class="menu-item" data-action="delete" data-result-id="${resultId}">Delete</button>`;
        document.body.appendChild(menu);
        const rect = anchorEl.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
        menu.style.left = `${rect.right + window.scrollX - menu.offsetWidth}px`;
        this._openMenu = menu;
        const close = (ev) => {
            if (!menu.contains(ev.target) && ev.target !== anchorEl) {
                this.closeResultMenu();
                document.removeEventListener('click', close, true);
            }
        };
        setTimeout(() => document.addEventListener('click', close, true), 0);
    },
    closeResultMenu() {
        if (this._openMenu) { this._openMenu.remove(); this._openMenu = null; }
    },

    showResultImageDialog(resultId) {
        const modal = this.createModal('Update Image', `
            <div class="form-group">
                <label class="form-label">Choose Image</label>
                <div class="file-input-wrapper">
                    <label class="file-input-label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span>Choose Image</span>
                        <input type="file" class="file-input" id="updateImageInput" accept="image/*">
                    </label>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancelUpdateBtn">Cancel</button>
                <button class="btn btn-success" id="applyUpdateBtn" disabled>Save</button>
            </div>
        `);
        const input = modal.querySelector('#updateImageInput');
        const apply = modal.querySelector('#applyUpdateBtn');
        let dataUrl = null;
        input.addEventListener('change', async (e) => {
            if (e.target.files[0]) {
                dataUrl = await Utils.imageToDataURLCompressed(e.target.files[0]);
                apply.disabled = false;
            }
        });
        modal.querySelector('#cancelUpdateBtn').addEventListener('click', () => modal.remove());
        apply.addEventListener('click', () => {
            if (!dataUrl) return;
            DataManager.updateResult(resultId, { image: dataUrl });
            modal.remove();
            if (AppState.currentView === 'result') this.renderResultDetail(resultId);
            if (AppState.currentView === 'folder') this.renderFolderView(AppState.currentFolder);
        });
    },

    getDragAfterElement(container, y) {
        const elements = [...container.querySelectorAll('.result-item:not(.dragging)')];
        return elements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - (box.top + box.height / 2);
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
    },
    
    getDragAfterElementGrid(container, x, y) {
        const elements = [...container.querySelectorAll('.folder-card:not(.dragging)')];
        return elements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const centerX = box.left + box.width / 2;
            const centerY = box.top + box.height / 2;
            const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            const offset = (y > centerY) ? distance : -distance;
            if (offset > 0 && (closest.offset === null || offset < closest.offset)) {
                return { offset, element: child };
            } else {
                return closest;
            }
        }, { offset: null, element: null }).element;
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => UI.init());

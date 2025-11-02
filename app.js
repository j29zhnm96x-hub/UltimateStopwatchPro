/// Ultimate Stopwatch - State & Data Management
/// Ultimate Stopwatch - State & Data Management
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
    lang: localStorage.getItem('as_lang') || 'en',
    preselectedFolder: null,
    remeasureResultId: null,
    continueResultId: null,
    resultChoiceTargetId: null,
    keepAwakeOnCharge: JSON.parse(localStorage.getItem('as_keepAwakeCharge') || 'false'),
    display: {
        timeMode: localStorage.getItem('as_timeMode') || 'hms',
        showHundredths: JSON.parse(localStorage.getItem('as_showHundredths') || 'true')
    },

    
    // Countdown-to-start (ephemeral)
    countdownSeconds: null,
    countdownIntervalId: null,
    countdownActive: false,
    // Voice control (ephemeral)
    voice: {
        enabled: false,
        recognizing: false,
        recognizer: null,
        lang: 'en-US'
    },

    // Wake Lock helpers (keep screen awake while charging)
    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this._wakeLock = await navigator.wakeLock.request('screen');
                this._wakeLock.addEventListener('release', () => { /* released */ });
                return this._wakeLock;
            }
            // Fallback for iOS Safari via NoSleep.js (requires user gesture)
            if (typeof window !== 'undefined' && window.NoSleep) {
                if (!this._noSleep) this._noSleep = new window.NoSleep();
                if (!this._noSleepEnabled) {
                    await this._noSleep.enable();
                    this._noSleepEnabled = true;
                }
                return this._noSleep;
            }
            return null;
        } catch (e) {
            return null;
        }
    },
    async releaseWakeLock() {
        try {
            if (this._wakeLock) { await this._wakeLock.release(); this._wakeLock = null; }
            if (this._noSleep && this._noSleepEnabled) { await this._noSleep.disable(); this._noSleepEnabled = false; }
        } catch (e) { /* ignore */ }
    },
    async updateKeepAwakeBinding() {
        // Remove old listeners if any
        if (this._battery && this._battery.removeEventListener) {
            this._battery.removeEventListener('chargingchange', this._onChargingChange);
        }
        document.removeEventListener('visibilitychange', this._onVisibilityChange);

        if (!AppState.keepAwakeOnCharge) {
            await this.releaseWakeLock();
            return;
        }
        if (!('getBattery' in navigator)) {
            // No Battery API (e.g., iOS Safari): enable when visible
            this._onVisibilityChange = async () => {
                if (document.visibilityState === 'visible' && AppState.keepAwakeOnCharge) {
                    await this.requestWakeLock();
                } else {
                    await this.releaseWakeLock();
                }
            };
            document.addEventListener('visibilitychange', this._onVisibilityChange);
            await this._onVisibilityChange();
            return;
        }
        this._battery = await navigator.getBattery();
        this._onChargingChange = async () => {
            if (this._battery.charging) {
                await this.requestWakeLock();
            } else {
                await this.releaseWakeLock();
            }
        };
        this._battery.addEventListener('chargingchange', this._onChargingChange);
        this._onVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && this._battery.charging && AppState.keepAwakeOnCharge) {
                await this.requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', this._onVisibilityChange);
        // Initial apply
        await this._onChargingChange();
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
            alert((Locales[AppState.lang] && Locales[AppState.lang]['error.saveFailed']) || Locales.en['error.saveFailed']);
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
        // Clear any pending countdown
        if (AppState.countdownIntervalId) { clearTimeout(AppState.countdownIntervalId); AppState.countdownIntervalId = null; }
        AppState.countdownActive = false;
        AppState.countdownSeconds = null;
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
    },

    // Simple WebAudio beeps (works without assets). Can be replaced by provided sounds later.
    _audioCtx: null,
    async beep(frequency = 880, durationMs = 140, volume = 0.15) {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!this._audioCtx) this._audioCtx = new Ctx();
            const ctx = this._audioCtx;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.frequency.value = frequency;
            g.gain.value = volume;
            o.type = 'sine';
            o.connect(g); g.connect(ctx.destination);
            const now = ctx.currentTime;
            o.start(now);
            o.stop(now + durationMs / 1000);
            return new Promise(res => o.onended = res);
        } catch { /* ignore */ }
    },
}
;

// Lightweight sound manager for UI actions (preloaded, minimal latency)
const Sound = {
    clips: {},
    buffers: {},
    _ctx: null,
    initialized: false,
    files: {
        start: 'audio/single-tone.mp3',
        resume: 'audio/single-tone.mp3',
        lap: 'audio/double-tone.mp3',
        pause: 'audio/low-to%20high-click.mp3',
        stop: 'audio/synth1.mp3',
        reset: 'audio/reset.mp3',
        ui: 'audio/low-click.mp3',
        confirm: 'audio/low-click-double.mp3'
    },
    init() {
        if (this.initialized) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) this._ctx = this._ctx || new Ctx();
        for (const [k, src] of Object.entries(this.files)) {
            const a = new Audio(src);
            a.preload = 'auto';
            a.load();
            this.clips[k] = a;
        }
        // Preload all sounds into WebAudio for ultra low latency (fallback to HTMLAudio if decode fails)
        Object.keys(this.files).forEach(k => this._preloadBuffer(k, this.files[k]));
        // Unlock on first gesture (iOS)
        const unlock = () => {
            try {
                for (const a of Object.values(this.clips)) {
                    a.muted = true;
                    a.currentTime = 0;
                    // Prime playback pipeline for iOS PWAs
                    a.play().then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; });
                }
                if (this._ctx && this._ctx.state === 'suspended') {
                    this._ctx.resume().catch(()=>{});
                }
                // Also resume WebAudio context used by Utils.beep on iOS
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (Ctx) {
                    if (!Utils._audioCtx) Utils._audioCtx = new Ctx();
                    if (Utils._audioCtx && Utils._audioCtx.state === 'suspended') {
                        Utils._audioCtx.resume().catch(()=>{});
                    }
                }
            } catch {}
        };
        window.addEventListener('touchstart', unlock, { once: true, passive: true });
        window.addEventListener('click', unlock, { once: true });
        this.initialized = true;
    },
    forceUnlock() {
        // More aggressive unlock for iOS Safari
        try {
            for (const a of Object.values(this.clips)) {
                if (a && a.paused) {
                    a.muted = true;
                    a.currentTime = 0;
                    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
                }
            }
            if (this._ctx && this._ctx.state === 'suspended') {
                this._ctx.resume().catch(()=>{});
            }
            if (Utils._audioCtx && Utils._audioCtx.state === 'suspended') {
                Utils._audioCtx.resume().catch(()=>{});
            }
        } catch {}
    },
    async _preloadBuffer(key, url) {
        try {
            if (!this._ctx) return;
            const res = await fetch(url);
            const arr = await res.arrayBuffer();
            this.buffers[key] = await this._ctx.decodeAudioData(arr);
        } catch (_) { /* ignore, fallback to HTMLAudio */ }
    },
    play(name) {
        const base = this.clips[name];
        if (!base) return;
        try {
            if (this._ctx && this.buffers[name]) {
                const src = this._ctx.createBufferSource();
                src.buffer = this.buffers[name];
                src.connect(this._ctx.destination);
                src.start(0);
            } else {
                // clone to allow overlaps and avoid cutting off
                const a = base.cloneNode(true);
                a.play().catch(()=>{});
            }
        } catch {}
    }
};

// Localization tables (core keys). Fallback: English.
const Locales = {
    en: {
        'title.app': 'Ultimate Stopwatch',
        'action.settings': 'Settings',
        'action.close': 'Close',
        'action.cancel': 'Cancel',
        'action.create': 'Create',
        'action.save': 'Save',
        'action.update': 'Update',
        'action.apply': 'Apply',
        'action.proceed': 'Proceed',
        'action.resume': 'Resume',
        'action.pause': 'Pause',
        'action.stop': 'Stop',
        'action.reset': 'Reset',
        'action.start': 'Start',
        'action.next': 'Next',
        'action.calculate': 'Calculate',
        'action.chooseImage': 'Choose Image',
        'header.stopwatch': 'Stopwatch',
        'home.empty1': 'No projects yet.',
        'home.empty2': 'Create one to get started!',
        'folder.empty1': 'No results yet.',
        'folder.empty2': 'Start timing to create one!',
        'folder.result': 'result',
        'folder.results': 'results',
        'settings.language': 'Language',
        'settings.units': 'Units',
        'settings.metric': 'Metric (ms, s)',
        'settings.imperial': 'Imperial',
        'settings.currency': 'Currency',
        'settings.power': 'Power',
        'settings.keepAwake': 'Keep screen awake while charging',
        'settings.timeDisplay': 'Time Display',
        'settings.hms': 'Hours:Minutes:Seconds',
        'settings.ms': 'Minutes:Seconds',
        'settings.precision': 'Precision',
        'settings.showHundredths': 'Show hundredths',
        'settings.reOrContinue': 'Re-measure or Continue where you left off',
        'settings.uploadChangeImage': 'Upload/Change Image',
        'theme.title': 'Theme Customization',
        'theme.preset': 'Preset Palettes',
        'theme.customColors': 'Custom Colors',
        'theme.background': 'Background',
        'theme.accent': 'Accent',
        'theme.text': 'Text',
        'theme.border': 'Border',
        'theme.applyCustom': 'Apply Custom Theme',
        'theme.fineTune': 'Fine-tune your theme by customizing individual colors.',
        'theme.darkMode': 'Dark Mode',
        'theme.lightMode': 'Light Mode',
        'color.preset': 'Preset Colors',
        'color.custom': 'Custom Color',
        'dialog.updateImageTitle': 'Update Image',
        'newProject.title': 'Create New Project',
        'newProject.name': 'Project Name',
        'save.titleSave': 'Save Result',
        'save.titleUpdate': 'Update Result',
        'save.resultName': 'Result Name',
        'save.project': 'Project',
        'save.selectProject': 'Select project...',
        'save.createNewProject': '+ Create New Project',
        'save.newProjectName': 'New Project Name',
        'save.attachImage': 'Attach Image (Optional)',
        'menu.chooseProjectColor': 'Choose Project Color',
        'menu.chooseProjectTextColor': 'Choose Project Text Color',
        'menu.delete': 'Delete',
        'resultDetail.totalTime': 'Total Time',
        'confirm.deleteProject': 'Delete this project and all its results?',
        'confirm.deleteResult': 'Delete this result?',
        'confirm.stopSession': 'Stop the current session?',
        'stopwatch.laps': 'Laps',
        'stopwatch.avg': 'Avg',
        'stopwatch.avgLap': 'Avg Lap',
        'stopwatch.lap': 'Lap',
        'stopwatch.allLaps': 'All Laps',
        'calc.title': 'Calculate',
        'calc.tab.quantity': 'Quantity',
        'calc.tab.time': 'Time',
        'calc.tab.price': 'Price',
        'calc.numberOfItems': 'Number of Items',
        'calc.estimatedTotalTime': 'Estimated Total Time',
        'calc.duration': 'Duration',
        'calc.estimatedQuantity': 'Estimated Quantity',
        'calc.hourlyWage': 'Hourly Wage',
        'calc.pricePerPiece': 'Price Per Piece',
        'prompt.enterProjectName': 'Please enter a project name',
        'choice.modalTitle': 'How would you like to proceed?',
        'choice.continueTitle': 'Continue where you left off',
        'choice.remeasureTitle': 'Re-measure from scratch',
        'choice.continueDesc': 'Keeps your previous laps and adds new ones.',
        'choice.remeasureDesc': 'Replaces the old measurements with new ones.',
        'tooltip.newProject': 'New Project',
        'tooltip.startStopwatch': 'Start Stopwatch',
        'tooltip.countdown': 'Countdown to start',
        'tooltip.voice': 'Voice control',
        'error.voiceUnsupported': 'Voice control is not supported on this browser.',
        'help.title': 'About & Help',
        'help.whatTitle': 'What is this app?',
        'help.whatText': 'Ultimate Stopwatch helps you time activities with laps, countdown-to-start, voice commands, and project saving.',
        'help.controlsTitle': 'Core Controls',
        'help.controlsText': 'Use the Start, Next (Lap), Pause, Resume, Stop, and Reset buttons to control the stopwatch. Keyboard: Enter (Start/Pause/Resume), Space (Lap).',
        'help.ctrlStart': 'Start: Begins timing. If countdown is set, it will count down first.',
        'help.ctrlNext': 'Next (Lap): Records a lap without stopping the timer.',
        'help.ctrlPause': 'Pause: Pauses the stopwatch.',
        'help.ctrlResume': 'Resume: Continues timing after a pause.',
        'help.ctrlStop': 'Stop: Stops timing. You can save the result.',
        'help.ctrlReset': 'Reset: Resets the stopwatch to zero (after Stop).',
        'help.countdownTitle': 'Countdown to Start',
        'help.countdownText': 'Tap the timer icon to set 1–10 seconds. Press Start to hear beeps during countdown; at 0 the stopwatch starts.',
        'help.voiceTitle': 'Voice Control',
        'help.voiceText': 'Enable the mic button to say: “start, next, pause, resume, stop, reset” (also supports Croatian equivalents).',
        'help.soundsTitle': 'Sounds',
        'help.soundsText': 'UI clicks and stopwatch actions have distinct sounds. On iOS, ensure volume is up and Silent Mode is off.',
        'help.saveTitle': 'Saving Results',
        'help.saveText': 'Save sessions into projects, view details, and calculate metrics later.',
        'help.tipsTitle': 'Tips',
        'help.tipsText': 'Add to Home Screen for a full-screen experience. Keep the screen awake in settings when charging.',
        'orientation.title': 'Rotate your device',
        'orientation.message': 'This app works in portrait mode only. Please rotate your device back to portrait.',
        'lap.remove': 'Remove Lap',
        'lap.removeTitle': 'Remove this lap?',
        'lap.removeText': 'Lap {number} will be removed. Subsequent laps will be renumbered and times recalculated.',
        'countdown.title': 'Countdown',
        'countdown.secondsLabel': 'Seconds (1–10)',
        'error.wakeLockUnsupported': 'Screen Wake Lock is not supported on this browser.',
        'error.saveFailed': 'Saving failed: storage is full or data too large. Consider deleting older results or images.',
        'error.projectNotFound': 'Project not found. It may have been deleted.',
        'settings.projectSettings': 'Project settings for the current project.',
        'info.wakeLockNote': 'Uses the Screen Wake Lock API when available.',
        'label.h': 'h', 'label.m': 'm', 'label.s': 's',
        'currency.euro': 'Euro (€)',
        'currency.usd': 'US Dollar ($)',
        'currency.gbp': 'Pound (£)'
    },
    hr: {
        'title.app': 'Ultimate Stopwatch',
        'action.settings': 'Postavke',
        'action.close': 'Zatvori',
        'action.cancel': 'Odustani',
        'action.create': 'Stvori',
        'action.save': 'Spremi',
        'action.update': 'Ažuriraj',
        'action.apply': 'Primijeni',
        'action.proceed': 'Nastavi',
        'action.resume': 'Nastavi',
        'action.pause': 'Pauza',
        'action.stop': 'Zaustavi',
        'action.reset': 'Resetiraj',
        'action.start': 'Pokreni',
        'action.next': 'Sljedeće',
        'action.calculate': 'Izračunaj',
        'action.chooseImage': 'Odaberi sliku',
        'header.stopwatch': 'Štoperica',
        'home.empty1': 'Još nema projekata.',
        'home.empty2': 'Kreiraj jedan za početak!',
        'folder.empty1': 'Još nema rezultata.',
        'folder.empty2': 'Pokreni mjerenje da ga kreiraš!',
        'folder.result': 'rezultat',
        'folder.results': 'rezultata',
        'settings.language': 'Jezik',
        'settings.units': 'Jedinice',
        'settings.metric': 'Metrički (ms, s)',
        'settings.imperial': 'Imperijalne',
        'settings.currency': 'Valuta',
        'settings.power': 'Napajanje',
        'settings.keepAwake': 'Drži zaslon budnim tijekom punjenja',
        'settings.timeDisplay': 'Prikaz vremena',
        'settings.hms': 'Sati:Minute:Sekunde',
        'settings.ms': 'Minute:Sekunde',
        'settings.precision': 'Preciznost',
        'settings.showHundredths': 'Prikaži stotinke',
        'settings.reOrContinue': 'Ponovno izmjeri ili nastavi gdje si stao',
        'settings.uploadChangeImage': 'Učitaj/Promijeni sliku',
        'theme.title': 'Prilagodba teme',
        'theme.preset': 'Unaprijed zadane palete',
        'theme.customColors': 'Prilagođene boje',
        'theme.background': 'Pozadina',
        'theme.accent': 'Istaknuta',
        'theme.text': 'Tekst',
        'theme.border': 'Rub',
        'theme.applyCustom': 'Primijeni prilagođenu temu',
        'theme.fineTune': 'Prilagodite temu fino podešavanjem pojedinačnih boja.',
        'theme.darkMode': 'Tamni način',
        'theme.lightMode': 'Svijetli način',
        'color.preset': 'Unaprijed zadane boje',
        'color.custom': 'Prilagođena boja',
        'dialog.updateImageTitle': 'Ažuriraj sliku',
        'newProject.title': 'Stvori novi projekt',
        'newProject.name': 'Naziv projekta',
        'save.titleSave': 'Spremi rezultat',
        'save.titleUpdate': 'Ažuriraj rezultat',
        'save.resultName': 'Naziv rezultata',
        'save.project': 'Projekt',
        'save.selectProject': 'Odaberi projekt...',
        'save.createNewProject': '+ Kreiraj novi projekt',
        'save.newProjectName': 'Naziv novog projekta',
        'save.attachImage': 'Priloži sliku (neobavezno)',
        'menu.chooseProjectColor': 'Odaberi boju projekta',
        'menu.chooseProjectTextColor': 'Odaberi boju teksta projekta',
        'menu.delete': 'Izbriši',
        'resultDetail.totalTime': 'Ukupno vrijeme',
        'confirm.deleteProject': 'Obrisati ovaj projekt i sve njegove rezultate?',
        'confirm.deleteResult': 'Obrisati ovaj rezultat?',
        'confirm.stopSession': 'Zaustaviti trenutno mjerenje?',
        'stopwatch.laps': 'Krugovi',
        'stopwatch.avg': 'Prosjek',
        'stopwatch.avgLap': 'Prosječan krug',
        'stopwatch.lap': 'Krug',
        'stopwatch.allLaps': 'Svi krugovi',
        'calc.title': 'Izračun',
        'calc.tab.quantity': 'Količina',
        'calc.tab.time': 'Vrijeme',
        'calc.tab.price': 'Cijena',
        'calc.numberOfItems': 'Broj stavki',
        'calc.estimatedTotalTime': 'Procijenjeno ukupno vrijeme',
        'calc.duration': 'Trajanje',
        'calc.estimatedQuantity': 'Procijenjena količina',
        'calc.hourlyWage': 'Satnica',
        'calc.pricePerPiece': 'Cijena po komadu',
        'choice.modalTitle': 'Kako želite nastaviti?',
        'choice.continueTitle': 'Nastavi gdje si stao',
        'choice.remeasureTitle': 'Ponovno izmjeri od početka',
        'choice.continueDesc': 'Zadržava prethodne krugove i dodaje nove.',
        'choice.remeasureDesc': 'Zamjenjuje stare izmjere novima.',
        'tooltip.newProject': 'Novi projekt',
        'tooltip.startStopwatch': 'Pokreni štopericu',
        'tooltip.countdown': 'Odbrojavanje prije starta',
        'tooltip.voice': 'Glasovno upravljanje',
        'error.voiceUnsupported': 'Glasovno upravljanje nije podržano u ovom pregledniku.',
        'help.title': 'O aplikaciji i pomoć',
        'help.whatTitle': 'Što je ova aplikacija?',
        'help.whatText': 'Ultimate Stopwatch pomaže mjeriti vrijeme s krugovima, odbrojavanjem, glasovnim naredbama i spremanjem projekata.',
        'help.controlsTitle': 'Osnovne kontrole',
        'help.controlsText': 'Koristite Start, Next (Krug), Pause, Resume, Stop i Reset. Tipkovnica: Enter (Start/Pauza/Nastavi), Space (Krug).',
        'help.ctrlStart': 'Start: Pokreće mjerenje. Ako je postavljeno odbrojavanje, prvo će odbrojati.',
        'help.ctrlNext': 'Next (Krug): Sprema krug bez zaustavljanja mjerenja.',
        'help.ctrlPause': 'Pause: Pauzira štopericu.',
        'help.ctrlResume': 'Resume: Nastavlja nakon pauze.',
        'help.ctrlStop': 'Stop: Zaustavlja mjerenje. Možete spremiti rezultat.',
        'help.ctrlReset': 'Reset: Vraća štopericu na nulu (nakon Stop).',
        'help.countdownTitle': 'Odbrojavanje prije starta',
        'help.countdownText': 'Dodirnite ikonu tajmera za 1–10 sekundi. Pritisnite Start kako biste čuli beepove; na 0 štoperica kreće.',
        'help.voiceTitle': 'Glasovno upravljanje',
        'help.voiceText': 'Uključite mikrofon i recite: “start, next, pause, resume, stop, reset” (podržane su i hrvatske riječi).',
        'help.soundsTitle': 'Zvukovi',
        'help.soundsText': 'UI klikovi i radnje štoperice imaju različite zvukove. Na iOS-u provjerite glasnoću i isključen Tihi način.',
        'help.saveTitle': 'Spremanje rezultata',
        'help.saveText': 'Spremite mjerenja u projekte, pregledajte detalje i naknadno izračunajte metrike.',
        'help.tipsTitle': 'Savjeti',
        'help.tipsText': 'Dodajte na početni zaslon za cijeli ekran. U postavkama zadržite ekran budnim dok se puni.',
        'orientation.title': 'Okrenite uređaj',
        'orientation.message': 'Aplikacija radi samo u vertikalnom prikazu. Vratite uređaj u portret.',
        'lap.remove': 'Ukloni krug',
        'lap.removeTitle': 'Ukloniti ovaj krug?',
        'lap.removeText': 'Krug {number} će biti uklonjen. Sljedeći krugovi će biti preuređeni, a vremena ponovno izračunata.',
        'countdown.title': 'Odbrojavanje',
        'countdown.secondsLabel': 'Sekunde (1–10)',
        'error.wakeLockUnsupported': 'Zadržavanje zaslona nije podržano u ovom pregledniku.',
        'error.saveFailed': 'Spremanje nije uspjelo: pohrana je puna ili su podaci preveliki. Obrišite starije rezultate ili slike.',
        'error.projectNotFound': 'Projekt nije pronađen. Možda je obrisan.',
        'settings.projectSettings': 'Postavke projekta za trenutni projekt.',
        'info.wakeLockNote': 'Koristi Screen Wake Lock API kada je dostupan.',
        'label.h': 'h', 'label.m': 'm', 'label.s': 's',
        'currency.euro': 'Euro (€)',
        'currency.usd': 'Američki dolar ($)',
        'currency.gbp': 'Funta (£)'
    }
    // NOTE: Additional languages will fall back to English if a key is missing.
};

// Extend locales with additional language packs if provided (locales.js)
if (typeof window !== 'undefined' && window.LocalesExtra) {
    for (const [code, table] of Object.entries(window.LocalesExtra)) {
        Locales[code] = { ...(Locales[code] || {}), ...table };
    }
}

const UI = {
    init() {
        this.app = document.getElementById('app');
        Sound.init();
        this.applyTheme();
        this.setupClickSounds();
        this.setupEventListeners();
        this.setupGlobalInputHandlers();
        this.setupKeyboardShortcuts();
        AppState.updateKeepAwakeBinding && AppState.updateKeepAwakeBinding();
        // iOS Safari fallback requires a user gesture to enable NoSleep video
        if (AppState.keepAwakeOnCharge) {
            const firstInteract = async () => {
                await AppState.requestWakeLock();
            };
            window.addEventListener('touchstart', firstInteract, { once: true, passive: true });
            window.addEventListener('click', firstInteract, { once: true });
        }
        // Aggressive audio unlock for iOS on first interaction
        const aggressiveUnlock = () => {
            Sound.forceUnlock();
        };
        window.addEventListener('pointerdown', aggressiveUnlock, { once: true, passive: true });
        window.addEventListener('touchstart', aggressiveUnlock, { once: true, passive: true });
        window.addEventListener('click', aggressiveUnlock, { once: true });
        try { if (screen.orientation && screen.orientation.lock) { screen.orientation.lock('portrait').catch(()=>{}); } } catch(_) {}
        this.applyLanguage();
        this.renderHome();
    },
    setupClickSounds() {
        const confirmIds = new Set([
            'applyCountdownBtn','applyChoiceBtn','closeSettingsBtn','cancelChoiceBtn','cancelBtn','cancelSaveBtn',
            'applyThemeBtn','calcQuantityBtn','calcTimeBtn','calcPriceBtn','saveResultForm','newFolderForm'
        ]);
        document.addEventListener('pointerdown', (e) => {
            // Skip if voice command is executing
            if (this._voiceCommandActive) return;
            const target = e.target;
            const controlHit = target.closest('#startBtn, #resumeBtn, #pauseBtn, #stopBtn, #lapBtn, #resetBtn');
            if (controlHit) return; // handled elsewhere
            const el = target.closest('button, .menu-item, .palette-card');
            if (!el) return;
            const txt = (el.textContent || '').trim().toLowerCase();
            const isStrongBtn = el.classList && (el.classList.contains('btn-primary') || el.classList.contains('btn-success'));
            const hasConfirmId = el.id && confirmIds.has(el.id);
            const confirmWords = /(apply|save|update|create|proceed|ok|yes|done|close)/;
            const isConfirm = isStrongBtn || hasConfirmId || confirmWords.test(txt);
            Sound.play(isConfirm ? 'confirm' : 'ui');
        }, true);

        // Long-press detection for lap items
        let longPressTimer = null;
        let longPressTarget = null;
        document.addEventListener('pointerdown', (e) => {
            const lapItem = e.target.closest('.lap-item');
            if (!lapItem || AppState.currentView !== 'result') return;
            longPressTarget = lapItem;
            longPressTimer = setTimeout(() => {
                const lapIndex = parseInt(lapItem.dataset.lapIndex);
                const resultId = lapItem.dataset.resultId;
                if (!isNaN(lapIndex) && resultId) {
                    this.showRemoveLapDialog(resultId, lapIndex);
                }
            }, 500);
        });
        document.addEventListener('pointerup', () => {
            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressTarget = null;
        });
        document.addEventListener('pointercancel', () => {
            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressTarget = null;
        });
    },
    
    // i18n helpers
    t(key) {
        const lang = AppState.lang || 'en';
        return (Locales[lang] && Locales[lang][key]) || (Locales.en && Locales.en[key]) || key;
    },
    applyLanguage() {
        document.documentElement.lang = AppState.lang || 'en';
        document.title = this.t('title.app');
        document.documentElement.dir = (AppState.lang === 'ar') ? 'rtl' : 'ltr';
    },
    p(singularKey, pluralKey, count) {
        return count === 1 ? this.t(singularKey) : this.t(pluralKey);
    },
    rerenderCurrentView() {
        switch (AppState.currentView) {
            case 'home': this.renderHome(); break;
            case 'folder': this.renderFolderView(AppState.currentFolder); break;
            case 'result': this.renderResultDetail(AppState.currentResult); break;
            case 'stopwatch': this.renderStopwatch(); break;
            default: this.renderHome();
        }
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
        this.updateThemeToggleIcon();
    },

    getSettingsIcon() {
        return `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.21 17l.06-.06A1.65 1.65 0 0 0 4.6 15 1.65 1.65 0 0 0 3.09 14H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4.6 1.65 1.65 0  0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0  1 1 21 7.04l-.06.06A1.65 1.65 0 0 0 20.4 9c.65.29 1.11.93 1.18 1.67H21a2 2 0 1 1 0 4h-.09c-.27.31-.65.27-1.51.33z"/>
            </svg>
        `;
    },
    getHelpIcon() {
        return `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9 9a3 3 0 1 1 6 1c0 2-3 2-3 4" stroke-linecap="round"/>
                <circle cx="12" cy="17" r="1.8" fill="currentColor" stroke="none"/>
            </svg>
        `;
    },

    async startCountdown(seconds) {
        if (AppState.countdownActive) return;
        AppState.countdownActive = true;
        let remaining = Math.max(1, Math.min(10, parseInt(seconds || 0)));
        const display = document.getElementById('timeDisplay');
        const startBtn = document.getElementById('startBtn');
        if (startBtn) startBtn.disabled = true;
        // Show initial value and play first click immediately on press
        if (display) display.textContent = remaining.toString();
        await Utils.beep(880, 120);
        // Every second: decrement, update, click, or finish
        AppState.countdownIntervalId = setInterval(async () => {
            remaining -= 1;
            if (remaining > 0) {
                if (display) display.textContent = remaining.toString();
                await Utils.beep(880, 120);
            } else {
                clearInterval(AppState.countdownIntervalId);
                AppState.countdownIntervalId = null;
                // Play final tone and start immediately with no delay
                Utils.beep(1200, 220, 0.2);
                AppState.countdownActive = false;
                AppState.countdownSeconds = null;
                if (startBtn) startBtn.disabled = false;
                StopwatchManager.start();
                this.renderStopwatch();
            }
        }, 1000);
    },

    showCountdownDialog() {
        const modal = this.createModal(this.t('countdown.title'), `
            <div class="form-group">
                <label class="form-label">${this.t('countdown.secondsLabel')}</label>
                <input type="number" class="form-input" id="countdownInput" min="1" max="10" value="${AppState.countdownSeconds || 5}" inputmode="numeric"/>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancelCountdownBtn">${this.t('action.cancel')}</button>
                <button class="btn btn-primary" id="applyCountdownBtn">${this.t('action.apply')}</button>
            </div>
        `);
        const input = modal.querySelector('#countdownInput');
        modal.querySelector('#cancelCountdownBtn').addEventListener('click', ()=> modal.remove());
        modal.querySelector('#applyCountdownBtn').addEventListener('click', ()=>{
            const v = parseInt((input.value||'').trim());
            if (!isNaN(v) && v >= 1 && v <= 10) {
                AppState.countdownSeconds = v;
                modal.remove();
                this.renderStopwatch();
            } else {
                input.focus();
            }
        });
        setTimeout(()=>{ input && input.select && input.select(); }, 10);
    },

    // Voice control methods (UI scope)
    toggleVoiceControl() {
        if (!this._canUseSpeech()) {
            alert(this.t('error.voiceUnsupported'));
            return;
        }
        AppState.voice.enabled = !AppState.voice.enabled;
        if (AppState.voice.enabled) {
            this._startVoiceRecognition();
        } else {
            this._stopVoiceRecognition();
        }
        this.renderStopwatch();
    },
    _canUseSpeech() {
        return typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    },
    _voiceLastExecAt: 0,
    _voiceCooldownMs: 900,
    _getRecognizer() {
        if (!this._canUseSpeech()) return null;
        if (AppState.voice.recognizer) return AppState.voice.recognizer;
        const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new Ctor();
        rec.lang = AppState.voice.lang || (AppState.lang === 'hr' ? 'hr-HR' : 'en-US');
        rec.continuous = true;
        rec.interimResults = true; // allow early detection
        rec.maxAlternatives = 1; // faster
        // Provide a basic grammar of allowed commands (may be ignored by some engines)
        try {
            const GL = window.SpeechGrammarList || window.webkitSpeechGrammarList;
            if (GL) {
                const list = new GL();
                const jsgf = '#JSGF V1.0; grammar cmd; public <command> = start | next | pause | resume | stop | reset | pokreni | kreni | sljede | krug | pauza | nastavi | zaustavi | stani | resetiraj ;';
                list.addFromString(jsgf, 1);
                rec.grammars = list;
            }
        } catch(_) {}
        rec.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                const alt = res[0];
                const transcript = (alt && alt.transcript ? alt.transcript : '').toLowerCase().trim();
                if (!transcript) continue;
                // Execute immediately on interim if we detect a clear keyword
                if (this._tryExecuteVoiceFromTranscript(transcript, res.isFinal)) {
                    // If executed, break to avoid multiple triggers
                    break;
                }
            }
        };
        rec.onend = () => {
            AppState.voice.recognizing = false;
            if (AppState.voice.enabled) {
                setTimeout(() => { try { rec.start(); AppState.voice.recognizing = true; } catch(_){} }, 300);
            }
        };
        rec.onerror = () => {
            AppState.voice.recognizing = false;
            if (AppState.voice.enabled) {
                setTimeout(() => { try { rec.start(); AppState.voice.recognizing = true; } catch(_){} }, 800);
            }
        };
        AppState.voice.recognizer = rec;
        return rec;
    },
    _startVoiceRecognition() {
        const rec = this._getRecognizer();
        if (!rec) return;
        try {
            rec.start();
            AppState.voice.recognizing = true;
        } catch (_) { /* ignore */ }
    },
    _stopVoiceRecognition() {
        const rec = AppState.voice.recognizer;
        if (!rec) return;
        try { rec.onend = null; rec.stop(); } catch(_) {}
        AppState.voice.recognizing = false;
    },
    _isIOS() {
        if (typeof navigator === 'undefined') return false;
        const ua = navigator.userAgent || navigator.vendor || '';
        return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    },
    _voicePlay(name) {
        // Do not stop recognition; play using WebAudio/HTMLAudio fallback
        Sound.play(name);
    },
    _restartRecognitionSoon() {
        if (!AppState.voice || !AppState.voice.enabled) return;
        if (!this._isIOS()) return; // primarily needed on iOS
        const rec = AppState.voice.recognizer;
        if (!rec) return;
        try {
            setTimeout(() => {
                if (AppState.voice && AppState.voice.enabled && !AppState.voice.recognizing) {
                    try { rec.start(); AppState.voice.recognizing = true; } catch(_) {}
                }
            }, 300);
        } catch (_) {}
    },
    _tryExecuteVoiceFromTranscript(text, isFinal) {
        const now = Date.now();
        if (now - this._voiceLastExecAt < this._voiceCooldownMs) return false;
        const t = (text || '').toLowerCase();
        const has = (...words) => words.some(w => t.includes(w));
        let cmd = null;
        if (has('start','go','begin','pokreni','kreni')) cmd = 'start';
        else if (has('next','lap','sljede','krug')) cmd = 'next';
        else if (has('pause','pauza')) cmd = 'pause';
        else if (has('resume','continue','nastavi')) cmd = 'resume';
        else if (has('stop','zaustavi','stani')) cmd = 'stop';
        else if (has('reset','restart','resetiraj')) cmd = 'reset';
        if (!cmd) return false;

        if (cmd === 'start') {
            this._voiceCommandActive = true;
            if (AppState.resultChoiceTargetId && !AppState.remeasureResultId && !AppState.continueResultId) {
                this.showReOrContinuePrompt();
                this._voiceLastExecAt = now;
                setTimeout(() => { this._voiceCommandActive = false; }, 100);
                return true;
            }
            if (!AppState.stopwatch.isRunning && !AppState.stopwatch.isPaused) {
                if (AppState.countdownSeconds && !AppState.countdownActive) {
                    this.startCountdown(AppState.countdownSeconds);
                } else {
                    this._voicePlay('start');
                    StopwatchManager.start();
                    this.renderStopwatch();
                }
            }
            this._voiceLastExecAt = now;
            setTimeout(() => { this._voiceCommandActive = false; }, 100);
            this._restartRecognitionSoon();
            return true;
        }
        if (cmd === 'next') { this._voiceCommandActive = true; if (AppState.stopwatch.isRunning && !AppState.stopwatch.isPaused) { this._voicePlay('lap'); StopwatchManager.recordLap(); } this._voiceLastExecAt = now; setTimeout(() => { this._voiceCommandActive = false; }, 100); this._restartRecognitionSoon(); return true; }
        if (cmd === 'pause') { this._voiceCommandActive = true; if (AppState.stopwatch.isRunning && !AppState.stopwatch.isPaused) { this._voicePlay('pause'); StopwatchManager.pause(); this.renderStopwatch(); } this._voiceLastExecAt = now; setTimeout(() => { this._voiceCommandActive = false; }, 100); this._restartRecognitionSoon(); return true; }
        if (cmd === 'resume') { this._voiceCommandActive = true; if (AppState.stopwatch.isPaused) { this._voicePlay('resume'); StopwatchManager.resume(); this.renderStopwatch(); } this._voiceLastExecAt = now; setTimeout(() => { this._voiceCommandActive = false; }, 100); this._restartRecognitionSoon(); return true; }
        if (cmd === 'stop') { this._voiceCommandActive = true; this._voicePlay('stop'); StopwatchManager.stop(); this._voiceLastExecAt = now; setTimeout(() => { this._voiceCommandActive = false; }, 100); this._restartRecognitionSoon(); return true; }
        if (cmd === 'reset') { this._voiceCommandActive = true; this._voicePlay('reset'); StopwatchManager.reset(true); this._voiceLastExecAt = now; setTimeout(() => { this._voiceCommandActive = false; }, 100); this._restartRecognitionSoon(); return true; }
        return false;
    },

    updateThemeToggleIcon() {
        const btn = this.app && this.app.querySelector ? this.app.querySelector('#themeToggle') : null;
        if (btn) {
            btn.innerHTML = this.getThemeIcon();
        }
    },

    positionMenu(anchorRect, menuEl) {
        const margin = 8;
        const gap = 6;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        // Base position: below anchor
        let top = anchorRect.bottom + scrollY + gap;
        // Prefer aligning right edge to anchor's right (typical dropdown to the left of the anchor edge)
        let left = anchorRect.right + scrollX - menuEl.offsetWidth;

        // Clamp horizontally to viewport
        if (left < scrollX + margin) {
            left = scrollX + margin;
        }
        if (left + menuEl.offsetWidth > scrollX + vw - margin) {
            left = scrollX + vw - margin - menuEl.offsetWidth;
        }

        // If menu goes off bottom, flip above the anchor
        if (top + menuEl.offsetHeight > scrollY + vh - margin) {
            top = anchorRect.top + scrollY - menuEl.offsetHeight - gap;
            // If still offscreen at top, clamp to margin
            if (top < scrollY + margin) {
                top = scrollY + margin;
            }
        }

        return { top, left };
    },

    setupEventListeners() {
        // Theme toggle long-press handler
        let themeTogglePressTimer = null;
        let longPressTriggered = false;
        let recentTouchToggle = false; // suppress subsequent click after touch
        
        // UI click sounds are handled globally in setupClickSounds()
        
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
            if (e.target.closest('#helpBtn')) { this.showHelpDialog(); return; }
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
                if (confirm(this.t('confirm.deleteResult'))) {
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
                    if (confirm(this.t('confirm.deleteResult'))) {
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
            if (e.target.closest('#countdownBtn')) { this.showCountdownDialog(); return; }
            if (e.target.closest('#voiceToggle')) { this.toggleVoiceControl(); return; }
            if (e.target.closest('#startBtn')) {
                if (AppState.resultChoiceTargetId && !AppState.remeasureResultId && !AppState.continueResultId) {
                    this.showReOrContinuePrompt();
                    return;
                }
                if (AppState.countdownSeconds && !AppState.stopwatch.isRunning) {
                    this.startCountdown(AppState.countdownSeconds); return;
                }
                Sound.play('start');
                StopwatchManager.start(); this.renderStopwatch(); return; }
            if (e.target.closest('#pauseBtn')) { Sound.play('pause'); StopwatchManager.pause(); this.renderStopwatch(); return; }
            if (e.target.closest('#resumeBtn')) { Sound.play('resume'); StopwatchManager.resume(); this.renderStopwatch(); return; }
            if (e.target.closest('#stopBtn')) { Sound.play('stop'); StopwatchManager.stop(); return; }
            if (e.target.closest('#lapBtn')) { Sound.play('lap'); StopwatchManager.recordLap(); return; }
            if (e.target.closest('#resetBtn')) { Sound.play('reset'); StopwatchManager.reset(true); return; }
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
                if (AppState.stopwatch.isRunning && !confirm(this.t('confirm.stopSession'))) return;
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
            // Do not hijack keys while the user is typing in inputs/textareas/contenteditable
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
                return;
            }
            // If a modal is open (e.g., Save Result), avoid global shortcuts
            const modalOpen = document.querySelector('.modal');
            if (modalOpen) return;
            if (AppState.currentView === 'stopwatch') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (AppState.resultChoiceTargetId && !AppState.remeasureResultId && !AppState.continueResultId) {
                        this.showReOrContinuePrompt();
                        return;
                    }
                    if (!AppState.stopwatch.isRunning) {
                        if (AppState.countdownSeconds) {
                            this.startCountdown(AppState.countdownSeconds);
                        } else {
                            Sound.play('start');
                            StopwatchManager.start();
                            this.renderStopwatch();
                        }
                    } else if (!AppState.stopwatch.isPaused) {
                        Sound.play('pause');
                        StopwatchManager.pause();
                    } else {
                        Sound.play('resume');
                        StopwatchManager.resume();
                    }
                    if (AppState.stopwatch.isRunning) this.renderStopwatch();
                } else if (e.key === ' ') {
                    e.preventDefault();
                    Sound.play('lap');
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
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="helpBtn" class="icon-btn" title="${this.t('help.title')}">${this.getHelpIcon()}</button>
                    <button id="newFolderBtn" class="icon-btn" title="${this.t('tooltip.newProject')}">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                            <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
                        </svg>
                    </button>
                </div>
                <h1>${this.t('title.app')}</h1>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="settingsBtn" class="icon-btn" title="${this.t('action.settings')}">${this.getSettingsIcon()}</button>
                    <button id="themeToggle" class="icon-btn">${this.getThemeIcon()}</button>
                </div>
            </header>
            <main>
                ${folders.length === 0 ? `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                        </svg>
                        <p>${this.t('home.empty1')}<br>${this.t('home.empty2')}</p>
                    </div>
                ` : `
                    <div class="folders-grid">
                        ${folders.map(folder => {
                            const results = DataManager.getFolderResults(folder.id);
                            const folderColor = folder.color || 'var(--bg-secondary)';
                            const textVars = folder.textColor ? `; --folder-text: ${folder.textColor}; --folder-text-secondary: ${this.adjustColor(folder.textColor, -20)}` : '';
                            return `
                                <div class="folder-card" data-folder-id="${folder.id}" draggable="true" style="background: ${folderColor}${textVars};">
                                    <button class="folder-menu" data-folder-id="${folder.id}">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <circle cx="12" cy="5" r="1.5"/>
                                            <circle cx="12" cy="12" r="1.5"/>
                                            <circle cx="12" cy="19" r="1.5"/>
                                        </svg>
                                    </button>
                                    <h3>${folder.name}</h3>
                                    <div class="folder-count">${results.length} ${this.p('folder.result','folder.results', results.length)}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </main>
            ${!AppState.stopwatch.isRunning ? `
                <div class="fab-container">
                    <button class="fab large pulse" id="startStopwatchBtn" title="${this.t('tooltip.startStopwatch')}">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </button>
                </div>
            ` : ''}
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
                <button id="helpBtn" class="icon-btn" title="${this.t('help.title')}">${this.getHelpIcon()}</button>
                <button id="backBtn" class="icon-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1>${this.t('header.stopwatch')}</h1>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="settingsBtn" class="icon-btn" title="${this.t('action.settings')}">${this.getSettingsIcon()}</button>
                </div>
            </header>
            <main>
                <div class="stopwatch-container">
                    <div class="time-display" id="timeDisplay">${Utils.formatTime(AppState.stopwatch.elapsedTime)}</div>
                    <div class="controls">
                        ${!isRunning ? `
                            <div class="controls-stack">
                                <button class="btn btn-primary control-btn ${AppState.countdownSeconds ? 'pulse' : ''}" id="startBtn">${this.t('action.start')}${AppState.countdownSeconds ? ` (${AppState.countdownSeconds}${this.t('label.s')})` : ''}</button>
                                <div class="controls-row" style="margin-top:8px;justify-content:center;gap:10px;">
                                    <button class="icon-btn" id="countdownBtn" title="${this.t('tooltip.countdown')}" style="transform:scale(1.25);">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M9 2h6"/>
                                            <circle cx="12" cy="12" r="9"/>
                                            <path d="M12 12 L16 9 L13 15 Z" fill="currentColor" stroke="none"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="controls-row" style="margin-top:8px;justify-content:center;gap:10px;">
                                    <button class="icon-btn ${AppState.voice && AppState.voice.enabled ? 'active' : ''}" id="voiceToggle" title="${this.t('tooltip.voice')}">
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M12 1v5"/>
                                            <rect x="9" y="6" width="6" height="10" rx="3"/>
                                            <path d="M5 11v1a7 7 0 0 0 14 0v-1"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ` : isPaused ? `
                            <div class="controls-stack">
                                <button class="btn btn-success control-btn btn-next-big" id="resumeBtn">${this.t('action.resume')}</button>
                                <div class="controls-row">
                                    <button class="btn btn-secondary control-btn" id="resetBtn">${this.t('action.reset')}</button>
                                </div>
                            </div>
                        ` : `
                            <div class="controls-stack">
                                <button class="btn btn-primary control-btn btn-next-big" id="lapBtn">${this.t('action.next')}</button>
                                <div class="controls-row">
                                    <button class="btn control-btn" id="pauseBtn" style="background: var(--warning); color: white;">${this.t('action.pause')}</button>
                                    <button class="btn btn-danger control-btn" id="stopBtn">${this.t('action.stop')}</button>
                                </div>
                            </div>
                        `}
                        ${(!isRunning && laps.length > 0) ? `<button class="btn btn-danger control-btn" id="resetBtn">${this.t('action.reset')}</button>` : ''}
                    </div>
                    ${laps.length > 0 ? `
                        <div class="laps-container">
                            <div class="laps-header">
                                <span>${this.t('stopwatch.laps')} (${laps.length})</span>
                                <span>${this.t('stopwatch.avg')}: ${Utils.formatTime(Utils.calculateAverage(laps))}</span>
                            </div>
                            <div class="laps-list">
                                ${laps.slice().reverse().map(lap => `
                                    <div class="lap-item">
                                        <div class="lap-number">${this.t('stopwatch.lap')} ${lap.number}</div>
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
            alert(this.t('error.projectNotFound'));
            this.renderHome();
            return;
        }
        const results = DataManager.getFolderResults(folderId);
        
        this.app.innerHTML = `
            <header>
                <button id="helpBtn" class="icon-btn" title="${this.t('help.title')}">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 115.82 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12" y2="17"/></svg>
                </button>
                <button id="backBtn" class="icon-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1>${folder.name}</h1>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="settingsBtn" class="icon-btn" title="${this.t('action.settings')}">${this.getSettingsIcon()}</button>
                </div>
            </header>
            <main>
                ${results.length === 0 ? `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <p>${this.t('folder.empty1')}<br>${this.t('folder.empty2')}</p>
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
            ${!AppState.stopwatch.isRunning ? `
                <div class="fab-container">
                    <button class="fab large pulse" id="startStopwatchBtn" title="Start Stopwatch">
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
                <button id="helpBtn" class="icon-btn" title="${this.t('help.title')}">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 115.82 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12" y2="17"/></svg>
                </button>
                <button id="backBtn" class="icon-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1>${result.name}</h1>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button id="settingsBtn" class="icon-btn" title="${this.t('action.settings')}">${this.getSettingsIcon()}</button>
                </div>
            </header>
            <main>
                <div class="result-detail">
                    ${result.image ? `<img src="${result.image}" alt="Result image" class="result-image">` : ''}
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">${this.t('resultDetail.totalTime')}</div>
                            <div class="stat-value">${Utils.formatTimeCustom(result.totalTime, AppState.display.timeMode, AppState.display.showHundredths)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">${this.t('stopwatch.laps')}</div>
                            <div class="stat-value">${result.laps.length}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">${this.t('stopwatch.avgLap')}</div>
                            <div class="stat-value">${Utils.formatTimeCustom(avgLapTime, AppState.display.timeMode, AppState.display.showHundredths)}</div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" id="calculateBtn">${this.t('action.calculate')}</button>
                    <div class="laps-container">
                        <div class="laps-header">${this.t('stopwatch.allLaps')}</div>
                        <div class="laps-list">
                            ${result.laps.map((lap, idx) => `
                                <div class="lap-item" data-lap-index="${idx}" data-result-id="${result.id}">
                                    <div class="lap-number">${this.t('stopwatch.lap')} ${lap.number}</div>
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
        const modal = this.createModal(this.t('newProject.title'), `
            <form id="newFolderForm">
                <div class="form-group">
                    <label class="form-label">${this.t('newProject.name')}</label>
                    <input type="text" class="form-input" id="folderNameInput" required autofocus>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" id="cancelBtn">${this.t('action.cancel')}</button>
                    <button type="submit" class="btn btn-primary">${this.t('action.create')}</button>
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
    
    createModal(title, content, options = {}) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">${title}</div>
                ${content}
            </div>
        `;
        document.body.appendChild(modal);
        const closeOnOutside = options.closeOnOutside !== false;
        if (closeOnOutside) {
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        }
        return modal;
    },

    showHelpDialog() {
        const content = `
            <div class="help-body">
                <p><strong>${this.t('help.whatTitle')}</strong><br>${this.t('help.whatText')}</p>
                <hr>
                <p><strong>${this.t('help.controlsTitle')}</strong><br>${this.t('help.controlsText')}</p>
                <ul>
                    <li>${this.t('help.ctrlStart')}</li>
                    <li>${this.t('help.ctrlNext')}</li>
                    <li>${this.t('help.ctrlPause')}</li>
                    <li>${this.t('help.ctrlResume')}</li>
                    <li>${this.t('help.ctrlStop')}</li>
                    <li>${this.t('help.ctrlReset')}</li>
                </ul>
                <p><strong>${this.t('help.countdownTitle')}</strong><br>${this.t('help.countdownText')}</p>
                <p><strong>${this.t('help.voiceTitle')}</strong><br>${this.t('help.voiceText')}</p>
                <p><strong>${this.t('help.soundsTitle')}</strong><br>${this.t('help.soundsText')}</p>
                <p><strong>${this.t('help.saveTitle')}</strong><br>${this.t('help.saveText')}</p>
                <p><strong>${this.t('help.tipsTitle')}</strong><br>${this.t('help.tipsText')}</p>
            </div>`;
        const modal = this.createModal(this.t('help.title'), content);
        const btn = document.createElement('div');
        btn.style.textAlign = 'right';
        btn.innerHTML = `<button class="btn btn-primary" id="closeHelpBtn">${this.t('action.close')}</button>`;
        modal.querySelector('.modal-content').appendChild(btn);
        modal.querySelector('#closeHelpBtn').addEventListener('click', ()=> modal.remove());
    },

    showRemoveLapDialog(resultId, lapIndex) {
        const result = DataManager.getResults().find(r => r.id === resultId);
        if (!result || !result.laps || lapIndex < 0 || lapIndex >= result.laps.length) return;
        
        const lap = result.laps[lapIndex];
        const lapNum = lap.number;
        const modalText = this.t('lap.removeText').replace('{number}', lapNum);
        
        const modal = this.createModal(this.t('lap.removeTitle'), `
            <div class="form-group">
                <p>${modalText}</p>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancelRemoveLapBtn">${this.t('action.cancel')}</button>
                <button class="btn btn-primary" id="confirmRemoveLapBtn">${this.t('lap.remove')}</button>
            </div>
        `);
        
        modal.querySelector('#cancelRemoveLapBtn').addEventListener('click', () => modal.remove());
        modal.querySelector('#confirmRemoveLapBtn').addEventListener('click', () => {
            this.removeLap(resultId, lapIndex);
            modal.remove();
        });
    },

    removeLap(resultId, lapIndex) {
        const result = DataManager.getResults().find(r => r.id === resultId);
        if (!result || !result.laps || lapIndex < 0 || lapIndex >= result.laps.length) return;
        
        // Remove the lap
        const updatedLaps = result.laps.filter((_, idx) => idx !== lapIndex);
        
        // Renumber and recalculate cumulative times
        let cumulativeTime = 0;
        updatedLaps.forEach((lap, idx) => {
            lap.number = idx + 1;
            cumulativeTime += lap.time;
            lap.cumulative = cumulativeTime;
        });
        
        // Recalculate total time
        const totalTime = updatedLaps.length > 0 ? updatedLaps[updatedLaps.length - 1].cumulative : 0;
        
        // Update the result
        DataManager.updateResult(resultId, { laps: updatedLaps, totalTime });
        
        // Re-render the result detail
        this.renderResultDetail(resultId);
    },
    
    showReOrContinuePrompt() {
        const targetId = AppState.resultChoiceTargetId;
        if (!targetId) return;
        const result = DataManager.getResults().find(r => r.id === targetId);
        if (!result) { AppState.resultChoiceTargetId = null; return; }
        const total = Utils.formatTime(result.totalTime);
        const modal = this.createModal(this.t('choice.modalTitle'), `
            <div class="form-group">
                <div class="choice-grid">
                    <button type="button" class="choice-card active" data-choice="continue">
                        <div class="choice-title">${this.t('choice.continueTitle')}</div>
                        <div class="choice-sub">${result.laps.length} ${this.t('stopwatch.laps')} • ${total}</div>
                        <div class="choice-desc">${this.t('choice.continueDesc')}</div>
                    </button>
                    <button type="button" class="choice-card" data-choice="remeasure">
                        <div class="choice-title">${this.t('choice.remeasureTitle')}</div>
                        <div class="choice-sub">0 ${this.t('stopwatch.laps')}</div>
                        <div class="choice-desc">${this.t('choice.remeasureDesc')}</div>
                    </button>
                </div>
            </div>
            <div class="modal-actions mt-3">
                <button class="btn btn-secondary" id="cancelChoiceBtn">${this.t('action.cancel')}</button>
                <button class="btn btn-primary" id="applyChoiceBtn">${this.t('action.proceed')}</button>
            </div>
        `);
        let selected = 'continue';
        modal.querySelectorAll('.choice-card').forEach(card => {
            card.addEventListener('click', () => {
                modal.querySelectorAll('.choice-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selected = card.dataset.choice;
            });
        });
        modal.querySelector('#cancelChoiceBtn').addEventListener('click', () => { modal.remove(); });
        modal.querySelector('#applyChoiceBtn').addEventListener('click', () => {
            if (selected === 'continue') {
                AppState.continueResultId = result.id;
                AppState.remeasureResultId = null;
                // Load into stopwatch
                AppState.stopwatch.laps = Array.isArray(result.laps) ? [...result.laps] : [];
                AppState.stopwatch.elapsedTime = result.totalTime || 0;
                AppState.stopwatch.startTime = null;
                AppState.stopwatch.isRunning = false;
                AppState.stopwatch.isPaused = false;
                this.renderStopwatch();
            } else {
                AppState.remeasureResultId = result.id;
                AppState.continueResultId = null;
                // Reset stopwatch to zero state (no save)
                AppState.stopwatch.startTime = null;
                AppState.stopwatch.pausedTime = 0;
                AppState.stopwatch.elapsedTime = 0;
                AppState.stopwatch.laps = [];
                AppState.stopwatch.isRunning = false;
                AppState.stopwatch.isPaused = false;
                this.renderStopwatch();
            }
            AppState.resultChoiceTargetId = null;
            modal.remove();
        });
    },
    
    showSaveDialog() {
        const folders = DataManager.getFolders();
        const existingId = AppState.remeasureResultId || AppState.continueResultId;
        const isUpdate = !!existingId;
        const existingResult = isUpdate ? DataManager.getResults().find(r => r.id === existingId) : null;
        
        const modal = this.createModal(isUpdate ? this.t('save.titleUpdate') : this.t('save.titleSave'), `
            <form id="saveResultForm">
                <div class="form-group">
                    <label class="form-label">${this.t('save.resultName')}</label>
                    <input type="text" class="form-input" id="resultNameInput" required autofocus value="${existingResult ? existingResult.name : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">${this.t('save.project')}</label>
                    <select class="form-select" id="folderSelect" required>
                        <option value="">${this.t('save.selectProject')}</option>
                        ${folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
                        <option value="__new__">${this.t('save.createNewProject')}</option>
                    </select>
                </div>
                <div class="form-group hidden" id="newFolderGroup">
                    <label class="form-label">${this.t('save.newProjectName')}</label>
                    <input type="text" class="form-input" id="newFolderInput">
                </div>
                <div class="form-group">
                    <label class="form-label">${this.t('save.attachImage')}</label>
                    <div class="file-input-wrapper">
                        <label class="file-input-label">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                            </svg>
                            <span>${this.t('action.chooseImage')}</span>
                            <input type="file" class="file-input" id="imageInput" accept="image/*">
                        </label>
                    </div>
                    <img id="imagePreview" class="image-preview hidden" alt="Preview">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" id="cancelSaveBtn">${this.t('action.cancel')}</button>
                    <button type="submit" class="btn btn-success">${isUpdate ? this.t('action.update') : this.t('action.save')}</button>
                </div>
            </form>
        `);
        
        const folderSelect = modal.querySelector('#folderSelect');
        const newFolderGroup = modal.querySelector('#newFolderGroup');
        const imageInput = modal.querySelector('#imageInput');
        const imagePreview = modal.querySelector('#imagePreview');

        // Preselect folder (either from remeasure or from preselectedFolder)
        const targetFolder = isUpdate && existingResult ? existingResult.folderId : AppState.preselectedFolder;
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
                    alert(this.t('prompt.enterProjectName'));
                    return;
                }
                const parentId = AppState.currentView === 'folder' ? AppState.currentFolder : null;
                folderId = DataManager.createFolder(newFolderName, parentId).id;
            }
            
            if (isUpdate && existingResult) {
                // Update existing result
                DataManager.updateResult(existingResult.id, {
                    name: modal.querySelector('#resultNameInput').value.trim(),
                    folderId,
                    totalTime: AppState.stopwatch.elapsedTime,
                    laps: [...AppState.stopwatch.laps],
                    image: imagePreview.src && !imagePreview.classList.contains('hidden') ? imagePreview.src : existingResult.image
                });
                AppState.remeasureResultId = null;
                AppState.continueResultId = null;
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
        
        const modal = this.createModal(this.t('calc.title'), `
            <div class="calc-tabs">
                <button class="calc-tab active" data-tab="quantity">${this.t('calc.tab.quantity')}</button>
                <button class="calc-tab" data-tab="time">${this.t('calc.tab.time')}</button>
                <button class="calc-tab" data-tab="price">${this.t('calc.tab.price')}</button>
            </div>
            <div id="quantityPanel">
                <div class="form-group">
                    <label class="form-label">${this.t('calc.numberOfItems')}</label>
                    <input type="number" inputmode="numeric" class="form-input" id="quantityInput" min="1" value="100">
                </div>
                <button class="btn btn-primary btn-block" id="calcQuantityBtn">${this.t('action.calculate')}</button>
                <div class="calc-result hidden" id="quantityResult">
                    <div class="calc-result-label">${this.t('calc.estimatedTotalTime')}</div>
                    <div class="calc-result-value" id="quantityValue"></div>
                </div>
            </div>
            <div id="timePanel" class="hidden">
                <div class="form-group">
                    <label class="form-label">${this.t('calc.duration')}</label>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="number" inputmode="numeric" class="form-input" id="hoursInput" min="0" max="23" placeholder="0" value="1" style="width:80px;" />
                        <span>${this.t('label.h')}</span>
                        <input type="number" inputmode="numeric" class="form-input" id="minutesInput" min="0" max="59" placeholder="0" value="30" style="width:80px;" />
                        <span>${this.t('label.m')}</span>
                        <input type="number" inputmode="numeric" class="form-input" id="secondsInput" min="0" max="59" placeholder="0" value="0" style="width:80px;" />
                        <span>${this.t('label.s')}</span>
                        <div id="durationPreview" style="margin-left:auto;font-weight:600;"></div>
                    </div>
                </div>
                <button class="btn btn-primary btn-block" id="calcTimeBtn">${this.t('action.calculate')}</button>
                <div class="calc-result hidden" id="timeResult">
                    <div class="calc-result-label">${this.t('calc.estimatedQuantity')}</div>
                    <div class="calc-result-value" id="timeValue"></div>
                </div>
            </div>
            <div id="pricePanel" class="hidden">
                <div class="form-group">
                    <label class="form-label">${this.t('calc.hourlyWage')} (${AppState.currency})</label>
                    <input type="number" inputmode="decimal" class="form-input" id="wageInput" min="0" step="0.01" value="${result.hourlyWage || ''}">
                </div>
                <button class="btn btn-primary btn-block" id="calcPriceBtn">${this.t('action.calculate')}</button>
                <div class="calc-result hidden" id="priceResult">
                    <div class="calc-result-label">${this.t('calc.pricePerPiece')}</div>
                    <div class="calc-result-value" id="priceValue"></div>
                </div>
            </div>
            <div class="modal-actions mt-3"><button class="btn btn-secondary" id="closeCalcBtn">${this.t('action.close')}</button></div>
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
                    <label class="form-label">${this.t('settings.language')}</label>
                    <select class="form-select" id="langSelect">
                        ${[
                            {code:'en',name:'English'},
                            {code:'hr',name:'Hrvatski'},
                            {code:'it',name:'Italiano'},
                            {code:'de',name:'Deutsch'},
                            {code:'es',name:'Español'},
                            {code:'pt-BR',name:'Português (Brasil)'},
                            {code:'pt',name:'Português'},
                            {code:'fr',name:'Français'},
                            {code:'pl',name:'Polski'},
                            {code:'ru',name:'Русский'},
                            {code:'da',name:'Dansk'},
                            {code:'zh-Hans',name:'简体中文'},
                            {code:'uk',name:'Українська'},
                            {code:'fi',name:'Suomi'},
                            {code:'sv',name:'Svenska'},
                            {code:'ar',name:'العربية'},
                            {code:'hi',name:'हिन्दी'},
                            {code:'bn',name:'বাংলা'},
                            {code:'ta',name:'தமிழ்'}
                        ].map(o=>`<option value="${o.code}" ${AppState.lang===o.code ? 'selected' : ''}>${o.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${this.t('settings.units')}</label>
                    <select class="form-select" id="unitsSelect">
                        <option value="metric" ${AppState.units === 'metric' ? 'selected' : ''}>${this.t('settings.metric')}</option>
                        <option value="imperial" ${AppState.units === 'imperial' ? 'selected' : ''}>${this.t('settings.imperial')}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${this.t('settings.currency')}</label>
                    <select class="form-select" id="currencySelect">
                        <option value="€" ${AppState.currency === '€' ? 'selected' : ''}>${this.t('currency.euro')}</option>
                        <option value="$" ${AppState.currency === '$' ? 'selected' : ''}>${this.t('currency.usd')}</option>
                        <option value="£" ${AppState.currency === '£' ? 'selected' : ''}>${this.t('currency.gbp')}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${this.t('settings.power')}</label>
                    <label style="display:flex;gap:8px;align-items:center;">
                        <input type="checkbox" id="keepAwakeCharge" ${AppState.keepAwakeOnCharge ? 'checked' : ''}/>
                        ${this.t('settings.keepAwake')}
                    </label>
                    <p style="margin:6px 0 0;color:var(--text-secondary);font-size:12px;">${this.t('info.wakeLockNote')}</p>
                </div>
            `;
        } else if (view === 'folder') {
            body = `<p>${this.t('settings.projectSettings')}</p>`;
        } else if (view === 'result') {
            body = `
                <div class="form-group">
                    <label class="form-label">${this.t('settings.timeDisplay')}</label>
                    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                        <label><input type="radio" name="timeMode" value="hms" ${AppState.display.timeMode === 'hms' ? 'checked' : ''}/> ${this.t('settings.hms')}</label>
                        <label><input type="radio" name="timeMode" value="ms" ${AppState.display.timeMode === 'ms' ? 'checked' : ''}/> ${this.t('settings.ms')}</label>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">${this.t('settings.precision')}</label>
                    <label><input type="checkbox" id="showHundredths" ${AppState.display.showHundredths ? 'checked' : ''}/> ${this.t('settings.showHundredths')}</label>
                </div>
                <hr style="margin:20px 0;border:none;border-top:2px solid var(--border);"/>
                <div class="menu-list">
                    <button class="menu-item" id="remeasureItem">${this.t('settings.reOrContinue')}</button>
                    <button class="menu-item" id="openUpdateImage">${this.t('settings.uploadChangeImage')}</button>
                </div>
            `;
        }
        const modal = this.createModal(this.t('action.settings'), `
            <div>${body}</div>
            <div class="modal-actions mt-3">
                <button class="btn btn-secondary" id="closeSettingsBtn">${this.t('action.close')}</button>
            </div>
        `, { closeOnOutside: false });
        modal.querySelector('#closeSettingsBtn').addEventListener('click', () => modal.remove());

        // Persist settings when changed (Home view)
        const langSel = modal.querySelector('#langSelect');
        if (langSel) {
            langSel.addEventListener('change', () => {
                AppState.lang = langSel.value;
                localStorage.setItem('as_lang', AppState.lang);
                this.applyLanguage();
                modal.remove();
                this.rerenderCurrentView();
            });
        }
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
        // Home: keep awake while charging toggle
        const keepAwakeCb = modal.querySelector('#keepAwakeCharge');
        if (keepAwakeCb) {
            keepAwakeCb.addEventListener('change', async () => {
                AppState.keepAwakeOnCharge = !!keepAwakeCb.checked;
                localStorage.setItem('as_keepAwakeCharge', JSON.stringify(AppState.keepAwakeOnCharge));
                if (!('wakeLock' in navigator)) {
                    alert(this.t('error.wakeLockUnsupported'));
                }
                AppState.updateKeepAwakeBinding && AppState.updateKeepAwakeBinding();
            });
        }
        // Result view specific handlers
        const remeasureBtn = modal.querySelector('#remeasureItem');
        if (remeasureBtn) {
            remeasureBtn.addEventListener('click', () => {
                modal.remove();
                // Prepare choice on Stopwatch screen
                AppState.remeasureResultId = null;
                AppState.continueResultId = null;
                AppState.resultChoiceTargetId = AppState.currentResult;
                StopwatchManager.reset(true);
                this.renderStopwatch();
                this.showReOrContinuePrompt();
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

        const modal = this.createModal(this.t('theme.title'), `
            <div class="form-group">
                <label class="form-label">${this.t('theme.preset')} (${currentMode === 'dark' ? this.t('theme.darkMode') : this.t('theme.lightMode')})</label>
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
                <label class="form-label">${this.t('theme.customColors')}</label>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${this.t('theme.fineTune')}</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">${this.t('theme.background')}</label>
                        <input type="color" class="color-picker" id="customPrimary" value="${currentCustomColors?.primary || palettes[currentMode][0].colors.primary}">
                    </div>
                    <div>
                        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">${this.t('theme.accent')}</label>
                        <input type="color" class="color-picker" id="customAccent" value="${currentCustomColors?.accent || palettes[currentMode][0].colors.accent}">
                    </div>
                    <div>
                        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">${this.t('theme.text')}</label>
                        <input type="color" class="color-picker" id="customText" value="${currentCustomColors?.text || palettes[currentMode][0].colors.text}">
                    </div>
                    <div>
                        <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">${this.t('theme.border')}</label>
                        <input type="color" class="color-picker" id="customBorder" value="${currentCustomColors?.border || palettes[currentMode][0].colors.border}">
                    </div>
                </div>
                <button class="btn btn-secondary btn-block" id="applyCustomBtn" style="margin-top:12px;">${this.t('theme.applyCustom')}</button>
            </div>
            <div class="modal-actions mt-3">
                <button class="btn btn-secondary" id="closeThemeBtn">${this.t('action.close')}</button>
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
            <button class="menu-item" data-action="color" data-folder-id="${folderId}">${this.t('menu.chooseProjectColor')}</button>
            <button class="menu-item" data-action="text-color" data-folder-id="${folderId}">${this.t('menu.chooseProjectTextColor')}</button>
            <button class="menu-item" data-action="delete" data-folder-id="${folderId}">${this.t('menu.delete')}</button>
        `;
        document.body.appendChild(menu);
        const rect = anchorEl.getBoundingClientRect();
        const pos = this.positionMenu(rect, menu);
        menu.style.top = `${pos.top}px`;
        menu.style.left = `${pos.left}px`;
        this._openMenu = menu;
        
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.menu-item');
            if (!item) return;
            const action = item.dataset.action;
            
            if (action === 'delete') {
                if (confirm(this.t('confirm.deleteProject'))) {
                    DataManager.deleteFolder(folderId);
                    this.closeResultMenu();
                    this.renderHome();
                }
            } else if (action === 'color') {
                this.closeResultMenu();
                this.showFolderColorDialog(folderId);
            } else if (action === 'text-color') {
                this.closeResultMenu();
                this.showFolderTextColorDialog(folderId);
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
        
        const modal = this.createModal(this.t('menu.chooseProjectColor'), `
            <div class="form-group">
                <label class="form-label">${this.t('color.preset')}</label>
                <div class="color-palette-grid">
                    ${presetColors.map(color => `
                        <button class="color-palette-btn" data-color="${color}" style="background: ${color};"></button>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">${this.t('color.custom')}</label>
                <input type="color" class="color-picker" id="customColorPicker" value="${folder.color || '#3b82f6'}">
            </div>
            <div class="modal-actions mt-3">
                <button class="btn btn-secondary" id="cancelColorBtn">${this.t('action.cancel')}</button>
                <button class="btn btn-primary" id="applyColorBtn">${this.t('action.apply')}</button>
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
    
    showFolderTextColorDialog(folderId) {
        const folders = DataManager.getFolders();
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return;
        const presetColors = [
            '#0f172a', '#111827', '#1f2937', '#334155', '#475569',
            '#64748b', '#94a3b8', '#e5e7eb', '#f9fafb', '#ffffff'
        ];
        const modal = this.createModal(this.t('menu.chooseProjectTextColor'), `
            <div class="form-group">
                <label class="form-label">${this.t('color.preset')}</label>
                <div class="color-palette-grid">
                    ${presetColors.map(color => `
                        <button class="color-palette-btn" data-color="${color}" style="background: ${color}; border: 1px solid var(--border);"></button>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">${this.t('color.custom')}</label>
                <input type="color" class="color-picker" id="customTextColorPicker" value="${folder.textColor || '#ffffff'}">
            </div>
            <div class="modal-actions mt-3">
                <button class="btn btn-secondary" id="cancelTextColorBtn">${this.t('action.cancel')}</button>
                <button class="btn btn-primary" id="applyTextColorBtn">${this.t('action.apply')}</button>
            </div>
        `);
        modal.querySelector('#cancelTextColorBtn').addEventListener('click', () => modal.remove());
        let selectedColor = folder.textColor || null;
        modal.querySelectorAll('.color-palette-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedColor = btn.dataset.color;
                modal.querySelectorAll('.color-palette-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });
        modal.querySelector('#customTextColorPicker').addEventListener('change', (e) => {
            selectedColor = e.target.value;
        });
        modal.querySelector('#applyTextColorBtn').addEventListener('click', () => {
            const idx = folders.findIndex(f => f.id === folderId);
            if (idx !== -1) {
                folders[idx].textColor = selectedColor;
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
        menu.innerHTML = `<button class="menu-item" data-action="delete" data-result-id="${resultId}">${this.t('menu.delete')}</button>`;
        document.body.appendChild(menu);
        const rect = anchorEl.getBoundingClientRect();
        const pos = this.positionMenu(rect, menu);
        menu.style.top = `${pos.top}px`;
        menu.style.left = `${pos.left}px`;
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
        const modal = this.createModal(this.t('dialog.updateImageTitle') || 'Update Image', `
            <div class="form-group">
                <label class="form-label">${this.t('action.chooseImage')}</label>
                <div class="file-input-wrapper">
                    <label class="file-input-label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span>${this.t('action.chooseImage')}</span>
                        <input type="file" class="file-input" id="updateImageInput" accept="image/*">
                    </label>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancelUpdateBtn">${this.t('action.cancel')}</button>
                <button class="btn btn-success" id="applyUpdateBtn" disabled>${this.t('action.save')}</button>
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

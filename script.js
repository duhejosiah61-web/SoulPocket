//=========================================================================
// == SoulPocket app script
// =========================================================================
import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { useFeed } from './feed.js';
import { useMate } from './mate.js';
import { useNotice } from './notice.js';
import { useGames } from './games.js';
import { useLive } from './live.js';
import { usePeek } from './peek.js';
import { useRead } from './read.js';
import { useNest } from './nest.js';
import { useMusic } from './music.js';
import { useEmber } from './ember.js';
import { attachSoulStoreCoordinators } from './store.js';
import { useLockScreen } from './composables/useLockScreen.js';
import { useTheme } from './composables/useTheme.js';
import { useChatSettings } from './composables/useChatSettings.js';
import { useChat } from './composables/useChat.js';
import { useAttachment } from './composables/useAttachment.js';
import { useConsole } from './composables/useConsole.js';
import { useWorkshop } from './composables/useWorkshop.js';
import { useHome } from './composables/useHome.js';
import { callAI } from './api.js';


export function setupApp() {
    console.log('setup start'); 
    
    const lock = useLockScreen();
    /** useChat 仍接收 isGuest ref；已不再使用账号体系，恒为 false */
    const chatIsGuestStub = ref(false);
    const theme = useTheme();
    const {
        fonts,
        selectedFont,
        globalSelectedFont,
        customFontCount,
        showFontImportDialog,
        newFontName,
        newFontUrl,
        globalFontFileInput,
        selectFont,
        selectGlobalFont,
        saveFont,
        importCustomFont,
        addFontByUrl,
        initFonts,
        homeWallpaper,
        homeWallpaperInput,
        homeTextColor,
        homeTextColorInput,
        saveHomeWallpaper,
        saveHomeTextColor,
        enableHomeGlass,
        toggleHomeGlass,
        enableHideStatusBar,
        toggleHideStatusBar,
        enableNotchAdaptation,
        toggleNotchAdaptation,
        loadFontCSS,
        loadGlobalFontCSS
    } = theme;
    const lockFont = selectedFont;

    let chat = null;
    const chatPersistence = {
        saveSoulLinkMessages: async () => {},
        saveSoulLinkGroups: async () => {},
        saveArchivedChats: async () => {}
    };
    // Theme（非锁屏）相关：清空主版本缓存，方便你重做这一块
    // 注意：锁屏相关 key 不动
    try {
        localStorage.removeItem('themeMode');
        localStorage.removeItem('themeWallpaper');
    } catch (e) {
        // ignore
    }
    
    // 这些核心状态会在 mounted 初始化链路中被引用，
    // 需要尽早初始化，避免 setup 中途异常导致 TDZ 报错。
    const soulLinkPet = ref({
        name: 'PIXEL PET',
        emoji: '🐾',
        energy: 80,
        hunger: 20,
        mood: 70,
        lastTick: Date.now()
    });
    const userAvatar = ref('');
    const runImageProcessor = (dataUrl, preset, onDone) => {
        const processor = typeof globalThis.compressAvatarImage === 'function'
            ? globalThis.compressAvatarImage
            : null;
        if (processor) {
            processor(dataUrl, preset, onDone);
            return;
        }
        // 裁剪器尚未初始化时，先直接回填图片，避免更换失败
        onDone(dataUrl);
    };

    // 压缩图片
    const compressImage = (file, maxWidth, quality) => {
        return new Promise((resolve) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            
            img.src = URL.createObjectURL(file);
        });
    };

    // 日期相关（音乐组件等；主屏状态栏/锁屏时间由 useHome）
    const chineseDate = ref('');
    const fullDate = ref('');

    const currentDay = ref('');
    const currentMonth = ref('');
    const currentMonthEn = ref('');
    const currentDayOfMonth = ref('');
    
    // 更新时间
    const updateTime = () => {
        const now = new Date();

        // 星期
        const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        currentDay.value = days[now.getDay()];
        
        // 月份
        const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
        currentMonth.value = months[now.getMonth()];

        // 月份（英文，用于音乐组件日期占位）
        const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        currentMonthEn.value = monthsEn[now.getMonth()];
        
        // 日期
        currentDayOfMonth.value = now.getDate().toString();
        
        // 公历日期（2026年3月17日格式）
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        fullDate.value = `${year}年${month}月${day}日`;
        
        // 汉字日期
        const chineseMonths = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
        const chineseDays = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '二十一', '二十二', '二十三', '二十四', '二十五', '二十六', '二十七', '二十八', '二十九', '三十'];
        chineseDate.value = `${chineseMonths[now.getMonth()]}月${chineseDays[now.getDate()]}`;
    };
    
    // 初始化时间
    updateTime();
    
    // 每秒更新时间
    setInterval(updateTime, 1000);
    
    // IndexedDB 初始化
    let db = null;
    const DB_NAME = 'SoulOS_DB';
    const DB_VERSION = 2;
    
    const initDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => {
                console.error('IndexedDB 打开失败');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                db = request.result;
                console.log('IndexedDB 打开成功');
                resolve(db);
            };
            
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                if (!database.objectStoreNames.contains('soulLinkMessages')) {
                    database.createObjectStore('soulLinkMessages', { keyPath: 'id' });
                }
                
                if (!database.objectStoreNames.contains('soulLinkGroups')) {
                    database.createObjectStore('soulLinkGroups', { keyPath: 'id' });
                }
                
                if (!database.objectStoreNames.contains('archivedChats')) {
                    database.createObjectStore('archivedChats', { keyPath: 'id' });
                }
                
                if (!database.objectStoreNames.contains('settings')) {
                    database.createObjectStore('settings', { keyPath: 'key' });
                }

                if (!database.objectStoreNames.contains('gameStates')) {
                    database.createObjectStore('gameStates', { keyPath: 'id' });
                }
            };
        });
    };
    
    const dbGet = (storeName, key) => {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('数据库未初始化'));
                return;
            }
            
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };
    
    const dbPut = (storeName, data) => {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('数据库未初始化'));
                return;
            }
            
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    };
    
    const dbGetAll = (storeName) => {
        return new Promise((resolve, reject) => {
            if (!db) {
                reject(new Error('数据库未初始化'));
                return;
            }
            
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };
    
    try {
        // --- DATA (State) ---
        const deviceBatteryLevel = ref(null);
        const deviceBatteryCharging = ref(false);
        const deviceNetworkType = ref('');
        const deviceNetworkOnline = ref(true);
        const openedApp = ref(null);
        
        // 主屏幕状态 - 必须在openedApp定义之后（无账号门闸：解锁且无打开应用即显示）
        const isHomeScreenVisible = computed(
            () =>
                !lock.isLockScreenVisible.value &&
                !openedApp.value
        );

        const randomHexCode = ref('0x00000000');
        const isPlaying = ref(false);
        
        const generateRandomHex = () => {
            const hex = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0');
            randomHexCode.value = `0x${hex}`;
        };
        
        const currentScreen = computed(() => {
             return openedApp.value ? openedApp.value.toLowerCase() : 'homescreen';
        });

        const deviceBatteryText = computed(() => {
            if (deviceBatteryLevel.value === null || Number.isNaN(deviceBatteryLevel.value)) {
                return '电量 --';
            }
            const suffix = deviceBatteryCharging.value ? ' 充电中' : '';
            return `电量 ${deviceBatteryLevel.value}%${suffix}`;
        });

        const deviceSignalText = computed(() => {
            if (!deviceNetworkOnline.value) {
                return '信号 无网络';
            }
            const raw = (deviceNetworkType.value || '').toLowerCase();
            const map = {
                'slow-2g': '2G',
                '2g': '2G',
                '3g': '3G',
                '4g': '4G',
                '5g': '5G',
                'wifi': 'WiFi',
                'ethernet': 'ETH'
            };
            const label = map[raw] || (raw ? raw.toUpperCase() : '在线');
            return `信号 ${label}`;
        });

        const updateBatteryStatus = (battery) => {
            if (!battery) return;
            deviceBatteryLevel.value = Math.round(battery.level * 100);
            deviceBatteryCharging.value = battery.charging;
        };

        const updateNetworkStatus = (connection) => {
            deviceNetworkOnline.value = navigator.onLine;
            if (!connection) {
                deviceNetworkType.value = '';
                return;
            }
            const type = connection.effectiveType || connection.type || '';
            deviceNetworkType.value = type;
        };

        const initDeviceStatus = () => {
            deviceNetworkOnline.value = navigator.onLine;
            if (typeof window !== 'undefined') {
                window.addEventListener('online', () => {
                    deviceNetworkOnline.value = true;
                    if (navigator.connection) {
                        updateNetworkStatus(navigator.connection);
                    }
                });
                window.addEventListener('offline', () => {
                    deviceNetworkOnline.value = false;
                });
            }
            if ('getBattery' in navigator) {
                navigator.getBattery().then((battery) => {
                    updateBatteryStatus(battery);
                    battery.addEventListener('levelchange', () => updateBatteryStatus(battery));
                    battery.addEventListener('chargingchange', () => updateBatteryStatus(battery));
                }).catch(() => {});
            }
            if ('connection' in navigator && navigator.connection) {
                updateNetworkStatus(navigator.connection);
                navigator.connection.addEventListener('change', () => updateNetworkStatus(navigator.connection));
            }
        };
        
        const consoleModule = useConsole({
            saveProfilesCallback: () => {}
        });
        const {
            consoleLogs,
            profiles,
            activeProfileId,
            availableModels,
            fetchingModels,
            activeProfile,
            apiStatus,
            backupExporting,
            backupImporting,
            backupLastSavedHint,
            soulosBackupFileInput,
            showSegmentedImportPanel,
            segmentedImportPackage,
            segmentedImportAppSelections,
            segmentedImportRoleSelections,
            addConsoleLog,
            clearConsole,
            loadProfiles,
            saveProfiles,
            createNewProfile,
            deleteProfile,
            setActiveProfile,
            fetchModels,
            downloadSoulOsBackup,
            downloadSegmentedBackup,
            saveSoulOsBackupSlotOnly,
            restoreSoulOsFromSlot,
            triggerSoulOsBackupImport,
            handleSoulOsBackupImport,
            closeSegmentedImportPanel,
            confirmSegmentedImport,
            setApplyBackupHandler,
            setSegmentedDataProvider,
            setSegmentedApplyHandler,
            restoreIdbDatabase,
            dumpIdbDatabase,
            mergeById,
            pickLocalStorageByPrefixes
        } = consoleModule;

        const saveToStorage = (key, data) => {
            try { localStorage.setItem(key, JSON.stringify(data)); }
            catch (e) { console.error(`Failed to save ${key}:`, e); }
        };

        const loadFromStorage = (key) => {
            const saved = localStorage.getItem(key);
            if (saved) {
                try { return JSON.parse(saved); }
                catch (e) { console.error(`Failed to load ${key}:`, e); return []; }
            }
            return [];
        };

        const activeWorkshopTab = ref('characters');

        const showImageCropModal = ref(false);
        const imageCropSource = ref('');
        const imageCropPreset = ref('avatar');
        const imageCropAspect = ref(1);
        const imageCropScale = ref(0.82);
        const imageCropRect = ref({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }); // normalized [0,1]
        let imageCropDragState = null;
        let imageCropPendingCallback = null;

        const getImageCropPresetConfig = (preset) => {
            const presetMap = {
                avatar: { maxWidth: 400, maxHeight: 400, ratio: 1 },           // 头像 / 群头像
                background: { maxWidth: 1080, maxHeight: 1920, ratio: 9 / 16 }, // 聊天背景（竖屏）
                chatImage: { maxWidth: 960, maxHeight: 960, ratio: 4 / 3 },    // 聊天图片
                widgetPhoto: { maxWidth: 560, maxHeight: 840, ratio: 2 / 3 },  // 桌面照片小组件
                widgetSticker: { maxWidth: 520, maxHeight: 520, ratio: 1 },    // 桌面贴纸小组件
                free: { maxWidth: 960, maxHeight: 960, ratio: null }           // 不固定
            };
            return presetMap[preset] || presetMap.avatar;
        };
        const imageCropCanvasAspect = computed(() => {
            const ratio = Number(imageCropAspect.value) || 1;
            return Math.max(0.45, Math.min(1.8, ratio));
        });

        const resetImageCropRect = () => {
            const aspect = imageCropAspect.value;
            const scale = Math.max(0.45, Math.min(0.95, Number(imageCropScale.value) || 0.82));
            let w = 0.8 * scale;
            let h = 0.8 * scale;
            if (aspect && aspect > 0) {
                if (aspect >= 1) {
                    w = 0.86 * scale;
                    h = w / aspect;
                } else {
                    h = 0.86 * scale;
                    w = h * aspect;
                }
                if (w > 0.92) {
                    w = 0.92;
                    h = w / aspect;
                }
                if (h > 0.92) {
                    h = 0.92;
                    w = h * aspect;
                }
            }
            imageCropRect.value = {
                x: (1 - w) / 2,
                y: (1 - h) / 2,
                w,
                h
            };
        };

        const openImageCropModal = (dataUrl, preset, callback) => {
            imageCropSource.value = String(dataUrl || '');
            imageCropPreset.value = preset || 'avatar';
            imageCropPendingCallback = callback;
            const cfg = getImageCropPresetConfig(imageCropPreset.value);
            imageCropAspect.value = cfg.ratio || 1;
            imageCropScale.value = 0.82;
            resetImageCropRect();
            showImageCropModal.value = true;
        };

        const closeImageCropModal = () => {
            showImageCropModal.value = false;
            imageCropDragState = null;
            imageCropPendingCallback = null;
        };

        const onImageCropScaleChange = () => {
            resetImageCropRect();
        };

        const getEventClientXY = (e) => {
            if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        };

        const onImageCropDragStart = (e) => {
            const container = document.querySelector('.image-cropper-canvas');
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const p = getEventClientXY(e);
            imageCropDragState = {
                startX: p.x,
                startY: p.y,
                originX: imageCropRect.value.x,
                originY: imageCropRect.value.y,
                containerW: rect.width,
                containerH: rect.height
            };
            window.addEventListener('mousemove', onImageCropDragMove);
            window.addEventListener('mouseup', onImageCropDragEnd);
            window.addEventListener('touchmove', onImageCropDragMove, { passive: false });
            window.addEventListener('touchend', onImageCropDragEnd);
        };

        const onImageCropDragMove = (e) => {
            if (!imageCropDragState) return;
            if (e.cancelable) e.preventDefault();
            const p = getEventClientXY(e);
            const dx = (p.x - imageCropDragState.startX) / Math.max(1, imageCropDragState.containerW);
            const dy = (p.y - imageCropDragState.startY) / Math.max(1, imageCropDragState.containerH);
            const w = imageCropRect.value.w;
            const h = imageCropRect.value.h;
            const nextX = Math.min(1 - w, Math.max(0, imageCropDragState.originX + dx));
            const nextY = Math.min(1 - h, Math.max(0, imageCropDragState.originY + dy));
            imageCropRect.value = { ...imageCropRect.value, x: nextX, y: nextY };
        };

        const onImageCropDragEnd = () => {
            imageCropDragState = null;
            window.removeEventListener('mousemove', onImageCropDragMove);
            window.removeEventListener('mouseup', onImageCropDragEnd);
            window.removeEventListener('touchmove', onImageCropDragMove);
            window.removeEventListener('touchend', onImageCropDragEnd);
        };

        const confirmImageCrop = () => {
            if (!imageCropPendingCallback) {
                closeImageCropModal();
                return;
            }
            const cfg = getImageCropPresetConfig(imageCropPreset.value);
            const img = new Image();
            img.onload = () => {
                const r = imageCropRect.value;
                const sx = Math.round(r.x * img.width);
                const sy = Math.round(r.y * img.height);
                const sw = Math.max(1, Math.round(r.w * img.width));
                const sh = Math.max(1, Math.round(r.h * img.height));

                let tw = sw;
                let th = sh;
                const scale = Math.min(cfg.maxWidth / tw, cfg.maxHeight / th, 1);
                tw = Math.max(1, Math.round(tw * scale));
                th = Math.max(1, Math.round(th * scale));

                const canvas = document.createElement('canvas');
                canvas.width = tw;
                canvas.height = th;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
                const out = canvas.toDataURL('image/jpeg', 0.82);
                const done = imageCropPendingCallback;
                closeImageCropModal();
                done(out);
            };
            img.src = imageCropSource.value;
        };

        function compressAvatarImage(dataUrl, presetOrCallback, maybeCallback) {
            const callback = typeof presetOrCallback === 'function' ? presetOrCallback : maybeCallback;
            const preset = typeof presetOrCallback === 'string' ? presetOrCallback : 'avatar';
            if (typeof callback !== 'function') return;
            let shouldManualCrop = false;
            if (preset !== 'free') {
                try {
                    shouldManualCrop = !!chatSettings.enableManualImageCrop?.value;
                } catch {
                    shouldManualCrop = false;
                }
            }
            if (shouldManualCrop) {
                openImageCropModal(dataUrl, preset, callback);
                return;
            }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const presetMap = {
                    avatar: { maxWidth: 400, maxHeight: 400, ratio: 1 },          // 头像/群头像
                    background: { maxWidth: 1080, maxHeight: 1920, ratio: 9 / 16 }, // 聊天背景（竖屏）
                    chatImage: { maxWidth: 960, maxHeight: 960, ratio: 4 / 3 },    // 聊天图片
                    widgetPhoto: { maxWidth: 560, maxHeight: 840, ratio: 2 / 3 },   // 桌面照片小组件
                    widgetSticker: { maxWidth: 520, maxHeight: 520, ratio: 1 },     // 桌面贴纸小组件
                    free: { maxWidth: 960, maxHeight: 960, ratio: null }           // 不裁剪
                };
                const cfg = presetMap[preset] || presetMap.avatar;
                const maxWidth = cfg.maxWidth;
                const maxHeight = cfg.maxHeight;
                const cropRatio = cfg.ratio;
                const shouldCrop = !!cropRatio;

                let sx = 0;
                let sy = 0;
                let sw = img.width;
                let sh = img.height;
                if (shouldCrop) {
                    const srcRatio = img.width / img.height;
                    if (srcRatio > cropRatio) {
                        sw = Math.round(img.height * cropRatio);
                        sx = Math.round((img.width - sw) / 2);
                    } else if (srcRatio < cropRatio) {
                        sh = Math.round(img.width / cropRatio);
                        sy = Math.round((img.height - sh) / 2);
                    }
                }

                let width = sw;
                let height = sh;
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
                
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
                callback(compressedDataUrl);
            };
            img.src = dataUrl;
        }
        globalThis.compressAvatarImage = compressAvatarImage;

        const workshopSoulLinkBatchHook = { run: null };
        const workshop = useWorkshop({
            compressAvatarImage: (dataUrl, preset, cb) => {
                if (typeof globalThis.compressAvatarImage === 'function') {
                    globalThis.compressAvatarImage(dataUrl, preset, cb);
                } else {
                    cb(dataUrl);
                }
            },
            addConsoleLog: (msg, type) => addConsoleLog(msg, type),
            onCharactersChange: () => {},
            onWorldbooksChange: () => {},
            onPresetsChange: () => {},
            onBatchDeleteCharacters: (selected) => workshopSoulLinkBatchHook.run?.(selected)
        });

        const {
            characters,
            worldbooks,
            presets,
            editingCharacter,
            editingWorldbook,
            editingPreset,
            activeWorldbookEntryId,
            activeWorldbookEntry,
            swipedWorldbookId,
            swipedPresetId,
            expandedEntryIds,
            showWorldbookImport,
            importWorldbookName,
            importFile,
            importMode,
            showBatchDeleteDialog,
            batchDeleteType,
            batchDeleteSelections,
            batchDeleteTitle,
            batchDeleteItems,
            isAllBatchSelected,
            selectedBatchCount,
            newTagInput,
            characterImportInput,
            presetImportInput,
            addNewCharacter,
            deleteCharacter,
            openDossier,
            saveDossier,
            cancelDossier,
            addTag,
            removeTag,
            addKv,
            removeKv,
            addOpeningLine,
            removeOpeningLine,
            triggerAvatarUpload,
            triggerCharacterImport,
            handleCharacterImport,
            addNewWorldbook,
            deleteWorldbook,
            deleteCurrentWorldbook,
            openWorldbookEditor,
            saveWorldbookEditor,
            cancelWorldbookEditor,
            addWorldbookEntry,
            deleteWorldbookEntry,
            toggleEntryExpand,
            isEntryExpanded,
            toggleSwipeWorldbook,
            openWorldbookImport,
            handleFileUpload,
            importWorldbook,
            addNewPreset,
            deletePreset,
            deleteCurrentPreset,
            openPresetEditor,
            savePresetEditor,
            cancelPresetEditor,
            toggleSwipePreset,
            triggerPresetImport,
            handlePresetImport,
            openBatchDelete,
            closeBatchDelete,
            selectAllBatchItems,
            clearBatchSelection,
            invertBatchSelection,
            confirmBatchDelete,
            saveCharacters,
            loadCharacters,
            saveWorldbooks,
            loadWorldbooks,
            savePresets,
            loadPresets
        } = workshop;

        const home = useHome({
            compressAvatarImage: (dataUrl, preset, cb) => {
                if (typeof globalThis.compressAvatarImage === 'function') {
                    globalThis.compressAvatarImage(dataUrl, preset, cb);
                } else {
                    cb(dataUrl);
                }
            },
            enableNotchAdaptation,
            characters,
            loadCharacters,
            saveCharacters
        });

        const {
            currentPage,
            homePages,
            prevPage,
            nextPage,
            updateHomePagePosition,
            photoWidgetDate,
            photoWidgetText,
            photoWidgetPhotos,
            changePhotoWidgetImage,
            editPhotoWidgetText,
            showPhotoWidgetEditDialog,
            photoWidgetEditText1,
            photoWidgetEditText2,
            closePhotoWidgetEditDialog,
            savePhotoWidgetText,
            stickerWidgetUrl,
            changeStickerWidgetImage,
            capsuleTexts,
            showCapsuleEditDialog,
            currentCapsuleType,
            capsuleEditText,
            editCapsuleText,
            closeCapsuleEditDialog,
            saveCapsuleText,
            dashboardTexts,
            showDashboardEditDialog,
            currentDashboardTextType,
            dashboardEditText,
            editDashboardText,
            closeDashboardEditDialog,
            saveDashboardText,
            showCharacterSelector,
            selectedCharacterId,
            selectedCharacter,
            selectCharacter,
            callWidgetSubtitle,
            showCallWidgetEdit,
            callWidgetEditInput,
            editCallWidgetSubtitle,
            saveCallWidgetSubtitle,
            closeCallWidgetEdit,
            currentDate,
            currentTime,
            weekdays,
            currentWeekday,
            updateDateTime
        } = home;

        watch(isHomeScreenVisible, (visible) => {
            if (visible) {
                nextTick(() => updateHomePagePosition());
            }
        });

        const fileInput = ref(null);
        const handleAvatarFile = (event) => {
            const file = event.target.files[0];
            if (file && editingCharacter.value) {
                const maxSize = 5 * 1024 * 1024;
                if (file.size > maxSize) {
                    alert('图片大小不能超过5MB，请选择小一点的图片');
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    const fn = typeof globalThis.compressAvatarImage === 'function'
                        ? globalThis.compressAvatarImage
                        : (dataUrl, _p, cb) => cb(dataUrl);
                    fn(e.target.result, 'avatar', (compressedDataUrl) => {
                        editingCharacter.value.avatarUrl = compressedDataUrl;
                    });
                };
                reader.readAsDataURL(file);
            }
        };

        const switchWorkshopTab = (tabName) => {
            activeWorkshopTab.value = tabName;
        };

        watch(worldbooks, saveWorldbooks, { deep: true });
        watch(presets, savePresets, { deep: true });
        watch(profiles, () => saveProfiles(true), { deep: true });
        watch(activeProfileId, (id) => {
            try {
                if (id != null) localStorage.setItem('soulos_active_api_profile_id', String(id));
            } catch { /* ignore */ }
            saveProfiles(true);
        });

        // --- COMPUTED PROPERTIES ---

        // Touch event variables for pull-to-refresh
        let startY = 0;
        const pullDistance = ref(0);
        
        const handleTouchStart = (e) => {
            startY = e.touches[0].clientY;
        };
        
        const handleTouchMove = () => {};
        
        const handleTouchEnd = () => {
            pullDistance.value = 0;
        };
        
        const openApp = (appName) => {
            const normalizedName = appName ? appName.toLowerCase() : null;

            openedApp.value = normalizedName;
            console.log(`[System] Opening App: ${normalizedName}`);
            
            if (normalizedName === 'console') {
                loadProfiles();
            } else if (normalizedName === 'soullink' || normalizedName === 'chat') {
                if (!['msg', 'group', 'feed', 'id'].includes(soulLinkTab.value)) {
                    soulLinkTab.value = 'msg';
                }
                console.log(`[SoulLink] Tab: ${soulLinkTab.value}, Characters: ${characters.value.length}`);
                if (characters.value.length === 0) {
                     loadCharacters();
                }
            } else if (normalizedName === 'feed') {
                console.log(`[Feed] Opening, Characters: ${characters.value.length}`);
                if (characters.value.length === 0) {
                    loadCharacters();
                }
            }
        };

        const closeApp = () => {
            openedApp.value = null;
        };

        const goBack = () => {
            openedApp.value = null;
        };

        const playerName = ref('');
        const currentPlayerName = ref('');
        const gameAiCharacterId = ref(null);
        const isGameAiTyping = ref(false);

        const getGameAiName = () => {
            if (!characters.value || characters.value.length === 0) return 'AI搭子';
            const selected = characters.value.find(c => String(c.id) === String(gameAiCharacterId.value));
            const fallback = selectedCharacter.value;
            const target = selected || fallback || characters.value[0];
            return target?.nickname || target?.name || 'AI搭子';
        };

        const getGameAiCharacter = () => {
            if (!characters.value || characters.value.length === 0) return null;
            const selected = characters.value.find(c => String(c.id) === String(gameAiCharacterId.value));
            return selected || selectedCharacter.value || characters.value[0] || null;
        };

        const ensureGameAiCharacter = () => {
            if (gameAiCharacterId.value) return;
            if (selectedCharacter.value?.id) {
                gameAiCharacterId.value = selectedCharacter.value.id;
                return;
            }
            if (characters.value && characters.value.length > 0) {
                gameAiCharacterId.value = characters.value[0].id;
            }
        };

        const addGameAiMessage = (content) => {
            chatMessages.value.push({ sender: getGameAiName(), content, type: 'ai' });
        };

        const askGameAi = async (userMessage, eventHint = '') => {
            const profile = activeProfile.value;
            const rawUserText = String(userMessage || '').trim();
            const safeEventHint = String(eventHint || '').trim();
            if (!profile || !profile.endpoint || !profile.key) {
                return null;
            }

            const endpoint = String(profile.endpoint).replace(/\/+$/, '');
            const key = String(profile.key || '').trim();
            const model = profile.model || profile.openai_model || profile.claude_model || profile.openrouter_model || 'gpt-4o-mini';

            if (!endpoint || !key) return null;

            const aiChar = getGameAiCharacter();
            const aiName = aiChar?.nickname || aiChar?.name || 'AI搭子';
            const aiPersona = String(aiChar?.persona || aiChar?.summary || aiChar?.description || '').trim();
            const currentGameName = games.currentGame?.name || '小游戏';
            const latestMessages = chatMessages.value.slice(-8).map(m => `${m.sender}: ${m.content}`).join('\n');

            const systemPrompt = [
                `你正在扮演角色「${aiName}」，与用户在手机里的“${currentGameName}”一起玩。`,
                aiPersona ? `角色设定：${aiPersona}` : '角色设定：轻松、自然、会互动。',
                '要求：',
                '- 保持角色口吻，中文回复',
                '- 语气像一起玩游戏的搭子，简短自然（1-3句）',
                '- 回答要和当前游戏情境有关，不要变成客服',
                '- 不要输出 markdown 或代码块'
            ].join('\n');

            const userPrompt = [
                safeEventHint ? `当前事件：${safeEventHint}` : '',
                latestMessages ? `最近对话：\n${latestMessages}` : '',
                rawUserText ? `用户刚说：${rawUserText}` : '请你先主动说一句游戏开场白。'
            ].filter(Boolean).join('\n\n');

            const base = endpoint.replace(/\/+$/, '');
            const candidateUrls = /\/chat\/completions$/i.test(base)
                ? [base]
                : /\/v1$/i.test(base)
                    ? [`${base}/chat/completions`]
                    : [`${base}/v1/chat/completions`, `${base}/chat/completions`];

            for (const url of candidateUrls) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${key}`
                        },
                        body: JSON.stringify({
                            model,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userPrompt }
                            ],
                            temperature: profile.temperature ?? 0.8,
                            stream: false
                        })
                    });
                    if (!response.ok) continue;
                    const data = await response.json();
                    const raw =
                        data?.choices?.[0]?.message?.content ||
                        data?.message?.content ||
                        data?.output_text ||
                        data?.text ||
                        '';
                    const reply = String(raw || '').replace(/```[\s\S]*?```/g, '').trim();
                    if (reply) return reply;
                } catch {
                    // try next url
                }
            }
            return null;
        };

        const sendGameAiReply = async ({ userText = '', eventHint = '', fallback = '' } = {}) => {
            isGameAiTyping.value = true;
            try {
                const aiReply = await askGameAi(userText, eventHint);
                addGameAiMessage(aiReply || fallback || '我在呢，我们继续。');
            } finally {
                isGameAiTyping.value = false;
            }
        };

        const openGame = async (gameId) => {
            const game = games.startGame(gameId);
            if (game) {
                console.log('Opening game:', game.name);
                // 重置玩家名字
                playerName.value = '';
                currentPlayerName.value = '';
                ensureGameAiCharacter();
                chatMessages.value = [];
                await sendGameAiReply({
                    eventHint: `用户进入了游戏：${game.name}`,
                    fallback: `来玩 ${game.name} 吧，我已经准备好了。`
                });
            }
        };

        const joinGame = () => {
            if (playerName.value.trim()) {
                const success = games.joinGame(playerName.value.trim());
                if (success) {
                    currentPlayerName.value = playerName.value.trim();
                    playerName.value = '';
                    console.log('Player joined:', currentPlayerName.value);
                }
            }
        };

        const startGameSession = async () => {
            const success = games.startGameSession();
            if (success) {
                console.log('Game started');
                await sendGameAiReply({
                    eventHint: '游戏正式开始',
                    fallback: '游戏开始！我会认真观察每个人的发言。'
                });
            }
        };

        const castVote = (voterName, targetName) => {
            const success = games.castVote(voterName, targetName);
            if (success) {
                console.log(`${voterName} voted for ${targetName}`);
                addGameAiMessage(`收到，${voterName} 投给了 ${targetName}。`);
            }
        };

        const endDay = async () => {
            games.endDay();
            console.log('Day ended');
            await sendGameAiReply({
                eventHint: '狼人杀白天讨论结束，进入下一阶段',
                fallback: '白天讨论结束，进入下一阶段。'
            });
        };

        const closeGame = () => {
            if (typeof games.clearGameApp === 'function') {
                games.clearGameApp();
            } else {
                games.currentGame = null;
            }
            console.log('Game closed');
            chatMessages.value = [];
        };

        // 新游戏相关状态
        const showRules = ref(false);
        const chatExpanded = ref(false);
        const wheelRotation = ref(0);
        const playerMessage = ref('');
        const playerWord = ref('');
        
        // AI玩家状态
        const aiPlayers = ref([
            { status: '等待中' },
            { status: '等待中' },
            { status: '等待中' }
        ]);
        
        // 聊天消息
        const chatMessages = ref([]);
        const undercoverMessages = ref([]);
        
        // 真心话大冒险历史记录
        const todHistory = ref([]);
        const ludoQuestionCard = ref(null);
        const ludoAnswerInput = ref('');
        const ludoQuestionLoading = ref(false);

        // 新游戏相关函数
        const toggleSound = () => {
            console.log('Toggle sound');
        };

        const playRPS = async (choice) => {
            const result = games.playRPS(choice);
            console.log('RPS result:', result);
            await sendGameAiReply({
                eventHint: `石头剪刀布结果：用户出${choice}，AI出${result.aiChoice}，结果=${result.result}`,
                fallback: `我出${result.aiChoice === 'rock' ? '石头' : result.aiChoice === 'paper' ? '布' : '剪刀'}！`
            });
        };

        const spinTOD = () => {
            // 随机旋转角度
            wheelRotation.value = Math.floor(Math.random() * 360) + 720; // 至少转两圈
            
            // 延迟执行，模拟转盘转动
            setTimeout(() => {
                const result = games.spinTruthOrDare();
                console.log('TOD result:', result);
                
                // 添加到历史记录
                todHistory.value.unshift({
                    type: result.choice === 'truth' ? '真心话' : '大冒险',
                    content: result.truth || result.dare
                });
                
                // 限制历史记录数量
                if (todHistory.value.length > 3) {
                    todHistory.value = todHistory.value.slice(0, 3);
                }
                
                void sendGameAiReply({
                    eventHint: `真心话大冒险结果：${result.choice === 'truth' ? '真心话' : '大冒险'}，题目=${result.truth || result.dare || ''}`,
                    fallback: result.choice === 'truth' ? '真心话！快回答吧～' : '大冒险！挑战来了！'
                });
            }, 1500);
        };

        const nextTOD = () => {
            games.gameState.truthOrDare = null;
            games.gameState.currentTruth = null;
            games.gameState.currentDare = null;
        };

        const startUNOGame = async () => {
            games.startUNOGame();
            console.log('UNO game started');
            await sendGameAiReply({
                eventHint: 'UNO 开局',
                fallback: 'UNO 开始！记得只剩一张牌时要喊 UNO。'
            });
        };

        const startNewUNO = () => {
            games.startUNOGame();
        };

        const playUnoCard = (idx) => {
            games.playUnoCard(idx);
        };

        const drawUnoCard = () => {
            games.drawUnoCardForPlayer();
        };

        const drawUnoCardForPlayer = () => {
            games.drawUnoCardForPlayer();
        };

        const drawCard = async () => {
            const card = games.drawUnoCardForPlayer();
            if (!card) return;
            const aiResult = await games.aiTurnUNO();
            if (!aiResult) return;
            if (aiResult?.winner === 'ai') {
                await sendGameAiReply({
                    eventHint: 'UNO 对局结束，AI获胜',
                    fallback: '这局我先赢啦，再来一局吗？'
                });
                return;
            }
            if (aiResult?.action === 'play' || aiResult?.action === 'draw_then_play') {
                await sendGameAiReply({
                    eventHint: `UNO 我方抽牌后，AI打出${aiResult.card?.color || ''}-${aiResult.card?.value || ''}`,
                    fallback: '我也出了一张牌，到你了。'
                });
            } else if (aiResult?.action === 'draw') {
                await sendGameAiReply({
                    eventHint: 'UNO 我方抽牌后，AI 选择抽牌',
                    fallback: '我抽了一张，轮到你了。'
                });
            }
        };

        const playCard = async (index) => {
            const result = games.playUnoCard(index);
            if (!result?.ok) return;
            if (result.winner === 'player') {
                await sendGameAiReply({
                    eventHint: 'UNO 对局结束，用户获胜',
                    fallback: '你赢了！这手太漂亮了。'
                });
                return;
            }
            const aiResult = await games.aiTurnUNO();
            if (!aiResult) return;
            if (aiResult?.winner === 'ai') {
                await sendGameAiReply({
                    eventHint: 'UNO 对局结束，AI获胜',
                    fallback: '这局我先赢啦，再来一局吗？'
                });
                return;
            }
            if (aiResult?.action === 'play' || aiResult?.action === 'draw_then_play') {
                await sendGameAiReply({
                    eventHint: `UNO AI出牌：${aiResult.card?.color || ''}-${aiResult.card?.value || ''}`,
                    fallback: '我出了牌，现在轮到你。'
                });
            } else if (aiResult?.action === 'draw') {
                await sendGameAiReply({
                    eventHint: 'UNO AI 抽牌',
                    fallback: '我抽了一张，该你了。'
                });
            }
        };

        const sayUNO = () => {
            alert('UNO！');
        };

        const startLudoGame = async () => {
            games.startLudoGame();
            console.log('Ludo game started');
            ludoQuestionCard.value = null;
            ludoAnswerInput.value = '';
            await sendGameAiReply({
                eventHint: '飞行棋开局',
                fallback: '飞行棋开局，祝你一路起飞。'
            });
        };

        const rollDice = async () => {
            const dice = games.rollDice();
            console.log('Rolled dice:', dice);
            chatMessages.value.push({ sender: '系统', content: `掷出了${dice}点`, type: 'system' });
            if (games.currentGame?.id === 'ludo') return;
            await sendGameAiReply({
                eventHint: `掷骰子点数=${dice}`,
                fallback: `这次是 ${dice} 点，运气不错。`
            });
        };

        const effectLabelMap = {
            forward: '前进',
            backward: '后退',
            pause: '暂停',
            question: '问题'
        };

        const getLudoEffectLabel = (cellIndex) => {
            const effect = games.gameState.ludoEffects?.[cellIndex];
            if (!effect) return '';
            const base = effectLabelMap[effect.type] || '';
            if (effect.type === 'question') return '问答';
            return `${base}${effect.value || 1}`;
        };

        const getLudoSnakeOrder = (index) => {
            const cols = 7;
            const row = Math.floor(index / cols);
            const col = index % cols;
            return row % 2 === 0 ? index + 1 : row * cols + (cols - col);
        };

        const generateLudoQuestion = async () => {
            ludoQuestionLoading.value = true;
            try {
                const q = await askGameAi('', '请生成一个简短有趣的中文问答题。严格输出两行：第一行以“题目：”开头，第二行以“答案：”开头。');
                const raw = String(q || '').trim();
                if (!raw) return { question: '请说出 UNO 的完整英文名是什么？', answer: 'UNO' };
                const qMatch = raw.match(/题目[:：]\s*(.+)/);
                const aMatch = raw.match(/答案[:：]\s*(.+)/);
                return {
                    question: qMatch?.[1]?.trim() || '请说出“飞行棋”的英文常见叫法之一？',
                    answer: aMatch?.[1]?.trim() || 'Ludo'
                };
            } catch {
                return { question: '请说出“飞行棋”的英文常见叫法之一？', answer: 'Ludo' };
            } finally {
                ludoQuestionLoading.value = false;
            }
        };

        const resolveLudoEffect = async (moveResult) => {
            if (!moveResult?.effect) return;
            const effect = moveResult.effect;
            if (effect.type === 'question') {
                if (moveResult.playerKind === 'player') {
                    const qa = await generateLudoQuestion();
                    ludoQuestionCard.value = {
                        playerKind: 'player',
                        planeIndex: moveResult.planeIndex,
                        question: qa.question,
                        answer: qa.answer
                    };
                } else {
                    const aiCorrect = Math.random() < 0.7;
                    games.applyLudoQuestionResult('ai', moveResult.movedPlaneIndex, aiCorrect);
                    await sendGameAiReply({
                        eventHint: `飞行棋AI触发问题格，AI回答${aiCorrect ? '正确' : '错误'}`,
                        fallback: aiCorrect ? '我答对了，再前进两格。' : '这题我翻车了，后退一格。'
                    });
                }
                return;
            }
            games.applyLudoEffect(moveResult.playerKind, effect, moveResult.playerKind === 'player' ? moveResult.planeIndex : moveResult.movedPlaneIndex);
        };

        const moveLudoPlane = async (planeIndex) => {
            const moved = games.moveLudoPlane(planeIndex);
            if (!moved?.ok) {
                if (moved?.skipped) {
                    const aiSkip = games.aiTurnLudo();
                    if (aiSkip?.skipped) {
                        await sendGameAiReply({
                            eventHint: '飞行棋双方都在暂停回合',
                            fallback: '这回合我们都暂停了。'
                        });
                    }
                }
                return;
            }
            await resolveLudoEffect(moved);
            if (ludoQuestionCard.value) {
                return;
            }
            if (games.gameState.ludoWinner === 'player') {
                await sendGameAiReply({
                    eventHint: '飞行棋对局结束，用户获胜',
                    fallback: '你先到终点了，恭喜！'
                });
                return;
            }
            const ai = games.aiTurnLudo();
            if (ai?.moved) {
                await resolveLudoEffect(ai);
            }
            if (games.gameState.ludoWinner === 'player') {
                await sendGameAiReply({
                    eventHint: '飞行棋对局结束，用户获胜',
                    fallback: '你先到终点了，恭喜！'
                });
                return;
            }
            if (ai?.winner === 'ai') {
                await sendGameAiReply({
                    eventHint: '飞行棋对局结束，AI获胜',
                    fallback: '我先到终点啦，下局你肯定行。'
                });
                return;
            }
            await sendGameAiReply({
                eventHint: `飞行棋回合推进：你移动了棋子${planeIndex + 1}，AI掷出${ai?.dice || '-'}点`,
                fallback: `我掷出 ${ai?.dice || '-'} 点，到你继续。`
            });
        };

        const submitLudoAnswer = async () => {
            if (!ludoQuestionCard.value) return;
            const userAns = String(ludoAnswerInput.value || '').trim().toLowerCase();
            const stdAns = String(ludoQuestionCard.value.answer || '').trim().toLowerCase();
            const isCorrect = !!userAns && (userAns === stdAns || userAns.includes(stdAns) || stdAns.includes(userAns));
            games.applyLudoQuestionResult('player', ludoQuestionCard.value.planeIndex, isCorrect);
            const feedback = isCorrect ? '回答正确，前进两格！' : '回答不对，后退一格。';
            chatMessages.value.push({ sender: '系统', content: feedback, type: 'system' });
            ludoQuestionCard.value = null;
            ludoAnswerInput.value = '';
            if (games.gameState.ludoWinner === 'player') {
                await sendGameAiReply({
                    eventHint: '飞行棋对局结束，用户获胜',
                    fallback: '你先到终点了，恭喜！'
                });
                return;
            }
            const ai = games.aiTurnLudo();
            if (ai?.moved) {
                await resolveLudoEffect(ai);
            }
            await sendGameAiReply({
                eventHint: `飞行棋玩家问题格结果：${isCorrect ? '正确' : '错误'}`,
                fallback: isCorrect ? '答得不错，这波节奏很好。' : '别急，下题我们扳回来。'
            });
        };

        const toggleAutoPlay = () => {
            console.log('Toggle auto play');
        };

        const sendMessage = async () => {
            if (playerMessage.value.trim()) {
                const userText = playerMessage.value.trim();
                chatMessages.value.push({ sender: '我', content: userText, type: 'player' });
                playerMessage.value = '';
                await sendGameAiReply({
                    userText,
                    eventHint: games.currentGame?.name ? `当前游戏：${games.currentGame.name}` : '',
                    fallback: games.currentGame?.name
                        ? `收到，你说的是「${userText}」。我们继续玩 ${games.currentGame.name}。`
                        : `收到：${userText}`
                });
            }
        };

        const getAppIcon = (appName) => {
            const icons = {
                'SoulLink': 'fas fa-comments', 'Peek': 'fas fa-eye', 'Gallery': 'fas fa-photo-video', 'Diary': 'fas fa-book-open',
                'Pulse': 'fas fa-rss-square', 'Void': 'fa-brands fa-twitter', 'Vibe': 'fas fa-camera-retro', 'Muse': 'fas fa-film',
                'Period': 'fas fa-tint', 'Wallet': 'fas fa-wallet', 'Nest': 'fas fa-home', 'Mall': 'fas fa-shopping-bag',
                'Chamber': 'fas fa-hourglass-half', 'Music': 'fas fa-music', 'Arcade': 'fas fa-gamepad', 'Browser': 'fas fa-globe',
                'Theme': 'fas fa-palette', 'Workshop': 'fas fa-hammer', 'System': 'fas fa-book', 'Console': 'fas fa-terminal'
            };
            return icons[appName] || 'fas fa-question-circle';
        };

        // Music player controls
        function togglePlayPause() {
            isPlaying.value = !isPlaying.value;
        }

        function playPrevious() {
            music.activeIndex = (music.activeIndex + music.playlist.length - 1) % music.playlist.length;
        }

        function playNext() {
            music.activeIndex = (music.activeIndex + 1) % music.playlist.length;
        }

        const deleteActiveProfile = () => {            if (activeProfileId.value != null) deleteProfile(activeProfileId.value);
        };

        const onProfileSelect = () => {
            availableModels.value = [];
            if (activeProfile.value) {
                try { localStorage.setItem('soulos_active_api_profile_id', String(activeProfile.value.id)); } catch {}
                saveProfiles(true);
                addConsoleLog(`已切换到配置：「${activeProfile.value.name}」`, 'info');
            }
        };

        const live = useLive(characters, activeProfile, profiles, availableModels, worldbooks);
        const {
            liveWaveBars,
            liveOnlineCount,
            activeLiveRoomId,
            liveMicMuted,
            liveElapsedSeconds,
            liveInput,
            liveMessages,
            liveHostSpeechByRoom,
            liveDanmakuByRoom,
            liveHostSpeechLoading,
            liveBgmPlaying,
            liveBgmAudioRef,
            LIVE_BGM_URL,
            liveOnMic,
            liveUserDisguiseNick,
            liveHallWallpaperUrl,
            liveSettingsOpen,
            liveSettingsDraftBgmUrl,
            liveSettingsDraftUserMask,
            liveSettingsDraftHallWallpaperUrl,
            liveBgmSearchTerm,
            liveBgmSearchResults,
            liveBgmSearchLoading,
            liveBgmCurrentSong,
            liveBgmLyricsLoading,
            liveBgmCurrentLyricText,
            liveBgmLyricPrevText,
            liveBgmLyricNextText,
            liveRooms,
            activeLiveRoom,
            activeLiveHost,
            activeLiveMessages,
            liveElapsedText,
            activeLiveHostSpeech,
            activeLiveHostSpeechHistory,
            liveHostHistoryOpen,
            switchLiveRoom,
            toggleLiveMic,
            toggleLiveOnMic,
            rollDisguiseNick,
            sendLiveGift,
            sendLiveMessage,
            toggleLiveBgm,
            onLiveBgmPlay,
            onLiveBgmPause,
            onLiveBgmEnded,
            startBatchFetch,
            clearLivePlaybackAndBatch,
            toggleLiveHostHistory,
            closeLiveHostHistory,
            formatLiveHostHistoryTime,
            openLiveSettings,
            closeLiveSettings,
            saveLiveSettings,
            searchLiveBgmSongs,
            playLiveBgmFromSong,
            playLiveBgmByQuery,
            onLiveHallWallpaperUpload
        } = live;

        // --- Lifecycle Hook ---
        onMounted(() => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js')
                  .then(registration => console.log('ServiceWorker 注册成功:', registration.scope))
                  .catch(err => console.log('ServiceWorker 注册失败:', err));
            }

            updateTime();
            generateRandomHex();
            loadCharacters();
            
            initDB().then(async () => {
                await feed.initFeedDB();
                await loadSoulLinkMessages();
                await loadSoulLinkGroups();
                loadSoulLinkPet();
                initDeviceStatus();
                
                const savedUserAvatar = loadFromStorage('soulos_user_avatar');
                if (savedUserAvatar) {
                    userAvatar.value = savedUserAvatar;
                }
                
                loadChatMenuSettings();
                await loadArchivedChats();
            }).catch(err => {
                console.error('数据库初始化失败:', err);
                loadSoulLinkMessages();
                loadSoulLinkGroups();
                loadSoulLinkPet();
                initDeviceStatus();
                
                const savedUserAvatar = loadFromStorage('soulos_user_avatar');
                if (savedUserAvatar) {
                    userAvatar.value = savedUserAvatar;
                }
                
                loadChatMenuSettings();
                loadArchivedChats();
            });
        });
        
        watch(characters, saveCharacters, { deep: true });
        
        watch(openedApp, (val, prev) => {
            const prevApp = prev ? prev.toLowerCase() : prev;
            const valApp = val ? val.toLowerCase() : val;

            if (prevApp === 'console') {
                saveProfiles(true);
            }
            if (valApp !== 'workshop') {
                editingCharacter.value = null;
            }
            clearLivePlaybackAndBatch();
            if (valApp !== 'live') {
                closeLiveHostHistory();
            }
            if (valApp === 'live') {
                setTimeout(() => startBatchFetch(), 450);
            }
        });

        // ==========================================================
        // --- SoulLink App State & Logic (useChat) ---
        // ==========================================================

        const feed = reactive(useFeed(profiles, activeProfile));
        const ember = reactive(useEmber(characters, activeProfile));
        const chatSettingsHolder = { current: null };
        const chatSettings = new Proxy({}, {
            get(_, prop) {
                const t = chatSettingsHolder.current;
                return t ? t[prop] : undefined;
            },
            set(_, prop, val) {
                const t = chatSettingsHolder.current;
                if (t) t[prop] = val;
                return true;
            }
        });
        chat = useChat(
            characters,
            worldbooks,
            presets,
            activeProfile,
            availableModels,
            feed,
            chatSettings,
            userAvatar,
            chatIsGuestStub,
            {
                openedApp,
                saveSoulLinkMessages: () => chatPersistence.saveSoulLinkMessages(),
                saveSoulLinkGroups: () => chatPersistence.saveSoulLinkGroups(),
                saveArchivedChats: () => chatPersistence.saveArchivedChats()
            }
        );
        // useChat 内的 chatSettings 为 Proxy，必须在 useChatSettings 赋值后才能读到 getChatSummaryCursor 等（本段同步执行，早于首条消息）
        chatSettingsHolder.current = useChatSettings(
            chat.soulLinkActiveChat,
            chat.soulLinkActiveChatType,
            characters,
            worldbooks,
            presets,
            activeProfile,
            availableModels
        );

        /** 模板中 chatSettings.chatSummaryBoard 为 ref，不能 .slice；用此计算属性取数组 */
        const chatSummaryBoardList = computed(() => {
            const t = chatSettingsHolder.current;
            if (!t?.chatSummaryBoard) return [];
            const arr = t.chatSummaryBoard.value;
            return Array.isArray(arr) ? arr : [];
        });

        const userBlockedRoleUi = computed(() => {
            const t = chatSettingsHolder.current;
            if (!t?.userBlockedRole) return false;
            return !!t.userBlockedRole.value;
        });

        const {
            soulLinkTab,
            soulLinkActiveChat,
            soulLinkActiveChatType,
            soulLinkInput,
            soulLinkReplyTarget,
            soulLinkMessages,
            soulLinkGroups,
            novelMode,
            isOfflineMode,
            setChatOfflineMode,
            saveChatOfflineModes,
            loadChatOfflineModes,
            pushMessageToActiveChat,
            pushMessageToTargetChat,
            getActiveChatHistory,
            getPendingUserMessages,
            syncActiveChatState,
            persistActiveChat,
            markMessagesReplied,
            sendSoulLinkMessage,
            triggerSoulLinkAiReply,
            scrollToBottom,
            activeGroupChat,
            isAiTyping,
            editingMessageId,
            contextMenu,
            longPressTimer,
            longPressStart,
            onMessageContextMenu,
            onMessageTouchStart,
            onMessageTouchMove,
            onMessageTouchEnd,
            handleContextAction,
            closeContextMenu,
            getLastMessage,
            formatLastMsgTime,
            getUnrepliedCountForChar,
            getUnrepliedCountForGroup,
            totalUnrepliedCount,
            formatUnreadCount,
            formatMessageDate,
            formatTime,
            showGreetingSelect,
            archivedChats,
            showCreateGroupDialog,
            showAddMemberDialog,
            showRenameGroupDialog,
            showStickerImportPanel,
            showChatSettings,
            stickerPacks,
            favoriteStickers,
            activeStickerTab,
            emojiList,
            availableGreetings,
            selectedGreeting,
            showCallDiaryModal,
            callActive,
            callType,
            callTimer,
            callMessages,
            isCallAiTyping,
            showCallInput,
            callInputText,
            isMuted,
            isSpeakerOn,
            isCameraOn,
            callDiaryRecords,
            callDiaryCounters,
            selectedCallDiary,
            callDiaryTitle,
            videoSelfPosition,
            isVideoAvatarSwapped,
            activeVote,
            newGroupName,
            newGroupMembers,
            newGroupAvatar,
            selectedGroupMembers,
            groupAvatarInput,
            selectedAddMembers,
            addMemberMode,
            customMemberAvatar,
            customMemberName,
            customMemberPersona,
            customMemberWorldbookIds,
            customMemberPresetId,
            customMemberTimeZone,
            customMemberAvatarInput,
            showMemberEditor,
            editingMember,
            newGroupNameInput,
            tempGroupAvatar,
            renameGroupAvatarInput,
            stickerImportText,
            newPackName,
            shouldShowTimeDivider,
            toggleOfflineMode,
            selectGreeting,
            createNewGroup,
            toggleGroupMember,
            getAvailableCharactersForAdd,
            toggleAddMember,
            addMembersToGroup,
            removeGroupMember,
            addCustomMember,
            openMemberEditor,
            closeMemberEditor,
            saveMemberEditor,
            renameGroup,
            shakeCharacter,
            shakeGroupMember,
            toggleMute,
            toggleSpeaker,
            toggleCamera,
            toggleCallInput,
            sendCallText,
            swapVideoAvatars,
            startDragVideoSelf,
            currentChatName,
            currentChatAvatar,
            focusedOsMessageId,
            prepareGreetingsForSelection,
            sendOnlineModeGreeting,
            parseReplyAndOs,
            buildSoulLinkReplyContext,
            extractAiTransfer,
            extractAiImageDescription,
            formatAiImageText,
            extractStickersFromText,
            extractAiShoppingCard,
            splitAiTransferSegments,
            splitAiImageSegments,
            splitAiVoiceSegments,
            extractAiVoice
        } = chat;

        const pixelEmojis = emojiList;

        let messageTimeIntervalId = null;
        let stickerTouchTimer = null;
        try {
            const dropStickerPackNames = ['狗皇帝', '呆猫八条', '绿萝卜', '这狗'];
            if (Array.isArray(stickerPacks.value)) {
                stickerPacks.value = stickerPacks.value.filter(p => p?.name && !dropStickerPackNames.includes(p.name));
                localStorage.setItem('stickerPacks', JSON.stringify(stickerPacks.value));
            }
        } catch (e) { /* ignore */ }

        // Initialize App Hooks with Dependencies
        const mate = reactive(useMate(soulLinkMessages, characters, activeProfile));
        const notice = reactive(useNotice());
        const peek = reactive(usePeek(characters, activeProfile, soulLinkMessages, soulLinkGroups));
        const games = reactive(useGames(activeProfile, characters));
        const read = reactive(useRead(characters, worldbooks, presets, activeProfile));
        const nest = reactive(useNest(characters, soulLinkMessages, soulLinkActiveChat));

        attachSoulStoreCoordinators({
            soulLinkActiveChat,
            characters,
            feed,
            mate,
            peek
        });

        const saveSoulLinkMessages = async () => {
            try {
                const dataToSave = JSON.parse(JSON.stringify(soulLinkMessages.value));
                await dbPut('soulLinkMessages', { id: 'messages', data: dataToSave });
            } catch (e) {
                console.error('Failed to save SoulLink messages:', e);
            }
        };

        workshopSoulLinkBatchHook.run = (selected) => {
            const nextMessages = { ...soulLinkMessages.value };
            selected.forEach((id) => { delete nextMessages[id]; });
            soulLinkMessages.value = nextMessages;
            if (selected.has(soulLinkActiveChat.value)) {
                soulLinkActiveChat.value = null;
            }
            saveSoulLinkMessages();
        };

        const compressAvatarImageFn = typeof globalThis.compressAvatarImage === 'function'
            ? globalThis.compressAvatarImage
            : (dataUrl, preset, cb) => cb(dataUrl);

        const attachment = useAttachment({
            pushMessageToActiveChat,
            saveSoulLinkMessages,
            scrollToBottom,
            activeProfile,
            availableModels,
            characters,
            worldbooks,
            stickerPacks,
            compressAvatarImage: compressAvatarImageFn,
            addConsoleLog,
            triggerSoulLinkAiReply,
            getActiveChatHistory,
            buildSoulLinkReplyContext,
            soulLinkActiveChat,
            soulLinkActiveChatType,
            activeGroupChat,
            soulLinkMessages,
            syncActiveChatState,
            persistActiveChat,
            isAiTyping,
            showChatSettings,
            soulLinkPet
        });

        const {
            showAttachmentPanel,
            showImageSubmenu,
            showLocationPanel,
            showTransferPanel,
            showEmojiPanel,
            showPhotoSelectPanel,
            showTextImagePanel,
            showVoiceInputPanel,
            showVirtualCamera,
            showTaobaoPanel,
            showSharePanel,
            showVotePanel,
            showArchiveDialog,
            showArchivedChats,
            archiveName,
            archiveDescription,
            textImageText,
            textImageBgColor,
            textImageColors,
            voiceInputText,
            virtualImageDesc,
            voteQuestion,
            voteOptions,
            taobaoSearchTerm,
            taobaoProducts,
            taobaoLoading,
            shareSource,
            shareContent,
            shareSources,
            transferAmount,
            transferNote,
            locationUser,
            locationTarget,
            locationDistance,
            locationTrajectoryPoints,
            userAddress,
            aiAddress,
            calculatedDistance,
            toggleAttachmentPanel,
            toggleEmojiPanel,
            closeAllPanels,
            selectFromAlbum,
            sendTextImage,
            startVoiceInput,
            sendVoiceMessage,
            closeVoiceInputPanel,
            openLocationPanel,
            closeLocationPanel,
            sendLocation,
            openTransferPanel,
            closeTransferPanel,
            sendTransfer,
            openTaobaoPanel,
            searchTaobaoProducts,
            buyTaobaoProduct,
            helpBuyTaobaoProduct,
            handleVote,
            addVoteOption,
            removeVoteOption,
            createVote,
            handleShare,
            sendShareCard,
            handleRetry,
            handleTakeaway,
            handleTarot,
            handlePet,
            handleOrder,
            openVirtualCamera,
            sendVirtualImage,
            castVoteInChat,
            addTrajectoryPoint,
            removeTrajectoryPoint
        } = attachment;

        const clearChatHistory = () => {
            if (!soulLinkActiveChat.value) return;
            
            if (confirm('确定要清空当前聊天记录吗？')) {
                soulLinkMessages.value[soulLinkActiveChat.value] = [];
                saveSoulLinkMessages();
            }
        };
        
        const exportChatHistory = () => {
            if (!soulLinkActiveChat.value) return;
            
            const messages = soulLinkMessages.value[soulLinkActiveChat.value] || [];
            if (messages.length === 0) {
                alert('没有聊天记录可导出');
                return;
            }
            
            let content = '';
            messages.forEach(msg => {
                const time = msg.time || '';
                const sender = msg.sender === 'ai' ? currentChatName.value || 'AI' : '我';
                const text = msg.text || '';
                content += `[${time}] ${sender}：${text}\n\n`;
            });
            
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `聊天记录_${new Date().toLocaleDateString()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        };
        async function loadSoulLinkMessages() {
            try {
                const saved = await dbGet('soulLinkMessages', 'messages');
                if (saved && saved.data) {
                    soulLinkMessages.value = saved.data;
                }
            } catch (e) {
                console.error('Failed to load SoulLink messages:', e);
                soulLinkMessages.value = {};
            }
        };
        const saveSoulLinkGroups = async () => {
            try {
                const dataToSave = JSON.parse(JSON.stringify(soulLinkGroups.value));
                await dbPut('soulLinkGroups', { id: 'groups', data: dataToSave });
            } catch (e) {
                console.error('Failed to save SoulLink groups:', e);
            }
        };

        const sendGroupActiveMessage = async () => {
            if (!soulLinkActiveChat.value || soulLinkActiveChatType.value !== 'group') return;
            const group = soulLinkGroups.value.find((g) => String(g.id) === String(soulLinkActiveChat.value));
            if (!group || !Array.isArray(group.members) || group.members.length === 0) return;

            const availableMembers = group.members.filter((m) => {
                if (!m || m.id == null) return false;
                if (String(m.id).startsWith('custom_')) return true;
                const ch = characters.value.find((c) => String(c.id) === String(m.id));
                return !(ch && ch.blockedByUser);
            });
            if (availableMembers.length === 0) return;

            const randomMember = availableMembers[Math.floor(Math.random() * availableMembers.length)];
            const memberName = randomMember.name || '成员';
            const memberPersona = randomMember.persona || '';

            let messageText = '';
            const profile = activeProfile.value;
            if (!profile || !profile.endpoint || !profile.key) return;
            try {
                const prompt = `你正在扮演群聊成员【${memberName}】。\n${memberPersona}\n\n请主动说一句简短、自然的话（可以是问候、分享心情或提醒），不要超过30字。直接输出内容，不要加引号或额外说明。`;
                messageText = String(await callAI(profile, [{ role: 'user', content: prompt }], { temperature: 0.8 }) || '').trim();
            } catch (err) {
                console.warn('AI 生成群聊主动消息失败:', err);
            }
            if (!messageText) return;

            pushMessageToActiveChat({
                id: Date.now(),
                sender: 'ai',
                senderName: memberName,
                senderAvatar: randomMember.avatarUrl,
                text: messageText,
                timestamp: Date.now(),
                isActiveMessage: true
            });
        };

        if (chat && typeof chat.setGroupActiveMessageCallback === 'function') {
            chat.setGroupActiveMessageCallback(sendGroupActiveMessage);
        }

        setApplyBackupHandler(async (pkg) => {
            if (!pkg || typeof pkg !== 'object') {
                addConsoleLog('备份数据无效。', 'error');
                return;
            }
            if (!window.confirm('确定用此备份覆盖当前数据？\n\n建议先导出一份当前备份；恢复后会自动刷新页面。')) {
                return;
            }
            backupImporting.value = true;
            try {
                if (pkg.localStorage && typeof pkg.localStorage === 'object') {
                    for (const [k, v] of Object.entries(pkg.localStorage)) {
                        if (v === null || v === undefined) continue;
                        localStorage.setItem(k, String(v));
                    }
                }
                if (pkg.indexedDB && typeof pkg.indexedDB === 'object') {
                    await restoreIdbDatabase('SoulOS_DB', pkg.indexedDB.SoulOS_DB);
                    await restoreIdbDatabase('FeedDB', pkg.indexedDB.FeedDB);
                }
                addConsoleLog('数据已恢复，正在刷新…', 'success');
                setTimeout(() => { window.location.reload(); }, 500);
            } catch (e) {
                addConsoleLog('恢复失败：' + (e.message || e), 'error');
            } finally {
                backupImporting.value = false;
            }
        });

        setSegmentedDataProvider(() => ({
            segments: {
                apps: {
                    chat: {
                        localStorage: pickLocalStorageByPrefixes([
                            'soulos_chat_menu_',
                            'soulos_chat_offline_modes',
                            'soulos_novel_mode',
                            'callWidgetSubtitle'
                        ]),
                        data: {
                            soulLinkMessages: JSON.parse(JSON.stringify(soulLinkMessages.value || {})),
                            soulLinkGroups: JSON.parse(JSON.stringify(soulLinkGroups.value || [])),
                            soulLinkPet: JSON.parse(JSON.stringify(soulLinkPet.value || {}))
                        }
                    },
                    workshop: {
                        localStorage: pickLocalStorageByPrefixes(['soulos_workshop_']),
                        data: {
                            characters: JSON.parse(JSON.stringify(characters.value || [])),
                            worldbooks: JSON.parse(JSON.stringify(worldbooks.value || [])),
                            presets: JSON.parse(JSON.stringify(presets.value || []))
                        }
                    },
                    feed: {
                        localStorage: pickLocalStorageByPrefixes(['feed_']),
                        data: {}
                    },
                    mate: {
                        localStorage: pickLocalStorageByPrefixes(['mate_']),
                        data: {}
                    },
                    theme: {
                        localStorage: pickLocalStorageByPrefixes([
                            'theme',
                            'homeWallpaper',
                            'homeTextColor',
                            'enableHomeGlass',
                            'enableHideStatusBar',
                            'enableNotchAdaptation'
                        ]),
                        data: {}
                    }
                },
                roles: (() => {
                    const roleSegments = {};
                    (characters.value || []).forEach((c) => {
                        const rid = String(c.id);
                        roleSegments[rid] = {
                            id: rid,
                            name: c.nickname || c.name || `角色-${rid}`,
                            character: JSON.parse(JSON.stringify(c)),
                            soulLinkMessages: JSON.parse(JSON.stringify(soulLinkMessages.value?.[rid] || [])),
                            localStorage: {
                                [`soulos_chat_menu_${rid}`]: localStorage.getItem(`soulos_chat_menu_${rid}`)
                            }
                        };
                    });
                    return roleSegments;
                })()
            }
        }));

        setSegmentedApplyHandler(async (pkg, pickers) => {
            if (!pkg?.segments || typeof pkg.segments !== 'object') {
                addConsoleLog('分片备份数据无效。', 'error');
                return;
            }
            backupImporting.value = true;
            try {
                const apps = pkg.segments.apps || {};
                const roles = pkg.segments.roles || {};
                const allowedApps = pickers?.apps || null;
                const allowedRoles = pickers?.roles || null;

                Object.entries(apps).forEach(([appKey, seg]) => {
                    if (allowedApps && !allowedApps.has(appKey)) return;
                    const ls = seg?.localStorage || {};
                    Object.entries(ls).forEach(([k, v]) => {
                        if (v !== null && v !== undefined) localStorage.setItem(k, String(v));
                    });
                });

                if ((!allowedApps || allowedApps.has('chat')) && apps.chat?.data?.soulLinkMessages && typeof apps.chat.data.soulLinkMessages === 'object') {
                    soulLinkMessages.value = {
                        ...(soulLinkMessages.value || {}),
                        ...apps.chat.data.soulLinkMessages
                    };
                    await saveSoulLinkMessages();
                }
                if ((!allowedApps || allowedApps.has('chat')) && Array.isArray(apps.chat?.data?.soulLinkGroups)) {
                    soulLinkGroups.value = mergeById(soulLinkGroups.value, apps.chat.data.soulLinkGroups);
                    await saveSoulLinkGroups();
                }
                if ((!allowedApps || allowedApps.has('chat')) && apps.chat?.data?.soulLinkPet && typeof apps.chat.data.soulLinkPet === 'object') {
                    soulLinkPet.value = { ...(soulLinkPet.value || {}), ...apps.chat.data.soulLinkPet };
                }
                if ((!allowedApps || allowedApps.has('workshop')) && Array.isArray(apps.workshop?.data?.characters)) {
                    characters.value = mergeById(characters.value, apps.workshop.data.characters);
                }
                if ((!allowedApps || allowedApps.has('workshop')) && Array.isArray(apps.workshop?.data?.worldbooks)) {
                    worldbooks.value = mergeById(worldbooks.value, apps.workshop.data.worldbooks);
                }
                if ((!allowedApps || allowedApps.has('workshop')) && Array.isArray(apps.workshop?.data?.presets)) {
                    presets.value = mergeById(presets.value, apps.workshop.data.presets);
                }

                Object.values(roles).forEach((seg) => {
                    const roleId = String(seg?.id || '');
                    if (!roleId) return;
                    if (allowedRoles && !allowedRoles.has(roleId)) return;
                    if (seg.character) {
                        characters.value = mergeById(characters.value, [seg.character]);
                    }
                    if (Array.isArray(seg.soulLinkMessages)) {
                        soulLinkMessages.value = { ...(soulLinkMessages.value || {}), [roleId]: seg.soulLinkMessages };
                    }
                    const ls = seg.localStorage || {};
                    Object.entries(ls).forEach(([k, v]) => {
                        if (v !== null && v !== undefined) localStorage.setItem(k, String(v));
                    });
                });

                await saveSoulLinkMessages();
                await saveSoulLinkGroups();
                saveCharacters();
                saveWorldbooks();
                savePresets();
                addConsoleLog('分片恢复完成：已按软件/角色合并，不影响其它数据。', 'success');
            } catch (e) {
                addConsoleLog('分片恢复失败：' + (e.message || e), 'error');
            } finally {
                backupImporting.value = false;
            }
        });

        async function loadSoulLinkGroups() {
            try {
                const saved = await dbGet('soulLinkGroups', 'groups');
                if (saved && saved.data) {
                    const parsed = saved.data;
                    soulLinkGroups.value = Array.isArray(parsed) ? parsed : [];
                    soulLinkGroups.value.forEach((group) => {
                        if (group.members && Array.isArray(group.members)) {
                            group.members.forEach((member) => {
                                if (member.relation === undefined) {
                                    member.relation = '';
                                }
                                if (!member.timeZone) member.timeZone = 'Asia/Shanghai';
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('Failed to load SoulLink groups:', e);
                soulLinkGroups.value = [];
            }
        };
        const saveSoulLinkPet = () => {
            try {
                localStorage.setItem('soulos_soullink_pet', JSON.stringify(soulLinkPet.value));
            } catch (e) {
                console.error('Failed to save SoulLink pet:', e);
            }
        };
        function loadSoulLinkPet() {
            try {
                const saved = localStorage.getItem('soulos_soullink_pet');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === 'object') {
                        soulLinkPet.value = {
                            ...soulLinkPet.value,
                            ...parsed
                        };
                    }
                }
            } catch (e) {
                console.error('Failed to load SoulLink pet:', e);
            }
        };
        const getCharacterName = (id) => {
            if (soulLinkActiveChatType.value === 'group' && soulLinkActiveChat.value === id) {
                return activeGroupChat.value ? activeGroupChat.value.name : 'GROUP SIGNAL';
            }
            const char = characters.value.find(c => c.id === Number(id));
            return char ? (char.nickname || char.name) : 'Unknown Signal';
        };

        const getCharacterAvatar = (id) => {
            if (soulLinkActiveChatType.value === 'group' && soulLinkActiveChat.value === id) {
                return activeGroupChat.value ? activeGroupChat.value.avatar : '';
            }
            const char = characters.value.find(c => c.id === Number(id));
            return char ? char.avatarUrl : '';
        };

        const getActiveChatName = () => {
            if (soulLinkActiveChatType.value === 'group') {
                return activeGroupChat.value ? activeGroupChat.value.name : 'GROUP SIGNAL';
            }
            return getCharacterName(soulLinkActiveChat.value);
        };

        const getActiveChatAvatar = () => {
            if (soulLinkActiveChatType.value === 'group') {
                return activeGroupChat.value ? activeGroupChat.value.avatar : '';
            }
            return getCharacterAvatar(soulLinkActiveChat.value);
        };

        const getActiveChatStatus = () => {
            if (soulLinkActiveChatType.value === 'group') {
                const count = activeGroupChat.value ? (activeGroupChat.value.members || []).length : 0;
                return `GROUP · ${count} MEMBERS`;
            }
            return 'ONLINE';
        };

        const getLocationLabel = (side) => {
            if (side === 'ai') {
                return getActiveChatName();
            }
            return '我';
        };

        const addSystemMessageToActiveChat = (text, extra = {}) => {
            if (!soulLinkActiveChat.value) return;
            pushMessageToActiveChat({
                id: Date.now(),
                sender: 'system',
                text,
                timestamp: Date.now(),
                isSystem: true,
                ...extra
            });
        };

        const startSoulLinkChat = (charId) => {
            soulLinkActiveChat.value = charId;
            soulLinkActiveChatType.value = 'character';
            soulLinkTab.value = 'msg';
            if (!soulLinkMessages.value[charId]) {
                soulLinkMessages.value[charId] = [];
            }
            loadChatMenuSettings();
            markActiveChatAiMessagesRead();
            scrollToBottom();
        };

        const openSoulLinkGroupChat = (groupId) => {
            soulLinkActiveChat.value = groupId;
            soulLinkActiveChatType.value = 'group';
            soulLinkTab.value = 'msg';
            if (activeGroupChat.value && !Array.isArray(activeGroupChat.value.history)) {
                activeGroupChat.value.history = [];
            }
            loadChatMenuSettings();
            markActiveChatAiMessagesRead();
            scrollToBottom();
        };

        const exitSoulLinkChat = () => {
            soulLinkActiveChat.value = null;
            soulLinkActiveChatType.value = 'character';
        };

        const switchSoulLinkTab = (tab) => {
            soulLinkTab.value = tab;
        };

        const activeChatMessages = computed(() => {
            if (!soulLinkActiveChat.value) return [];
            const blockedCharIds = new Set(
                (characters.value || []).filter((c) => c && c.blockedByUser).map((c) => String(c.id))
            );
            if (soulLinkActiveChatType.value === 'group') {
                const messages = activeGroupChat.value && Array.isArray(activeGroupChat.value.history)
                    ? activeGroupChat.value.history
                    : [];
                return messages.filter((m) => {
                    if (!m || m.isHidden) return false;
                    if (m.sender === 'ai' && m.senderId != null && blockedCharIds.has(String(m.senderId))) return false;
                    return true;
                });
            }
            const messages = soulLinkMessages.value[soulLinkActiveChat.value] || [];
            return messages.filter((m) => m && !m.isHidden && (m.isSystem || m.isCallMessage || m.messageType || String(m.text || '').replace(/\u200b/g, '').trim() || String(m.osContent || '').trim()));
        });
        const currentChatMessages = computed(() => activeChatMessages.value);

        const recentChats = computed(() => {
            const chats = [];
            for (const [charId, msgs] of Object.entries(soulLinkMessages.value)) {
                if (msgs.length > 0) {
                    const lastMsg = msgs[msgs.length - 1];
                    chats.push({
                        id: charId,
                        characterId: Number(charId),
                        lastMessage: lastMsg.text,
                        lastTime: new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        timestamp: lastMsg.timestamp
                    });
                }
            }
            return chats.sort((a, b) => b.timestamp - a.timestamp);
        });

        const markActiveChatAiMessagesRead = () => {
            if (!soulLinkActiveChat.value) return;
            const history = getActiveChatHistory();
            let changed = false;
            history.forEach(m => {
                if (m && m.sender === 'ai' && m.isReadByUser === false) {
                    m.isReadByUser = true;
                    changed = true;
                }
            });
            if (changed) {
                syncActiveChatState();
                persistActiveChat();
            }
        };

        const saveArchivedChats = async () => {
            try {
                const dataToSave = JSON.parse(JSON.stringify(archivedChats.value));
                await dbPut('archivedChats', { id: 'archives', data: dataToSave });
            } catch (e) {
                console.error('Failed to save archived chats:', e);
            }
        };

        async function loadArchivedChats() {
            try {
                const saved = await dbGet('archivedChats', 'archives');
                if (saved && saved.data) {
                    archivedChats.value = saved.data;
                }
            } catch (e) {
                console.error('Failed to load archived chats:', e);
                archivedChats.value = [];
            }
        }

        const filteredArchivedChats = computed(() => {
            if (!soulLinkActiveChat.value) {
                return archivedChats.value;
            }
            const currentChatType = soulLinkActiveChatType.value;
            const currentChatId = soulLinkActiveChat.value;
            return archivedChats.value.filter(archive => {
                const archiveChatId = archive.chatId || archive.characterId;
                const archiveChatType = archive.chatType || 'character';
                return archiveChatType === currentChatType && String(archiveChatId) === String(currentChatId);
            });
        });

        const sortedArchivedChats = computed(() => {
            return [...filteredArchivedChats.value].sort((a, b) => b.timestamp - a.timestamp);
        });

        const archiveCurrentChat = () => {
            if (!soulLinkActiveChat.value || !archiveName.value.trim()) return;
            let currentMessages = [];
            const chatType = soulLinkActiveChatType.value;
            const chatId = soulLinkActiveChat.value;
            if (chatType === 'group' && activeGroupChat.value) {
                currentMessages = activeGroupChat.value.history || [];
            } else {
                currentMessages = soulLinkMessages.value[chatId] || [];
            }
            if (currentMessages.length === 0) return;
            const char = characters.value.find(c => String(c.id) === String(chatId));
            const chatName = chatType === 'group'
                ? (activeGroupChat.value?.name || '群聊')
                : (char ? (char.nickname || char.name) : '未知');
            const archive = {
                id: `archive_${Date.now()}`,
                chatType,
                chatId,
                chatName,
                characterId: chatId,
                name: archiveName.value.trim(),
                description: archiveDescription.value.trim(),
                timestamp: Date.now(),
                messages: [...currentMessages],
                preview: currentMessages[currentMessages.length - 1]?.text || '无消息'
            };
            archivedChats.value.push(archive);
            saveArchivedChats();
            if (chatType === 'group' && activeGroupChat.value) {
                activeGroupChat.value.history = [];
                saveSoulLinkGroups();
            } else {
                soulLinkMessages.value[chatId] = [];
                saveSoulLinkMessages();
            }
            showArchiveDialog.value = false;
            archiveName.value = '';
            archiveDescription.value = '';
        };

        const restoreArchivedChat = (archive) => {
            if (!archive) return;
            const chatType = archive.chatType || 'character';
            const chatId = archive.chatId || archive.characterId;
            soulLinkActiveChat.value = chatId;
            soulLinkActiveChatType.value = chatType;
            soulLinkTab.value = 'msg';
            if (chatType === 'group') {
                const group = soulLinkGroups.value.find(g => String(g.id) === String(chatId));
                if (group) {
                    group.history = [...(archive.messages || [])];
                    saveSoulLinkGroups();
                }
            } else {
                soulLinkMessages.value[chatId] = [...(archive.messages || [])];
                saveSoulLinkMessages();
            }
            showArchivedChats.value = false;
            scrollToBottom();
        };

        const deleteArchivedChat = (archiveId) => {
            const idx = archivedChats.value.findIndex(a => a.id === archiveId);
            if (idx > -1) {
                archivedChats.value.splice(idx, 1);
                saveArchivedChats();
            }
        };

        // ✅ Watch for auto-save
        watch(soulLinkMessages, saveSoulLinkMessages, { deep: true });
        watch(soulLinkGroups, saveSoulLinkGroups, { deep: true });
        watch(soulLinkPet, saveSoulLinkPet, { deep: true });
        
        // 重置创建群聊表单
        watch(showCreateGroupDialog, (val) => {
            if (val) {
                newGroupName.value = '';
                newGroupMembers.value = '';
                newGroupAvatar.value = '';
                selectedGroupMembers.value = [];
            }
        });

        // 重置添加成员表单
        watch(showAddMemberDialog, (val) => {
            if (val) {
                selectedAddMembers.value = [];
                addMemberMode.value = 'existing';
                customMemberAvatar.value = '';
                customMemberName.value = '';
                customMemberPersona.value = '';
                customMemberWorldbookIds.value = [];
                customMemberPresetId.value = null;
                customMemberTimeZone.value = 'Asia/Shanghai';
            }
        });

        // 初始化重命名群聊表单
        watch(showRenameGroupDialog, (val) => {
            if (val && activeGroupChat.value) {
                newGroupNameInput.value = activeGroupChat.value.name || '';
                tempGroupAvatar.value = activeGroupChat.value.avatarUrl || '';
            }
        });

        // ==========================================================
        // --- NEW FEATURES (Chat Menu, Calls, Virtual Camera) ---
        // ==========================================================

        // --- Chat Menu Logic ---
        const setBubbleStyle = chatSettings.setBubbleStyle;
        const applyCustomCSS = chatSettings.applyCustomCSS;
        const applyBubbleStyle = chatSettings.applyBubbleStyle;
        const getUserPronounInstruction = chatSettings.getUserPronounInstruction;
        const getForeignBilingualConstraintPrompt = chatSettings.getForeignBilingualConstraintPrompt;
        const buildTimeZonePromptBlock = chatSettings.buildTimeZonePromptBlock;
        const buildAiBusyDecisionPromptBlock = chatSettings.buildAiBusyDecisionPromptBlock;
        const clearActiveMessageTimer = chatSettings.clearActiveMessageTimer;

        const showChatMenu = ref(false);
        const showProfile = ref(false);
        const profileChar = ref(null);
        
        const uploadUserAvatar = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const maxSize = 5 * 1024 * 1024;
                    if (file.size > maxSize) {
                        alert('图片大小不能超过5MB，请选择小一点的图片');
                        return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        compressAvatarImage(e.target.result, (compressedDataUrl) => {
                            userAvatar.value = compressedDataUrl;
                            saveToStorage('soulos_user_avatar', userAvatar.value);
                        });
                    };
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        };
        
        const resetUserAvatar = () => {
            if (confirm('确定要重置头像吗？')) {
                userAvatar.value = '';
                localStorage.removeItem('soulos_user_avatar');
            }
        };

        const saveAndCloseSettings = () => {
            chatSettings.applyCustomCSS();
            saveChatMenuSettings();
            closeAllPanels();
        };

        let pendingRoleReplyTimer = null;
        const clearPendingRoleReplyTimer = () => {
            if (pendingRoleReplyTimer) clearTimeout(pendingRoleReplyTimer);
            pendingRoleReplyTimer = null;
        };
        const scheduleRoleActiveMessage = () => {
            chatSettings.scheduleRoleActiveMessage(() => {
                if (!soulLinkActiveChat.value) return;
                if (soulLinkActiveChatType.value === 'character' && chatSettings.userBlockedRole.value) return;
                if (soulLinkActiveChatType.value === 'group') {
                    void Promise.resolve(sendGroupActiveMessage()).finally(() => {
                        scheduleRoleActiveMessage();
                    });
                    return;
                }
                const hints = ['（自言自语）今天突然想到你。', '（自言自语）先记一笔，晚点再聊。', '（自言自语）刚路过一家店，想到你会喜欢。', '（自言自语）这会儿有点安静。'];
                const text = hints[Math.floor(Math.random() * hints.length)];
                pushMessageToActiveChat({
                    id: Date.now(),
                    sender: 'ai',
                    text,
                    timestamp: Date.now()
                });
                saveSoulLinkMessages();
                scheduleRoleActiveMessage();
            });
        };
        chatPersistence.saveSoulLinkMessages = saveSoulLinkMessages;
        chatPersistence.saveSoulLinkGroups = saveSoulLinkGroups;
        chatPersistence.saveArchivedChats = saveArchivedChats;

        const queueRoleReplyAfterUserMessage = () => {
            clearPendingRoleReplyTimer();
            if (!chatSettings.activeMessageEnabled.value) return;
            if (soulLinkActiveChatType.value === 'character' && chatSettings.userBlockedRole.value) return;
            const history = getActiveChatHistory();
            const pending = getPendingUserMessages(history);
            if (pending.length >= 3) {
                pushMessageToActiveChat({
                    id: Date.now(),
                    sender: 'system',
                    text: '检测到你连续发消息，已召回对方。',
                    timestamp: Date.now(),
                    isSystem: true
                });
                pendingRoleReplyTimer = setTimeout(() => {
                    triggerSoulLinkAiReply({ skipBusySimulation: true });
                }, 1200);
                return;
            }

            const baseDelay = Math.max(1, Number(chatSettings.activeReplyDelaySec.value) || 8) * 1000;
            pendingRoleReplyTimer = setTimeout(() => {
                // 仅在“角色主动发消息那条链路”中启用 busy 决策标签
                triggerSoulLinkAiReply({ skipBusySimulation: true, enableAiBusyDecision: true });
            }, baseDelay);
        };
        const toggleUserBlockRole = () => {
            if (!soulLinkActiveChat.value || soulLinkActiveChatType.value !== 'character') return;
            const char = characters.value.find((c) => String(c.id) === String(soulLinkActiveChat.value));
            if (!char) return;
            char.blockedByUser = !char.blockedByUser;
            saveCharacters();
            const label = char.nickname || char.name || '对方';
            if (char.blockedByUser) {
                clearActiveMessageTimer();
                clearPendingRoleReplyTimer();
                pushMessageToActiveChat({
                    id: Date.now(),
                    sender: 'system',
                    text: `你已拉黑${label}，将不再接收其消息。`,
                    timestamp: Date.now(),
                    isSystem: true
                });
            } else {
                pushMessageToActiveChat({
                    id: Date.now(),
                    sender: 'system',
                    text: `你已取消拉黑${label}，可继续聊天。`,
                    timestamp: Date.now(),
                    isSystem: true
                });
                scheduleRoleActiveMessage();
            }
        };

        const isCharacterBlockedByUser = (characterId) => {
            if (characterId == null || String(characterId).startsWith('custom_')) return false;
            const ch = characters.value.find((c) => String(c.id) === String(characterId));
            return !!(ch && ch.blockedByUser);
        };

        const toggleUserBlockRoleForCharacter = (characterId) => {
            const char = characters.value.find((c) => String(c.id) === String(characterId));
            if (!char) return;
            char.blockedByUser = !char.blockedByUser;
            saveCharacters();
            const label = char.nickname || char.name || '该角色';
            if (
                soulLinkActiveChatType.value === 'group'
                && activeGroupChat.value?.members?.some((m) => m && String(m.id) === String(characterId))
            ) {
                pushMessageToActiveChat({
                    id: Date.now(),
                    sender: 'system',
                    text: `你已${char.blockedByUser ? '拉黑' : '取消拉黑'} ${label}`,
                    timestamp: Date.now(),
                    isSystem: true
                });
            }
        };

        const formatChatSummaryItem = (entry) => {
            const d = entry?.createdAt ? new Date(entry.createdAt) : new Date();
            return {
                ...entry,
                createdAtText: `${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
            };
        };
        const getLatestSummaryText = () => (
            typeof chatSettings.getLatestSummaryText === 'function'
                ? chatSettings.getLatestSummaryText()
                : ''
        );
        const buildSummaryPromptBlock = () => {
            const text = getLatestSummaryText();
            if (!text) return '';
            return `\n\n# 对话摘要（用于节省token，请严格参考）\n${text}\n`;
        };
        const getModelHistorySlice = (history) => {
            const arr = Array.isArray(history) ? history : [];
            const filtered = arr.filter((m) => m && !m.isSystem && !m.isHidden);
            const rawCursor = typeof chatSettings.getChatSummaryCursor === 'function'
                ? chatSettings.getChatSummaryCursor()
                : 0;
            const cursor = Math.max(0, Number(rawCursor) || 0);
            if (cursor <= 0) return filtered;
            if (cursor >= filtered.length) return [];
            return filtered.slice(cursor);
        };

        const generateChatSummaryByModel = async ({ charName, groupName, isGroupChat, summarySoFar, newMessages }) => {
            if (!activeProfile.value) return null;
            const profile = activeProfile.value;
            const endpoint = (profile.endpoint || '').trim();
            const key = (profile.key || '').trim();
            if (!endpoint || !key) return null;
            const model = profile.model || profile.openai_model || profile.claude_model || profile.openrouter_model || 'gpt-4o-mini';

            const base = endpoint.replace(/\/+$/, '');
            const candidateUrls = /\/chat\/completions$/i.test(base)
                ? [base]
                : /\/v1$/i.test(base)
                    ? [`${base}/chat/completions`]
                    : [`${base}/v1/chat/completions`, `${base}/chat/completions`];

            const nameLine = isGroupChat ? `群聊：${groupName || '群聊'}` : `角色：${charName || 'TA'}`;
            const sys = '你是一个“对话压缩器/摘要器”。输出必须精炼、可供后续对话参考，不要复述流水账。只输出摘要正文。';
            const user = `
请把这段对话增量总结成“可持续更新的摘要”。

【对象】
${nameLine}

【已有摘要（可能为空）】
${String(summarySoFar || '').slice(0, 2000)}

【新增对话片段】
${JSON.stringify((newMessages || []).slice(-60).map((m) => ({
  sender: m.sender,
  senderName: m.senderName || '',
  text: (m.text || '').slice(0, 240),
  messageType: m.messageType || '',
  timestamp: m.timestamp || ''
})), null, 2)}

【要求】
- 用极简要点输出（建议 3-6 条，每条尽量短）
- 必须包含：关系/立场变化、关键事实、未解决问题、用户偏好、下一步约定
- 总长度尽量控制在 220-420 个中文字符内
- 不要出现“摘要如下/总结：”这种开头
- 不要输出代码块/markdown围栏
`.trim();

            for (const url of candidateUrls) {
                try {
                    const resp = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${key}`
                        },
                        body: JSON.stringify({
                            model,
                            temperature: 0.4,
                            messages: [
                                { role: 'system', content: sys },
                                { role: 'user', content: user }
                            ],
                            stream: false
                        })
                    });
                    if (!resp.ok) continue;
                    const data = await resp.json();
                    const raw = data?.choices?.[0]?.message?.content || data?.message?.content || data?.output_text || data?.text || '';
                    const text = String(raw || '').replace(/```[\s\S]*?```/g, '').trim();
                    if (text) return text;
                } catch {
                    // try next
                }
            }
            return null;
        };

        const compactSummaryText = (text) => {
            const raw = String(text || '').trim();
            if (!raw) return '';
            const lines = raw
                .split(/\r?\n/)
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 6);
            const merged = lines.join('\n');
            const MAX_SUMMARY_LEN = 420;
            if (merged.length <= MAX_SUMMARY_LEN) return merged;
            return `${merged.slice(0, MAX_SUMMARY_LEN - 1)}…`;
        };

        const createSummaryPlaceholder = (title = '聊天总结') => {
            const now = new Date();
            const item = formatChatSummaryItem({
                id: `sum_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                title,
                body: '正在总结...',
                status: 'pending',
                createdAt: now.toISOString()
            });
            if (!Array.isArray(chatSettings.chatSummaryBoard.value)) chatSettings.chatSummaryBoard.value = [];
            chatSettings.chatSummaryBoard.value.unshift(item);
            chatSettings.saveChatSummaryState();
            return item;
        };

        const finalizeSummaryItem = (item, bodyText, status = 'ready') => {
            if (!item) return;
            item.body = String(bodyText || '').trim() || (status === 'failed' ? '总结失败（可稍后再试）。' : '');
            item.status = status;
            chatSettings.saveChatSummaryState();
        };

        const summarizeChatIncremental = async (force = false) => {
            if (!chatSettings.chatSummaryEnabled.value && !force) return null;
            if (!soulLinkActiveChat.value) return null;
            if (chatSettings.chatSummaryGenerating.value) return null;

            const isGroupChat = soulLinkActiveChatType.value === 'group';
            const activeGroup = isGroupChat ? activeGroupChat.value : null;
            const history = isGroupChat ? (activeGroup?.history || []) : (soulLinkMessages.value[soulLinkActiveChat.value] || []);
            const visible = Array.isArray(history) ? history.filter((m) => m && !m.isSystem && !m.isHidden) : [];
            const rawCursor = typeof chatSettings.getChatSummaryCursor === 'function'
                ? chatSettings.getChatSummaryCursor()
                : 0;
            const cursor = Math.max(0, Number(rawCursor) || 0);
            const newChunk = visible.slice(cursor);
            if (!force && newChunk.length < Math.max(1, Number(chatSettings.chatSummaryEveryN.value) || 1)) return null;

            chatSettings.chatSummaryGenerating.value = true;
            const placeholder = createSummaryPlaceholder('聊天总结');
            try {
                const char = !isGroupChat ? characters.value.find(c => String(c.id) === String(soulLinkActiveChat.value)) : null;
                const charName = char?.nickname || char?.name || currentChatName.value || 'TA';
                const groupName = activeGroup?.name || currentChatName.value || '群聊';
                const summarySoFar = getLatestSummaryText();
                const text = await generateChatSummaryByModel({
                    charName,
                    groupName,
                    isGroupChat,
                    summarySoFar,
                    newMessages: newChunk
                });
                if (!text) {
                    finalizeSummaryItem(placeholder, '总结失败（可稍后再试）。', 'failed');
                    return null;
                }
                finalizeSummaryItem(placeholder, compactSummaryText(text), 'ready');
                chatSettings.setChatSummaryCursor(visible.length);
                return text;
            } finally {
                chatSettings.chatSummaryGenerating.value = false;
            }
        };

        const manualSummarizeChat = () => summarizeChatIncremental(true);
        const clearChatSummaryBoard = () => chatSettings.clearChatSummaryBoard();

        const saveChatMenuSettings = () => {
            chatSettings.saveChatMenuSettings();
            showChatSettings.value = false;
        };

        function loadChatMenuSettings() {
            chatSettings.loadChatMenuSettings();
            if (chatSettings.activeMessageEnabled.value) {
                scheduleRoleActiveMessage();
            } else {
                chatSettings.clearActiveMessageTimer();
            }
        }

        const confirmChatMenu = () => {
            chatSettings.bubbleStyle.value = chatSettings.customBubbleCSS.value && chatSettings.customBubbleCSS.value.trim()
                ? 'custom'
                : 'default';
            saveChatMenuSettings();
            chatSettings.applyBubbleStyle();
            showChatMenu.value = false;
        };

        // --- Chat Archive Functions ---        



        // --- Call Logic ---
        const CALL_DIARY_STORAGE_KEY = 'soulos_call_diary_records_v1';
        const CALL_DIARY_COUNTER_KEY = 'soulos_call_diary_counter_v1';
        const callInput = ref('');

        const loadCallDiaryRecords = () => {
            try {
                callDiaryRecords.value = JSON.parse(localStorage.getItem(CALL_DIARY_STORAGE_KEY) || '{}') || {};
            } catch {
                callDiaryRecords.value = {};
            }
        };
        const loadCallDiaryCounters = () => {
            try {
                callDiaryCounters.value = JSON.parse(localStorage.getItem(CALL_DIARY_COUNTER_KEY) || '{}') || {};
            } catch {
                callDiaryCounters.value = {};
            }
        };
        const saveCallDiaryRecords = () => {
            try {
                localStorage.setItem(CALL_DIARY_STORAGE_KEY, JSON.stringify(callDiaryRecords.value || {}));
            } catch {
                // ignore
            }
        };
        const saveCallDiaryCounters = () => {
            try {
                localStorage.setItem(CALL_DIARY_COUNTER_KEY, JSON.stringify(callDiaryCounters.value || {}));
            } catch {
                // ignore
            }
        };
        loadCallDiaryRecords();
        loadCallDiaryCounters();

        const getCallDiaryKey = () => {
            if (!soulLinkActiveChat.value) return '';
            return soulLinkActiveChatType.value === 'group'
                ? `group:${String(soulLinkActiveChat.value)}`
                : `char:${String(soulLinkActiveChat.value)}`;
        };
        const generateCallDiaryByModel = async ({ charName, duration, type, charPersona, recentChatMessages, sessionMessages }) => {
            if (!activeProfile.value) {
                alert('未检测到 API 配置，无法生成通话日记。');
                return null;
            }
            const profile = activeProfile.value;
            const endpoint = (profile.endpoint || '').trim();
            const key = (profile.key || '').trim();
            if (!endpoint || !key) {
                alert('当前 API 配置缺少 endpoint 或 key，无法生成通话日记。');
                return null;
            }

            const pronounWord = (() => {
                if (chatSettings.userPronoun.value === 'female') return '她';
                if (chatSettings.userPronoun.value === 'male') return '他';
                if (chatSettings.userPronoun.value === 'nonbinary') return 'TA';
                return '你';
            })();
            const [mm, ss] = String(duration || '00:00').split(':').map((x) => Number(x) || 0);
            const totalSeconds = mm * 60 + ss;
            const targetParagraphs = totalSeconds >= 8 * 60 ? '5-8 段' : totalSeconds >= 3 * 60 ? '4-6 段' : '2-4 段';
            const model = profile.model || profile.openai_model || profile.claude_model || profile.openrouter_model || 'gpt-4o-mini';
            const talkType = type === 'video' ? '视频' : '语音';
            const recentChat = (recentChatMessages || []).slice(-18).map((m) => ({
                sender: m.sender,
                text: (m.text || '').slice(0, 120),
                time: m.timestamp || m.time || ''
            }));
            const callChat = (sessionMessages || []).slice(-16).map((m) => ({
                sender: m.sender,
                text: (m.text || '').slice(0, 120),
                time: m.time || ''
            }));
            const userMeta = {
                pronoun: chatSettings.userPronoun.value,
                pronounWord,
                identity: chatSettings.userIdentity.value || '',
                relation: chatSettings.userRelation.value || ''
            };

            const styleGuide = `
你要以“白描、温润、克制”的中文散文风格写作：
- 角色第一人称（必须用“我”）
- 不要照抄聊天原句，不要逐条复述
- 通过细节、动作、感官去呈现情绪
- 不要写成报告/总结/提纲
- 篇幅按通话时长自适应，目标约 ${targetParagraphs}
- 用户代词严格使用：${pronounWord}
`;

            const prompt = `
请写一篇“通话后角色日记”。

【角色】
姓名：${charName}
人设：${(charPersona || '').slice(0, 600)}

【通话信息】
类型：${talkType}
时长：${duration}

【用户设定】
${JSON.stringify(userMeta)}

【当前聊天上下文（通话前后）】
${JSON.stringify(recentChat)}

【本次通话内容摘要素材】
${JSON.stringify(callChat)}

【写作要求】
${styleGuide}

只输出正文，不要标题、不要解释、不要代码块。
`;

            const base = endpoint.replace(/\/+$/, '');
            const candidateUrls = /\/chat\/completions$/i.test(base)
                ? [base]
                : /\/v1$/i.test(base)
                    ? [`${base}/chat/completions`]
                    : [`${base}/v1/chat/completions`, `${base}/chat/completions`];

            const extractContentFromAnyResponse = (data) => {
                if (!data) return '';
                const raw = data?.choices?.[0]?.message || data?.choices?.[0]?.delta;
                if (raw?.content != null) {
                    if (typeof raw.content === 'string') return raw.content;
                    if (Array.isArray(raw.content)) {
                        return raw.content
                            .map((c) => (typeof c === 'string' ? c : (c?.text ?? c?.content ?? '')) || '')
                            .join('');
                    }
                }
                if (typeof data?.message?.content === 'string') return data.message.content;
                const parts = data?.candidates?.[0]?.content?.parts;
                if (Array.isArray(parts) && parts.length) return parts.map((p) => p?.text ?? '').join('');
                if (typeof data?.output_text === 'string') return data.output_text;
                if (typeof data?.result === 'string') return data.result;
                if (typeof data?.text === 'string') return data.text;
                return '';
            };

            for (const url of candidateUrls) {
                try {
                    const resp = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${key}`
                        },
                        body: JSON.stringify({
                            model,
                            temperature: 0.9,
                            messages: [
                                { role: 'system', content: '你是擅长中文叙事散文的作家。输出必须是纯正文。' },
                                { role: 'user', content: prompt }
                            ]
                        })
                    });
                    if (!resp.ok) continue;
                    const data = await resp.json();
                    const text = extractContentFromAnyResponse(data).trim();
                    if (text) return text.replace(/```[\s\S]*?```/g, '').trim();
                } catch {
                    // try next candidate url
                }
            }

            alert('通话日记生成失败：API 调用异常或返回为空。');
            return null;
        };

        const generateCallDiaryFallback = ({ charName, duration, type, sessionMessages }) => {
            const talkType = type === 'video' ? '视频' : '语音';
            const lines = (Array.isArray(sessionMessages) ? sessionMessages : [])
                .filter((m) => m && typeof m.text === 'string' && m.text.trim())
                .slice(-8)
                .map((m) => `${m.sender === 'user' ? '你' : charName}：${m.text.trim()}`);
            const sample = lines.length ? lines.join('\n') : '（本次通话未留下可用文本片段）';
            return [
                `这次${talkType}通话结束后，我还在回味刚才的节奏。`,
                `我们聊了大约${duration || '00:00'}，有些话并不长，却很有温度。`,
                `我把印象最深的片段记下来：`,
                sample,
                `写到这里，我的心情慢慢安静下来。下次通话前，我会记得今天这份感觉。`
            ].join('\n\n');
        };

        const createCallDiaryEntry = async () => {
            const key = getCallDiaryKey();
            if (!key) return null;
            const char = soulLinkActiveChatType.value === 'group'
                ? null
                : characters.value.find(c => String(c.id) === String(soulLinkActiveChat.value));
            const charName = char?.nickname || char?.name || currentChatName.value || 'TA';
            const chatHistory = (Array.isArray(currentChatMessages?.value) ? currentChatMessages.value : []).slice(-20);
            const now = new Date();
            const counterKey = `${key}:${callType.value}`;
            const nextNo = (Number(callDiaryCounters.value[counterKey]) || 0) + 1;
            callDiaryCounters.value[counterKey] = nextNo;
            saveCallDiaryCounters();
            const vol = String(nextNo).padStart(2, '0');
            const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const fileNo = `${datePart}-${String(nextNo).padStart(4, '0')}`;
            const entryId = `call_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
            const entry = {
                id: entryId,
                chatId: String(soulLinkActiveChat.value || ''),
                chatType: soulLinkActiveChatType.value,
                name: charName,
                callType: callType.value,
                duration: callTimer.value || '00:00',
                createdAt: now.toISOString(),
                volNo: vol,
                fileNo,
                title: `${charName} · ${callType.value === 'video' ? '视频' : '语音'}通话档案`,
                body: '正在总结...',
                status: 'pending'
            };

            if (!Array.isArray(callDiaryRecords.value[key])) callDiaryRecords.value[key] = [];
            callDiaryRecords.value[key].unshift(entry);
            saveCallDiaryRecords();

            // 后台生成，不阻塞“立即出现”
            void (async () => {
                try {
                    const diaryText = await generateCallDiaryByModel({
                        charName,
                        duration: entry.duration || '00:00',
                        type: entry.callType,
                        charPersona: char?.persona || '',
                        recentChatMessages: chatHistory,
                        sessionMessages: callMessages.value || []
                    });
                    const finalDiaryText = diaryText || generateCallDiaryFallback({
                        charName,
                        duration: entry.duration || '00:00',
                        type: entry.callType,
                        sessionMessages: callMessages.value || []
                    });
                    if (!finalDiaryText) {
                        entry.status = 'failed';
                        entry.body = '总结失败（可稍后再试）。';
                    } else {
                        const closing = `\n\n—— ${new Date(entry.createdAt).toLocaleDateString('zh-CN')} · ${charName}`;
                        entry.body = `${finalDiaryText}${closing}`;
                        entry.status = 'ready';
                    }
                } catch {
                    entry.status = 'failed';
                    entry.body = '总结失败（可稍后再试）。';
                } finally {
                    callDiaryRecords.value = { ...callDiaryRecords.value };
                    saveCallDiaryRecords();
                }
            })();

            return entry;
        };
        const openCallDiary = (msg) => {
            if (!msg?.callDiaryId) return;
            const key = getCallDiaryKey();
            const list = Array.isArray(callDiaryRecords.value[key]) ? callDiaryRecords.value[key] : [];
            const found = list.find((x) => String(x.id) === String(msg.callDiaryId));
            if (!found) return;
            selectedCallDiary.value = found;
            callDiaryTitle.value = found.title || '通话档案';
            showCallDiaryModal.value = true;
        };
        const closeCallDiaryModal = () => {
            showCallDiaryModal.value = false;
            selectedCallDiary.value = null;
        };

        let callInterval = null;

        const viewCharacterProfile = () => {
            if (soulLinkActiveChat.value && soulLinkActiveChatType.value !== 'group') {
                const char = characters.value.find(c => String(c.id) === String(soulLinkActiveChat.value));
                if (char) {
                    profileChar.value = char;
                    showProfile.value = true;
                }
            }
        };

        const goBackInSoulLink = () => {
            if (soulLinkActiveChat.value) {
                soulLinkActiveChat.value = null;
                return;
            }
            closeApp();
        };

        const startCallTimer = () => {
            let seconds = 0;
            stopCallTimer();
            callInterval = setInterval(() => {
                seconds++;
                const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
                const secs = (seconds % 60).toString().padStart(2, '0');
                callTimer.value = `${mins}:${secs}`;
            }, 1000);
        };

        const stopCallTimer = () => {
            if (callInterval) clearInterval(callInterval);
            callInterval = null;
        };

        const startVoiceCall = () => {
            callType.value = 'voice';
            callActive.value = true;
            callTimer.value = '00:00';
            callMessages.value = [];
            startCallTimer();
        };

        const startVideoCall = () => {
            callType.value = 'video';
            callActive.value = true;
            callTimer.value = '00:00';
            callMessages.value = [];
            startCallTimer();
        };

        const endCall = async () => {
            callActive.value = false;
            stopCallTimer();
            if (!soulLinkActiveChat.value) return;
            const isVideo = callType.value === 'video';
            const diaryEntry = await createCallDiaryEntry();
            const callMessage = {
                id: Date.now(),
                sender: 'system',
                messageType: 'call',
                callType: callType.value,
                isCallMessage: true,
                callIcon: isVideo ? '🎥' : '📞',
                text: `${isVideo ? '视频通话' : '语音通话'}结束 ${callTimer.value || ''}`.trim(),
                callDiaryId: diaryEntry?.id || null,
                callDiaryHint: diaryEntry ? '正在总结...（可点开查看）' : '',
                timestamp: Date.now()
            };
            pushMessageToActiveChat(callMessage);
            const updateCallDiaryHint = (hint) => {
                callMessage.callDiaryHint = hint;
                syncActiveChatState();
                persistActiveChat();
            };
            if (diaryEntry?.status === 'ready') {
                updateCallDiaryHint('总结完成（可点开查看）');
            } else if (diaryEntry?.status === 'failed') {
                updateCallDiaryHint('总结失败（可点开查看）');
            } else if (diaryEntry?.id) {
                const startedAt = Date.now();
                const timer = setInterval(() => {
                    const key = getCallDiaryKey();
                    const list = Array.isArray(callDiaryRecords.value[key]) ? callDiaryRecords.value[key] : [];
                    const found = list.find((x) => String(x.id) === String(diaryEntry.id));
                    if (found?.status === 'ready') {
                        clearInterval(timer);
                        updateCallDiaryHint('总结完成（可点开查看）');
                    } else if (found?.status === 'failed') {
                        clearInterval(timer);
                        updateCallDiaryHint('总结失败（可点开查看）');
                    } else if (Date.now() - startedAt > 90000) {
                        clearInterval(timer);
                        updateCallDiaryHint('总结生成较慢（可点开查看）');
                    }
                }, 800);
            }
            syncActiveChatState();
            persistActiveChat();
        };

        const sendCallMessage = () => {
            if (!callInput.value.trim()) return;
            if (!activeProfile.value) {
                callMessages.value.push({
                    sender: 'ai',
                    text: '未检测到任何 API 配置，请先在 Console 中创建并选择一个配置。',
                    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
                return;
            }
            const profile = activeProfile.value;
            const endpoint = (profile.endpoint || '').trim();
            const key = (profile.key || '').trim();
            if (!endpoint || !key) {
                callMessages.value.push({
                    sender: 'ai',
                    text: '当前配置缺少 API 地址或密钥，请在 Console 中补全后重试。',
                    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
                return;
            }
            callMessages.value.push({
                sender: 'user',
                text: callInput.value,
                time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            });
            const input = callInput.value;
            callInput.value = '';
            isCallAiTyping.value = true;
            const isGroupChat = soulLinkActiveChatType.value === 'group';
            const activeGroup = isGroupChat ? activeGroupChat.value : null;
            const char = isGroupChat ? null : characters.value.find(c => String(c.id) === String(soulLinkActiveChat.value));
            const history = isGroupChat ? (activeGroup.history || []) : (soulLinkMessages.value[soulLinkActiveChat.value] || []);
            const messagesPayload = [];
            let availableStickers = [];
            stickerPacks.value.forEach(pack => {
                pack.stickers.forEach(s => {
                    availableStickers.push(s);
                });
            });
            let systemPrompt = '';
            if (isGroupChat) {
                const groupName = activeGroup && activeGroup.name ? activeGroup.name : '群聊';
                const members = activeGroup && Array.isArray(activeGroup.members) && activeGroup.members.length > 0 ? activeGroup.members : ['成员A', '成员B', '成员C'];
                systemPrompt = `你正在群聊【${groupName}】中与用户语音/视频通话。\n\n`;
                systemPrompt += `# 群成员\n${members.join('、')}\n\n`;
                systemPrompt += `# 行为规则\n1. 回复要简短自然，像真实通话一样。\n2. 每次回复只扮演其中一名群成员。\n3. 回复格式为「成员名: 内容」。\n4. 可以用口语和表情。\n\n`;
                if (availableStickers.length > 0) {
                    systemPrompt += `你可以发送表情包来表达情感！使用格式：[表情名] 或 [表情:表情名]。可用的表情包有：${availableStickers.map(s => s.name).join('、')}。当情绪适合时自然地发送表情包。\n\n`;
                }
                systemPrompt += `现在请开始回复。`;
            } else if (char && char.persona) {
                const charName = char.name || '角色';
                systemPrompt = `你正在通过 SoulLink 与对方进行语音/视频通话。\n\n`;
                systemPrompt += `你的名字是【${charName}】。\n`;
                systemPrompt += `${char.persona}\n\n`;
                systemPrompt += `1. 像真实的人类那样自然通话。\n2. 每次回复保持简短（1-2句话）。\n3. 使用符合${charName}性格的语气、口头禅和口语表达。\n4. 不要暴露你是AI。\n`;
                if (availableStickers.length > 0) {
                    systemPrompt += `\n你可以发送表情包来表达情感！使用格式：[表情名] 或 [表情:表情名]。可用的表情包有：${availableStickers.map(s => s.name).join('、')}。当情绪适合时自然地发送表情包，有时可以连续发多个表情包来表达强烈情感。`;
                }
            } else {
                systemPrompt = '你正在和朋友语音/视频通话。请自然、简短地对话，每次1-2句话。';
                if (availableStickers.length > 0) {
                    systemPrompt += `\n你可以发送表情包来表达情感！使用格式：[表情名] 或 [表情:表情名]。可用的表情包有：${availableStickers.map(s => s.name).join('、')}。当情绪适合时自然地发送表情包，有时可以连续发多个表情包来表达强烈情感。`;
                }
            }
            messagesPayload.push({ role: 'system', content: systemPrompt });
            history.forEach(m => {
                if (m.isSystem || m.isHidden) return;
                const ctx = buildSoulLinkReplyContext(m);
                const raw = ctx.text || (m.text || '');
                if (m.sender === 'user') {
                    messagesPayload.push({ role: 'user', content: raw });
                } else if (m.sender === 'ai') {
                    messagesPayload.push({ role: 'assistant', content: raw });
                }
            });
            callMessages.value.forEach(m => {
                if (!m || !m.text) return;
                if (m.sender === 'user') {
                    messagesPayload.push({ role: 'user', content: m.text });
                } else {
                    messagesPayload.push({ role: 'assistant', content: m.text });
                }
            });
            messagesPayload.push({ role: 'user', content: input });
            const modelId = profile.model || (availableModels.value[0] && availableModels.value[0].id) || '';
            fetch(endpoint.replace(/\/+$/, '') + '/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: messagesPayload,
                    temperature: profile.temperature ?? 0.7,
                    stream: false
                })
            }).then(async response => {
                if (!response.ok) throw new Error(`接口返回状态码 ${response.status}`);
                const data = await response.json();
                let reply = '';
                if (data && Array.isArray(data.choices) && data.choices.length > 0) {
                    const msg = data.choices[0].message || data.choices[0].delta;
                    if (msg && msg.content) reply = msg.content;
                }
                if (!reply && data && data.message && data.message.content) {
                    reply = data.message.content;
                }
                if (!reply) reply = '...';
                isCallAiTyping.value = false;
                callMessages.value.push({
                    sender: 'ai',
                    text: reply.trim(),
                    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            }).catch(error => {
                isCallAiTyping.value = false;
                callMessages.value.push({
                    sender: 'ai',
                    text: `请求模型时出错：${error.message}`,
                    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            });
        };

        // --- Chat Settings Logic ---
        const toggleChatSettings = () => {
            console.log('toggleChatSettings called, current value:', showChatSettings.value);
            showChatSettings.value = !showChatSettings.value;
            console.log('toggleChatSettings new value:', showChatSettings.value);
            
            if (showChatSettings.value) {
                loadChatMenuSettings();
            }
            // 不调用closeAllPanels，因为它会关闭聊天设置面板
        };

        // 添加默认开场白
        const addDefaultGreeting = () => {
            if (!editingCharacter.value) return;

            const defaultGreetings = [
                "你好！很高兴见到你，有什么我可以帮助你的吗？",
                "嗨！今天过得怎么样？",
                "哈喽！欢迎来到我的空间，有什么想聊的吗？",
                "你好呀！最近在忙什么呢？",
                "嗨，见到你真开心！今天有什么好玩的事吗？"
            ];

            const randomGreeting = defaultGreetings[Math.floor(Math.random() * defaultGreetings.length)];
            
            if (editingCharacter.value.openingLine) {
                editingCharacter.value.openingLine += '\n\n' + randomGreeting;
            } else {
                editingCharacter.value.openingLine = randomGreeting;
            }
        };

        // 添加自定义开场白
        const addCustomGreeting = () => {
            if (!editingCharacter.value) return;

            const customGreeting = prompt('请输入自定义开场白：');
            if (customGreeting && customGreeting.trim()) {
                if (editingCharacter.value.openingLine) {
                    editingCharacter.value.openingLine += '\n\n' + customGreeting.trim();
                } else {
                    editingCharacter.value.openingLine = customGreeting.trim();
                }
            }
        };

        // 发送线下模式开场白
        const sendOfflineModeGreeting = () => {
            if (!soulLinkActiveChat.value) return;

            const activeCharacter = characters.value.find(c => String(c.id) === String(soulLinkActiveChat.value));
            if (activeCharacter && activeCharacter.openingLine) {
                // 解析开场白，支持多个开场白
                const greetings = activeCharacter.openingLine.split('\n\n').filter(g => g.trim());
                if (greetings.length > 0) {
                    // 随机选择一个开场白
                    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
                    
                    // 创建开场白消息
                    const newMsg = {
                        id: Date.now(),
                        sender: 'ai',
                        text: randomGreeting,
                        timestamp: Date.now(),
                        isOfflineMode: true
                    };
                    
                    // 添加到聊天记录
                    pushMessageToActiveChat(newMsg);
                }
            }
        };

        const chatBackgroundInlineStyle = computed(() => {
            const style = chatSettings.chatBackgroundStyle?.value || chatSettings.chatBackgroundStyle || 'default';
            if (style === 'gradient') {
                return { background: `linear-gradient(135deg, ${chatSettings.gradientStartColor?.value || chatSettings.gradientStartColor} 0%, ${chatSettings.gradientEndColor?.value || chatSettings.gradientEndColor} 100%)` };
            }
            if (style === 'color') {
                return { background: chatSettings.solidBackgroundColor?.value || chatSettings.solidBackgroundColor || '#f2f2f7' };
            }
            const image = chatSettings.chatBackgroundImage?.value || chatSettings.chatBackgroundImage || '';
            if (style === 'image' && image) {
                return { background: `url(${image}) center/cover no-repeat` };
            }
            return {};
        });
        const updateChatBackground = () => {
            chatSettings.updateChatBackground();
            chatSettings.saveChatMenuSettings();
        };
        const selectBackgroundImage = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = handleBackgroundImageSelect;
            input.click();
        };
        const handleBackgroundImageSelect = (event) => {
            const file = event.target.files[0];
            if (!file || !file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                compressAvatarImage(e.target.result, 'background', (compressedDataUrl) => {
                    chatSettings.chatBackgroundImage.value = compressedDataUrl;
                    chatSettings.chatBackgroundImageInput.value = compressedDataUrl;
                    chatSettings.chatBackgroundStyle.value = 'image';
                    chatSettings.updateChatBackground();
                    chatSettings.saveChatMenuSettings();
                });
            };
            reader.readAsDataURL(file);
        };
        const applyBackgroundImageLink = chatSettings.applyBackgroundImageLink;
        const clearBackgroundImage = chatSettings.clearBackgroundImage;
        const chatSettingsPanelStyle = chatSettings.chatSettingsPanelStyle;

        // --- Transfer Action (Accept/Reject) ---
        const handleTransferAction = (msg, action) => {
            if (action === 'accept') {
                msg.transferStatus = 'accepted';
                addConsoleLog(`转账已接受: ¥${msg.amount}`, 'success');
                pushMessageToActiveChat({
                    id: Date.now(),
                    sender: 'system',
                    text: `已收款 ¥${msg.amount.toFixed(2)}`,
                    timestamp: Date.now(),
                    isSystem: true,
                    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            } else if (action === 'reject') {
                msg.transferStatus = 'rejected';
                addConsoleLog(`转账已拒绝: ¥${msg.amount}`, 'info');
                pushMessageToActiveChat({
                    id: Date.now(),
                    sender: 'system',
                    text: `已退回转账 ¥${msg.amount.toFixed(2)}`,
                    timestamp: Date.now(),
                    isSystem: true,
                    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                });
            }
            syncActiveChatState();
            persistActiveChat();
        };

        // --- Input & Panel Logic ---
        const moodValue = ref('HAPPY');
        const bedTiming = ref('22:00');
        
        // AI状态色调过渡
        const aiStateColors = {
            'HAPPY': 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            'SAD': 'linear-gradient(180deg, #2d1a2e 0%, #2a162e 50%, #230f60 100%)',
            'ANGRY': 'linear-gradient(180deg, #2e1a1a 0%, #2e1616 50%, #600f0f 100%)',
            'CALM': 'linear-gradient(180deg, #1a2e1a 0%, #162e16 50%, #0f600f 100%)'
        };
        
        // 监听情绪变化，更新背景色调
        watch(moodValue, (newMood) => {
            const body = document.body;
            const color = aiStateColors[newMood] || aiStateColors['HAPPY'];
            body.style.background = color;
        });

        const confirmHelpBuy = (msg) => {
            if (msg.sender !== 'ai' || msg.isPurchased) return;
            
            // 更新卡片状态
            msg.isPurchased = true;
            saveSoulLinkMessages();
            
            // 发送确认消息
            const confirmMsg = {
                id: Date.now(),
                sender: 'user',
                messageType: 'text',
                text: `好的，我帮你买了「${msg.item}」！`,
                timestamp: Date.now(),
                time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            };
            
            pushMessageToActiveChat(confirmMsg);
            saveSoulLinkMessages();
        };

        const toggleVoicePlayback = (msg) => {
            // 切换翻译显示
            const willShowTranslation = !msg.showTranslation;
            
            // 先收起其他所有语音消息
            const messages = soulLinkActiveChatType.value === 'group' 
                ? (activeGroupChat.value?.history || [])
                : (soulLinkMessages.value[soulLinkActiveChat.value] || []);
            
            messages.forEach(m => {
                if (m.messageType === 'voice' && m.id !== msg.id) {
                    m.showTranslation = false;
                    m.isPlaying = false;
                    if (m.playbackTimer) {
                        clearTimeout(m.playbackTimer);
                        m.playbackTimer = null;
                    }
                }
            });
            
            msg.showTranslation = willShowTranslation;
            
            // 如果收起翻译，停止播放
            if (!willShowTranslation && msg.isPlaying) {
                msg.isPlaying = false;
                if (msg.playbackTimer) {
                    clearTimeout(msg.playbackTimer);
                    msg.playbackTimer = null;
                }
                return;
            }
            
            // 如果展开翻译且未播放，开始播放
            if (willShowTranslation && !msg.isPlaying) {
                msg.isPlaying = true;
                
                // 模拟播放时长（根据语音时长，默认3秒）
                const duration = Math.max(3, (msg.voiceDuration || 3)) * 1000;
                msg.playbackTimer = setTimeout(() => {
                    msg.isPlaying = false;
                }, duration);
            }
        };

        const closeAllVoiceMessages = () => {
            const messages = soulLinkActiveChatType.value === 'group' 
                ? (activeGroupChat.value?.history || [])
                : (soulLinkMessages.value[soulLinkActiveChat.value] || []);
            
            messages.forEach(m => {
                if (m.messageType === 'voice') {
                    m.showTranslation = false;
                    m.isPlaying = false;
                    if (m.playbackTimer) {
                        clearTimeout(m.playbackTimer);
                        m.playbackTimer = null;
                    }
                }
            });
        };

        const onChatBackgroundClick = () => {
            closeAllVoiceMessages();
        };

        const onSendOrCall = () => {
            if (soulLinkInput.value && soulLinkInput.value.trim()) {
                sendSoulLinkMessage();
            } else {
                chatSettings.lastUserActiveAt.value = Date.now();
                triggerSoulLinkAiReply();
            }
        };

        const onInputChange = () => {
            if (soulLinkInput.value && soulLinkInput.value.trim()) {
                showEmojiPanel.value = false;
                showAttachmentPanel.value = false;
            }
        };

        const onEnterPress = () => {
            onSendOrCall();
        };

        const previewImage = (url, description = null) => {
            if (!url) return;
            if (url.startsWith('mock:')) {
                const color = url.substring(5);
                const popup = window.open('', '_blank', 'width=400,height=350');
                if (popup) {
                    popup.document.write(`
                        <html>
                        <head>
                            <title>图片预览</title>
                            <style>
                                body { margin: 0; padding: 20px; background: #f2f2f7; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
                                .mock-image { width: 300px; height: 200px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center; color: rgba(0, 0, 0, 0.6); font-size: 16px; font-weight: 600; position: relative; overflow: hidden; }
                                .mock-image-desc { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 12px; background: linear-gradient(transparent, rgba(0, 0, 0, 0.7)); color: white; font-size: 12px; line-height: 1.3; text-align: center; white-space: normal; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
                                .desc-container { margin-top: 20px; text-align: center; max-width: 300px; }
                                .desc-label { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 8px; }
                                .desc-content { font-size: 14px; color: #666; line-height: 1.4; }
                            </style>
                        </head>
                        <body>
                            <div class="mock-image" style="background-color: ${color};">
                                ${description ? `<div class="mock-image-desc">${description}</div>` : '虚拟图片'}
                            </div>
                            ${description ? `
                                <div class="desc-container">
                                    <div class="desc-label">图片描述</div>
                                    <div class="desc-content">${description}</div>
                                </div>
                            ` : ''}
                        </body>
                        </html>
                    `);
                    popup.document.close();
                }
            } else {
                window.open(url, '_blank');
            }
        };

        const insertEmoji = (emoji) => {
            soulLinkInput.value += emoji;
            showEmojiPanel.value = false;
        };

        const parseStickerImport = (text) => {
            const stickers = [];
            const lines = text.split('\n');
            lines.forEach(line => {
                // 支持两种格式：
                // 1) 名称: https://xxx（或全角冒号）
                // 2) 名称 https://xxx（用空格分隔）
                const match = line.match(/^(.+?)(?:[:：]|\s+)\s*[`']?(https?:\/\/[^\s`']+)[`']?/);
                if (match) {
                    stickers.push({
                        name: match[1].trim(),
                        url: match[2].trim()
                    });
                }
            });
            return stickers;
        };

        // 自动加载你给的“基础表情包.txt”
        // 目的：避免把 500+ 行内置进 script.js，同时也让“删除空包 + 重新导入”一次完成。
        const ensureBaseStickerPackLoaded = async () => {
            const basePackName = '基础表情包';
            // 用当前页面 URL 做相对定位，避免 script.js 放子目录导致路径不对
            const basePackFileUrl = new URL('基础表情包.txt', window.location.href).toString();

            const existingIdx = (stickerPacks.value || []).findIndex(p => p?.name === basePackName);
            const existing = existingIdx >= 0 ? stickerPacks.value[existingIdx] : null;
            const hasNonEmpty = !!existing?.stickers?.length;
            if (hasNonEmpty) return;

            try {
                const res = await fetch(basePackFileUrl);
                if (!res.ok) return;
                const rawText = await res.text();
                const stickers = parseStickerImport(rawText);
                if (!stickers || stickers.length === 0) return;

                if (existingIdx >= 0) {
                    stickerPacks.value[existingIdx] = {
                        ...existing,
                        stickers
                    };
                } else {
                    stickerPacks.value.push({
                        id: `builtin-${basePackName}`,
                        name: basePackName,
                        stickers
                    });
                }

                try {
                    localStorage.setItem('stickerPacks', JSON.stringify(stickerPacks.value));
                } catch (e) {
                    // ignore
                }
            } catch (e) {
                // 如果你是 file:// 打开，fetch 可能失败；这时控制台会有提示
                console.warn('Failed to load 基础表情包.txt:', e);
            }
        };

        ensureBaseStickerPackLoaded();

        // 内置表情包大表已从 script 移除时可置空；需要时可再把各系列 txt 内容挂回此对象。
        const builtinStickerPackTexts = {};

        // 将内置表情包合并进 stickerPacks（保留用户本地导入，不重复添加同名系列）
        const mergeBuiltinStickerPacks = () => {
            if (!builtinStickerPackTexts || typeof builtinStickerPackTexts !== 'object') return;
            let changed = false;
            // 跳过你指定要删除的“空包”，避免后续合并又把它们加回来
            const skipBuiltinPackNames = new Set(['狗皇帝', '呆猫八条', '绿萝卜', '这狗']);
            const packIndexByName = new Map(
                (stickerPacks.value || [])
                    .map((p, idx) => [p?.name, idx])
                    .filter(([name]) => !!name)
            );

            for (const [packName, rawText] of Object.entries(builtinStickerPackTexts)) {
                if (skipBuiltinPackNames.has(packName)) continue;
                const stickers = parseStickerImport(rawText);
                if (!stickers || stickers.length === 0) continue;

                if (packIndexByName.has(packName)) {
                    // 如果之前用户导入过但解析结果为空，则补齐 stickers
                    const idx = packIndexByName.get(packName);
                    const existing = stickerPacks.value[idx];
                    const isEmpty = !existing?.stickers || existing.stickers.length === 0;
                    if (isEmpty) {
                        stickerPacks.value[idx] = {
                            ...existing,
                            stickers
                        };
                        changed = true;
                    }
                    continue;
                }

                stickerPacks.value.push({
                    id: `builtin-${packName}`,
                    name: packName,
                    stickers
                });
                packIndexByName.set(packName, stickerPacks.value.length - 1);
                changed = true;
            }
            if (changed) {
                try {
                    localStorage.setItem('stickerPacks', JSON.stringify(stickerPacks.value));
                } catch (e) {
                    // ignore: localStorage 可能在某些环境下不可用
                }
            }
        };

        mergeBuiltinStickerPacks();

        const importStickerPack = () => {
            if (!stickerImportText.value.trim() || !newPackName.value.trim()) return;
            
            const stickers = parseStickerImport(stickerImportText.value);
            if (stickers.length === 0) {
                alert('未识别到有效的表情图格式');
                return;
            }
            
            stickerPacks.value.push({
                id: Date.now(),
                name: newPackName.value.trim(),
                stickers: stickers
            });
            
            localStorage.setItem('stickerPacks', JSON.stringify(stickerPacks.value));
            stickerImportText.value = '';
            newPackName.value = '';
            showStickerImportPanel.value = false;
        };

        const sendSticker = (sticker) => {
            const msg = {
                id: Date.now(),
                sender: 'user',
                messageType: 'sticker',
                stickerUrl: sticker.url,
                stickerName: sticker.name,
                text: `[${sticker.name}]`,
                timestamp: Date.now(),
                isReplied: false,
                time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            };

            pushMessageToActiveChat(msg);
            saveSoulLinkMessages();
            showEmojiPanel.value = false;
            scrollToBottom();
        };

        const deleteStickerPack = (packId) => {
            stickerPacks.value = stickerPacks.value.filter(p => p.id !== packId);
            localStorage.setItem('stickerPacks', JSON.stringify(stickerPacks.value));
            if (activeStickerTab.value === packId) {
                activeStickerTab.value = stickerPacks.value.length > 0 ? stickerPacks.value[0].id : 'favorite';
            }
        };

        const isFavorite = (sticker) => {
            return favoriteStickers.value.some(s => s.url === sticker.url);
        };

        const toggleFavorite = (sticker) => {
            const index = favoriteStickers.value.findIndex(s => s.url === sticker.url);
            if (index > -1) {
                favoriteStickers.value.splice(index, 1);
            } else {
                favoriteStickers.value.push(sticker);
            }
            localStorage.setItem('favoriteStickers', JSON.stringify(favoriteStickers.value));
        };

        const counterWithSticker = (msg) => {
            let allStickers = [];
            stickerPacks.value.forEach(pack => {
                pack.stickers.forEach(s => {
                    allStickers.push(s);
                });
            });
            
            if (allStickers.length === 0) {
                return;
            }
            
            const randomIndex = Math.floor(Math.random() * allStickers.length);
            const randomSticker = allStickers[randomIndex];
            
            pushMessageToActiveChat({
                id: Date.now(),
                sender: 'user',
                messageType: 'sticker',
                stickerUrl: randomSticker.url,
                stickerName: randomSticker.name,
                text: `[${randomSticker.name}]`,
                timestamp: Date.now()
            });
            
            showEmojiPanel.value = false;
            showAttachmentPanel.value = false;
        };

        const removeFavorite = (sticker) => {
            const index = favoriteStickers.value.findIndex(s => s.url === sticker.url);
            if (index > -1) {
                favoriteStickers.value.splice(index, 1);
                localStorage.setItem('favoriteStickers', JSON.stringify(favoriteStickers.value));
            }
        };

        const onStickerTouchStart = (event, sticker) => {
            stickerTouchTimer = setTimeout(() => {
                toggleFavorite(sticker);
            }, 500);
        };

        const onStickerTouchEnd = () => {
            if (stickerTouchTimer) {
                clearTimeout(stickerTouchTimer);
                stickerTouchTimer = null;
            }
        };

        const triggerGroupAvatarUpload = () => {
            groupAvatarInput.value?.click?.();
        };

        const handleGroupAvatarUpload = (e) => {
            const file = e.target?.files?.[0];
            if (!file) return;
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                alert('图片大小不能超过5MB，请选择小一点的图片');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressAvatarImage(ev.target.result, 'avatar', (url) => {
                    newGroupAvatar.value = url;
                });
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        };

        const triggerCustomMemberAvatarUpload = () => {
            customMemberAvatarInput.value?.click?.();
        };

        const handleCustomMemberAvatarUpload = (e) => {
            const file = e.target?.files?.[0];
            if (!file) return;
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                alert('图片大小不能超过5MB，请选择小一点的图片');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressAvatarImage(ev.target.result, 'avatar', (url) => {
                    customMemberAvatar.value = url;
                });
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        };

        const triggerRenameGroupAvatarUpload = () => {
            renameGroupAvatarInput.value?.click?.();
        };

        const handleRenameGroupAvatarUpload = (e) => {
            const file = e.target?.files?.[0];
            if (!file) return;
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                alert('图片大小不能超过5MB，请选择小一点的图片');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                compressAvatarImage(ev.target.result, 'avatar', (url) => {
                    tempGroupAvatar.value = url;
                });
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        };

        watch(openedApp, (newVal) => {
            if (newVal === 'feed') {
                feed.loadPosts();
            }
            if (newVal === 'ember') {
                if (typeof ember.onEnter === 'function') ember.onEnter();
            } else {
                if (typeof ember.onLeave === 'function') ember.onLeave();
            }
            if (newVal === 'chat') {
                markActiveChatAiMessagesRead();
                if (chatSettings.timeSenseEnabled.value && !messageTimeIntervalId) {
                    messageTimeIntervalId = setInterval(() => {
                        chatSettings.messageTimeNow.value = Date.now();
                    }, 30000);
                }
            } else {
                if (messageTimeIntervalId) {
                    clearInterval(messageTimeIntervalId);
                    messageTimeIntervalId = null;
                }
            }
        });

        onUnmounted(() => {
            if (typeof chat?.cleanup === 'function') chat.cleanup();
            if (typeof live.cleanup === 'function') live.cleanup();
            if (typeof feed.cleanup === 'function') feed.cleanup();
            if (typeof ember.cleanup === 'function') ember.cleanup();
            if (messageTimeIntervalId) {
                clearInterval(messageTimeIntervalId);
                messageTimeIntervalId = null;
            }
        });

        const musicState = useMusic({ characters, currentCharacter: selectedCharacter, activeProfile, chatHistorySource: soulLinkMessages });
        const music = musicState.music;
        const currentTrack = musicState.currentTrack;
        const progressPercent = musicState.progressPercent;
        const currentTimeText = musicState.currentTimeText;
        const durationText = musicState.durationText;
        const activeLyricIndex = musicState.activeLyricIndex;
        const lyricsScrollBox = musicState.lyricsScrollBox;
        const isCurrentFavorite = musicState.isCurrentFavorite;
        const toggleMusicPlayPause = () => { musicState.toggleMusicPlayPause(); };
        const musicPlayPrevious = () => musicState.playPrevious();
        const musicPlayNext = () => musicState.playNext();

        console.log('setup end');

        const returnObject = {
            // SoulLink / Chat
            soulLinkTab, soulLinkActiveChat, soulLinkActiveChatType, soulLinkInput, soulLinkReplyTarget,
            soulLinkMessages, soulLinkGroups, activeGroupChat, activeChatMessages, currentChatMessages, recentChats,
            formatLastMsgTime, getLastMessage, formatMessageDate, closeAllPanels,
            getUnrepliedCountForChar, getUnrepliedCountForGroup, totalUnrepliedCount, formatUnreadCount,
            emojiList, previewImage, formatTime, onInputChange, onEnterPress,
            contextMenu, editingMessageId,
            startSoulLinkChat, openSoulLinkGroupChat, exitSoulLinkChat, sendSoulLinkMessage,
            switchSoulLinkTab, onMessageContextMenu, onMessageTouchStart, onMessageTouchMove, onMessageTouchEnd, handleContextAction, closeContextMenu,
            getCharacterName, getCharacterAvatar, getActiveChatName, getActiveChatAvatar, getActiveChatStatus,
            getLocationLabel,
            soulLinkPet,
            saveSoulLinkMessages,
            showEmojiPanel,
            pixelEmojis,
            insertEmoji,
            stickerPacks, showStickerImportPanel, stickerImportText, newPackName, parseStickerImport, importStickerPack, sendSticker, deleteStickerPack,
            favoriteStickers, activeStickerTab, isFavorite, toggleFavorite, removeFavorite, onStickerTouchStart, onStickerTouchEnd, counterWithSticker,
            isAiTyping,
            focusedOsMessageId,
            isOfflineMode,
            novelMode,
            showGreetingSelect,
            availableGreetings,
            // Chat别名（兼容新UI）
            chatActiveChat: soulLinkActiveChat,
            chatInput: soulLinkInput,
            chatCharacters: characters,
            isChatAiTyping: isAiTyping,
            startChat: startSoulLinkChat,
            sendChatMessage: onSendOrCall,
            goBackInChat: exitSoulLinkChat,

            // Core
            currentTime, currentDate, currentDay, currentMonth, currentMonthEn, currentDayOfMonth, randomHexCode, openedApp, currentScreen, deviceBatteryText, deviceSignalText,
            isHomeScreenVisible,
            // Ember (Threads-like)
            ember,
            liveWaveBars, liveOnlineCount, liveRooms, activeLiveRoomId, activeLiveRoom, activeLiveHost, activeLiveMessages, liveElapsedText, liveMicMuted, liveInput,
            liveOnMic, liveUserDisguiseNick, liveHallWallpaperUrl,
            liveSettingsOpen,
            liveSettingsDraftBgmUrl, liveSettingsDraftUserMask, liveSettingsDraftHallWallpaperUrl,
            liveBgmSearchTerm, liveBgmSearchResults, liveBgmSearchLoading, liveBgmCurrentSong,
            liveBgmLyricsLoading, liveBgmCurrentLyricText,
            liveBgmLyricPrevText, liveBgmLyricNextText,
            activeLiveHostSpeech, activeLiveHostSpeechHistory, liveHostHistoryOpen, liveHostSpeechLoading, liveBgmPlaying, liveBgmAudioRef, LIVE_BGM_URL,
            switchLiveRoom, toggleLiveMic, toggleLiveOnMic, rollDisguiseNick, sendLiveGift, sendLiveMessage, toggleLiveBgm, onLiveBgmPlay, onLiveBgmPause,
            toggleLiveHostHistory, closeLiveHostHistory, formatLiveHostHistoryTime,
            openLiveSettings, closeLiveSettings, saveLiveSettings,
            onLiveHallWallpaperUpload,
            searchLiveBgmSongs, playLiveBgmFromSong, playLiveBgmByQuery, onLiveBgmEnded,
            // Music Player
            isPlaying, togglePlayPause, playPrevious, playNext,
            music,
            currentTrack,
            progressPercent,
            currentTimeText,
            durationText,
            activeLyricIndex,
            lyricsScrollBox,
            isCurrentFavorite,
            toggleMusicPlayPause,
            musicPlayPrevious,
            musicPlayNext,
            musicAudioRef: musicState.audioRef,
            musicFilteredSongs: musicState.filteredSongs,
            musicPlayFromSearch: musicState.playFromSearch,
            musicPlayFromQueue: musicState.playFromQueue,
            musicPlaySavedSong: musicState.playSavedSong,
            musicAddToQueue: musicState.addToQueue,
            musicToggleFavorite: musicState.toggleFavorite,
            musicSearchOnlineSongs: musicState.searchOnlineSongs,
            musicClearSearch: musicState.clearSearch,
            musicGenerateCharPlaylistByAI: musicState.generateCharPlaylistByAI,
            musicPlayCharPlaylistWith: musicState.playCharPlaylistWith,
            fetchPublicCommentsForCurrentTrack: musicState.fetchPublicCommentsForCurrentTrack,
            musicSeekFromEvent: musicState.seekFromEvent,
            musicSetVolume: musicState.setVolume,
            musicCycleRepeatMode: musicState.cycleRepeatMode,
            onMusicAudioTimeUpdate: musicState.onAudioTimeUpdate,
            onMusicAudioLoadedMetadata: musicState.onAudioLoadedMetadata,
            onMusicAudioPlay: musicState.onAudioPlay,
            onMusicAudioPause: musicState.onAudioPause,
            onMusicAudioWaiting: musicState.onAudioWaiting,
            onMusicAudioCanPlay: musicState.onAudioCanPlay,
            onMusicAudioError: musicState.onAudioError,
            onMusicAudioEnded: musicState.onAudioEnded,
            // New Features (Chat Menu, Call, Virtual Camera, Panels)
            chatSettings,
            chatSummaryBoardList,
            userAvatar, uploadUserAvatar, resetUserAvatar,
            setBubbleStyle, applyBubbleStyle, applyCustomCSS,
            saveAndCloseSettings, confirmChatMenu, showArchiveDialog, showArchivedChats, archiveName, archiveDescription, archivedChats, filteredArchivedChats, sortedArchivedChats, archiveCurrentChat, restoreArchivedChat, deleteArchivedChat,
            saveChatMenuSettings, loadChatMenuSettings, clearChatHistory, exportChatHistory, showCreateGroupDialog, newGroupName, newGroupMembers, createNewGroup, newGroupAvatar, selectedGroupMembers, groupAvatarInput, triggerGroupAvatarUpload, handleGroupAvatarUpload, toggleGroupMember, showAddMemberDialog, selectedAddMembers, getAvailableCharactersForAdd, toggleAddMember, addMembersToGroup, removeGroupMember, addMemberMode, customMemberAvatar, customMemberName, customMemberPersona, customMemberWorldbookIds, customMemberPresetId, customMemberTimeZone, customMemberAvatarInput, triggerCustomMemberAvatarUpload, handleCustomMemberAvatarUpload, addCustomMember, showMemberEditor, editingMember, openMemberEditor, closeMemberEditor, saveMemberEditor, showRenameGroupDialog, newGroupNameInput, tempGroupAvatar, renameGroupAvatarInput, triggerRenameGroupAvatarUpload, handleRenameGroupAvatarUpload, renameGroup, shakeCharacter, shakeGroupMember,
            callActive, callType, callTimer, callInput, callMessages, isCallAiTyping, isMuted, toggleMute, isSpeakerOn, toggleSpeaker, isCameraOn, toggleCamera, currentChatName, currentChatAvatar,
            showCallInput, callInputText, toggleCallInput, sendCallText, openCallDiary, closeCallDiaryModal, showCallDiaryModal, selectedCallDiary, callDiaryTitle,
            videoSelfPosition, isVideoAvatarSwapped, startDragVideoSelf, swapVideoAvatars,
            startVoiceCall, startVideoCall, endCall, sendCallMessage,
            showVirtualCamera, virtualImageDesc, openVirtualCamera, sendVirtualImage,
            openLocationPanel, closeLocationPanel, sendLocation,
            openTransferPanel, closeTransferPanel, sendTransfer, transferAmount, transferNote,
            // Chat Settings
            showChatSettings, toggleChatSettings,
            toggleUserBlockRole, toggleUserBlockRoleForCharacter, isCharacterBlockedByUser, userBlockedRoleUi,
            manualSummarizeChat,
            clearChatSummaryBoard,
            shouldShowTimeDivider,
            updateChatBackground, chatBackgroundInlineStyle, selectBackgroundImage, handleBackgroundImageSelect, applyBackgroundImageLink, clearBackgroundImage, chatSettingsPanelStyle,
            // Profile & Navigation
            profileChar, viewCharacterProfile, goBackInSoulLink, showProfile, showChatMenu,
            // New Input Logic
            moodValue, bedTiming, showLocationPanel, showTransferPanel,
            showAttachmentPanel, showImageSubmenu, toggleEmojiPanel, toggleAttachmentPanel, toggleOfflineMode, selectGreeting, addDefaultGreeting, addCustomGreeting,
            startVoiceInput, onSendOrCall, selectFromAlbum, sendTextImage,
            handleRetry, handleTakeaway, handleVote, handleShare, handleTarot, handlePet, handleOrder,
            showVotePanel, voteQuestion, voteOptions, addVoteOption, removeVoteOption, createVote, castVoteInChat,
            showTaobaoPanel, taobaoSearchTerm, taobaoProducts, taobaoLoading, openTaobaoPanel, searchTaobaoProducts, buyTaobaoProduct, helpBuyTaobaoProduct, confirmHelpBuy,
            showSharePanel, shareSource, shareContent, shareSources, sendShareCard,
            showPhotoSelectPanel, showTextImagePanel, textImageText, textImageBgColor, textImageColors,
            showVoiceInputPanel, voiceInputText, sendVoiceMessage, closeVoiceInputPanel, toggleVoicePlayback, onChatBackgroundClick,
            showImageCropModal, imageCropSource, imageCropRect, imageCropScale, imageCropCanvasAspect,
            closeImageCropModal, confirmImageCrop, onImageCropDragStart, onImageCropScaleChange,
            // App Launch
            openApp, closeApp, goBack, openGame, joinGame, startGameSession, castVote, endDay, closeGame, getAppIcon,
            // Music App
            music,
            currentTrack,
            currentTimeText,
            durationText,
            activeLyricIndex,
            lyricsScrollBox,
            isCurrentFavorite,
            toggleMusicPlayPause,
            musicPlayPrevious,
            musicPlayNext,
            musicAudioRef: musicState.audioRef,
            musicFilteredSongs: musicState.filteredSongs,
            musicPlayFromSearch: musicState.playFromSearch,
            musicPlayFromQueue: musicState.playFromQueue,
            musicPlaySavedSong: musicState.playSavedSong,
            musicAddToQueue: musicState.addToQueue,
            musicToggleFavorite: musicState.toggleFavorite,
            musicSearchOnlineSongs: musicState.searchOnlineSongs,
            musicClearSearch: musicState.clearSearch,
            musicGenerateCharPlaylistByAI: musicState.generateCharPlaylistByAI,
            musicPlayCharPlaylistWith: musicState.playCharPlaylistWith,
            musicSeekFromEvent: musicState.seekFromEvent,
            musicSetVolume: musicState.setVolume,
            musicCycleRepeatMode: musicState.cycleRepeatMode,
            onMusicAudioTimeUpdate: musicState.onAudioTimeUpdate,
            onMusicAudioLoadedMetadata: musicState.onAudioLoadedMetadata,
            onMusicAudioPlay: musicState.onAudioPlay,
            onMusicAudioPause: musicState.onAudioPause,
            onMusicAudioWaiting: musicState.onAudioWaiting,
            onMusicAudioCanPlay: musicState.onAudioCanPlay,
            onMusicAudioError: musicState.onAudioError,
            onMusicAudioEnded: musicState.onAudioEnded,
            contextMenu,
            // Console
            profiles, activeProfileId, activeProfile, apiStatus,
            availableModels, fetchingModels, consoleLogs,
            saveProfiles, createNewProfile, deleteActiveProfile, setActiveProfile, deleteProfile,
            onProfileSelect, fetchModels, clearConsole,
            backupExporting, backupImporting, backupLastSavedHint, soulosBackupFileInput,
            downloadSoulOsBackup, downloadSegmentedBackup, saveSoulOsBackupSlotOnly, restoreSoulOsFromSlot, triggerSoulOsBackupImport, handleSoulOsBackupImport,
            showSegmentedImportPanel, segmentedImportPackage, segmentedImportAppSelections, segmentedImportRoleSelections, closeSegmentedImportPanel, confirmSegmentedImport,
            // Workshop App
            activeWorkshopTab,
            switchWorkshopTab,
            characters,
            addNewCharacter,
            editingCharacter,
            fileInput,
            characterImportInput,
            presetImportInput,
            showBatchDeleteDialog, batchDeleteType, batchDeleteSelections, batchDeleteTitle, batchDeleteItems, isAllBatchSelected, selectedBatchCount,
            openBatchDelete, closeBatchDelete, selectAllBatchItems, clearBatchSelection, invertBatchSelection, confirmBatchDelete,
            handleAvatarFile,
            newTagInput,
            addTag,
            removeTag,
            addKv,
            removeKv,
            triggerAvatarUpload,
            triggerCharacterImport,
            handleCharacterImport,
            triggerPresetImport,
            handlePresetImport,
            deleteCharacter,
            openDossier,
            saveDossier,
            cancelDossier,
            addOpeningLine,
            removeOpeningLine,
            // Worldbook & Presets
            worldbooks, editingWorldbook, activeWorldbookEntryId, activeWorldbookEntry, showWorldbookImport, importWorldbookName, importFile, importMode, openWorldbookImport, handleFileUpload, importWorldbook,
            addNewWorldbook, deleteWorldbook, deleteCurrentWorldbook, openWorldbookEditor, saveWorldbookEditor, cancelWorldbookEditor,
            addWorldbookEntry, deleteWorldbookEntry,
            swipedWorldbookId, toggleSwipeWorldbook,
            presets, editingPreset,
            addNewPreset, deletePreset, deleteCurrentPreset, openPresetEditor, savePresetEditor, cancelPresetEditor,
            swipedPresetId, toggleSwipePreset,
            expandedEntryIds, toggleEntryExpand, isEntryExpanded,
            // Location & Transfer
            userAddress, aiAddress, calculatedDistance,
            addTrajectoryPoint, removeTrajectoryPoint,
            handleTransferAction,
            // 主题：

            // feed
            feed,
            // mate
            mate,
            // peek
            peek,
            // nest
            nest,
            // read
            read,
            // notice
            notice,
            // games
            games,
            playerName,
            currentPlayerName,
            gameAiCharacterId,
            getGameAiName,
            isGameAiTyping,
            // 新游戏相关状态
            showRules,
            chatExpanded,
            wheelRotation,
            playerMessage,
            playerWord,
            aiPlayers,
            chatMessages,
            undercoverMessages,
            todHistory,
            ludoQuestionCard,
            ludoAnswerInput,
            ludoQuestionLoading,
            // 新游戏相关函数
            toggleSound,
            playRPS,
            spinTOD,
            nextTOD,
            startUNOGame,
            startNewUNO,
            drawCard,
            playCard,
            playUnoCard,
            drawUnoCard,
            drawUnoCardForPlayer,
            sayUNO,
            getUnoColor: games.getUnoColor,
            startLudoGame,
            rollDice,
            moveLudoPlane,
            getLudoEffectLabel,
            getLudoSnakeOrder,
            submitLudoAnswer,
            toggleAutoPlay,
            sendMessage,
            showRenameGroupDialog,
            renameGroup,
            contextMenu,
            onMessageContextMenu,
            closeContextMenu,
            // touch events
            pullDistance, handleTouchStart, handleTouchMove, handleTouchEnd,
            // home page
            currentPage, homePages, updateHomePagePosition, prevPage, nextPage,
            // photo widget
            photoWidgetDate, photoWidgetText, photoWidgetPhotos, changePhotoWidgetImage, editPhotoWidgetText,
            // sticker widget
            stickerWidgetUrl, changeStickerWidgetImage,
            // character related
            showCharacterSelector, selectedCharacterId, selectedCharacter, selectCharacter,
            // call widget
            callWidgetSubtitle, showCallWidgetEdit, callWidgetEditInput, editCallWidgetSubtitle, saveCallWidgetSubtitle, closeCallWidgetEdit,
            currentDate, currentTime, weekdays, currentWeekday, updateDateTime,
            // capsule texts
            capsuleTexts, showCapsuleEditDialog, currentCapsuleType, capsuleEditText, editCapsuleText, closeCapsuleEditDialog, saveCapsuleText,
            dashboardTexts, showDashboardEditDialog, currentDashboardTextType, dashboardEditText, editDashboardText, closeDashboardEditDialog, saveDashboardText,

            // photo widget edit dialog
            showPhotoWidgetEditDialog, photoWidgetEditText1, photoWidgetEditText2, closePhotoWidgetEditDialog, savePhotoWidgetText,
            // lock screen（composables/useLockScreen.js）
            lockTouchStart: lock.lockTouchStart,
            lockTouchMove: lock.lockTouchMove,
            lockTouchEnd: lock.lockTouchEnd,
            lockMouseDown: lock.lockMouseDown,
            lockMouseMove: lock.lockMouseMove,
            lockMouseUp: lock.lockMouseUp,
            isLockScreenVisible: lock.isLockScreenVisible,
            enableLockScreen: lock.enableLockScreen,
            toggleLockScreen: lock.toggleLockScreen,
            lockScreen: lock.lockScreen,
            unlockScreen: lock.unlockScreen,
            tapUnlock: lock.tapUnlock,
            password: lock.password,
            addPassword: lock.addPassword,
            removePassword: lock.removePassword,
            correctPassword: lock.correctPassword,
            passwordSetting: lock.passwordSetting,
            isPasswordValid: lock.isPasswordValid,
            validatePassword: lock.validatePassword,
            savePassword: lock.savePassword,
            chineseDate,
            fullDate,
            lockSignature: lock.lockSignature,
            signatureSetting: lock.signatureSetting,
            saveSignature: lock.saveSignature,
            lockWallpaper: lock.lockWallpaper,
            lockWallpaperInput: lock.lockWallpaperInput,
            saveLockWallpaper: lock.saveLockWallpaper,
            lockDateTimeColor: lock.lockDateTimeColor,
            saveLockDateTimeColor: lock.saveLockDateTimeColor,
            // home (non-lockscreen) style functions
            homeWallpaper, homeWallpaperInput, saveHomeWallpaper, homeTextColor, homeTextColorInput, saveHomeTextColor,
            enableHomeGlass, toggleHomeGlass,
            enableHideStatusBar, toggleHideStatusBar,
            enableNotchAdaptation, toggleNotchAdaptation,
            // font functions
            fonts,
            selectedFont,
            globalSelectedFont,
            saveFont,
            lockFont,
            selectFont,
            selectGlobalFont,
            loadFontCSS,
            loadGlobalFontCSS,
            importCustomFont,
            globalFontFileInput,
            customFontCount,
            initFonts,
            showFontImportDialog,
            newFontName,
            newFontUrl,
            addFontByUrl,
        };

        // 音乐播放器控制
        const playBtn = document.getElementById('playBtn');
        const disk = document.getElementById('disk'); // 新版音乐组件不一定存在唱片圆盘
        const pauseIcon = document.getElementById('pauseIcon');
        
        let musicIsPlaying = true;
        
        // 播放图标的 SVG Path 数据
        const playPath = "M8 5v14l11-7z";
        // 暂停图标的 SVG Path 数据
        const pausePath = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";
        
        if (playBtn && pauseIcon) {
            playBtn.addEventListener('click', () => {
                if (musicIsPlaying) {
                    if (disk) disk.classList.add('paused');
                    const path = pauseIcon.querySelector('path');
                    if (path) {
                        path.setAttribute('d', playPath);
                    }
                } else {
                    if (disk) disk.classList.remove('paused');
                    const path = pauseIcon.querySelector('path');
                    if (path) {
                        path.setAttribute('d', pausePath);
                    }
                }
                musicIsPlaying = !musicIsPlaying;
            });
        }

        // 灵动岛小组件更新函数
        function updateDashboard() {
            const now = new Date();
            
            // 1. 更新时钟
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const clockElement = document.querySelector('.clock');
            if (clockElement) {
                clockElement.textContent = `${hours}:${minutes}:${seconds}`;
            }
            
            // 2. 更新 AM/PM
            const meridiemElement = document.querySelector('.meridiem');
            if (meridiemElement) {
                meridiemElement.textContent = now.getHours() >= 12 ? 'PM' : 'AM';
            }
            
            // 3. 更新进度圆环 (基于当天的分钟进度)
            const totalMinutesInDay = 24 * 60;
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const progressDegree = (currentMinutes / totalMinutesInDay) * 360;
            
            const circle = document.querySelector('.progress-circle');
            if (circle) {
                circle.style.background = `conic-gradient(white 0deg ${progressDegree}deg, #333 ${progressDegree}deg 360deg)`;
            }
        }

        // 每秒更新一次
        setInterval(updateDashboard, 1000);
        updateDashboard();

        console.log('final return object:', returnObject);

        return returnObject;

    } catch (error) {
        console.error('setup 同步错误:', error);
        const noop = () => {};
        return {
            isLockScreenVisible: ref(true),
            currentTime: ref(''),
            currentDate: ref(''),
            fullDate: ref(''),
            weekdays: ref(['日', '一', '二', '三', '四', '五', '六']),
            currentWeekday: ref(0),
            isHomeScreenVisible: ref(false),
            openedApp: ref(null),
            showGreetingSelect: ref(false),
            showTransferPanel: ref(false),
            showChatSettings: ref(false),
            chatBackgroundStyle: ref('default'),
            gradientStartColor: ref('#f2f2f7'),
            gradientEndColor: ref('#ffffff'),
            solidBackgroundColor: ref('#f2f2f7'),
            chatBackgroundImage: ref(''),
            chatBackgroundImageInput: ref(''),
            applyBackgroundImageLink: noop,
            clearBackgroundImage: noop,
            selectBackgroundImage: noop,
            chatSettingsPanelStyle: ref({}),
            enableManualImageCrop: ref(true),
            showImageCropModal: ref(false),
            imageCropSource: ref(''),
            imageCropRect: ref({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }),
            imageCropScale: ref(0.82),
            imageCropCanvasAspect: computed(() => 1),
            closeImageCropModal: noop,
            confirmImageCrop: noop,
            onImageCropDragStart: noop,
            onImageCropScaleChange: noop
        };
    }
}

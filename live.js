// =========================================================================
// == LIVE APP
// =========================================================================
import { ref, computed, onMounted, onUnmounted, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { callAI } from './api.js';

export function useLive(characters, activeProfile, profiles, availableModels, worldbooks) {
    // --- 状态管理 ---
    const liveWaveBars = ref([10, 16, 12, 18, 11, 15]);
    const liveOnlineCount = ref(1178);
    const activeLiveRoomId = ref('');
    const liveMicMuted = ref(false);
    const liveElapsedSeconds = ref(102);
    const liveInput = ref('');
    const liveMessages = ref({});
    const liveHostSpeechByRoom = ref({});
    /** 各房间主播台词历史（时间正序存储，展示时倒序） */
    const liveHostSpeechHistoryByRoom = ref({});
    const liveHostHistoryOpen = ref(false);
    const liveDanmakuByRoom = ref({});
    const liveHostSpeechLoading = ref(false);
    const liveBgmPlaying = ref(false);
    const liveBgmAudioRef = ref(null);

    const LIVE_BGM_URL_DEFAULT = 'https://files.catbox.moe/4bugg1.mp3';
    const LIVE_MUSIC_API_BASE = 'https://nodegpybdyuh-fbus--3000--4c73681d.local-corp.webcontainer.io';
    const LIVE_HALL_WALLPAPER_URL_DEFAULT = 'https://img.heliar.top/file/1774163610764_1774163583725.png';
    const LIVE_SETTING_KEYS = {
        bgmUrl: 'soulos_live_bgm_url',
        userMask: 'soulos_live_user_mask',
        hallWallpaperUrl: 'soulos_live_hall_wallpaper_url',
    };

    const safeLocalStorageGet = (key) => {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    };

    const safeLocalStorageSet = (key, value) => {
        try {
            localStorage.setItem(key, value);
        } catch {
            // ignore
        }
    };

    /** 厅内 BGM（可在设置里替换为链接） */
    const LIVE_BGM_URL = ref(safeLocalStorageGet(LIVE_SETTING_KEYS.bgmUrl) || LIVE_BGM_URL_DEFAULT);

    /** 语音厅壁纸（可在设置里替换为链接；不填则用 CSS 默认） */
    const liveHallWallpaperUrl = ref(safeLocalStorageGet(LIVE_SETTING_KEYS.hallWallpaperUrl) || '');
    let livePlaybackTimerIds = [];
    let liveNextBatchTimerId = null;
    let liveNpcBusy = false;
    /** 批量班车：两次 API 调用至少间隔（每分钟最多 5 次） */
    const LIVE_BATCH_MIN_INTERVAL_MS = 12000;
    /** 我发消息后，若下一班还远，提前约此时长触发批量（与上条配合） */
    const LIVE_BATCH_EARLY_AFTER_ME_MS = 10000;
    let lastLiveBatchApiAt = 0;
    let nextLiveBatchRunAtMs = 0;
    let liveImmediateHostBusy = false;
    let liveImmediateHostQueued = null;
    /** 是否上麦（掉马）：true = 角色知道是我；false = 马甲模式，角色以为是普通网友 */
    const liveOnMic = ref(false);
    /** 马甲昵称（未上麦时发言显示用） */
    const liveUserDisguiseNick = ref('');
    const savedUserMask = safeLocalStorageGet(LIVE_SETTING_KEYS.userMask);
    if (savedUserMask != null) liveUserDisguiseNick.value = savedUserMask;

    const DISGUISE_NICKS = ['夜航船', '海盐汽水', '小岛来信', '晚风投递员', '月亮供电所', '瞌睡星云', '北国过客', '南风有信'];
    const rollDisguiseNick = () => {
        const base = DISGUISE_NICKS[Math.floor(Math.random() * DISGUISE_NICKS.length)];
        const suf = Math.random().toString(36).slice(2, 5);
        const nick = `${base}_${suf}`;
        liveUserDisguiseNick.value = nick;
        return nick;
    };
    const ensureDisguiseNick = () => {
        if (!liveUserDisguiseNick.value) liveUserDisguiseNick.value = rollDisguiseNick();
        return liveUserDisguiseNick.value;
    };

    // --- LIVE 设置面板（BGM/马甲/壁纸） ---
    const liveSettingsOpen = ref(false);
    const liveSettingsDraftBgmUrl = ref('');
    const liveSettingsDraftUserMask = ref('');
    const liveSettingsDraftHallWallpaperUrl = ref('');

    const openLiveSettings = () => {
        liveSettingsDraftBgmUrl.value = (LIVE_BGM_URL.value || LIVE_BGM_URL_DEFAULT);
        liveSettingsDraftUserMask.value = (liveUserDisguiseNick.value || '');
        liveSettingsDraftHallWallpaperUrl.value = (liveHallWallpaperUrl.value || '');
        liveSettingsOpen.value = true;
    };

    const closeLiveSettings = () => {
        liveSettingsOpen.value = false;
    };

    const saveLiveSettings = () => {
        const nextBgm = String(liveSettingsDraftBgmUrl.value || '').trim() || LIVE_BGM_URL_DEFAULT;
        const nextMask = String(liveSettingsDraftUserMask.value || '').trim();
        const nextWallpaper = String(liveSettingsDraftHallWallpaperUrl.value || '').trim();

        LIVE_BGM_URL.value = nextBgm;
        safeLocalStorageSet(LIVE_SETTING_KEYS.bgmUrl, nextBgm);

        // 尽量让 BGM 链接在“保存”后立刻生效
        const el = liveBgmAudioRef.value;
        if (el) {
            try {
                el.src = nextBgm;
                if (liveBgmPlaying.value) {
                    el.play().catch(() => {});
                }
            } catch {
                // ignore
            }
        }

        liveUserDisguiseNick.value = nextMask;
        safeLocalStorageSet(LIVE_SETTING_KEYS.userMask, nextMask);

        liveHallWallpaperUrl.value = nextWallpaper;
        safeLocalStorageSet(LIVE_SETTING_KEYS.hallWallpaperUrl, nextWallpaper);

        liveSettingsOpen.value = false;
    };

    // 壁纸上传（转成 dataURL 并持久化到 localStorage）
    const onLiveHallWallpaperUpload = (e) => {
        const file = e?.target?.files?.[0];
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            if (!dataUrl) return;
            liveHallWallpaperUrl.value = dataUrl;
            liveSettingsDraftHallWallpaperUrl.value = dataUrl;
            safeLocalStorageSet(LIVE_SETTING_KEYS.hallWallpaperUrl, dataUrl);
        };
        reader.onerror = () => {};
        reader.readAsDataURL(file);
    };

    // --- 厅内 BGM：搜索/列表/内置播放 ---
    const liveBgmSearchTerm = ref('');
    const liveBgmSearchResults = ref([]);
    const liveBgmSearchLoading = ref(false);
    const liveBgmCurrentSong = ref(null);

    const LIVE_MUSIC_COVER_PLACEHOLDER =
        'https://i.postimg.cc/pT2xKzP-album-cover-placeholder.png';

    // 默认展示（播放源仍以实际音频地址为准）
    liveBgmCurrentSong.value = {
        name: '岛屿遇见海',
        artist: '',
        cover: LIVE_MUSIC_COVER_PLACEHOLDER,
        source: 'custom',
        id: 'default',
        src: LIVE_BGM_URL.value
    };

    const LIVE_BGM_RANDOM_PLAYLIST_KEY = 'soulos_live_bgm_random_playlist_v1';
    const LIVE_BGM_PLAYED_HISTORY_KEY = 'soulos_live_bgm_played_history_v1';

    const safeJsonParse = (raw, fallback) => {
        try {
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    };

    const defaultSongForPlaylist = {
        name: '岛屿遇见海',
        artist: '',
        cover: LIVE_MUSIC_COVER_PLACEHOLDER,
        source: 'custom',
        id: 'default',
        src: LIVE_BGM_URL.value
    };

    const liveBgmRandomPlaylist = ref(
        (() => {
            const saved = safeJsonParse(safeLocalStorageGet(LIVE_BGM_RANDOM_PLAYLIST_KEY), null);
            if (!Array.isArray(saved) || saved.length === 0) return [defaultSongForPlaylist];
            const list = saved.filter((x) => x && typeof x.src === 'string' && x.src);
            return list.length ? list.slice(0, 25) : [defaultSongForPlaylist];
        })()
    );
    const liveBgmPlayedHistory = ref(
        (() => {
            const saved = safeJsonParse(safeLocalStorageGet(LIVE_BGM_PLAYED_HISTORY_KEY), null);
            if (!Array.isArray(saved)) return [];
            return saved.filter((x) => x && typeof x.src === 'string' && x.src).slice(-10);
        })()
    );

    const liveBgmQueuedSongCandidate = ref(null);
    const liveBgmQueuedSongQuery = ref('');
    let liveBgmQueueSearchPromise = null;

    // 控制 AI 主播“提 BGM 相关话题”的频率，避免一直聊
    const liveBgmLastMentionedKey = ref('');
    const liveBgmLastMentionedAt = ref(0);

    const liveBgmSongKey = (song) => {
        if (!song) return '';
        if (typeof song.src === 'string' && song.src) return `src:${song.src}`;
        const srcKey = song.source ? String(song.source) : 'custom';
        const idKey = song.id != null ? String(song.id) : '';
        return `${srcKey}:${idKey}`;
    };

    const persistLiveBgmRandomPlaylist = (list) => {
        safeLocalStorageSet(LIVE_BGM_RANDOM_PLAYLIST_KEY, JSON.stringify(list || []));
    };

    const persistLiveBgmPlayedHistory = (list) => {
        safeLocalStorageSet(LIVE_BGM_PLAYED_HISTORY_KEY, JSON.stringify(list || []));
    };

    const rememberLiveBgmSong = (song) => {
        if (!song || typeof song.src !== 'string' || !song.src) return;
        const key = liveBgmSongKey(song);

        const dedupe = (arr) => {
            const seen = new Set();
            const out = [];
            for (const it of arr || []) {
                const k = liveBgmSongKey(it);
                if (!k || seen.has(k)) continue;
                seen.add(k);
                out.push(it);
            }
            return out;
        };

        // played history: 只保留最近
        const nextHistory = dedupe([...liveBgmPlayedHistory.value, song]).slice(-10);
        liveBgmPlayedHistory.value = nextHistory;
        persistLiveBgmPlayedHistory(nextHistory);

        // random playlist: 用于兜底随机
        const nextPlaylist = dedupe([defaultSongForPlaylist, ...liveBgmRandomPlaylist.value, song]).slice(0, 25);
        liveBgmRandomPlaylist.value = nextPlaylist;
        persistLiveBgmRandomPlaylist(nextPlaylist);
    };

    const searchNeteaseBgmSongs = async (query) => {
        const name = String(query || '').replace(/\s/g, '').trim();
        if (!name) return [];
        try {
            const apiUrl = `${LIVE_MUSIC_API_BASE}/v2/music/netease?word=${encodeURIComponent(name)}`;
            const resp = await fetch(apiUrl);
            if (!resp.ok) return [];
            const result = await resp.json();
            if (result?.code !== 200 || !Array.isArray(result?.data) || result.data.length === 0) return [];
            return result.data
                .map((song) => ({
                    id: song.id,
                    name: song.song,
                    artist: song.singer,
                    cover: song.cover || LIVE_MUSIC_COVER_PLACEHOLDER,
                    source: 'netease'
                }))
                .slice(0, 15);
        } catch {
            return [];
        }
    };

    const searchTencentBgmSongs = async (query) => {
        const name = String(query || '').replace(/\s/g, '').trim();
        if (!name) return [];
        try {
            const apiUrl = `${LIVE_MUSIC_API_BASE}/v2/music/tencent?word=${encodeURIComponent(name)}`;
            const resp = await fetch(apiUrl);
            if (!resp.ok) return [];
            const result = await resp.json();
            if (!Array.isArray(result?.data) || result.data.length === 0) return [];
            return result.data
                .map((song) => ({
                    id: song.id,
                    name: song.song,
                    artist: song.singer,
                    cover: song.cover || LIVE_MUSIC_COVER_PLACEHOLDER,
                    source: 'tencent'
                }))
                .slice(0, 5);
        } catch {
            return [];
        }
    };

    const getLiveBgmPlayableUrl = async (song) => {
        if (!song) return null;
        if (typeof song.src === 'string' && song.src) return song.src;
        if (!song.id || !song.source) return null;
        const apiUrl =
            song.source === 'netease'
                ? `${LIVE_MUSIC_API_BASE}/v2/music/netease?id=${encodeURIComponent(song.id)}`
                : `${LIVE_MUSIC_API_BASE}/v2/music/tencent?id=${encodeURIComponent(song.id)}`;
        const resp = await fetch(apiUrl);
        if (!resp.ok) return null;
        const result = await resp.json();
        const url = result?.data?.url;
        return typeof url === 'string' && url ? url : null;
    };

    // --- 歌词抓取 + 展示（按音频时间更新） ---
    const liveBgmLyricsParsed = ref([]);
    const liveBgmLyricsLoading = ref(false);
    const liveBgmCurrentLyricText = ref('');
    const liveBgmLyricPrevText = ref('');
    const liveBgmLyricNextText = ref('');
    const liveBgmCurrentLyricIndex = ref(-1);
    let liveBgmLyricTimerId = null;
    const liveBgmLyricsCache = new Map(); // key = `${source}:${id}`

    const parseLiveLrc = (lrcContent) => {
        if (!lrcContent) return [];
        const lines = String(lrcContent).split('\n');
        const lyrics = [];
        const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;
        for (const line of lines) {
            if (!line) continue;
            const text = line.replace(timeRegex, '').trim();
            if (!text) continue;
            timeRegex.lastIndex = 0;
            let match;
            while ((match = timeRegex.exec(line)) !== null) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const ms = parseInt(match[3].padEnd(3, '0'), 10);
                const time = minutes * 60 + seconds + ms / 1000;
                lyrics.push({ time, text });
            }
        }
        return lyrics.sort((a, b) => a.time - b.time);
    };

    const getLiveBgmLyricsForSong = async (song) => {
        if (!song || !song.id || !song.source) return '';
        if (song.source !== 'netease' && song.source !== 'tencent') return '';
        const url =
            song.source === 'netease'
                ? `${LIVE_MUSIC_API_BASE}/v2/music/netease/lyric?id=${encodeURIComponent(song.id)}`
                : `${LIVE_MUSIC_API_BASE}/v2/music/tencent/lyric?id=${encodeURIComponent(song.id)}`;
        const resp = await fetch(url);
        if (!resp.ok) return '';
        const data = await resp.json();
        const lrc = data?.data?.lrc || data?.data?.lyric || '';
        const trans = data?.data?.trans || data?.data?.tlyric || '';
        // 只展示原文；如果想拼翻译，可把 trans 追加到 lrc
        return String(lrc || '');
    };

    const pickLyricIndexAtTime = (parsedLyrics, t) => {
        if (!Array.isArray(parsedLyrics) || parsedLyrics.length === 0) return -1;
        const time = Number(t) || 0;
        let idx = -1;
        for (let i = 0; i < parsedLyrics.length; i++) {
            if (parsedLyrics[i].time <= time + 0.2) idx = i;
            else break;
        }
        return idx;
    };

    const startLiveBgmLyricTimer = () => {
        if (liveBgmLyricTimerId) return;
        liveBgmLyricTimerId = setInterval(() => {
            const el = liveBgmAudioRef.value;
            if (!el) return;
            const t = el.currentTime || 0;
            const parsed = liveBgmLyricsParsed.value;
            const idx = pickLyricIndexAtTime(parsed, t);
            liveBgmCurrentLyricIndex.value = idx;
            liveBgmCurrentLyricText.value = idx >= 0 ? parsed[idx]?.text || '' : '';
            liveBgmLyricPrevText.value = idx > 0 ? parsed[idx - 1]?.text || '' : '';
            liveBgmLyricNextText.value = idx >= 0 && idx + 1 < parsed.length ? parsed[idx + 1]?.text || '' : '';
        }, 450);
    };

    const stopLiveBgmLyricTimer = () => {
        if (liveBgmLyricTimerId) {
            clearInterval(liveBgmLyricTimerId);
            liveBgmLyricTimerId = null;
        }
    };

    const loadLiveBgmLyricsForSong = async (song) => {
        if (!song || !song.id || !song.source) return;
        try {
            liveBgmLyricsLoading.value = true;
            liveBgmCurrentLyricText.value = '';
            liveBgmLyricPrevText.value = '';
            liveBgmLyricNextText.value = '';
            liveBgmCurrentLyricIndex.value = -1;

            const cacheKey = `${song.source}:${song.id}`;
            if (liveBgmLyricsCache.has(cacheKey)) {
                const cached = liveBgmLyricsCache.get(cacheKey) || [];
                liveBgmLyricsParsed.value = cached;
                const el = liveBgmAudioRef.value;
                const t = el?.currentTime || 0;
                const idx = pickLyricIndexAtTime(cached, t);
                liveBgmCurrentLyricIndex.value = idx;
                liveBgmCurrentLyricText.value = idx >= 0 ? cached[idx]?.text || '' : '';
                liveBgmLyricPrevText.value = idx > 0 ? cached[idx - 1]?.text || '' : '';
                liveBgmLyricNextText.value = idx >= 0 && idx + 1 < cached.length ? cached[idx + 1]?.text || '' : '';
                return;
            }

            const lrc = await getLiveBgmLyricsForSong(song);
            const parsed = parseLiveLrc(lrc);
            liveBgmLyricsCache.set(cacheKey, parsed);
            liveBgmLyricsParsed.value = parsed;
            const el = liveBgmAudioRef.value;
            const t = el?.currentTime || 0;
            const idx = pickLyricIndexAtTime(parsed, t);
            liveBgmCurrentLyricIndex.value = idx;
            liveBgmCurrentLyricText.value = idx >= 0 ? parsed[idx]?.text || '' : '';
            liveBgmLyricPrevText.value = idx > 0 ? parsed[idx - 1]?.text || '' : '';
            liveBgmLyricNextText.value = idx >= 0 && idx + 1 < parsed.length ? parsed[idx + 1]?.text || '' : '';
        } catch {
            liveBgmLyricsParsed.value = [];
            liveBgmCurrentLyricText.value = '';
            liveBgmLyricPrevText.value = '';
            liveBgmLyricNextText.value = '';
            liveBgmCurrentLyricIndex.value = -1;
        } finally {
            liveBgmLyricsLoading.value = false;
        }
    };

    const playLiveBgmFromSong = async (song) => {
        if (!song) return false;
        const url = await getLiveBgmPlayableUrl(song);
        if (!url) return false;

        // 手动播放/切歌：清空队列
        liveBgmQueuedSongCandidate.value = null;
        liveBgmQueuedSongQuery.value = '';

        // 更新当前歌信息 + 链接持久化
        const nextSong = { ...song, src: url };
        liveBgmCurrentSong.value = nextSong;
        liveSettingsDraftBgmUrl.value = url;
        LIVE_BGM_URL.value = url;
        safeLocalStorageSet(LIVE_SETTING_KEYS.bgmUrl, url);
        rememberLiveBgmSong(nextSong);

        // 切歌时重置歌词展示
        liveBgmLyricsParsed.value = [];
        liveBgmCurrentLyricText.value = '';
        liveBgmLyricPrevText.value = '';
        liveBgmLyricNextText.value = '';
        liveBgmCurrentLyricIndex.value = -1;
        liveBgmLyricsLoading.value = true;
        startLiveBgmLyricTimer();
        void loadLiveBgmLyricsForSong(song);

        // 直接切歌并播放
        const el = liveBgmAudioRef.value;
        if (el) {
            try {
                el.src = url;
                await el.play();
                liveBgmPlaying.value = true;
            } catch {
                liveBgmPlaying.value = false;
            }
        }

        return true;
    };

    const searchLiveBgmSongs = async (query) => {
        const q = String(query || '').trim();
        if (!q) {
            liveBgmSearchResults.value = [];
            return [];
        }
        liveBgmSearchLoading.value = true;
        try {
            const netease = await searchNeteaseBgmSongs(q);
            const results = netease.length > 0 ? netease : await searchTencentBgmSongs(q);
            liveBgmSearchResults.value = results || [];
            return liveBgmSearchResults.value;
        } finally {
            liveBgmSearchLoading.value = false;
        }
    };

    const playLiveBgmByQuery = async (query) => {
        const results = await searchLiveBgmSongs(query);
        if (!Array.isArray(results) || results.length === 0) return false;
        return playLiveBgmFromSong(results[0]);
    };

    // 留言区检索到 BGM 后，只“队列”下一首，等当前歌结束再播放
    const queueLiveBgmByQuery = async (query) => {
        const q = String(query || '').trim();
        if (!q) return;
        if (q === liveBgmQueuedSongQuery.value) return;

        // 如果已经有队列，就用最新的覆盖（更贴合“有人点歌”）
        liveBgmQueuedSongQuery.value = q;

        liveBgmQueueSearchPromise = (async () => {
            const results = await searchLiveBgmSongs(q);
            if (!Array.isArray(results) || results.length === 0) {
                liveBgmQueuedSongCandidate.value = null;
                return;
            }
            liveBgmQueuedSongCandidate.value = results[0];
        })();

        // 不阻塞当前渲染
        void liveBgmQueueSearchPromise;
    };

    // AI 推荐的 BGM：带频率限制，避免一直换/一直刷
    const liveBgmLastAiQueueAt = ref(0);
    const liveBgmLastAiQueueQuery = ref('');
    const queueLiveBgmByAiQuery = async (query) => {
        const q = String(query || '').trim();
        if (!q) return;
        const now = Date.now();
        if (now - liveBgmLastAiQueueAt.value < 90000) return; // 90s 冷却
        if (q === liveBgmLastAiQueueQuery.value) return;
        liveBgmLastAiQueueAt.value = now;
        liveBgmLastAiQueueQuery.value = q;
        await queueLiveBgmByQuery(q);
    };

    const pickLiveBgmFallbackSong = () => {
        const currentKey = liveBgmSongKey(liveBgmCurrentSong.value);
        const playlistPool = (liveBgmRandomPlaylist.value || []).filter((s) => liveBgmSongKey(s) !== currentKey);
        if (playlistPool.length > 0) {
            return playlistPool[Math.floor(Math.random() * playlistPool.length)];
        }
        const historyPool = (liveBgmPlayedHistory.value || []).filter((s) => liveBgmSongKey(s) !== currentKey);
        if (historyPool.length > 0) {
            return historyPool[Math.floor(Math.random() * historyPool.length)];
        }
        return liveBgmRandomPlaylist.value?.[0] || liveBgmCurrentSong.value || defaultSongForPlaylist;
    };

    const onLiveBgmEnded = async () => {
        liveBgmPlaying.value = false;
        stopLiveBgmLyricTimer();

        // 如果队列搜索还没完成，给一个短暂等待
        if (!liveBgmQueuedSongCandidate.value && liveBgmQueueSearchPromise) {
            try {
                await Promise.race([
                    liveBgmQueueSearchPromise,
                    new Promise((resolve) => setTimeout(resolve, 6000))
                ]);
            } catch {
                // ignore
            }
        }

        const queued = liveBgmQueuedSongCandidate.value;
        liveBgmQueuedSongCandidate.value = null;
        liveBgmQueuedSongQuery.value = '';
        liveBgmQueueSearchPromise = null;

        if (queued) {
            const ok = await playLiveBgmFromSong(queued).catch(() => false);
            if (ok) return;
        }

        const next = pickLiveBgmFallbackSong();
        await playLiveBgmFromSong(next).catch(() => {});
    };

    const extractBgmQueryFromText = (rawText) => {
        const text = String(rawText || '').trim();
        if (!text) return null;

        // 常见形态："... bgm是 xxx" / "bgm：xxx" / "BGM为xxx"
        const m = text.match(/(?:bgm|BGM)\s*(?:是|为|=|[:：])\s*["“]?([^"”\\n\\r.!?？]{1,60})/i);
        if (m && m[1]) return m[1].trim();

        // 兜底：如果只说了 bgm，尝试截断前后半句
        if (/(bgm|BGM)/i.test(text)) {
            const parts = text.split(/[\n\r.!?？。]/);
            const line = parts.find((p) => /(bgm|BGM)/i.test(p));
            if (line) {
                return line.replace(/.*(?:bgm|BGM)\s*(?:是|为|=|[:：])?\s*/i, '').trim().slice(0, 60);
            }
        }
        return null;
    };

    // --- 计算属性 ---
    const liveRooms = computed(() => {
        const list = (characters.value || [])
            .filter(c => c && (c.name || c.nickname))
            .map((c, idx) => ({
                id: String(c.id),
                hostId: c.id,
                name: `${c.nickname || c.name}语音厅`,
                subtitle: idx % 2 === 0 ? '暖场陪聊' : '自由连麦'
            }));
        if (list.length === 0) {
            return [{ id: 'default-live-room', hostId: null, name: '默认语音厅', subtitle: '请先在Workshop创建角色' }];
        }
        return list;
    });

    const activeLiveRoom = computed(() => {
        return liveRooms.value.find(r => r.id === activeLiveRoomId.value) || liveRooms.value[0];
    });

    const activeLiveHost = computed(() => {
        const room = activeLiveRoom.value;
        if (!room || room.hostId == null) return null;
        return (characters.value || []).find(c => String(c.id) === String(room.hostId)) || null;
    });

    const activeLiveMessages = computed(() => {
        const room = activeLiveRoom.value;
        if (!room) return [];
        if (!liveMessages.value[room.id]) {
            liveMessages.value[room.id] = [
                { id: `sys_${Date.now()}`, user: '系统', text: `欢迎来到${room.name}，请文明交流。`, system: true }
            ];
        }
        return liveMessages.value[room.id];
    });

    // --- 自动根据留言触发 BGM 搜索播放 ---
    let liveAutoBgmLastSeenId = null;
    const liveAutoBgmLastTriggeredAt = ref(0);
    const liveAutoBgmLastQuery = ref('');

    watch(activeLiveMessages, (msgs) => {
        if (!Array.isArray(msgs) || msgs.length === 0) return;
        const last = msgs[msgs.length - 1];
        if (!last || last.id === liveAutoBgmLastSeenId) return;
        liveAutoBgmLastSeenId = last.id;

        if (last.system) return;
        if (!last.text) return;

        const q = extractBgmQueryFromText(last.text);
        if (!q) return;

        const now = Date.now();
        if (now - liveAutoBgmLastTriggeredAt.value < 15000) return;
        if (q === liveAutoBgmLastQuery.value) return;

        liveAutoBgmLastTriggeredAt.value = now;
        liveAutoBgmLastQuery.value = q;

        // 留言区只做“队列准备”：不立刻切歌
        queueLiveBgmByQuery(q);
    });

    const liveElapsedText = computed(() => {
        const m = Math.floor(liveElapsedSeconds.value / 60);
        const s = liveElapsedSeconds.value % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    });

    const activeLiveHostSpeech = computed(() => {
        const id = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (!id) return '';
        return liveHostSpeechByRoom.value[id] || '';
    });

    const activeLiveHostSpeechHistory = computed(() => {
        const id = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (!id) return [];
        const list = liveHostSpeechHistoryByRoom.value[id];
        if (!Array.isArray(list) || list.length === 0) return [];
        return [...list].reverse();
    });

    const pushHostSpeechHistory = (roomId, line) => {
        if (!roomId || !line || !String(line).trim()) return;
        const text = String(line).trim();
        const prev = liveHostSpeechHistoryByRoom.value[roomId];
        if (Array.isArray(prev) && prev.length && prev[prev.length - 1].text === text) return;
        const id = `h_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const next = [...(Array.isArray(prev) ? prev : []), { id, text, at: Date.now() }];
        const max = 100;
        if (next.length > max) next.splice(0, next.length - max);
        liveHostSpeechHistoryByRoom.value[roomId] = next;
        liveHostSpeechHistoryByRoom.value = { ...liveHostSpeechHistoryByRoom.value };
    };

    const toggleLiveHostHistory = () => {
        liveHostHistoryOpen.value = !liveHostHistoryOpen.value;
    };

    const closeLiveHostHistory = () => {
        liveHostHistoryOpen.value = false;
    };

    const formatLiveHostHistoryTime = (ts) => {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
            return '';
        }
    };

    // --- 辅助函数 ---
    const extractJsonObject = (raw) => {
        if (!raw || typeof raw !== 'string') return null;
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        const tryParse = (s) => {
            try {
                return JSON.parse(s);
            } catch {
                return null;
            }
        };
        if (fence) {
            const j = tryParse(fence[1].trim());
            if (j) return j;
        }
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
            const j = tryParse(m[0]);
            if (j) return j;
        }
        return null;
    };

    const callLiveChatApi = async (messages) => {
        const profile = activeProfile.value;
        if (!profile || !profile.endpoint || !profile.key) return null;
        let modelId = profile.model;
        if (!modelId && availableModels.value.length > 0) {
            modelId = availableModels.value[0].id;
            profile.model = modelId;
        }
        try {
            const reply = (
                await callAI(profile, messages, {
                    temperature: profile.temperature ?? 0.85,
                    max_tokens: typeof profile.max_tokens === 'number' ? profile.max_tokens : undefined
                })
            ).trim();
            if (!reply) {
                console.warn('[LIVE] 无法从响应中解析正文，请确认反代为 OpenAI 兼容 /chat/completions。');
            }
            return reply || null;
        } catch (e) {
            console.warn('[LIVE] fetch 失败（若从浏览器打开本地文件，可能是 CORS；请用本地 http 服务访问）', e);
            return null;
        }
    };

    const pushLiveFloatingDanmaku = (roomId, { user, text, kind = 'chat' }) => {
        if (!roomId || !text) return;
        const id = `dm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const track = Math.floor(Math.random() * 4);
        if (!liveDanmakuByRoom.value[roomId]) {
            liveDanmakuByRoom.value[roomId] = [];
        }
        liveDanmakuByRoom.value[roomId].push({ id, user: user || '路人', text, track, kind });
        liveDanmakuByRoom.value = { ...liveDanmakuByRoom.value };
        setTimeout(() => {
            const arr = liveDanmakuByRoom.value[roomId] || [];
            liveDanmakuByRoom.value[roomId] = arr.filter((x) => x.id !== id);
            liveDanmakuByRoom.value = { ...liveDanmakuByRoom.value };
        }, 12000);
    };

    const removeLiveDanmakuById = (roomId, dmId) => {
        const arr = liveDanmakuByRoom.value[roomId] || [];
        liveDanmakuByRoom.value[roomId] = arr.filter((x) => x.id !== dmId);
        liveDanmakuByRoom.value = { ...liveDanmakuByRoom.value };
    };

    const randomNpcFallback = () => {
        const nicks = ['夜航船', '海盐汽水', '小岛来信', '晚风投递员', '月亮供电所', '瞌睡星云'];
        const msgs = ['哈哈说到点子上了', '刚才那段挺有意思', '蹲一个连麦', '前排', '今天氛围挺轻松', '路过听一耳朵'];
        return {
            nick: nicks[Math.floor(Math.random() * nicks.length)],
            msg: msgs[Math.floor(Math.random() * msgs.length)],
            gift: Math.random() < 0.12 ? ['荧光棒', '小心心', '礼花'][Math.floor(Math.random() * 3)] : null
        };
    };

    const buildLiveFeedDigest = () => {
        const roomId = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (!roomId) return '';
        const lines = (liveMessages.value[roomId] || []).slice(-14);
        return lines.map((m) => `${m.user}：${m.text}`).join('\n');
    };

    /** 班车专用：强调路人/NPC 与暖场；「我」= 上麦掉马；马甲 = 普通路人 */
    const buildLiveBatchDigest = () => {
        const roomId = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (!roomId) return '';
        const lines = (liveMessages.value[roomId] || []).slice(-14);
        const myNick = liveUserDisguiseNick.value;
        return lines
            .map((m) => {
                const u = String(m.user || '');
                const t = String(m.text || '');
                if (u === '我') {
                    return `【我】${t}（已上麦掉马，本条已由主播即时回应，本段脚本勿再专门回我）`;
                }
                if (myNick && u === myNick) {
                    return `${u}：${t}`;
                }
                return `${u}：${t}`;
            })
            .join('\n');
    };

    const hostPersonaSnippet = (host) => {
        if (!host) return '';
        const raw = String(host.persona || host.description || '').trim();
        return raw.slice(0, 420);
    };

    const getWorldbooksList = () => {
        const w = worldbooks;
        if (!w || w.value == null) return [];
        return Array.isArray(w.value) ? w.value : [];
    };

    /** 拼合当前主播绑定的世界书条目，供 LIVE 提取可出现的 NPC（网名需模型自拟） */
    const buildLiveLinkedWorldbookText = (host) => {
        const ids = host && Array.isArray(host.worldbookIds) ? host.worldbookIds : [];
        if (!ids.length) return '';
        const list = getWorldbooksList();
        const parts = [];
        let budget = 3800;
        for (const wbId of ids) {
            const wb = list.find((x) => String(x.id) === String(wbId));
            if (!wb || !wb.entries || !wb.entries.length) continue;
            const title = wb.name ? `【世界书·${wb.name}】` : '【世界书】';
            const desc = String(wb.description || '').trim();
            if (desc && desc !== '暂无描述...') {
                const d = desc.slice(0, 400);
                parts.push(`${title}\n${d}`);
                budget -= d.length + title.length + 2;
            } else {
                parts.push(title);
                budget -= title.length;
            }
            for (const entry of wb.entries) {
                if (budget <= 0) break;
                const kw = String(entry.keyword || entry.key || entry.keywords || '').trim();
                const content = String(entry.content || '').trim();
                if (!kw && !content) continue;
                const block = kw ? `[${kw.slice(0, 64)}]\n${content}` : content;
                const slice = block.length > budget ? `${block.slice(0, budget)}…` : block;
                parts.push(slice);
                budget -= slice.length;
            }
            if (budget <= 0) break;
        }
        return parts.join('\n\n').trim();
    };

    /** 角色卡是否体现恋爱/恋人/爱情向（未写明则不当成情侣） */
    const personaRomanceFromCard = (host) => {
        const raw = String(host?.persona || host?.description || '');
        if (!raw.trim()) return false;
        return /恋爱|恋人|爱情|情侣|男友|女友|爱人|老公|老婆|配偶|乙女向|恋爱向|暧昧向|热恋|交往|表白|青梅竹马|婚约|订婚|夫妻|丈夫|妻子|喜欢你|只对你|独占|梦女向/.test(raw);
    };

    /** 人设是否与音乐/演唱强相关（否则语音厅以聊天为主，少写唱歌） */
    const personaMusicFromCard = (host) => {
        const raw = String(host?.persona || host?.description || '');
        return /音乐|歌手|唱歌|声乐|专辑|唱作人|乐队|作曲|偶像|idol|live\s*house|巡演|开嗓|爱唱|爱听歌/.test(raw);
    };

    const liveRomanceRuleLine = (host) => {
        if (personaRomanceFromCard(host)) {
            return '人设已体现恋爱/陪伴向时，可适度温柔亲近，但勿油腻、勿与路人暧昧；若人设未强调独占恋人，勿默认与观众「我」已是情侣。';
        }
        return '人设未写明恋爱/爱情向时：勿默认你与观众「我」是情侣，勿用老公/老婆/宝贝等恋人称呼，保持友好、尊重、自然的距离。';
    };

    const liveMusicRuleLine = (host) => {
        if (personaMusicFromCard(host)) {
            return '人设与音乐/演唱相关时，可自然提到唱歌、练歌或分享音乐；否则本厅以聊天为主，不要写「唱一首」「开个嗓」「给你唱」等。';
        }
        return '本语音厅以聊天、分享想法与日常为主；不要默认主播在唱歌、点歌、媚粉式演唱，除非人设与音乐强相关。';
    };

    const liveStyleRuleLine = () =>
        '内容风格须贴合人设：例如偶像/艺人可聊行程与舞台（音乐仅在人设相关时）；职场/霸总可聊行业、观点与日常；学生/日常可聊近况与话题；不要套用「唱歌撩粉」万能模板。';

    const liveNpcRuleLine = () =>
        '路人 NPC 弹幕：禁止暧昧、撩拨、网恋感、对主播用恋人称呼；像普通听众/粉丝闲聊、玩梗、点赞、提问即可。';

    /** 人设/世界书里的作品内角色，在直播间用网名出现，偶作彩蛋 */
    const liveCanonNpcRuleLine = () =>
        '大部分路人弹幕用随机路人网名；人设/世界书中的作品内角色可偶尔以彩蛋形式出现（每段 0～2 个即可）：必须用「直播间网名」作 nick（2～12 字），禁止真名全名；网名要让粉丝能联想到是谁。不要全写成作品内角色。';

    const scheduleNextBatchTimer = (delayMs) => {
        if (liveNextBatchTimerId) {
            clearTimeout(liveNextBatchTimerId);
            liveNextBatchTimerId = null;
        }
        const d = Math.max(0, Number(delayMs) || 0);
        nextLiveBatchRunAtMs = Date.now() + d;
        liveNextBatchTimerId = setTimeout(() => {
            liveNextBatchTimerId = null;
            runLiveBatchFetch();
        }, d);
    };

    /** 我发完弹幕：若下一班批量还很晚，提前到约 10s 后（仍遵守每分钟≤5 次） */
    const maybeAccelerateLiveBatchAfterMe = () => {
        const now = Date.now();
        const earliest = Math.max(lastLiveBatchApiAt + LIVE_BATCH_MIN_INTERVAL_MS, now + 1800);
        const targetEarly = now + LIVE_BATCH_EARLY_AFTER_ME_MS;
        if (!nextLiveBatchRunAtMs || nextLiveBatchRunAtMs <= targetEarly + 800) return;
        const when = Math.max(earliest, targetEarly);
        if (when >= nextLiveBatchRunAtMs - 400) return;
        const delay = Math.max(0, when - now);
        scheduleNextBatchTimer(delay);
    };

    const generateFallbackTimeline = () => {
        const hostBits = ['看到弹幕了', '感谢各位在场', '随便聊聊吧', '欢迎新来的朋友'];
        const out = [];
        for (let i = 0; i < 10; i++) {
            const t = Math.min(30, Math.round((i / 10) * 28 + Math.random() * 2.5));
            if (Math.random() < 0.22) {
                out.push({ t, type: 'host', line: hostBits[Math.floor(Math.random() * hostBits.length)] });
            } else {
                const one = randomNpcFallback();
                if (one.gift) {
                    out.push({ t, type: 'npc', nick: one.nick, msg: '一点心意～', gift: one.gift });
                } else {
                    out.push({ t, type: 'npc', nick: one.nick, msg: one.msg, gift: null });
                }
            }
        }
        return out.sort((a, b) => a.t - b.t);
    };

    const executeLiveTimelineEvent = (roomId, ev) => {
        const cur = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (String(cur) !== String(roomId)) return;
        const typ = String(ev.type || 'npc').toLowerCase();
        if (typ === 'host') {
            const line = String(ev.line || '').replace(/\[REPLY\][\s\S]*?\[\/REPLY\]/gi, '').replace(/\[OS\][\s\S]*/gi, '').trim().slice(0, 200);
            if (line) {
                liveHostSpeechByRoom.value[roomId] = line;
                liveHostSpeechByRoom.value = { ...liveHostSpeechByRoom.value };
                pushHostSpeechHistory(roomId, line);
            }

            const bgmQuery = typeof ev.bgmQuery === 'string' ? ev.bgmQuery.trim() : '';
            if (bgmQuery) {
                // AI 的 BGM 推荐只排队：等当前歌结束再播
                void queueLiveBgmByAiQuery(bgmQuery);
            }
            return;
        }
        const nick = String(ev.nick || '观众').slice(0, 12);
        const gift = ev.gift != null && String(ev.gift).trim() !== '' ? String(ev.gift).slice(0, 16) : '';
        if (gift) {
            if (!liveMessages.value[roomId]) liveMessages.value[roomId] = [];
            liveMessages.value[roomId].push({
                id: `gift_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                user: nick,
                text: `送出了 ${gift}`,
                kind: 'gift',
                giftName: gift
            });
            pushLiveFloatingDanmaku(roomId, { user: nick, text: `送出了 ${gift}`, kind: 'gift' });
        } else {
            const msg = String(ev.msg || '666').slice(0, 80);
            if (!liveMessages.value[roomId]) liveMessages.value[roomId] = [];
            liveMessages.value[roomId].push({
                id: `npc_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                user: nick,
                text: msg,
                kind: 'npc'
            });
            pushLiveFloatingDanmaku(roomId, { user: nick, text: msg, kind: 'npc' });
        }
    };

    const runLiveImmediateHostReply = async (roomId, userText) => {
        const profile = activeProfile.value;
        if (!profile || !profile.endpoint || !profile.key) return;
        const text = String(userText || '').trim();
        if (!text || !roomId) return;

        if (liveImmediateHostBusy) {
            liveImmediateHostQueued = { roomId, text };
            return;
        }
        liveImmediateHostBusy = true;

        const still = () => String(activeLiveRoomId.value || activeLiveRoom.value?.id) === String(roomId);
        const host = activeLiveHost.value;
        const hostName = host ? (host.nickname || host.name || '主播') : '主播';
        const persona = hostPersonaSnippet(host);
        const wbTextIm = buildLiveLinkedWorldbookText(host);
        const onMic = liveOnMic.value;
        const displayNick = onMic ? '我' : ensureDisguiseNick();
        const bgmName = liveBgmCurrentSong.value?.name || '';
        const bgmKey = liveBgmSongKey(liveBgmCurrentSong.value);
        const bgmNow = Date.now();
        const canMentionBgm =
            !!bgmName && (!liveBgmLastMentionedKey.value || bgmKey !== liveBgmLastMentionedKey.value || (bgmNow - liveBgmLastMentionedAt.value > 60000));
        if (canMentionBgm) {
            liveBgmLastMentionedKey.value = bgmKey;
            liveBgmLastMentionedAt.value = bgmNow;
        }
        const bgmSystemRule = bgmName
            ? canMentionBgm
                ? `- 当前厅内 BGM：${bgmName}。本次回复允许偶尔提一句相关话题（最多 1 句，别反复）。`
                : `- 当前厅内 BGM：${bgmName}。禁止在本次回复里提及 BGM 名称/歌词，回到自然聊天与回应。`
            : '';

        try {
            const identityBlock = onMic
                ? `观众「我」发了弹幕，这是你认识的人（重要观众）。请直接、自然回应 ta。`
                : `观众「${displayNick}」发了弹幕。你不认识 ta，这是普通路人网友。像对待其他路人弹幕一样简短回应即可，不要特殊对待，不要暴露你认识「我」。`;
            const sys = `你是语音厅主播「${hostName}」。只输出一个 JSON 对象，不要 markdown，不要解释。
格式：{"line":"主播的一句话回复","bgmQuery":"string|null"}
要求：
- ${identityBlock}
- line 只一句，口语化，不超过 60 字。
- bgmQuery：只在你觉得需要换一首“符合当前人设氛围”的歌（用于 queue，在当前歌结束后播放）时，填入检索用的“歌名（可加歌手）”；否则填 null。不要在 line 里出现 bgmQuery 的歌名内容。
- ${liveRomanceRuleLine(host)}
- ${liveMusicRuleLine(host)}
- ${liveStyleRuleLine()}
- ${liveCanonNpcRuleLine()}（你口播若提到作品内他人，也不要直呼真名，可用代称或网名式称呼。）
${bgmSystemRule ? bgmSystemRule + '\n' : ''}${persona ? `人设参考：${persona}` : ''}${wbTextIm ? `\n绑定世界书参考（提及他人时同上）：\n${wbTextIm.slice(0, 1200)}` : ''}`;
            const userP = onMic ? `我刚才发的弹幕：${text}` : `观众「${displayNick}」发的弹幕：${text}`;
            const raw = await callLiveChatApi([
                { role: 'system', content: sys },
                { role: 'user', content: userP }
            ]);
            if (!still()) return;
            let line = '';
            let bgmQuery = null;
            const parsed = raw ? extractJsonObject(raw) : null;
            if (parsed && typeof parsed.line === 'string') line = parsed.line.trim();
            if (parsed && (typeof parsed.bgmQuery === 'string' || parsed.bgmQuery === null)) {
                bgmQuery = parsed.bgmQuery;
            }
            else if (raw) line = String(raw).replace(/```[\s\S]*?```/g, '').trim();
            line = String(line || '')
                .replace(/\[REPLY\][\s\S]*?\[\/REPLY\]/gi, '')
                .replace(/\[OS\][\s\S]*/gi, '')
                .trim()
                .slice(0, 200);
            if (line) {
                executeLiveTimelineEvent(roomId, { type: 'host', line, bgmQuery });
            }
        } finally {
            liveImmediateHostBusy = false;
            const q = liveImmediateHostQueued;
            liveImmediateHostQueued = null;
            if (q && String(q.roomId) === String(roomId)) {
                runLiveImmediateHostReply(q.roomId, q.text);
            }
        }
    };

    const clearLivePlaybackTimers = () => {
        livePlaybackTimerIds.forEach((id) => clearTimeout(id));
        livePlaybackTimerIds = [];
        if (liveNextBatchTimerId) {
            clearTimeout(liveNextBatchTimerId);
            liveNextBatchTimerId = null;
        }
        nextLiveBatchRunAtMs = 0;
        liveNpcBusy = false;
    };

    const scheduleLiveTimeline = (roomId, timeline) => {
        clearLivePlaybackTimers();
        const sorted = [...timeline].sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0));
        let maxSec = 8;
        for (const ev of sorted) {
            const sec = Math.max(0, Math.min(32, Number(ev.t) || 0));
            if (sec > maxSec) maxSec = sec;
            const delayMs = sec * 1000;
            const id = setTimeout(() => {
                executeLiveTimelineEvent(roomId, ev);
                livePlaybackTimerIds = livePlaybackTimerIds.filter((x) => x !== id);
            }, delayMs);
            livePlaybackTimerIds.push(id);
        }
        scheduleNextBatchTimer(maxSec * 1000 + 2800);
    };

    const runLiveBatchFetch = async () => {
        if (liveNpcBusy) return;
        const roomId = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (!roomId) return;

        const now = Date.now();
        if (lastLiveBatchApiAt > 0 && now - lastLiveBatchApiAt < LIVE_BATCH_MIN_INTERVAL_MS) {
            const wait = LIVE_BATCH_MIN_INTERVAL_MS - (now - lastLiveBatchApiAt) + 80;
            scheduleNextBatchTimer(wait);
            return;
        }

        const room = activeLiveRoom.value;
        const digest = buildLiveBatchDigest();
        const host = activeLiveHost.value;
        const hostName = host ? (host.nickname || host.name || '主播') : '主播';
        const personaBatch = hostPersonaSnippet(host);
        const wbTextBatch = buildLiveLinkedWorldbookText(host);

        const bgmNameBatch = liveBgmCurrentSong.value?.name || '';
        const bgmKeyBatch = liveBgmSongKey(liveBgmCurrentSong.value);
        const bgmNowBatch = Date.now();
        const canMentionBgmBatch =
            !!bgmNameBatch && (!liveBgmLastMentionedKey.value || bgmKeyBatch !== liveBgmLastMentionedKey.value || (bgmNowBatch - liveBgmLastMentionedAt.value > 60000));
        if (canMentionBgmBatch) {
            liveBgmLastMentionedKey.value = bgmKeyBatch;
            liveBgmLastMentionedAt.value = bgmNowBatch;
        }
        const bgmBatchRule = bgmNameBatch
            ? canMentionBgmBatch
                ? `- 当前厅内 BGM：${bgmNameBatch}。在整个 timeline 中最多提到一次 BGM，提到后不要重复提及。`
                : `- 当前厅内 BGM：${bgmNameBatch}。禁止提及 BGM 名称/歌词，保持自然聊天。`
            : '';

        lastLiveBatchApiAt = Date.now();
        liveNpcBusy = true;
        liveHostSpeechLoading.value = true;
        let raw = null;
        try {
        const sys = `你是语音厅直播间「班车批量」脚本生成器（与观众「我」的即时回复无关）。只输出一个 JSON 对象，不要 markdown，不要解释。
格式示例：
{"timeline":[{"t":3,"type":"npc","nick":"昵称","msg":"弹幕内容","gift":null},{"t":9,"type":"host","line":"主播的一句话回复","bgmQuery":null},{"t":15,"type":"npc","nick":"昵称2","msg":"谢谢","gift":"礼物名"}]}
字段说明：
- timeline：8～14 条，按 t 从小到大；t 为从本段脚本开始的秒数，范围 0～30，彼此拉开间隔，模仿直播延迟。
- type 为 "npc"：必有 nick、msg；nick 为直播间网名（2～12 字）。${liveNpcRuleLine()}
- ${liveCanonNpcRuleLine()}
- type 为 "host"：必有 line，是主播「${hostName}」对路人/全场的口头台词，每条不超过 60 字，口语化；不要专门复述「我」的弹幕（若动态里标注了已即时回复）；提到作品内他人勿用真名。
  - bgmQuery 可选：当你觉得需要换一首“符合当前人设氛围”的歌时，填入检索用的“歌名（可加歌手）”；否则填 null。bgmQuery 只用于 queue：在当前 BGM 播完之后再播放。不要在 line 里提到歌名/歌词。
- ${liveRomanceRuleLine(host)}
- ${liveMusicRuleLine(host)}
- ${liveStyleRuleLine()}
${bgmBatchRule ? bgmBatchRule + '\n' : ''}
- npc 与 host 穿插，内容多样、贴合人设，不要重复雷同；不要编造与角色卡、世界书冲突的设定。
- 话题凝聚：若近期动态中有观众「我」或某条弹幕提到具体话题，本段应让较多路人 NPC 围绕该话题闲聊、玩梗、讨论，形成「大家聊同一件事」的热闹感；主播也可顺势接话。无明确话题时再各聊各的。`;
            const userP = `房间：${room?.name || '语音厅'}\n近期动态参考：\n${digest || '（暂无）'}${digest && (/【我】/.test(digest) || (liveUserDisguiseNick.value && digest.includes(liveUserDisguiseNick.value))) ? `\n（↑ 动态中有观众发言，本段路人 NPC 应较多围绕其提到的话题讨论）` : ''}${personaBatch ? `\n\n主播人设摘要（风格须与此一致；人设/世界书中的角色偶作彩蛋出现在路人弹幕，勿全写成作品内角色）：\n${personaBatch}` : ''}${wbTextBatch ? `\n\n绑定世界书（偶作彩蛋出现于路人弹幕，nick 须为网名勿用真名）：\n${wbTextBatch}` : ''}`;
            raw = await callLiveChatApi([
                { role: 'system', content: sys },
                { role: 'user', content: userP }
            ]);
        } finally {
            liveNpcBusy = false;
            liveHostSpeechLoading.value = false;
        }
        const stillId = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (String(stillId) !== String(roomId)) return;
        const parsed = raw ? extractJsonObject(raw) : null;
        const timeline = parsed && Array.isArray(parsed.timeline) ? parsed.timeline : null;
        if (timeline && timeline.length) {
            scheduleLiveTimeline(roomId, timeline);
        } else {
            scheduleLiveTimeline(roomId, generateFallbackTimeline());
        }
    };

    const clearLivePlaybackAndBatch = (resetUserState = true) => {
        clearLivePlaybackTimers();
        liveImmediateHostQueued = null;
        lastLiveBatchApiAt = 0;
        if (resetUserState) {
            liveOnMic.value = false;
            // 马甲属于持久化设置：不要在离开/重置时清空
        }
    };

    const switchLiveRoom = (roomId) => {
        if (!roomId || roomId === activeLiveRoomId.value) return;
        clearLivePlaybackAndBatch(false);
        liveHostHistoryOpen.value = false;
        activeLiveRoomId.value = roomId;
        liveElapsedSeconds.value = 0;
        setTimeout(() => runLiveBatchFetch(), 350);
    };

    const toggleLiveMic = () => {
        liveMicMuted.value = !liveMicMuted.value;
    };

    const toggleLiveOnMic = () => {
        const wasOn = liveOnMic.value;
        liveOnMic.value = !liveOnMic.value;
        if (wasOn && !liveOnMic.value) {
            // 下麦后不再“自动换马甲”；仅在未设置时做一次兜底
            if (!liveUserDisguiseNick.value) ensureDisguiseNick();
        }
    };

    const sendLiveGift = () => {
        const roomId = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (!roomId) return;
        if (!liveMessages.value[roomId]) {
            liveMessages.value[roomId] = [];
        }
        const displayUser = liveOnMic.value ? '我' : ensureDisguiseNick();
        const gifts = ['小心心', '荧光棒', '棒棒糖', '小气球'];
        const g = gifts[Math.floor(Math.random() * gifts.length)];
        liveMessages.value[roomId].push({
            id: `gift_${Date.now()}`,
            user: displayUser,
            text: `送出了 ${g}`,
            kind: 'gift'
        });
        liveMessages.value = { ...liveMessages.value };
    };

    const sendLiveMessage = () => {
        const text = (liveInput.value || '').trim();
        if (!text) return;
        const roomId = activeLiveRoomId.value || activeLiveRoom.value?.id;
        if (!roomId) return;
        if (!liveMessages.value[roomId]) {
            liveMessages.value[roomId] = [];
        }
        const displayUser = liveOnMic.value ? '我' : ensureDisguiseNick();
        liveMessages.value[roomId].push({
            id: Date.now(),
            user: displayUser,
            text,
            kind: 'chat'
        });
        liveMessages.value = { ...liveMessages.value };
        pushLiveFloatingDanmaku(roomId, { user: displayUser, text, kind: 'chat' });
        liveInput.value = '';
        runLiveImmediateHostReply(roomId, text);
        maybeAccelerateLiveBatchAfterMe();
    };

    const toggleLiveBgm = () => {
        const el = liveBgmAudioRef.value;
        if (!el) return;
        if (liveBgmPlaying.value) {
            el.pause();
            liveBgmPlaying.value = false;
        } else {
            el.play().then(() => {
                liveBgmPlaying.value = true;
            }).catch(() => {
                liveBgmPlaying.value = false;
            });
        }
    };

    const onLiveBgmPlay = () => { liveBgmPlaying.value = true; };
    const onLiveBgmPause = () => { liveBgmPlaying.value = false; };

    // --- 定时器与生命周期 ---
    let waveInterval, onlineCountInterval, elapsedInterval;

    onMounted(() => {
        // 波形律动
        waveInterval = setInterval(() => {
            liveWaveBars.value = liveWaveBars.value.map(() => 8 + Math.floor(Math.random() * 14));
        }, 900);
        // 在线人数模拟
        onlineCountInterval = setInterval(() => {
            const change = Math.floor(Math.random() * 21) - 10;
            liveOnlineCount.value = Math.max(1000, liveOnlineCount.value + change);
        }, 900);
        // 计时器
        elapsedInterval = setInterval(() => {
            liveElapsedSeconds.value += 1;
        }, 1000);
    });

    const cleanup = () => {
        clearLivePlaybackAndBatch();
    };

    onUnmounted(() => {
        clearInterval(waveInterval);
        clearInterval(onlineCountInterval);
        clearInterval(elapsedInterval);
        stopLiveBgmLyricTimer();
        clearLivePlaybackAndBatch();
    });

    // 当房间列表变化时，如果当前房间不在列表中，则切换到第一个
    watch(liveRooms, (rooms) => {
        if (!Array.isArray(rooms) || rooms.length === 0) return;
        const exists = rooms.some(r => r.id === activeLiveRoomId.value);
        if (!exists) activeLiveRoomId.value = rooms[0].id;
    }, { immediate: true });

    // 暴露给外部的启动批量获取的方法（由外部在进入live时调用）
    const startBatchFetch = () => {
        runLiveBatchFetch();
    };

    return {
        // 状态
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
        // 设置面板
        liveHallWallpaperUrl,
        liveSettingsOpen,
        liveSettingsDraftBgmUrl,
        liveSettingsDraftUserMask,
        liveSettingsDraftHallWallpaperUrl,
        onLiveHallWallpaperUpload,
        // BGM 搜索/列表/当前歌曲
        liveBgmSearchTerm,
        liveBgmSearchResults,
        liveBgmSearchLoading,
        liveBgmCurrentSong,
        // BGM 歌词
        liveBgmLyricsLoading,
        liveBgmCurrentLyricText,
        liveBgmLyricPrevText,
        liveBgmLyricNextText,
        // 计算属性
        liveRooms,
        activeLiveRoom,
        activeLiveHost,
        activeLiveMessages,
        liveElapsedText,
        activeLiveHostSpeech,
        activeLiveHostSpeechHistory,
        liveHostHistoryOpen,
        // 方法
        switchLiveRoom,
        toggleLiveMic,
        toggleLiveOnMic,
        rollDisguiseNick,
        openLiveSettings,
        closeLiveSettings,
        saveLiveSettings,
        onLiveHallWallpaperUpload,
        // BGM picker
        searchLiveBgmSongs,
        playLiveBgmFromSong,
        playLiveBgmByQuery,
        onLiveBgmEnded,
        sendLiveGift,
        sendLiveMessage,
        toggleLiveBgm,
        onLiveBgmPlay,
        onLiveBgmPause,
        startBatchFetch,
        clearLivePlaybackAndBatch,
        cleanup,
        toggleLiveHostHistory,
        closeLiveHostHistory,
        formatLiveHostHistoryTime,
    };
}
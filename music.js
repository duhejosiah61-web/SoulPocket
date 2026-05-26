import { computed, nextTick, reactive, ref, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

const MUSIC_COVER_PLACEHOLDER = 'https://i.postimg.cc/pT2xKzP-album-cover-placeholder.png';
const MUSIC_API_BASE = 'https://nodegpybdyuh-fbus--3000--4c73681d.local-corp.webcontainer.io';
const MUSIC_FAVORITES_KEY = 'soulpocket_music_favorites_v1';
const MUSIC_RECENTS_KEY = 'soulpocket_music_recents_v1';
const MUSIC_QUEUE_KEY = 'soulpocket_music_queue_v1';
const MUSIC_VOLUME_KEY = 'soulpocket_music_volume_v1';

const DEMO_PLAYLIST = [
    {
        id: 'demo-middle',
        title: 'The Middle',
        name: 'The Middle',
        artist: 'Dream Tunes',
        duration: '03:42',
        genre: 'indie',
        lyric: 'You are the middle of my night',
        mood: '推荐',
        source: 'demo',
        cover: MUSIC_COVER_PLACEHOLDER,
        src: 'https://files.catbox.moe/4bugg1.mp3'
    },
    {
        id: 'demo-neon',
        title: 'Soft Neon',
        name: 'Soft Neon',
        artist: 'Milo',
        duration: '03:08',
        genre: 'pop',
        lyric: 'Neon lights are breathing slow',
        mood: '发现',
        source: 'demo',
        cover: MUSIC_COVER_PLACEHOLDER,
        src: 'https://files.catbox.moe/4bugg1.mp3'
    },
    {
        id: 'demo-rain',
        title: 'After Rain',
        name: 'After Rain',
        artist: 'Iris',
        duration: '04:16',
        genre: 'ambient',
        lyric: 'The city learns to whisper',
        mood: '漫游',
        source: 'demo',
        cover: MUSIC_COVER_PLACEHOLDER,
        src: 'https://files.catbox.moe/4bugg1.mp3'
    },
    {
        id: 'demo-static',
        title: 'Velvet Static',
        name: 'Velvet Static',
        artist: 'Noir Club',
        duration: '04:08',
        genre: 'electro',
        lyric: 'Static velvet on the wire',
        mood: 'char',
        source: 'demo',
        cover: MUSIC_COVER_PLACEHOLDER,
        src: 'https://files.catbox.moe/4bugg1.mp3'
    },
    {
        id: 'demo-moon',
        title: 'Paper Moon',
        name: 'Paper Moon',
        artist: 'Studio Echo',
        duration: '02:59',
        genre: 'acoustic',
        lyric: 'Paper moon above the desk',
        mood: '收藏',
        source: 'demo',
        cover: MUSIC_COVER_PLACEHOLDER,
        src: 'https://files.catbox.moe/4bugg1.mp3'
    }
];

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
        // ignore storage failures
    }
};

const safeJsonParse = (raw, fallback) => {
    try {
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const normalizeSong = (song = {}) => {
    const source = song.source || 'local';
    const rawTitle = song.title || song.name || song.song || 'Untitled';
    const rawArtist = song.artist || song.singer || 'Unknown Artist';
    const id = song.id != null ? String(song.id) : `${source}_${rawTitle}_${rawArtist}`;
    return {
        ...song,
        id,
        source,
        title: rawTitle,
        name: rawTitle,
        artist: rawArtist,
        cover: song.cover || song.pic || song.albumPic || MUSIC_COVER_PLACEHOLDER,
        duration: song.duration || song.interval || '--:--',
        genre: song.genre || source,
        mood: song.mood || (source === 'demo' ? '内置' : '在线'),
        lyric: song.lyric || '歌词加载中，或暂无歌词。',
        src: song.src || song.url || ''
    };
};

const songKey = (song) => {
    if (!song) return '';
    if (song.source && song.id != null) return `${song.source}:${song.id}`;
    return `${song.title || song.name || ''}:${song.artist || ''}`;
};

const formatTime = (seconds) => {
    const n = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const searchNeteaseSongs = async (query) => {
    const q = String(query || '').replace(/\s/g, '').trim();
    if (!q) return [];
    try {
        const resp = await fetch(`${MUSIC_API_BASE}/v2/music/netease?word=${encodeURIComponent(q)}`);
        if (!resp.ok) return [];
        const result = await resp.json();
        if (result?.code !== 200 || !Array.isArray(result?.data)) return [];
        return result.data.map((song) => normalizeSong({
            id: song.id,
            title: song.song,
            artist: song.singer,
            cover: song.cover,
            duration: song.duration || '--:--',
            source: 'netease',
            mood: '网易云'
        })).slice(0, 20);
    } catch {
        return [];
    }
};

const searchTencentSongs = async (query) => {
    const q = String(query || '').replace(/\s/g, '').trim();
    if (!q) return [];
    try {
        const resp = await fetch(`${MUSIC_API_BASE}/v2/music/tencent?word=${encodeURIComponent(q)}`);
        if (!resp.ok) return [];
        const result = await resp.json();
        if (!Array.isArray(result?.data)) return [];
        return result.data.map((song) => normalizeSong({
            id: song.id || song.mid,
            title: song.song || song.name,
            artist: song.singer,
            cover: song.cover || song.pic,
            duration: song.duration || '--:--',
            source: 'tencent',
            mood: 'QQ音乐'
        })).slice(0, 20);
    } catch {
        return [];
    }
};

const getPlayableUrl = async (song) => {
    if (!song) return '';
    if (song.src) return song.src;
    if (!song.id || !song.source) return '';
    if (song.source !== 'netease' && song.source !== 'tencent') return '';
    try {
        const apiUrl = song.source === 'netease'
            ? `${MUSIC_API_BASE}/v2/music/netease?id=${encodeURIComponent(song.id)}`
            : `${MUSIC_API_BASE}/v2/music/tencent?id=${encodeURIComponent(song.id)}`;
        const resp = await fetch(apiUrl);
        if (!resp.ok) return '';
        const result = await resp.json();
        const url = result?.data?.url;
        return typeof url === 'string' ? url : '';
    } catch {
        return '';
    }
};

const getLyricsForSong = async (song) => {
    if (!song || !song.id || (song.source !== 'netease' && song.source !== 'tencent')) return song?.lyric || '';
    try {
        const apiUrl = song.source === 'netease'
            ? `${MUSIC_API_BASE}/v2/music/netease/lyric?id=${encodeURIComponent(song.id)}`
            : `${MUSIC_API_BASE}/v2/music/tencent/lyric?id=${encodeURIComponent(song.id)}`;
        const resp = await fetch(apiUrl);
        if (!resp.ok) return song?.lyric || '';
        const data = await resp.json();
        return data?.data?.lrc || data?.data?.lyric || song?.lyric || '';
    } catch {
        return song?.lyric || '';
    }
};

const parseLrc = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return [];
    const lines = [];
    text.split(/\r?\n/).forEach((line) => {
        const matches = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g)];
        const content = line.replace(/\[[^\]]+\]/g, '').trim();
        if (!matches.length || !content) return;
        matches.forEach((match) => {
            const min = Number(match[1]) || 0;
            const sec = Number(match[2]) || 0;
            const ms = Number(String(match[3] || '0').padEnd(3, '0')) || 0;
            lines.push({ time: min * 60 + sec + ms / 1000, text: content });
        });
    });
    return lines.sort((a, b) => a.time - b.time);
};

export function useMusic({ characters = [], currentCharacter = null } = {}) {
    const savedQueue = safeJsonParse(safeLocalStorageGet(MUSIC_QUEUE_KEY), null);
    const playlist = reactive(
        Array.isArray(savedQueue) && savedQueue.length
            ? savedQueue.map(normalizeSong).slice(0, 80)
            : DEMO_PLAYLIST.map(normalizeSong)
    );

    const savedVolume = Number(safeLocalStorageGet(MUSIC_VOLUME_KEY));
    const audioRef = ref(null);
    const searchTimer = ref(null);
    const activeLyricIndex = ref(-1);

    const music = reactive({
        activeIndex: 0,
        isPlaying: false,
        isLoading: false,
        activeTab: 'home',
        showPlaylist: false,
        searchText: '',
        roamIndex: 0,
        playlist,
        searchResults: [],
        searchLoading: false,
        searchError: '',
        playError: '',
        currentTime: 0,
        durationSeconds: 0,
        volume: Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : 0.82,
        repeatMode: 'list',
        shuffle: false,
        favorites: safeJsonParse(safeLocalStorageGet(MUSIC_FAVORITES_KEY), []),
        recents: safeJsonParse(safeLocalStorageGet(MUSIC_RECENTS_KEY), []),
        lyricsText: '',
        lyricLines: [],
        discoverCards: [
            { title: '在线搜索', desc: '搜索网易云/QQ 音乐结果，点击即可播放', tag: '搜索' },
            { title: '一起听', desc: '保留 char 陪伴感，同时接入真实播放', tag: 'char' },
            { title: '播放队列', desc: '搜索结果、收藏和最近播放都能加入队列', tag: '队列' }
        ],
        roamQuotes: [
            '让音乐替你先开口。',
            '把没说出口的话，交给旋律。',
            '每个夜晚都值得一首歌。'
        ],
        profileStats: {
            liked: 0,
            created: 1,
            recent: 0
        }
    });

    const currentTrack = computed(() => music.playlist[music.activeIndex] || music.playlist[0] || normalizeSong({}));
    const progressPercent = computed(() => {
        if (!music.durationSeconds) return 0;
        return Math.min(100, Math.max(0, (music.currentTime / music.durationSeconds) * 100));
    });
    const currentTimeText = computed(() => formatTime(music.currentTime));
    const durationText = computed(() => currentTrack.value?.duration && currentTrack.value.duration !== '--:--'
        ? currentTrack.value.duration
        : formatTime(music.durationSeconds));
    const isCurrentFavorite = computed(() => music.favorites.some((item) => songKey(item) === songKey(currentTrack.value)));
    const filteredSongs = computed(() => {
        const keyword = music.searchText.trim().toLowerCase();
        const base = music.searchResults.length ? music.searchResults : music.playlist;
        if (!keyword || music.searchResults.length) return base;
        return base.filter(song =>
            [song.title, song.artist, song.genre, song.mood, song.source].some(value => String(value || '').toLowerCase().includes(keyword))
        );
    });

    const persistQueue = () => safeLocalStorageSet(MUSIC_QUEUE_KEY, JSON.stringify(music.playlist.slice(0, 80)));
    const persistFavorites = () => safeLocalStorageSet(MUSIC_FAVORITES_KEY, JSON.stringify(music.favorites.slice(0, 200)));
    const persistRecents = () => safeLocalStorageSet(MUSIC_RECENTS_KEY, JSON.stringify(music.recents.slice(0, 50)));

    const syncProfileStats = () => {
        music.profileStats.liked = music.favorites.length;
        music.profileStats.recent = music.recents.length;
    };

    const addRecent = (song) => {
        const normalized = normalizeSong(song);
        const key = songKey(normalized);
        music.recents = [normalized, ...music.recents.filter((item) => songKey(item) !== key)].slice(0, 30);
        persistRecents();
        syncProfileStats();
    };

    const loadLyrics = async (song) => {
        music.lyricsText = song?.lyric || '';
        music.lyricLines = parseLrc(music.lyricsText);
        activeLyricIndex.value = -1;
        const lyrics = await getLyricsForSong(song);
        if (songKey(song) !== songKey(currentTrack.value)) return;
        music.lyricsText = lyrics || song?.lyric || '';
        music.lyricLines = parseLrc(music.lyricsText);
    };

    const playSong = async (song, { addToQueue = true } = {}) => {
        const normalized = normalizeSong(song);
        music.playError = '';
        music.isLoading = true;
        let index = music.playlist.findIndex((item) => songKey(item) === songKey(normalized));
        if (index < 0 && addToQueue) {
            music.playlist.push(normalized);
            index = music.playlist.length - 1;
            persistQueue();
        }
        if (index >= 0) music.activeIndex = index;

        const url = await getPlayableUrl(normalized);
        if (!url) {
            music.isLoading = false;
            music.isPlaying = false;
            music.playError = '暂时拿不到这首歌的可播放链接，可以换一首试试。';
            return false;
        }

        normalized.src = url;
        if (index >= 0) music.playlist[index] = normalized;
        persistQueue();
        await loadLyrics(normalized);
        await nextTick();

        const el = audioRef.value;
        if (!el) {
            music.isLoading = false;
            music.playError = '播放器还没有准备好。';
            return false;
        }

        try {
            if (el.src !== url) el.src = url;
            el.volume = music.volume;
            await el.play();
            music.isPlaying = true;
            addRecent(normalized);
            return true;
        } catch {
            music.isPlaying = false;
            music.playError = '浏览器阻止自动播放或音源失效，请手动点播放/换歌。';
            return false;
        } finally {
            music.isLoading = false;
        }
    };

    const playCurrent = async () => playSong(currentTrack.value, { addToQueue: false });

    const pause = () => {
        const el = audioRef.value;
        if (el) el.pause();
        music.isPlaying = false;
    };

    const toggleMusicPlayPause = async () => {
        if (music.isPlaying) {
            pause();
            return;
        }
        await playCurrent();
    };

    const playPrevious = async () => {
        if (!music.playlist.length) return;
        if (music.currentTime > 4) {
            seekToPercent(0);
            return;
        }
        music.activeIndex = (music.activeIndex - 1 + music.playlist.length) % music.playlist.length;
        await playCurrent();
    };

    const playNext = async () => {
        if (!music.playlist.length) return;
        if (music.shuffle && music.playlist.length > 1) {
            let next = music.activeIndex;
            while (next === music.activeIndex) next = Math.floor(Math.random() * music.playlist.length);
            music.activeIndex = next;
        } else {
            music.activeIndex = (music.activeIndex + 1) % music.playlist.length;
        }
        await playCurrent();
    };

    const onAudioTimeUpdate = () => {
        const el = audioRef.value;
        if (!el) return;
        music.currentTime = el.currentTime || 0;
        music.durationSeconds = Number.isFinite(el.duration) ? el.duration : music.durationSeconds;
        if (music.lyricLines.length) {
            let idx = -1;
            for (let i = 0; i < music.lyricLines.length; i += 1) {
                if (music.lyricLines[i].time <= music.currentTime) idx = i;
                else break;
            }
            activeLyricIndex.value = idx;
        }
    };

    const onAudioLoadedMetadata = () => {
        const el = audioRef.value;
        if (!el) return;
        music.durationSeconds = Number.isFinite(el.duration) ? el.duration : 0;
        if (music.durationSeconds) currentTrack.value.duration = formatTime(music.durationSeconds);
    };

    const onAudioPlay = () => { music.isPlaying = true; music.isLoading = false; };
    const onAudioPause = () => { music.isPlaying = false; };
    const onAudioWaiting = () => { music.isLoading = true; };
    const onAudioCanPlay = () => { music.isLoading = false; };
    const onAudioError = () => {
        music.isLoading = false;
        music.isPlaying = false;
        music.playError = '当前音源播放失败，请换一首或重新搜索。';
    };
    const onAudioEnded = async () => {
        if (music.repeatMode === 'one') {
            seekToPercent(0);
            await playCurrent();
            return;
        }
        if (music.repeatMode === 'none' && music.activeIndex >= music.playlist.length - 1) {
            music.isPlaying = false;
            return;
        }
        await playNext();
    };

    const seekToPercent = (percent) => {
        const el = audioRef.value;
        if (!el || !music.durationSeconds) return;
        const next = Math.min(100, Math.max(0, Number(percent) || 0));
        el.currentTime = (next / 100) * music.durationSeconds;
        music.currentTime = el.currentTime;
    };

    const seekFromEvent = (event) => {
        const rect = event?.currentTarget?.getBoundingClientRect?.();
        if (!rect || !rect.width) return;
        const percent = ((event.clientX - rect.left) / rect.width) * 100;
        seekToPercent(percent);
    };

    const setVolume = (value) => {
        const next = Math.min(1, Math.max(0, Number(value) || 0));
        music.volume = next;
        safeLocalStorageSet(MUSIC_VOLUME_KEY, String(next));
        if (audioRef.value) audioRef.value.volume = next;
    };

    const toggleFavorite = (song = currentTrack.value) => {
        const normalized = normalizeSong(song);
        const key = songKey(normalized);
        const exists = music.favorites.some((item) => songKey(item) === key);
        music.favorites = exists
            ? music.favorites.filter((item) => songKey(item) !== key)
            : [normalized, ...music.favorites].slice(0, 200);
        persistFavorites();
        syncProfileStats();
    };

    const addToQueue = (song) => {
        const normalized = normalizeSong(song);
        if (!music.playlist.some((item) => songKey(item) === songKey(normalized))) {
            music.playlist.push(normalized);
            persistQueue();
        }
    };

    const playFromSearch = async (song) => {
        music.activeTab = 'discover';
        await playSong(song, { addToQueue: true });
    };

    const playFromQueue = async (index) => {
        if (index < 0 || index >= music.playlist.length) return;
        music.activeIndex = index;
        await playCurrent();
    };

    const playSavedSong = async (song) => {
        music.activeTab = 'discover';
        await playSong(song, { addToQueue: true });
    };

    const searchOnlineSongs = async (query = music.searchText) => {
        const q = String(query || '').trim();
        if (!q) {
            music.searchResults = [];
            music.searchError = '';
            return [];
        }
        music.searchLoading = true;
        music.searchError = '';
        try {
            const netease = await searchNeteaseSongs(q);
            const tencent = netease.length >= 8 ? [] : await searchTencentSongs(q);
            const seen = new Set();
            const results = [...netease, ...tencent].filter((song) => {
                const key = songKey(song);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            music.searchResults = results;
            if (!results.length) music.searchError = '没有搜到结果，换个关键词试试。';
            return results;
        } catch {
            music.searchError = '搜索失败，请稍后重试。';
            music.searchResults = [];
            return [];
        } finally {
            music.searchLoading = false;
        }
    };

    const clearSearch = () => {
        music.searchText = '';
        music.searchResults = [];
        music.searchError = '';
    };

    const cycleRepeatMode = () => {
        music.repeatMode = music.repeatMode === 'list' ? 'one' : music.repeatMode === 'one' ? 'none' : 'list';
    };

    watch(() => music.searchText, (value) => {
        if (searchTimer.value) clearTimeout(searchTimer.value);
        if (!String(value || '').trim()) {
            music.searchResults = [];
            music.searchError = '';
            return;
        }
        searchTimer.value = setTimeout(() => searchOnlineSongs(value), 520);
    });

    watch(() => music.activeIndex, () => {
        music.currentTime = 0;
        music.durationSeconds = 0;
        music.playError = '';
        loadLyrics(currentTrack.value);
    });

    syncProfileStats();
    loadLyrics(currentTrack.value);

    return {
        music,
        playlist: music.playlist,
        audioRef,
        currentTrack,
        progressPercent,
        currentTimeText,
        durationText,
        activeLyricIndex,
        isCurrentFavorite,
        filteredSongs,
        playPrevious,
        playNext,
        toggleMusicPlayPause,
        playSong,
        playFromSearch,
        playFromQueue,
        playSavedSong,
        addToQueue,
        toggleFavorite,
        searchOnlineSongs,
        clearSearch,
        seekFromEvent,
        setVolume,
        cycleRepeatMode,
        onAudioTimeUpdate,
        onAudioLoadedMetadata,
        onAudioPlay,
        onAudioPause,
        onAudioWaiting,
        onAudioCanPlay,
        onAudioError,
        onAudioEnded,
        characters,
        currentCharacter,
    };
}

import { computed, nextTick, reactive, ref, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { callAI } from './api.js';

const MUSIC_COVER_PLACEHOLDER = 'https://i.postimg.cc/pT2xKzP-album-cover-placeholder.png';
const myVipCookie = 'MUSIC_U=0028B9304C8ED430BBA7F06BE64C6CE8CE11DC4053929DF8E8E9AB3467D171FCECFD4613844C4EEFC3E6F986FF65C61CF7EF13D2581318CB07416503D20AB90A5F86A4932F14E9F9B4BBFFB02772E2752A8E915B4919CD4B2E538B82F0D27C7940797A21877E310669E4DB475E1864DC4DA158C70E282CE3F63D70F9DB0629E255EC017070DF945A79CF47B8D0C20D81EB2C05FDF7B094A6CA75EDE0730696E3431F02F26058AA385B45B8F9147E532019A9AA4B2C2465CD78C8F78E3BBB5689BB5AF124758503BB44E377CA875BE89CC39708DEB1292C48B554F116AED18576BF13B1C716142253E7940FE15848091FE5134CF4DE5AD3AC13043170BDC089B9A04701FC323230B0263335C026F239D8244EFECEAA74CD01D2DEC27C4F92B35AD935E60C2F15E806E27F7305A9EF5D591224782A113D87FFF581E0522E6D909E2EA6C89D11113181F33D29317A3924A0E31B786440B5291D1A59C927FF7611D0BABFB3A7BB988FF77794B9BC0E3A7F265D5C4F90CD48CC84C95B9811943A90A4D68B5630811A8A8D54F516793310E4B969243BE270C99BB2D6035D142F58061120';
const MUSIC_API_BASE = 'https://www.biumusic-ap.site';
const MUSIC_FAVORITES_KEY = 'soulpocket_music_favorites_v1';
const MUSIC_RECENTS_KEY = 'soulpocket_music_recents_v1';
const MUSIC_QUEUE_KEY = 'soulpocket_music_queue_v1';
const MUSIC_VOLUME_KEY = 'soulpocket_music_volume_v1';
const MUSIC_CHAT_HISTORY_KEY = 'soulpocket_music_chat_history_v1';
const MUSIC_HOME_RECOMMENDED_KEY = 'soulpocket_music_home_recommended_v1';
const MUSIC_HOME_CHAR_KEY = 'soulpocket_music_home_char_v1';

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
    } catch (error) {
        console.error('[Music] safeJsonParse failed:', error);
        return fallback;
    }
};

const safeLocalStorageSet = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        console.error('[Music] safeLocalStorageSet failed:', error);
    }
};

const safeJsonParse = (raw, fallback) => {
    try {
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (error) {
        console.error('[Music] safeJsonParse failed:', error);
        return fallback;
    }
};

const normalizeSong = (song = {}) => {
    const source = song.source || 'local';
    const rawTitle = song.title || song.name || song.song || 'Untitled';
    const rawArtist = song.artist || song.singer || 'Unknown Artist';
    const id = song.id != null ? String(song.id) : `${source}_${rawTitle}_${rawArtist}`;
    const cover = song.cover || song.pic || song.picUrl || song.albumPic || song.al?.picUrl || MUSIC_COVER_PLACEHOLDER;
    return {
        ...song,
        id,
        source,
        title: rawTitle,
        name: rawTitle,
        artist: rawArtist,
        cover: typeof cover === 'string' && cover.trim() ? cover : MUSIC_COVER_PLACEHOLDER,
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

const requestJson = async (path) => {
    const resp = await fetch(`${MUSIC_API_BASE}${path}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
};

const extractSongsFromSearchResponse = (result) => {
    const candidates = [
        result?.result?.songs,
        result?.songs,
        result?.data?.songs,
        result?.data
    ];
    const songs = candidates.find(Array.isArray);
    return Array.isArray(songs) ? songs : [];
};

const extractFirstSongDetail = (data, songId) => {
    const songs = data?.songs || data?.data?.songs || data?.data || [];
    if (Array.isArray(songs) && songs.length) return songs[0];
    if (data?.song && typeof data.song === 'object') return data.song;
    return { id: songId };
};

const buildLyricsPreview = (lyricsText, fallbackText = '暂无歌词，先享受这一首。') => {
    const lines = parseLrc(lyricsText);
    return lines.length ? lines : [{ time: 0, text: fallbackText }];
};

const ensureHttpsUrl = (url) => {
    if (typeof url !== 'string') return '';
    return url.trim().replace(/^http:\/\//i, 'https://');
};

const addCoverParam = (url) => {
    const clean = ensureHttpsUrl(url);
    if (!clean) return MUSIC_COVER_PLACEHOLDER;
    return clean.includes('?') ? `${clean}&param=400y400` : `${clean}?param=400y400`;
};

const searchNeteaseSongs = async (query) => {
    const q = String(query || '').trim();
    if (!q) return [];
    try {
        const encoded = encodeURIComponent(q);
        const responseData = await requestJson(`/cloudsearch?keywords=${encoded}&limit=6`);
        console.log('[Music NetEase] 网易云搜索返回数据:', responseData);
        const songs = extractSongsFromSearchResponse(responseData);
        return songs.map((song) => {
            const artists = Array.isArray(song.ar || song.artists)
                ? (song.ar || song.artists).map((artist) => artist.name).filter(Boolean).join(' / ')
                : 'Unknown Artist';
            const cover = addCoverParam(song.al?.picUrl || song.al?.pic || song.picUrl || song.cover || MUSIC_COVER_PLACEHOLDER);
            return normalizeSong({
                id: song.id,
                title: song.name,
                artist: artists,
                cover,
                duration: song.dt ? formatTime(song.dt / 1000) : (song.duration ? formatTime(song.duration / 1000) : '--:--'),
                source: 'netease',
                album: song.al?.name || song.album?.name || '',
                mood: '网易云'
            });
        }).slice(0, 30);
    } catch (error) {
        console.error('[Music NetEase] search failed:', error);
        return [];
    }
};

const getPlayableUrl = async (song) => {
    if (!song) return '';
    if (song.src) return song.src;
    if (!song.id || !song.source) return '';
    if (song.source !== 'netease') return '';

    try {
        const cookieParam = myVipCookie ? `&cookie=${encodeURIComponent(myVipCookie)}` : '';
        const result = await requestJson(
            `/song/url/v1?id=${encodeURIComponent(song.id)}&level=exhigh&realIP=116.25.146.177${cookieParam}`
        );

        // 你的后台返回结构：
        // { data: [ { id, url, code } ], code: 200 }
        const rawUrl = result?.data?.[0]?.url || '';

        if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';

        // 强制把 http 替换成 https，避免 Mixed Content 拦截
        return ensureHttpsUrl(rawUrl);
    } catch (error) {
        console.error('[Music] getPlayableUrl failed:', error);
        return '';
    }
};

const getLyricsForSong = async (song) => {
    if (!song || !song.id || song.source !== 'netease') return song?.lyric || '';
    try {
        const data = await requestJson(`/lyric?id=${encodeURIComponent(song.id)}`);
        return data?.lrc?.lyric || data?.tlyric?.lyric || song?.lyric || '';
    } catch (error) {
        console.error('[Music] getLyricsForSong failed:', error);
        return song?.lyric || '';
    }
};

const getSongDetail = async (songId) => {
    if (!songId) return null;
    try {
        const data = await requestJson(`/song/detail?ids=${encodeURIComponent(songId)}`);
        return extractFirstSongDetail(data, songId);
    } catch (error) {
        console.error('[Music] getSongDetail failed:', error);
        return null;
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

export function useMusic({ characters = [], currentCharacter = null, activeProfile = null, apiStatus = null } = {}) {
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
    const lyricsScrollBox = ref(null);
    let isLoadingLyrics = false;

    const workshopCharacters = safeJsonParse(safeLocalStorageGet('soulos_workshop_characters'), []);
    const activeChar = ref(
        Array.isArray(workshopCharacters) && workshopCharacters.length
            ? workshopCharacters[0]
            : (currentCharacter?.value || currentCharacter || { id: 'default-char', name: 'Char', nickname: 'Char', avatarUrl: '' })
    );

    const currentCharacterName = computed(() => activeChar.value?.nickname || activeChar.value?.name || 'Char');
    const togetherTitle = computed(() => `想和${currentCharacterName.value}听的歌`);

    const pickCharKeywords = () => {
        const tags = Array.isArray(activeChar.value?.tags) ? activeChar.value.tags.filter(Boolean) : [];
        if (tags.length) {
            const shuffled = [...tags].sort(() => Math.random() - 0.5);
            return shuffled.slice(0, Math.min(2, tags.length)).join(' ');
        }
        const kvMusicPref = String(activeChar.value?.kvData?.musicPreference || activeChar.value?.musicPreference || '').trim();
        if (kvMusicPref) return kvMusicPref;
        return null;
    };

    const getEffectiveApiProfile = () => {
        const fromInjected = activeProfile?.value ?? activeProfile;
        if (fromInjected?.endpoint && fromInjected?.key && fromInjected?.model) return fromInjected;

        const profiles = safeJsonParse(safeLocalStorageGet('soulos_api_profiles'), []);
        const activeId = safeLocalStorageGet('soulos_active_api_profile_id');
        if (Array.isArray(profiles) && profiles.length) {
            const selected = profiles.find((p) => String(p?.id) === String(activeId)) || profiles[0];
            if (selected?.endpoint && selected?.key && selected?.model) return selected;
        }
        return null;
    };

    const fetchVibeFromLLM = async (persona, profile) => {
        const personaText = String(persona || '').trim();
        if (!personaText) return '';
        console.log('[Music LLM] 开始请求大模型分析人设...', `${personaText.substring(0, 50)}...`);
        const prompt = `作为资深音乐DJ，请阅读以下人物设定：\n${personaText}\n请推断出适合他听的 1~2 个【音乐流派】或【代表歌手】（必须是能直接在网易云音乐搜出好结果的词，如：后摇 独立民谣）。只能回复这几个关键词，绝对不要输出任何标点符号和其他解释！`;
        const llmResponse = await callAI(profile, [
            { role: 'system', content: '你是资深音乐DJ。严格只输出关键词，不能解释。' },
            { role: 'user', content: prompt }
        ], { temperature: 0.4, max_tokens: 60 });
        const cleaned = String(llmResponse || '').replace(/[\n\r\t,，。！？、;；:："'`~!@#$%^&*()_+=\[\]{}<>\\/|]+/g, ' ').replace(/\s+/g, ' ').trim();
        console.log('[Music LLM] 大模型返回的音乐风格是:', cleaned);
        return cleaned;
    };

    const buildUserCharBlendKeyword = () => {
        const recent = Array.isArray(music.recents) ? music.recents[0] : null;
        const recentTitle = String(recent?.title || recent?.name || '').trim();
        const tags = Array.isArray(activeChar.value?.tags) ? activeChar.value.tags.filter(Boolean) : [];
        const tag = tags.length ? String(tags[Math.floor(Math.random() * tags.length)] || '').trim() : '';
        const keyword = `${recentTitle} ${tag}`.trim();
        return keyword || null;
    };

    const buildFallbackHomePlaylists = () => ([
        {
            id: 'home-rec-1',
            title: togetherTitle.value,
            editableTitle: true,
            owner: 'user+char',
            description: '基于你和 Char 的共同历史生成',
            source: 'home',
            cover: MUSIC_COVER_PLACEHOLDER,
            songs: playlist.slice(0, 6).map(normalizeSong),
            added: false
        },
        {
            id: 'home-char-1',
            title: `${currentCharacterName.value} 的歌单`,
            editableTitle: false,
            owner: 'char',
            description: '由 Char 人设与共同听歌历史逐渐同频生成',
            source: 'home',
            cover: MUSIC_COVER_PLACEHOLDER,
            songs: playlist.slice(2, 8).map(normalizeSong),
            added: false
        }
    ]);

    const parsePlaylistAIResult = (raw) => {
        const text = String(raw || '').trim();
        if (!text) return null;
        const jsonMatch = text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/);
        const candidate = jsonMatch ? jsonMatch[0] : text;
        try {
            const parsed = JSON.parse(candidate);
            return Array.isArray(parsed) ? parsed : parsed?.playlists || parsed?.data || null;
        } catch {
            return null;
        }
    };

    const buildPlaylistsPrompt = () => `你在为一个带有虚拟角色陪伴功能的音乐应用生成首页歌单。
请严格输出 JSON 数组，不要解释，不要 Markdown，不要代码块。
数组必须包含 2 个对象，每个对象字段如下：
- id: 字符串
- title: 歌单名
- editableTitle: 布尔值
- owner: user+char 或 char
- description: 一句话简介
- songs: 数组，元素字段包含 id,title,artist,cover,duration,genre,mood,source,lyric,src
要求：
1. 第一个对象是“推荐歌单”，editableTitle 必须为 true，title 默认使用「想和${currentCharacterName.value}听的歌」，内容基于用户与 ${currentCharacterName.value} 的共同听歌历史。
2. 第二个对象是「${currentCharacterName.value} 的歌单」，editableTitle 必须为 false，内容基于 ${currentCharacterName.value} 的人设和共同听歌历史逐渐同频生成。
3. songs 至少各 4 首，尽量使用真实歌曲信息；如果无法确定，使用当前已知歌单里的歌曲补全。
4. 只输出可解析 JSON。`;

    const music = reactive({
        activeIndex: 0,
        isPlaying: false,
        isLoading: false,
        activeTab: 'home',
        showPlaylist: false,
        showLyrics: true,
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
        homePlaylists: buildFallbackHomePlaylists(),
        recommendedPlaylists: safeJsonParse(safeLocalStorageGet(MUSIC_HOME_RECOMMENDED_KEY), []),
        charPlaylists: safeJsonParse(safeLocalStorageGet(MUSIC_HOME_CHAR_KEY), []),
        togetherQueue: [],
        togetherComments: safeJsonParse(safeLocalStorageGet(MUSIC_CHAT_HISTORY_KEY), [
            { type: 'char', text: '这首歌像是深夜里一盏没有说话的灯。' },
            { type: 'user', text: '我想把这种感觉留在一起听列表里。' },
            { type: 'char', text: '那就让它慢慢和我们同频。' }
        ]),
        roamQuotes: [
            '让音乐替你先开口。',
            '把没说出口的话，交给旋律。',
            '每个夜晚都值得一首歌。'
        ],
        profileStats: {
            liked: 0,
            created: 1,
            recent: 0
        },
        lastPlaylistRefreshAt: 0
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
    const persistChatHistory = () => safeLocalStorageSet(MUSIC_CHAT_HISTORY_KEY, JSON.stringify(music.togetherComments.slice(0, 50)));
    const persistHomePlaylists = () => {
        safeLocalStorageSet(MUSIC_HOME_RECOMMENDED_KEY, JSON.stringify((music.recommendedPlaylists || []).slice(0, 30)));
        safeLocalStorageSet(MUSIC_HOME_CHAR_KEY, JSON.stringify((music.charPlaylists || []).slice(0, 30)));
    };

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
        if (isLoadingLyrics) return;
        isLoadingLyrics = true;
        try {
            music.lyricsText = song?.lyric || '';
            music.lyricLines = buildLyricsPreview(music.lyricsText);
            activeLyricIndex.value = -1;
            const lyrics = await getLyricsForSong(song);
            if (songKey(song) !== songKey(currentTrack.value)) return;
            music.lyricsText = lyrics || song?.lyric || '';
            music.lyricLines = buildLyricsPreview(music.lyricsText);
            await nextTick();
        } finally {
            isLoadingLyrics = false;
        }
    };

    const enrichSongMetadata = async (song) => {
        if (!song?.id || song.source !== 'netease') return normalizeSong(song);
        const detail = await getSongDetail(song.id);
        if (!detail) return normalizeSong(song);
        const artists = Array.isArray(detail.ar || detail.artists)
            ? (detail.ar || detail.artists).map((artist) => artist.name).filter(Boolean).join(' / ')
            : song.artist;
        return normalizeSong({
            ...song,
            title: detail.name || song.title,
            artist: artists || song.artist,
            cover: addCoverParam(detail.al?.picUrl || detail.al?.pic || detail.picUrl || song.cover),
            duration: detail.dt ? formatTime(detail.dt / 1000) : song.duration,
            album: detail.al?.name || detail.album?.name || song.album || ''
        });
    };

    const playSong = async (song, { addToQueue = true } = {}) => {
        const normalized = await enrichSongMetadata(normalizeSong(song));
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
            console.warn('[Music] No playable URL for song:', normalized);
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
            console.warn('[Music] audioRef is not ready');
            return false;
        }

        try {
            el.pause();
            el.currentTime = 0;
            el.removeAttribute('src');
            el.load();
            await nextTick();

            el.src = url;
            el.volume = music.volume;
            el.muted = false;
            el.playbackRate = 1;
            el.preload = 'auto';
            el.load();
            await nextTick();

            await el.play();
            music.isPlaying = true;
            addRecent(normalized);
            return true;
        } catch (error) {
            music.isPlaying = false;
            music.playError = '浏览器阻止自动播放或音源失效，请手动点播放/换歌。';
            console.error('[Music] play failed:', error, { song: normalized, url });
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
        music.isLoading = false;
    };

    const toggleMusicPlayPause = async () => {
        if (music.isPlaying) {
            pause();
            return;
        }
        await playCurrent();
    };

    const fetchPlaylistsFromAPI = async () => {
        music.searchLoading = true;
        music.searchError = '';
        try {
            const profile = getEffectiveApiProfile();
            const status = apiStatus?.value ?? apiStatus;
            let charKeyword = '';

            if (profile?.endpoint && profile?.key && profile?.model && (status === 'valid' || status == null)) {
                try {
                    charKeyword = await fetchVibeFromLLM(activeChar.value?.persona || '', profile);
                } catch (error) {
                    console.error('[Music LLM] 请求失败:', error);
                    charKeyword = '';
                }
            }

            if (!charKeyword) {
                charKeyword = pickCharKeywords();
            }

            const blendKeyword = buildUserCharBlendKeyword();

            if (!charKeyword) {
                music.charPlaylists = [];
            }
            if (!blendKeyword) {
                music.recommendedPlaylists = [];
            }

            if (!charKeyword && !blendKeyword) {
                music.homePlaylists = [
                    {
                        id: 'home-rec-empty',
                        title: togetherTitle.value,
                        editableTitle: true,
                        owner: 'user+char',
                        description: 'empty',
                        source: 'none',
                        cover: MUSIC_COVER_PLACEHOLDER,
                        songs: [],
                        added: false
                    },
                    {
                        id: 'home-char-empty',
                        title: `${currentCharacterName.value} 的专属歌单`,
                        editableTitle: false,
                        owner: 'char',
                        description: 'empty',
                        source: 'none',
                        cover: MUSIC_COVER_PLACEHOLDER,
                        songs: [],
                        added: false
                    }
                ];
                music.lastPlaylistRefreshAt = Date.now();
                return music.homePlaylists;
            }

            const [recommendedSongs, charSongs] = await Promise.all([
                blendKeyword ? searchNeteaseSongs(blendKeyword) : Promise.resolve([]),
                charKeyword ? searchNeteaseSongs(charKeyword) : Promise.resolve([])
            ]);

            const recSongs = (recommendedSongs || []).slice(0, 6).map(normalizeSong);
            const charPlaylistSongs = (charSongs || []).slice(0, 6).map(normalizeSong);

            music.recommendedPlaylists = recSongs;
            music.charPlaylists = charPlaylistSongs;

            music.homePlaylists = [
                {
                    id: 'home-rec-live',
                    title: togetherTitle.value,
                    editableTitle: true,
                    owner: 'user+char',
                    description: `根据你的最近播放与 ${currentCharacterName.value} 的标签同频生成`,
                    source: 'netease',
                    cover: recSongs[0]?.cover || MUSIC_COVER_PLACEHOLDER,
                    songs: recSongs,
                    added: false
                },
                {
                    id: 'home-char-live',
                    title: `${currentCharacterName.value} 的专属歌单`,
                    editableTitle: false,
                    owner: 'char',
                    description: `关键词：${charKeyword}`,
                    source: 'netease',
                    cover: charPlaylistSongs[0]?.cover || MUSIC_COVER_PLACEHOLDER,
                    songs: charPlaylistSongs,
                    added: false
                }
            ];

            if (!recSongs.length && !charPlaylistSongs.length) {
                music.searchError = '未搜索到匹配歌曲，已回退默认歌单。';
                music.homePlaylists = buildFallbackHomePlaylists();
            }

            music.lastPlaylistRefreshAt = Date.now();
            return music.homePlaylists;
        } catch (error) {
            music.searchError = `刷新歌单失败：${error?.message || '未知错误'}`;
            music.homePlaylists = buildFallbackHomePlaylists();
            music.lastPlaylistRefreshAt = Date.now();
            return music.homePlaylists;
        } finally {
            music.searchLoading = false;
        }
    };

    const changeChar = () => {
        const list = Array.isArray(workshopCharacters) ? workshopCharacters : [];
        if (!list.length) return;
        const currentId = activeChar.value?.id;
        const currentIndex = Math.max(0, list.findIndex((item) => item?.id === currentId));
        const next = list[(currentIndex + 1) % list.length];
        activeChar.value = next || activeChar.value;
        music.roamIndex = (music.roamIndex + 1) % music.roamQuotes.length;
        void fetchPlaylistsFromAPI();
        return activeChar.value;
    };

    const addToTogetherQueue = (playlistItem) => {
        if (!playlistItem) return;
        const normalized = {
            ...playlistItem,
            songs: Array.isArray(playlistItem.songs) ? playlistItem.songs.map(normalizeSong) : []
        };
        const key = `${normalized.source}:${normalized.id}`;
        const exists = music.togetherQueue.some((item) => `${item.source}:${item.id}` === key);
        if (!exists) music.togetherQueue = [...music.togetherQueue, normalized];
    };

    const sendMusicChatMessage = async (text, role = 'user') => {
        const content = String(text || '').trim();
        if (!content) return null;
        music.togetherComments = [...music.togetherComments, { type: role === 'char' ? 'char' : 'user', text: content }].slice(-50);
        persistChatHistory();
        return content;
    };

    const askMusicCharComment = async (song = currentTrack.value) => {
        const profile = activeProfile;
        const prompt = `你是一个陪用户一起听歌的虚拟角色 ${currentCharacterName.value}。请围绕当前歌曲写一句简短、富有情绪的乐评，风格像深夜聊天。只输出一句中文，不要列表，不要解释。歌曲名：${song?.title || ''}；歌手：${song?.artist || ''}。`;
        if (!profile?.endpoint || !profile?.key) {
            const fallback = `${currentCharacterName.value} 觉得这首歌像一段慢慢落下的夜色。`;
            await sendMusicChatMessage(fallback, 'char');
            return fallback;
        }
        try {
            const reply = await callAI(profile, [
                { role: 'system', content: '你是一个会和用户一起听歌的虚拟角色，只用自然口语输出一句简短乐评。' },
                { role: 'user', content: prompt }
            ], { temperature: 0.85, max_tokens: 120 });
            const clean = String(reply || '').replace(/^[-*\s]+/, '').trim();
            await sendMusicChatMessage(clean || prompt, 'char');
            return clean;
        } catch (error) {
            console.error('[Music] askMusicCharComment failed:', error);
            const fallback = `${currentCharacterName.value} 说：这首歌像是把没说出口的话都轻轻放下了。`;
            await sendMusicChatMessage(fallback, 'char');
            return fallback;
        }
    };

    const renameHomePlaylist = (playlistItem, title) => {
        if (!playlistItem?.editableTitle) return;
        playlistItem.title = String(title || '').trim() || playlistItem.title;
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

    const scrollToActiveLyric = () => {
        nextTick(() => {
            const container = lyricsScrollBox.value;
            const activeLine = container?.querySelector('.lyric-line.active');
            if (container && activeLine) {
                const scrollTarget = activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2;
                container.scrollTo({
                    top: scrollTarget,
                    behavior: 'smooth'
                });
            }
        });
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
            if (activeLyricIndex.value !== idx) {
                activeLyricIndex.value = idx;
                if (music.showLyrics) scrollToActiveLyric();
            }
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
        console.error('[Music] audio element error', audioRef.value?.error || null);
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

    const playPlaylistItem = async (playlistItem) => {
        if (!playlistItem?.songs?.length) return;
        music.activeTab = 'discover';
        music.playlist.splice(0, music.playlist.length, ...playlistItem.songs.map(normalizeSong).slice(0, 80));
        music.activeIndex = 0;
        await playCurrent();
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
            const seen = new Set();
            const results = netease.filter((song) => {
                const key = songKey(song);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            music.searchResults = results;
            if (!results.length) music.searchError = '没有搜到网易云结果，换个关键词试试。';
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
        void loadLyrics(currentTrack.value);
    }, { flush: 'post' });

    watch(() => music.showLyrics, (newVal) => {
        if (newVal) {
            scrollToActiveLyric();
        }
    });

    watch(currentTrack, (song) => {
        if (!song?.cover || song.cover === MUSIC_COVER_PLACEHOLDER) return;
        const el = audioRef.value;
        if (el && music.isPlaying) {
            el.volume = music.volume;
        }
    }, { deep: true, flush: 'post' });

    syncProfileStats();
    nextTick(() => {
        loadLyrics(currentTrack.value);
    });

    return {
        music,
        playlist: music.playlist,
        audioRef,
        currentTrack,
        progressPercent,
        currentTimeText,
        durationText,
        activeLyricIndex,
        lyricsScrollBox,
        scrollToActiveLyric,
        isCurrentFavorite,
        filteredSongs,
        fetchPlaylistsFromAPI,
        changeChar,
        askMusicCharComment,
        renameHomePlaylist,
        addToTogetherQueue,
        sendMusicChatMessage,
        askMusicCharComment,
        playPrevious,
        playNext,
        toggleMusicPlayPause,
        playSong,
        playFromSearch,
        playPlaylistItem,
        playFromQueue,
        playSavedSong,
        addToQueue,
        toggleFavorite,
        searchOnlineSongs,
        clearSearch,
        seekFromEvent,
        setVolume,
        cycleRepeatMode,
        playPlaylistItem,
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
        currentCharacterName,
        togetherTitle,
        activeChar,
    };
}

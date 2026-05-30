import { computed, nextTick, reactive, ref, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { callAI } from './api.js';
const safeLocalStorageGet = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeLocalStorageSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch {}
};

const MUSIC_COVER_PLACEHOLDER = '404.png';
const MUSIC_COOKIE_KEY = 'soulpocket_netease_cookie';
// 彻底清空，不再把 VIP 凭证暴露在前端
const HARDCODED_NETEASE_COOKIE = ''; 
// 初始化时优先尝试读取本地缓存的普通用户登录态（如果有的话）
const myVipCookie = ref(safeLocalStorageGet(MUSIC_COOKIE_KEY) || HARDCODED_NETEASE_COOKIE);
const updateNeteaseCookie = (newCookie) => {
    myVipCookie.value = newCookie; // 注意这里加了 .value
    safeLocalStorageSet(MUSIC_COOKIE_KEY, newCookie);
};

const MUSIC_API_BASE = 'https://www.biumusic-ap.site';
const MUSIC_FAVORITES_KEY = 'soulpocket_music_favorites_v1';
const MUSIC_RECENTS_KEY = 'soulpocket_music_recents_v1';
const MUSIC_QUEUE_KEY = 'soulpocket_music_queue_v1';
const MUSIC_VOLUME_KEY = 'soulpocket_music_volume_v1';
const MUSIC_CHAT_HISTORY_KEY = 'soulpocket_music_chat_history_v1';
const MUSIC_HOME_RECOMMENDED_KEY = 'soulpocket_music_home_recommended_v1';
const MUSIC_HOME_CHAR_KEY = 'soulpocket_music_home_char_v1';
const MUSIC_JOURNAL_MAP_KEY = 'soulpocket_music_journal_map_v1';

const DEMO_PLAYLIST = [
  { id: 'demo-middle', title: 'The Middle', artist: 'Dream Tunes', duration: '03:42', genre: 'indie', lyric: 'You are the middle of my night', mood: '推荐', source: 'demo', cover: MUSIC_COVER_PLACEHOLDER, src: 'https://files.catbox.moe/4bugg1.mp3' },
  { id: 'demo-neon', title: 'Soft Neon', artist: 'Milo', duration: '03:08', genre: 'pop', lyric: 'Neon lights are breathing slow', mood: '发现', source: 'demo', cover: MUSIC_COVER_PLACEHOLDER, src: 'https://files.catbox.moe/4bugg1.mp3' },
  { id: 'demo-rain', title: 'After Rain', artist: 'Iris', duration: '04:16', genre: 'ambient', lyric: 'The city learns to whisper', mood: '漫游', source: 'demo', cover: MUSIC_COVER_PLACEHOLDER, src: 'https://files.catbox.moe/4bugg1.mp3' }
];

const safeJsonParse = (raw, fallback) => {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};

const normalizeSong = (song = {}) => {
  const source = song.source || 'local';
  const title = song.title || song.name || 'Untitled';
  const artist = song.artist || song.singer || 'Unknown Artist';
  const id = song.id != null ? String(song.id) : `${source}_${title}_${artist}`;
  const cover = song.cover || song.pic || song.picUrl || song.al?.picUrl || MUSIC_COVER_PLACEHOLDER;
  return {
    ...song,
    id,
    source,
    title,
    name: title,
    artist,
    cover,
    duration: song.duration || '--:--',
    genre: song.genre || source,
    mood: song.mood || (source === 'demo' ? '内置' : '在线'),
    lyric: song.lyric || '歌词加载中，或暂无歌词。',
    src: song.src || song.url || ''
  };
};

const songKey = (song) => `${song?.source || ''}:${song?.id || ''}:${song?.title || ''}:${song?.artist || ''}`;
const formatTime = (sec) => `${String(Math.floor((sec || 0) / 60)).padStart(2, '0')}:${String(Math.floor((sec || 0) % 60)).padStart(2, '0')}`;

const requestJson = async (path) => {
  const resp = await fetch(`${MUSIC_API_BASE}${path}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
};

const LYRIC_SYNC_OFFSET_SEC = 0.32;
const LYRIC_SCROLL_ANCHOR = 0.42;

const parseLrc = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return [];
  const metaPattern = /^(作词|作曲|编曲|制作人|混音|母带|录音|监制|词\s*[:：]|曲\s*[:：]|Lyricist|Composer|Arranger|Producer)\b/i;
  const lines = [];
  text.split(/\r?\n/).forEach((line) => {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g)];
    const content = line.replace(/\[[^\]]+\]/g, '').trim();
    if (!matches.length || !content) return;
    if (metaPattern.test(content)) return;
    matches.forEach((m) => lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + Number(String(m[3] || '0').padEnd(3, '0')) / 1000, text: content }));
  });
  return lines.sort((a, b) => a.time - b.time);
};

const buildLyricsPreview = (lyricsText, fallbackText = '暂无逐字歌词，先享受这一首。') => {
  const parsed = parseLrc(lyricsText);
  if (parsed.length) return parsed;
  const plain = String(lyricsText || '').trim();
  if (!plain) return [{ time: 0, text: fallbackText }];
  const segments = plain.split(/[\n。！？!?]/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
  if (!segments.length) return [{ time: 0, text: fallbackText }];
  return segments.map((text, i) => ({ time: i * 4, text }));
};

const searchNeteaseSongs = async (query) => {
  const q = String(query || '').trim();
  if (!q) return [];
  try {
    const data = await requestJson(`/cloudsearch?keywords=${encodeURIComponent(q)}&limit=30`);
    const songs = data?.result?.songs || [];
    return songs.map((song) => normalizeSong({
      id: song.id,
      title: song.name,
      artist: Array.isArray(song.ar) ? song.ar.map((a) => a.name).join(' / ') : 'Unknown Artist',
      cover: song.al?.picUrl || MUSIC_COVER_PLACEHOLDER,
      duration: song.dt ? formatTime(song.dt / 1000) : '--:--',
      source: 'netease',
      mood: '网易云'
    }));
  } catch {
    return [];
  }
};

const getPlayableUrl = async (song) => {
  if (!song) return '';
  if (song.src) return song.src;
  if (song.source !== 'netease') return '';

  const ensureHttps = (url) => String(url || '').trim().replace(/^http:\/\//i, 'https://');
  const cookieParam = ''; 
  const cookieHeader = {};

  try {
    const v1 = await fetch(`${MUSIC_API_BASE}/song/url/v1?id=${encodeURIComponent(song.id)}&level=exhigh&realIP=116.25.146.177${cookieParam}`, {
      headers: cookieHeader
    }).then(async (resp) => {
      const text = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      try { return JSON.parse(text); } catch { throw new Error(`非 JSON 响应: ${text.slice(0, 200)}`); }
    });
    
    const songData = v1?.data?.[0];
    if (songData) {
      if (songData.freeTrialInfo || songData.fee === 1 || songData.fee === 4) {
         console.warn('[music] 只有30秒试听权限');
      }
      
      const url1 = ensureHttps(songData.url);
      console.log('[music] song/url/v1 result', {
        id: song.id,
        source: song.source,
        hasCookie: false, // 👈 已经修复：不再引用不存在的变量
        url: url1 || '',
        br: songData.br,
        level: songData.level,
        size: songData.size,
        fee: songData.fee,
        flag: songData.flag,
        code: v1?.code
      });
      
      if (url1) return url1;
    } 
  } catch (error) {
    console.warn('[music] song/url/v1 failed', error);
  }
  
  try {
    const fallback = await fetch(`${MUSIC_API_BASE}/song/url?id=${encodeURIComponent(song.id)}&br=320000&realIP=116.25.146.177${cookieParam}`, {
      headers: cookieHeader
    }).then(async (resp) => {
      const text = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      try { return JSON.parse(text); } catch { throw new Error(`非 JSON 响应: ${text.slice(0, 200)}`); }
    });
    const url2 = ensureHttps(fallback?.data?.[0]?.url || fallback?.data?.url);
    console.log('[music] song/url fallback result', {
      id: song.id,
      source: song.source,
      hasCookie: false, // 👈 已经修复：不再引用不存在的变量
      url: url2 || fallback?.data?.[0]?.url || fallback?.data?.url || '',
      br: fallback?.data?.[0]?.br,
      level: fallback?.data?.[0]?.level,
      size: fallback?.data?.[0]?.size,
      fee: fallback?.data?.[0]?.fee,
      flag: fallback?.data?.[0]?.flag,
      code: fallback?.code
    });
    if (url2) return url2;
  } catch (error) {
    console.warn('[music] song/url fallback failed', error);
  }

  return '';
};

const getLyricsForSong = async (song) => {
  if (!song?.id || song.source !== 'netease') return song?.lyric || '';
  try {
    const data = await requestJson(`/lyric?id=${encodeURIComponent(song.id)}`);
    return data?.lrc?.lyric || song.lyric || '';
  } catch {
    return song?.lyric || '';
  }
};

const getSongComments = async (song) => {
  if (!song?.id || song.source !== 'netease') return [];
  try {
    const pageSize = 50;
    let pageNo = 1;
    let total = Infinity;
    const all = [];

    while (all.length < total) {
      const data = await requestJson(`/comment/music?id=${encodeURIComponent(song.id)}&limit=${pageSize}&pageNo=${pageNo}&sortType=2`);
      const list = Array.isArray(data?.comments) ? data.comments : (Array.isArray(data?.hotComments) ? data.hotComments : []);
      total = Number.isFinite(Number(data?.total)) ? Number(data.total) : (list.length < pageSize ? all.length + list.length : Infinity);
      if (!list.length) break;
      all.push(...list);
      if (list.length < pageSize) break;
      pageNo += 1;
      if (pageNo > 200) break;
    }

    return all;
  } catch {
    return [];
  }
};

export function useMusic({ characters = [], currentCharacter = null, activeProfile = null, chatHistorySource = null } = {}) {
  const savedQueue = safeJsonParse(safeLocalStorageGet(MUSIC_QUEUE_KEY), null);
  const playlist = reactive(Array.isArray(savedQueue) && savedQueue.length ? savedQueue.map(normalizeSong).slice(0, 80) : DEMO_PLAYLIST.map(normalizeSong));

  const audioRef = ref(null);
  const searchTimer = ref(null);
  const activeLyricIndex = ref(-1);
  const lyricsScrollBox = ref(null);

  const charGeneratedPlaylists = reactive({});
  const journalMap = ref(safeJsonParse(safeLocalStorageGet(MUSIC_JOURNAL_MAP_KEY), {}));
  const musicPetX = ref(18);
  const musicPetY = ref(110);
  const musicPetDragging = ref(false);
  const musicPetDragOffsetX = ref(0);
  const musicPetDragOffsetY = ref(0);
  const musicPetRotation = ref(0);
  const persistJournalMap = () => safeLocalStorageSet(MUSIC_JOURNAL_MAP_KEY, JSON.stringify(journalMap.value || {}));
  const setJournalForSong = (song, patch = {}) => {
    const key = songKey(song);
    if (!key) return;
    const prev = journalMap.value?.[key] || {};
    journalMap.value = { ...journalMap.value, [key]: { ...prev, ...patch } };
    persistJournalMap();
  };

  const music = reactive({
    activeIndex: 0, isPlaying: false, isLoading: false,
    activeTab: 'home', showPlaylist: false, showLyrics: true, viewMode: 'default', currentSubPage: null,
    searchText: '', playlist, searchResults: [], searchLoading: false, searchError: '', playError: '',
    currentTime: 0, durationSeconds: 0, volume: Number(safeLocalStorageGet(MUSIC_VOLUME_KEY)) || 0.82,
    repeatMode: 'list', shuffle: false,
    favorites: safeJsonParse(safeLocalStorageGet(MUSIC_FAVORITES_KEY), []),
    recents: safeJsonParse(safeLocalStorageGet(MUSIC_RECENTS_KEY), []),
    lyricsText: '', lyricLines: [], activeLyricIndex: -1, lyricTranslateY: 0,
    togetherComments: safeJsonParse(safeLocalStorageGet(MUSIC_CHAT_HISTORY_KEY), [
      { type: 'char', text: '这首歌像是深夜里一盏没有说话的灯。' },
      { type: 'user', text: '我想把这种感觉留在一起听列表里。' },
      { type: 'char', text: '那就让它慢慢和我们同频。' }
    ]),
    publicCommentsLoading: false,
    publicComments: [],
    publicCommentsSongKey: '',
    homePlaylists: [],
    recommendedPlaylists: safeJsonParse(safeLocalStorageGet(MUSIC_HOME_RECOMMENDED_KEY), []),
    charPlaylists: safeJsonParse(safeLocalStorageGet(MUSIC_HOME_CHAR_KEY), []),
    roamQuotes: ['让音乐替你先开口。', '把没说出口的话，交给旋律。', '每个夜晚都值得一首歌。'],
    roamIndex: 0,
    profileStats: { liked: 0, created: 1, recent: 0 },
    aiGeneratingCharId: '',
    aiGenerateStatusByChar: {},
    aiJournalLoading: false,
    aiJournalText: '',
    myJournalInput: '',
    myJournalReply: '',
    aiJournalTime: '',
    myInsightText: '',
    myInsightReply: '',
    wanderInput: '',
    wanderMessages: [],
    wanderEmojiOpen: false,
    wanderQuoteMsg: null,

    // 登录状态
    loginState: {
        isModalOpen: false,
        qrImg: '',
        statusMsg: '',
        pollTimer: null
    }
  });

  // 统一登录逻辑
  const openLoginModal = async () => {
      music.loginState.isModalOpen = true;
      music.loginState.qrImg = '';
      music.loginState.statusMsg = '正在生成安全二维码...';
      if (music.loginState.pollTimer) clearInterval(music.loginState.pollTimer);

      try {
          const keyRes = await requestJson(`/login/qr/key?timestamp=${Date.now()}`);
          const unikey = keyRes?.data?.unikey;
          if (!unikey) throw new Error('获取Key失败');

          const qrRes = await requestJson(`/login/qr/create?key=${unikey}&qrimg=true&timestamp=${Date.now()}`);
          music.loginState.qrImg = qrRes?.data?.qrimg;
          music.loginState.statusMsg = '请使用网易云音乐 APP 扫码';

          music.loginState.pollTimer = setInterval(async () => {
              try {
                  const res = await requestJson(`/login/qr/check?key=${unikey}&timestamp=${Date.now()}`);
                  if (res.code === 800) {
                      music.loginState.statusMsg = '二维码已过期，请重新打开弹窗';
                      clearInterval(music.loginState.pollTimer);
                  } else if (res.code === 803) {
                      clearInterval(music.loginState.pollTimer);
                      music.loginState.statusMsg = '登录成功！';
                      updateNeteaseCookie(res.cookie);
                      setTimeout(() => { closeLoginModal(); }, 1500);
                  }
              } catch (e) {}
          }, 3000);
      } catch (error) {
          music.loginState.statusMsg = '生成失败，请重试';
      }
  };

  const closeLoginModal = () => {
      music.loginState.isModalOpen = false;
      if (music.loginState.pollTimer) clearInterval(music.loginState.pollTimer);
  };

  const logoutNetease = () => {
      updateNeteaseCookie('');
      alert('已清除网易云账号授权');
  };

// 👇 4. 保持 Cookie 状态同步
watch(myVipCookie, (newVal) => {
    music.myVipCookie = newVal;
}, { immediate: true });


  const currentTrack = computed(() => music.playlist[music.activeIndex] || music.playlist[0] || normalizeSong({}));
  const progressPercent = computed(() => music.durationSeconds ? Math.min(100, Math.max(0, (music.currentTime / music.durationSeconds) * 100)) : 0);
  const currentTimeText = computed(() => formatTime(music.currentTime));
  const durationText = computed(() => currentTrack.value?.duration || formatTime(music.durationSeconds));
  const isCurrentFavorite = computed(() => music.favorites.some((s) => songKey(s) === songKey(currentTrack.value)));
  const filteredSongs = computed(() => {
    const keyword = music.searchText.trim().toLowerCase();
    const base = music.searchResults.length ? music.searchResults : music.playlist;
    if (!keyword || music.searchResults.length) return base;
    return base.filter((s) => [s.title, s.artist, s.genre, s.mood].some((v) => String(v || '').toLowerCase().includes(keyword)));
  });

  const persistQueue = () => safeLocalStorageSet(MUSIC_QUEUE_KEY, JSON.stringify(music.playlist.slice(0, 80)));
  const persistFavorites = () => safeLocalStorageSet(MUSIC_FAVORITES_KEY, JSON.stringify(music.favorites.slice(0, 200)));
  const persistRecents = () => safeLocalStorageSet(MUSIC_RECENTS_KEY, JSON.stringify(music.recents.slice(0, 50)));
  const persistChatHistory = () => safeLocalStorageSet(MUSIC_CHAT_HISTORY_KEY, JSON.stringify(music.togetherComments.slice(0, 50)));
  const persistHomePlaylists = () => {
    safeLocalStorageSet(MUSIC_HOME_RECOMMENDED_KEY, JSON.stringify((music.recommendedPlaylists || []).slice(0, 30)));
    safeLocalStorageSet(MUSIC_HOME_CHAR_KEY, JSON.stringify((music.charPlaylists || []).slice(0, 30)));
  };

  const syncProfileStats = () => { music.profileStats.liked = music.favorites.length; music.profileStats.recent = music.recents.length; };
  const addRecent = (song) => {
    const n = normalizeSong(song); const key = songKey(n);
    music.recents = [n, ...music.recents.filter((i) => songKey(i) !== key)].slice(0, 30);
    persistRecents(); syncProfileStats();
  };

  const loadLyrics = async (song) => {
    music.lyricsText = song?.lyric || '';
    music.lyricLines = buildLyricsPreview(music.lyricsText);
    activeLyricIndex.value = -1;
    music.activeLyricIndex = -1;
    const lyrics = await getLyricsForSong(song);
    if (songKey(song) !== songKey(currentTrack.value)) return;
    music.lyricsText = lyrics || song?.lyric || '';
    music.lyricLines = buildLyricsPreview(music.lyricsText);
    activeLyricIndex.value = -1;
    music.activeLyricIndex = -1;
  };

  const applySongJournal = (song) => {
    const data = journalMap.value?.[songKey(song)] || {};
    const currentCharId = String(currentCharacter?.value?.id || currentCharacter?.id || '');
    const savedCharId = String(data.charId || '');
    if (!data?.aiJournalText || (savedCharId && currentCharId && savedCharId !== currentCharId)) {
      music.aiJournalText = '';
      music.aiJournalTime = '';
      music.myJournalInput = '';
      music.myJournalReply = '';
      return;
    }
    music.aiJournalText = data.aiJournalText || '';
    music.aiJournalTime = data.aiJournalTime || '';
    music.myJournalInput = '';
    music.myJournalReply = data.myInsightReply || '';
  };

  const getWanderKey = () => `${String(currentCharacter?.value?.id || currentCharacter?.id || currentCharacter?.value?.nickname || currentCharacter?.nickname || currentCharacter?.value?.name || currentCharacter?.name || 'char')}::${songKey(currentTrack.value)}`;
  const persistWanderMessages = () => {
    const key = getWanderKey();
    const saved = safeJsonParse(safeLocalStorageGet(MUSIC_JOURNAL_MAP_KEY + '_wander'), {});
    saved[key] = Array.isArray(music.wanderMessages) ? music.wanderMessages.slice(-100) : [];
    safeLocalStorageSet(MUSIC_JOURNAL_MAP_KEY + '_wander', JSON.stringify(saved));
  };
  const loadWanderMessages = () => {
    const raw = safeLocalStorageGet(MUSIC_JOURNAL_MAP_KEY + '_wander');
    const saved = safeJsonParse(raw, {});
    const key = getWanderKey();
    music.wanderMessages = Array.isArray(saved[key]) ? saved[key] : [];
  };
  const syncWanderMessages = () => {
    const key = getWanderKey();
    const saved = safeJsonParse(safeLocalStorageGet(MUSIC_JOURNAL_MAP_KEY + '_wander'), {});
    saved[key] = Array.isArray(music.wanderMessages) ? music.wanderMessages.slice(-100) : [];
    safeLocalStorageSet(MUSIC_JOURNAL_MAP_KEY + '_wander', JSON.stringify(saved));
  };
  const pushWanderMessage = (msg) => {
    music.wanderMessages = [...music.wanderMessages, msg].slice(-100);
    persistWanderMessages();
  };
  const wanderMessages = computed({
    get: () => music.wanderMessages,
    set: (val) => { music.wanderMessages = Array.isArray(val) ? val : []; }
  });
  const wanderInput = computed({
    get: () => music.wanderInput,
    set: (val) => { music.wanderInput = val; }
  });
  const wanderEmojiOpen = computed({
    get: () => music.wanderEmojiOpen,
    set: (val) => { music.wanderEmojiOpen = !!val; }
  });
  const wanderQuoteMsg = computed({
    get: () => music.wanderQuoteMsg,
    set: (val) => { music.wanderQuoteMsg = val; }
  });
  const insertWanderEmoji = (emoji) => {
    music.wanderInput = `${music.wanderInput || ''}${emoji || ''}`;
    music.wanderEmojiOpen = false;
  };
  const getMusicPetPos = (evt) => {
    const p = evt?.touches?.[0] || evt?.changedTouches?.[0] || evt;
    return { x: p?.clientX || 0, y: p?.clientY || 0 };
  };
  const startMusicPetDrag = (evt) => {
    const p = getMusicPetPos(evt);
    musicPetDragging.value = true;
    musicPetDragOffsetX.value = p.x - musicPetX.value;
    musicPetDragOffsetY.value = p.y - musicPetY.value;
    const move = (e) => {
      if (!musicPetDragging.value) return;
      const pt = getMusicPetPos(e);
      musicPetX.value = Math.max(8, Math.min(window.innerWidth - 76, pt.x - musicPetDragOffsetX.value));
      musicPetY.value = Math.max(72, Math.min(window.innerHeight - 140, pt.y - musicPetDragOffsetY.value));
      musicPetRotation.value = (musicPetRotation.value + 2) % 360;
    };
    const up = () => {
      musicPetDragging.value = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  };
  const sendWanderMessage = async () => {
    const text = String(music.wanderInput || '').trim();
    if (!text) return;
    const profile = activeProfile?.value || activeProfile;
    const role = currentCharacter?.value || currentCharacter || {};
    const name = role?.nickname || role?.name || 'Kumo';
    const persona = String(role?.persona || role?.description || role?.summary || '').trim();
    const quoted = music.wanderQuoteMsg;
    const userMsg = { id: Date.now(), sender: 'user', senderName: '我', text, timestamp: Date.now(), isReplied: false, quoteFrom: quoted ? `${quoted.senderName || '对方'}：${quoted.text || ''}` : '' };
    pushWanderMessage(userMsg);
    music.wanderInput = '';
    music.wanderQuoteMsg = null;
    if (!profile?.endpoint || !profile?.key) return;
    music.aiJournalLoading = true;
    try {
      const reply = await callAI(profile, [
        { role: 'system', content: '你是在漫游页面里和用户聊天的虚拟角色。请像真人一样简短回复，1-3句，允许自然情绪和少量emoji，不要输出解释。' },
        { role: 'user', content: `角色名：${name}\n角色人设：${persona || '温柔、感性、陪伴型'}\n当前歌曲：${currentTrack.value?.title || ''} - ${currentTrack.value?.artist || ''}\n用户消息：${text}` }
      ], { temperature: 0.84, max_tokens: 180 });
      const aiText = String(reply || '').trim() || `${name}：我听见你了。`;
      pushWanderMessage({ id: Date.now() + 1, sender: 'ai', senderName: name, text: aiText, timestamp: Date.now() + 1, quoteFrom: quoted ? `${quoted.senderName || '对方'}：${quoted.text || ''}` : '' });
    } catch {
      pushWanderMessage({ id: Date.now() + 1, sender: 'ai', senderName: name, text: `${name}：刚刚那句话，我会记在心里。`, timestamp: Date.now() + 1 });
    } finally {
      music.aiJournalLoading = false;
    }
  };
  const quoteWanderMessage = (msg) => {
    if (!msg) return;
    music.wanderQuoteMsg = msg;
    music.wanderInput = `@${msg.senderName || '对方'} `;
  };
  const deleteWanderMessage = (msg) => {
    music.wanderMessages = music.wanderMessages.filter((m) => m.id !== msg?.id);
    persistWanderMessages();
  };
  const recallWanderMessage = (msg) => {
    if (!msg || msg.sender !== 'user') return;
    const now = Date.now();
    if (now - (msg.timestamp || msg.id) > 120000) return;
    music.wanderMessages = music.wanderMessages.filter((m) => m.id !== msg.id);
    persistWanderMessages();
  };

  const playSong = async (song, { addToQueue = true } = {}) => {
    const normalized = normalizeSong(song);
    music.playError = ''; music.isLoading = true;
    let idx = music.playlist.findIndex((i) => songKey(i) === songKey(normalized));
    if (idx < 0 && addToQueue) { music.playlist.push(normalized); idx = music.playlist.length - 1; persistQueue(); }
    if (idx >= 0) music.activeIndex = idx;

    const url = await getPlayableUrl(normalized);
    if (!url) { music.isLoading = false; music.isPlaying = false; music.playError = '暂时拿不到可播放链接'; return false; }

    normalized.src = url;
    if (idx >= 0) music.playlist[idx] = normalized;
    persistQueue();
    await loadLyrics(normalized);
    applySongJournal(normalized);
    await nextTick();

    const el = audioRef.value;
    if (!el) { music.isLoading = false; return false; }
    try {
      el.pause(); el.currentTime = 0;
      el.src = url; el.volume = music.volume;
      await el.play();
      music.isPlaying = true; addRecent(normalized);
      return true;
    } catch {
      music.isPlaying = false; music.playError = '播放失败，请手动点播放';
      return false;
    } finally {
      music.isLoading = false;
    }
  };

  const playCurrent = async () => playSong(currentTrack.value, { addToQueue: false });
  const pause = () => { if (audioRef.value) audioRef.value.pause(); music.isPlaying = false; };
  const toggleMusicPlayPause = async () => (music.isPlaying ? pause() : playCurrent());
  const playPrevious = async () => { if (!music.playlist.length) return; music.activeIndex = (music.activeIndex - 1 + music.playlist.length) % music.playlist.length; await playCurrent(); };
  const playNext = async () => { if (!music.playlist.length) return; music.activeIndex = (music.activeIndex + 1) % music.playlist.length; await playCurrent(); };

  const scrollToActiveLyric = () => {
    nextTick(() => {
      const container = lyricsScrollBox.value;
      const lines = container?.querySelectorAll('.lyric-line, .music-mini-lyric-line');
      const idx = Number.isFinite(activeLyricIndex.value) ? activeLyricIndex.value : -1;
      if (!(container && lines && lines.length && idx >= 0 && lines[idx])) return;

      const activeLine = lines[idx];
      const lineCenter = activeLine.offsetTop + activeLine.clientHeight / 2;
      const anchor = container.clientHeight * 0.45;
      music.lyricTranslateY = anchor - lineCenter;
    });
  };

  const onAudioTimeUpdate = () => {
    const el = audioRef.value; if (!el) return;
    music.currentTime = el.currentTime || 0;
    music.durationSeconds = Number.isFinite(el.duration) ? el.duration : music.durationSeconds;
    if (music.lyricLines.length) {
      let idx = -1;
      const t = Math.max(0, music.currentTime + LYRIC_SYNC_OFFSET_SEC);
      for (let i = 0; i < music.lyricLines.length; i += 1) {
        if ((music.lyricLines[i]?.time ?? 0) <= t) idx = i;
        else break;
      }
      activeLyricIndex.value = idx;
      music.activeLyricIndex = idx;
    } else {
      activeLyricIndex.value = -1;
      music.activeLyricIndex = -1;
    }
  };
  const onAudioLoadedMetadata = () => {
    const el = audioRef.value; if (!el) return;
    music.durationSeconds = Number.isFinite(el.duration) ? el.duration : 0;
  };
  const onAudioPlay = () => { music.isPlaying = true; music.isLoading = false; };
  const onAudioPause = () => { music.isPlaying = false; };
  const onAudioWaiting = () => { music.isLoading = true; };
  const onAudioCanPlay = () => { music.isLoading = false; };
  const onAudioError = () => { music.isLoading = false; music.isPlaying = false; music.playError = '当前音源播放失败'; };
  const onAudioEnded = async () => { await playNext(); };

  const seekToPercent = (percent) => {
    const el = audioRef.value; if (!el || !music.durationSeconds) return;
    el.currentTime = (Math.min(100, Math.max(0, Number(percent) || 0)) / 100) * music.durationSeconds;
    music.currentTime = el.currentTime;
  };
  const seekFromEvent = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (!rect?.width) return;
    seekToPercent(((event.clientX - rect.left) / rect.width) * 100);
  };
  const setVolume = (value) => {
    music.volume = Math.min(1, Math.max(0, Number(value) || 0));
    safeLocalStorageSet(MUSIC_VOLUME_KEY, String(music.volume));
    if (audioRef.value) audioRef.value.volume = music.volume;
  };

  const toggleFavorite = (song = currentTrack.value) => {
    const n = normalizeSong(song); const key = songKey(n);
    const exists = music.favorites.some((i) => songKey(i) === key);
    music.favorites = exists ? music.favorites.filter((i) => songKey(i) !== key) : [n, ...music.favorites].slice(0, 200);
    persistFavorites(); syncProfileStats();
  };
  const addToQueue = (song) => {
    const n = normalizeSong(song);
    if (!music.playlist.some((i) => songKey(i) === songKey(n))) { music.playlist.push(n); persistQueue(); }
  };
  const playFromSearch = async (song) => { music.activeTab = 'discover'; await playSong(song, { addToQueue: true }); };
  const playFromQueue = async (index) => { if (index < 0 || index >= music.playlist.length) return; music.activeIndex = index; await playCurrent(); };
  const playSavedSong = async (song) => { music.activeTab = 'discover'; await playSong(song, { addToQueue: true }); };

  const fetchPlaylistsFromAPI = async () => {
    music.searchLoading = true;
    music.searchError = '';
    try {
      const recSeed = music.recents[0]?.title || currentTrack.value?.title || 'The Middle';
      const charSeed = (currentCharacter?.value?.nickname || currentCharacter?.nickname || 'Kumo') + ' 夜间歌单';
      const [recommendedSongs, charSongs] = await Promise.all([
        searchNeteaseSongs(recSeed),
        searchNeteaseSongs(charSeed)
      ]);

      const recSongs = (recommendedSongs || []).slice(0, 6).map(normalizeSong);
      const charPlaylistSongs = (charSongs || []).slice(0, 6).map(normalizeSong);

      music.recommendedPlaylists = recSongs;
      music.charPlaylists = charPlaylistSongs;
      music.homePlaylists = [
        {
          id: 'home-rec-live',
          title: `想和${currentCharacter?.value?.nickname || currentCharacter?.nickname || 'Kumo'}听的歌`,
          editableTitle: true,
          owner: 'user+char',
          description: '根据你的最近播放共同生成',
          source: 'netease',
          cover: recSongs[0]?.cover || MUSIC_COVER_PLACEHOLDER,
          songs: recSongs,
          added: false
        },
        {
          id: 'home-char-live',
          title: `${currentCharacter?.value?.nickname || currentCharacter?.nickname || 'Kumo'} 的专属歌单`,
          editableTitle: false,
          owner: 'char',
          description: '与你同频的夜间旋律',
          source: 'netease',
          cover: charPlaylistSongs[0]?.cover || MUSIC_COVER_PLACEHOLDER,
          songs: charPlaylistSongs,
          added: false
        }
      ];
      persistHomePlaylists();
      return music.homePlaylists;
    } catch (error) {
      music.searchError = `刷新歌单失败：${error?.message || '未知错误'}`;
      music.homePlaylists = [];
      return [];
    } finally {
      music.searchLoading = false;
    }
  };

  const sendMusicChatMessage = async (text, role = 'user') => {
    const content = String(text || '').trim();
    if (!content) return null;
    music.togetherComments = [...music.togetherComments, { type: role === 'char' ? 'char' : 'user', text: content }].slice(-50);
    persistChatHistory();
    return content;
  };

  const askMusicCharComment = async (song = currentTrack.value) => {
    const profile = activeProfile?.value || activeProfile;
    const role = currentCharacter?.value || currentCharacter || {};
    const name = role?.nickname || role?.name || 'Kumo';
    const persona = String(role?.persona || role?.description || role?.summary || '').trim();
    const prompt = `你是虚拟角色 ${name}。请围绕当前歌曲写一句简短有情绪的乐评，只输出一句中文。歌曲名：${song?.title || ''}；歌手：${song?.artist || ''}。`;

    music.aiJournalLoading = true;
    music.aiJournalText = '';
    music.aiJournalTime = '';

    if (!profile?.endpoint || !profile?.key) {
      const fallback = `${name}：谢谢这首《${song?.title || '这首歌'}》，在我最安静的时候，替我把想说的话慢慢说完。`;
      music.aiJournalText = fallback;
      music.aiJournalTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      await sendMusicChatMessage(fallback, 'char');
      music.aiJournalLoading = false;
      return fallback;
    }
    try {
      const reply = await callAI(profile, [
        { role: 'system', content: '你是一个有稳定人设的虚拟角色，文风克制、细腻。输出一段80~140字中文，像写给歌曲的感谢信。禁止分点、禁止解释、禁止markdown。' },
        { role: 'user', content: `角色名：${name}\n角色人设：${persona || '温柔、感性、陪伴型'}\n歌曲名：${song?.title || ''}\n歌手：${song?.artist || ''}\n任务：以该角色口吻，写一段“对这首歌的感谢”，要有情绪、有画面感。` }
      ], { temperature: 0.86, max_tokens: 220 });
      const clean = String(reply || '').trim() || prompt;
      music.aiJournalText = clean;
      music.aiJournalTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      setJournalForSong(song, { aiJournalText: music.aiJournalText, aiJournalTime: music.aiJournalTime });
      await sendMusicChatMessage(clean, 'char');
      return clean;
    } catch {
      const fallback = `${name}：谢谢你把夜晚的褶皱一寸寸抚平，让我在人群散去之后，还能听见自己心里的回声。`;
      music.aiJournalText = fallback;
      await sendMusicChatMessage(fallback, 'char');
      return fallback;
    } finally {
      music.aiJournalLoading = false;
    }
  };

  const musicReplyToMyJournal = async () => {
    const text = String(music.myJournalInput || '').trim();
    if (!text) return '';
    const profile = activeProfile?.value || activeProfile;
    const role = currentCharacter?.value || currentCharacter || {};
    const name = role?.nickname || role?.name || 'Kumo';
    const persona = String(role?.persona || role?.description || role?.summary || '').trim();
    const song = currentTrack.value;
    const key = songKey(song) + '::' + String(role?.id || role?.nickname || role?.name || '');

    music.myJournalReply = '';

    if (!profile?.endpoint || !profile?.key) {
      music.myJournalReply = `${name}：我看见你写下的这段心情了，它很轻，却很真。`;
      setJournalForSong(song, { myInsightText: text, myInsightReply: music.myJournalReply, myInsightTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), charId: String(role?.id || '') });
      music.myJournalInput = '';
      return music.myJournalReply;
    }

    try {
      const reply = await callAI(profile, [
        { role: 'system', content: '你是用户正在一起听歌的角色，请以角色口吻，回复用户感悟。输出1-2句中文，温柔克制。' },
        { role: 'user', content: `角色名：${name}\n角色人设：${persona || '温柔、感性、陪伴型'}\n当前歌曲：${song?.title || ''} - ${song?.artist || ''}\n用户感悟：${text}` }
      ], { temperature: 0.82, max_tokens: 160 });
      music.myJournalReply = String(reply || '').trim() || `${name}：我听见你了。`;
      setJournalForSong(song, { myInsightText: text, myInsightReply: music.myJournalReply, myInsightTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), charId: String(role?.id || '') });
      music.myJournalInput = '';
      return music.myJournalReply;
    } catch {
      music.myJournalReply = `${name}：谢谢你把这一刻写下来，我会记得。`;
      setJournalForSong(song, { myInsightText: text, myInsightReply: music.myJournalReply, myInsightTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), charId: String(role?.id || '') });
      music.myJournalInput = '';
      return music.myJournalReply;
    }
  };

  const searchOnlineSongs = async (query = music.searchText) => {
    const q = String(query || '').trim();
    if (!q) { music.searchResults = []; music.searchError = ''; return []; }
    music.searchLoading = true; music.searchError = '';
    try {
      const songs = await searchNeteaseSongs(q);
      music.searchResults = songs;
      if (!songs.length) music.searchError = '没有搜到结果';
      return songs;
    } catch {
      music.searchError = '搜索失败'; music.searchResults = []; return [];
    } finally { music.searchLoading = false; }
  };
  const clearSearch = () => { music.searchText = ''; music.searchResults = []; music.searchError = ''; };
  const cycleRepeatMode = () => { music.repeatMode = music.repeatMode === 'list' ? 'one' : music.repeatMode === 'one' ? 'none' : 'list'; };

  const dedupeByTitleArtist = (songs = []) => {
    const seen = new Set();
    return songs.filter((song) => {
      const t = String(song?.title || song?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const a = String(song?.artist || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const key = `${t}__${a}`;
      if (!t || !a || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getCharChatDigest = (char) => {
    try {
      const source = chatHistorySource?.value || chatHistorySource || {};
      const key = String(char?.id || '');
      const logs = Array.isArray(source?.[key]) ? source[key] : [];
      return logs.slice(-30).map((m) => String(m?.text || m?.content || '')).filter(Boolean).join('\n');
    } catch {
      return '';
    }
  };

  const generateCharPlaylistByAI = async (char) => {
    const targetChar = char || currentCharacter?.value || currentCharacter || null;
    if (!targetChar) throw new Error('未找到角色信息');

    const profile = activeProfile?.value || activeProfile;
    if (!profile?.endpoint || !profile?.key || !profile?.model) throw new Error('请先在 Console 激活可用 API 配置');

    const charId = String(targetChar.id || '');
    music.aiGeneratingCharId = charId;
    music.aiGenerateStatusByChar = { ...music.aiGenerateStatusByChar, [charId]: 'loading' };
    try {
      const charName = targetChar?.nickname || targetChar?.name || 'Kumo';
      const persona = String(targetChar?.persona || targetChar?.description || targetChar?.summary || '').trim();
      const chatDigest = getCharChatDigest(targetChar);

      const prompt = `你是资深乐评策展人。请根据角色信息和聊天历史，生成一个“像真人”的44首歌单关键词清单。\n角色名：${charName}\n角色设定：${persona || '温柔、感性、陪伴型'}\n聊天片段：${chatDigest || '暂无历史'}\n要求：\n1) 输出严格 JSON 数组，长度44\n2) 每项字段：{\"title\":\"歌名\",\"artist\":\"歌手\"}\n3) 禁止同一首歌不同版本（如Live/Remix/伴奏/翻唱）\n4) 不要解释文字，不要markdown。`;

      const aiRaw = await callAI(profile, [
        { role: 'system', content: '你是音乐策展人，只输出可解析JSON。' },
        { role: 'user', content: prompt }
      ], { temperature: 0.7, max_tokens: 1800 });

      let parsed = [];
      try {
        const text = String(aiRaw || '').trim();
        const m = text.match(/\[[\s\S]*\]/);
        parsed = JSON.parse(m ? m[0] : text);
      } catch {
        parsed = [];
      }

      const seeds = Array.isArray(parsed) ? parsed.slice(0, 80) : [];
      const queries = seeds.map((x) => `${String(x?.title || '').trim()} ${String(x?.artist || '').trim()}`.trim()).filter(Boolean);

      const bucket = [];
      for (const q of queries) {
        // eslint-disable-next-line no-await-in-loop
        const result = await searchNeteaseSongs(q);
        if (Array.isArray(result) && result.length) bucket.push(...result.slice(0, 3));
        if (bucket.length >= 120) break;
      }

      const unique = dedupeByTitleArtist(bucket).slice(0, 44).map((s) => normalizeSong({ ...s, characterId: targetChar.id }));
      charGeneratedPlaylists[charId] = unique;
      music.aiGenerateStatusByChar = { ...music.aiGenerateStatusByChar, [charId]: 'done' };
      setTimeout(() => {
        if (music.aiGenerateStatusByChar?.[charId] === 'done') {
          const next = { ...music.aiGenerateStatusByChar };
          next[charId] = 'idle';
          music.aiGenerateStatusByChar = next;
        }
      }, 2800);
      return unique;
    } catch (e) {
      music.aiGenerateStatusByChar = { ...music.aiGenerateStatusByChar, [charId]: 'idle' };
      throw e;
    } finally {
      music.aiGeneratingCharId = '';
    }
  };

  const playCharPlaylistWith = async (char) => {
    const targetChar = char || currentCharacter?.value || currentCharacter || null;
    if (!targetChar) return false;
    const key = String(targetChar.id);
    let list = Array.isArray(charGeneratedPlaylists[key]) ? charGeneratedPlaylists[key] : [];
    if (!list.length) {
      list = await generateCharPlaylistByAI(targetChar);
    }
    if (!list.length) throw new Error('生成歌单失败，请稍后重试');

    music.activeTab = 'discover';
    music.playlist.splice(0, music.playlist.length, ...list);
    music.activeIndex = 0;
    await playCurrent();
    return true;
  };

  const fetchPublicCommentsForCurrentTrack = async () => {
    const song = currentTrack.value;
    const targetKey = songKey(song);
    music.publicCommentsLoading = true;
    music.publicCommentsSongKey = targetKey;
    try {
      const raw = await getSongComments(song);
      if (music.publicCommentsSongKey !== targetKey) return;
      music.publicComments = raw.slice(0, 20).map((c, i) => ({
        n: c?.user?.nickname || `乐迷${i + 1}`,
        d: c?.timeStr || '',
        t: c?.content || '（这条评论暂时不可见）',
        avatar: c?.user?.avatarUrl || `https://picsum.photos/seed/music-comment-${i + 1}/64/64`
      }));
      if (!music.publicComments.length) {
        music.publicComments = [
          { n: '系统', d: '', t: '这首歌暂时没有可展示评论。', avatar: 'https://picsum.photos/seed/music-comment-empty/64/64' }
        ];
      }
    } finally {
      if (music.publicCommentsSongKey === targetKey) {
        music.publicCommentsLoading = false;
      }
    }
  };

  watch(() => music.searchText, (value) => {
    if (searchTimer.value) clearTimeout(searchTimer.value);
    if (!String(value || '').trim()) { music.searchResults = []; music.searchError = ''; return; }
    searchTimer.value = setTimeout(() => searchOnlineSongs(value), 520);
  });

  watch(() => music.activeIndex, () => {
    music.currentTime = 0;
    music.durationSeconds = 0;
    music.playError = '';
    void loadLyrics(currentTrack.value);
    applySongJournal(currentTrack.value);
    if (music.viewMode === 'public') void fetchPublicCommentsForCurrentTrack();
  });

  watch(() => [currentCharacter?.value?.id || currentCharacter?.id || '', currentTrack.value?.id || currentTrack.value?.source || ''].join('::'), () => {
    applySongJournal(currentTrack.value);
    loadWanderMessages();
  }, { immediate: true });

  watch(activeLyricIndex, () => {
    scrollToActiveLyric();
  });

  syncProfileStats();
  void loadLyrics(currentTrack.value);

  return {
    // 【登录相关】
    loginState: music.loginState,
    openLoginModal,
    closeLoginModal,
    logoutNetease,
    myVipCookie,

    // 【播放控制与核心功能】
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
    generateCharPlaylistByAI,
    playCharPlaylistWith,
    fetchPublicCommentsForCurrentTrack,
    seekFromEvent,
    setVolume,
    cycleRepeatMode,
    wanderMessages,
    wanderInput,
    wanderEmojiOpen,
    wanderQuoteMsg,
    sendWanderMessage,
    insertWanderEmoji,
    quoteWanderMessage,
    deleteWanderMessage,
    recallWanderMessage,
    musicPetX,
    musicPetY,
    musicPetStyle: computed(() => ({ left: `${musicPetX.value}px`, top: `${musicPetY.value}px`, transform: `rotate(${musicPetRotation.value}deg)` })),
    startMusicPetDrag,

    // 【播放器监听回调】
    onAudioTimeUpdate,
    onAudioLoadedMetadata,
    onAudioPlay,
    onAudioPause,
    onAudioWaiting,
    onAudioCanPlay,
    onAudioError,
    onAudioEnded,

    // 【系统与角色辅助】
    characters,
    currentCharacter,
    activeProfile,
    callAI,
    askMusicCharComment,
    musicReplyToMyJournal
 };
}
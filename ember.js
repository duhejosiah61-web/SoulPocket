// ember.js
// Threads-like microblog where "netizens" are AI roles.
import { ref, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { callAI } from './api.js';

const CURRENT_USER_NAME = '我';

// ---------------------------------------------------------------------
// IndexedDB (local-first timeline)
// ---------------------------------------------------------------------
let emberDB = null;
const EMBER_DB_NAME = 'EmberDB';
const EMBER_DB_VERSION = 1;

async function initEmberDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EMBER_DB_NAME, EMBER_DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      emberDB = request.result;
      resolve(emberDB);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('posts')) {
        const store = db.createObjectStore('posts', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('authorId', 'authorId', { unique: false });
        store.createIndex('replyTo', 'replyTo', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
  });
}

async function dbPut(storeName, value) {
  if (!emberDB) return false;
  return new Promise((resolve, reject) => {
    const tx = emberDB.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  if (!emberDB) return [];
  return new Promise((resolve, reject) => {
    const tx = emberDB.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  if (!emberDB) return false;
  return new Promise((resolve, reject) => {
    const tx = emberDB.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function safeJsonClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    return null;
  }
}

function nowId() {
  // numeric id works well with date formatting and sorting
  return Date.now();
}

function formatTimeShort(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '刚刚';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeCharacters(characters) {
  const raw = Array.isArray(characters) ? characters : (characters?.value || []);
  return Array.isArray(raw) ? raw : [];
}

function characterToAuthor(character) {
  const name = character?.nickname || character?.name || '匿名AI';
  const avatar = character?.avatarUrl || `https://placehold.co/96x96?text=${encodeURIComponent(name.slice(0, 1))}`;
  return { authorId: String(character?.id ?? name), authorName: name, avatar };
}

function isAiProfileReady(activeProfile) {
  const ap = activeProfile?.value ? activeProfile.value : activeProfile;
  const endpoint = String(ap?.endpoint || '').trim();
  const key = String(ap?.key || '').trim();
  return !!(endpoint && key);
}

function activeProfileSnapshot(activeProfile) {
  const ap = activeProfile?.value ? activeProfile.value : activeProfile;
  return {
    endpoint: String(ap?.endpoint || '').trim(),
    key: String(ap?.key || '').trim(),
    model: ap?.model || 'gpt-3.5-turbo'
  };
}

// ---------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------
export function useEmber(characters, activeProfile) {
  const loading = ref(false);
  const error = ref(null);

  const timeline = ref([]);
  const showComposer = ref(false);
  const composerText = ref('');
  const replyingTo = ref(null); // post object
  const autoMode = ref(true);

  // For simple "Threads-like" behavior: show root posts, and for each root post show its replies count.
  const postsById = computed(() => {
    const map = new Map();
    for (const p of timeline.value) map.set(String(p.id), p);
    return map;
  });

  const rootPosts = computed(() => {
    return timeline.value
      .filter(p => !p.replyTo)
      .sort((a, b) => (b.createdAt || b.id || 0) - (a.createdAt || a.id || 0));
  });

  function repliesFor(postId) {
    const id = String(postId);
    return timeline.value
      .filter(p => String(p.replyTo || '') === id)
      .sort((a, b) => (a.createdAt || a.id || 0) - (b.createdAt || b.id || 0));
  }

  async function ensureDb() {
    if (emberDB) return emberDB;
    return await initEmberDB();
  }

  async function loadTimeline() {
    loading.value = true;
    error.value = null;
    try {
      await ensureDb();
      const posts = await dbGetAll('posts');
      timeline.value = (posts || []).map(p => ({
        ...p,
        // derived fields for template
        timeLabel: p?.timeLabel || formatTimeShort(p?.createdAt || p?.id)
      })).sort((a, b) => (b.createdAt || b.id || 0) - (a.createdAt || a.id || 0));
    } catch (e) {
      console.error('Ember loadTimeline failed:', e);
      error.value = e;
      timeline.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function persistPost(post) {
    try {
      await ensureDb();
      const safe = safeJsonClone(post) || post;
      await dbPut('posts', safe);
    } catch (e) {
      console.warn('Ember persist failed:', e);
    }
  }

  async function removePost(postId) {
    try {
      await ensureDb();
      await dbDelete('posts', postId);
    } catch (e) {
      console.warn('Ember delete failed:', e);
    }
  }

  function openComposer(targetPost = null) {
    replyingTo.value = targetPost;
    showComposer.value = true;
    composerText.value = '';
  }

  function closeComposer() {
    showComposer.value = false;
    composerText.value = '';
    replyingTo.value = null;
  }

  async function publishMyPost() {
    const text = String(composerText.value || '').trim();
    if (!text) return;

    const id = nowId();
    const post = {
      id,
      createdAt: id,
      authorId: 'me',
      authorName: CURRENT_USER_NAME,
      avatar: 'https://placehold.co/96x96/111/fff?text=Me',
      content: text,
      replyTo: replyingTo.value ? String(replyingTo.value.id) : '',
      likedByMe: false,
      likeCount: 0,
      repostCount: 0,
      replyCount: 0,
      timeLabel: formatTimeShort(id)
    };

    // optimistic insert
    timeline.value.unshift(post);
    await persistPost(post);

    // bump counters for parent
    if (post.replyTo) {
      const parent = postsById.value.get(String(post.replyTo));
      if (parent) {
        parent.replyCount = (parent.replyCount || 0) + 1;
        await persistPost(parent);
      }
    }

    closeComposer();
  }

  function toggleLike(postId) {
    const p = timeline.value.find(x => x.id === postId);
    if (!p) return;
    const wasLiked = !!p.likedByMe;
    p.likedByMe = !wasLiked;
    const next = (p.likeCount || 0) + (p.likedByMe ? 1 : -1);
    p.likeCount = Math.max(0, next);
    persistPost(p);
  }

  async function deleteMyPost(postId) {
    const idx = timeline.value.findIndex(p => p.id === postId);
    if (idx < 0) return;
    const p = timeline.value[idx];
    if (p.authorName !== CURRENT_USER_NAME) return;

    timeline.value.splice(idx, 1);
    await removePost(postId);
  }

  async function generateAiPost() {
    const chars = normalizeCharacters(characters);
    const pick = pickRandom(chars.filter(c => String(c?.id || '').trim()));
    if (!pick) return;

    const author = characterToAuthor(pick);
    const id = nowId();

    // fallback content
    const fallback = pickRandom([
      '今天有点想发点什么，但又不知道说啥。',
      '刚刚看到一个很离谱的观点，我沉默了三秒。',
      '你们有没有那种：越忙越想摸鱼的时刻？',
      '如果你现在能立刻学会一项技能，你会选什么？'
    ]);

    let content = fallback;
    if (isAiProfileReady(activeProfile)) {
      const ap = activeProfileSnapshot(activeProfile);
      const sys = `你在一个类似 Threads 的中文社交平台发帖。你扮演角色【${author.authorName}】。
要求：
1) 口语化、真实感强，像一个网友随手发的。
2) 1-3 句，长度不要太长。
3) 可以有 0-1 个 emoji，但不要堆。
4) 不要使用话题标签，不要加引号，不要输出解释。`;
      try {
        const out = await callAI(
          { ...ap, model: ap.model },
          [{ role: 'system', content: sys }, { role: 'user', content: '发一条动态' }],
          { temperature: 0.9 }
        );
        const cleaned = String(out || '').replace(/^["']|["']$/g, '').trim();
        if (cleaned) content = cleaned;
      } catch (e) {
        console.warn('Ember AI post failed, fallback used:', e);
      }
    }

    const post = {
      id,
      createdAt: id,
      authorId: author.authorId,
      authorName: author.authorName,
      avatar: author.avatar,
      content,
      replyTo: '',
      likedByMe: false,
      likeCount: 0,
      repostCount: 0,
      replyCount: 0,
      timeLabel: formatTimeShort(id)
    };

    timeline.value.unshift(post);
    await persistPost(post);
  }

  async function generateAiReply(targetPost) {
    if (!targetPost) return;
    const chars = normalizeCharacters(characters);
    const pick = pickRandom(chars.filter(c => String(c?.id || '').trim()));
    if (!pick) return;

    const author = characterToAuthor(pick);
    const id = nowId();
    const fallback = pickRandom(['同感。', '这点我不同意。', '笑死我了。', '展开说说？', '我觉得关键在于…']);

    let content = fallback;
    if (isAiProfileReady(activeProfile)) {
      const ap = activeProfileSnapshot(activeProfile);
      const sys = `你在一个类似 Threads 的中文社交平台回复帖子。你扮演角色【${author.authorName}】。
被回复的帖子作者：${targetPost.authorName}
被回复的帖子内容：${targetPost.content}
要求：
1) 1 句话为主，最多 2 句。
2) 语气自然，像网友回复。
3) 可以轻微互动、追问或调侃，但不要攻击。
4) 不要加引号，不要输出解释。`;
      try {
        const out = await callAI(
          { ...ap, model: ap.model },
          [{ role: 'system', content: sys }, { role: 'user', content: '写一条回复' }],
          { temperature: 0.9 }
        );
        const cleaned = String(out || '').replace(/^["']|["']$/g, '').trim();
        if (cleaned) content = cleaned;
      } catch (e) {
        console.warn('Ember AI reply failed, fallback used:', e);
      }
    }

    const reply = {
      id,
      createdAt: id,
      authorId: author.authorId,
      authorName: author.authorName,
      avatar: author.avatar,
      content,
      replyTo: String(targetPost.id),
      likedByMe: false,
      likeCount: 0,
      repostCount: 0,
      replyCount: 0,
      timeLabel: formatTimeShort(id)
    };

    timeline.value.unshift(reply);
    await persistPost(reply);

    const parent = postsById.value.get(String(targetPost.id));
    if (parent) {
      parent.replyCount = (parent.replyCount || 0) + 1;
      await persistPost(parent);
    }
  }

  // Auto mode: periodically let AI post while Ember is opened.
  let autoTimer = null;
  function startAuto() {
    stopAuto();
    if (!autoMode.value) return;
    // 35~75s a post, slightly random
    const tick = async () => {
      const delay = 35000 + Math.floor(Math.random() * 40000);
      autoTimer = setTimeout(async () => {
        // 65% new post, 35% reply to a recent post
        const roll = Math.random();
        const roots = rootPosts.value.slice(0, 12);
        if (roll < 0.35 && roots.length) {
          await generateAiReply(pickRandom(roots));
        } else {
          await generateAiPost();
        }
        tick();
      }, delay);
    };
    tick();
  }

  function stopAuto() {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  async function onEnter() {
    await loadTimeline();
    startAuto();
  }

  function onLeave() {
    stopAuto();
    closeComposer();
  }

  const cleanup = () => {
    stopAuto();
  };

  // First init: try to load once so empty timeline doesn't look broken
  // (real refresh is done via onEnter from script.js watcher)
  ensureDb().then(() => loadTimeline()).catch(() => {});

  return {
    loading,
    error,
    timeline,
    rootPosts,
    repliesFor,
    showComposer,
    composerText,
    replyingTo,
    autoMode,
    openComposer,
    closeComposer,
    publishMyPost,
    toggleLike,
    deleteMyPost,
    generateAiPost,
    generateAiReply,
    onEnter,
    onLeave,
    cleanup,
    initEmberDB
  };
}
import { ref, computed, reactive, onMounted, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { callAI } from './api.js';

const CURRENT_USER_NAME = '我';
const ME_ID = '__me__';

const DB_NAME = 'ReadDB';
const DB_VERSION = 2;

function safeJsonParse(text) {
  if (!text) return null;
  const raw = String(text);
  const withoutFences = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(withoutFences);
  } catch {
    const firstBrace = withoutFences.indexOf('{');
    const lastBrace = withoutFences.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = withoutFences.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseTags(tagsText) {
  if (!tagsText) return [];
  if (Array.isArray(tagsText)) return tagsText.map((t) => String(t).trim()).filter(Boolean);
  return String(tagsText)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

async function callChatCompletions(activeProfileRef, systemPrompt, userPrompt, extra = {}) {
  const profile = activeProfileRef?.value || null;
  if (!profile) throw new Error('未检测到可用的 API 配置');
  const endpoint = String(profile.endpoint || '').trim();
  const key = String(profile.key || '').trim();
  if (!endpoint || !key) throw new Error('API 配置不完整：请先在 Console 填写 endpoint 和 key。');

  const maxTokens =
    typeof extra.max_tokens === 'number'
      ? extra.max_tokens
      : typeof profile.max_tokens === 'number'
        ? profile.max_tokens
        : 2200;

  return callAI(
    profile,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: typeof extra.temperature === 'number' ? extra.temperature : 0.8,
      max_tokens: maxTokens,
      extraBody: { stream: false },
    }
  );
}

function openReadDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;

      if (!db.objectStoreNames.contains('works')) {
        const store = db.createObjectStore('works', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('chapters')) {
        const store = db.createObjectStore('chapters', { keyPath: 'id' });
        store.createIndex('workId', 'workId', { unique: false });
        store.createIndex('workId_chapterIndex', ['workId', 'chapterIndex'], { unique: false });
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        const store = db.createObjectStore('bookmarks', { keyPath: 'id' });
        store.createIndex('workId', 'workId', { unique: false });
        store.createIndex('user', 'user', { unique: false });
      }
      if (!db.objectStoreNames.contains('kudos')) {
        const store = db.createObjectStore('kudos', { keyPath: 'id' });
        store.createIndex('targetType_targetId', ['targetType', 'targetId'], { unique: false });
      }
      if (!db.objectStoreNames.contains('comments')) {
        const store = db.createObjectStore('comments', { keyPath: 'id' });
        store.createIndex('targetType', 'targetType', { unique: false });
        store.createIndex('chapterId', 'chapterId', { unique: false });
        store.createIndex('chapterId_parentId', ['chapterId', 'parentId'], { unique: false });
      }

      // Add work-level indexes for AO3-like behavior.
      if (db.objectStoreNames.contains('comments')) {
        const store = tx.objectStore('comments');
        if (!store.indexNames.contains('workId')) store.createIndex('workId', 'workId', { unique: false });
        if (!store.indexNames.contains('workId_parentId')) store.createIndex('workId_parentId', ['workId', 'parentId'], { unique: false });
      }
    };
  });
}

function idbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function stripMarkdownFences(text) {
  return String(text || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
}

export function useRead(charactersRef, worldbooksRef, presetsRef, activeProfileRef) {
  const dbRef = ref(null);
  const view = ref('explore'); // explore | detail | reader | writer | settings

  // Core stores
  const works = ref([]);
  const chapters = ref([]);
  const bookmarks = ref([]);
  const kudos = ref([]);
  const comments = ref([]);

  const DEFAULT_READ_BG_URL = 'https://img.heliar.top/file/1774796711944_1774796692918.png';
  const LS_READ_BG = 'readApp.readerBackgroundUrl';
  const LS_READ_PREFS = 'readApp.readerPrefs.v1';

  const readerBackgroundUrl = ref(DEFAULT_READ_BG_URL);
  const readerPrefs = reactive({
    fontSize: 24,
    lineHeight: 1.95,
    contentWidth: 760,
    overlayOpacity: 0.55,
    textColor: '#1f2933',
    fontFamily: 'retro-cursive', // retro-cursive | kaiti | fangsong | serif
  });
  const readerFontOptions = [
    { value: 'retro-cursive', label: '复古手写（默认）' },
    { value: 'kaiti', label: '楷体' },
    { value: 'fangsong', label: '仿宋' },
    { value: 'serif', label: '宋体衬线' },
  ];

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const loadReaderBackgroundFromStorage = () => {
    try {
      const s = localStorage.getItem(LS_READ_BG);
      if (s && String(s).trim()) readerBackgroundUrl.value = String(s).trim();
    } catch {
      /* ignore */
    }
  };

  const saveReaderBackground = () => {
    let u = String(readerBackgroundUrl.value || '').trim();
    if (!u) {
      readerBackgroundUrl.value = DEFAULT_READ_BG_URL;
      u = DEFAULT_READ_BG_URL;
    }
    try {
      if (u === DEFAULT_READ_BG_URL) {
        localStorage.removeItem(LS_READ_BG);
      } else {
        localStorage.setItem(LS_READ_BG, u);
      }
    } catch {
      /* ignore */
    }
  };

  const resetReaderBackground = () => {
    readerBackgroundUrl.value = DEFAULT_READ_BG_URL;
    try {
      localStorage.removeItem(LS_READ_BG);
    } catch {
      /* ignore */
    }
  };

  const loadReaderPrefsFromStorage = () => {
    try {
      const raw = localStorage.getItem(LS_READ_PREFS);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.fontSize === 'number') readerPrefs.fontSize = clamp(parsed.fontSize, 14, 40);
      if (typeof parsed.lineHeight === 'number') readerPrefs.lineHeight = clamp(parsed.lineHeight, 1.3, 2.6);
      if (typeof parsed.contentWidth === 'number') readerPrefs.contentWidth = clamp(parsed.contentWidth, 520, 1100);
      if (typeof parsed.overlayOpacity === 'number') readerPrefs.overlayOpacity = clamp(parsed.overlayOpacity, 0, 0.9);
      if (typeof parsed.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.textColor)) {
        readerPrefs.textColor = parsed.textColor;
      }
      if (typeof parsed.fontFamily === 'string') {
        const ok = readerFontOptions.some((x) => x.value === parsed.fontFamily);
        if (ok) readerPrefs.fontFamily = parsed.fontFamily;
      }
    } catch {
      /* ignore */
    }
  };

  const saveReaderPrefs = () => {
    readerPrefs.fontSize = clamp(Number(readerPrefs.fontSize) || 24, 14, 40);
    readerPrefs.lineHeight = clamp(Number(readerPrefs.lineHeight) || 1.95, 1.3, 2.6);
    readerPrefs.contentWidth = clamp(Number(readerPrefs.contentWidth) || 760, 520, 1100);
    readerPrefs.overlayOpacity = clamp(Number(readerPrefs.overlayOpacity) || 0, 0, 0.9);
    if (!/^#[0-9a-fA-F]{6}$/.test(String(readerPrefs.textColor || ''))) readerPrefs.textColor = '#1f2933';
    const payload = {
      fontSize: readerPrefs.fontSize,
      lineHeight: readerPrefs.lineHeight,
      contentWidth: readerPrefs.contentWidth,
      overlayOpacity: readerPrefs.overlayOpacity,
      textColor: readerPrefs.textColor,
      fontFamily: readerPrefs.fontFamily,
    };
    try {
      localStorage.setItem(LS_READ_PREFS, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  };

  const resetReaderPrefs = () => {
    readerPrefs.fontSize = 24;
    readerPrefs.lineHeight = 1.95;
    readerPrefs.contentWidth = 760;
    readerPrefs.overlayOpacity = 0.55;
    readerPrefs.textColor = '#1f2933';
    readerPrefs.fontFamily = 'retro-cursive';
    try {
      localStorage.removeItem(LS_READ_PREFS);
    } catch {
      /* ignore */
    }
  };

  const readerBodyStyle = computed(() => {
    const familyMap = {
      'retro-cursive': "'Long Cang', 'ZCOOL XiaoWei', 'KaiTi', 'STKaiti', 'FangSong', 'SimSun', serif",
      kaiti: "'KaiTi', 'STKaiti', 'Kaiti SC', serif",
      fangsong: "'FangSong', 'STFangsong', 'Songti SC', serif",
      serif: "'Noto Serif SC', 'Songti SC', 'SimSun', serif",
    };
    return {
      fontFamily: familyMap[readerPrefs.fontFamily] || familyMap['retro-cursive'],
      fontSize: `${readerPrefs.fontSize}px`,
      lineHeight: `${readerPrefs.lineHeight}`,
      maxWidth: `${readerPrefs.contentWidth}px`,
      color: readerPrefs.textColor,
    };
  });
  const readerPreviewText = computed(
    () =>
      `第118章 要账（八更）\n\n` +
      `容斩这几天的日子，的确不好过。\n` +
      `子嗣相残、争权夺利，本就是帝王最忌讳的事情之一。\n` +
      `他当然知道这是皇室不可避免的斗争，但没想到最先动手的居然是容斩。`,
  );

  const readAppBackgroundStyle = computed(() => {
    const url = String(readerBackgroundUrl.value || '').trim() || DEFAULT_READ_BG_URL;
    const safe = JSON.stringify(url);
    const overlay = clamp(Number(readerPrefs.overlayOpacity) || 0, 0, 0.9);
    return {
      backgroundColor: 'transparent',
      backgroundImage: `linear-gradient(rgba(243,243,246,${overlay}), rgba(243,243,246,${overlay})), url(${safe})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
    };
  });

  // Explore UI
  const searchQuery = ref('');
  // AO3-like tag filters: warnings 与 additional tags 分开（AND 逻辑）
  const selectedWarningTags = ref([]);
  const selectedAdditionalTags = ref([]);

  const allWarningTags = computed(() => {
    const map = new Map();
    (works.value || []).forEach((w) => {
      const list = Array.isArray(w.archiveWarnings) ? w.archiveWarnings : [];
      list.forEach((t) => {
        const key = String(t);
        map.set(key, (map.get(key) || 0) + 1);
      });
    });
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 60);
  });

  const allAdditionalTags = computed(() => {
    const map = new Map();
    (works.value || []).forEach((w) => {
      const list = Array.isArray(w.additionalTags) ? w.additionalTags : [];
      list.forEach((t) => {
        const key = String(t);
        map.set(key, (map.get(key) || 0) + 1);
      });
    });
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 60);
  });

  const toggleWarningTag = (tag) => {
    const s = String(tag);
    const idx = selectedWarningTags.value.findIndex((x) => String(x) === s);
    if (idx >= 0) selectedWarningTags.value.splice(idx, 1);
    else selectedWarningTags.value.push(s);
  };

  const toggleAdditionalTag = (tag) => {
    const s = String(tag);
    const idx = selectedAdditionalTags.value.findIndex((x) => String(x) === s);
    if (idx >= 0) selectedAdditionalTags.value.splice(idx, 1);
    else selectedAdditionalTags.value.push(s);
  };

  const clearSelectedTags = () => {
    selectedWarningTags.value = [];
    selectedAdditionalTags.value = [];
  };

  const filteredWorks = computed(() => {
    const q = String(searchQuery.value || '').trim().toLowerCase();
    const list = works.value || [];
    const sorted = list.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const bySearch = !q
      ? sorted
      : sorted.filter((w) => {
          const hay = [w.title, w.pairing, w.summary, (w.tags || []).join(',')].join(' ').toLowerCase();
          return hay.includes(q);
        });
    const wWarnings = selectedWarningTags.value || [];
    const wAdditional = selectedAdditionalTags.value || [];
    if (!wWarnings.length && !wAdditional.length) return bySearch;

    return bySearch.filter((w) => {
      const warnings = Array.isArray(w.archiveWarnings) ? w.archiveWarnings.map((t) => String(t)) : [];
      const additional = Array.isArray(w.additionalTags) ? w.additionalTags.map((t) => String(t)) : [];
      const passWarnings = !wWarnings.length || wWarnings.every((t) => warnings.includes(String(t)));
      const passAdditional = !wAdditional.length || wAdditional.every((t) => additional.includes(String(t)));
      return passWarnings && passAdditional;
    });
  });

  // Detail / Reader
  const activeWorkId = ref(null);
  const activeChapterId = ref(null);

  const activeWork = computed(() => works.value.find((w) => String(w.id) === String(activeWorkId.value)) || null);
  const activeChaptersSorted = computed(() => {
    const workId = activeWorkId.value;
    return chapters.value
      .filter((c) => String(c.workId) === String(workId))
      .slice()
      .sort((a, b) => (a.chapterIndex || 0) - (b.chapterIndex || 0));
  });
  const activeChapter = computed(() => chapters.value.find((c) => String(c.id) === String(activeChapterId.value)) || null);

  // Writer UI
  const writerMode = ref('create'); // create | continue
  const isGenerating = ref(false);
  const genError = ref('');

  const writerForm = reactive({
    charAId: null,
    charBId: null,
    workTitleText: '',
    pairingText: '',
    worldbookId: null,
    presetId: null,
    tagsText: '', // AO3 Additional Tags
    archiveWarningsText: '', // AO3 Archive Warnings
    workSummaryText: '',
    chapterTitleText: '', // AO3 Chapter title (optional)
    authorNotesText: '', // AO3 Author notes (optional)
    ratingText: 'PG-13',
    lengthPreset: 'short', // short | medium | long
    userInstruction: '',
  });

  const lengthHint = computed(() => {
    const m = {
      short: '约 800-1200 字（信息密度高，阅读体验紧凑）',
      medium: '约 1500-2200 字（有场景铺陈与情绪起伏）',
      long: '约 2500-3600 字（节奏更完整，增加细节与张力）',
    };
    return m[writerForm.lengthPreset] || m.short;
  });

  // Work community UI (kudos + comments + replies)
  const newCommentInput = ref('');
  const replyToCommentId = ref(null);
  const replyInput = ref('');
  const isGeneratingComment = ref(false);

  const isBookmarked = (workId) => {
    return (bookmarks.value || []).some((b) => String(b.workId) === String(workId) && String(b.user) === String(CURRENT_USER_NAME));
  };

  const toggleBookmark = async (workId) => {
    if (!dbRef.value) return;
    const safeWorkId = String(workId);
    const exist = bookmarks.value.find((b) => String(b.workId) === safeWorkId && String(b.user) === CURRENT_USER_NAME);
    if (exist) {
      await idbDelete(dbRef.value, 'bookmarks', exist.id);
      bookmarks.value = bookmarks.value.filter((b) => b.id !== exist.id);
      return;
    }
    const record = {
      id: `${CURRENT_USER_NAME}_${safeWorkId}`,
      user: CURRENT_USER_NAME,
      workId: safeWorkId,
      addedAt: nowIso(),
    };
    await idbPut(dbRef.value, 'bookmarks', record);
    bookmarks.value.unshift(record);
  };

  const isKudoed = (workId) => {
    return (kudos.value || []).some(
      (k) => String(k.targetType) === 'work' && String(k.targetId) === String(workId) && String(k.user) === String(CURRENT_USER_NAME),
    );
  };

  const kudosCountForWork = (workId) => {
    return (kudos.value || []).filter((k) => String(k.targetType) === 'work' && String(k.targetId) === String(workId)).length;
  };

  const toggleKudos = async (workId) => {
    if (!dbRef.value) return;
    const safeWorkId = String(workId);
    const exist = kudos.value.find((k) => k.targetType === 'work' && String(k.targetId) === safeWorkId && k.user === CURRENT_USER_NAME);
    if (exist) {
      await idbDelete(dbRef.value, 'kudos', exist.id);
      kudos.value = kudos.value.filter((k) => k.id !== exist.id);
      return;
    }
    const record = {
      id: `${CURRENT_USER_NAME}_work_${safeWorkId}`,
      targetType: 'work',
      targetId: safeWorkId,
      user: CURRENT_USER_NAME,
      addedAt: nowIso(),
    };
    await idbPut(dbRef.value, 'kudos', record);
    kudos.value.unshift(record);
  };

  const commentCountForWork = (workId) => {
    return (comments.value || []).filter((c) => c.targetType === 'work' && String(c.workId) === String(workId)).length;
  };

  const activeWorkCommentsTree = computed(() => {
    const workId = activeWorkId.value;
    if (!workId) return [];
    const list = comments.value
      .filter((c) => c.targetType === 'work' && String(c.workId) === String(workId))
      .slice()
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    const top = list.filter((c) => c.parentId == null);
    const byParent = new Map();
    list.forEach((c) => {
      if (c.parentId == null) return;
      const arr = byParent.get(c.parentId) || [];
      arr.push(c);
      byParent.set(c.parentId, arr);
    });

    return top.map((c) => ({
      ...c,
      replies: (byParent.get(c.id) || []).slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
    }));
  });

  const submitNewComment = async () => {
    if (!dbRef.value) return;
    const workId = activeWorkId.value;
    const content = String(newCommentInput.value || '').trim();
    if (!workId || !content) return;
    const record = {
      id: `c_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      targetType: 'work',
      workId: String(workId),
      parentId: null,
      author: CURRENT_USER_NAME,
      content,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await idbPut(dbRef.value, 'comments', record);
    comments.value.push(record);
    newCommentInput.value = '';
  };

  const generateWorkComment = async () => {
    if (!dbRef.value) return;
    const workId = activeWorkId.value;
    const work = activeWork.value;
    if (!workId || !work) return;
    if (isGeneratingComment.value) return;
    isGeneratingComment.value = true;
    try {
      const offline = !activeProfileRef?.value?.endpoint || !activeProfileRef?.value?.key;
      const chs = activeChaptersSorted.value || [];
      const latest = chs.length ? chs[chs.length - 1] : null;
      const latestTitle = latest?.title ? String(latest.title) : '';
      const latestTail = latest?.content ? String(latest.content).slice(-900) : '';

      if (offline) {
        const record = {
          id: `c_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          targetType: 'work',
          workId: String(workId),
          parentId: null,
          author: '匿名读者',
          content: `（离线占位留言）太好看了！${work.title ? `《${work.title}》` : '这篇'}的氛围感很戳我，期待后续更新。`,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        await idbPut(dbRef.value, 'comments', record);
        comments.value.push(record);
        return;
      }

      const systemPrompt = `你是 AO3 风格读者留言生成器。
- 只输出严格 JSON（不要 markdown，不要解释）
- 留言像真实读者，不要提到“我是AI/模型/提示词”
- 字数 40~140 中文字，允许换行，但不要太长`;

      const userPrompt = `请为以下作品生成一条“读者留言/评论”，要求自然、具体、能点到情绪或细节。

作品标题：${work.title || '（无）'}
关系：${work.pairing || '（无）'}
评级：${work.rating || '（无）'}
归档警告：${Array.isArray(work.archiveWarnings) && work.archiveWarnings.length ? work.archiveWarnings.join(', ') : '（无）'}
额外标签：${Array.isArray(work.additionalTags) && work.additionalTags.length ? work.additionalTags.join(', ') : '（无）'}
简介：${work.summary || '（无）'}
最新章节：${latestTitle || '（无）'}
最新章节尾部节选（用于抓氛围，不要复读原句）：
${latestTail || '（无）'}

输出 JSON：
{
  "author": "匿名读者",
  "content": "留言正文..."
}`;

      const raw = await callChatCompletions(activeProfileRef, systemPrompt, userPrompt, { temperature: 0.9, max_tokens: 500 });
      const parsed = safeJsonParse(raw) || {};
      const author = String(parsed.author || '匿名读者').trim().slice(0, 20) || '匿名读者';
      let content = String(parsed.content || '').trim();
      // 兼容部分模型返回纯文本而非 JSON 的情况
      if (!content) content = stripMarkdownFences(raw);
      if (!content) throw new Error('AI 未返回有效留言内容');

      const record = {
        id: `c_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        targetType: 'work',
        workId: String(workId),
        parentId: null,
        author,
        content,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await idbPut(dbRef.value, 'comments', record);
      comments.value.push(record);
    } catch (e) {
      alert(`生成留言失败：${e?.message || String(e)}`);
    } finally {
      isGeneratingComment.value = false;
    }
  };

  const submitReply = async () => {
    if (!dbRef.value) return;
    const workId = activeWorkId.value;
    const parentId = replyToCommentId.value;
    const content = String(replyInput.value || '').trim();
    if (!workId || !parentId || !content) return;
    const record = {
      id: `r_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      targetType: 'work',
      workId: String(workId),
      parentId: String(parentId),
      author: CURRENT_USER_NAME,
      content,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await idbPut(dbRef.value, 'comments', record);
    comments.value.push(record);
    replyToCommentId.value = null;
    replyInput.value = '';
  };

  // Navigation
  const openWork = (workId) => {
    activeWorkId.value = workId;
    const list = chapters.value
      .filter((c) => String(c.workId) === String(workId))
      .slice()
      .sort((a, b) => (a.chapterIndex || 0) - (b.chapterIndex || 0));
    activeChapterId.value = list.length ? list[list.length - 1].id : null;
    view.value = 'detail';
    newCommentInput.value = '';
    replyToCommentId.value = null;
    replyInput.value = '';
  };

  const openReader = (chapterId) => {
    activeChapterId.value = chapterId;
    view.value = 'reader';
    newCommentInput.value = '';
    replyToCommentId.value = null;
    replyInput.value = '';
  };

  const backToDetail = () => {
    view.value = 'detail';
  };

  const goPrevChapter = () => {
    const chs = activeChaptersSorted.value || [];
    const idx = chs.findIndex((x) => String(x.id) === String(activeChapterId.value));
    if (idx > 0) openReader(chs[idx - 1].id);
  };

  const goNextChapter = () => {
    const chs = activeChaptersSorted.value || [];
    const idx = chs.findIndex((x) => String(x.id) === String(activeChapterId.value));
    if (idx >= 0 && idx < chs.length - 1) openReader(chs[idx + 1].id);
  };

  const selectChapterForComments = (chapterId) => {
    activeChapterId.value = chapterId;
    newCommentInput.value = '';
    replyToCommentId.value = null;
    replyInput.value = '';
    view.value = 'detail';
  };

  const goExplore = () => {
    activeWorkId.value = null;
    activeChapterId.value = null;
    replyToCommentId.value = null;
    replyInput.value = '';
    newCommentInput.value = '';
    view.value = 'explore';
  };

  const openSettings = () => {
    view.value = 'settings';
  };

  const openWriterCreate = () => {
    writerMode.value = 'create';
    genError.value = '';
    isGenerating.value = false;
    const chars = Array.isArray(charactersRef?.value) ? charactersRef.value : [];
    // AO3-like：默认让“角色A = 我”，角色B 选第一个角色，方便用户直接恋爱写作
    writerForm.charAId = ME_ID;
    writerForm.charBId = chars[0]?.id || null;
    writerForm.workTitleText = '';
    writerForm.pairingText = '';
    writerForm.worldbookId = null;
    writerForm.presetId = null;
    writerForm.tagsText = '';
    writerForm.archiveWarningsText = '';
    writerForm.workSummaryText = '';
    writerForm.chapterTitleText = '';
    writerForm.authorNotesText = '';
    writerForm.ratingText = 'PG-13';
    writerForm.lengthPreset = 'short';
    writerForm.userInstruction = '';
    view.value = 'writer';
  };

  const openWriterContinue = (workId) => {
    writerMode.value = 'continue';
    genError.value = '';
    isGenerating.value = false;
    activeWorkId.value = workId;

    const chs = chapters.value
      .filter((c) => String(c.workId) === String(workId))
      .slice()
      .sort((a, b) => (a.chapterIndex || 0) - (b.chapterIndex || 0));
    const nextIndex = (chs[chs.length - 1]?.chapterIndex || 0) + 1;

    const chars = Array.isArray(charactersRef?.value) ? charactersRef.value : [];
    const charIds = new Set((chars || []).map((c) => String(c.id)));
    const keepA = writerForm.charAId === ME_ID || charIds.has(String(writerForm.charAId));
    const keepB = writerForm.charBId === ME_ID || charIds.has(String(writerForm.charBId));
    writerForm.charAId = keepA ? writerForm.charAId : (ME_ID);
    writerForm.charBId = keepB ? writerForm.charBId : (chars[0]?.id || null);
    writerForm.workTitleText = activeWork.value?.title || '';
    writerForm.lengthPreset = 'medium';
    writerForm.archiveWarningsText = '';
    writerForm.workSummaryText = activeWork.value?.summary || '';
    writerForm.pairingText = activeWork.value?.pairing || writerForm.pairingText || '';
    writerForm.ratingText = activeWork.value?.rating || writerForm.ratingText || 'PG-13';
    writerForm.tagsText = Array.isArray(activeWork.value?.additionalTags)
      ? activeWork.value.additionalTags.join(', ')
      : writerForm.tagsText;
    writerForm.archiveWarningsText = Array.isArray(activeWork.value?.archiveWarnings)
      ? activeWork.value.archiveWarnings.join(', ')
      : writerForm.archiveWarningsText;
    writerForm.chapterTitleText = '';
    writerForm.authorNotesText = '';
    writerForm.userInstruction = `续写下一章：第${nextIndex}章。\n要求延续前文氛围与人物张力，增加一个“钩子”。`;
    view.value = 'writer';
  };

  // Prompt helpers
  const buildMeCharacter = (otherChar) => {
    const otherName = otherChar?.nickname || otherChar?.name || '';
    const userPersona = otherChar?.userPersona || '';
    const persona = userPersona
      ? `用户在${otherName}面前的人设：${String(userPersona).trim()}`
      : '用户人设未填写（尽量贴合两人关系与当前语境）。';
    return {
      id: ME_ID,
      nickname: CURRENT_USER_NAME,
      name: CURRENT_USER_NAME,
      persona,
      summary: '',
      tags: [],
    };
  };

  const resolveSlotCharacter = (slotId, chars, otherCharForUser) => {
    const safeSlotId = String(slotId ?? '');
    if (safeSlotId === ME_ID) {
      return buildMeCharacter(otherCharForUser);
    }
    const found = (chars || []).find((c) => String(c.id) === String(slotId));
    return found || (chars && chars.length ? chars[0] : null);
  };

  const pickChapterContent = (chapter) => {
    return String(
      chapter?.content ||
        chapter?.chapterContent ||
        chapter?.chapter_content ||
        chapter?.story ||
        chapter?.storyContent ||
        chapter?.story_content ||
        chapter?.text ||
        '',
    );
  };

  const buildCharacterBlock = (char) => {
    if (!char) return '';
    const nickname = char.nickname || char.name || '未命名角色';
    const persona = char.persona || '';
    const summary = char.summary || '';
    const tags = Array.isArray(char.tags) ? char.tags.join(', ') : (char.tags || '');
    return `角色：${nickname}\n标签：${tags || '无'}\n人设：${persona || summary || ''}`.trim();
  };

  const pickEnabledWorldbookText = (worldbookId) => {
    const wbs = Array.isArray(worldbooksRef?.value) ? worldbooksRef.value : [];
    const wb = wbs.find((w) => String(w.id) === String(worldbookId)) || null;
    if (!wb) return '';
    const entries = Array.isArray(wb.entries) ? wb.entries : [];
    const enabled = entries.filter((e) => e.enabled !== false && e.content);
    return enabled
      .map((e) => `【${e.key || e.keyword || '条目'}】\n${String(e.content || '').trim()}`)
      .slice(0, 18)
      .join('\n\n');
  };

  const pickPresetText = (presetId) => {
    const ps = Array.isArray(presetsRef?.value) ? presetsRef.value : [];
    const p = ps.find((x) => String(x.id) === String(presetId)) || null;
    if (!p) return '';
    if (typeof p.content === 'string' && p.content.trim()) return p.content.trim();
    const segments = Array.isArray(p.segments) ? p.segments : [];
    const enabled = segments.filter((s) => s.enabled !== false && (s.content || '').trim());
    return enabled
      .map((s, idx) => `【分段${idx + 1}：${s.title || '无标题'}】\n${String(s.content || '').trim()}`)
      .slice(0, 12)
      .join('\n\n');
  };

  const getNextChapterIndexForWork = (workId) => {
    const chs = chapters.value.filter((c) => String(c.workId) === String(workId));
    const max = chs.reduce((acc, c) => Math.max(acc, Number(c.chapterIndex || 0)), 0);
    return max + 1;
  };

  const saveGeneratedWorkAndFirstChapter = async (data) => {
    if (!dbRef.value) throw new Error('DB 未初始化');
    const work = data?.work || {};
    const chapter = data?.chapter || {};

    const workId = `w_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const chapterId = `ch_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const additionalTags = Array.isArray(work.additionalTags)
      ? work.additionalTags.map((t) => String(t).trim()).filter(Boolean)
      : parseTags(work.additionalTags || work.tags || writerForm.tagsText);
    const archiveWarnings = Array.isArray(work.archiveWarnings)
      ? work.archiveWarnings.map((t) => String(t).trim()).filter(Boolean)
      : parseTags(work.archiveWarnings || '');

    const combinedTags = Array.from(new Set([...(archiveWarnings || []), ...(additionalTags || [])].filter(Boolean))).slice(0, 30);

    const workRecord = {
      id: workId,
      title:
        writerForm.workTitleText && String(writerForm.workTitleText).trim()
          ? String(writerForm.workTitleText).trim()
          : String(work.title || '未命名作品'),
      pairing: String(work.pairing || work.relationship || ''),
      archiveWarnings: archiveWarnings || [],
      additionalTags: additionalTags || [],
      tags: combinedTags,
      rating: String(work.rating || writerForm.ratingText || 'PG-13'),
      status: String(work.status || 'ongoing'),
      summary: String(work.summary || writerForm.workSummaryText || ''),
      author: CURRENT_USER_NAME,
      worldbookSnapshot: writerForm.worldbookId ? String(writerForm.worldbookId) : null,
      presetSnapshot: writerForm.presetId ? String(writerForm.presetId) : null,
      lastChapterIndex: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const chapterRecord = {
      id: chapterId,
      workId,
      chapterIndex: 1,
      title:
        writerForm.chapterTitleText && String(writerForm.chapterTitleText).trim()
          ? String(writerForm.chapterTitleText).trim()
          : String(chapter.title || chapter.chapterTitle || chapter.chapter_title || '第一章'),
      summary: String(
        chapter.summary || chapter.chapterSummary || chapter.chapter_summary || chapter.chapter_summary_text || '',
      ),
      authorNotes:
        writerForm.authorNotesText && String(writerForm.authorNotesText).trim()
          ? String(writerForm.authorNotesText).trim()
          : String(
              chapter.authorNotes ||
                chapter.author_note ||
                chapter.authorNote ||
                chapter.author_notes ||
                chapter.notes ||
                '',
            ),
      content: String(
        chapter.content ||
          chapter.chapterContent ||
          chapter.chapter_content ||
          chapter.story ||
          chapter.storyContent ||
          chapter.story_content ||
          chapter.text ||
          '',
      ),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await idbPut(dbRef.value, 'works', workRecord);
    await idbPut(dbRef.value, 'chapters', chapterRecord);

    works.value.unshift(workRecord);
    chapters.value.push(chapterRecord);

    activeWorkId.value = workId;
    activeChapterId.value = chapterId;
    view.value = 'detail';
  };

  const saveGeneratedNextChapter = async (workId, chapter) => {
    if (!dbRef.value) throw new Error('DB 未初始化');
    const workRecord = works.value.find((w) => String(w.id) === String(workId));
    if (!workRecord) throw new Error('作品不存在');

    const nextIndex = Number(chapter?.chapterIndex || getNextChapterIndexForWork(workId));
    const chapterId = `ch_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const chapterRecord = {
      id: chapterId,
      workId: String(workId),
      chapterIndex: nextIndex,
      title:
        writerForm.chapterTitleText && String(writerForm.chapterTitleText).trim()
          ? String(writerForm.chapterTitleText).trim()
          : String(
              chapter?.title ||
                chapter?.chapterTitle ||
                chapter?.chapter_title ||
                `第${nextIndex}章`,
            ),
      summary: String(
        chapter?.summary || chapter?.chapterSummary || chapter?.chapter_summary || chapter?.chapter_summary_text || '',
      ),
      authorNotes:
        writerForm.authorNotesText && String(writerForm.authorNotesText).trim()
          ? String(writerForm.authorNotesText).trim()
          : String(
              chapter?.authorNotes ||
                chapter?.author_note ||
                chapter?.authorNote ||
                chapter?.author_notes ||
                chapter?.notes ||
                '',
            ),
      content: String(
        chapter?.content ||
          chapter?.chapterContent ||
          chapter?.chapter_content ||
          chapter?.story ||
          chapter?.storyContent ||
          chapter?.story_content ||
          chapter?.text ||
          '',
      ),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await idbPut(dbRef.value, 'chapters', chapterRecord);
    await idbPut(dbRef.value, 'works', {
      ...workRecord,
      lastChapterIndex: nextIndex,
      updatedAt: nowIso(),
      status: workRecord.status || 'ongoing',
    });

    chapters.value.push(chapterRecord);
    workRecord.lastChapterIndex = nextIndex;
    workRecord.updatedAt = nowIso();

    activeChapterId.value = chapterId;
    view.value = 'reader';
  };

  const generateWorkAndFirstChapterOffline = (charA, charB) => {
    const a = charA?.nickname || charA?.name || 'A';
    const b = charB?.nickname || charB?.name || 'B';
    const title = writerForm.workTitleText && String(writerForm.workTitleText).trim()
      ? String(writerForm.workTitleText).trim()
      : `${a} x ${b}：一段刚刚好的心跳`;
    const pairing = `${a}x${b}`;
    const additionalTags = parseTags(writerForm.tagsText) || ['同人文', '甜度可控', '日常张力'].slice(0, 3);
    const archiveWarnings = parseTags(writerForm.archiveWarningsText);
    const summary =
      (writerForm.workSummaryText && String(writerForm.workSummaryText).trim()) ||
      `以${a}与${b}的日常为主轴，在细碎的相处里埋下暧昧与误会，让故事在下一次相见前保持悬念。`;
    const chapterTitle = writerForm.chapterTitleText && String(writerForm.chapterTitleText).trim()
      ? String(writerForm.chapterTitleText).trim()
      : '第一章：把未说出口留到下一秒';
    const authorNotes = writerForm.authorNotesText && String(writerForm.authorNotesText).trim()
      ? String(writerForm.authorNotesText).trim()
      : '';
    const chapter = {
      chapterIndex: 1,
      title: chapterTitle,
      summary: '他们用同一条街的不同方向靠近；一句玩笑里藏着认真。',
      authorNotes,
      content: `（离线模式：尚未配置可用 API，内容为占位示例）\n\n${a}和${b}在某个平凡的傍晚相遇……（后续请在 Writer 里配置 API 后重新生成）`,
    };
    return {
      work: {
        title,
        pairing,
        rating: writerForm.ratingText,
        archiveWarnings,
        additionalTags,
        status: 'ongoing',
        summary,
      },
      chapter,
    };
  };

  const generateWorkAndFirstChapter = async () => {
    if (isGenerating.value) return;
    genError.value = '';
    isGenerating.value = true;
    try {
      const chars = Array.isArray(charactersRef?.value) ? charactersRef.value : [];
      const slotAId = String(writerForm.charAId ?? '');
      const slotBId = String(writerForm.charBId ?? '');
      if (slotAId === ME_ID && slotBId === ME_ID) {
        throw new Error('角色A/角色B 至少要选择一个“角色”（不能同时选“我”）。');
      }

      const charAReal = slotAId !== ME_ID ? (chars.find((c) => String(c.id) === slotAId) || chars[0] || null) : null;
      const charBReal = slotBId !== ME_ID ? (chars.find((c) => String(c.id) === slotBId) || chars[1] || chars[0] || null) : null;
      if (slotAId !== ME_ID && !charAReal) throw new Error('请先选择角色A。');
      if (slotBId !== ME_ID && !charBReal) throw new Error('请先选择角色B。');

      const charA = resolveSlotCharacter(slotAId, chars, charBReal);
      const charB = resolveSlotCharacter(slotBId, chars, charAReal);

      const worldbookText = writerForm.worldbookId ? pickEnabledWorldbookText(writerForm.worldbookId) : '';
      const presetText = writerForm.presetId ? pickPresetText(writerForm.presetId) : '';

      const additionalTagsInput = parseTags(writerForm.tagsText);
      const archiveWarningsInput = parseTags(writerForm.archiveWarningsText);
      const pairingText = writerForm.pairingText.trim() || `${charA.nickname || charA.name}x${charB.nickname || charB.name}`;

      const offline = !activeProfileRef?.value?.endpoint || !activeProfileRef?.value?.key;
      if (offline) {
        const data = generateWorkAndFirstChapterOffline(charA, charB);
        await saveGeneratedWorkAndFirstChapter(data);
        return;
      }

      const systemPrompt = `你正在为 AO3 风格同人作品生成“作品元信息（Work）+ 第一章（Chapter）”。
- 只输出严格 JSON（不要 markdown，不要额外解释）
- JSON 必须能被 JSON.parse 解析
- 不要输出 null/undefined 字段；能给就给
- 章节正文使用中文，并用换行分段
- chapter.summary 要 3-5 句，用于后续续写的摘要
- 不要在正文里夹带“提示词/说明/提纲”。`;

      const workTitleLine =
        writerForm.workTitleText && String(writerForm.workTitleText).trim()
          ? writerForm.workTitleText.trim()
          : '（留空则由你生成）';

      const userPrompt = `请创作一个 AO3 风格同人作品（Work），并写出第一章（Chapter）。

角色（供写作使用）：
角色A：
${buildCharacterBlock(charA)}
角色B：
${buildCharacterBlock(charB)}

作品标题（可选；如填写，Work.title 请直接使用该标题）：
${workTitleLine}

章标题（可选；如填写，chapter.title 请直接使用该章节标题；留空则由 AI 生成）：
${writerForm.chapterTitleText && String(writerForm.chapterTitleText).trim() ? String(writerForm.chapterTitleText).trim() : '（留空则由你生成）'}

作者的话（可选；如填写，chapter.authorNotes 请直接使用该文本；留空则由 AI 生成或留空）：
${writerForm.authorNotesText && String(writerForm.authorNotesText).trim() ? String(writerForm.authorNotesText).trim() : '（留空则由你生成或留空）'}

关系（pairing/relationship）：${pairingText}
评级（rating）：${writerForm.ratingText || 'PG-13'}

归档警告（archive warnings，数组；可留空由你推断）：
${archiveWarningsInput.length ? archiveWarningsInput.join(', ') : '（留空则由你推断）'}

额外标签（additional tags，数组；可留空由你推断）： 
${additionalTagsInput.length ? additionalTagsInput.join(', ') : '（留空则由你推断）'}

作品简介偏好（summary；可留空由你生成）：
${writerForm.workSummaryText && String(writerForm.workSummaryText).trim() ? String(writerForm.workSummaryText).trim() : '（留空则由你生成）'}

世界书（可选）： 
${worldbookText || '(无)'}

写作预设/文风（可选）： 
${presetText || '(无)'}

长度档位：${lengthHint.value}
用户额外指令（可选）：${writerForm.userInstruction || '(无)'}

输出 JSON（必须且只能输出该 JSON 对象）：
{
  "work": {
    "title": "...",
    "pairing": "...",
    "rating": "...",
    "archiveWarnings": ["..."],
    "additionalTags": ["..."],
    "status": "ongoing",
    "summary": "..."
  },
  "chapter": {
    "chapterIndex": 1,
    "title": "...",
    "summary": "...",
    "authorNotes": "...",
    "content": "完整正文..."
  }
}`;

      const content = await callChatCompletions(activeProfileRef, systemPrompt, userPrompt, { temperature: 0.85, max_tokens: 2600 });
      let parsed = safeJsonParse(content);
      // 兼容：模型直接返回正文文本时，兜底转成可保存结构
      if (!parsed?.work || !parsed?.chapter) {
        const fallbackText = stripMarkdownFences(content);
        if (fallbackText && fallbackText.length >= 80) {
          parsed = {
            work: {
              title: writerForm.workTitleText?.trim() || '未命名作品',
              pairing: writerForm.pairingText?.trim() || '',
              rating: writerForm.ratingText || 'PG-13',
              archiveWarnings: parseTags(writerForm.archiveWarningsText),
              additionalTags: parseTags(writerForm.tagsText),
              status: 'ongoing',
              summary: writerForm.workSummaryText?.trim() || '',
            },
            chapter: {
              chapterIndex: 1,
              title: writerForm.chapterTitleText?.trim() || '第一章',
              summary: '',
              authorNotes: writerForm.authorNotesText?.trim() || '',
              content: fallbackText,
            },
          };
        }
      }
      if (!parsed?.work || !parsed?.chapter) throw new Error('AI 返回的 JSON 结构不正确');
      const chapterText = pickChapterContent(parsed.chapter);
      if (!chapterText || !chapterText.trim() || chapterText.trim().length < 80) {
        throw new Error('AI 未返回有效正文（chapter.content 为空/过短）。可尝试：降低长度档位或重新生成。');
      }
      await saveGeneratedWorkAndFirstChapter(parsed);
    } catch (e) {
      genError.value = e?.message || String(e);
      alert(`生成失败：${genError.value}`);
    } finally {
      isGenerating.value = false;
    }
  };

  const generateNextChapter = async () => {
    if (isGenerating.value) return;
    genError.value = '';
    isGenerating.value = true;
    try {
      const work = activeWork.value;
      if (!work) throw new Error('请先选择一个作品');

      const nextIndex = getNextChapterIndexForWork(work.id);

      const chars = Array.isArray(charactersRef?.value) ? charactersRef.value : [];
      const slotAId = String(writerForm.charAId ?? '');
      const slotBId = String(writerForm.charBId ?? '');
      if (slotAId === ME_ID && slotBId === ME_ID) {
        throw new Error('角色A/角色B 至少要选择一个“角色”（不能同时选“我”）。');
      }
      const charAReal = slotAId !== ME_ID ? (chars.find((c) => String(c.id) === slotAId) || chars[0] || null) : null;
      const charBReal = slotBId !== ME_ID ? (chars.find((c) => String(c.id) === slotBId) || (chars[1] || chars[0]) || null) : null;
      if (slotAId !== ME_ID && !charAReal) throw new Error('请先选择角色A。');
      if (slotBId !== ME_ID && !charBReal) throw new Error('请先选择角色B。');
      const charA = resolveSlotCharacter(slotAId, chars, charBReal);
      const charB = resolveSlotCharacter(slotBId, chars, charAReal);

      const worldbookText = writerForm.worldbookId ? pickEnabledWorldbookText(writerForm.worldbookId) : '';
      const presetText = writerForm.presetId ? pickPresetText(writerForm.presetId) : '';

      const offline = !activeProfileRef?.value?.endpoint || !activeProfileRef?.value?.key;
      if (offline) {
        const chapterTitle =
          writerForm.chapterTitleText && String(writerForm.chapterTitleText).trim()
            ? String(writerForm.chapterTitleText).trim()
            : `第${nextIndex}章：续写占位`;
        const authorNotes =
          writerForm.authorNotesText && String(writerForm.authorNotesText).trim()
            ? String(writerForm.authorNotesText).trim()
            : '';
        const chapter = {
          chapterIndex: nextIndex,
          title: chapterTitle,
          summary: '（离线占位）',
          authorNotes,
          content: `（离线模式：尚未配置可用 API，内容为占位示例）\n\n${work.title} 第${nextIndex}章：在前文的张力里继续向前……（后续请配置 API 并重新生成）`,
        };
        await saveGeneratedNextChapter(work.id, chapter);
        return;
      }

      const allChs = activeChaptersSorted.value;
      const latest = allChs.length ? allChs[allChs.length - 1] : null;
      const prev = allChs.length >= 2 ? allChs[allChs.length - 2] : null;

      const contextTail = latest?.content ? String(latest.content).slice(-1400) : '';
      const lastSummary = latest?.summary || '';
      const prevSummary = prev?.summary || '';

      const systemPrompt = `你正在续写一部 AO3 风格的同人作品（下一章）。
- 只输出严格 JSON（不要 markdown，不要额外解释）
- JSON 必须能被 JSON.parse 解析
- 延续人物关系、叙事口吻、张力节奏与“标签/警告”设定
- chapter.summary 要 3-5 句
- 不要复述提示信息，直接给正文（content）。`;

      const archiveWarnings = Array.isArray(work.archiveWarnings) ? work.archiveWarnings : [];
      const additionalTags = Array.isArray(work.additionalTags)
        ? work.additionalTags
        : Array.isArray(work.tags)
          ? work.tags
          : [];

      const userPrompt = `请续写《${work.title}》（${work.pairing || '关系未知'}）。

作品摘要：
${work.summary || '(无)'}

归档警告：
${archiveWarnings.length ? archiveWarnings.join(', ') : '（无）'}

额外标签：
${additionalTags.length ? additionalTags.slice(0, 10).join(', ') : '（无）'}

目标：生成下一章（chapterIndex=${nextIndex}）
最近章节摘要：
${lastSummary || '(无)'}
倒数第二章摘要：
${prevSummary || '(无)'}
最新章节尾部节选（用于延续语境，可借用细节但不要原样复制）：
${contextTail || '(无)'}

角色（供写作使用）：
角色A：
${buildCharacterBlock(charA)}
角色B：
${buildCharacterBlock(charB)}

世界书（可选）：
${worldbookText || '(无)'}

写作预设/文风（可选）：
${presetText || '(无)'}

用户额外指令：
${writerForm.userInstruction || '(无)'}

章标题偏好（可留空则由 AI 生成）：
${writerForm.chapterTitleText && String(writerForm.chapterTitleText).trim() ? String(writerForm.chapterTitleText).trim() : '（留空则由你生成）'}

作者的话（author notes；可留空则 AI 生成或留空）：
${writerForm.authorNotesText && String(writerForm.authorNotesText).trim() ? String(writerForm.authorNotesText).trim() : '（留空则由你生成或留空）'}

长度档位：
${lengthHint.value}

输出 JSON（必须且只能输出该 JSON 对象）：
{
  "chapter": {
    "chapterIndex": ${nextIndex},
    "title": "...",
    "summary": "...",
    "authorNotes": "...",
    "content": "完整正文..."
  }
}`;

      const content = await callChatCompletions(activeProfileRef, systemPrompt, userPrompt, { temperature: 0.85, max_tokens: 2600 });
      let parsed = safeJsonParse(content);
      // 兼容：模型直接返回正文文本时，兜底保存为下一章
      if (!parsed?.chapter) {
        const fallbackText = stripMarkdownFences(content);
        if (fallbackText && fallbackText.length >= 80) {
          parsed = {
            chapter: {
              chapterIndex: nextIndex,
              title: writerForm.chapterTitleText?.trim() || `第${nextIndex}章`,
              summary: '',
              authorNotes: writerForm.authorNotesText?.trim() || '',
              content: fallbackText,
            },
          };
        }
      }
      if (!parsed?.chapter) throw new Error('AI 返回的 JSON 结构不正确');
      const chapterText = pickChapterContent(parsed.chapter);
      if (!chapterText || !chapterText.trim() || chapterText.trim().length < 80) {
        throw new Error('AI 未返回有效正文（chapter.content 为空/过短）。可尝试：降低长度档位或重新生成。');
      }
      await saveGeneratedNextChapter(work.id, parsed.chapter);
    } catch (e) {
      genError.value = e?.message || String(e);
      alert(`生成失败：${genError.value}`);
    } finally {
      isGenerating.value = false;
    }
  };

  const init = async () => {
    try {
      const db = await openReadDB();
      dbRef.value = db;
      const [w, c, b, k, com] = await Promise.all([
        idbGetAll(db, 'works'),
        idbGetAll(db, 'chapters'),
        idbGetAll(db, 'bookmarks'),
        idbGetAll(db, 'kudos'),
        idbGetAll(db, 'comments'),
      ]);
      works.value = Array.isArray(w) ? w : [];
      // Backward compatible migration for old data:
      // - older records might only have `tags` (combined), now we split into additionalTags/ archiveWarnings.
      works.value = (works.value || []).map((work) => {
        const archiveWarnings = Array.isArray(work.archiveWarnings) ? work.archiveWarnings : [];
        const additionalTags = Array.isArray(work.additionalTags)
          ? work.additionalTags
          : Array.isArray(work.tags)
            ? work.tags
            : [];
        return {
          ...work,
          archiveWarnings,
          additionalTags,
          tags: Array.isArray(work.tags) ? work.tags : Array.from(new Set([...(archiveWarnings || []), ...(additionalTags || [])])),
        };
      });
      chapters.value = Array.isArray(c) ? c : [];
      bookmarks.value = Array.isArray(b) ? b : [];
      kudos.value = Array.isArray(k) ? k : [];
      comments.value = Array.isArray(com) ? com : [];
    } catch (e) {
      console.error('ReadDB 初始化失败:', e);
      alert(`ReadDB 初始化失败：${e?.message || e}`);
    }
  };

  loadReaderBackgroundFromStorage();
  loadReaderPrefsFromStorage();
  onMounted(() => init());

  watch(
    () => [readerPrefs.fontSize, readerPrefs.lineHeight, readerPrefs.contentWidth, readerPrefs.overlayOpacity, readerPrefs.textColor, readerPrefs.fontFamily],
    () => saveReaderPrefs(),
    { deep: false },
  );

  watch(works, (list) => {
    if (activeWorkId.value && !list.some((w) => String(w.id) === String(activeWorkId.value))) {
      goExplore();
    }
  });

  return {
    // state
    view,
    works,
    chapters,
    bookmarks,
    kudos,
    comments,
    filteredWorks,
    selectedWarningTags,
    selectedAdditionalTags,
    allWarningTags,
    allAdditionalTags,
    activeWorkId,
    activeChapterId,
    activeWork,
    activeChaptersSorted,
    activeChapter,
    searchQuery,

    readerBackgroundUrl,
    readerPrefs,
    readerFontOptions,
    readerPreviewText,
    saveReaderBackground,
    resetReaderBackground,
    saveReaderPrefs,
    resetReaderPrefs,
    readAppBackgroundStyle,
    readerBodyStyle,
    defaultReadBgUrl: DEFAULT_READ_BG_URL,

    // writer
    writerMode,
    writerForm,
    lengthHint,
    isGenerating,
    genError,
    openWriterCreate,
    openWriterContinue,
    generateWorkAndFirstChapter,
    generateNextChapter,

    // navigation
    openWork,
    openReader,
    backToDetail,
    goPrevChapter,
    goNextChapter,
    goExplore,
    openSettings,

    // community
    isBookmarked,
    toggleBookmark,
    isKudoed,
    toggleKudos,
    toggleWarningTag,
    toggleAdditionalTag,
    clearSelectedTags,
    kudosCountForWork,
    commentCountForWork,
    newCommentInput,
    replyToCommentId,
    replyInput,
    activeWorkCommentsTree,
    submitNewComment,
    isGeneratingComment,
    generateWorkComment,
    submitReply,
    openReply: (commentId) => {
      replyToCommentId.value = commentId;
      replyInput.value = '';
    },
    cancelReply: () => {
      replyToCommentId.value = null;
      replyInput.value = '';
    },

    // utils
    formatTime,
  };
}


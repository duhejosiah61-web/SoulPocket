import { ref, computed, watch, onMounted, onUnmounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { buildChatCompletionUrlCandidates, callAI } from './api.js';
import { getPhoneState, putPhoneState, getGlobalState, putGlobalState, migratePeekLocalStorageToIdb } from './peekDb.js';

const APP_DEFS = [
    { id: 'messages', name: '消息', icon: 'fa-comments' },
    { id: 'todo', name: '待办', icon: 'fa-list-check' },
    { id: 'map', name: '地图', icon: 'fa-map-location-dot' },
    { id: 'wallet', name: '钱包', icon: 'fa-wallet' },
    { id: 'calendar', name: '日历', icon: 'fa-calendar-days' },
    { id: 'health', name: '健康', icon: 'fa-heart-pulse' },
    { id: 'mail', name: '邮件', icon: 'fa-envelope' },
    { id: 'album', name: '相册', icon: 'fa-image' },
    { id: 'notes', name: '备忘', icon: 'fa-note-sticky' },
    { id: 'browser', name: '浏览器', icon: 'fa-globe' },
    { id: 'files', name: '文件', icon: 'fa-folder' },
    { id: 'diary', name: '日记', icon: 'fa-book' },
    { id: 'bank', name: '银行卡', icon: 'fa-credit-card' }
];

const DOCK_APPS = [
    { id: 'messages', name: '消息', icon: 'fa-comments' },
    { id: 'todo', name: '待办', icon: 'fa-list-check' },
    { id: 'map', name: '地图', icon: 'fa-map-location-dot' },
    { id: 'album', name: '相册', icon: 'fa-image' }
];

const DEFAULT_PHONE_STATE_VERSION = 1;
const createDefaultPhoneState = (char) => {
    const now = Date.now();
    const name = char?.nickname || char?.name || 'TA';
    return {
        version: DEFAULT_PHONE_STATE_VERSION,
        meta: {
            createdAt: now,
            lastGeneratedAt: 0,
            wallpaper: null,
            deviceLabel: `${name} 的手机`,
            timezone: null
        },
        home: {
            dock: DOCK_APPS.map((a) => a.id),
            badges: {},
            widgets: { weatherEnabled: true, photosEnabled: true }
        },
        cursors: {
            diaryTs: 0,
            todoTs: 0,
            mapTs: 0,
            walletTs: 0,
            calendarTs: 0,
            healthTs: 0,
            mailTs: 0,
            notesTs: 0,
            messagesTs: 0,
            photosTs: 0,
            browserTs: 0,
            filesTs: 0
        },
        apps: {
            messages: [],
            calls: [],
            photos: [],
            notes: [],
            browserHistory: [],
            files: [],
            diaryEntries: [],
            bankAccount: { balance: 0, monthlySpend: 0, records: [] },
            mapTracks: [],
            todoItems: [],
            calendarEvents: [],
            wallet: { balance: 0, records: [] },
            health: { steps: [], sleep: [] },
            mailThreads: []
        }
    };
};

// Legacy localStorage helpers removed; persisted via IndexedDB in peekDb.js

const hashToHue = (s) => {
    const str = String(s || '');
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 360;
};

const makeMockPhoto = (seed, idx) => {
    const base = seed || 'portrait';
    const hue = hashToHue(`${base}_${idx}`);
    const bgColor = `hsl(${hue}, 55%, 78%)`;
    const bgColor2 = `hsl(${(hue + 40) % 360}, 55%, 70%)`;
    const description = `${base}·${['夜景', '咖啡桌', '城市窗', '街灯'][idx % 4]}`;
    return {
        id: `mock_${hashToHue(description)}_${idx}`,
        description,
        bgColor,
        bgColor2
    };
};

const samplePhotos = (seedName) => [0, 1, 2, 3].map((i) => makeMockPhoto(seedName, i));
// 密码更像“角色自己会改”的：不固定每日轮换。
// 1) 角色在 SoulLink 里明确给出新密码（4位）→ 立即生效并记住
// 2) 没有明确给出时，仍有一个“本地持久密码”作为兜底，但不展示规则/到期时间
const getPeekPasscodeStoreKey = (charId) => `peek_passcode_v2_${String(charId || '')}`;
const readPeekPasscodeStore = (charId) => {
    if (!charId) return null;
    try {
        const raw = localStorage.getItem(getPeekPasscodeStoreKey(charId));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};
const savePeekPasscodeStore = (charId, data) => {
    if (!charId) return;
    try {
        localStorage.setItem(getPeekPasscodeStoreKey(charId), JSON.stringify(data || {}));
    } catch {
        // ignore
    }
};
const randomInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const make4Digit = (n) => String(Math.abs(Number(n || 0)) % 10000).padStart(4, '0');
const hashU32 = (s) => {
    const str = String(s || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0;
};
const extractPeekPasscode = (text) => {
    const t = String(text || '');
    if (!t) return '';
    // 1) 优先：连续 4 位数字
    const hit4 = t.match(/(?<!\d)(\d{4})(?!\d)/);
    if (hit4 && hit4[1]) return hit4[1];
    // 2) 兼容：连续 5-6 位数字（有的人会顺嘴报多位），取最后 4 位做锁屏码
    const hit56 = t.match(/(?<!\d)(\d{5,6})(?!\d)/);
    if (hit56 && hit56[1]) return hit56[1].slice(-4);
    // 3) 兼容：用空格/短横分隔的 4 位数字，例如“4 8 2 1”/“48-21”
    const hitSep = t.match(/(?<!\d)(\d)[\s\-_.](\d)[\s\-_.](\d)[\s\-_.](\d)(?!\d)/);
    if (hitSep) return `${hitSep[1]}${hitSep[2]}${hitSep[3]}${hitSep[4]}`;
    return '';
};
const pickInitialPasscode = (char) => {
    // 稍微有“人的随机感”：基于角色信息做一个稳定起点，再掺当前日期与少量随机盐
    const d = new Date();
    const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const base = `${char?.id || ''}|${char?.name || ''}|${char?.nickname || ''}|${dayKey}|${Math.random()}`;
    return make4Digit(hashU32(base));
};

export function usePeek(charactersRef, activeProfileRef, soulLinkMessagesRef, soulLinkGroupsRef) {
    const globalState = ref({ peekSelectedCharacterId: '', peekDark: true });
    const phoneState = ref(null);
    const isPeekHydrated = ref(false);

    const peekSelectedCharacterId = ref('');
    const peekInnerApp = ref('home');
    const peekSearch = ref('');
    const peekDark = ref(true);

    const peekSelectedCharacter = computed(() => {
        const chars = Array.isArray(charactersRef?.value) ? charactersRef.value : [];
        return chars.find((c) => String(c.id) === String(peekSelectedCharacterId.value)) || null;
    });

    const peekStatusTime = ref('');
    // Peek 锁屏已移除：默认不进入锁屏，避免用户看到黑屏/锁屏遮罩
    const peekLocked = ref(false);
    const peekPasscodeInput = ref('');
    const peekLockHint = ref(' ');
    const peekWrongAttempts = ref(0);
    const peekLockoutUntil = ref(0);
    let statusTick;
    const tickStatus = () => {
        const now = new Date();
        peekStatusTime.value = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    };
    onMounted(() => {
        tickStatus();
        statusTick = setInterval(tickStatus, 1000);
    });
    onUnmounted(() => {
        if (statusTick) clearInterval(statusTick);
    });

    const peekPhoneTitle = computed(() => {
        const name = peekSelectedCharacter.value?.nickname || peekSelectedCharacter.value?.name || '未选择角色';
        return `${name} 的手机`;
    });
    const peekEffectivePasscode = ref(''); // 当前生效密码（来自 SoulLink 或本地兜底）
    const peekSharedPasscodeFromSoulLink = computed(() => {
        const charId = String(peekSelectedCharacterId.value || '');
        if (!charId) return '';
        const rows = Array.isArray(soulLinkMessagesRef?.value?.[charId]) ? soulLinkMessagesRef.value[charId] : [];
        // 更像真人聊天：允许各种说法，只要“上下文在聊密码”且出现4位数字
        const keywordRe = /(密码|passcode|解锁|锁屏|手机|改了|换了|新密码|unlock|看你手机|看手机|给我看手机)/i;
        const hasNearbyPasswordTopic = (fromIndex) => {
            // 向前看最多 6 条，找到最近的用户消息里是否在聊密码/手机
            for (let j = fromIndex; j >= 0 && j >= fromIndex - 6; j--) {
                const p = rows[j];
                if (!p) continue;
                if (String(p.sender || '') !== 'user') continue;
                const userText = String(p.text || p.reply || p.osContent || '');
                if (keywordRe.test(userText)) return true;
            }
            return false;
        };
        for (let i = rows.length - 1; i >= 0; i--) {
            const m = rows[i];
            if (!m) continue;
            const sender = String(m.sender || '');
            const text = String(m.text || m.reply || m.osContent || '');
            if (!text) continue;
            const code = extractPeekPasscode(text);
            if (!code) continue;

            // 只认 AI 的数字，并且要求“同句关键词”或“附近用户在聊密码”
            if (sender !== 'ai') continue;
            if (keywordRe.test(text) || hasNearbyPasswordTopic(i - 1)) return code;
        }
        return '';
    });
    const ensureLocalPasscode = () => {
        const charId = String(peekSelectedCharacterId.value || '');
        const char = peekSelectedCharacter.value;
        if (!charId || !char) return '';
        const existing = readPeekPasscodeStore(charId);
        if (existing && typeof existing.passcode === 'string' && /^\d{4}$/.test(existing.passcode)) {
            return existing.passcode;
        }
        const next = pickInitialPasscode(char);
        savePeekPasscodeStore(charId, { passcode: next, updatedAt: Date.now() });
        return next;
    };
    const syncEffectivePasscode = () => {
        const charId = String(peekSelectedCharacterId.value || '');
        if (!charId) return;
        const fromSoul = peekSharedPasscodeFromSoulLink.value;
        if (fromSoul && /^\d{4}$/.test(fromSoul)) {
            const prev = readPeekPasscodeStore(charId);
            if (!prev || prev.passcode !== fromSoul) {
                savePeekPasscodeStore(charId, { passcode: fromSoul, updatedAt: Date.now(), source: 'soulLink' });
            }
            peekEffectivePasscode.value = fromSoul;
            return;
        }
        peekEffectivePasscode.value = ensureLocalPasscode();
    };
    const peekLockoutRemainSec = computed(() => {
        peekStatusTime.value;
        const remain = Math.max(0, Number(peekLockoutUntil.value || 0) - Date.now());
        return Math.ceil(remain / 1000);
    });

    const peekWidgetGreeting = computed(() => {
        const h = new Date().getHours();
        if (h >= 5 && h < 12) return '早安';
        if (h >= 12 && h < 18) return '下午好';
        if (h >= 18 && h < 22) return '晚上好';
        return '夜深了';
    });
    const peekWidgetDate = computed(() => {
        peekStatusTime.value;
        return new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    });
    const peekWidgetWeather = computed(() => {
        peekStatusTime.value;
        const temps = ['18°', '22°', '24°', '26°', '20°', '19°'];
        const idx = (new Date().getDate() + new Date().getHours()) % temps.length;
        const conds = ['晴', '多云', '阴', '晴'];
        const c = conds[idx % conds.length];
        return `${c} ${temps[idx]}`;
    });
    const peekDiaryEntries = ref([]);
    const peekBankAccount = ref({ balance: 0, monthlySpend: 0, records: [] });
    const peekMapTracks = ref([]);
    const peekTodoItems = ref([]);
    const peekCalendarEvents = ref([]);
    const peekWallet = ref({ balance: 0, records: [] });
    const peekHealth = ref({ steps: [], sleep: [] });
    const peekMailThreads = ref([]);
    const peekAiLastGeneratedAt = ref('');
    const peekAiGenerating = ref(false);
    const peekAiError = ref('');
    const getCursorTs = (key) => {
        const st = phoneState.value;
        const c = st?.cursors || {};
        const v = Number(c?.[key] || 0);
        return Number.isFinite(v) ? v : 0;
    };
    const setCursorTs = (key, ts) => {
        const st = phoneState.value;
        if (!st) return;
        st.cursors = st.cursors || {};
        st.cursors[key] = Number(ts || 0) || 0;
    };

    const formatTs = (ts) => {
        try {
            if (!ts) return '';
            const d = new Date(Number(ts) || 0);
            return d.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch {
            return '';
        }
    };

    const getCharDisplayName = (char) => char?.nickname || char?.name || 'TA';

    const formatMessageForDiary = (m, char) => {
        if (!m) return null;
        if (m.isSystem || m.sender === 'system' || m.isHidden) return null;
        if (m.sender !== 'user' && m.sender !== 'ai') return null;

        const roleName = getCharDisplayName(char);
        const speaker = m.sender === 'user'
            ? (m.senderName || '用户')
            : (m.senderName || roleName);

        let content = '';
        if (typeof m.text === 'string' && m.text.trim()) {
            content = m.text.trim();
        } else if (m.messageType === 'transfer') {
            content = `[转账] ${m.amount ?? ''} ${m.note ? `（${m.note}）` : ''}`.trim();
        } else if (m.messageType === 'helpBuy') {
            content = `[帮买请求] ${m.item ?? ''} 价格${m.price ?? ''}`.trim();
        } else if (m.messageType === 'order') {
            content = `[订单] ${m.item ?? ''} 价格${m.price ?? ''}`.trim();
        } else if (m.messageType === 'image') {
            // 图片统一用“文字假装图”的形式进入日记上下文
            content = m.text && m.text.trim() && m.text !== '图片'
                ? `[图片] ${m.text.trim()}`
                : `[图片]（聊天图片）`;
        } else if (m.messageType === 'voice') {
            const t = m.transcription || m.text || '';
            content = t ? `[语音] ${String(t).trim()}` : '[语音]';
        } else if (m.messageType === 'textImage') {
            content = `[文字图] ${m.textImageText || m.text || ''}`.trim();
        } else {
            content = '[消息]';
        }

        const tsNum = Number(m.timestamp ?? 0) || 0;
        const ts = formatTs(tsNum);
        const prefix = ts ? `${ts}` : '（时间未知）';
        return { ts: tsNum, line: `${prefix} ${speaker}: ${content}` };
    };

    const collectChatSinceDiary = (char, startTs, endTs) => {
        const roleName = getCharDisplayName(char);
        const msgsObj = soulLinkMessagesRef?.value || {};
        const direct = Array.isArray(msgsObj?.[String(char?.id)]) ? msgsObj[String(char.id)] : (Array.isArray(msgsObj?.[char?.id]) ? msgsObj[char.id] : []);

        const fromDirect = direct
            .filter((m) => (m?.timestamp ?? 0) >= startTs && (m?.timestamp ?? 0) <= endTs)
            .map((m) => formatMessageForDiary(m, char))
            .filter(Boolean)
            .map((x) => x);

        const groups = Array.isArray(soulLinkGroupsRef?.value) ? soulLinkGroupsRef.value : [];
        const fromGroups = [];
        for (const g of groups) {
            const history = Array.isArray(g?.history) ? g.history : [];
            for (const m of history) {
                const ts = Number(m?.timestamp ?? 0);
                if (ts < startTs || ts > endTs) continue;
                const speakerOk = m?.sender === 'user' || m?.sender === 'ai';
                if (!speakerOk) continue;
                // 只保留“用户 + 选中角色”相关消息
                if (m?.sender === 'ai') {
                    const sn = m?.senderName || '';
                    if (!sn || (sn !== roleName && sn !== char?.name && sn !== char?.nickname)) continue;
                }
                const line = formatMessageForDiary(m, char);
                if (line) fromGroups.push(line);
            }
        }

        // 合并并按时间排序（line 本身已经包含时间字符串，但我们用 timestamp 排序需要原对象）
        // 这里用一个简化策略：直接按直聊/群聊顺序追加，然后做一次时间字符串排序
        const all = [...fromDirect, ...fromGroups].filter(Boolean);
        all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        return all.map((x) => x.line);
    };

    const peekWidgetUnreadCount = computed(() => Math.min(peekMixedChatMessages.value.length, 99));
    const peekWidgetFirstNote = computed(() => peekNotes.value[0] || null);
    const peekWidgetPhotos = computed(() => peekPhotos.value.slice(0, 3));

    const peekApps = computed(() => APP_DEFS);
    const peekHomeApps = computed(() => {
        const dockIds = new Set(DOCK_APPS.map((a) => a.id));
        return peekApps.value.filter((a) => !dockIds.has(a.id));
    });
    const filteredPeekApps = computed(() => {
        const k = String(peekSearch.value || '').trim().toLowerCase();
        if (!k) return peekHomeApps.value;
        return peekHomeApps.value.filter((a) => a.name.toLowerCase().includes(k) || a.id.includes(k));
    });

    const peekMessages = ref([]);
    const peekCalls = ref([]);
    const peekNotes = ref([]);
    const peekPhotos = ref([]);
    const peekFiles = ref([]);
    const peekBrowserHistory = ref([]);
    const formatPeekMessageText = (m) => {
        if (typeof m?.text === 'string' && m.text.trim()) return m.text.trim();
        switch (m?.messageType) {
            case 'image': return '[图片]';
            case 'voice': return m?.transcription ? `[语音] ${m.transcription}` : '[语音]';
            case 'transfer': return `[转账] ${m?.amount ?? ''}`.trim();
            case 'order': return `[订单] ${m?.item ?? ''}`.trim();
            case 'helpBuy': return `[帮买] ${m?.item ?? ''}`.trim();
            case 'location': return '[位置]';
            default: return '[消息]';
        }
    };
    const formatPeekAt = (ts) => {
        const n = Number(ts || 0);
        if (!n) return '';
        try {
            return new Date(n).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch {
            return '';
        }
    };
    const peekSoulChatMessages = computed(() => {
        const charId = String(peekSelectedCharacterId.value || '');
        if (!charId) return [];
        const source = soulLinkMessagesRef?.value || {};
        const rows = Array.isArray(source[charId]) ? source[charId] : [];
        return rows
            .filter((m) => m && !m.isSystem && !m.isHidden && (m.sender === 'user' || m.sender === 'ai'))
            .map((m, idx) => ({
                id: m.id || m.timestamp || `peek_msg_${idx}`,
                sender: m.sender,
                text: formatPeekMessageText(m),
                at: formatPeekAt(m.timestamp),
                ts: Number(m.timestamp || 0) || 0
            }))
            .slice(-80);
    });
    const peekExternalChatMessages = computed(() => {
        const rows = Array.isArray(peekMessages.value) ? peekMessages.value : [];
        return rows
            .filter((m) => m && String(m.app || '') !== '系统提醒')
            .map((m, idx) => {
                const rawAt = String(m.at || '');
                const parsedTs = Number(m.ts || 0) || 0;
                return {
                    id: m.id || `peek_external_${idx}`,
                    sender: m.sender === 'user' ? 'user' : 'ai',
                    text: m.text ? `${m.app ? `【${m.app}】` : ''} ${m.text}`.trim() : (m.app || '[消息]'),
                    at: rawAt,
                    ts: parsedTs
                };
            })
            .slice(-50);
    });
    const peekMixedChatMessages = computed(() => {
        const all = [...peekSoulChatMessages.value, ...peekExternalChatMessages.value];
        all.sort((a, b) => {
            const ta = Number(a.ts || 0);
            const tb = Number(b.ts || 0);
            if (ta && tb) return ta - tb;
            if (ta && !tb) return -1;
            if (!ta && tb) return 1;
            return 0;
        });
        return all.slice(-120);
    });

    const collectLinkedSignals = (char) => {
        const charName = char?.nickname || char?.name || 'TA';
        const keys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i) || '';
            if (/soul|chat|mate|feed|post|schedule|track|bill|bank/i.test(k)) keys.push(k);
        }
        const snippets = keys.slice(0, 8).map((k) => {
            const raw = String(localStorage.getItem(k) || '');
            return { key: k, text: raw.slice(0, 180) };
        });
        return {
            charName,
            snippets,
            messages: peekMessages.value.slice(0, 6),
            notes: peekNotes.value.slice(0, 4),
            history: peekBrowserHistory.value.slice(0, 4)
        };
    };

    const generatePeekLinkedData = async () => {
        const char = peekSelectedCharacter.value;
        if (!char || peekAiGenerating.value) return;
        peekAiError.value = '';
        const profile = activeProfileRef?.value || null;
        if (!profile) {
            peekAiError.value = '未检测到可用 API 配置，请先在 Console 选择/填写激活配置。';
            return;
        }
        const endpoint = String(profile.endpoint || '').trim();
        const key = String(profile.key || '').trim();
        if (!endpoint || !key) {
            peekAiError.value = 'API 配置不完整：请在 Console 填写 endpoint 和 key。';
            return;
        }

        peekAiGenerating.value = true;
        try {
            const signals = collectLinkedSignals(char);
            const charId = char?.id;
            const nowTs = Date.now();
            const lastCursorTs = getCursorTs('diaryTs');
            const chatLines = collectChatSinceDiary(char, lastCursorTs, nowTs);
            const chatTranscript = (chatLines || []).join('\n');
            const chatTranscriptForPrompt = chatTranscript.length > 12000
                ? chatTranscript.slice(chatTranscript.length - 12000)
                : chatTranscript;

            const stableId = (prefix, obj) => {
                try {
                    const base = JSON.stringify(obj || {}).slice(0, 1200);
                    const n = hashU32(`${prefix}|${base}`);
                    return `${prefix}_${n}`;
                } catch {
                    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                }
            };

            const mergeById = (existingArr, incomingArr) => {
                const ex = Array.isArray(existingArr) ? existingArr : [];
                const inc = Array.isArray(incomingArr) ? incomingArr : [];
                const exIdSet = new Set(ex.map((e) => String(e?.id)));
                const exById = new Map(ex.map((e) => [String(e?.id), e]));
                const newOnes = [];
                for (const item of inc) {
                    const normalized = item && typeof item === 'object' ? { ...item } : null;
                    if (!normalized) continue;
                    let id = String(normalized?.id || '');
                    if (!id || id === 'undefined' || id === 'null') {
                        // 兼容：模型没给 id 时，生成一个稳定 id，避免整条被丢弃导致“同步成功但全空”
                        const hint = normalized.ts || normalized.at || normalized.day || normalized.text || normalized.title || normalized.item || '';
                        normalized.id = stableId('peek', { hint, ...normalized });
                        id = String(normalized.id);
                    }
                    if (exIdSet.has(id)) {
                        exById.set(id, normalized);
                    } else {
                        newOnes.push(normalized);
                        exIdSet.add(id);
                        exById.set(id, normalized);
                    }
                }
                const updatedExisting = ex.map((e) => exById.get(String(e?.id)) || e);
                return [...newOnes, ...updatedExisting];
            };

            let payload = null;
            try {
                const existingSummary = {
                    socialMessageIds: (Array.isArray(peekMessages.value) ? peekMessages.value : []).slice(0, 40).map((x) => String(x?.id || '')).filter(Boolean),
                    todoIds: (Array.isArray(peekTodoItems.value) ? peekTodoItems.value : []).slice(0, 60).map((x) => String(x?.id || '')).filter(Boolean),
                    calendarIds: (Array.isArray(peekCalendarEvents.value) ? peekCalendarEvents.value : []).slice(0, 60).map((x) => String(x?.id || '')).filter(Boolean),
                    walletRecordIds: (Array.isArray(peekWallet.value?.records) ? peekWallet.value.records : []).slice(0, 80).map((x) => String(x?.id || '')).filter(Boolean),
                    mailIds: (Array.isArray(peekMailThreads.value) ? peekMailThreads.value : []).slice(0, 60).map((x) => String(x?.id || '')).filter(Boolean),
                    diaryIds: (Array.isArray(peekDiaryEntries.value) ? peekDiaryEntries.value : []).slice(0, 80).map((x) => String(x?.id || '')).filter(Boolean),
                    bankRecordIds: (Array.isArray(peekBankAccount.value?.records) ? peekBankAccount.value.records : []).slice(0, 80).map((x) => String(x?.id || '')).filter(Boolean),
                    mapTrackIds: (Array.isArray(peekMapTracks.value) ? peekMapTracks.value : []).slice(0, 80).map((x) => String(x?.id || '')).filter(Boolean)
                };
                const prompt = `你是角色手机数据生成器。请仅返回 JSON，不要 markdown。
输出结构:
{
  "socialMessages":[{"id":"m1","app":"联系人或群名","text":"对话摘要","at":"HH:mm","ts":1710000000000}],
  "todoItems":[{"id":"t1","text":"...","due":"YYYY-MM-DD","done":false,"ts":1710000000000}],
  "calendarEvents":[{"id":"c1","title":"...","at":"YYYY-MM-DD HH:mm","location":"...","ts":1710000000000}],
  "wallet":{"balance":1234,"records":[{"id":"w1","item":"...","amount":-12,"at":"09:00","note":"...","ts":1710000000000}]},
  "health":{"steps":[{"id":"s1","day":"YYYY-MM-DD","count":8123}],"sleep":[{"id":"sl1","day":"YYYY-MM-DD","hours":7.2,"note":"..."}]},
  "mailThreads":[{"id":"e1","from":"...","subject":"...","preview":"...","at":"HH:mm","unread":true,"ts":1710000000000}],
  "diaryEntries":[{"id":"d1","title":"...","mood":"...","content":"..."}],
  "bankAccount":{"balance":1234,"monthlySpend":456,"records":[{"id":"b1","item":"...","amount":-12,"at":"09:00","ts":1710000000000}]},
  "mapTracks":[{"id":"m1","place":"...","at":"08:30","note":"...","ts":1710000000000}]
}
角色: ${JSON.stringify({ id: char.id, name: char.nickname || char.name || 'TA' })}
联动数据: ${JSON.stringify(signals)}
已有数据摘要（避免重复 id）：${JSON.stringify(existingSummary)}`;
                const diaryPromptBlock = `
上次日记生成时间戳（毫秒）: ${String(lastCursorTs)}
本次生成时间戳（毫秒）: ${String(nowTs)}
聊天增量记录（从上次到本次，包含“用户 + 选中角色”）： 
${chatTranscriptForPrompt || '（无增量聊天内容）'}
要求：
1) diaryEntries 只输出“新增日记条目”，不要输出旧条目的重复 id（保证可追加，不要覆盖旧日记）。
2) 如需提到图片，一律使用文字假装图格式，例如：[图片] 看到了一张夜景。
3) 日记内容必须基于上面的聊天增量记录生成。
4) 其它模块（socialMessages/todoItems/calendarEvents/wallet.records/mailThreads/mapTracks/bankAccount.records）只输出新增或更新条目；不要输出完全重复的旧条目；id 必须稳定且唯一。
5) 恋爱痕迹要“低频、轻柔、像不经意”：本次最多出现 0-1 条带“用户/我/你”的相关元素（例如 1 条代办或 1 条钱包备注即可），不要密集直球、不要每个模块都出现。
`;
                const finalPrompt = prompt + diaryPromptBlock;
                let content;
                try {
                    content = await callAI(
                        profile,
                        [
                            { role: 'system', content: '只输出合法 JSON。' },
                            { role: 'user', content: finalPrompt }
                        ],
                        {
                            temperature: 0.7,
                            max_tokens: 4000,
                            // DeepSeek/Grok 等网关：尽量强制 JSON 输出，减少 content_filter/空 delta
                            extraBody: { response_format: { type: 'json_object' } }
                        }
                    );
                } catch (err) {
                    const triedUrls = buildChatCompletionUrlCandidates(endpoint);
                    if (String(err?.message || '').includes('404') && triedUrls.length) {
                        peekAiError.value = `生成失败：接口 404。请检查 Console 的 endpoint。\n已尝试：\n${triedUrls.join('\n')}`;
                    } else {
                        peekAiError.value = `生成失败：${err?.message || '网络错误'}`;
                    }
                    return;
                }
                if (!content) {
                    peekAiError.value = '生成失败：API 返回内容为空。';
                    return;
                }
                const tryParseJsonFromText = (txt) => {
                    const s = String(txt || '').trim().replace(/```(?:json)?/gi, '').trim();
                    if (!s) return null;
                    try {
                        return JSON.parse(s);
                    } catch {
                        // 兼容：模型只返回了 JSON 片段（少外层 {}），例如 `"socialMessages":[...]`
                        // 这种情况下包一层 {} 再解析
                        const trimmed = s.trim();
                        if (!trimmed.startsWith('{')) {
                            const frag = trimmed.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '');
                            const looksLikeKv = /^"[^"]+"\s*:/.test(frag) || /^[A-Za-z_][\w]*\s*:/.test(frag);
                            if (looksLikeKv) {
                                try {
                                    return JSON.parse(`{${frag}}`);
                                } catch {
                                    // continue
                                }
                            }
                        }
                        // try first balanced {...}
                        const start = s.indexOf('{');
                        if (start < 0) return null;
                        let depth = 0;
                        let inStr = false;
                        let esc = false;
                        for (let i = start; i < s.length; i++) {
                            const ch = s[i];
                            if (inStr) {
                                if (esc) esc = false;
                                else if (ch === '\\') esc = true;
                                else if (ch === '"') inStr = false;
                                continue;
                            }
                            if (ch === '"') {
                                inStr = true;
                                continue;
                            }
                            if (ch === '{') depth += 1;
                            if (ch === '}') depth -= 1;
                            if (depth === 0) {
                                const cand = s.slice(start, i + 1);
                                try {
                                    return JSON.parse(cand);
                                } catch {
                                    return null;
                                }
                            }
                        }
                        return null;
                    }
                };
                payload = tryParseJsonFromText(content);
                if (!payload) {
                    const head = String(content || '').slice(0, 200);
                    peekAiError.value = `生成失败：响应非 JSON（或未包含可解析的 JSON 对象）。\n${head}`;
                    return;
                }
            } catch (error) {
                peekAiError.value = `生成失败：${error?.message || '网络错误'}`;
                return;
            }
            if (!payload || typeof payload !== 'object') {
                peekAiError.value = '生成失败：返回数据格式不正确。';
                return;
            }

            // 兼容：部分模型/网关把真正 JSON 塞进 { code: "..." } 或类似字段
            if (payload && typeof payload === 'object') {
                const codeText = typeof payload.code === 'string' ? payload.code : '';
                const onlyCode = Object.keys(payload).length === 1 && 'code' in payload;
                if ((onlyCode || codeText) && codeText) {
                    const recovered = tryParseJsonFromText(codeText);
                    if (recovered && typeof recovered === 'object') {
                        payload = recovered;
                    }
                }
            }

                // 追加/合并：不覆盖旧内容，生成后“在基础上变多”
                const beforeCounts = {
                    social: (Array.isArray(peekMessages.value) ? peekMessages.value.length : 0),
                    todo: (Array.isArray(peekTodoItems.value) ? peekTodoItems.value.length : 0),
                    calendar: (Array.isArray(peekCalendarEvents.value) ? peekCalendarEvents.value.length : 0),
                    walletRecords: (Array.isArray(peekWallet.value?.records) ? peekWallet.value.records.length : 0),
                    mail: (Array.isArray(peekMailThreads.value) ? peekMailThreads.value.length : 0),
                    diary: (Array.isArray(peekDiaryEntries.value) ? peekDiaryEntries.value.length : 0),
                    bankRecords: (Array.isArray(peekBankAccount.value?.records) ? peekBankAccount.value.records.length : 0),
                    map: (Array.isArray(peekMapTracks.value) ? peekMapTracks.value.length : 0)
                };
                const incomingSocial = Array.isArray(payload.socialMessages) ? payload.socialMessages : [];
                const incomingTodo = Array.isArray(payload.todoItems) ? payload.todoItems : [];
                const incomingCal = Array.isArray(payload.calendarEvents) ? payload.calendarEvents : [];
                const incomingWallet = payload.wallet && typeof payload.wallet === 'object' ? payload.wallet : null;
                const incomingHealth = payload.health && typeof payload.health === 'object' ? payload.health : null;
                const incomingMail = Array.isArray(payload.mailThreads) ? payload.mailThreads : [];
                const incomingDiary = Array.isArray(payload.diaryEntries) ? payload.diaryEntries : [];
                const incomingBank = payload.bankAccount || { balance: null, monthlySpend: null, records: [] };
                const incomingMap = Array.isArray(payload.mapTracks) ? payload.mapTracks : [];

                const incomingCounts = {
                    social: incomingSocial.length,
                    todo: incomingTodo.length,
                    calendar: incomingCal.length,
                    walletRecords: Array.isArray(incomingWallet?.records) ? incomingWallet.records.length : 0,
                    healthSteps: Array.isArray(incomingHealth?.steps) ? incomingHealth.steps.length : 0,
                    healthSleep: Array.isArray(incomingHealth?.sleep) ? incomingHealth.sleep.length : 0,
                    mail: incomingMail.length,
                    diary: incomingDiary.length,
                    bankRecords: Array.isArray(incomingBank?.records) ? incomingBank.records.length : 0,
                    map: incomingMap.length
                };

                if (incomingSocial.length > 0) {
                    peekMessages.value = mergeById(peekMessages.value, incomingSocial);
                }
                if (incomingTodo.length > 0) {
                    peekTodoItems.value = mergeById(peekTodoItems.value, incomingTodo);
                }
                if (incomingCal.length > 0) {
                    peekCalendarEvents.value = mergeById(peekCalendarEvents.value, incomingCal);
                }
                if (incomingWallet) {
                    const prev = peekWallet.value || { balance: 0, records: [] };
                    const merged = mergeById(Array.isArray(prev.records) ? prev.records : [], Array.isArray(incomingWallet.records) ? incomingWallet.records : []);
                    peekWallet.value = {
                        balance: typeof incomingWallet.balance === 'number' ? incomingWallet.balance : prev.balance,
                        records: merged
                    };
                }
                if (incomingHealth) {
                    const prev = peekHealth.value || { steps: [], sleep: [] };
                    const mergedSteps = mergeById(Array.isArray(prev.steps) ? prev.steps : [], Array.isArray(incomingHealth.steps) ? incomingHealth.steps : []);
                    const mergedSleep = mergeById(Array.isArray(prev.sleep) ? prev.sleep : [], Array.isArray(incomingHealth.sleep) ? incomingHealth.sleep : []);
                    peekHealth.value = { steps: mergedSteps, sleep: mergedSleep };
                }
                if (incomingMail.length > 0) {
                    peekMailThreads.value = mergeById(peekMailThreads.value, incomingMail);
                }
                peekDiaryEntries.value = mergeById(peekDiaryEntries.value, incomingDiary);

                const prevBank = peekBankAccount.value || { balance: 0, monthlySpend: 0, records: [] };
                const prevRecords = Array.isArray(prevBank.records) ? prevBank.records : [];
                const incomingRecords = Array.isArray(incomingBank.records) ? incomingBank.records : [];
                const mergedRecords = mergeById(prevRecords, incomingRecords);
                peekBankAccount.value = {
                    balance: typeof incomingBank.balance === 'number' ? incomingBank.balance : prevBank.balance,
                    monthlySpend: typeof incomingBank.monthlySpend === 'number' ? incomingBank.monthlySpend : prevBank.monthlySpend,
                    records: mergedRecords
                };

                peekMapTracks.value = mergeById(peekMapTracks.value, incomingMap);

                peekAiLastGeneratedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                setCursorTs('diaryTs', nowTs);
                setCursorTs('todoTs', nowTs);
                setCursorTs('mapTs', nowTs);
                setCursorTs('walletTs', nowTs);
                setCursorTs('calendarTs', nowTs);
                setCursorTs('healthTs', nowTs);
                setCursorTs('mailTs', nowTs);
                if (phoneState.value && phoneState.value.meta) phoneState.value.meta.lastGeneratedAt = nowTs;

                const afterCounts = {
                    social: (Array.isArray(peekMessages.value) ? peekMessages.value.length : 0),
                    todo: (Array.isArray(peekTodoItems.value) ? peekTodoItems.value.length : 0),
                    calendar: (Array.isArray(peekCalendarEvents.value) ? peekCalendarEvents.value.length : 0),
                    walletRecords: (Array.isArray(peekWallet.value?.records) ? peekWallet.value.records.length : 0),
                    mail: (Array.isArray(peekMailThreads.value) ? peekMailThreads.value.length : 0),
                    diary: (Array.isArray(peekDiaryEntries.value) ? peekDiaryEntries.value.length : 0),
                    bankRecords: (Array.isArray(peekBankAccount.value?.records) ? peekBankAccount.value.records.length : 0),
                    map: (Array.isArray(peekMapTracks.value) ? peekMapTracks.value.length : 0)
                };
                const changed =
                    afterCounts.social !== beforeCounts.social ||
                    afterCounts.todo !== beforeCounts.todo ||
                    afterCounts.calendar !== beforeCounts.calendar ||
                    afterCounts.walletRecords !== beforeCounts.walletRecords ||
                    afterCounts.mail !== beforeCounts.mail ||
                    afterCounts.diary !== beforeCounts.diary ||
                    afterCounts.bankRecords !== beforeCounts.bankRecords ||
                    afterCounts.map !== beforeCounts.map;
                if (!changed) {
                    peekAiError.value =
                        `本次联动未新增任何内容。\n` +
                        `返回字段：${Object.keys(payload || {}).join(',')}\n` +
                        `返回数量：${JSON.stringify(incomingCounts)}`;
                }
        } finally {
            peekAiGenerating.value = false;
        }
    };

    const syncRefsFromPhoneState = () => {
        const st = phoneState.value;
        const apps = st?.apps || {};
        peekMessages.value = Array.isArray(apps.messages) ? apps.messages : [];
        peekCalls.value = Array.isArray(apps.calls) ? apps.calls : [];
        peekNotes.value = Array.isArray(apps.notes) ? apps.notes : [];
        peekPhotos.value = Array.isArray(apps.photos) ? apps.photos : [];
        peekFiles.value = Array.isArray(apps.files) ? apps.files : [];
        peekBrowserHistory.value = Array.isArray(apps.browserHistory) ? apps.browserHistory : [];
        peekDiaryEntries.value = Array.isArray(apps.diaryEntries) ? apps.diaryEntries : [];
        peekBankAccount.value = apps.bankAccount && typeof apps.bankAccount === 'object' ? apps.bankAccount : { balance: 0, monthlySpend: 0, records: [] };
        peekMapTracks.value = Array.isArray(apps.mapTracks) ? apps.mapTracks : [];
        peekTodoItems.value = Array.isArray(apps.todoItems) ? apps.todoItems : [];
        peekCalendarEvents.value = Array.isArray(apps.calendarEvents) ? apps.calendarEvents : [];
        peekWallet.value = apps.wallet && typeof apps.wallet === 'object' ? apps.wallet : { balance: 0, records: [] };
        peekHealth.value = apps.health && typeof apps.health === 'object' ? apps.health : { steps: [], sleep: [] };
        peekMailThreads.value = Array.isArray(apps.mailThreads) ? apps.mailThreads : [];
    };

    const syncPhoneStateFromRefs = () => {
        const st = phoneState.value;
        if (!st) return;
        st.apps = st.apps || {};
        st.apps.messages = Array.isArray(peekMessages.value) ? peekMessages.value : [];
        st.apps.calls = Array.isArray(peekCalls.value) ? peekCalls.value : [];
        st.apps.notes = Array.isArray(peekNotes.value) ? peekNotes.value : [];
        st.apps.photos = Array.isArray(peekPhotos.value) ? peekPhotos.value : [];
        st.apps.files = Array.isArray(peekFiles.value) ? peekFiles.value : [];
        st.apps.browserHistory = Array.isArray(peekBrowserHistory.value) ? peekBrowserHistory.value : [];
        st.apps.diaryEntries = Array.isArray(peekDiaryEntries.value) ? peekDiaryEntries.value : [];
        st.apps.bankAccount = peekBankAccount.value || { balance: 0, monthlySpend: 0, records: [] };
        st.apps.mapTracks = Array.isArray(peekMapTracks.value) ? peekMapTracks.value : [];
        st.apps.todoItems = Array.isArray(peekTodoItems.value) ? peekTodoItems.value : [];
        st.apps.calendarEvents = Array.isArray(peekCalendarEvents.value) ? peekCalendarEvents.value : [];
        st.apps.wallet = peekWallet.value || { balance: 0, records: [] };
        st.apps.health = peekHealth.value || { steps: [], sleep: [] };
        st.apps.mailThreads = Array.isArray(peekMailThreads.value) ? peekMailThreads.value : [];
    };

    const rebuildCharacterData = async (char) => {
        const charId = String(char?.id || '');
        if (!charId) return;
        const cached = await getPhoneState(charId);
        if (cached && typeof cached === 'object') {
            phoneState.value = cached;
            syncRefsFromPhoneState();
            const lastGen = Number(cached?.meta?.lastGeneratedAt || 0);
            peekAiLastGeneratedAt.value = lastGen ? formatTs(lastGen).slice(-5) : '';
            return;
        }
        phoneState.value = createDefaultPhoneState(char);
        syncRefsFromPhoneState();
        await putPhoneState(charId, phoneState.value);
    };

    const selectPeekCharacter = (id) => {
        peekSelectedCharacterId.value = String(id || '');
        peekLocked.value = false;
        peekInnerApp.value = 'home';
    };

    const openPeekInnerApp = (appId) => {
        peekInnerApp.value = appId || 'home';
    };

    const closePeekInnerApp = () => {
        peekInnerApp.value = 'home';
    };

    const getPeekAppName = (appId) => {
        const hit = APP_DEFS.find((a) => a.id === appId);
        return hit ? hit.name : '应用';
    };

    const getPeekBadgeCount = (appId) => {
        const id = String(appId || '');
        if (!id) return 0;
        if (id === 'messages') return Number(peekWidgetUnreadCount.value || 0) || 0;
        if (id === 'mail') {
            const rows = Array.isArray(peekMailThreads.value) ? peekMailThreads.value : [];
            return rows.reduce((sum, t) => sum + (t?.unread ? 1 : 0), 0);
        }
        return 0;
    };

    const unlockPeek = () => {
        if (peekLockoutRemainSec.value > 0) return false;
        const input = String(peekPasscodeInput.value || '');
        if (input.length !== 4) {
            peekLockHint.value = ' ';
            return false;
        }
        syncEffectivePasscode();
        if (input === String(peekEffectivePasscode.value || '')) {
            peekLocked.value = false;
            peekPasscodeInput.value = '';
            peekWrongAttempts.value = 0;
            peekLockoutUntil.value = 0;
            peekLockHint.value = ' ';
            return true;
        }
        peekWrongAttempts.value += 1;
        peekPasscodeInput.value = '';
        const freezeSec = Math.min(90, 6 * (2 ** Math.max(0, peekWrongAttempts.value - 1)));
        peekLockoutUntil.value = Date.now() + freezeSec * 1000;
        // 不说教、不教用户怎么问，像真实锁屏一样“冷冰冰”
        peekLockHint.value = `已静止 ${freezeSec} 秒`;
        return false;
    };
    const lockPeek = () => {
        // 锁屏入口已删除，lockPeek 保持为“无操作”
        peekLocked.value = false;
        peekPasscodeInput.value = '';
        peekLockHint.value = ' ';
    };
    const appendPeekPasscodeDigit = (digit) => {
        if (peekLockoutRemainSec.value > 0) return;
        const d = String(digit ?? '').replace(/\D/g, '');
        if (!d) return;
        if (peekPasscodeInput.value.length >= 4) return;
        peekPasscodeInput.value += d.slice(0, 1);
        if (peekPasscodeInput.value.length === 4) unlockPeek();
    };
    const removePeekPasscodeDigit = () => {
        if (peekLockoutRemainSec.value > 0) return;
        peekPasscodeInput.value = peekPasscodeInput.value.slice(0, -1);
    };
    const clearPeekPasscodeInput = () => {
        if (peekLockoutRemainSec.value > 0) return;
        peekPasscodeInput.value = '';
    };
    const peekFormatAmount = (amount) => `${amount >= 0 ? '+' : ''}${amount}`;

    watch(peekSelectedCharacter, (char) => {
        if (char) rebuildCharacterData(char);
        peekPasscodeInput.value = '';
        peekWrongAttempts.value = 0;
        peekLockoutUntil.value = 0;
        peekLockHint.value = ' ';
        syncEffectivePasscode();
    }, { immediate: true });

    // SoulLink 有新消息时，同步“他刚改的密码”
    watch(
        () => {
            const charId = String(peekSelectedCharacterId.value || '');
            const rows = Array.isArray(soulLinkMessagesRef?.value?.[charId]) ? soulLinkMessagesRef.value[charId] : [];
            const last = rows[rows.length - 1];
            return `${charId}|${rows.length}|${last?.timestamp || last?.id || ''}`;
        },
        () => syncEffectivePasscode()
    );

    watch(
        [
            peekSelectedCharacterId,
            peekMessages,
            peekCalls,
            peekNotes,
            peekPhotos,
            peekFiles,
            peekBrowserHistory,
            peekDiaryEntries,
            peekBankAccount,
            peekMapTracks,
            peekTodoItems,
            peekCalendarEvents,
            peekWallet,
            peekHealth,
            peekMailThreads,
            peekAiLastGeneratedAt
        ],
        () => {
            const charId = String(peekSelectedCharacterId.value || '');
            if (!charId || !phoneState.value) return;
            syncPhoneStateFromRefs();
            putPhoneState(charId, phoneState.value).catch(() => {});
        },
        { deep: true }
    );

    watch([peekSelectedCharacterId, peekDark], () => {
        globalState.value = {
            peekSelectedCharacterId: peekSelectedCharacterId.value,
            peekDark: peekDark.value
        };
        putGlobalState(globalState.value).catch(() => {});
    });

    onMounted(async () => {
        try { await migratePeekLocalStorageToIdb(); } catch { /* ignore */ }
        try {
            const g = await getGlobalState();
            if (g && typeof g === 'object') globalState.value = g;
        } catch { /* ignore */ }
        peekSelectedCharacterId.value = String(globalState.value.peekSelectedCharacterId || '');
        peekDark.value = globalState.value.peekDark !== false;
        isPeekHydrated.value = true;
    });

    return {
        peekSelectedCharacterId,
        peekSelectedCharacter,
        peekPhoneTitle,
        peekInnerApp,
        peekSearch,
        peekDark,
        peekLocked,
        peekStatusTime,
        peekWidgetGreeting,
        peekWidgetDate,
        peekWidgetWeather,
        peekWidgetUnreadCount,
        peekWidgetFirstNote,
        peekWidgetPhotos,
        peekDiaryEntries,
        peekBankAccount,
        peekMapTracks,
        peekTodoItems,
        peekCalendarEvents,
        peekWallet,
        peekHealth,
        peekMailThreads,
        peekAiLastGeneratedAt,
        peekAiGenerating,
        peekAiError,
        peekApps,
        peekHomeApps,
        filteredPeekApps,
        DOCK_APPS,
        peekMessages,
        peekSoulChatMessages,
        peekExternalChatMessages,
        peekMixedChatMessages,
        peekCalls,
        peekNotes,
        peekPhotos,
        peekFiles,
        peekBrowserHistory,
        selectPeekCharacter,
        openPeekInnerApp,
        closePeekInnerApp,
        getPeekAppName,
        getPeekBadgeCount,
        peekFormatAmount,
        generatePeekLinkedData,
        unlockPeek,
        lockPeek,
        peekPasscodeInput,
        peekLockHint,
        peekLockoutRemainSec,
        peekSharedPasscodeFromSoulLink,
        peekEffectivePasscode,
        appendPeekPasscodeDigit,
        removePeekPasscodeDigit,
        clearPeekPasscodeInput,
        isPeekHydrated
    };
}

import { ref, computed, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

const NEST_KEY = 'nest_space_v1';

const readNestState = () => {
    try {
        return JSON.parse(localStorage.getItem(NEST_KEY) || '{}');
    } catch {
        return {};
    }
};

const writeNestState = (state) => {
    try {
        localStorage.setItem(NEST_KEY, JSON.stringify(state));
    } catch {
        // ignore storage failures
    }
};

const toDateInput = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const getMessageText = (msg) => {
    if (!msg || msg.isSystem) return '';
    if (typeof msg.text === 'string' && msg.text.trim()) return msg.text.trim();
    if (msg.messageType === 'image') return '[图片]';
    if (msg.messageType === 'voice') return msg.transcription ? `[语音] ${msg.transcription}` : '[语音]';
    return '';
};

export function useNest(charactersRef, soulLinkMessagesRef, soulLinkActiveChatRef) {
    const saved = readNestState();

    const nestTitle = ref(saved.nestTitle || 'Our Nest');
    const anniversaryDate = ref(saved.anniversaryDate || toDateInput(new Date()));
    const dailyNote = ref(saved.dailyNote || '今天也要好好爱你。');
    const loveScore = ref(Number(saved.loveScore || 77));
    const memories = ref(Array.isArray(saved.memories) ? saved.memories : []);
    const wishes = ref(Array.isArray(saved.wishes) ? saved.wishes : []);
    const plans = ref(Array.isArray(saved.plans) ? saved.plans : []);

    const memoryInput = ref('');
    const wishInput = ref('');
    const planInput = ref('');
    const planDateInput = ref(toDateInput(new Date()));

    const activePartner = computed(() => {
        const chars = Array.isArray(charactersRef?.value) ? charactersRef.value : [];
        if (chars.length === 0) return null;
        const activeId = String(soulLinkActiveChatRef?.value || '');
        const hit = chars.find((c) => String(c.id) === activeId);
        return hit || chars[0];
    });

    const partnerName = computed(() => activePartner.value?.nickname || activePartner.value?.name || 'Ta');

    const daysTogether = computed(() => {
        const val = String(anniversaryDate.value || '');
        if (!val) return 0;
        const start = new Date(val);
        if (Number.isNaN(start.getTime())) return 0;
        const now = new Date();
        start.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        return Math.max(1, Math.floor((now - start) / 86400000) + 1);
    });

    const completedWishCount = computed(() => wishes.value.filter((x) => x.done).length);
    const completedPlanCount = computed(() => plans.value.filter((x) => x.done).length);

    const latestChatLine = computed(() => {
        const charId = String(activePartner.value?.id || '');
        if (!charId) return '';
        const rows = Array.isArray(soulLinkMessagesRef?.value?.[charId]) ? soulLinkMessagesRef.value[charId] : [];
        for (let i = rows.length - 1; i >= 0; i--) {
            const text = getMessageText(rows[i]);
            if (text) return text.slice(0, 60);
        }
        return '';
    });

    const addMemory = (text) => {
        const t = String(text || '').trim();
        if (!t) return;
        memories.value.unshift({
            id: `mem_${Date.now()}`,
            text: t,
            createdAt: Date.now()
        });
        memoryInput.value = '';
    };

    const addMemoryFromChat = () => {
        const line = latestChatLine.value;
        if (!line) return;
        addMemory(`聊天摘录：${line}`);
    };

    const removeMemory = (id) => {
        memories.value = memories.value.filter((m) => m.id !== id);
    };

    const addWish = () => {
        const t = String(wishInput.value || '').trim();
        if (!t) return;
        wishes.value.unshift({
            id: `wish_${Date.now()}`,
            text: t,
            done: false
        });
        wishInput.value = '';
    };

    const toggleWish = (id) => {
        wishes.value = wishes.value.map((w) => (w.id === id ? { ...w, done: !w.done } : w));
    };

    const addPlan = () => {
        const t = String(planInput.value || '').trim();
        if (!t) return;
        plans.value.unshift({
            id: `plan_${Date.now()}`,
            text: t,
            date: planDateInput.value || toDateInput(new Date()),
            done: false
        });
        planInput.value = '';
    };

    const togglePlan = (id) => {
        plans.value = plans.value.map((p) => (p.id === id ? { ...p, done: !p.done } : p));
    };

    const sendLovePulse = () => {
        loveScore.value = Math.min(999, Number(loveScore.value || 0) + 1);
    };

    watch(
        [nestTitle, anniversaryDate, dailyNote, loveScore, memories, wishes, plans],
        () => {
            writeNestState({
                nestTitle: nestTitle.value,
                anniversaryDate: anniversaryDate.value,
                dailyNote: dailyNote.value,
                loveScore: loveScore.value,
                memories: memories.value,
                wishes: wishes.value,
                plans: plans.value
            });
        },
        { deep: true }
    );

    return {
        nestTitle,
        anniversaryDate,
        dailyNote,
        loveScore,
        daysTogether,
        partnerName,
        latestChatLine,
        memories,
        wishes,
        plans,
        completedWishCount,
        completedPlanCount,
        memoryInput,
        wishInput,
        planInput,
        planDateInput,
        addMemory,
        addMemoryFromChat,
        removeMemory,
        addWish,
        toggleWish,
        addPlan,
        togglePlan,
        sendLovePulse
    };
}

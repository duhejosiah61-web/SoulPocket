// composables/useChatSettings.js
import { ref, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export function useChatSettings(
    soulLinkActiveChat,
    soulLinkActiveChatType,
    characters,
    worldbooks,
    presets,
    activeProfile,
    availableModels
) {
    void worldbooks;
    void presets;
    void activeProfile;
    void availableModels;

    const userIdentity = ref('');
    const userRelation = ref('');
    const userPronoun = ref('unknown');
    const bubbleStyle = ref('default');
    const customBubbleCSS = ref('');
    const bubbleAvatarMode = ref('first');
    const bubbleShapeMode = ref('round');
    const bubbleColorPreset = ref('default');
    const chatBackgroundStyle = ref('default');
    const gradientStartColor = ref('#f2f2f7');
    const gradientEndColor = ref('#ffffff');
    const solidBackgroundColor = ref('#f2f2f7');
    const chatBackgroundImage = ref('');
    const chatBackgroundImageInput = ref('');
    const enableManualImageCrop = ref(true);
    const soulLinkForeignTranslationEnabled = ref(false);
    const soulLinkForeignPrimaryLang = ref('zh-CN');
    const soulLinkForeignSecondaryLang = ref('en');
    const timeZoneSystemEnabled = ref(false);
    const userTimeZone = ref('Asia/Shanghai');
    const roleTimeZone = ref('Asia/Tokyo');
    const activeMessageEnabled = ref(false);
    const activeMessageFrequencyMin = ref(15);
    const activeReplyDelaySec = ref(8);
    const chatSummaryEnabled = ref(true);
    const chatSummaryEveryN = ref(12);
    const chatSummaryBoard = ref([]);
    const chatSummaryGenerating = ref(false);
    const timeSenseEnabled = ref(true);
    const messageTimeNow = ref(Date.now());
    const userBlockedRole = computed(() => {
        if (!soulLinkActiveChat.value || soulLinkActiveChatType.value !== 'character') return false;
        const char = characters.value.find((c) => String(c.id) === String(soulLinkActiveChat.value));
        return !!(char && char.blockedByUser);
    });

    const getTargetLangLabel = (langValue) => {
        const v = String(langValue || '').trim();
        const map = {
            'zh-CN': '简体中文', 'en': 'English', 'ja': '日本語', 'ko': '한국어',
            'zh-TW': '繁體中文', 'fr': 'Français', 'de': 'Deutsch', 'es': 'Español',
            'it': 'Italiano', 'ru': 'Русский', 'pt-BR': 'Português (Brasil)',
            'ar': 'العربية', 'hi': 'हिन्दी', 'th': 'ไทย', 'vi': 'Tiếng Việt',
            'id': 'Bahasa Indonesia', 'tr': 'Türkçe'
        };
        return map[v] || v || '简体中文';
    };

    const soulLinkForeignTranslationPrimaryLabel = computed(() => getTargetLangLabel(soulLinkForeignPrimaryLang.value));
    const soulLinkForeignTranslationSecondaryLabel = computed(() => getTargetLangLabel(soulLinkForeignSecondaryLang.value));
    const soulLinkForeignTranslationDirectionText = computed(() => {
        const a = soulLinkForeignTranslationPrimaryLabel.value;
        const b = soulLinkForeignTranslationSecondaryLabel.value;
        if (String(soulLinkForeignPrimaryLang.value) === String(soulLinkForeignSecondaryLang.value)) {
            return `启用后强制输出为：${a}（A与B相同将不额外附加翻译）`;
        }
        return `启用后强制输出为：上方${a}（A）+ 下方${b}（B翻译，自动识别原语言）`;
    });

    const loadFromStorage = (key) => {
        const saved = localStorage.getItem(key);
        if (saved) {
            try { return JSON.parse(saved); } catch { return null; }
        }
        return null;
    };

    const saveToStorage = (key, data) => {
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.error(e); }
    };

    const getChatContextKey = () => {
        if (!soulLinkActiveChat.value) return '';
        return soulLinkActiveChatType.value === 'group'
            ? `group:${String(soulLinkActiveChat.value)}`
            : `char:${String(soulLinkActiveChat.value)}`;
    };

    const getChatMenuSettingsStorageKey = () => {
        const ctx = getChatContextKey();
        return ctx ? `soulos_chat_menu_${ctx}` : '';
    };

    const getChatSummaryStorageKey = () => {
        const k = getChatContextKey();
        return k ? `soulos_chat_summary_v1::${k}` : '';
    };

    const getChatSummaryCursorKey = () => {
        const k = getChatContextKey();
        return k ? `soulos_chat_summary_cursor_v1::${k}` : '';
    };

    const loadChatSummaryState = () => {
        const key = getChatSummaryStorageKey();
        if (!key) {
            chatSummaryBoard.value = [];
            return;
        }
        const saved = loadFromStorage(key);
        chatSummaryBoard.value = Array.isArray(saved) ? saved : [];
    };

    const saveChatSummaryState = () => {
        const key = getChatSummaryStorageKey();
        if (!key) return;
        saveToStorage(key, chatSummaryBoard.value || []);
    };

    const getChatSummaryCursor = () => {
        const key = getChatSummaryCursorKey();
        if (!key) return 0;
        try {
            const raw = localStorage.getItem(key);
            const n = Number(raw);
            return Number.isFinite(n) ? n : 0;
        } catch {
            return 0;
        }
    };

    const setChatSummaryCursor = (n) => {
        const key = getChatSummaryCursorKey();
        if (!key) return;
        try { localStorage.setItem(key, String(Number(n) || 0)); } catch { /* ignore */ }
    };

    const clearChatSummaryBoard = () => {
        chatSummaryBoard.value = [];
        saveChatSummaryState();
        const key = getChatSummaryCursorKey();
        if (key) {
            try { localStorage.removeItem(key); } catch { /* ignore */ }
        }
    };

    const getLatestSummaryText = () => {
        const list = Array.isArray(chatSummaryBoard.value) ? chatSummaryBoard.value : [];
        const latest = list[0];
        return typeof latest?.body === 'string' ? latest.body.trim() : '';
    };

    const loadChatMenuSettings = () => {
        if (!soulLinkActiveChat.value) return;
        const settingsKey = getChatMenuSettingsStorageKey();
        if (!settingsKey) return;
        let saved = loadFromStorage(settingsKey);
        if (!saved) {
            const legacyKey = `soulos_chat_menu_${soulLinkActiveChat.value}`;
            saved = loadFromStorage(legacyKey);
        }
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            userIdentity.value = saved.userIdentity || '';
            userRelation.value = saved.userRelation || '';
            userPronoun.value = saved.userPronoun || 'unknown';
            bubbleStyle.value = saved.bubbleStyle || 'default';
            bubbleAvatarMode.value = saved.bubbleAvatarMode || 'first';
            bubbleShapeMode.value = saved.bubbleShapeMode || ((saved.bubbleStyle === 'sharp') ? 'sharp' : 'round');
            bubbleColorPreset.value = saved.bubbleColorPreset
                || ((saved.bubbleStyle === 'blue') ? 'blue'
                    : (saved.bubbleStyle === 'orange') ? 'orange'
                        : 'default');
            customBubbleCSS.value = saved.customBubbleCSS || '';
            chatBackgroundStyle.value = saved.chatBackgroundStyle || 'default';
            gradientStartColor.value = saved.gradientStartColor || '#f2f2f7';
            gradientEndColor.value = saved.gradientEndColor || '#ffffff';
            solidBackgroundColor.value = saved.solidBackgroundColor || '#f2f2f7';
            chatBackgroundImage.value = saved.chatBackgroundImage || '';
            chatBackgroundImageInput.value = chatBackgroundImage.value || '';
            enableManualImageCrop.value = saved.enableManualImageCrop !== false;
            soulLinkForeignTranslationEnabled.value = !!saved.soulLinkForeignTranslationEnabled;
            soulLinkForeignPrimaryLang.value = saved.soulLinkForeignPrimaryLang || 'zh-CN';
            soulLinkForeignSecondaryLang.value =
                saved.soulLinkForeignSecondaryLang
                || saved.soulLinkForeignTranslationLang
                || 'en';
            timeZoneSystemEnabled.value = !!saved.timeZoneSystemEnabled;
            userTimeZone.value = saved.userTimeZone || 'Asia/Shanghai';
            roleTimeZone.value = saved.roleTimeZone || 'Asia/Tokyo';
            activeMessageEnabled.value = !!saved.activeMessageEnabled;
            activeMessageFrequencyMin.value = Number(saved.activeMessageFrequencyMin) > 0 ? Number(saved.activeMessageFrequencyMin) : 15;
            activeReplyDelaySec.value = Number(saved.activeReplyDelaySec) > 0 ? Number(saved.activeReplyDelaySec) : 8;
            chatSummaryEnabled.value = saved.chatSummaryEnabled !== false;
            chatSummaryEveryN.value = Number(saved.chatSummaryEveryN) > 0 ? Number(saved.chatSummaryEveryN) : 12;
            timeSenseEnabled.value = saved.timeSenseEnabled !== false;
        } else {
            userIdentity.value = '';
            userRelation.value = '';
            userPronoun.value = 'unknown';
            bubbleStyle.value = 'default';
            bubbleAvatarMode.value = 'first';
            bubbleShapeMode.value = 'round';
            bubbleColorPreset.value = 'default';
            customBubbleCSS.value = '';
            chatBackgroundStyle.value = 'default';
            gradientStartColor.value = '#f2f2f7';
            gradientEndColor.value = '#ffffff';
            solidBackgroundColor.value = '#f2f2f7';
            chatBackgroundImage.value = '';
            chatBackgroundImageInput.value = '';
            enableManualImageCrop.value = true;
            soulLinkForeignTranslationEnabled.value = false;
            soulLinkForeignPrimaryLang.value = 'zh-CN';
            soulLinkForeignSecondaryLang.value = 'en';
            timeZoneSystemEnabled.value = false;
            userTimeZone.value = 'Asia/Shanghai';
            roleTimeZone.value = 'Asia/Tokyo';
            activeMessageEnabled.value = false;
            activeMessageFrequencyMin.value = 15;
            activeReplyDelaySec.value = 8;
            chatSummaryEnabled.value = true;
            chatSummaryEveryN.value = 12;
            timeSenseEnabled.value = true;
        }
        applyBubbleStyle();
        updateChatBackground();
        loadChatSummaryState();
        return true;
    };

    const saveChatMenuSettings = () => {
        if (!soulLinkActiveChat.value) return;
        const settingsKey = getChatMenuSettingsStorageKey();
        if (!settingsKey) return;
        saveToStorage(settingsKey, {
            userIdentity: userIdentity.value,
            userRelation: userRelation.value,
            userPronoun: userPronoun.value,
            bubbleStyle: bubbleStyle.value,
            bubbleAvatarMode: bubbleAvatarMode.value,
            bubbleShapeMode: bubbleShapeMode.value,
            bubbleColorPreset: bubbleColorPreset.value,
            customBubbleCSS: customBubbleCSS.value,
            chatBackgroundStyle: chatBackgroundStyle.value,
            gradientStartColor: gradientStartColor.value,
            gradientEndColor: gradientEndColor.value,
            solidBackgroundColor: solidBackgroundColor.value,
            chatBackgroundImage: chatBackgroundImage.value,
            enableManualImageCrop: enableManualImageCrop.value,
            soulLinkForeignTranslationEnabled: soulLinkForeignTranslationEnabled.value,
            soulLinkForeignPrimaryLang: soulLinkForeignPrimaryLang.value,
            soulLinkForeignSecondaryLang: soulLinkForeignSecondaryLang.value,
            timeZoneSystemEnabled: timeZoneSystemEnabled.value,
            userTimeZone: userTimeZone.value,
            roleTimeZone: roleTimeZone.value,
            activeMessageEnabled: activeMessageEnabled.value,
            activeMessageFrequencyMin: activeMessageFrequencyMin.value,
            activeReplyDelaySec: activeReplyDelaySec.value,
            soulLinkForeignTranslationLang: soulLinkForeignSecondaryLang.value,
            chatSummaryEnabled: chatSummaryEnabled.value,
            chatSummaryEveryN: chatSummaryEveryN.value,
            timeSenseEnabled: timeSenseEnabled.value
        });
    };

    const BUBBLE_COLOR_PRESETS = {
        default: { userBg: '#000000', userColor: '#FFFFFF', aiBg: '#F2F2F2', aiColor: '#000000' },
        blue: { userBg: '#000000', userColor: '#FFFFFF', aiBg: '#DBEAFE', aiColor: '#000000' },
        orange: { userBg: '#000000', userColor: '#FFFFFF', aiBg: '#FFEDD5', aiColor: '#000000' },
        plum: { userBg: '#000000', userColor: '#FFFFFF', aiBg: '#E9D5FF', aiColor: '#000000' },
        sage: { userBg: '#000000', userColor: '#FFFFFF', aiBg: '#DCFCE7', aiColor: '#000000' },
        steel: { userBg: '#0F172A', userColor: '#FFFFFF', aiBg: '#F3F4F6', aiColor: '#000000' },
    };

    const applyCustomBubbleStyle = () => {
        let styleTag = document.getElementById('custom-bubble-style');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'custom-bubble-style';
            document.head.appendChild(styleTag);
        }
        const css = customBubbleCSS.value.trim();
        styleTag.textContent = css
            ? `#app.bubble-style-custom .message.user .bubble,
               #app.bubble-style-custom .message.ai .bubble,
               #app.bubble-style-custom .voice-message-bubble { ${css} }`
            : '';
    };

    const applyBubbleStyle = () => {
        const appElement = document.getElementById('app');
        if (!appElement) return;
        appElement.classList.remove(
            'bubble-style-default',
            'bubble-style-blue',
            'bubble-style-orange',
            'bubble-style-round',
            'bubble-style-sharp'
        );
        const radius = bubbleShapeMode.value === 'sharp' ? '0px' : '18px';
        appElement.style.setProperty('--chat-bubble-radius', radius);
        const preset = BUBBLE_COLOR_PRESETS[bubbleColorPreset.value] || BUBBLE_COLOR_PRESETS.default;
        appElement.style.setProperty('--chat-bubble-user-bg', preset.userBg);
        appElement.style.setProperty('--chat-bubble-user-color', preset.userColor);
        appElement.style.setProperty('--chat-bubble-ai-bg', preset.aiBg);
        appElement.style.setProperty('--chat-bubble-ai-color', preset.aiColor);
        if (customBubbleCSS.value && String(customBubbleCSS.value).trim()) {
            appElement.classList.add('bubble-style-custom');
        } else {
            appElement.classList.remove('bubble-style-custom');
        }
        applyCustomBubbleStyle();
    };

    const setBubbleStyle = (style) => {
        bubbleStyle.value = style;
        if (style === 'sharp') {
            bubbleShapeMode.value = 'sharp';
            bubbleColorPreset.value = 'default';
        } else if (style === 'round') {
            bubbleShapeMode.value = 'round';
            bubbleColorPreset.value = 'default';
        } else if (style === 'blue') {
            bubbleShapeMode.value = 'round';
            bubbleColorPreset.value = 'blue';
        } else if (style === 'orange') {
            bubbleShapeMode.value = 'round';
            bubbleColorPreset.value = 'orange';
        } else if (style === 'custom') {
            bubbleShapeMode.value = bubbleShapeMode.value || 'round';
            bubbleColorPreset.value = bubbleColorPreset.value || 'default';
        } else {
            bubbleShapeMode.value = 'round';
            bubbleColorPreset.value = 'default';
        }
        applyBubbleStyle();
    };

    const applyCustomCSS = () => {
        applyBubbleStyle();
    };

    const updateChatBackground = () => {
        const chatContainer = document.querySelector('.wechat-messages');
        if (!chatContainer) return;
        switch (chatBackgroundStyle.value) {
            case 'gradient':
                chatContainer.style.background = `linear-gradient(135deg, ${gradientStartColor.value} 0%, ${gradientEndColor.value} 100%)`;
                break;
            case 'color':
                chatContainer.style.background = solidBackgroundColor.value;
                break;
            case 'image':
                if (chatBackgroundImage.value) {
                    chatContainer.style.background = `url(${chatBackgroundImage.value}) center/cover no-repeat`;
                } else {
                    chatContainer.style.background = 'transparent';
                }
                break;
            default:
                chatContainer.style.background = 'transparent';
        }
    };

    const applyBackgroundImageLink = () => {
        const url = String(chatBackgroundImageInput.value || '').trim();
        if (!url) return;
        chatBackgroundImage.value = url;
        chatBackgroundStyle.value = 'image';
        updateChatBackground();
    };

    const clearBackgroundImage = () => {
        chatBackgroundImage.value = '';
        chatBackgroundImageInput.value = '';
        if (chatBackgroundStyle.value === 'image') {
            chatBackgroundStyle.value = 'default';
        }
        updateChatBackground();
    };

    const chatSettingsPanelStyle = computed(() => {
        if (chatBackgroundStyle.value === 'image' && chatBackgroundImage.value) {
            return {
                background: `linear-gradient(rgba(255,255,255,.88), rgba(250,250,248,.92)), url(${chatBackgroundImage.value}) center/cover no-repeat`
            };
        }
        if (chatBackgroundStyle.value === 'gradient') {
            return {
                background: `linear-gradient(135deg, ${gradientStartColor.value} 0%, ${gradientEndColor.value} 100%)`
            };
        }
        if (chatBackgroundStyle.value === 'color') {
            return { background: solidBackgroundColor.value };
        }
        return {};
    });

    const normalizeUtcOffset = (s) => {
        const m = String(s || '').trim().match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i);
        if (!m) return null;
        const sign = m[1];
        const hh = String(Math.min(23, Number(m[2]) || 0)).padStart(2, '0');
        const mm = String(Math.min(59, Number(m[3]) || 0)).padStart(2, '0');
        return `UTC${sign}${hh}:${mm}`;
    };

    const formatNowInZone = (zoneInput) => {
        const zone = String(zoneInput || '').trim();
        if (!zone) return null;
        const utc = normalizeUtcOffset(zone);
        try {
            if (utc) {
                const now = new Date();
                const local = now.getTime() + now.getTimezoneOffset() * 60000;
                const sign = utc.includes('+') ? 1 : -1;
                const part = utc.replace('UTC', '');
                const [h, m] = part.slice(1).split(':').map((x) => Number(x) || 0);
                const shifted = new Date(local + sign * (h * 60 + m) * 60000);
                const t = shifted.toLocaleString('zh-CN', { hour12: false });
                return `${t} (${utc})`;
            }
            const t = new Intl.DateTimeFormat('zh-CN', {
                timeZone: zone,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            }).format(new Date());
            return `${t} (${zone})`;
        } catch {
            return null;
        }
    };

    const buildTimeZonePromptBlock = () => {
        if (!timeZoneSystemEnabled.value) return '';
        const userZone = String(userTimeZone.value || '').trim();
        const roleZone = String(roleTimeZone.value || '').trim();
        const userNow = formatNowInZone(userZone);
        const roleNow = formatNowInZone(roleZone);
        if (!userNow || !roleNow) {
            return `\n\n# 时差系统（已启用）\n用户时区：${userZone || '未填写'}\n角色时区：${roleZone || '未填写'}\n规则：你必须感知双方时差来交流（问候语、作息建议、是否方便回复等），不要把对方当成与你同一时区。\n`;
        }
        return `\n\n# 时差系统（已启用）\n用户当前本地时间：${userNow}\n你（角色）当前本地时间：${roleNow}\n规则：\n1. 你必须按双方时差来表达时间感知（如早安/晚安、是否打扰、作息建议）。\n2. 不要把双方当成同一时区。\n3. 除非用户要求，否则不要机械重复报时。\n`;
    };

    const getUserPronounInstruction = () => {
        const pronounMap = {
            female: '用户是女性，请优先使用“她/小姐姐/女生”相关称呼。',
            male: '用户是男性，请优先使用“他/小哥哥/男生”相关称呼。',
            nonbinary: '用户偏中性表达，请尽量使用“TA/对方/你”而非强性别称呼。',
            unknown: '用户性别未指定，默认使用“你/对方/TA”等中性称呼。'
        };
        const base = pronounMap[userPronoun.value] || pronounMap.unknown;
        const identityText = userIdentity.value ? `用户自我身份：${userIdentity.value}。` : '';
        const relationText = userRelation.value ? `你和用户关系：${userRelation.value}。` : '';
        return `${base}${identityText}${relationText}`;
    };

    const getForeignBilingualConstraintPrompt = () => {
        if (!soulLinkForeignTranslationEnabled.value) return '';
        const aValue = String(soulLinkForeignPrimaryLang.value || '').trim() || 'zh-CN';
        const aLabel = getTargetLangLabel(aValue);
        return `# 语言输出（强制，最高优先级）\n启用外语翻译时，你的所有输出只能使用${aLabel}（A语种）。\n禁止在正文中追加任何B语种/双语重复内容；B语种译文会由系统在气泡下方单独展示。\n在 [REPLY] 与 [OS] 内同样只输出${aLabel}。\n\n`;
    };

    const buildAiBusyDecisionPromptBlock = () => {
        if (!timeZoneSystemEnabled.value) {
            return `\n\n# AI忙碌决策标签（可选）\n如果你无法获得“角色本地时间”，请始终在 [OS] 内以第一行输出 [AI_ACTION]reply_now[/AI_ACTION]，其后仍需继续输出内心独白（与REPLY反差感）。\n`;
        }
        return `\n\n# AI忙碌决策标签（必须遵守）\n请根据你（角色）当前本地时间：判断此刻你是否方便回复。\n- 若不方便/正在忙：在 [OS] 内以第一行输出 [AI_ACTION]busy_later[/AI_ACTION]，其后仍需继续输出内心独白（与REPLY反差感）；并且 [REPLY] 只能写一句短句（如“我这会儿有点忙，晚点回你/先忙一会儿”），不要解释原因。\n- 若方便/可回复：在 [OS] 内以第一行输出 [AI_ACTION]reply_now[/AI_ACTION]，其后仍需继续输出内心独白（与REPLY反差感）；然后正常回复。\n`;
    };

    let activeMessageTimer = null;
    const lastUserActiveAt = ref(Date.now());

    const clearActiveMessageTimer = () => {
        if (activeMessageTimer) clearTimeout(activeMessageTimer);
        activeMessageTimer = null;
    };

    const scheduleRoleActiveMessage = (onSendCallback) => {
        clearActiveMessageTimer();
        if (!activeMessageEnabled.value || !soulLinkActiveChat.value) return;
        if (soulLinkActiveChatType.value === 'character' && userBlockedRole.value) return;
        const base = Math.max(1, Number(activeMessageFrequencyMin.value) || 15) * 60 * 1000;
        const jitter = Math.floor(base * 0.35 * Math.random());
        activeMessageTimer = setTimeout(() => {
            if (!soulLinkActiveChat.value || (soulLinkActiveChatType.value === 'character' && userBlockedRole.value)) return;
            const now = Date.now();
            const inactiveFor = now - (Number(lastUserActiveAt.value) || 0);
            if (inactiveFor < base) {
                scheduleRoleActiveMessage(onSendCallback);
                return;
            }
            if (onSendCallback) onSendCallback();
        }, base + jitter);
    };

    return {
        userIdentity, userRelation, userPronoun,
        bubbleStyle, customBubbleCSS, bubbleAvatarMode, bubbleShapeMode, bubbleColorPreset,
        chatBackgroundStyle, gradientStartColor, gradientEndColor, solidBackgroundColor,
        chatBackgroundImage, chatBackgroundImageInput, enableManualImageCrop,
        soulLinkForeignTranslationEnabled, soulLinkForeignPrimaryLang, soulLinkForeignSecondaryLang,
        soulLinkForeignTranslationPrimaryLabel, soulLinkForeignTranslationSecondaryLabel,
        soulLinkForeignTranslationDirectionText,
        timeZoneSystemEnabled, userTimeZone, roleTimeZone,
        activeMessageEnabled, activeMessageFrequencyMin, activeReplyDelaySec,
        userBlockedRole,
        chatSummaryEnabled, chatSummaryEveryN, chatSummaryBoard, chatSummaryGenerating,
        timeSenseEnabled, messageTimeNow,
        loadChatMenuSettings, saveChatMenuSettings,
        applyBubbleStyle, updateChatBackground, setBubbleStyle, applyCustomCSS,
        applyBackgroundImageLink, clearBackgroundImage,
        clearChatSummaryBoard,
        loadChatSummaryState, saveChatSummaryState,
        getChatSummaryCursor, setChatSummaryCursor,
        getLatestSummaryText,
        buildTimeZonePromptBlock, getUserPronounInstruction,
        getForeignBilingualConstraintPrompt, buildAiBusyDecisionPromptBlock,
        clearActiveMessageTimer, scheduleRoleActiveMessage, lastUserActiveAt,
        getTargetLangLabel,
        normalizeUtcOffset, formatNowInZone,
        chatSettingsPanelStyle
    };
}

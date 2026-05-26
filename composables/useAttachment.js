// composables/useAttachment.js — SoulLink 附件面板、定位/转账/淘宝/投票/分享等
import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

/**
 * @param {object} opts
 * @param {() => void} opts.pushMessageToActiveChat
 * @param {() => Promise<void>|void} opts.saveSoulLinkMessages
 * @param {() => void} opts.scrollToBottom
 * @param {import('vue').Ref} opts.activeProfile
 * @param {import('vue').Ref} opts.availableModels
 * @param {import('vue').Ref} opts.characters
 * @param {import('vue').Ref} opts.stickerPacks
 * @param {Function} opts.compressAvatarImage
 * @param {(msg: string, type?: string) => void} opts.addConsoleLog
 * @param {() => Promise<void>|void} opts.triggerSoulLinkAiReply
 * @param {() => any[]} opts.getActiveChatHistory
 * @param {Function} opts.buildSoulLinkReplyContext
 * @param {import('vue').Ref} opts.soulLinkActiveChat
 * @param {import('vue').Ref} opts.soulLinkActiveChatType
 * @param {import('vue').ComputedRef} opts.activeGroupChat
 * @param {import('vue').Ref} opts.soulLinkMessages
 * @param {() => void} opts.syncActiveChatState
 * @param {() => void} opts.persistActiveChat
 * @param {import('vue').Ref} opts.isAiTyping
 * @param {import('vue').Ref} opts.showChatSettings
 * @param {import('vue').Ref} opts.soulLinkPet
 */
export function useAttachment(opts) {
    const {
        pushMessageToActiveChat,
        saveSoulLinkMessages,
        scrollToBottom,
        activeProfile,
        availableModels,
        characters,
        stickerPacks,
        compressAvatarImage,
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
    } = opts;

    // 未注入压缩函数时同步直通（不包一层 Promise/setTimeout）
    const compress = typeof compressAvatarImage === 'function'
        ? compressAvatarImage
        : (dataUrl, _preset, cb) => cb(dataUrl);

    const showEmojiPanel = ref(false);
    const showAttachmentPanel = ref(false);
    const showImageSubmenu = ref(false);
    const showLocationPanel = ref(false);
    const showTransferPanel = ref(false);
    const showPhotoSelectPanel = ref(false);
    const showTextImagePanel = ref(false);
    const textImageText = ref('');
    const textImageBgColor = ref('#ffffff');
    const textImageColors = ['#ffffff', '#f8f5f0', '#fef3c7', '#dbeafe', '#f3e8ff', '#fce7f3', '#dcfce7'];
    const showVoiceInputPanel = ref(false);
    const voiceInputText = ref('');
    const showVirtualCamera = ref(false);
    const virtualImageDesc = ref('');
    const showArchiveDialog = ref(false);
    const showArchivedChats = ref(false);
    const archiveName = ref('');
    const archiveDescription = ref('');
    const showVotePanel = ref(false);
    const voteQuestion = ref('');
    const voteOptions = ref(['', '']);
    const showTaobaoPanel = ref(false);
    const taobaoSearchTerm = ref('');
    const taobaoProducts = ref([]);
    const taobaoLoading = ref(false);
    const showSharePanel = ref(false);
    const shareSource = ref('');
    const shareContent = ref('');
    const shareSources = ['B站', '小红书', '知乎', '微博', '抖音', '浏览器', '微信公众号', '其他'];
    const transferAmount = ref(0);
    const transferNote = ref('');
    const locationUser = ref('');
    const locationTarget = ref('');
    const locationDistance = ref('');
    const locationTrajectoryPoints = ref([]);

    const userAddress = ref('');
    const aiAddress = ref('');
    const calculatedDistance = ref('');

    const closeAllPanels = () => {
        showAttachmentPanel.value = false;
        showImageSubmenu.value = false;
        showLocationPanel.value = false;
        showTransferPanel.value = false;
        showEmojiPanel.value = false;
        showVirtualCamera.value = false;
        showPhotoSelectPanel.value = false;
        showTextImagePanel.value = false;
        if (showChatSettings) showChatSettings.value = false;
        showArchiveDialog.value = false;
        showArchivedChats.value = false;
        showVotePanel.value = false;
        showSharePanel.value = false;
        showTaobaoPanel.value = false;
        showVoiceInputPanel.value = false;
    };

    const openVirtualCamera = () => {
        showVirtualCamera.value = true;
        virtualImageDesc.value = '';
        showImageSubmenu.value = false;
    };

    const sendVirtualImage = () => {
        if (!virtualImageDesc.value.trim()) return;
        const mockColors = ['#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#f8b195', '#f67280', '#c06c84', '#6c5b7b', '#355c7d'];
        const randomColor = mockColors[Math.floor(Math.random() * mockColors.length)];
        const mockUrl = `mock:${randomColor}`;
        const msg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'image',
            imageUrl: mockUrl,
            text: virtualImageDesc.value,
            imageDescription: virtualImageDesc.value,
            timestamp: Date.now()
        };
        pushMessageToActiveChat(msg);
        showVirtualCamera.value = false;
    };

    const locationNameOptions = ['家', '咖啡馆', '学校', '公司', '公园', '图书馆', '便利店', '地铁站', '健身房'];

    const normalizeLocationName = (value) => {
        if (!value) return '';
        let text = value.trim();
        text = text.split('\n')[0].trim();
        text = text.replace(/^[「『"“”'《》]+|[」』"“”'《》]+$/g, '');
        text = text.replace(/^[\-\*\d\.\s]+/g, '').trim();
        return text;
    };

    const pickLocationName = () => locationNameOptions[Math.floor(Math.random() * locationNameOptions.length)];

    const buildDistanceText = (userLoc, aiLoc) => {
        if (userLoc && aiLoc) {
            if (userLoc.includes(aiLoc) || aiLoc.includes(userLoc)) {
                return '很近';
            }
        }
        const pool = ['约500米', '约1.2公里', '约3公里', '约6公里', '约12公里'];
        return pool[Math.floor(Math.random() * pool.length)];
    };

    const buildBaseSystemPrompt = (isGroupChat, activeGroup, char, history) => {
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
            systemPrompt = `你正在群聊【${groupName}】中与用户对话。\n\n`;
            systemPrompt += `# 群成员\n${members.join('、')}\n\n`;
            systemPrompt += `# 行为规则\n1. 回复要简短自然，像真实群聊一样。\n2. 每次回复只扮演其中一名群成员。\n3. 回复格式为「成员名: 内容」。\n4. 可以用emoji和口语表达。\n\n`;
            if (availableStickers.length > 0) {
                systemPrompt += `你可以发送表情包来表达情感！使用格式：[表情名] 或 [表情:表情名]。可用的表情包有：${availableStickers.map(s => s.name).join('、')}。当情绪适合时自然地发送表情包。\n\n`;
            }
            systemPrompt += `现在请开始回复。`;
        } else if (char && char.persona) {
            const charName = char.name || '角色';
            systemPrompt = `你正在通过 SoulLink 和朋友聊天。\n\n`;
            systemPrompt += `你的名字是【${charName}】。\n`;
            systemPrompt += `${char.persona}\n\n`;
            systemPrompt += `1. 像真实的人类那样自然地聊天。\n2. 每次回复保持简短（1-3句话）。\n3. 使用符合${charName}性格的语气、口头禅和表情。\n4. 绝对不要暴露你是AI。你就是${charName}本人。\n`;
            if (availableStickers.length > 0) {
                systemPrompt += `\n你可以发送表情包来表达情感！使用格式：[表情名] 或 [表情:表情名]。可用的表情包有：${availableStickers.map(s => s.name).join('、')}。当情绪适合时自然地发送表情包，有时可以连续发多个表情包来表达强烈情感。`;
            }
            if (char.openingLine && history.length === 1) {
                systemPrompt += `这是你们的第一次对话。你可以主动打招呼：\n${char.openingLine}\n\n`;
            }
        } else {
            systemPrompt = '你是一个友好的朋友，正在通过SoulLink聊天。请像真人一样自然、简短地对话，每次1-3句话即可。可以用emoji和口语化表达。';
            if (availableStickers.length > 0) {
                systemPrompt += `\n你可以发送表情包来表达情感！使用格式：[表情名] 或 [表情:表情名]。可用的表情包有：${availableStickers.map(s => s.name).join('、')}。当情绪适合时自然地发送表情包，有时可以连续发多个表情包来表达强烈情感。`;
            }
        }
        return systemPrompt;
    };

    const inferAiLocationForPanel = async () => {
        if (!soulLinkActiveChat.value) return;
        if (!activeProfile.value) {
            const fallbackLoc = pickLocationName();
            aiAddress.value = fallbackLoc;
            calculatedDistance.value = buildDistanceText(userAddress.value, fallbackLoc);
            return;
        }
        const profile = activeProfile.value;
        const endpoint = (profile.endpoint || '').trim();
        const key = (profile.key || '').trim();
        if (!endpoint || !key) {
            const fallbackLoc = pickLocationName();
            aiAddress.value = fallbackLoc;
            calculatedDistance.value = buildDistanceText(userAddress.value, fallbackLoc);
            return;
        }
        const isGroupChat = soulLinkActiveChatType.value === 'group';
        const activeGroup = isGroupChat ? activeGroupChat.value : null;
        const char = isGroupChat ? null : characters.value.find(c => String(c.id) === String(soulLinkActiveChat.value));
        const history = getActiveChatHistory();
        let modelId = profile.model;
        if (!modelId && availableModels.value.length > 0) {
            modelId = availableModels.value[0].id;
            profile.model = modelId;
        }
        const locationPrompt = '[系统：请根据我们之前的聊天记录，分析“我(AI)”现在应该在什么虚拟地点？如果未知，就随机生成一个符合设定的地点（如：家、咖啡馆、学校）。请只输出地点名称。]';
        const systemPrompt = buildBaseSystemPrompt(isGroupChat, activeGroup, char, history) + '\n' + locationPrompt;
        const messagesPayload = [{ role: 'system', content: systemPrompt }];
        const historyForPrompt = history.filter(m => m && !m.isSystem && !m.isHidden).slice(-18);
        historyForPrompt.forEach(m => {
            const ctx = buildSoulLinkReplyContext(m);
            const raw = ctx.text || (m.text || '');
            if (m.sender === 'user') {
                messagesPayload.push({ role: 'user', content: raw });
            } else if (m.sender === 'ai') {
                messagesPayload.push({ role: 'assistant', content: raw });
            }
        });
        messagesPayload.push({ role: 'user', content: '请只输出地点名称。' });
        try {
            const response = await fetch(endpoint.replace(/\/+$/, '') + '/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: modelId || '',
                    messages: messagesPayload,
                    temperature: 0.6,
                    stream: false
                })
            });
            if (!response.ok) {
                throw new Error(`接口返回状态码 ${response.status}`);
            }
            const data = await response.json();
            let reply = '';
            if (data && Array.isArray(data.choices) && data.choices.length > 0) {
                const msg = data.choices[0].message || data.choices[0].delta;
                if (msg && msg.content) reply = msg.content;
            }
            if (!reply && data && data.message && data.message.content) {
                reply = data.message.content;
            }
            const locationName = normalizeLocationName(reply) || pickLocationName();
            aiAddress.value = locationName;
            calculatedDistance.value = buildDistanceText(userAddress.value, locationName);
        } catch (error) {
            const fallbackLoc = pickLocationName();
            aiAddress.value = fallbackLoc;
            calculatedDistance.value = buildDistanceText(userAddress.value, fallbackLoc);
        }
    };

    const sendLocationMessage = () => {
        if (!soulLinkActiveChat.value) return;
        const userLocation = userAddress.value.trim();
        const aiLocation = aiAddress.value.trim();
        const distance = calculatedDistance.value.trim();
        if (!distance || (!userLocation && !aiLocation)) {
            alert('“我的位置”和“Ta的位置”至少填写一个，且“相距”为必填项。');
            return;
        }
        const trajectoryPoints = locationTrajectoryPoints.value
            .map(name => name.trim())
            .filter(Boolean)
            .map(name => ({ name }));
        let contentString = '[SEND_LOCATION]';
        if (userLocation) contentString += ` 我的位置: ${userLocation}`;
        if (aiLocation) contentString += ` | Ta的位置: ${aiLocation}`;
        contentString += ` | 相距: ${distance}`;
        if (trajectoryPoints.length > 0) {
            const trajectoryText = trajectoryPoints.map(p => p.name).join(', ');
            contentString += ` | 途经点: ${trajectoryText}`;
        }
        const newMsg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'location',
            userLocation,
            aiLocation,
            address: userLocation,
            locationName: userLocation || aiLocation,
            distance,
            trajectoryPoints,
            text: contentString,
            timestamp: Date.now(),
            isReplied: false
        };
        if (soulLinkActiveChatType.value === 'group') {
            newMsg.senderName = '我';
        }
        pushMessageToActiveChat(newMsg);
        return newMsg;
    };

    const openLocationPanel = async () => {
        showAttachmentPanel.value = false;
        showLocationPanel.value = true;
        if (!userAddress.value) {
            userAddress.value = locationUser.value || '当前位置';
        }
        aiAddress.value = '定位中...';
        calculatedDistance.value = '计算中...';
        await inferAiLocationForPanel();
    };

    const closeLocationPanel = () => {
        showLocationPanel.value = false;
    };

    const sendLocation = () => {
        const userLoc = userAddress.value.trim();
        const aiLoc = (aiAddress.value || '').trim();
        const distance = (calculatedDistance.value || '').trim() || buildDistanceText(userLoc, aiLoc);
        locationUser.value = userLoc;
        locationTarget.value = aiLoc;
        locationDistance.value = distance;
        locationTrajectoryPoints.value = [];
        sendLocationMessage();
        closeLocationPanel();
    };

    const openTransferPanel = () => {
        showAttachmentPanel.value = false;
        showTransferPanel.value = true;
        transferAmount.value = 0;
        transferNote.value = '';
    };

    const closeTransferPanel = () => {
        showTransferPanel.value = false;
    };

    const sendTransferMessage = () => {
        if (!soulLinkActiveChat.value || transferAmount.value <= 0) return;
        const newMsg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'transfer',
            amount: transferAmount.value,
            transferAmount: transferAmount.value.toFixed(2),
            note: transferNote.value.trim(),
            transferStatus: 'pending',
            text: `转账 ¥${transferAmount.value.toFixed(2)}`,
            timestamp: Date.now(),
            isReplied: false
        };
        if (soulLinkActiveChatType.value === 'group') {
            newMsg.senderName = '我';
        }
        pushMessageToActiveChat(newMsg);
        showTransferPanel.value = false;
    };

    const sendTransfer = () => {
        sendTransferMessage();
        closeTransferPanel();
    };

    const toggleEmojiPanel = () => {
        showEmojiPanel.value = !showEmojiPanel.value;
        if (showEmojiPanel.value) {
            showAttachmentPanel.value = false;
            showImageSubmenu.value = false;
            showLocationPanel.value = false;
            showTransferPanel.value = false;
        }
    };

    const toggleAttachmentPanel = () => {
        showAttachmentPanel.value = !showAttachmentPanel.value;
        if (showAttachmentPanel.value) {
            showEmojiPanel.value = false;
            showImageSubmenu.value = false;
            showLocationPanel.value = false;
            showTransferPanel.value = false;
        }
    };

    const handleRetry = async () => {
        showAttachmentPanel.value = false;
        const isGroupChat = soulLinkActiveChatType.value === 'group';
        const history = isGroupChat
            ? (activeGroupChat.value?.history || [])
            : (soulLinkMessages.value[soulLinkActiveChat.value] || []);
        if (history.length === 0) {
            alert('没有可重试的消息');
            return;
        }
        const lastAiMsgIndex = history.map((m, i) => ({ ...m, index: i })).reverse().find(m => m.sender === 'ai');
        if (!lastAiMsgIndex) {
            alert('没有可重试的AI回复');
            return;
        }
        history.splice(lastAiMsgIndex.index, 1);
        pushMessageToActiveChat({
            id: Date.now(),
            sender: 'system',
            text: '正在重新生成回复...',
            timestamp: Date.now(),
            isSystem: true
        });
        await triggerSoulLinkAiReply();
    };

    const handleTakeaway = () => {
        showAttachmentPanel.value = false;
        const restaurants = [
            { name: '麦当劳', food: '巨无霸套餐', price: 38 },
            { name: '肯德基', food: '香辣鸡腿堡套餐', price: 35 },
            { name: '必胜客', food: '至尊披萨', price: 89 },
            { name: '星巴克', food: '拿铁咖啡', price: 32 },
            { name: '海底捞', food: '番茄锅底', price: 128 }
        ];
        const randomRestaurant = restaurants[Math.floor(Math.random() * restaurants.length)];
        const msg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'takeaway',
            text: `外卖：${randomRestaurant.food}`,
            restaurant: randomRestaurant.name,
            food: randomRestaurant.food,
            price: randomRestaurant.price,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushMessageToActiveChat(msg);
        saveSoulLinkMessages();
    };

    const handleVote = () => {
        showAttachmentPanel.value = false;
        showVotePanel.value = true;
    };

    const openTaobaoPanel = () => {
        showAttachmentPanel.value = false;
        showTaobaoPanel.value = true;
    };

    const loadTaobaoProductImage = async (product, index) => {
        try {
            const enhancedPrompt = `${product.imagePrompt}, professional product photography, high quality, 4k, detailed, studio lighting, centered composition, no text, no watermark`;
            const seed = Math.floor(Math.random() * 1000000);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=400&height=400&nologo=true&seed=${seed}&negative_prompt=text,watermark,signature,blurry,low quality`;
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                if (taobaoProducts.value[index]) {
                    taobaoProducts.value[index].imageUrl = imageUrl;
                }
            };
            img.onerror = () => {
                setTimeout(() => {
                    if (taobaoProducts.value[index] && !taobaoProducts.value[index].imageUrl) {
                        taobaoProducts.value[index].imageUrl = `https://placehold.co/400x400/F5F5F5/666666?text=${encodeURIComponent(product.name.slice(0, 4))}`;
                    }
                }, 3000);
            };
            img.src = imageUrl;
            setTimeout(() => {
                if (taobaoProducts.value[index] && !taobaoProducts.value[index].imageUrl) {
                    taobaoProducts.value[index].imageUrl = `https://placehold.co/400x400/F5F5F5/666666?text=${encodeURIComponent(product.name.slice(0, 4))}`;
                }
            }, 8000);
        } catch (error) {
            if (taobaoProducts.value[index]) {
                taobaoProducts.value[index].imageUrl = `https://placehold.co/400x400/F5F5F5/666666?text=${encodeURIComponent(product.name.slice(0, 4))}`;
            }
        }
    };

    const searchTaobaoProducts = async () => {
        const searchTerm = taobaoSearchTerm.value.trim();
        if (!searchTerm) return;
        if (!activeProfile.value) {
            alert('请先配置API！');
            return;
        }
        taobaoLoading.value = true;
        taobaoProducts.value = [];
        const profile = activeProfile.value;
        const endpoint = (profile.endpoint || '').trim();
        const key = (profile.key || '').trim();
        let modelId = profile.model;
        if (!endpoint || !key) {
            alert('当前配置缺少 API 地址或密钥');
            taobaoLoading.value = false;
            return;
        }
        const prompt = `
# 任务
你是一个虚拟购物App的搜索引擎。请根据用户提供的【搜索关键词】，为Ta创作一个包含6-8件相关商品的列表。

# 用户搜索的关键词:
"${searchTerm}"

# 核心规则
1.  **高度相关**: 所有商品都必须与用户的搜索关键词 "${searchTerm}" 紧密相关。
2.  **商品多样性**: 即使是同一个主题，也要尽量展示不同款式、功能或角度的商品。
3.  **格式铁律**: 你的回复【必须且只能】是一个严格的JSON数组，每个对象代表一件商品，【必须】包含以下字段:
    -   \`"name"\`: 商品名称
    -   \`"price"\`: 价格 (数字，人民币)
    -   \`"category"\`: 商品分类
    -   \`"imagePrompt"\`: 一个详细的、用于文生图AI的【英文提示词】，描述这张商品的【产品展示图 (product shot)】。风格要求【干净、简约、纯色或渐变背景 (clean, minimalist, solid color background)】。

# JSON输出格式示例:
[
  {
    "name": "赛博朋克风发光数据线",
    "price": 69.9,
    "category": "数码配件",
    "imagePrompt": "A glowing cyberpunk style data cable, product shot, on a dark tech background, neon lights, high detail"
  }
]`;
        try {
            const messagesForApi = [{ role: 'user', content: prompt }];
            const response = await fetch(endpoint.replace(/\/+$/, '') + '/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: modelId || '',
                    messages: messagesForApi,
                    temperature: 0.8
                })
            });
            if (!response.ok) throw new Error('API请求失败');
            const data = await response.json();
            const rawContent = data.choices[0].message.content;
            const cleanedContent = rawContent.replace(/^```json\s*|```$/g, '').trim();
            const newProducts = JSON.parse(cleanedContent);
            if (Array.isArray(newProducts) && newProducts.length > 0) {
                taobaoProducts.value = newProducts.map(p => ({ ...p, imageUrl: null }));
                newProducts.forEach((product, index) => {
                    loadTaobaoProductImage(product, index);
                });
            } else {
                throw new Error('AI没有找到相关的商品。');
            }
        } catch (error) {
            console.error('AI搜索商品失败:', error);
            alert('搜索失败: ' + error.message);
        } finally {
            taobaoLoading.value = false;
        }
    };

    const buyTaobaoProduct = (product) => {
        const orderMsg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'order',
            platform: '购物',
            item: product.name,
            price: product.price,
            status: '已下单',
            eta: '2-3天',
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushMessageToActiveChat(orderMsg);
        saveSoulLinkMessages();
        showTaobaoPanel.value = false;
        scrollToBottom();
    };

    const helpBuyTaobaoProduct = (product) => {
        const helpBuyMsg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'helpBuy',
            item: product.name,
            price: product.price,
            isPurchased: false,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushMessageToActiveChat(helpBuyMsg);
        saveSoulLinkMessages();
        showTaobaoPanel.value = false;
        scrollToBottom();
    };

    const addVoteOption = () => {
        if (voteOptions.value.length < 6) {
            voteOptions.value.push('');
        }
    };

    const removeVoteOption = (index) => {
        if (voteOptions.value.length > 2) {
            voteOptions.value.splice(index, 1);
        }
    };

    const createVote = () => {
        const validOptions = voteOptions.value.filter(opt => opt.trim());
        if (!voteQuestion.value.trim() || validOptions.length < 2) {
            alert('请输入投票问题和至少两个选项');
            return;
        }
        const msg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'vote',
            text: `投票：${voteQuestion.value}`,
            question: voteQuestion.value,
            options: validOptions.map(opt => ({ text: opt, votes: 0 })),
            totalVotes: 0,
            hasVoted: false,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushMessageToActiveChat(msg);
        saveSoulLinkMessages();
        voteQuestion.value = '';
        voteOptions.value = ['', ''];
        showVotePanel.value = false;
    };

    /** 与模板 index 中 castVoteInChat(index, optIndex) 一致 */
    const castVoteInChat = (msgIndex, optionIndex) => {
        const isGroupChat = soulLinkActiveChatType.value === 'group';
        const history = isGroupChat
            ? (activeGroupChat.value?.history || [])
            : (soulLinkMessages.value[soulLinkActiveChat.value] || []);
        const msg = history[msgIndex];
        if (msg && msg.messageType === 'vote' && !msg.hasVoted) {
            msg.options[optionIndex].votes++;
            msg.totalVotes++;
            msg.hasVoted = true;
            saveSoulLinkMessages();
        }
    };

    const handleShare = () => {
        showAttachmentPanel.value = false;
        showSharePanel.value = true;
    };

    const sendShareCard = () => {
        if (!shareSource.value || !shareContent.value.trim()) {
            alert('请选择来源并填写分享内容');
            return;
        }
        const shareMsg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'share',
            source: shareSource.value,
            content: shareContent.value.trim(),
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushMessageToActiveChat(shareMsg);
        saveSoulLinkMessages();
        shareSource.value = '';
        shareContent.value = '';
        showSharePanel.value = false;
        scrollToBottom();
    };

    const handleTarot = () => {
        showAttachmentPanel.value = false;
        const tarotCards = [
            { name: '愚者', meaning: '新的开始、冒险、纯真', emoji: '🃏' },
            { name: '魔术师', meaning: '创造力、自信、行动力', emoji: '🎩' },
            { name: '女祭司', meaning: '直觉、神秘、智慧', emoji: '🌙' },
            { name: '女皇', meaning: '丰盛、母性、创造力', emoji: '👑' },
            { name: '皇帝', meaning: '权威、结构、领导力', emoji: '🏛️' },
            { name: '恋人', meaning: '爱情、选择、和谐', emoji: '💕' },
            { name: '战车', meaning: '意志力、胜利、决心', emoji: '⚔️' },
            { name: '力量', meaning: '勇气、耐心、内在力量', emoji: '🦁' },
            { name: '隐士', meaning: '内省、寻求真理、智慧', emoji: '🏔️' },
            { name: '命运之轮', meaning: '变化、机遇、命运', emoji: '🎡' },
            { name: '正义', meaning: '公平、真相、因果', emoji: '⚖️' },
            { name: '倒吊人', meaning: '牺牲、等待、新视角', emoji: '🙃' },
            { name: '死神', meaning: '结束、转变、重生', emoji: '🦋' },
            { name: '节制', meaning: '平衡、耐心、调和', emoji: '🌈' },
            { name: '恶魔', meaning: '束缚、诱惑、物质', emoji: '😈' },
            { name: '塔', meaning: '突变、觉醒、重建', emoji: '🗼' },
            { name: '星星', meaning: '希望、灵感、平静', emoji: '⭐' },
            { name: '月亮', meaning: '幻觉、恐惧、潜意识', emoji: '🌕' },
            { name: '太阳', meaning: '成功、活力、快乐', emoji: '☀️' },
            { name: '审判', meaning: '觉醒、重生、召唤', emoji: '📯' },
            { name: '世界', meaning: '完成、整合、成就', emoji: '🌍' }
        ];
        const randomCard = tarotCards[Math.floor(Math.random() * tarotCards.length)];
        const isReversed = Math.random() > 0.5;
        const msg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'tarot',
            text: `塔罗占卜：${randomCard.emoji} ${randomCard.name}${isReversed ? '（逆位）' : ''}`,
            cardName: randomCard.name,
            cardMeaning: randomCard.meaning,
            isReversed: isReversed,
            emoji: randomCard.emoji,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushMessageToActiveChat(msg);
        saveSoulLinkMessages();
    };

    const handlePet = () => {
        showAttachmentPanel.value = false;
        if (!soulLinkPet.value) {
            soulLinkPet.value = {
                name: '小可爱',
                mood: 100,
                hunger: 100,
                level: 1,
                exp: 0
            };
        }
        const actions = [
            { action: 'feed', text: '喂食', emoji: '🍖' },
            { action: 'play', text: '玩耍', emoji: '🎾' },
            { action: 'pet', text: '抚摸', emoji: '🤚' }
        ];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        let moodChange = 0;
        let hungerChange = 0;
        let expGain = 0;
        switch (randomAction.action) {
            case 'feed':
                hungerChange = 20;
                moodChange = 5;
                expGain = 5;
                break;
            case 'play':
                moodChange = 15;
                hungerChange = -5;
                expGain = 10;
                break;
            case 'pet':
                moodChange = 10;
                expGain = 3;
                break;
        }
        soulLinkPet.value.mood = Math.min(100, Math.max(0, soulLinkPet.value.mood + moodChange));
        soulLinkPet.value.hunger = Math.min(100, Math.max(0, soulLinkPet.value.hunger + hungerChange));
        soulLinkPet.value.exp += expGain;
        if (soulLinkPet.value.exp >= soulLinkPet.value.level * 100) {
            soulLinkPet.value.level += 1;
            soulLinkPet.value.exp = 0;
        }
        const msg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'pet',
            text: `与${soulLinkPet.value.name}${randomAction.text}${randomAction.emoji}`,
            petName: soulLinkPet.value.name,
            action: randomAction.text,
            emoji: randomAction.emoji,
            mood: soulLinkPet.value.mood,
            hunger: soulLinkPet.value.hunger,
            level: soulLinkPet.value.level,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushMessageToActiveChat(msg);
        saveSoulLinkMessages();
    };

    const handleOrder = () => {
        showAttachmentPanel.value = false;
        const orders = [
            { platform: '美团外卖', item: '黄焖鸡米饭', price: 28, status: '配送中', eta: '15分钟' },
            { platform: '饿了么', item: '麻辣香锅', price: 45, status: '商家接单', eta: '30分钟' },
            { platform: '京东', item: '无线蓝牙耳机', price: 199, status: '已发货', eta: '明天送达' },
            { platform: '购物', item: '手机壳', price: 25, status: '运输中', eta: '2天后' },
            { platform: '拼多多', item: '零食大礼包', price: 39, status: '已签收', eta: '已送达' }
        ];
        const randomOrder = orders[Math.floor(Math.random() * orders.length)];
        const msg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'order',
            text: `订单：${randomOrder.platform} - ${randomOrder.item}`,
            platform: randomOrder.platform,
            item: randomOrder.item,
            price: randomOrder.price,
            status: randomOrder.status,
            eta: randomOrder.eta,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushMessageToActiveChat(msg);
        saveSoulLinkMessages();
    };

    const startVoiceInput = () => {
        showAttachmentPanel.value = false;
        showVoiceInputPanel.value = true;
        voiceInputText.value = '';
    };

    const sendVoiceMessage = () => {
        if (!voiceInputText.value.trim()) return;
        const text = voiceInputText.value.trim();
        const duration = Math.max(1, Math.ceil(text.length / 3));
        const msg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'voice',
            voiceText: text,
            voiceDuration: duration,
            text: '[语音]',
            timestamp: Date.now(),
            isReplied: false,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        if (soulLinkActiveChatType.value === 'group') {
            msg.senderName = '我';
        }
        pushMessageToActiveChat(msg);
        saveSoulLinkMessages();
        voiceInputText.value = '';
        showVoiceInputPanel.value = false;
        scrollToBottom();
    };

    const closeVoiceInputPanel = () => {
        showVoiceInputPanel.value = false;
        voiceInputText.value = '';
    };

    const selectFromAlbum = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    compress(ev.target.result, 'chatImage', (compressedDataUrl) => {
                        const msg = {
                            id: Date.now(),
                            sender: 'user',
                            messageType: 'image',
                            imageUrl: compressedDataUrl,
                            text: '图片',
                            timestamp: Date.now(),
                            isReplied: false,
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        };
                        if (soulLinkActiveChatType.value === 'group') {
                            msg.senderName = '我';
                        }
                        pushMessageToActiveChat(msg);
                        saveSoulLinkMessages();
                        scrollToBottom();
                    });
                };
                reader.readAsDataURL(file);
            }
            showPhotoSelectPanel.value = false;
        };
        input.click();
    };

    const sendTextImage = () => {
        if (!textImageText.value.trim()) return;
        const msg = {
            id: Date.now(),
            sender: 'user',
            messageType: 'textImage',
            textImageText: textImageText.value,
            textImageBgColor: textImageBgColor.value,
            text: '文字图',
            timestamp: Date.now(),
            isReplied: false,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        if (soulLinkActiveChatType.value === 'group') {
            msg.senderName = '我';
        }
        pushMessageToActiveChat(msg);
        saveSoulLinkMessages();
        textImageText.value = '';
        showTextImagePanel.value = false;
        scrollToBottom();
    };

    const addTrajectoryPoint = () => {
        if (locationTrajectoryPoints.value.length >= 3) return;
        locationTrajectoryPoints.value.push('');
    };

    const removeTrajectoryPoint = (index) => {
        locationTrajectoryPoints.value.splice(index, 1);
    };

    return {
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
    };
}

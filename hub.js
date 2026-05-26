// =========================================================================
// == HUB APP SCRIPT
// == 社交生态集大成者
// =========================================================================

// 导入必要的依赖
import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export function useHub(state = {}) {
    // --- 状态管理 ---    
    const posts = ref([]);
    const loading = ref(false);
    const error = ref(null);
    const refreshing = ref(false);
    const page = ref(1);
    const hasMore = ref(true);
    
    // 角色列表 - 从state中获取ref对象或使用空数组
    const characters = state.characters || ref([]);
    
    // 界面状态
    const showSearchBar = ref(false);
    const showUserMenu = ref(false);
    const showUserProfile = ref(false);
    const showGenerateModal = ref(false);
    const showHotSearch = ref(false);
    const hotSearches = ref([]);
    const searchKeyword = ref('');
    const activeCommentPostId = ref(null);
    const activeReplyCommentId = ref(null);
    const commentContent = ref('');
    const replyContent = ref('');
    
    // 生成内容相关状态
    const selectedCharacters = ref([]);
    const generateOption = ref('post');
    const generating = ref(false);
    
    // 当前视图状态
    const currentView = ref('feed'); // feed, topic, item, circle, profile
    const currentTopic = ref(null);
    const currentItem = ref(null);
    const currentCircle = ref(null);
    const currentUser = ref(null);
    
    // 用户配置
    const userConfig = ref({
        id: 'user_001',
        nickname: '用户',
        avatar: 'https://placehold.co/100x100?text=Avatar',
        bio: '热爱生活，分享美好',
        following: 123,
        followers: 456,
        posts: 78,
        collections: [] // 珍藏列表
    });
    
    // 当前查看的用户
    const viewingUser = ref(null);
    

    
    // 评论数据结构
    const mockComments = {
        'post_1': [
            {
                id: 'comment_1_1',
                user: {
                    id: 'user_002',
                    name: '时尚粉丝',
                    avatar: 'https://placehold.co/100x100?text=Fan1'
                },
                content: '这套穿搭真的很好看！求链接',
                timestamp: Date.now() - 1800000,
                likes: 23,
                replies: [
                    {
                        id: 'reply_1_1_1',
                        user: {
                            id: 'user_001',
                            name: '时尚达人',
                            avatar: 'https://placehold.co/100x100?text=User1'
                        },
                        content: '谢谢喜欢！链接已经私信你了',
                        timestamp: Date.now() - 900000,
                        likes: 15
                    }
                ]
            },
            {
                id: 'comment_1_2',
                user: {
                    id: 'user_003',
                    name: '穿搭控',
                    avatar: 'https://placehold.co/100x100?text=Fan2'
                },
                content: '颜色搭配很和谐',
                timestamp: Date.now() - 3600000,
                likes: 8
            }
        ],
        'post_2': [
            {
                id: 'comment_2_1',
                user: {
                    id: 'user_004',
                    name: '科技迷',
                    avatar: 'https://placehold.co/100x100?text=Fan3'
                },
                content: '期待这款新品！',
                timestamp: Date.now() - 1200000,
                likes: 45
            }
        ],
        'post_3': [
            {
                id: 'comment_3_1',
                user: {
                    id: 'user_005',
                    name: '电影爱好者',
                    avatar: 'https://placehold.co/100x100?text=Fan4'
                },
                content: '这部电影确实不错，我打了4星',
                timestamp: Date.now() - 2400000,
                likes: 12
            }
        ],
        'post_4': [
            {
                id: 'comment_4_1',
                user: {
                    id: 'user_006',
                    name: '游戏玩家',
                    avatar: 'https://placehold.co/100x100?text=Fan5'
                },
                content: '这个攻略太有用了！',
                timestamp: Date.now() - 3000000,
                likes: 31,
                replies: [
                    {
                        id: 'reply_4_1_1',
                        user: {
                            id: 'user_007',
                            name: '游戏达人',
                            avatar: 'https://placehold.co/100x100?text=Fan6'
                        },
                        content: '感谢分享！',
                        timestamp: Date.now() - 1500000,
                        likes: 7
                    }
                ]
            }
        ]
    };
    
    // --- 方法 ---    
    // 加载帖子
    const loadPosts = async (refresh = false) => {
        if (loading.value || (!hasMore.value && !refresh)) return;
        
        loading.value = true;
        error.value = null;
        
        try {
            // 模拟API请求延迟
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (refresh) {
                page.value = 1;
                posts.value = [];
                hasMore.value = true;
            }
            
            // 初始加载时显示提示信息
            if (posts.value.length === 0) {
                posts.value = [{
                    id: 'welcome_post',
                    author: {
                        id: 'system',
                        name: '系统',
                        avatar: 'https://placehold.co/100x100?text=System'
                    },
                    timestamp: Date.now(),
                    text: '欢迎使用HUB应用！点击右上角的魔法按钮生成内容，开始你的社交体验。',
                    images: [],
                    item: null,
                    circle: null,
                    stats: {
                        likes: 0,
                        comments: 0,
                        favorites: 0,
                        shares: 0
                    },
                    interacted: {
                        liked: false,
                        favorited: false,
                        shared: false
                    }
                }];
            }
            
            // 模拟没有更多数据
            hasMore.value = false;
            
            page.value++;
        } catch (err) {
            error.value = '加载失败，请重试';
            console.error('加载帖子失败:', err);
        } finally {
            loading.value = false;
            refreshing.value = false;
        }
    };
    
    // 下拉刷新
    const refreshPosts = async () => {
        refreshing.value = true;
        await loadPosts(true);
    };
    
    // 加载更多
    const loadMorePosts = async () => {
        if (!loading.value && hasMore.value) {
            await loadPosts(false);
        }
    };
    
    // 点赞帖子
    const likePost = (postId) => {
        const post = posts.value.find(p => p.id === postId);
        if (post) {
            if (post.interacted.liked) {
                post.stats.likes--;
                post.interacted.liked = false;
            } else {
                post.stats.likes++;
                post.interacted.liked = true;
                // 如果圈子开启踩功能，取消踩
                if (post.circle?.allowDislike && post.interacted.disliked) {
                    post.stats.dislikes--;
                    post.interacted.disliked = false;
                }
            }
        }
    };
    
    // 踩帖子（仅当圈子开启踩功能）
    const dislikePost = (postId) => {
        const post = posts.value.find(p => p.id === postId);
        if (post && post.circle?.allowDislike) {
            if (post.interacted.disliked) {
                post.stats.dislikes--;
                post.interacted.disliked = false;
            } else {
                post.stats.dislikes++;
                post.interacted.disliked = true;
                // 取消点赞
                if (post.interacted.liked) {
                    post.stats.likes--;
                    post.interacted.liked = false;
                }
            }
        }
    };
    
    // 珍藏帖子（所有帖子都可珍藏）
    const favoritePost = (postId) => {
        const post = posts.value.find(p => p.id === postId);
        if (post) {
            if (post.interacted.favorited) {
                post.stats.favorites--;
                post.interacted.favorited = false;
                // 从用户珍藏列表中移除
                const index = userConfig.value.collections.indexOf(postId);
                if (index > -1) {
                    userConfig.value.collections.splice(index, 1);
                }
            } else {
                post.stats.favorites++;
                post.interacted.favorited = true;
                // 添加到用户珍藏列表
                userConfig.value.collections.push(postId);
            }
        }
    };
    
    // 评分帖子（仅当有关联条目）
    const ratePost = (postId, rating) => {
        const post = posts.value.find(p => p.id === postId);
        if (post && post.item) {
            post.interacted.rated = rating;
            // 更新评分统计（模拟）
            if (post.stats.ratings) {
                post.stats.ratings.average = ((post.stats.ratings.average * post.stats.ratings.count) + rating) / (post.stats.ratings.count + 1);
                post.stats.ratings.count++;
            }
        }
    };
    
    // 评论帖子
    const commentPost = (postId, content) => {
        if (!content.trim()) return;
        
        const post = posts.value.find(p => p.id === postId);
        if (post) {
            post.stats.comments++;
            // 这里可以添加评论逻辑
            commentContent.value = '';
            activeCommentPostId.value = null;
        }
    };
    
    // 回复评论
    const replyComment = (postId, commentId, content) => {
        if (!content.trim()) return;
        
        // 这里可以添加回复逻辑
        replyContent.value = '';
        activeReplyCommentId.value = null;
    };
    
    // 传声帖子（分享）
    const sharePost = (postId) => {
        const post = posts.value.find(p => p.id === postId);
        if (post) {
            post.stats.shares++;
            post.interacted.shared = true;
            // 这里可以添加分享逻辑
        }
    };
    
    // 关注用户
    const followUser = (userId) => {
        // 这里可以添加关注逻辑
        userConfig.value.following++;
        if (viewingUser.value) {
            viewingUser.value.isFollowing = true;
        }
    };
    
    // 搜索内容
    const searchContent = async (keyword) => {
        if (!keyword.trim()) return;
        
        loading.value = true;
        
        try {
            // 模拟搜索延迟
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // 简单的搜索逻辑 - 使用当前posts数组
            const results = posts.value.filter(post => 
                post.text.includes(keyword)
            );
            
            posts.value = results;
            hasMore.value = false;
        } catch (err) {
            error.value = '搜索失败，请重试';
        } finally {
            loading.value = false;
        }
    };
    
    // 查看用户资料
    const viewUserProfile = (userId) => {
        // 模拟用户资料
        viewingUser.value = {
            id: userId,
            name: '用户' + userId.split('_')[1],
            avatar: `https://placehold.co/100x100?text=User${userId.split('_')[1]}`,
            bio: '这是一个用户简介',
            following: 123,
            followers: 456,
            posts: 78,
            isFollowing: false
        };
        showUserProfile.value = true;
    };
    
    // 关闭用户资料
    const closeUserProfile = () => {
        showUserProfile.value = false;
        viewingUser.value = null;
    };
    
    // 切换搜索栏
    const toggleSearchBar = () => {
        showSearchBar.value = !showSearchBar.value;
        if (showSearchBar.value) {
            showUserMenu.value = false;
        }
    };
    
    // 切换用户菜单
    const toggleUserMenu = () => {
        showUserMenu.value = !showUserMenu.value;
        if (showUserMenu.value) {
            showSearchBar.value = false;
        }
    };
    
    // 切换生成模态框
    const toggleGenerateModal = () => {
        showGenerateModal.value = !showGenerateModal.value;
        if (showGenerateModal.value) {
            showSearchBar.value = false;
            showUserMenu.value = false;
            // 重置选择
            selectedCharacters.value = [];
            generateOption.value = 'post';
        }
    };
    
    // 全选角色
    const selectAllCharacters = () => {
        // 这里需要获取所有角色的ID，暂时使用模拟数据
        // 实际应用中，应该从外部传入角色列表
        const allCharacterIds = ['1', '2', '3']; // 模拟角色ID
        selectedCharacters.value = allCharacterIds;
    };
    
    // 反选角色
    const selectNoneCharacters = () => {
        selectedCharacters.value = [];
    };
    
    // 随机选择角色
    const selectRandomCharacter = () => {
        // 模拟随机选择一个角色
        const allCharacterIds = ['1', '2', '3'];
        const randomIndex = Math.floor(Math.random() * allCharacterIds.length);
        selectedCharacters.value = [allCharacterIds[randomIndex]];
    };
    
    // 生成内容
    const generateContent = async (charactersList = []) => {
        if (selectedCharacters.value.length === 0) return;
        
        generating.value = true;
        
        try {
            // 模拟API请求延迟
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 调试信息
            console.log('Selected character IDs:', selectedCharacters.value);
            console.log('Characters list:', charactersList);
            
            // 获取选中的角色信息 - 尝试多种匹配方式
            let selectedChars = [];
            
            // 尝试直接匹配 - 处理类型转换问题
            selectedChars = charactersList.filter(char => {
                const charIdStr = String(char.id);
                return selectedCharacters.value.includes(charIdStr) ||
                       selectedCharacters.value.includes(char.id) ||
                       selectedCharacters.value.includes(Number(charIdStr));
            });
            
            // 如果没有匹配到，尝试其他方式
            if (selectedChars.length === 0 && charactersList.length > 0) {
                console.log('No direct matches, trying alternative matching');
                // 尝试使用索引或其他方式
                selectedChars = charactersList.slice(0, 1); // 至少使用第一个角色
            }
            
            // 再次检查，如果还是没有匹配到，尝试使用所有角色
            if (selectedChars.length === 0 && charactersList.length > 0) {
                console.log('Still no matches, using all characters');
                selectedChars = charactersList;
            }
            
            console.log('Selected chars:', selectedChars);
            
            // 为每个选中的角色生成与他们相关的帖子
            for (const char of selectedChars) {
                // 生成与角色相关的内容
                const content = await generateRelevantContent([char], state);
                
                // 生成随机用户作为帖子作者（不是角色自己）
                const randomAuthor = generateRandomAuthor();
                
                // 使用content中的stats数据，如果没有则生成
                const stats = content.stats || generateMockStats();
                
                // 处理评论数据
                const comments = content.comments || [];
                
                const newPost = {
                    id: 'post_' + Date.now() + '_' + char.id + '_' + Math.floor(Math.random() * 1000),
                    author: {
                        id: 'user_' + randomAuthor.id,
                        name: randomAuthor.name,
                        avatar: randomAuthor.avatar
                    },
                    timestamp: Date.now(),
                    text: content.text,
                    images: content.images,
                    tags: content.tags || [],
                    item: content.item || null,
                    circle: content.circle || null,
                    stats: stats,
                    comments: comments,
                    interacted: {
                        liked: false,
                        favorited: false,
                        shared: false
                    }
                };
                
                // 添加到帖子列表
                posts.value.unshift(newPost);
            }
            
            // 关闭模态框
            showGenerateModal.value = false;
        } catch (err) {
            console.error('生成内容失败:', err);
        } finally {
            generating.value = false;
        }
    };
    
    // 生成模拟互动数据
    const generateMockStats = () => {
        // 根据内容热度生成合理的互动数据
        const baseLikes = Math.floor(Math.random() * 50) + 10;
        const baseComments = Math.floor(baseLikes * (Math.random() * 0.3 + 0.1));
        const baseShares = Math.floor(baseLikes * (Math.random() * 0.2 + 0.05));
        const baseFavorites = Math.floor(baseLikes * (Math.random() * 0.25 + 0.05));
        
        return {
            likes: baseLikes,
            comments: baseComments,
            shares: baseShares,
            favorites: baseFavorites
        };
    };
    
    // 生成随机用户作为帖子作者
    const generateRandomAuthor = () => {
        const prefixes = ['甜','酷','萌','飒','暖','盐','辣','炫','潮','炸'];
        const middles = ['小','阿','大','超级','无敌','宇宙'];
        const suffixes = ['糖','豆','米','芽','果','乐','星','月','阳','光','风','云','雨','雪','花','草','树','木'];
        const specialNames = ['嗑糖达人','追剧少女','美食侦探','旅行日记','科技迷','文艺青年','健身达人','美妆博主','游戏玩家','音乐爱好者'];
        
        // 70% 概率使用特殊名称，30% 概率使用组合名称
        let randomName;
        if (Math.random() > 0.3) {
            randomName = specialNames[Math.floor(Math.random() * specialNames.length)];
        } else {
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const middle = middles[Math.floor(Math.random() * middles.length)];
            const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
            randomName = prefix + middle + suffix;
        }
        
        const randomId = Math.floor(Math.random() * 10000);
        const randomAvatar = `https://placehold.co/100x100?text=${encodeURIComponent(randomName)}`;
        
        return {
            id: randomId,
            name: randomName,
            avatar: randomAvatar
        };
    };
    
    // 生成与角色相关的内容
    const generateRelevantContent = async (characters, state = {}) => {
        console.log('Generating content for characters:', characters);
        
        if (characters.length === 0) {
            console.log('No characters provided, returning default content');
            return {
                text: '今天天气真好，出去散散步～ #日常 #生活',
                images: ['阳光明媚的公园'],
                tags: ['日常', '生活'],
                stats: generateMockStats()
            };
        }
        
        // 构建角色信息 - 更详细地提取角色特征
        const charactersInfo = characters.map(char => {
            const charName = char.nickname || char.name || '角色';
            const charSummary = char.summary || '';
            const charTags = char.tags || [];
            const charPersona = char.persona || '';
            
            // 提取更多特征
            let profession = '';
            let hobbies = [];
            let skills = [];
            let personality = '';
            
            // 从persona中提取信息
            if (charPersona) {
                // 提取职业
                const professionMatch = charPersona.match(/profession：([^\n]+)/);
                if (professionMatch) {
                    profession = professionMatch[1].trim();
                }
                
                // 提取兴趣爱好
                const hobbyMatch = charPersona.match(/hobby：([^\n]+)/);
                if (hobbyMatch) {
                    hobbies = hobbyMatch[1].split('、').map(h => h.trim());
                }
                
                // 提取技能
                const skillMatch = charPersona.match(/skills：([^\n]+)/);
                if (skillMatch) {
                    skills = skillMatch[1].split('、').map(s => s.trim());
                }
                
                // 提取性格
                const personalityMatch = charPersona.match(/character：([\s\S]+?)(?=advantage：|shortcoming：|background_story：|$)/);
                if (personalityMatch) {
                    personality = personalityMatch[1].trim();
                }
            }
            
            return {
                name: charName,
                summary: charSummary,
                tags: charTags,
                persona: charPersona,
                profession: profession,
                hobbies: hobbies,
                skills: skills,
                personality: personality
            };
        });
        
        console.log('Characters info:', charactersInfo);
        
        // 构建API请求
        const { proxyUrl, apiKey, model } = state.apiConfig || {};
        if (!proxyUrl || !apiKey || !model) {
            console.warn('API not configured, using fallback content');
            return generateFallbackContent(characters);
        }
        
        try {
            // 构建prompt - 参考weibo.js的详细结构
            const systemPrompt = `
# 任务
你是一个社交内容生成助手。请根据给定的角色人设，生成一条符合该角色身份、具有"活人感"的社交动态（帖子）。

# 角色信息
${JSON.stringify(charactersInfo, null, 2)}

# 【【【绝对禁止事项：这是必须遵守的最高指令】】】
1. 你的所有创作内容，包括帖子、评论、故事等，【绝对禁止】将任意两个AI角色（即除了用户之外的角色）描绘成情侣关系、进行恋爱互动或存在任何形式的暧昧情感。
2. AI角色之间的关系只能是朋友、同事、对手、家人等，但【绝不能】是恋人。
3. AI角色唯一可以产生恋爱关系的对象是【用户】。违反此规则将导致生成失败。

# 核心规则
1. **活人感**：内容要自然、生活化，像真实用户发的，而不是AI生成的套话。可以适当带点口语、表情、网络梗，但要符合角色人设。
2. **风格融合**：不强制指定平台，根据角色人设和内容主题自动选择风格，甚至可以混合（例如一条图文笔记同时带条目评分和话题标签）。
3. **图片描述**：生成具体、有画面感的图片描述，便于后续生成mock图片。
4. **标签**：添加与内容相关的话题标签，数量1-3个。
5. **关联条目**：如果内容涉及电影/书籍/音乐/游戏，提供相关信息。
6. **圈子**：如果内容适合特定兴趣部落，提供圈子信息。
7. **互动数据**：模拟真实互动量，与内容的吸引力和热度匹配。
8. **评论生成**：为帖子生成3-5条真实感的路人评论，评论内容应与帖子内容相关，风格多样。

# 输出格式
请返回一个JSON对象，包含以下字段：
{
  "text": "帖子正文（可包含换行和emoji）",
  "images": ["图片1的内容描述", "图片2的内容描述..."],
  "tags": ["话题标签1", "话题标签2"],
  "item": { // 如果关联条目则提供，否则省略
    "type": "movie" | "book" | "music" | "game",
    "title": "条目名称"
  },
  "circle": { // 如果发布到某个兴趣圈子则提供，否则省略
    "name": "圈子名称"
  },
  "stats": {
    "likes": 数字,
    "comments": 数字,
    "shares": 数字,
    "favorites": 数字
  },
  "comments": [ // 3-5条评论
    {
      "author": "评论者昵称",
      "text": "评论内容"
    }
  ]
}
`;
            
            // 发送API请求
            let isGemini = proxyUrl.includes('gemini');
            let messagesForApi = [{ role: "user", content: systemPrompt }];
            
            const response = await fetch(
                isGemini ? proxyUrl : `${proxyUrl}/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: messagesForApi,
                        temperature: 0.9, // 提高温度增加多样性
                        response_format: { type: "json_object" },
                    }),
                }
            );
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status} - ${await response.text()}`);
            }
            
            const data = await response.json();
            const aiResponseContent = isGemini
                ? data.candidates?.[0]?.content?.parts?.[0]?.text
                : data.choices?.[0]?.message?.content;
            
            if (!aiResponseContent) {
                throw new Error("API返回了空内容，可能被安全策略拦截。");
            }
            
            const sanitizedContent = aiResponseContent
                .replace(/^```json\s*|```$/g, "")
                .trim();
            
            const responseData = JSON.parse(sanitizedContent);
            console.log('API response:', responseData);
            
            // 确保返回的数据格式正确
            if (!responseData.text) {
                throw new Error("API返回的数据格式不正确。");
            }
            
            // 添加默认值
            responseData.images = responseData.images || [];
            responseData.tags = responseData.tags || [];
            responseData.stats = responseData.stats || generateMockStats();
            responseData.comments = responseData.comments || [];
            
            return responseData;
        } catch (error) {
            console.error('API request failed, using fallback:', error);
            return generateFallbackContent(characters);
        }
    };
    
    // 生成 fallback 内容
    const generateFallbackContent = (characters) => {
        const char = characters[0];
        const charName = char.nickname || char.name || '角色';
        const charPersona = char.persona || '';
        
        // 提取角色的兴趣爱好
        let hobbies = [];
        if (charPersona.includes('hobby：')) {
            const hobbyMatch = charPersona.match(/hobby：([^\n]+)/);
            if (hobbyMatch) {
                hobbies = hobbyMatch[1].split('、').map(h => h.trim());
            }
        }
        
        // 提取角色的技能
        let skills = [];
        if (charPersona.includes('skills：')) {
            const skillMatch = charPersona.match(/skills：([^\n]+)/);
            if (skillMatch) {
                skills = skillMatch[1].split('、').map(s => s.trim());
            }
        }
        
        // 提取角色的职业
        let profession = '';
        if (charPersona.includes('profession：')) {
            const professionMatch = charPersona.match(/profession：([^\n]+)/);
            if (professionMatch) {
                profession = professionMatch[1].trim();
            }
        }
        
        // 分析角色身份
        const roleInfo = analyzeCharacterRole(char);
        
        // 内容模板库 - 与角色相关的内容（其他人发的帖子）
        const contentTemplates = {
            lawyer: [
                {
                    text: '刚听说有位律师最近接了一个超级复杂的离婚案，涉及财产分割和抚养权，真的是考验专业能力的时候了！律师这个职业看起来光鲜，实际上要承受的压力真的很大。',
                    images: ['律师在办公室工作的场景', '法律书籍和文件'],
                    tags: ['法律', '律师', '职场'],
                    platforms: ['微博', '小红书'],
                    comments: [
                        { author: '法律小白', text: '律师真的不容易，需要掌握那么多法律条文' },
                        { author: '职场人', text: '每个职业都有不为人知的压力' },
                        { author: '好奇宝宝', text: '想知道最后结果怎么样了' }
                    ]
                },
                {
                    text: '最近看了《律政俏佳人》，突然对律师这个职业有了新的认识。虽然电影有点戏剧化，但里面的法律思维和辩论技巧真的很值得学习！有没有推荐类似的法律题材电影？',
                    images: ['《律政俏佳人》电影海报', '电影中的法庭场景'],
                    tags: ['电影推荐', '法律', '律政俏佳人'],
                    platforms: ['豆瓣', '小红书'],
                    item: {
                        type: 'movie',
                        title: '律政俏佳人'
                    },
                    comments: [
                        { author: '电影爱好者', text: '推荐《十二怒汉》，经典法律题材电影' },
                        { author: '法学学生', text: '这些电影确实能激发对法律的兴趣' },
                        { author: '剧荒中', text: '马上去看看，谢谢推荐' }
                    ]
                }
            ],
            doctor: [
                {
                    text: '最近温差大，大家一定要注意保暖！刚才看到一位医生分享的预防感冒小技巧，感觉很实用，分享给大家：多喝温水、保持充足睡眠、适当运动增强免疫力～',
                    images: ['一杯温水', '医生在诊室工作的场景'],
                    tags: ['健康', '养生', '生活'],
                    platforms: ['微博', '小红书'],
                    comments: [
                        { author: '养生达人', text: '这些小技巧真的很有用，我一直在坚持' },
                        { author: '上班族', text: '谢谢分享，最近确实容易感冒' },
                        { author: '关心家人', text: '马上转发给家人' }
                    ]
                },
                {
                    text: '今天去医院复诊，遇到一位特别耐心的医生，详细解答了我所有的问题，感觉特别安心。现在好医生真的很珍贵，希望所有医生都能像他一样对待患者。',
                    images: ['医院走廊', '医生在检查患者'],
                    tags: ['医疗', '医生', '生活'],
                    platforms: ['微博'],
                    comments: [
                        { author: '有同感', text: '遇到好医生真的很幸运' },
                        { author: '医护人员', text: '感谢理解，我们会继续努力' },
                        { author: '患者家属', text: '希望医疗环境越来越好' }
                    ]
                }
            ],
            teacher: [
                {
                    text: '最近遇到一位超棒的老师，他的课真的太有意思了！今天讲的历史故事，我全程都没走神，第一次觉得历史这么好玩。现在才明白，好老师真的能改变学生对学科的看法。',
                    images: ['教室场景', '老师在讲课'],
                    tags: ['教育', '教师', '学习'],
                    platforms: ['微博', '小红书'],
                    comments: [
                        { author: '学生党', text: '遇到好老师真的是人生幸事' },
                        { author: '家长', text: '希望我的孩子也能遇到这样的老师' },
                        { author: '教育工作者', text: '这就是我们努力的方向' }
                    ]
                },
                {
                    text: '要不是老师的指导，我这次考试肯定挂了。他教的学习方法真的很有用，让我对学习有了新的认识。感谢老师的耐心教导，您辛苦了！',
                    images: ['学生在学习', '老师批改作业'],
                    tags: ['教育', '学习', '成长'],
                    platforms: ['微博'],
                    comments: [
                        { author: '同为学生', text: '有这样的老师真好' },
                        { author: '老师', text: '看到学生进步就是最大的鼓励' },
                        { author: '家长', text: '老师辛苦了！' }
                    ]
                }
            ],
            artist: [
                {
                    text: '最近看了一个超棒的艺术展，里面的作品真的太有创意了！尤其是那个装置艺术，简直震撼到我了。艺术真的能给人带来不一样的感受，推荐大家都去看看～',
                    images: ['艺术展览现场', '装置艺术作品'],
                    tags: ['艺术', '展览', '创意'],
                    platforms: ['豆瓣', '小红书'],
                    comments: [
                        { author: '艺术爱好者', text: '听起来很棒，周末去看看' },
                        { author: '设计师', text: '艺术展总是能带来灵感' },
                        { author: '路人', text: '从来没去过艺术展，有点想去' }
                    ]
                },
                {
                    text: '刚才刷到一段艺术家的创作过程，原来一幅画要花这么多心思和时间。从构思到完成，每一步都需要用心。艺术家真的太不容易了，向他们致敬！',
                    images: ['艺术家在创作', '画作细节'],
                    tags: ['艺术', '创作', '背后故事'],
                    platforms: ['微博', '小红书'],
                    comments: [
                        { author: '艺术生', text: '深有同感，创作过程真的很艰难' },
                        { author: '艺术爱好者', text: '每幅作品背后都有故事' },
                        { author: '路人', text: '原来一幅画要花这么多时间' }
                    ]
                }
            ],
            programmer: [
                {
                    text: '救大命！最近遇到一个bug卡了三天，今天终于解决了！感谢一位程序员分享的代码片段，真的太有用了。技术圈的分享精神真的很棒，互相帮助才能共同进步。',
                    images: ['电脑屏幕上的代码', '程序员在工作'],
                    tags: ['编程', '技术', '分享'],
                    platforms: ['贴吧', '微博'],
                    comments: [
                        { author: ' fellow程序员', text: 'bug是程序员的日常，习惯就好' },
                        { author: '技术小白', text: '代码看起来好复杂' },
                        { author: '产品经理', text: '程序员辛苦了！' }
                    ]
                },
                {
                    text: '最近在学习新的编程语言，感觉有点吃力，但看到一位程序员的学习心得，瞬间又有动力了。他说："编程就像解谜，过程虽然痛苦，但解决问题的那一刻真的很有成就感。"',
                    images: ['编程书籍', '电脑桌面'],
                    tags: ['编程', '学习', '技术'],
                    platforms: ['贴吧', '知乎'],
                    comments: [
                        { author: '学习中', text: '同感，坚持就是胜利' },
                        { author: '资深程序员', text: '说的太对了，这就是编程的魅力' },
                        { author: '想转行', text: '有点心动，要不要学编程呢' }
                    ]
                }
            ],
            designer: [
                {
                    text: '最近看到一些超棒的设计作品，真的太戳我了！那种配色和布局，完全符合我的审美。设计真的是一门艺术，好的设计能给人带来美的享受。',
                    images: ['设计作品展示', '设计师在工作'],
                    tags: ['设计', '创意', '美学'],
                    platforms: ['小红书', '微博'],
                    comments: [
                        { author: '设计爱好者', text: '求分享更多作品' },
                        { author: '同行', text: '设计真的需要灵感' },
                        { author: '路人', text: '好看！' }
                    ]
                },
                {
                    text: '今天听一位设计师分享他的设计理念，他说："设计不是装饰，是解决问题。"这句话真的让我醍醐灌顶。好的设计应该是实用与美观的结合，而不是为了好看而好看。',
                    images: ['设计工作室', '设计草图'],
                    tags: ['设计', '理念', '分享'],
                    platforms: ['豆瓣', '小红书'],
                    comments: [
                        { author: '设计学生', text: '这句话太有道理了' },
                        { author: '资深设计师', text: '这是每个设计师都应该记住的' },
                        { author: '客户', text: '原来设计有这么多学问' }
                    ]
                }
            ],
            student: [
                {
                    text: '最近在图书馆看到一位超级努力的同学，晚上十一点了还在学习。这种努力程度，想不优秀都难。他说："现在的努力都是为了将来的自己。"真的很有道理，向他学习！',
                    images: ['图书馆学习场景', '书本和笔记'],
                    tags: ['学习', '努力', '学生'],
                    platforms: ['微博', '小红书'],
                    comments: [
                        { author: '同为学生', text: '一起努力！' },
                        { author: '毕业生', text: '现在的努力都是值得的' },
                        { author: '家长', text: '希望我的孩子也这么努力' }
                    ]
                },
                {
                    text: '最近看了一本超好看的书，是同学推荐的。内容真的很有启发，让我对很多事情有了新的看法。读书真的能开阔视野，推荐给大家！',
                    images: ['书籍封面', '书中的精彩片段'],
                    tags: ['阅读', '书籍推荐', '学习'],
                    platforms: ['豆瓣', '小红书'],
                    item: {
                        type: 'book',
                        title: '推荐书籍'
                    },
                    comments: [
                        { author: '书虫', text: '求书名！' },
                        { author: '阅读爱好者', text: '读书确实能开阔视野' },
                        { author: '学生党', text: '马上去图书馆找找' }
                    ]
                }
            ],
            business: [
                {
                    text: '最近听了一位创业者的分享，真的被震撼到了。他从一无所有到创立自己的公司，中间经历了无数次失败，但他从来没有放弃。成功真的不是偶然，背后都是汗水和努力。',
                    images: ['创业分享会现场', '商务人士在会议'],
                    tags: ['创业', '商业', '励志'],
                    platforms: ['微博', '知乎'],
                    comments: [
                        { author: '创业者', text: '创业路上确实不容易' },
                        { author: '职场人', text: '被激励到了' },
                        { author: '学生', text: '希望将来也能创业' }
                    ]
                },
                {
                    text: '最近看了一本商业书籍，里面的管理理念真的很有见地。一位管理者分享的团队管理方式让我印象深刻："真正的管理不是控制，而是激发每个人的潜能。"',
                    images: ['商业书籍封面', '团队合作场景'],
                    tags: ['管理', '商业', '职场'],
                    platforms: ['知乎', '豆瓣'],
                    item: {
                        type: 'book',
                        title: '商业管理书籍'
                    },
                    comments: [
                        { author: '管理者', text: '这句话说到心坎里了' },
                        { author: '员工', text: '希望我的领导也能这样' },
                        { author: '商学院学生', text: '记下了，以后用' }
                    ]
                },
                {
                    text: '最近听说有位年轻总裁特别厉害，年纪轻轻就接管了家族企业，而且把公司经营得有声有色。现在的年轻人真的太拼了，我们这些打工人要加油啊！',
                    images: ['商务人士在办公室', '公司大楼'],
                    tags: ['商业', '职场', '励志'],
                    platforms: ['微博', '小红书'],
                    comments: [
                        { author: '职场人', text: '年轻人确实很拼' },
                        { author: '创业者', text: '成功背后肯定有很多努力' },
                        { author: '学生', text: '向他学习' }
                    ]
                }
            ],
            other: [
                {
                    text: '最近认识一位朋友，他的{{hobby}}真的很有意思！看他分享的内容，我都忍不住想尝试一下了。有共同兴趣的朋友真的很珍贵。',
                    images: ['{{hobby}}相关场景', '朋友在一起的时光'],
                    tags: ['兴趣', '生活', '分享'],
                    platforms: ['微博', '小红书'],
                    comments: [
                        { author: '同好', text: '我也喜欢{{hobby}}！' },
                        { author: '好奇', text: '{{hobby}}是什么？听起来很有意思' },
                        { author: '路人', text: '有共同兴趣的朋友确实很珍贵' }
                    ]
                },
                {
                    text: '我的天！最近看到一位朋友展示他的{{skill}}，真的太厉害了，我都看呆了。有一技之长真的很重要，什么时候我也能像他一样厉害就好了。',
                    images: ['{{skill}}展示', '朋友在练习{{skill}}'],
                    tags: ['技能', '生活', '佩服'],
                    platforms: ['微博', '贴吧'],
                    comments: [
                        { author: '佩服', text: '太厉害了！' },
                        { author: '同好', text: '{{skill}}确实很难，需要很多练习' },
                        { author: '路人', text: '有一技之长真的很棒' }
                    ]
                },
                {
                    text: '最近发现一位超会做饭的朋友，他做的菜简直是艺术品！每道菜都色香味俱全，看他做饭的过程就是一种享受。有这样的朋友真的太幸福了，每天都能吃到好吃的～',
                    images: ['精致的菜肴', '朋友在厨房做饭'],
                    tags: ['美食', '烹饪', '生活'],
                    platforms: ['小红书', '微博'],
                    comments: [
                        { author: '吃货', text: '看起来好好吃！' },
                        { author: '美食爱好者', text: '求菜谱' },
                        { author: '不会做饭', text: '有这样的朋友太幸福了' }
                    ]
                },
                {
                    text: '最近看到一位朋友打篮球，他的球技真的太好了！运球、投篮都超级流畅，简直就是场上的焦点。篮球真的是一项很有魅力的运动，看他打球都觉得很过瘾。',
                    images: ['朋友在打篮球', '篮球场场景'],
                    tags: ['篮球', '运动', '生活'],
                    platforms: ['微博', '贴吧'],
                    comments: [
                        { author: '篮球迷', text: '求组队！' },
                        { author: '运动爱好者', text: '篮球确实很有魅力' },
                        { author: '路人', text: '看起来很精彩' }
                    ]
                },
                {
                    text: '最近听说有位年轻总裁特别有才华，不仅管理公司有方，还擅长艺术创作。现在的年轻人真的是全能型人才，让人佩服！',
                    images: ['商务人士在办公室', '艺术创作场景'],
                    tags: ['商业', '艺术', '励志'],
                    platforms: ['微博', '小红书'],
                    comments: [
                        { author: '职场人', text: '年轻有为啊' },
                        { author: '创业者', text: '全能型人才确实少见' },
                        { author: '学生', text: '向他学习' }
                    ]
                }
            ]
        };
        
        // 选择模板类型
        const templateType = contentTemplates[roleInfo.type] ? roleInfo.type : 'other';
        const templates = contentTemplates[templateType];
        
        // 随机选择一个模板
        const randomIndex = Math.floor(Math.random() * templates.length);
        let template = templates[randomIndex];
        
        // 替换模板中的变量
        let contentText = template.text;
        const hobby = hobbies.length > 0 ? hobbies[0] : '兴趣爱好';
        const skill = skills.length > 0 ? skills[0] : '技能';
        
        // 替换占位符
        contentText = contentText.replace(/\{\{hobby\}\}/g, hobby);
        contentText = contentText.replace(/\{\{skill\}\}/g, skill);
        
        // 处理评论中的占位符
        let comments = template.comments || [];
        comments = comments.map(comment => {
            let commentText = comment.text;
            commentText = commentText.replace(/\{\{hobby\}\}/g, hobby);
            commentText = commentText.replace(/\{\{skill\}\}/g, skill);
            return { ...comment, text: commentText };
        });
        
        // 添加随机的时间和场景细节，增加真实感
        const timeDetails = ['今天', '昨天', '前几天', '刚才', '周末', '上周', '最近'];
        const placeDetails = ['在咖啡店', '在图书馆', '在公司', '在家里', '在学校', '在健身房', '在公园'];
        
        // 随机选择是否添加时间细节
        if (Math.random() > 0.5) {
            const randomTime = timeDetails[Math.floor(Math.random() * timeDetails.length)];
            contentText = randomTime + ' ' + contentText;
        }
        
        // 随机选择是否添加地点细节
        if (Math.random() > 0.7) {
            const randomPlace = placeDetails[Math.floor(Math.random() * placeDetails.length)];
            contentText = randomPlace + ' ' + contentText;
        }
        
        // 根据平台风格添加适当的表达和语气
        const platform = template.platforms[Math.floor(Math.random() * template.platforms.length)];
        if (platform === '小红书') {
            // 小红书风格：亲切热情，像闺蜜分享；细节丰富，图文并茂；多用 emoji 和感叹词
            const xhsExpressions = ['绝绝子', '宝藏', 'YYDS', '必入', '太爱了', '你们有同款吗', '真的是', '强烈推荐', '太治愈了', '被种草了'];
            if (Math.random() > 0.5) {
                const randomExpr = xhsExpressions[Math.floor(Math.random() * xhsExpressions.length)];
                contentText += ' ' + randomExpr + '！';
            }
            // 增加emoji
            const xhsEmojis = ['✨', '❤️', '🎉', '🤩', '😍', '🤗', '😎', '🔥', '🌟', '💯', '☕️', '🌸', '🌼', '🍓', '🍰'];
            if (Math.random() > 0.3) {
                const randomEmoji = xhsEmojis[Math.floor(Math.random() * xhsEmojis.length)];
                contentText += ' ' + randomEmoji;
            }
        } else if (platform === '微博') {
            // 微博风格：短平快，情绪化，有观点；常带话题标签；可配图；用网络热梗
            const weiboExpressions = ['yyds', '绝了', 'xswl', '笑死', '谁懂啊', '这波操作', '真的会谢', '破防了', '家人们', '咱就是说'];
            if (Math.random() > 0.5) {
                const randomExpr = weiboExpressions[Math.floor(Math.random() * weiboExpressions.length)];
                contentText += ' ' + randomExpr + '！';
            }
        } else if (platform === '豆瓣') {
            // 豆瓣风格：理性或感性，个人见解；评分+短评；语言相对文艺客观
            const doubanExpressions = ['四星半', '后劲很大', '节奏略慢', '有没有人也觉得', '值得一看', '推荐指数', '个人感受', '观影体验'];
            if (Math.random() > 0.5) {
                const randomExpr = doubanExpressions[Math.floor(Math.random() * doubanExpressions.length)];
                contentText += ' ' + randomExpr + '。';
            }
        } else if (platform === '贴吧') {
            // 贴吧风格：随意调侃，口语化；主题明确（吧）；楼中楼活跃；可带图
            const tiebaExpressions = ['老哥稳', '破防了', '有无懂哥', '水一贴', '这波什么水平', '绝了', '属实', '蚌埠住了'];
            if (Math.random() > 0.5) {
                const randomExpr = tiebaExpressions[Math.floor(Math.random() * tiebaExpressions.length)];
                contentText += ' ' + randomExpr + '！';
            }
        }
        
        // 生成图片描述
        let contentImages = template.images.map(img => {
            // 替换图片描述中的变量
            img = img.replace(/\{\{hobby\}\}/g, hobby);
            img = img.replace(/\{\{skill\}\}/g, skill);
            return img;
        });
        
        // 生成标签
        const tags = template.tags;
        
        // 生成相关内容项
        let contentItem = template.item || null;
        if (contentItem && Math.random() > 0.5) {
            contentItem.rating = 4.0 + Math.random() * 1.0;
            contentItem.ratingCount = Math.floor(Math.random() * 1000) + 100;
        }
        
        // 生成圈子信息
        let contentCircle = null;
        if (Math.random() > 0.5) {
            const circles = {
                lawyer: '法律爱好者',
                doctor: '健康生活',
                teacher: '教育分享',
                artist: '艺术欣赏',
                programmer: '编程技术',
                designer: '设计创意',
                student: '学习交流',
                business: '商业职场',
                other: '生活分享'
            };
            contentCircle = {
                name: circles[templateType] || '生活分享'
            };
        }
        
        // 生成互动数据
        const stats = generateMockStats();
        
        return {
            text: contentText,
            images: contentImages,
            tags: tags,
            item: contentItem,
            circle: contentCircle,
            stats: stats,
            comments: comments
        };
    };
    
    // 分析角色身份
    const analyzeCharacterRole = (character) => {
        console.log('Analyzing character role:', character);
        
        const summary = (character.summary || '').toLowerCase();
        const tags = (character.tags || []).map(tag => tag.toLowerCase());
        const persona = (character.persona || '').toLowerCase();
        const name = (character.name || '').toLowerCase();
        const nickname = (character.nickname || '').toLowerCase();
        
        console.log('Analysis data - Summary:', summary, 'Tags:', tags, 'Persona:', persona);
        
        // 检查职业关键词 - 更全面的关键词匹配
        const careerKeywords = {
            lawyer: ['律师', 'lawyer', 'attorney', 'legal'],
            doctor: ['医生', '大夫', 'medical', 'doctor', 'physician'],
            teacher: ['教师', '老师', 'teacher', 'instructor', 'professor'],
            artist: ['艺术', '艺术家', 'artist', 'painter', 'musician'],
            programmer: ['程序员', '编程', 'programmer', 'developer', 'coder'],
            designer: ['设计师', '设计', 'designer', 'design'],
            student: ['学生', 'student', '学习', 'study'],
            business: ['总裁', 'CEO', '董事长', '经理', '商业', 'business', 'executive']
        };
        
        // 检查每个职业的关键词
        for (const [type, keywords] of Object.entries(careerKeywords)) {
            for (const keyword of keywords) {
                if (summary.includes(keyword) || 
                    tags.includes(keyword) || 
                    persona.includes(keyword) ||
                    name.includes(keyword) ||
                    nickname.includes(keyword)) {
                    console.log('Found keyword:', keyword, 'for type:', type);
                    return { type, description: type };
                }
            }
        }
        
        // 检查persona中的职业信息
        if (persona.includes('profession：')) {
            const professionMatch = persona.match(/profession：([^\n]+)/);
            if (professionMatch) {
                const profession = professionMatch[1].toLowerCase();
                console.log('Found profession in persona:', profession);
                
                // 检查职业关键词
                for (const [type, keywords] of Object.entries(careerKeywords)) {
                    for (const keyword of keywords) {
                        if (profession.includes(keyword)) {
                            console.log('Found keyword in profession:', keyword, 'for type:', type);
                            return { type, description: type };
                        }
                    }
                }
            }
        }
        
        // 额外的检查 - 直接检查常见职业名称
        const commonProfessions = {
            '律师': 'lawyer',
            '医生': 'doctor',
            '教师': 'teacher',
            '艺术家': 'artist',
            '程序员': 'programmer',
            '设计师': 'designer',
            '学生': 'student'
        };
        
        for (const [职业名称, type] of Object.entries(commonProfessions)) {
            if (summary.includes(职业名称) || 
                tags.includes(职业名称) || 
                persona.includes(职业名称)) {
                console.log('Found profession:', 职业名称, 'for type:', type);
                return { type, description: 职业名称 };
            }
        }
        
        console.log('No specific role found, returning other');
        return { type: 'other', description: '其他' };
    };
    
    // 切换评论输入
    const toggleCommentInput = (postId) => {
        if (activeCommentPostId.value === postId) {
            activeCommentPostId.value = null;
            commentContent.value = '';
        } else {
            activeCommentPostId.value = postId;
            activeReplyCommentId.value = null;
            replyContent.value = '';
        }
    };
    
    // 切换回复输入
    const toggleReplyInput = (commentId) => {
        if (activeReplyCommentId.value === commentId) {
            activeReplyCommentId.value = null;
            replyContent.value = '';
        } else {
            activeReplyCommentId.value = commentId;
            activeCommentPostId.value = null;
            commentContent.value = '';
        }
    };
    
    // 查看话题页
    const viewTopic = (keyword) => {
        currentTopic.value = keyword;
        currentView.value = 'topic';
        // 这里可以添加话题数据加载逻辑
    };
    
    // 查看条目页
    const viewItem = (itemId) => {
        currentItem.value = itemId;
        currentView.value = 'item';
        // 这里可以添加条目数据加载逻辑
    };
    
    // 查看部落页
    const viewCircle = (circleId) => {
        currentCircle.value = circleId;
        currentView.value = 'circle';
        // 这里可以添加部落数据加载逻辑
    };
    
    // 返回首页
    const backToFeed = () => {
        currentView.value = 'feed';
        currentTopic.value = null;
        currentItem.value = null;
        currentCircle.value = null;
        currentUser.value = null;
    };
    
    // 初始化
    const init = () => {
        loadPosts(true);
    };
    
    // 切换热搜榜显示
    const toggleHotSearch = () => {
        showHotSearch.value = !showHotSearch.value;
        if (showHotSearch.value && hotSearches.value.length === 0) {
            generateHotSearches();
        }
    };
    
    // 生成热搜榜
    const generateHotSearches = async () => {
        try {
            // 模拟生成热搜榜数据
            const hotSearchData = [
                { topic: '许临野总裁穿搭', heat: '123.4万' },
                { topic: '律师职场剧推荐', heat: '98.7万' },
                { topic: '春日旅行攻略', heat: '87.6万' },
                { topic: 'AI生成内容工具', heat: '76.5万' },
                { topic: '健康饮食小技巧', heat: '65.4万' },
                { topic: '职场人际关系', heat: '54.3万' },
                { topic: '电影推荐2024', heat: '43.2万' },
                { topic: '健身打卡挑战', heat: '32.1万' },
                { topic: '科技新品发布', heat: '21.0万' },
                { topic: '美食探店分享', heat: '10.9万' }
            ];
            
            // 模拟API请求延迟
            await new Promise(resolve => setTimeout(resolve, 500));
            
            hotSearches.value = hotSearchData;
        } catch (error) {
            console.error('生成热搜榜失败:', error);
        }
    };
    
    // 初始化应用
    init();
    
    return {
        // 状态
        posts,
        loading,
        error,
        refreshing,
        hasMore,
        userConfig,
        showSearchBar,
        showUserMenu,
        showUserProfile,
        searchKeyword,
        activeCommentPostId,
        activeReplyCommentId,
        commentContent,
        replyContent,
        viewingUser,
        mockComments,
        currentView,
        currentTopic,
        currentItem,
        currentCircle,
        currentUser,
        showGenerateModal,
        showHotSearch,
        hotSearches,
        selectedCharacters,
        generateOption,
        generating,
        
        // 方法
        loadPosts,
        refreshPosts,
        loadMorePosts,
        likePost,
        dislikePost,
        favoritePost,
        ratePost,
        commentPost,
        replyComment,
        sharePost,
        followUser,
        searchContent,
        viewUserProfile,
        closeUserProfile,
        viewTopic,
        viewItem,
        viewCircle,
        backToFeed,
        toggleHotSearch,
        generateHotSearches,
        toggleSearchBar,
        toggleUserMenu,
        toggleGenerateModal,
        selectAllCharacters,
        selectNoneCharacters,
        selectRandomCharacter,
        generateContent,
        toggleCommentInput,
        toggleReplyInput
    };
}

// feed.js
import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { callAI } from './api.js';

const CURRENT_USER_NAME = '我';
const DEFAULT_MOMENTS_BG_URL = 'https://img.heliar.top/file/1774802842396_1774802818159.png';

// IndexedDB Setup
let feedDB = null;
const FEED_DB_NAME = 'FeedDB';
const FEED_DB_VERSION = 1;

async function initFeedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(FEED_DB_NAME, FEED_DB_VERSION);
        
        request.onerror = () => {
            console.error('FeedDB 打开失败');
            reject(request.error);
        };
        
        request.onsuccess = () => {
            feedDB = request.result;
            console.log('FeedDB 打开成功');
            resolve(feedDB);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            if (!database.objectStoreNames.contains('posts')) {
                const postsStore = database.createObjectStore('posts', { keyPath: 'id' });
                postsStore.createIndex('author', 'author', { unique: false });
                postsStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

async function savePostToIndexedDB(post) {
    if (!feedDB) {
        console.warn('FeedDB 未初始化，跳过保存');
        return false;
    }
    
    return new Promise((resolve, reject) => {
        const transaction = feedDB.transaction(['posts'], 'readwrite');
        const store = transaction.objectStore('posts');

        // IndexedDB 不能直接保存 Vue 响应式代理对象，先转成可结构化克隆的普通对象
        let safePost;
        try {
            safePost = JSON.parse(JSON.stringify(post));
        } catch (e) {
            safePost = {
                id: post?.id || Date.now(),
                author: post?.author || '',
                avatar: post?.avatar || '',
                content: post?.content || '',
                images: Array.isArray(post?.images) ? [...post.images] : [],
                imageDescriptions: Array.isArray(post?.imageDescriptions) ? [...post.imageDescriptions] : [],
                time: post?.time || '刚刚',
                likes: Array.isArray(post?.likes) ? [...post.likes] : [],
                comments: Array.isArray(post?.comments) ? JSON.parse(JSON.stringify(post.comments)) : [],
                isLiked: !!post?.isLiked,
                isFavorited: !!post?.isFavorited
            };
        }

        const request = store.put({
            ...safePost,
            timestamp: safePost.id
        });
        
        request.onsuccess = () => {
            console.log('帖子保存到 IndexedDB 成功:', post.id);
            resolve(true);
        };
        
        request.onerror = () => {
            console.error('帖子保存到 IndexedDB 失败:', request.error);
            reject(request.error);
        };
    });
}

async function loadPostsFromIndexedDB() {
    if (!feedDB) {
        console.warn('FeedDB 未初始化，返回空数组');
        return [];
    }
    
    return new Promise((resolve, reject) => {
        const transaction = feedDB.transaction(['posts'], 'readonly');
        const store = transaction.objectStore('posts');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const posts = request.result || [];
            console.log('从 IndexedDB 加载了', posts.length, '个帖子');
            resolve(posts);
        };
        
        request.onerror = () => {
            console.error('从 IndexedDB 加载帖子失败:', request.error);
            reject(request.error);
        };
    });
}

export function useFeed(profiles, activeProfile) {
    const posts = ref([]);
    const loading = ref(false);
    const error = ref(null);
    const scrollTop = ref(0);
    const activeCommentPostId = ref(null);
    const activeReplyCommentId = ref(null);
    const activeActionPostId = ref(null);
    const commentInput = ref('');
    const replyInput = ref('');
    
    // Create Post State
    const showCreatePost = ref(false);
    const newPostText = ref('');
    const newPostImages = ref([]);
    const showTextImageCreator = ref(false);
    const feedTextImageText = ref('');
    const feedTextImageBgColor = ref('#ffffff');
    const feedTextImageColors = ['#ffffff', '#f8f5f0', '#fef3c7', '#dbeafe', '#f3e8ff', '#fce7f3', '#dcfce7'];
    const showFabMenu = ref(false);

    // Create Post - WeChat-like light options
    const showLocationSheet = ref(false);
    const showVisibilitySheet = ref(false);
    const showMentionSheet = ref(false);
    const showMediaSheet = ref(false);

    const locationText = ref('');
    const visibilityMode = ref('public'); // public | private | partial
    const visibilityAllowRoleIds = ref([]); // string ids
    const mentionRoleIds = ref([]); // string ids
    const mentionTagNames = ref([]); // string tags
    
    // User Profile State
    const userProfile = ref({
        name: CURRENT_USER_NAME,
        avatar: 'https://placehold.co/100x100/333/fff?text=Me',
        bio: '点击这里编辑个性签名',
        bgImage: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=800&q=80'
    });

    // Moments full-screen background
    const momentsBgUrl = ref(DEFAULT_MOMENTS_BG_URL);
    try {
        const saved = localStorage.getItem('feed_moments_bg');
        if (saved) momentsBgUrl.value = saved;
    } catch (e) {
        // ignore
    }

    const momentsBgStyle = ref({
        backgroundImage: `url(${momentsBgUrl.value})`
    });

    function setMomentsBgUrl(url) {
        const u = String(url || '').trim();
        momentsBgUrl.value = u || DEFAULT_MOMENTS_BG_URL;
        momentsBgStyle.value = { backgroundImage: `url(${momentsBgUrl.value})` };
        try {
            localStorage.setItem('feed_moments_bg', momentsBgUrl.value);
        } catch (e) {
            // ignore
        }
    }

    // Profile Viewer State
    const viewingUserProfile = ref(null); // null = main feed, object = showing profile
    const viewingUserPosts = ref([]);
    const isEditingProfile = ref(false);

    // Load User Profile from LocalStorage
    try {
        const savedProfile = localStorage.getItem('feed_user_profile');
        if (savedProfile) {
            userProfile.value = { ...userProfile.value, ...JSON.parse(savedProfile) };
        }
    } catch (e) {
        console.error('Failed to load user profile', e);
    }

    // Save User Profile
    function saveUserProfile() {
        try {
            const profileToSave = {
                name: userProfile.value.name,
                avatar: userProfile.value.avatar,
                bio: userProfile.value.bio,
                bgImage: userProfile.value.bgImage
            };
            localStorage.setItem('feed_user_profile', JSON.stringify(profileToSave));
            console.log('Profile saved successfully:', profileToSave);
            isEditingProfile.value = false;
        } catch (e) {
            console.error('Failed to save profile:', e);
        }
    }

    // Open Profile
    function openProfile(authorName) {
        if (authorName === userProfile.value.name || authorName === '我') {
            // My Profile
            viewingUserProfile.value = {
                ...userProfile.value,
                isCurrentUser: true
            };
            // Show all my posts
            viewingUserPosts.value = posts.value.filter(p => p.author === authorName).sort((a, b) => {
                return (b.id || 0) - (a.id || 0);
            });
        } else {
            // Other User Profile
            // Try to find avatar from posts
            const post = posts.value.find(p => p.author === authorName);
            const avatar = post ? post.avatar : 'https://placehold.co/100x100?text=' + authorName.substring(0,1);
            
            viewingUserProfile.value = {
                name: authorName,
                avatar: avatar,
                bio: '这个角色很神秘，什么都没写',
                bgImage: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80', // Default BG for others
                isCurrentUser: false
            };
            // Show all posts by this author
            viewingUserPosts.value = posts.value.filter(p => p.author === authorName).sort((a, b) => {
                return (b.id || 0) - (a.id || 0);
            });
        }
    }

    // Close Profile
    function closeProfile() {
        viewingUserProfile.value = null;
        viewingUserPosts.value = [];
        isEditingProfile.value = false;
    }

    // Handle Profile Image Upload (Avatar or BG)
    function handleProfileImageUpload(event, type) {
        // type: 'avatar' | 'bg'
        const file = event.target.files[0];
        if (!file || !file.type.startsWith('image/')) {
            console.log('No valid image file selected');
            return;
        }

        console.log('Uploading image:', type, file.name);

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;
            
            if (type === 'avatar') {
                userProfile.value.avatar = imageData;
                console.log('Avatar updated');
            } else if (type === 'bg') {
                userProfile.value.bgImage = imageData;
                console.log('Background updated');
            }
            
            // Auto save when image changes
            saveUserProfile();
            
            // Update viewing profile if we are viewing ourselves
            if (viewingUserProfile.value && viewingUserProfile.value.isCurrentUser) {
                viewingUserProfile.value[type === 'avatar' ? 'avatar' : 'bgImage'] = imageData;
            }
        };
        
        reader.onerror = (error) => {
            console.error('Error reading file:', error);
        };
        
        reader.readAsDataURL(file);
    }

    // Trigger Profile Image Upload
    function triggerProfileImageUpload(type) {
        const id = type === 'avatar' ? 'profile-avatar-input' : 'profile-bg-input';
        const input = document.getElementById(id);
        if (input) input.click();
    }

    // Load Posts
    async function loadPosts() {
        loading.value = true;
        error.value = null;
        
        // 1. Load posts from IndexedDB
        let localPosts = [];
        try {
            localPosts = await loadPostsFromIndexedDB();
        } catch (e) {
            console.error('Error loading posts from IndexedDB:', e);
            localPosts = [];
        }
        
        try {
            if (activeProfile.value && activeProfile.value.endpoint) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                try {
                    const response = await fetch(`${activeProfile.value.endpoint}/posts`, {
                        signal: controller.signal,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const contentType = (response.headers.get('content-type') || '').toLowerCase();
                        if (!contentType.includes('application/json')) {
                            // 某些端点会返回 HTML（例如登录页/错误页），此时跳过 API 数据
                            throw new Error(`Feed API 返回非 JSON 内容: ${contentType || 'unknown'}`);
                        }
                        const apiData = await response.json();
                        const processedApiPosts = apiData.map(post => ({
                            ...post,
                            isLiked: post.likes && post.likes.includes(CURRENT_USER_NAME),
                            isFavorited: post.isFavorited || false
                        }));

                        // 合并时按 id 去重：优先保留本地帖子（含本地评论/回复），避免退出 feed 后“回复丢失”
                        const merged = new Map();
                        processedApiPosts.forEach(p => merged.set(String(p.id), p));
                        localPosts.forEach(p => merged.set(String(p.id), p));
                        posts.value = Array.from(merged.values()).sort((a, b) => {
                            return (b.id || 0) - (a.id || 0);
                        });
                    } else {
                    posts.value = localPosts.sort((a, b) => {
                        return (b.id || 0) - (a.id || 0);
                    });
                }
                } catch (fetchErr) {
                    if (fetchErr.name === 'AbortError') {
                        console.warn('Feed API request timed out, using local posts only');
                    } else {
                        // 非 JSON（例如返回 HTML 页面）时，静默降级到本地数据，避免误报为“错误”
                        const msg = String(fetchErr?.message || fetchErr || '');
                        if (msg.includes('非 JSON')) {
                            console.info(`Feed API fallback to local: ${msg}`);
                        } else {
                            console.warn(`Feed API error: ${msg}`);
                        }
                    }
                    posts.value = localPosts.sort((a, b) => {
                        return (b.id || 0) - (a.id || 0);
                    });
                }
            } else {
                posts.value = localPosts.sort((a, b) => {
                    return (b.id || 0) - (a.id || 0);
                });
            }
        } catch (err) {
            console.warn('Feed API unreachable (Role posts skipped), using local only:', err);
            posts.value = localPosts.sort((a, b) => {
                return (b.id || 0) - (a.id || 0);
            });
        } finally {
            loading.value = false;
        }
    }

    // Toggle Like
    async function toggleLike(postId) {
        const post = posts.value.find(p => p.id === postId);
        if (!post) return;

        // Local update
        const wasLiked = post.isLiked;
        post.isLiked = !wasLiked;
        
        if (post.isLiked) {
            if (!post.likes) post.likes = [];
            post.likes.push(CURRENT_USER_NAME);
        } else {
            const idx = post.likes.indexOf(CURRENT_USER_NAME);
            if (idx > -1) post.likes.splice(idx, 1);
        }

        // If it's a local post (id is number/timestamp usually), save to local storage
        // If it's an API post, we MIGHT want to sync, but user said "User actions don't call API"
        // So we only update local state.
        // However, if we reload, the like on API post will be lost unless we persist "liked API posts" locally too.
        // For now, we'll just persist if it's in the 'feed_user_posts' list.
        saveLocalPostUpdate(post);
    }

    // Toggle Favorite
    async function toggleFavorite(postId) {
        const post = posts.value.find(p => p.id === postId);
        if (!post) return;

        // Local update
        post.isFavorited = !post.isFavorited;
        
        saveLocalPostUpdate(post);
    }

    // Show/Hide Comment Input
    function toggleCommentInput(postId) {
        activeActionPostId.value = null;
        if (activeCommentPostId.value === postId) {
            activeCommentPostId.value = null;
            commentInput.value = '';
        } else {
            activeCommentPostId.value = postId;
            activeReplyCommentId.value = null;
            commentInput.value = '';
            replyInput.value = '';
        }
    }

    // Show/Hide Reply Input
    function toggleReplyInput(commentId) {
        if (activeReplyCommentId.value === commentId) {
            activeReplyCommentId.value = null;
            replyInput.value = '';
        } else {
            activeReplyCommentId.value = commentId;
            replyInput.value = '';
        }
    }

    function toggleActionMenu(postId) {
        activeActionPostId.value = activeActionPostId.value === postId ? null : postId;
    }

    function closeActionMenu() {
        activeActionPostId.value = null;
    }

    // Submit Comment or Reply
    async function submitComment(postId, commentId = null) {
        const post = posts.value.find(p => p.id === postId);
        if (!post) return;

        let content, inputToReset;
        if (commentId) {
            // It's a reply
            content = replyInput.value;
            inputToReset = replyInput;
        } else {
            // It's a top-level comment
            content = commentInput.value;
            inputToReset = commentInput;
        }

        if (!content.trim()) return;

        const tempId = Date.now();
        
        // Local update
        if (!post.comments) post.comments = [];
        
        if (commentId) {
            // Find the comment to reply to
            const comment = findCommentById(post.comments, commentId);
            if (comment) {
                if (!comment.replies) comment.replies = [];
                comment.replies.push({
                    id: tempId,
                    user: CURRENT_USER_NAME,
                    content: content,
                    time: '刚刚'
                });
            }
        } else {
            // Top-level comment
            post.comments.push({
                id: tempId,
                user: CURRENT_USER_NAME,
                content: content,
                time: '刚刚',
                replies: []
            });
        }

        // Close input
        if (commentId) {
            activeReplyCommentId.value = null;
        } else {
            activeCommentPostId.value = null;
        }
        inputToReset.value = '';

        // Save locally
        saveLocalPostUpdate(post);
    }

    // Delete Comment
    function deleteComment(postId, commentId) {
        const post = posts.value.find(p => p.id === postId);
        if (!post) return;

        // Remove comment from top level
        post.comments = post.comments.filter(c => c.id !== commentId);

        // Also check in replies
        post.comments.forEach(comment => {
            if (comment.replies) {
                comment.replies = comment.replies.filter(r => r.id !== commentId);
            }
        });

        // Save locally
        saveLocalPostUpdate(post);
    }

    // Delete Post
    async function deletePost(postId) {
        const postIndex = posts.value.findIndex(p => p.id === postId);
        if (postIndex === -1) return;

        const post = posts.value[postIndex];

        // Check if user is the author
        if (post.author !== CURRENT_USER_NAME) return;

        // Remove from posts array
        posts.value.splice(postIndex, 1);

        // Remove from IndexedDB
        if (feedDB) {
            const transaction = feedDB.transaction(['posts'], 'readwrite');
            const store = transaction.objectStore('posts');
            store.delete(postId);
        }
    }

    // Helper function to find comment by ID
    function findCommentById(comments, commentId) {
        for (const comment of comments) {
            if (comment.id === commentId) {
                return comment;
            }
            if (comment.replies) {
                const found = findCommentById(comment.replies, commentId);
                if (found) return found;
            }
        }
        return null;
    }

    // Helper to save updates to local posts
    async function saveLocalPostUpdate(post) {
        try {
            await savePostToIndexedDB(post);
        } catch (e) {
            console.error('Failed to save post update:', e);
        }
    }

    // AI Role Comment
    const showRoleCommentModal = ref(false);
    const commentTargetPost = ref(null);
    const isGeneratingComment = ref(false);

    function openRoleCommentModal(post) {
        commentTargetPost.value = post;
        showRoleCommentModal.value = true;
        selectedRoleId.value = null; // Reuse role selector
        isGeneratingComment.value = false;
    }

    function closeRoleCommentModal() {
        showRoleCommentModal.value = false;
        commentTargetPost.value = null;
        selectedRoleId.value = null;
        isGeneratingComment.value = false;
    }

    async function generateAndSubmitComment(characters, activeProfile) {
        if (!selectedRoleId.value || !commentTargetPost.value) {
            console.warn('Missing data for comment generation');
            return;
        }
        // 锁定目标帖子，避免异步期间 modal 被关闭导致 commentTargetPost 变 null
        const targetPost = { ...commentTargetPost.value };

        // Handle both ref and raw array
        const charsArray = Array.isArray(characters) ? characters : (characters.value || []);
        const character = charsArray.find(c => String(c.id) === String(selectedRoleId.value));
        if (!character) {
            console.error('Character not found for comment:', selectedRoleId.value);
            return;
        }

        isGeneratingComment.value = true;
        
        // 如果没有配置AI，使用模拟评论
        if (!activeProfile || !activeProfile.endpoint || !activeProfile.key) {
            // 模拟生成评论
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const mockComments = [
                '哈哈，这个太有意思了！😄',
                '看起来不错哦～',
                '赞！👍',
                '这个我喜欢！',
                '有意思，继续保持！',
                '哇，这个好棒！',
                '支持支持！💪',
                '说得好！',
                '学到了学到了',
                '这个角度很独特！'
            ];
            
            const randomComment = mockComments[Math.floor(Math.random() * mockComments.length)];
            
            roleAction('comment', {
                postId: targetPost.id,
                author: character.nickname || character.name,
                content: randomComment
            });
            
            isGeneratingComment.value = false;
            closeRoleCommentModal();
            return;
        }
        
        const endpoint = (activeProfile.endpoint || '').trim();
        const key = (activeProfile.key || '').trim();
        const modelId = activeProfile.model || 'gpt-3.5-turbo';

        try {
            // Construct context from post
            const postContext = `
动态作者：${targetPost.author}
动态内容：${targetPost.content}
配图描述：${targetPost.imageDescriptions ? targetPost.imageDescriptions.join(', ') : '无'}
            `.trim();

            const systemPrompt = `你正在扮演角色【${character.nickname || character.name}】。
${character.persona || ''}
你的朋友发了一条朋友圈动态：
${postContext}

请根据你们的关系和你的性格，给这条动态写一条评论。
要求：
1. 简短自然（1-2句话）。
2. 口语化，可以用emoji。
3. 如果是朋友，可以调侃、赞美或互动。
4. 直接输出评论内容，不要加引号。`;

            let content = await callAI(
                { ...activeProfile, endpoint, key, model: modelId },
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: '请评论' }],
                { temperature: 0.8 }
            );
            content = String(content || '').replace(/^["']|["']$/g, '').trim();

            // Submit the comment directly
            if (content) {
                roleAction('comment', {
                    postId: targetPost.id,
                    author: character.nickname || character.name,
                    content: content
                });
            }

        } catch (error) {
            console.error('Generate Comment Error:', error);
            alert(`生成评论失败: ${error.message}`);
        } finally {
            isGeneratingComment.value = false;
            closeRoleCommentModal();
        }
    }

    // Role API Interface (Exposed for script.js)
    // script.js calls this when a character wants to post/comment
    async function roleAction(actionType, data) {
        console.log('Role Action triggered:', actionType, data);
        
        if (actionType === 'post') {
             // ... existing post logic ...
             // Create local role post
             const newPost = {
                id: Date.now(),
                author: data.author || '未知角色',
                avatar: data.avatar || 'https://placehold.co/100x100?text=?',
                content: data.content,
                images: data.images || [],
                imageDescriptions: data.imageDescriptions || [],
                time: '刚刚',
                likes: [],
                comments: [],
                isLiked: false,
                isFavorited: false
             };

             // Add to in-memory list (keep original images for display)
             posts.value.unshift(newPost);
             
             // Save to IndexedDB
             try {
                await savePostToIndexedDB(newPost);
             } catch (e) {
                 console.error('Failed to save role post:', e);
                 // Still show the post in current session even if storage fails
             }
        } else if (actionType === 'comment') {
            const post = posts.value.find(p => p.id === data.postId);
            if (post) {
                if (!post.comments) post.comments = [];
                post.comments.push({
                    id: Date.now(),
                    user: data.author,
                    content: data.content
                });
                saveLocalPostUpdate(post);
            }
        }
    }

    function handleScroll(e) {
        scrollTop.value = e.target.scrollTop;
        activeActionPostId.value = null;
    }

    const cleanup = () => {
        /* 滚动由模板 @scroll 绑定，随根组件卸载由 Vue 回收；此处预留给其它 Feed 侧定时器/监听 */
    };

    // Create Post Logic
    function openCreatePost() {
        showCreatePost.value = true;
        newPostText.value = '';
        newPostImages.value = [];
        showLocationSheet.value = false;
        showVisibilitySheet.value = false;
        showMentionSheet.value = false;
    }

    function closeCreatePost() {
        showCreatePost.value = false;
        newPostText.value = '';
        newPostImages.value = [];
        showLocationSheet.value = false;
        showVisibilitySheet.value = false;
        showMentionSheet.value = false;
    }

    function closeSheets() {
        showLocationSheet.value = false;
        showVisibilitySheet.value = false;
        showMentionSheet.value = false;
        showMediaSheet.value = false;
    }

    function openLocationSheet() {
        closeSheets();
        showLocationSheet.value = true;
    }

    function openVisibilitySheet() {
        closeSheets();
        showVisibilitySheet.value = true;
    }

    function openMentionSheet() {
        closeSheets();
        showMentionSheet.value = true;
    }

    function openMediaSheet() {
        closeSheets();
        showMediaSheet.value = true;
    }

    function locationLabel() {
        return locationText.value && locationText.value.trim() ? locationText.value.trim() : '不显示';
    }

    function visibilityLabel(characters) {
        if (visibilityMode.value === 'public') return '公开';
        if (visibilityMode.value === 'private') return '私密';
        // partial
        const charsArray = Array.isArray(characters) ? characters : (characters?.value || []);
        const names = charsArray
            .filter(c => visibilityAllowRoleIds.value.includes(String(c.id)))
            .map(c => c.nickname || c.name || '未命名');
        return names.length ? `部分可见(${names.length})` : '部分可见(未选)';
    }

    function mentionLabel(characters) {
        const charsArray = Array.isArray(characters) ? characters : (characters?.value || []);
        const tagCount = mentionTagNames.value.length;
        const roleCount = mentionRoleIds.value.length;
        const total = roleCount + tagCount;
        if (!total) return '未选择';
        if (total <= 2) {
            const roleNames = charsArray
                .filter(c => mentionRoleIds.value.includes(String(c.id)))
                .map(c => c.nickname || c.name || '未命名');
            const tags = mentionTagNames.value.map(t => `#${t}`);
            return [...roleNames, ...tags].slice(0, 2).join('、');
        }
        return `已选 ${total} 项`;
    }

    function toggleVisibilityRole(roleId) {
        const id = String(roleId);
        const idx = visibilityAllowRoleIds.value.indexOf(id);
        if (idx >= 0) visibilityAllowRoleIds.value.splice(idx, 1);
        else visibilityAllowRoleIds.value.push(id);
    }

    function toggleMentionRole(roleId) {
        const id = String(roleId);
        const idx = mentionRoleIds.value.indexOf(id);
        if (idx >= 0) mentionRoleIds.value.splice(idx, 1);
        else mentionRoleIds.value.push(id);
    }

    function toggleMentionTag(tagName) {
        const t = String(tagName || '').trim();
        if (!t) return;
        const idx = mentionTagNames.value.indexOf(t);
        if (idx >= 0) mentionTagNames.value.splice(idx, 1);
        else mentionTagNames.value.push(t);
    }

    function clearMentions() {
        mentionRoleIds.value = [];
        mentionTagNames.value = [];
    }

    function allCharacterTags(characters) {
        const charsArray = Array.isArray(characters) ? characters : (characters?.value || []);
        const set = new Set();
        for (const c of charsArray) {
            const tags = c?.tags;
            if (Array.isArray(tags)) tags.forEach(t => set.add(String(t).trim()));
            else if (typeof tags === 'string') tags.split(',').forEach(t => set.add(String(t).trim()));
        }
        return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }

    function openTextImageCreator() {
        showTextImageCreator.value = true;
        feedTextImageText.value = '';
        feedTextImageBgColor.value = '#ffffff';
    }

    function closeTextImageCreator() {
        showTextImageCreator.value = false;
        feedTextImageText.value = '';
    }

    function addTextImageToPost() {
        if (!feedTextImageText.value.trim()) return;
        
        // 创建一个简单的文字图数据对象
        const textImageData = {
            type: 'textImage',
            text: feedTextImageText.value,
            bgColor: feedTextImageBgColor.value
        };
        
        // 把它作为特殊图片添加
        newPostImages.value.push(textImageData);
        closeTextImageCreator();
    }

    // Handle Image Upload from Album
    function handleImageUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.startsWith('image/')) continue;

            const reader = new FileReader();
            reader.onload = (e) => {
                if (newPostImages.value.length < 9) {
                    newPostImages.value.push(e.target.result);
                }
            };
            reader.readAsDataURL(file);
        }
        // Reset input so same file can be selected again if needed
        event.target.value = '';
    }

    // Trigger File Input Click
    function triggerImageUpload() {
        const input = document.getElementById('feed-image-input');
        if (input) input.click();
    }

    function triggerCameraUpload() {
        const input = document.getElementById('feed-camera-input');
        if (input) input.click();
    }

    async function publishPost() {
        if (!newPostText.value.trim() && newPostImages.value.length === 0) return;

        const content = newPostText.value;
        const images = [...newPostImages.value];
        
        loading.value = true;
        
        // Local Only Mode for User
        try {
            const newPost = {
                id: Date.now(),
                author: CURRENT_USER_NAME,
                avatar: userProfile.value.avatar || 'https://placehold.co/100x100/333/fff?text=Me',
                content: content,
                images: images,
                time: '刚刚',
                likes: [],
                comments: [],
                isLiked: false,
                isFavorited: false,
                location: locationText.value && locationText.value.trim() ? locationText.value.trim() : '',
                visibility: visibilityMode.value,
                visibilityAllowRoleIds: [...visibilityAllowRoleIds.value],
                mentionRoleIds: [...mentionRoleIds.value],
                mentionTagNames: [...mentionTagNames.value]
            };
            
            // Add to in-memory list (keep original images for display)
            posts.value.unshift(newPost);
            
            // Save to IndexedDB
            try {
                await savePostToIndexedDB(newPost);
            } catch (storageErr) {
                console.error('IndexedDB Save Error:', storageErr);
                alert('保存失败，但本次会话可见。');
            }

            // Success
            closeCreatePost();
        } catch (err) {
            console.error('Publish Error:', err);
            alert('发布失败');
        } finally {
            loading.value = false;
        }
    }

    function addImageToPost() {
        // Allow user to input URL or use random mock image
        const url = prompt('请输入图片URL (留空随机):');
        if (url) {
            newPostImages.value.push(url);
        } else {
            const mockImages = [
                'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=500&q=60',
                'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=500&q=60',
                'https://images.unsplash.com/photo-1628191011993-4350f92696bb?w=500&q=60'
            ];
            const randomImg = mockImages[Math.floor(Math.random() * mockImages.length)];
            newPostImages.value.push(randomImg);
        }
    }

    // Role Manual Post State
    const showRolePostModal = ref(false);
    const rolePostText = ref('');
    const selectedRoleId = ref(null);
    const isGeneratingPost = ref(false);

    // Open Role Post Modal
    function openRolePostModal() {
        showRolePostModal.value = true;
        rolePostText.value = '';
        selectedRoleId.value = null;
        isGeneratingPost.value = false;
    }

    function closeRolePostModal() {
        showRolePostModal.value = false;
        rolePostText.value = '';
        selectedRoleId.value = null;
        isGeneratingPost.value = false;
    }

    // Generate Role Post Content using LLM
    async function generateRolePost(character, activeProfile) {
        if (!character || !activeProfile) {
            console.warn('Cannot generate post: missing character or profile');
            return;
        }

        isGeneratingPost.value = true;
        rolePostText.value = '正在思考...';

        const endpoint = (activeProfile.endpoint || '').trim();
        const key = (activeProfile.key || '').trim();
        const modelId = activeProfile.model || 'gpt-3.5-turbo';

        try {
            const systemPrompt = `你正在扮演角色【${character.nickname || character.name}】。
${character.persona || ''}
请发一条符合你人设的朋友圈动态。
要求：
1. 内容简短（1-3句话），贴近生活，口语化，可加emoji。
2. 必须包含1-3张配图的描述，格式为：[图片: 画面描述]。
   例如：“今天天气真好！[图片: 蓝天白云下的公园草地] [图片: 一杯冰拿铁]”
3. 图片描述要具体且有画面感。
4. 不要加任何其他解释性文字，直接输出动态内容。`;

            const content = await callAI(
                { ...activeProfile, endpoint, key, model: modelId },
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: '发一条朋友圈' }],
                { temperature: 0.8 }
            );
            rolePostText.value = String(content || '').replace(/^["']|["']$/g, '').trim();

        } catch (error) {
            console.error('Generate Post Error:', error);
            rolePostText.value = `(生成失败: ${error.message})`;
        } finally {
            isGeneratingPost.value = false;
        }
    }

    // Publish Role Post Manually
    function publishRolePost(characters) {
        if (!selectedRoleId.value || !rolePostText.value.trim()) return;
        
        // Handle both ref and raw array
        const charsArray = Array.isArray(characters) ? characters : (characters.value || []);
        const character = charsArray.find(c => String(c.id) === String(selectedRoleId.value));
        if (!character) {
            console.error('Character not found:', selectedRoleId.value, 'Available:', charsArray.map(c => c.id));
            return;
        }

        let finalContent = rolePostText.value;
        const images = [];
        const imageDescriptions = [];

        // Parse [图片: xxx] tags
        const imgRegex = /\[图片:\s*(.+?)\]/g;
        let match;
        const mockColors = ['#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#f8b195', '#f67280', '#c06c84', '#6c5b7b', '#355c7d'];
        
        while ((match = imgRegex.exec(finalContent)) !== null) {
            const desc = match[1].trim();
            // Use local mock image (color block) instead of external URL to avoid loading issues
            const randomColor = mockColors[Math.floor(Math.random() * mockColors.length)];
            images.push(`mock:${randomColor}`);
            imageDescriptions.push(desc); // Store full description
        }

        // Remove image tags from content for display
        finalContent = finalContent.replace(/\[图片:\s*.+?\]/g, '').trim();

        roleAction('post', {
            author: character.nickname || character.name,
            avatar: character.avatarUrl,
            content: finalContent,
            images: images,
            imageDescriptions: imageDescriptions
        });

        closeRolePostModal();
    }

    // Image Viewer State
    const viewingImage = ref(null); // URL
    const viewingImageDesc = ref(null);

    function openImageViewer(imgUrl, desc) {
        viewingImage.value = imgUrl;
        viewingImageDesc.value = desc;
    }

    function closeImageViewer() {
        viewingImage.value = null;
        viewingImageDesc.value = null;
    }

    return {
        posts,
        loading,
        error,
        scrollTop,
        activeCommentPostId,
        activeReplyCommentId,
        activeActionPostId,
        commentInput,
        replyInput,
        showCreatePost,
        newPostText,
        newPostImages,
        showTextImageCreator,
        feedTextImageText,
        feedTextImageBgColor,
        feedTextImageColors,
        showFabMenu,
        showLocationSheet,
        showVisibilitySheet,
        showMentionSheet,
        showMediaSheet,
        locationText,
        visibilityMode,
        visibilityAllowRoleIds,
        mentionRoleIds,
        mentionTagNames,
        loadPosts,
        toggleLike,
        toggleFavorite,
        toggleCommentInput,
        submitComment,
        deleteComment,
        deletePost,
        handleScroll,
        cleanup,
        openCreatePost,
        closeCreatePost,
        closeSheets,
        openLocationSheet,
        openVisibilitySheet,
        openMentionSheet,
        openMediaSheet,
        locationLabel,
        visibilityLabel,
        mentionLabel,
        toggleVisibilityRole,
        toggleMentionRole,
        toggleMentionTag,
        clearMentions,
        allCharacterTags,
        openTextImageCreator,
        closeTextImageCreator,
        addTextImageToPost,
        toggleReplyInput,
        toggleActionMenu,
        closeActionMenu,
        publishPost,
        addImageToPost,
        handleImageUpload,
        triggerImageUpload,
        triggerCameraUpload,
        roleAction,
        // Profile related exports
        userProfile,
        momentsBgUrl,
        momentsBgStyle,
        setMomentsBgUrl,
        viewingUserProfile,
        viewingUserPosts,
        isEditingProfile,
        openProfile,
        closeProfile,
        saveUserProfile,
        handleProfileImageUpload,
        triggerProfileImageUpload,
        // Role Manual Post
        showRolePostModal,
        rolePostText,
        selectedRoleId,
        isGeneratingPost,
        openRolePostModal,
        closeRolePostModal,
        generateRolePost,
        publishRolePost,
        // Image Viewer
        viewingImage,
        viewingImageDesc,
        openImageViewer,
        closeImageViewer,
        // AI Comment
        showRoleCommentModal,
        commentTargetPost,
        isGeneratingComment,
        openRoleCommentModal,
        closeRoleCommentModal,
        generateAndSubmitComment,
        // IndexedDB
        initFeedDB
    };
}

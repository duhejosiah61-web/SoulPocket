// feed.js
import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

const CURRENT_USER_NAME = '我';
const DEFAULT_MOMENTS_BG_URL = 'https://img.heliar.top/file/1774802842396_1774802818159.png';

let feedDB = null;
const FEED_DB_NAME = 'FeedDB';
const FEED_DB_VERSION = 1;

async function initFeedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(FEED_DB_NAME, FEED_DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { feedDB = request.result; resolve(feedDB); };
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains('posts')) {
                database.createObjectStore('posts', { keyPath: 'id' });
            }
        };
    });
}

async function savePostToIndexedDB(post) {
    if (!feedDB) return false;
    return new Promise((resolve, reject) => {
        const tx = feedDB.transaction(['posts'], 'readwrite');
        const store = tx.objectStore('posts');
        const request = store.put(JSON.parse(JSON.stringify(post)));
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function loadPostsFromIndexedDB() {
    if (!feedDB) return [];
    return new Promise((resolve, reject) => {
        const tx = feedDB.transaction(['posts'], 'readonly');
        const store = tx.objectStore('posts');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

export function useFeed(_profiles, activeProfile) {
    const posts = ref([]);
    const loading = ref(false);
    const activeCommentPostId = ref(null);
    const activeReplyCommentId = ref(null);
    const activeActionPostId = ref(null);
    const activeCardIndex = ref(0);
    const cardSwipeStartX = ref(0);
    const cardSwipeDeltaX = ref(0);
    const isCardSwipeDragging = ref(false);
    const commentInput = ref('');
    const replyInput = ref('');
    const showFabMenu = ref(false);
    const showCreatePost = ref(false);
    const newPostText = ref('');
    const newPostImages = ref([]);
    const showTextImageCreator = ref(false);
    const feedTextImageText = ref('');
    const feedTextImageBgColor = ref('#ffffff');
    const feedTextImageColors = ['#ffffff', '#f8f5f0', '#fef3c7', '#dbeafe', '#f3e8ff', '#fce7f3', '#dcfce7'];
    const showLocationSheet = ref(false);
    const showVisibilitySheet = ref(false);
    const showMentionSheet = ref(false);
    const showMediaSheet = ref(false);
    const locationText = ref('');
    const visibilityMode = ref('public');
    const visibilityAllowRoleIds = ref([]);
    const mentionRoleIds = ref([]);
    const mentionTagNames = ref([]);
    const userProfile = ref({ name: CURRENT_USER_NAME, avatar: 'https://placehold.co/100x100/333/fff?text=Me', bio: '', bgImage: DEFAULT_MOMENTS_BG_URL });
    const momentsBgUrl = ref(DEFAULT_MOMENTS_BG_URL);
    const momentsBgStyle = ref({ backgroundImage: `url(${momentsBgUrl.value})` });
    const viewingUserProfile = ref(null);
    const viewingUserPosts = ref([]);
    const isEditingProfile = ref(false);

    function setActiveCardIndex(index) { activeCardIndex.value = Math.max(0, Math.min(index, Math.max(posts.value.length - 1, 0))); }
    function goToNextCard() { setActiveCardIndex(activeCardIndex.value + 1); }
    function goToPreviousCard() { setActiveCardIndex(activeCardIndex.value - 1); }
    function handleCardSwipeStart(e) { const t = e?.touches?.[0]; if (!t) return; isCardSwipeDragging.value = true; cardSwipeStartX.value = t.clientX; cardSwipeDeltaX.value = 0; }
    function handleCardSwipeMove(e) { if (!isCardSwipeDragging.value) return; const t = e?.touches?.[0]; if (!t) return; cardSwipeDeltaX.value = t.clientX - cardSwipeStartX.value; }
    function handleCardSwipeEnd() { if (!isCardSwipeDragging.value) return; if (cardSwipeDeltaX.value > 48) goToPreviousCard(); else if (cardSwipeDeltaX.value < -48) goToNextCard(); isCardSwipeDragging.value = false; }
    function handleScroll() { activeActionPostId.value = null; }
    function openProfile(authorName) { viewingUserProfile.value = { name: authorName, avatar: 'https://placehold.co/100x100?text=' + String(authorName || '?').slice(0, 1) }; }
    function closeProfile() { viewingUserProfile.value = null; viewingUserPosts.value = []; }
    function toggleLike(postId) { const post = posts.value.find(p => p.id === postId); if (!post) return; post.isLiked = !post.isLiked; post.likes ||= []; if (post.isLiked && !post.likes.includes(CURRENT_USER_NAME)) post.likes.push(CURRENT_USER_NAME); if (!post.isLiked) post.likes = post.likes.filter(n => n !== CURRENT_USER_NAME); savePostToIndexedDB(post); }
    function toggleCommentInput(postId) { activeCommentPostId.value = activeCommentPostId.value === postId ? null : postId; if (activeCommentPostId.value) activeActionPostId.value = null; }
    function toggleReplyInput(commentId) { activeReplyCommentId.value = activeReplyCommentId.value === commentId ? null : commentId; }
    function toggleActionMenu(postId) { activeActionPostId.value = activeActionPostId.value === postId ? null : postId; }
    function closeActionMenu() { activeActionPostId.value = null; }
    function deletePost(postId) { posts.value = posts.value.filter(p => p.id !== postId); }
    function deleteComment(postId, commentId) { const post = posts.value.find(p => p.id === postId); if (!post) return; post.comments = (post.comments || []).filter(c => c.id !== commentId); savePostToIndexedDB(post); }
    function submitComment(postId, commentId = null) { const post = posts.value.find(p => p.id === postId); if (!post) return; const text = (commentId ? replyInput.value : commentInput.value).trim(); if (!text) return; if (commentId) { const c = (post.comments || []).find(x => x.id === commentId); c?.replies?.push({ id: Date.now(), user: CURRENT_USER_NAME, content: text, time: '刚刚' }); replyInput.value = ''; activeReplyCommentId.value = null; } else { post.comments ||= []; post.comments.push({ id: Date.now(), user: CURRENT_USER_NAME, content: text, time: '刚刚', replies: [] }); commentInput.value = ''; activeCommentPostId.value = null; } savePostToIndexedDB(post); }
    function openCreatePost() { showCreatePost.value = true; }
    function closeCreatePost() { showCreatePost.value = false; newPostText.value = ''; newPostImages.value = []; }
    function closeSheets() { showLocationSheet.value = false; showVisibilitySheet.value = false; showMentionSheet.value = false; showMediaSheet.value = false; }
    const openLocationSheet = () => { closeSheets(); showLocationSheet.value = true; };
    const openVisibilitySheet = () => { closeSheets(); showVisibilitySheet.value = true; };
    const openMentionSheet = () => { closeSheets(); showMentionSheet.value = true; };
    const openMediaSheet = () => { closeSheets(); showMediaSheet.value = true; };
    const locationLabel = () => locationText.value?.trim() || '不显示';
    const visibilityLabel = () => visibilityMode.value === 'public' ? '公开' : visibilityMode.value === 'private' ? '私密' : '部分可见';
    const mentionLabel = () => mentionRoleIds.value.length || mentionTagNames.value.length ? `已选 ${mentionRoleIds.value.length + mentionTagNames.value.length} 项` : '未选择';
    const toggleVisibilityRole = (id) => { const i = visibilityAllowRoleIds.value.indexOf(String(id)); i >= 0 ? visibilityAllowRoleIds.value.splice(i, 1) : visibilityAllowRoleIds.value.push(String(id)); };
    const toggleMentionRole = (id) => { const i = mentionRoleIds.value.indexOf(String(id)); i >= 0 ? mentionRoleIds.value.splice(i, 1) : mentionRoleIds.value.push(String(id)); };
    const toggleMentionTag = (tag) => { const t = String(tag || '').trim(); if (!t) return; const i = mentionTagNames.value.indexOf(t); i >= 0 ? mentionTagNames.value.splice(i, 1) : mentionTagNames.value.push(t); };
    const clearMentions = () => { mentionRoleIds.value = []; mentionTagNames.value = []; };
    const allCharacterTags = () => [];
    function openTextImageCreator() { showTextImageCreator.value = true; }
    function closeTextImageCreator() { showTextImageCreator.value = false; }
    function addTextImageToPost() { if (!feedTextImageText.value.trim()) return; newPostImages.value.push({ type: 'textImage', text: feedTextImageText.value.trim(), bgColor: feedTextImageBgColor.value }); showTextImageCreator.value = false; }
    function handleImageUpload(event) { const files = event.target.files || []; [...files].forEach(file => { const reader = new FileReader(); reader.onload = e => newPostImages.value.push(e.target.result); reader.readAsDataURL(file); }); event.target.value = ''; }
    const triggerImageUpload = () => document.getElementById('feed-image-input')?.click();
    const triggerCameraUpload = () => document.getElementById('feed-camera-input')?.click();
    async function publishPost() { if (!newPostText.value.trim() && !newPostImages.value.length) return; const post = { id: Date.now(), author: CURRENT_USER_NAME, avatar: userProfile.value.avatar, content: newPostText.value, images: [...newPostImages.value], time: '刚刚', likes: [], comments: [], isLiked: false, isFavorited: false }; posts.value.unshift(post); await savePostToIndexedDB(post); closeCreatePost(); }
    async function loadPosts() { loading.value = true; const localPosts = await loadPostsFromIndexedDB().catch(() => []); posts.value = localPosts.sort((a,b) => (b.id||0)-(a.id||0)); loading.value = false; }
    const roleAction = async () => {};
    const showRoleCommentModal = ref(false);
    const commentTargetPost = ref(null);
    const isGeneratingComment = ref(false);
    const openRoleCommentModal = (post) => { commentTargetPost.value = post; showRoleCommentModal.value = true; };
    const closeRoleCommentModal = () => { showRoleCommentModal.value = false; commentTargetPost.value = null; };
    const generateAndSubmitComment = async () => {};
    const viewingImage = ref(null);
    const viewingImageDesc = ref(null);
    const openImageViewer = (imgUrl, desc) => { viewingImage.value = imgUrl; viewingImageDesc.value = desc; };
    const closeImageViewer = () => { viewingImage.value = null; viewingImageDesc.value = null; };

    return { posts, loading, activeCommentPostId, activeReplyCommentId, activeActionPostId, activeCardIndex, commentInput, replyInput, showFabMenu, showCreatePost, newPostText, newPostImages, showTextImageCreator, feedTextImageText, feedTextImageBgColor, feedTextImageColors, showLocationSheet, showVisibilitySheet, showMentionSheet, showMediaSheet, locationText, visibilityMode, visibilityAllowRoleIds, mentionRoleIds, mentionTagNames, userProfile, momentsBgUrl, momentsBgStyle, viewingUserProfile, viewingUserPosts, isEditingProfile, loadPosts, toggleLike, toggleCommentInput, submitComment, deleteComment, deletePost, handleScroll, setActiveCardIndex, goToNextCard, goToPreviousCard, handleCardSwipeStart, handleCardSwipeMove, handleCardSwipeEnd, openCreatePost, closeCreatePost, closeSheets, openLocationSheet, openVisibilitySheet, openMentionSheet, openMediaSheet, locationLabel, visibilityLabel, mentionLabel, toggleVisibilityRole, toggleMentionRole, toggleMentionTag, clearMentions, allCharacterTags, openTextImageCreator, closeTextImageCreator, addTextImageToPost, toggleReplyInput, toggleActionMenu, closeActionMenu, publishPost, handleImageUpload, triggerImageUpload, triggerCameraUpload, roleAction, showRoleCommentModal, commentTargetPost, isGeneratingComment, openRoleCommentModal, closeRoleCommentModal, generateAndSubmitComment, viewingImage, viewingImageDesc, openImageViewer, closeImageViewer, initFeedDB, openProfile, closeProfile, activeProfile, savePostToIndexedDB };
}

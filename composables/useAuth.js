// composables/useAuth.js
import { ref, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export function useAuth() {
    const isLoggedIn = ref(false);           // 是否已用 Discord 登录
    const isGuest = ref(false);              // 是否是游客模式
    const discordUser = ref(null);
    const isLoading = ref(false);
    const lastLoginTime = ref(0);            // 上次登录时间戳（毫秒）

    const CLIENT_ID = '1489669642640425121';
    const REDIRECT_URI = 'https://duhejosiah61-web.github.io/Psoulos/';
    const LOGIN_EXPIRE_DAYS = 5;             // 每5天需要重新验证一次

    // 计算是否已过期
    const isExpired = () => {
        if (!lastLoginTime.value) return true;
        const daysPassed = (Date.now() - lastLoginTime.value) / (1000 * 60 * 60 * 24);
        return daysPassed > LOGIN_EXPIRE_DAYS;
    };

    const loginWithDiscord = () => {
        isLoading.value = true;
        const scope = 'identify';
        const authUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=token&scope=${scope}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
        window.location.href = authUrl;
    };

    const loginAsGuest = () => {
        isGuest.value = true;
        isLoggedIn.value = false;
        localStorage.setItem('soulpocket_mode', 'guest');
        // 游客也记录一个时间，同样每5天提醒一次（可选）
    };

    const handleDiscordCallback = async () => {
        const hash = window.location.hash.substring(1);
        if (!hash) return;

        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');

        if (accessToken) {
            isLoading.value = true;
            try {
                const res = await fetch('https://discord.com/api/users/@me', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const user = await res.json();

                if (user.id) {
                    discordUser.value = user;
                    isLoggedIn.value = true;
                    isGuest.value = false;
                    lastLoginTime.value = Date.now();

                    localStorage.setItem('soulpocket_discord_user', JSON.stringify(user));
                    localStorage.setItem('soulpocket_last_login', Date.now().toString());
                    localStorage.setItem('soulpocket_mode', 'discord');

                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (err) {
                console.error('Discord 登录失败:', err);
            } finally {
                isLoading.value = false;
            }
        }
    };

    const logout = () => {
        localStorage.removeItem('soulpocket_discord_user');
        localStorage.removeItem('soulpocket_last_login');
        localStorage.removeItem('soulpocket_mode');
        isLoggedIn.value = false;
        isGuest.value = false;
        discordUser.value = null;
        lastLoginTime.value = 0;
    };

    // 初始化
    onMounted(() => {
        const savedMode = localStorage.getItem('soulpocket_mode');
        const savedUser = localStorage.getItem('soulpocket_discord_user');
        const savedTime = localStorage.getItem('soulpocket_last_login');

        if (savedTime) lastLoginTime.value = parseInt(savedTime);

        if (savedMode === 'guest') {
            isGuest.value = true;
        } else if (savedUser && !isExpired()) {
            // Discord 登录且未过期
            discordUser.value = JSON.parse(savedUser);
            isLoggedIn.value = true;
        } else if (savedUser) {
            // 已过期，需要重新登录
            discordUser.value = JSON.parse(savedUser);
            isLoggedIn.value = false;   // 强制重新验证
        }

        handleDiscordCallback();
    });

    return {
        isLoggedIn,
        isGuest,
        discordUser,
        isLoading,
        loginWithDiscord,
        loginAsGuest,
        logout
    };
}
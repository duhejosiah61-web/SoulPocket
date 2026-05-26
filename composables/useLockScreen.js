// composables/useLockScreen.js
import { ref, watch, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { useAuth } from './useAuth.js';

export function useLockScreen() {
    const auth = useAuth();

    // ==================== 基础状态 ====================
    const enableLockScreen = ref(localStorage.getItem('enableLockScreen') !== 'false');
    
    // 关键修复：始终显示锁屏界面（只是解锁方式不同）
    const isLockScreenVisible = ref(true);

    const password = ref('');
    const correctPassword = ref(localStorage.getItem('lockScreenPassword') || '1234');
    const passwordSetting = ref('');
    const isPasswordValid = ref(false);

    const lockWallpaper = ref(
        localStorage.getItem('lockWallpaper') ||
            'https://img.heliar.top/file/1773753630799_1773753603638.png'
    );
    const lockWallpaperInput = ref(lockWallpaper.value);
    const lockDateTimeColor = ref(localStorage.getItem('lockDateTimeColor') || '#000000');
    const lockSignature = ref(localStorage.getItem('lockSignature') || '每一天都是新的开始');
    const signatureSetting = ref(lockSignature.value);

    // ==================== 解锁逻辑 ====================
    const unlockScreen = () => {
        const el = document.querySelector('.lockscreen');
        const blurBg = document.querySelector('.lock-screen-background-blur');
        if (el) el.style.transform = 'translateY(100%)';
        if (blurBg) blurBg.style.opacity = '0';

        setTimeout(() => {
            isLockScreenVisible.value = false;
            password.value = '';
        }, 320);
    };

    const shakeLockScreen = () => {
        const lockScreenEl = document.querySelector('.lockscreen');
        if (lockScreenEl) {
            lockScreenEl.style.animation = 'shake 0.4s ease';
            setTimeout(() => {
                if (lockScreenEl) lockScreenEl.style.animation = '';
            }, 400);
        }
    };

    /** 已开启锁屏时：密码正确则解锁，否则震动并清空 */
    const verifyPasswordOrShake = () => {
        if (password.value === correctPassword.value) {
            unlockScreen();
        } else {
            shakeLockScreen();
            password.value = '';
        }
    };

    const addPassword = (digit) => {
        if (password.value.length >= 4) return;
        password.value += digit;
    };

    const removePassword = () => {
        password.value = password.value.slice(0, -1);
    };

    // 设置密码实时校验
    watch(passwordSetting, (val) => {
        isPasswordValid.value = /^\d{4}$/.test(val);
    });

    const validatePassword = () => {
        isPasswordValid.value = /^\d{4}$/.test(passwordSetting.value);
    };

    const savePassword = () => {
        if (!isPasswordValid.value) {
            alert('请输入4位数字密码');
            return;
        }
        correctPassword.value = passwordSetting.value;
        localStorage.setItem('lockScreenPassword', passwordSetting.value);
        alert('密码已更新为：' + passwordSetting.value);
        passwordSetting.value = '';
        isPasswordValid.value = false;
    };

    // ==================== 设置功能 ====================
    const saveSignature = () => {
        lockSignature.value = signatureSetting.value;
        localStorage.setItem('lockSignature', signatureSetting.value);
    };

    const saveLockWallpaper = () => {
        const v = lockWallpaperInput.value.trim();
        lockWallpaper.value = v || 'https://img.heliar.top/file/1773753630799_1773753603638.png';
        localStorage.setItem('lockWallpaper', lockWallpaper.value);
    };

    const saveLockDateTimeColor = () => {
        localStorage.setItem('lockDateTimeColor', lockDateTimeColor.value);
    };

    const toggleLockScreen = () => {
        enableLockScreen.value = !enableLockScreen.value;
        localStorage.setItem('enableLockScreen', enableLockScreen.value);

        if (!enableLockScreen.value) {
            password.value = '';
        }
        // 关闭锁屏时，如果当前还在锁屏界面，自动解锁
        if (!enableLockScreen.value && isLockScreenVisible.value) {
            unlockScreen();
        }
    };

    const lockScreen = () => {
        isLockScreenVisible.value = true;   // 始终可以重新显示锁屏
    };

    // ==================== 统一解锁入口 ====================
    const performUnlock = () => {
        if (enableLockScreen.value) {
            verifyPasswordOrShake();
        } else {
            unlockScreen();
        }
    };

    // ==================== 触摸 & 点击事件 ====================
    const touchStartY = ref(0);
    const touchEndY = ref(0);

    const lockTouchStart = (e) => {
        touchStartY.value = e.touches[0].clientY;
    };

    const lockTouchMove = (e) => {
        touchEndY.value = e.touches[0].clientY;
    };

    const lockTouchEnd = () => {
        const distance = touchStartY.value - touchEndY.value;
        if (distance > 80) {
            performUnlock();
        }
    };

    const lockMouseDown = (e) => {
        touchStartY.value = e.clientY;
    };

    const lockMouseMove = (e) => {
        touchEndY.value = e.clientY;
    };

    const lockMouseUp = () => {
        const distance = touchStartY.value - touchEndY.value;
        if (distance > 80) {
            performUnlock();
        }
    };

    const tapUnlock = () => {
        performUnlock();
    };

    // ==================== 生命周期 ====================
    onMounted(() => {
        // 启动时始终显示锁屏界面（不管是否开启密码）
        isLockScreenVisible.value = true;
    });

    return {
        enableLockScreen,
        isLockScreenVisible,
        password,
        correctPassword,
        passwordSetting,
        isPasswordValid,
        lockWallpaper,
        lockWallpaperInput,
        lockDateTimeColor,
        lockSignature,
        signatureSetting,

        addPassword,
        removePassword,
        savePassword,
        validatePassword,
        saveSignature,
        saveLockWallpaper,
        saveLockDateTimeColor,
        toggleLockScreen,
        lockScreen,

        // 对外暴露
        tapUnlock,
        lockTouchStart,
        lockTouchMove,
        lockTouchEnd,
        lockMouseDown,
        lockMouseMove,
        lockMouseUp,

        isLoggedIn: auth.isLoggedIn,
        isGuest: auth.isGuest,
        discordUser: auth.discordUser,
        isLoading: auth.isLoading,
        loginWithDiscord: auth.loginWithDiscord,
        loginAsGuest: auth.loginAsGuest,
        logout: auth.logout
    };
}
// composables/useTheme.js
import { ref, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export function useTheme() {
  // ==================== 字体相关 ====================
  const fonts = ref([
    { name: '默认字体1', displayName: '默认字体1', fontFamily: 'CustomFont1', url: 'https://files.catbox.moe/5r7lc4.ttf', fontId: 'font1' },
    { name: '默认字体2', displayName: '默认字体2', fontFamily: 'CustomFont2', url: 'https://files.catbox.moe/tqrgcm.ttf', fontId: 'font2' },
    { name: '默认字体3', displayName: '默认字体3', fontFamily: 'CustomFont3', url: 'https://files.catbox.moe/rmahta.ttf', fontId: 'font3' },
    { name: '默认字体4', displayName: '默认字体4', fontFamily: 'CustomFont4', url: 'https://files.catbox.moe/x9ifle.ttf', fontId: 'font4' },
    { name: '默认字体5', displayName: '默认字体5', fontFamily: 'CustomFont5', url: 'https://files.catbox.moe/t94xpc.ttf', fontId: 'font5' },
    { name: '默认字体6', displayName: '默认字体6', fontFamily: 'CustomFont6', url: 'https://files.catbox.moe/m8ydxq.ttf', fontId: 'font6' },
    { name: '默认字体7', displayName: '默认字体7', fontFamily: 'CustomFont7', url: 'https://files.catbox.moe/a31kd3.ttf', fontId: 'font7' },
    { name: '默认字体8', displayName: '默认字体8', fontFamily: 'CustomFont8', url: 'https://files.catbox.moe/5r7lc4.ttf', fontId: 'font8' }
  ]);
  const selectedFont = ref(localStorage.getItem('lockFont') || 'CustomFont1');
  const globalSelectedFont = ref(localStorage.getItem('globalFont') || 'CustomFont1');
  const customFontCount = ref(8);
  const showFontImportDialog = ref(false);
  const newFontName = ref('');
  const newFontUrl = ref('');
  const globalFontFileInput = ref(null);

  // 加载单个字体 CSS（锁屏用）
  const loadFontCSS = (font) => {
    const oldStyle = document.getElementById('font-style');
    if (oldStyle) oldStyle.remove();
    const style = document.createElement('style');
    style.id = 'font-style';
    style.textContent = `
      @font-face {
        font-family: 'CustomFont';
        src: url('${font.url}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      .lock-time, .lock-preview-time, .lock-preview-clock, .lock-preview-date, .lock-preview-signature,
      .lock-clock, .lock-date, .lock-signature {
        font-family: 'CustomFont', sans-serif !important;
      }
    `;
    document.head.appendChild(style);
  };

  // 加载全局字体（锁屏以外的文字）
  const loadGlobalFontCSS = (font) => {
    const oldStyle = document.getElementById('global-font-style');
    if (oldStyle) oldStyle.remove();
    const style = document.createElement('style');
    style.id = 'global-font-style';
    style.textContent = `
      @font-face {
        font-family: '${font.fontFamily}';
        src: url('${font.url}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      #app .home-main-preview-phone,
      #app .homescreen *:not(i):not(.fa):not(.fas):not(.far):not(.fab):not(button):not(input):not(textarea),
      #app .home-pages *:not(i):not(.fa):not(.fas):not(.far):not(.fab):not(button):not(input):not(textarea),
      #app .app-view *:not(i):not(.fa):not(.fas):not(.far):not(.fab):not(button):not(input):not(textarea),
      #app .app-content *:not(i):not(.fa):not(.fas):not(.far):not(.fab):not(button):not(input):not(textarea),
      #app .dock *:not(i):not(.fa):not(.fas):not(.far):not(.fab):not(button):not(input):not(textarea),
      #app .page-indicator-container *:not(i):not(.fa):not(.fas):not(.far):not(.fab):not(button):not(input):not(textarea) {
        font-family: '${font.fontFamily}', sans-serif !important;
      }
    `;
    document.head.appendChild(style);
  };

  const selectFont = (font) => {
    selectedFont.value = font.fontFamily;
    loadFontCSS(font);
  };

  const selectGlobalFont = (font) => {
    globalSelectedFont.value = font.fontFamily;
    localStorage.setItem('globalFont', globalSelectedFont.value);
    loadGlobalFontCSS(font);
  };

  const saveFont = () => {
    localStorage.setItem('lockFont', selectedFont.value);
  };

  const importCustomFont = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const fontData = e.target.result;
      const fontId = `custom_${customFontCount.value}`;
      const fontFamily = `CustomFont${customFontCount.value}`;
      const newFont = {
        name: `自定义字体${customFontCount.value - 7}`,
        displayName: `自定义字体${customFontCount.value - 7}`,
        fontFamily,
        url: fontData,
        fontId,
        isCustom: true
      };
      fonts.value.push(newFont);
      customFontCount.value++;
      const style = document.createElement('style');
      style.textContent = `
        @font-face {
          font-family: '${fontFamily}';
          src: url('${fontData}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
      `;
      document.head.appendChild(style);
    };
    reader.readAsDataURL(file);
  };

  const addFontByUrl = () => {
    if (!newFontName.value || !newFontUrl.value) {
      alert('请输入字体名称和链接');
      return;
    }
    if (!newFontUrl.value.endsWith('.ttf')) {
      alert('请输入TTF格式的字体链接');
      return;
    }
    const fontId = `custom_${customFontCount.value}`;
    const fontFamily = `CustomFont${customFontCount.value}`;
    fonts.value.push({
      name: newFontName.value,
      displayName: newFontName.value,
      fontFamily,
      url: newFontUrl.value,
      fontId,
      isCustom: true
    });
    customFontCount.value++;
    showFontImportDialog.value = false;
    newFontName.value = '';
    newFontUrl.value = '';
  };

  const initFonts = () => {
    const savedFont = localStorage.getItem('lockFont');
    const defaultFont = fonts.value.find(f => f.fontFamily === savedFont) || fonts.value[0];
    if (defaultFont) {
      selectedFont.value = defaultFont.fontFamily;
      loadFontCSS(defaultFont);
    }
    const savedGlobal = localStorage.getItem('globalFont');
    const defaultGlobal = fonts.value.find(f => f.fontFamily === savedGlobal) || fonts.value[0];
    if (defaultGlobal) {
      globalSelectedFont.value = defaultGlobal.fontFamily;
      // 注意：不自动加载全局字体，等待用户手动选择
    }
  };

  // ==================== 主界面壁纸与文字颜色 ====================
  const homeWallpaper = ref(localStorage.getItem('homeWallpaper') || '');
  const homeWallpaperInput = ref(homeWallpaper.value);
  const homeTextColor = ref(localStorage.getItem('homeTextColor') || '#000000');
  const homeTextColorInput = ref(homeTextColor.value);

  const saveHomeWallpaper = () => {
    homeWallpaper.value = homeWallpaperInput.value;
    localStorage.setItem('homeWallpaper', homeWallpaperInput.value);
  };

  const saveHomeTextColor = () => {
    homeTextColor.value = homeTextColorInput.value;
    localStorage.setItem('homeTextColor', homeTextColorInput.value);
  };

  // ==================== 毛玻璃开关 ====================
  const enableHomeGlass = ref(localStorage.getItem('enableHomeGlass') !== 'false');
  const toggleHomeGlass = () => {
    enableHomeGlass.value = !enableHomeGlass.value;
    localStorage.setItem('enableHomeGlass', enableHomeGlass.value ? 'true' : 'false');
  };

  // ==================== 状态栏隐藏 ====================
  const enableHideStatusBar = ref(localStorage.getItem('enableHideStatusBar') === 'true');
  const toggleHideStatusBar = () => {
    enableHideStatusBar.value = !enableHideStatusBar.value;
    localStorage.setItem('enableHideStatusBar', enableHideStatusBar.value ? 'true' : 'false');
  };

  // ==================== 刘海屏适配 ====================
  const enableNotchAdaptation = ref(localStorage.getItem('enableNotchAdaptation') !== 'false');
  const toggleNotchAdaptation = () => {
    enableNotchAdaptation.value = !enableNotchAdaptation.value;
    localStorage.setItem('enableNotchAdaptation', enableNotchAdaptation.value ? 'true' : 'false');
  };

  onMounted(() => {
    initFonts();
  });

  return {
    // 字体
    fonts, selectedFont, globalSelectedFont, customFontCount,
    showFontImportDialog, newFontName, newFontUrl, globalFontFileInput,
    loadFontCSS, loadGlobalFontCSS, selectFont, selectGlobalFont, saveFont,
    importCustomFont, addFontByUrl, initFonts,
    // 主界面壁纸/文字颜色
    homeWallpaper, homeWallpaperInput, homeTextColor, homeTextColorInput,
    saveHomeWallpaper, saveHomeTextColor,
    // 毛玻璃
    enableHomeGlass, toggleHomeGlass,
    // 状态栏
    enableHideStatusBar, toggleHideStatusBar,
    // 刘海屏
    enableNotchAdaptation, toggleNotchAdaptation
  };
}
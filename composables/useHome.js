// composables/useHome.js
import { ref, computed, onMounted, watch, nextTick } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export function useHome({
  compressAvatarImage: compressAvatarImageOpt,
  enableNotchAdaptation: _enableNotchAdaptation,
  characters,
  loadCharacters,
  saveCharacters
} = {}) {
  void _enableNotchAdaptation;

  const compress = (dataUrl, preset, cb) => {
    if (typeof compressAvatarImageOpt === 'function') {
      compressAvatarImageOpt(dataUrl, preset, cb);
    } else if (typeof globalThis.compressAvatarImage === 'function') {
      globalThis.compressAvatarImage(dataUrl, preset, cb);
    } else {
      cb(dataUrl);
    }
  };

  const currentPage = ref(0);
  const homePages = ref(null);

  const prevPage = () => {
    if (currentPage.value > 0) currentPage.value--;
  };
  const nextPage = () => {
    if (currentPage.value < 2) currentPage.value++;
  };
  const updateHomePagePosition = () => {
    const el = document.querySelector('.home-pages');
    if (el) el.style.transform = `translateX(-${currentPage.value * 100}%)`;
  };

  watch(currentPage, () => updateHomePagePosition());

  const photoWidgetDate = ref({ day: '', weekday: '' });
  const photoWidgetText = ref({
    line1: localStorage.getItem('photoWidgetText1') || 'the storm is',
    line2: localStorage.getItem('photoWidgetText2') || 'COMING'
  });
  const photoWidgetPhotos = ref([
    { url: localStorage.getItem('photoWidgetPhoto0') || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=300&fit=crop' },
    { url: localStorage.getItem('photoWidgetPhoto1') || 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=300&fit=crop' },
    { url: localStorage.getItem('photoWidgetPhoto2') || 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=300&fit=crop' },
    { url: localStorage.getItem('photoWidgetPhoto3') || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=300&fit=crop' }
  ]);

  const updatePhotoWidgetDate = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const wdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    photoWidgetDate.value = { day: `${month}/${day}`, weekday: wdays[now.getDay()] };
  };

  const changePhotoWidgetImage = (index) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          compress(ev.target.result, 'widgetPhoto', (croppedDataUrl) => {
            photoWidgetPhotos.value = photoWidgetPhotos.value.map((p, i) =>
              i === index ? { ...p, url: croppedDataUrl } : p
            );
            try {
              localStorage.setItem(`photoWidgetPhoto${index}`, croppedDataUrl);
            } catch (err) {
              console.warn('图片太大，无法保存到本地存储');
              alert('图片已更换，但无法永久保存（超出存储限制）');
            }
          });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const showPhotoWidgetEditDialog = ref(false);
  const photoWidgetEditText1 = ref('');
  const photoWidgetEditText2 = ref('');
  const editPhotoWidgetText = () => {
    photoWidgetEditText1.value = photoWidgetText.value.line1;
    photoWidgetEditText2.value = photoWidgetText.value.line2;
    showPhotoWidgetEditDialog.value = true;
  };
  const closePhotoWidgetEditDialog = () => {
    showPhotoWidgetEditDialog.value = false;
    photoWidgetEditText1.value = '';
    photoWidgetEditText2.value = '';
  };
  const savePhotoWidgetText = () => {
    photoWidgetText.value.line1 = photoWidgetEditText1.value;
    photoWidgetText.value.line2 = photoWidgetEditText2.value;
    localStorage.setItem('photoWidgetText1', photoWidgetEditText1.value);
    localStorage.setItem('photoWidgetText2', photoWidgetEditText2.value);
    closePhotoWidgetEditDialog();
  };

  const stickerWidgetUrl = ref(localStorage.getItem('stickerWidgetUrl') || 'https://img.heliar.top/file/1773774569024_retouch_2026031803084004.png');
  const changeStickerWidgetImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          compress(ev.target.result, 'widgetSticker', (croppedDataUrl) => {
            stickerWidgetUrl.value = croppedDataUrl;
            try {
              localStorage.setItem('stickerWidgetUrl', croppedDataUrl);
            } catch (err) {
              console.warn('图片太大，无法保存到本地存储');
              alert('贴纸已更换，但无法永久保存（超出存储限制）');
            }
          });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const capsuleTexts = ref({
    black: localStorage.getItem('capsuleTextBlack') || '缘悭一面',
    gray: localStorage.getItem('capsuleTextGray') || '须臾故人'
  });
  const showCapsuleEditDialog = ref(false);
  const currentCapsuleType = ref('');
  const capsuleEditText = ref('');
  const editCapsuleText = (type) => {
    currentCapsuleType.value = type;
    capsuleEditText.value = capsuleTexts.value[type];
    showCapsuleEditDialog.value = true;
  };
  const closeCapsuleEditDialog = () => {
    showCapsuleEditDialog.value = false;
    currentCapsuleType.value = '';
    capsuleEditText.value = '';
  };
  const saveCapsuleText = () => {
    if (currentCapsuleType.value) {
      capsuleTexts.value[currentCapsuleType.value] = capsuleEditText.value;
      localStorage.setItem(
        `capsuleText${currentCapsuleType.value.charAt(0).toUpperCase() + currentCapsuleType.value.slice(1)}`,
        capsuleEditText.value
      );
      closeCapsuleEditDialog();
    }
  };

  const dashboardTexts = ref({
    weekday: localStorage.getItem('dashboardWeekday') || '星期一',
    slogan: localStorage.getItem('dashboardSlogan') || '✨ with you ★.',
    weather: localStorage.getItem('dashboardWeather') || '北京 4°C 晴'
  });
  const showDashboardEditDialog = ref(false);
  const currentDashboardTextType = ref('');
  const dashboardEditText = ref('');
  const editDashboardText = (type) => {
    currentDashboardTextType.value = type;
    dashboardEditText.value = dashboardTexts.value[type];
    showDashboardEditDialog.value = true;
  };
  const closeDashboardEditDialog = () => {
    showDashboardEditDialog.value = false;
    currentDashboardTextType.value = '';
    dashboardEditText.value = '';
  };
  const saveDashboardText = () => {
    if (currentDashboardTextType.value) {
      dashboardTexts.value[currentDashboardTextType.value] = dashboardEditText.value;
      localStorage.setItem(
        `dashboard${currentDashboardTextType.value.charAt(0).toUpperCase() + currentDashboardTextType.value.slice(1)}`,
        dashboardEditText.value
      );
      closeDashboardEditDialog();
    }
  };

  const showCharacterSelector = ref(false);
  const selectedCharacterId = ref(localStorage.getItem('selectedCharacterId') || null);

  watch(showCharacterSelector, (val) => {
    if (val && typeof loadCharacters === 'function') loadCharacters();
  });

  const selectedCharacter = computed(() => {
    if (!characters?.value || characters.value.length === 0) {
      return {
        id: null,
        nickname: '未命名角色',
        name: '未命名角色',
        avatarUrl: '',
        bindTime: null,
        affection: 0
      };
    }
    const char = characters.value.find(c => String(c.id) === String(selectedCharacterId.value));
    const targetChar = char || characters.value[0];
    return {
      ...targetChar,
      nickname: targetChar.nickname || targetChar.name || '未命名角色',
      name: targetChar.name || targetChar.nickname || '未命名角色',
      bindTime: targetChar.bindTime || null,
      affection: typeof targetChar.affection === 'number' ? targetChar.affection : 0
    };
  });

  const selectCharacter = (char) => {
    selectedCharacterId.value = char.id;
    localStorage.setItem('selectedCharacterId', char.id);
    if (characters?.value && typeof saveCharacters === 'function') {
      const charIndex = characters.value.findIndex(c => String(c.id) === String(char.id));
      if (charIndex !== -1) {
        if (!characters.value[charIndex].bindTime) {
          characters.value[charIndex].bindTime = new Date().toISOString();
        }
        if (typeof characters.value[charIndex].affection !== 'number') {
          characters.value[charIndex].affection = 0;
        }
        saveCharacters();
      }
    }
    showCharacterSelector.value = false;
  };

  const callWidgetSubtitle = ref(localStorage.getItem('callWidgetSubtitle') || '点击更换角色');
  const showCallWidgetEdit = ref(false);
  const callWidgetEditInput = ref('');
  const editCallWidgetSubtitle = () => {
    callWidgetEditInput.value = callWidgetSubtitle.value;
    showCallWidgetEdit.value = true;
  };
  const saveCallWidgetSubtitle = () => {
    callWidgetSubtitle.value = callWidgetEditInput.value;
    localStorage.setItem('callWidgetSubtitle', callWidgetEditInput.value);
    showCallWidgetEdit.value = false;
  };
  const closeCallWidgetEdit = () => {
    showCallWidgetEdit.value = false;
  };

  const currentDate = ref('');
  const currentTime = ref('');
  const weekdays = ref(['日', '一', '二', '三', '四', '五', '六']);
  const currentWeekday = ref(0);
  const updateDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    currentDate.value = `${year}.${month}.${day}`;
    currentTime.value = `${hours}:${minutes}`;
    currentWeekday.value = now.getDay();
  };

  onMounted(() => {
    updatePhotoWidgetDate();
    setInterval(updatePhotoWidgetDate, 60000);
    updateDateTime();
    setInterval(updateDateTime, 1000);
    updateHomePagePosition();
  });

  return {
    currentPage,
    homePages,
    prevPage,
    nextPage,
    updateHomePagePosition,
    photoWidgetDate,
    photoWidgetText,
    photoWidgetPhotos,
    changePhotoWidgetImage,
    editPhotoWidgetText,
    showPhotoWidgetEditDialog,
    photoWidgetEditText1,
    photoWidgetEditText2,
    closePhotoWidgetEditDialog,
    savePhotoWidgetText,
    stickerWidgetUrl,
    changeStickerWidgetImage,
    capsuleTexts,
    showCapsuleEditDialog,
    currentCapsuleType,
    capsuleEditText,
    editCapsuleText,
    closeCapsuleEditDialog,
    saveCapsuleText,
    dashboardTexts,
    showDashboardEditDialog,
    currentDashboardTextType,
    dashboardEditText,
    editDashboardText,
    closeDashboardEditDialog,
    saveDashboardText,
    showCharacterSelector,
    selectedCharacterId,
    selectedCharacter,
    selectCharacter,
    callWidgetSubtitle,
    showCallWidgetEdit,
    callWidgetEditInput,
    editCallWidgetSubtitle,
    saveCallWidgetSubtitle,
    closeCallWidgetEdit,
    currentDate,
    currentTime,
    weekdays,
    currentWeekday,
    updateDateTime
  };
}

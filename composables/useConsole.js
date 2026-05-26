// composables/useConsole.js
import { ref, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export function useConsole({ addGlobalLog, saveProfilesCallback } = {}) {
  // ==================== 基础状态 ====================
  const consoleLogs = ref([]);
  const profiles = ref([]);
  const activeProfileId = ref(null);
  const availableModels = ref([]);
  const fetchingModels = ref(false);

  // 备份相关状态
  const backupExporting = ref(false);
  const backupImporting = ref(false);
  const backupLastSavedHint = ref('');
  const soulosBackupFileInput = ref(null);
  const showSegmentedImportPanel = ref(false);
  const segmentedImportPackage = ref(null);
  const segmentedImportAppSelections = ref({});
  const segmentedImportRoleSelections = ref({});

  // ==================== 计算属性 ====================
  const activeProfile = computed(() => {
    if (!activeProfileId.value) return null;
    return profiles.value.find(p => p.id === activeProfileId.value);
  });

  const apiStatus = computed(() => {
    if (!activeProfile.value) return 'unconfigured';
    if (activeProfile.value.endpoint && activeProfile.value.key) return 'valid';
    return 'invalid';
  });

  // ==================== 日志 ====================
  const addConsoleLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-GB');
    consoleLogs.value.unshift({ id: Date.now(), timestamp, message, type });
    if (consoleLogs.value.length > 50) consoleLogs.value.pop();
    if (addGlobalLog) addGlobalLog(message, type);
  };

  const clearConsole = () => {
    consoleLogs.value = [];
    addConsoleLog('日志已清空', 'system');
  };

  // ==================== API 配置管理 ====================
  const loadProfiles = () => {
    addConsoleLog('正在初始化连接控制台...', 'system');
    try {
      const savedProfiles = localStorage.getItem('soulos_api_profiles');
      if (savedProfiles) {
        profiles.value = JSON.parse(savedProfiles);
        if (profiles.value.length > 0) {
          activeProfileId.value = profiles.value[0].id;
          addConsoleLog(`已加载 ${profiles.value.length} 个配置，当前激活：「${profiles.value[0].name}」`, 'success');
        } else {
          addConsoleLog('尚未创建任何配置，请在上方新建一个连接配置。', 'warn');
        }
      } else {
        profiles.value = [];
        addConsoleLog('本地没有找到配置，准备创建新的连接配置。', 'warn');
      }
    } catch (error) {
      addConsoleLog('严重错误：读取配置失败：' + error.message, 'error');
      profiles.value = [];
    }
    if (profiles.value.length === 0) {
      activeProfileId.value = null;
    }
    availableModels.value = [];
  };

  const saveProfiles = (silent = false) => {
    if (!profiles.value || profiles.value.length === 0) return;
    try {
      localStorage.setItem('soulos_api_profiles', JSON.stringify(profiles.value));
      if (!silent) addConsoleLog('所有配置已保存，本地状态已更新。', 'success');
      if (saveProfilesCallback) saveProfilesCallback(profiles.value);
    } catch (error) {
      if (!silent) addConsoleLog('保存配置时出错：' + error.message, 'error');
    }
  };

  const createNewProfile = () => {
    const newProfile = {
      id: Date.now(),
      name: `新配置 ${profiles.value.length + 1}`,
      endpoint: '',
      key: '',
      model: '',
      temperature: 0.7
    };
    profiles.value.push(newProfile);
    activeProfileId.value = newProfile.id;
    addConsoleLog(`已创建新配置：「${newProfile.name}」`, 'system');
  };

  const deleteProfile = (profileId) => {
    const target = profiles.value.find(p => p.id === profileId);
    if (!target) return;
    if (!confirm(`危险操作：即将永久删除下列配置：\n\n「${target.name}」\n\n此操作无法撤销，是否继续？`)) {
      return;
    }
    const index = profiles.value.findIndex(p => p.id === profileId);
    if (index > -1) {
      const deletedName = profiles.value[index].name;
      profiles.value.splice(index, 1);
      saveProfiles();
      if (activeProfileId.value === profileId) {
        activeProfileId.value = profiles.value.length > 0 ? profiles.value[0].id : null;
      }
      addConsoleLog(`配置「${deletedName}」已被删除。`, 'warn');
    }
  };

  const setActiveProfile = (profileId) => {
    const target = profiles.value.find(p => p.id === profileId);
    if (!target) return;
    activeProfileId.value = profileId;
    availableModels.value = [];
    addConsoleLog(`已切换到配置：「${target.name}」`, 'info');
  };

  const fetchModels = async () => {
    if (!activeProfile.value || !activeProfile.value.endpoint || !activeProfile.value.key) {
      addConsoleLog('在获取模型前，请先填写 API 地址和密钥。', 'error');
      return;
    }
    fetchingModels.value = true;
    availableModels.value = [];
    addConsoleLog(`正在连接到「${activeProfile.value.name}」：${activeProfile.value.endpoint} ...`, 'info');

    try {
      const response = await fetch(`${activeProfile.value.endpoint}/models`, {
        headers: { 'Authorization': `Bearer ${activeProfile.value.key}` }
      });

      if (!response.ok) {
        throw new Error(`接口返回状态码 ${response.status}`);
      }
      const data = await response.json();
      availableModels.value = data.data || [];
      if (availableModels.value.length > 0) {
        addConsoleLog(`已成功获取 ${availableModels.value.length} 个模型，说明此 API 可正常连接。`, 'success');
      } else {
        addConsoleLog('连接成功，但接口未返回任何模型，请检查服务端配置。', 'warn');
      }
    } catch (error) {
      addConsoleLog(`获取模型失败：${error.message}`, 'error');
    } finally {
      fetchingModels.value = false;
    }
  };

  // ==================== 备份相关辅助函数 ====================
  const collectAllLocalStorageEntries = () => {
    const entries = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) entries[k] = localStorage.getItem(k);
      }
    } catch (e) {
      console.error(e);
    }
    return entries;
  };

  const dumpIdbDatabase = (dbName, storeNames) =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const database = req.result;
        const run = async () => {
          const out = {};
          try {
            for (const sn of storeNames) {
              if (!database.objectStoreNames.contains(sn)) continue;
              out[sn] = await new Promise((res, rej) => {
                const tx = database.transaction(sn, 'readonly');
                const r = tx.objectStore(sn).getAll();
                r.onsuccess = () => res(r.result || []);
                r.onerror = () => rej(r.error);
              });
            }
            return out;
          } finally {
            database.close();
          }
        };
        run().then(resolve).catch(reject);
      };
    });

  const restoreIdbDatabase = (dbName, storesData) => {
    if (!storesData || typeof storesData !== 'object' || storesData._error) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const database = req.result;
        const run = async () => {
          try {
            for (const [sn, records] of Object.entries(storesData)) {
              if (sn.startsWith('_') || !database.objectStoreNames.contains(sn) || !Array.isArray(records)) continue;
              await new Promise((res, rej) => {
                const tx = database.transaction(sn, 'readwrite');
                tx.onerror = () => rej(tx.error);
                tx.oncomplete = () => res();
                const store = tx.objectStore(sn);
                const clr = store.clear();
                clr.onerror = () => rej(clr.error);
                clr.onsuccess = () => {
                  for (const rec of records) {
                    store.put(rec);
                  }
                };
              });
            }
          } finally {
            database.close();
          }
        };
        run().then(resolve).catch(reject);
      };
    });
  };

  const buildSoulOsBackupPackage = async () => {
    const indexedDBPart = {};
    try {
      indexedDBPart.SoulOS_DB = await dumpIdbDatabase('SoulOS_DB', ['soulLinkMessages', 'soulLinkGroups', 'archivedChats', 'settings']);
    } catch (e) {
      console.warn('[Backup] SoulOS_DB', e);
      indexedDBPart.SoulOS_DB = { _error: String(e.message || e) };
    }
    try {
      indexedDBPart.FeedDB = await dumpIdbDatabase('FeedDB', ['posts']);
    } catch (e) {
      console.warn('[Backup] FeedDB', e);
      indexedDBPart.FeedDB = { _error: String(e.message || e) };
    }
    return {
      v: 2,
      app: 'SoulPocket',
      exportedAt: new Date().toISOString(),
      localStorage: collectAllLocalStorageEntries(),
      indexedDB: indexedDBPart
    };
  };

  const buildSlimBackupPackage = (pkg) => {
    const clone = JSON.parse(JSON.stringify(pkg || {}));
    const ls = clone.localStorage && typeof clone.localStorage === 'object' ? clone.localStorage : {};
    const keys = Object.keys(ls);
    for (const k of keys) {
      const v = String(ls[k] ?? '');
      const looksLikeBase64Image = v.startsWith('data:image/');
      const tooLarge = v.length > 60000;
      const avatarLikeKey = /avatar|wallpaper|bg|background|image|photo/i.test(k);
      if (looksLikeBase64Image || tooLarge || avatarLikeKey) {
        delete ls[k];
      }
    }
    clone.localStorage = ls;
    if (clone.indexedDB && clone.indexedDB.FeedDB) {
      delete clone.indexedDB.FeedDB;
    }
    return clone;
  };

  const writeBackupSlotWithFallback = (pkg) => {
    const fullJson = JSON.stringify(pkg);
    try {
      localStorage.setItem('soulos_backup_slot_v1', fullJson);
      return { ok: true, mode: 'full', bytes: fullJson.length };
    } catch (e1) {
      const slim = buildSlimBackupPackage(pkg);
      const slimJson = JSON.stringify(slim);
      try {
        localStorage.setItem('soulos_backup_slot_v1', slimJson);
        return { ok: true, mode: 'slim', bytes: slimJson.length, error: e1 };
      } catch (e2) {
        return { ok: false, mode: 'failed', error: e2 };
      }
    }
  };

  const mergeById = (currentList, incomingList) => {
    const base = Array.isArray(currentList) ? [...currentList] : [];
    const map = new Map(base.map((x) => [String(x.id), x]));
    (Array.isArray(incomingList) ? incomingList : []).forEach((item) => {
      if (!item || item.id === undefined || item.id === null) return;
      map.set(String(item.id), item);
    });
    return Array.from(map.values());
  };

  const pickLocalStorageByPrefixes = (prefixes = []) => {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (prefixes.some((p) => k.startsWith(p))) out[k] = localStorage.getItem(k);
      }
    } catch (e) {
      console.error(e);
    }
    return out;
  };

  let segmentedDataProvider = null;

  const buildSegmentedBackupPackage = () => {
    if (typeof segmentedDataProvider === 'function') {
      const data = segmentedDataProvider();
      return {
        v: 3,
        app: 'SoulPocket',
        mode: 'segmented',
        exportedAt: new Date().toISOString(),
        segments: data.segments
      };
    }
    return {
      v: 3,
      app: 'SoulPocket',
      mode: 'segmented',
      exportedAt: new Date().toISOString(),
      segments: {
        apps: {},
        roles: {}
      }
    };
  };

  let segmentedApplyHandler = null;

  const applySegmentedBackupPayload = async (pkg, pickers = null) => {
    if (typeof segmentedApplyHandler === 'function') {
      return segmentedApplyHandler(pkg, pickers);
    }
    addConsoleLog('分片恢复需要外部提供数据更新函数', 'warn');
  };

  const openSegmentedImportPanel = (pkg) => {
    segmentedImportPackage.value = pkg;
    const apps = pkg?.segments?.apps || {};
    const roles = pkg?.segments?.roles || {};
    const appSel = {};
    Object.keys(apps).forEach((k) => { appSel[k] = true; });
    const roleSel = {};
    Object.keys(roles).forEach((k) => { roleSel[k] = true; });
    segmentedImportAppSelections.value = appSel;
    segmentedImportRoleSelections.value = roleSel;
    showSegmentedImportPanel.value = true;
  };

  const closeSegmentedImportPanel = () => {
    showSegmentedImportPanel.value = false;
    segmentedImportPackage.value = null;
    segmentedImportAppSelections.value = {};
    segmentedImportRoleSelections.value = {};
  };

  const confirmSegmentedImport = async () => {
    const pkg = segmentedImportPackage.value;
    if (!pkg?.segments) return;
    const appsPicked = new Set(
      Object.entries(segmentedImportAppSelections.value || {})
        .filter(([, v]) => !!v)
        .map(([k]) => k)
    );
    const rolesPicked = new Set(
      Object.entries(segmentedImportRoleSelections.value || {})
        .filter(([, v]) => !!v)
        .map(([k]) => k)
    );
    if (appsPicked.size === 0 && rolesPicked.size === 0) {
      addConsoleLog('请至少选择一个软件或角色分片。', 'warn');
      return;
    }
    const ok = window.confirm('将按勾选项进行“分片合并恢复”，未勾选项不会受影响。确认继续？');
    if (!ok) return;
    await applySegmentedBackupPayload(pkg, { apps: appsPicked, roles: rolesPicked });
    closeSegmentedImportPanel();
  };

  const downloadSoulOsBackup = async () => {
    if (backupExporting.value || backupImporting.value) return;
    backupExporting.value = true;
    try {
      addConsoleLog('正在打包完整备份（含 IndexedDB）…', 'info');
      const pkg = await buildSoulOsBackupPackage();
      const json = JSON.stringify(pkg);
      const slotResult = writeBackupSlotWithFallback(pkg);
      if (slotResult.ok) {
        backupLastSavedHint.value = `本地备份槽已更新 · ${new Date().toLocaleString()}`;
        if (slotResult.mode === 'slim') {
          addConsoleLog('备份槽容量不足，已自动写入“精简槽备份”（完整备份仍已下载）。', 'warn');
        }
      } else {
        backupLastSavedHint.value = '';
        addConsoleLog('备份槽写入失败（可能超出容量）：' + (slotResult.error?.message || slotResult.error), 'warn');
      }
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `SoulPocket-备份-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addConsoleLog('备份已下载，请妥善保存 JSON 文件。', 'success');
    } catch (e) {
      addConsoleLog('导出失败：' + (e.message || e), 'error');
    } finally {
      backupExporting.value = false;
    }
  };

  const downloadSegmentedBackup = async () => {
    if (backupExporting.value || backupImporting.value) return;
    backupExporting.value = true;
    try {
      addConsoleLog('正在打包分片备份（按软件/角色）…', 'info');
      const pkg = buildSegmentedBackupPackage();
      const json = JSON.stringify(pkg);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `SoulPocket-分片备份-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addConsoleLog('分片备份已下载：可按软件/角色合并恢复。', 'success');
    } catch (e) {
      addConsoleLog('分片导出失败：' + (e.message || e), 'error');
    } finally {
      backupExporting.value = false;
    }
  };

  const saveSoulOsBackupSlotOnly = async () => {
    if (backupExporting.value || backupImporting.value) return;
    backupExporting.value = true;
    try {
      addConsoleLog('正在写入本地备份槽…', 'info');
      const pkg = await buildSoulOsBackupPackage();
      const slotResult = writeBackupSlotWithFallback(pkg);
      if (slotResult.ok) {
        backupLastSavedHint.value = `本地备份槽已更新 · ${new Date().toLocaleString()}`;
        if (slotResult.mode === 'slim') {
          addConsoleLog('容量不足：已写入精简槽备份（剔除了大图/部分库数据）。', 'warn');
        } else {
          addConsoleLog('已写入本地备份槽（仅存本浏览器）。', 'success');
        }
      } else {
        addConsoleLog('写入失败：' + (slotResult.error?.message || slotResult.error), 'error');
      }
    } finally {
      backupExporting.value = false;
    }
  };

  const restoreSoulOsFromSlot = async () => {
    if (backupExporting.value || backupImporting.value) return;
    const raw = localStorage.getItem('soulos_backup_slot_v1');
    if (!raw) {
      addConsoleLog('本地备份槽为空，请先执行备份。', 'warn');
      return;
    }
    let pkg;
    try {
      pkg = JSON.parse(raw);
    } catch {
      addConsoleLog('备份槽内容不是有效 JSON。', 'error');
      return;
    }
    await applySoulOsBackupPayload(pkg);
  };

  const triggerSoulOsBackupImport = () => {
    soulosBackupFileInput.value?.click();
  };

  const handleSoulOsBackupImport = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (backupExporting.value || backupImporting.value) return;
    try {
      const pkg = JSON.parse(await file.text());
      if (pkg?.mode === 'segmented') {
        openSegmentedImportPanel(pkg);
      } else {
        await applySoulOsBackupPayload(pkg);
      }
    } catch (e) {
      addConsoleLog('读取或解析备份文件失败：' + (e.message || e), 'error');
    }
  };

  // 备份恢复的核心方法需要外部提供数据更新能力，这里先占位，由调用方注入
  let applySoulOsBackupPayload = async (pkg) => {
    addConsoleLog('备份恢复需要外部提供数据更新函数', 'warn');
  };

  // 提供注入方法
  const setApplyBackupHandler = (handler) => {
    applySoulOsBackupPayload = handler;
  };

  const setSegmentedDataProvider = (provider) => {
    segmentedDataProvider = provider;
  };

  const setSegmentedApplyHandler = (handler) => {
    segmentedApplyHandler = handler;
  };

  // 初始化时尝试读取备份槽提示
  try {
    if (localStorage.getItem('soulos_backup_slot_v1')) {
      backupLastSavedHint.value = '本地备份槽中已有数据，可从槽恢复';
    }
  } catch { /* ignore */ }

  // ==================== 导出 ====================
  return {
    // 状态
    consoleLogs,
    profiles,
    activeProfileId,
    availableModels,
    fetchingModels,
    activeProfile,
    apiStatus,
    backupExporting,
    backupImporting,
    backupLastSavedHint,
    soulosBackupFileInput,
    showSegmentedImportPanel,
    segmentedImportPackage,
    segmentedImportAppSelections,
    segmentedImportRoleSelections,

    // 方法
    addConsoleLog,
    clearConsole,
    loadProfiles,
    saveProfiles,
    createNewProfile,
    deleteProfile,
    setActiveProfile,
    fetchModels,
    downloadSoulOsBackup,
    downloadSegmentedBackup,
    saveSoulOsBackupSlotOnly,
    restoreSoulOsFromSlot,
    triggerSoulOsBackupImport,
    handleSoulOsBackupImport,
    closeSegmentedImportPanel,
    confirmSegmentedImport,
    setApplyBackupHandler,
    setSegmentedDataProvider,
    setSegmentedApplyHandler,
    restoreIdbDatabase,
    dumpIdbDatabase,
    mergeById,
    pickLocalStorageByPrefixes
  };
}
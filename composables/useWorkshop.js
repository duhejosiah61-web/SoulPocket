// composables/useWorkshop.js
import { ref, computed } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

export function useWorkshop({
  compressAvatarImage: compressAvatarImageOpt,
  addConsoleLog,
  onCharactersChange,
  onWorldbooksChange,
  onPresetsChange,
  onBatchDeleteCharacters
} = {}) {
  const compressAvatarImage = (dataUrl, preset, cb) => {
    if (typeof compressAvatarImageOpt === 'function') {
      compressAvatarImageOpt(dataUrl, preset, cb);
    } else {
      cb(dataUrl);
    }
  };

  // ==================== 状态 ====================
  const characters = ref([]);
  const worldbooks = ref([]);
  const presets = ref([]);
  const editingCharacter = ref(null);
  const editingWorldbook = ref(null);
  const editingPreset = ref(null);
  const activeWorldbookEntryId = ref(null);
  const swipedWorldbookId = ref(null);
  const swipedPresetId = ref(null);
  const expandedEntryIds = ref(new Set());
  const showWorldbookImport = ref(false);
  const importWorldbookName = ref('');
  const importFile = ref(null);
  const importMode = ref('replace');
  const showBatchDeleteDialog = ref(false);
  const batchDeleteType = ref('characters');
  const batchDeleteSelections = ref([]);
  const newTagInput = ref('');
  const characterImportInput = ref(null);
  const presetImportInput = ref(null);

  let worldbookImportInputEl = null;

  const saveCharacters = () => {
    try {
      localStorage.setItem('soulos_workshop_characters', JSON.stringify(characters.value));
      if (onCharactersChange) onCharactersChange(characters.value);
    } catch (e) { console.error(e); }
  };
  const loadCharacters = () => {
    try {
      const saved = localStorage.getItem('soulos_workshop_characters');
      const loaded = saved ? JSON.parse(saved) : [];
      characters.value = Array.isArray(loaded)
        ? loaded.filter(c => c && c.id).map((c) => ({ ...c, blockedByUser: !!c.blockedByUser }))
        : [];
    } catch (e) { characters.value = []; }
  };
  const saveWorldbooks = () => {
    try {
      localStorage.setItem('soulos_workshop_worldbooks', JSON.stringify(worldbooks.value));
      if (onWorldbooksChange) onWorldbooksChange(worldbooks.value);
    } catch (e) { console.error(e); }
  };
  const loadWorldbooks = () => {
    try {
      const saved = localStorage.getItem('soulos_workshop_worldbooks');
      worldbooks.value = saved ? JSON.parse(saved) : [];
    } catch (e) { worldbooks.value = []; }
  };
  const savePresets = () => {
    try {
      localStorage.setItem('soulos_workshop_presets', JSON.stringify(presets.value));
      if (onPresetsChange) onPresetsChange(presets.value);
    } catch (e) { console.error(e); }
  };
  const loadPresets = () => {
    try {
      const saved = localStorage.getItem('soulos_workshop_presets');
      presets.value = saved ? JSON.parse(saved) : [];
    } catch (e) { presets.value = []; }
  };

  // ==================== 角色操作 ====================
  const addNewCharacter = () => {
    const newId = Date.now().toString();
    const newCharacter = {
      id: newId,
      internalName: `Char_${newId}`,
      nickname: `新角色 ${characters.value.length + 1}`,
      name: `新角色 ${characters.value.length + 1}`,
      summary: '点击卡片进行编辑...',
      avatarUrl: `https://placehold.co/100x100?text=Avatar`,
      tags: ['新角色'],
      persona: '',
      kvData: [],
      openingLine: '',
      openingLines: [''],
      userPersona: '',
      worldbookIds: [],
      selectedPresetId: null,
      creator: '',
      version: '1.0',
      blockedByUser: false
    };
    characters.value.unshift(newCharacter);
    saveCharacters();
  };

  const deleteCharacter = () => {
    if (!editingCharacter.value) return;
    if (confirm('警告：确定要彻底删除该角色吗？\n此操作不可恢复，所有相关记忆将被清除。')) {
      const index = characters.value.findIndex(c => c.id === editingCharacter.value.id);
      if (index !== -1) {
        characters.value.splice(index, 1);
        editingCharacter.value = null;
        saveCharacters();
      }
    }
  };

  const openDossier = (character) => {
    if (!character) return;
    let copy;
    try {
      copy = JSON.parse(JSON.stringify(character));
    } catch (e) {
      console.error('openDossier: failed to clone character', e);
      return;
    }
    if (!copy.id) copy.id = Date.now().toString();
    if (!copy.tags) copy.tags = [];
    if (!copy.kvData) copy.kvData = [];
    if (!copy.worldbookIds) copy.worldbookIds = [];
    if (!copy.internalName) copy.internalName = copy.name || `Char_${copy.id}`;
    if (!copy.nickname) copy.nickname = copy.name || '未命名';
    if (!copy.userPersona) copy.userPersona = '';
    if (!copy.selectedPresetId) copy.selectedPresetId = null;
    if (!copy.summary) copy.summary = '';
    if (!copy.avatarUrl) copy.avatarUrl = '';
    if (!copy.creator) copy.creator = '';
    if (!copy.version) copy.version = '1.0';
    if (copy.blockedByUser !== true) copy.blockedByUser = false;
    if (copy.openingLine && typeof copy.openingLine === 'string' && (!copy.openingLines || copy.openingLines.length === 0)) {
      copy.openingLines = copy.openingLine.split('\n\n').filter(l => l.trim());
    }
    if (!copy.openingLines || !Array.isArray(copy.openingLines) || copy.openingLines.length === 0) {
      copy.openingLines = [''];
    }
    copy.openingLines = copy.openingLines.map(line => String(line || ''));
    editingCharacter.value = copy;
  };

  const saveDossier = () => {
    if (!editingCharacter.value) return;
    if (!editingCharacter.value.id) {
      editingCharacter.value.id = Date.now().toString();
    }
    if (editingCharacter.value.openingLines && Array.isArray(editingCharacter.value.openingLines)) {
      editingCharacter.value.openingLine = editingCharacter.value.openingLines
        .filter(l => l && l.trim())
        .join('\n\n');
    }
    editingCharacter.value.name = editingCharacter.value.nickname || editingCharacter.value.internalName || '未命名角色';
    if (!editingCharacter.value.tags) editingCharacter.value.tags = [];
    if (!editingCharacter.value.kvData) editingCharacter.value.kvData = [];
    if (!editingCharacter.value.worldbookIds) editingCharacter.value.worldbookIds = [];
    const index = characters.value.findIndex(c => c && c.id === editingCharacter.value.id);
    if (index !== -1) {
      characters.value[index] = { ...editingCharacter.value };
    } else {
      characters.value.push({ ...editingCharacter.value });
    }
    saveCharacters();
    editingCharacter.value = null;
  };

  const cancelDossier = () => { editingCharacter.value = null; };

  const addTag = () => {
    if (newTagInput.value.trim() && editingCharacter.value) {
      if (!editingCharacter.value.tags.includes(newTagInput.value.trim())) {
        editingCharacter.value.tags.push(newTagInput.value.trim());
      }
      newTagInput.value = '';
    }
  };
  const removeTag = (index) => {
    if (editingCharacter.value) editingCharacter.value.tags.splice(index, 1);
  };
  const addKv = () => {
    if (editingCharacter.value) {
      if (!editingCharacter.value.kvData) editingCharacter.value.kvData = [];
      editingCharacter.value.kvData.push({ key: '', value: '' });
    }
  };
  const removeKv = (index) => {
    if (editingCharacter.value) editingCharacter.value.kvData.splice(index, 1);
  };
  const addOpeningLine = () => {
    if (editingCharacter.value) editingCharacter.value.openingLines.push('');
  };
  const removeOpeningLine = (index) => {
    if (editingCharacter.value && editingCharacter.value.openingLines.length > 1) {
      editingCharacter.value.openingLines.splice(index, 1);
    }
  };

  const triggerAvatarUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file && editingCharacter.value) {
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
          alert('图片大小不能超过5MB，请选择小一点的图片');
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          compressAvatarImage(ev.target.result, 'avatar', (url) => {
            editingCharacter.value.avatarUrl = url;
          });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const parseCharPng = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        const dataView = new DataView(arrayBuffer);
        if (
          dataView.getUint32(0) !== 0x89504e47 ||
          dataView.getUint32(4) !== 0x0d0a1a0a
        ) {
          return reject(new Error('文件不是有效的PNG图片。'));
        }
        let offset = 8;
        let characterJson = null;
        while (offset < dataView.byteLength) {
          const length = dataView.getUint32(offset);
          const type = String.fromCharCode(
            dataView.getUint8(offset + 4),
            dataView.getUint8(offset + 5),
            dataView.getUint8(offset + 6),
            dataView.getUint8(offset + 7)
          );
          if (type === 'tEXt') {
            const chunkData = new Uint8Array(arrayBuffer, offset + 8, length);
            let text = '';
            for (let i = 0; i < chunkData.length; i++) {
              text += String.fromCharCode(chunkData[i]);
            }
            const keyword = 'chara' + String.fromCharCode(0);
            if (text.startsWith(keyword)) {
              const base64Data = text.substring(keyword.length);
              try {
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const decodedJsonString = new TextDecoder('utf-8').decode(bytes);
                characterJson = JSON.parse(decodedJsonString);
                break;
              } catch {
                return reject(new Error('解析PNG内嵌角色数据失败。'));
              }
            }
          }
          if (type === 'IEND') break;
          offset += 12 + length;
        }
        if (characterJson) {
          const imageReader = new FileReader();
          imageReader.onload = (imgEvent) => {
            resolve({
              characterData: characterJson,
              avatarBase64: imgEvent.target.result
            });
          };
          imageReader.onerror = () => reject(new Error('读取头像失败。'));
          imageReader.readAsDataURL(file);
        } else {
          reject(new Error('PNG未包含可识别的角色数据。'));
        }
      };
      reader.onerror = () => reject(new Error('读取PNG文件失败。'));
      reader.readAsArrayBuffer(file);
    });
  };

  const parseCharJson = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target.result;
          const jsonString = new TextDecoder('utf-8').decode(arrayBuffer);
          const data = JSON.parse(jsonString);
          resolve(data.data || data);
        } catch {
          reject(new Error('解析JSON角色卡失败。'));
        }
      };
      reader.onerror = () => reject(new Error('读取JSON文件失败。'));
      reader.readAsArrayBuffer(file);
    });
  };

  const normalizeTags = (tags) => {
    if (Array.isArray(tags)) {
      return tags.map(tag => String(tag).trim()).filter(Boolean);
    }
    if (typeof tags === 'string') {
      return tags.split(',').map(tag => tag.trim()).filter(Boolean);
    }
    return [];
  };

  const buildWorldbookFromEntries = (entriesArray, name) => {
    const entries = entriesArray.map(entry => {
      if (!entry || entry.enabled === false || !entry.content) return null;
      const keyFromKeys = Array.isArray(entry.keys) && entry.keys.length > 0 ? entry.keys.join(', ') : '';
      const entryKey = (entry.comment || keyFromKeys || entry.key || entry.keyword || '未命名条目').trim();
      if (!entryKey) return null;
      const keywords = keyFromKeys || entry.keywords || entry.key || entry.keyword || '';
      return {
        id: `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        key: entryKey,
        keyword: entryKey,
        keywords,
        content: entry.content
      };
    }).filter(Boolean);
    if (entries.length === 0) return null;
    return {
      id: `wb_${Date.now()}`,
      name: `${name} 世界书`,
      description: '导入自角色卡',
      entries
    };
  };

  const buildWorldbookFromText = (text, name) => {
    const content = typeof text === 'string' ? text.trim() : '';
    if (!content) return null;
    return {
      id: `wb_${Date.now()}`,
      name: `${name} 世界书`,
      description: '导入自角色卡',
      entries: [{
        id: `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        key: `${name} 世界设定`,
        keyword: `${name} 世界设定`,
        keywords: '',
        content
      }]
    };
  };

  const createCharacterFromData = (data, avatarBase64) => {
    const charData = data && data.data ? data.data : data;
    const characterName = charData && charData.name ? String(charData.name).trim() : '未命名角色';
    const summarySource = charData && (charData.summary || charData.description || charData.personality);
    const summary = summarySource ? String(summarySource).trim() : '导入角色';
    const personaParts = [
      charData && charData.description,
      charData && charData.personality,
      charData && charData.scenario,
      charData && charData.mes_example
    ].filter(Boolean).map(part => String(part).trim());
    const persona = personaParts.join('\n');
    const openingLine = charData && (charData.first_mes || charData.first_message)
      ? String(charData.first_mes || charData.first_message).trim()
      : '';
    const openingLines = openingLine
      ? openingLine.split('\n\n').filter(l => l.trim())
      : [''];
    const tags = normalizeTags(charData && charData.tags);
    let newWorldbook = null;
    if (charData && charData.character_book && Array.isArray(charData.character_book.entries)) {
      newWorldbook = buildWorldbookFromEntries(charData.character_book.entries, characterName);
    } else if (charData && Array.isArray(charData.world_entries)) {
      newWorldbook = buildWorldbookFromEntries(charData.world_entries, characterName);
    } else if (data && typeof data.world === 'string') {
      newWorldbook = buildWorldbookFromText(data.world, characterName);
    } else if (charData && typeof charData.world_info === 'string') {
      newWorldbook = buildWorldbookFromText(charData.world_info, characterName);
    }
    let worldbookId = '';
    if (newWorldbook) {
      worldbooks.value.unshift(newWorldbook);
      worldbookId = newWorldbook.id;
    }
    const newId = Date.now().toString();
    const newCharacter = {
      id: newId,
      internalName: `Char_${newId}`,
      nickname: characterName,
      name: characterName,
      summary,
      avatarUrl: avatarBase64 || `https://placehold.co/100x100?text=Avatar`,
      tags: tags.length > 0 ? tags : ['导入'],
      persona,
      kvData: [],
      openingLine,
      openingLines,
      userPersona: '',
      worldbookIds: worldbookId ? [worldbookId] : [],
      selectedPresetId: null,
      creator: charData && charData.creator ? String(charData.creator) : '',
      version: charData && charData.version ? String(charData.version) : '1.0',
      blockedByUser: false
    };
    characters.value.unshift(newCharacter);
    return newCharacter;
  };

  const triggerCharacterImport = () => {
    characterImportInput.value?.click();
  };

  const handleCharacterImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      let characterData;
      let avatarBase64;
      const name = file.name.toLowerCase();
      if (name.endsWith('.png')) {
        const result = await parseCharPng(file);
        characterData = result.characterData;
        avatarBase64 = result.avatarBase64;
      } else if (name.endsWith('.json')) {
        characterData = await parseCharJson(file);
        avatarBase64 = characterData && characterData.avatar
          ? characterData.avatar
          : `https://placehold.co/100x100?text=Avatar`;
      } else {
        alert('不支持的文件格式，请选择 .png 或 .json 文件。');
        event.target.value = '';
        return;
      }
      if (!characterData) {
        event.target.value = '';
        return;
      }
      const finish = (url) => {
        const created = createCharacterFromData(characterData, url);
        if (created) {
          saveCharacters();
          saveWorldbooks();
          alert(`导入成功：${created.name}`);
        }
      };
      if (typeof avatarBase64 === 'string' && avatarBase64.startsWith('data:')) {
        compressAvatarImage(avatarBase64, 'avatar', finish);
      } else {
        finish(avatarBase64);
      }
    } catch (error) {
      alert(`导入失败：${error.message}`);
    } finally {
      event.target.value = '';
    }
  };

  // ==================== 世界书操作 ====================
  const addNewWorldbook = () => {
    const newId = Date.now();
    const newWb = {
      id: `wb_${newId}`,
      name: `新世界书 ${worldbooks.value.length + 1}`,
      description: '暂无描述...',
      entries: []
    };
    worldbooks.value.unshift(newWb);
    saveWorldbooks();
    openWorldbookEditor(newWb);
  };
  const deleteWorldbook = (id) => {
    if (!confirm('确定要删除这本世界书吗？此操作不可恢复。')) return;
    const index = worldbooks.value.findIndex(wb => wb.id === id);
    if (index !== -1) worldbooks.value.splice(index, 1);
    saveWorldbooks();
    if (editingWorldbook.value?.id === id) {
      editingWorldbook.value = null;
      activeWorldbookEntryId.value = null;
    }
    swipedWorldbookId.value = null;
  };
  const deleteCurrentWorldbook = () => {
    if (!editingWorldbook.value) return;
    if (confirm('确定要删除这本世界书吗？此操作不可恢复。')) {
      const index = worldbooks.value.findIndex(wb => wb.id === editingWorldbook.value.id);
      if (index !== -1) {
        worldbooks.value.splice(index, 1);
        editingWorldbook.value = null;
        activeWorldbookEntryId.value = null;
        saveWorldbooks();
      }
    }
  };
  const openWorldbookEditor = (wb) => {
    if (swipedWorldbookId.value === wb.id) return;
    swipedWorldbookId.value = null;
    editingWorldbook.value = JSON.parse(JSON.stringify(wb));
    if (!editingWorldbook.value.entries) editingWorldbook.value.entries = [];
    if (editingWorldbook.value.entries.length > 0) {
      activeWorldbookEntryId.value = editingWorldbook.value.entries[0].id;
    } else {
      activeWorldbookEntryId.value = null;
    }
  };
  const saveWorldbookEditor = () => {
    if (!editingWorldbook.value) return;
    const index = worldbooks.value.findIndex(wb => wb.id === editingWorldbook.value.id);
    if (index !== -1) {
      worldbooks.value[index] = editingWorldbook.value;
    }
    saveWorldbooks();
    editingWorldbook.value = null;
  };
  const cancelWorldbookEditor = () => { editingWorldbook.value = null; };
  const addWorldbookEntry = () => {
    if (!editingWorldbook.value) return;
    const newEntry = {
      id: `entry_${Date.now()}`,
      key: '未命名条目',
      content: '',
      keywords: ''
    };
    editingWorldbook.value.entries.push(newEntry);
    expandedEntryIds.value.add(newEntry.id);
    expandedEntryIds.value = new Set(expandedEntryIds.value);
  };
  const deleteWorldbookEntry = (entryId) => {
    if (!editingWorldbook.value) return;
    const index = editingWorldbook.value.entries.findIndex(e => e.id === entryId);
    if (index !== -1) {
      editingWorldbook.value.entries.splice(index, 1);
      if (activeWorldbookEntryId.value === entryId) {
        activeWorldbookEntryId.value = null;
      }
    }
  };
  const toggleEntryExpand = (entryId) => {
    if (expandedEntryIds.value.has(entryId)) expandedEntryIds.value.delete(entryId);
    else expandedEntryIds.value.add(entryId);
    expandedEntryIds.value = new Set(expandedEntryIds.value);
  };
  const isEntryExpanded = (entryId) => expandedEntryIds.value.has(entryId);
  const toggleSwipeWorldbook = (id) => {
    swipedWorldbookId.value = swipedWorldbookId.value === id ? null : id;
  };
  const openWorldbookImport = () => {
    showWorldbookImport.value = true;
    importWorldbookName.value = '';
    importFile.value = null;
    importMode.value = 'replace';
    worldbookImportInputEl = null;
  };
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    worldbookImportInputEl = event.target;
    if (file) importFile.value = file;
  };

  const readTextFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file, 'utf-8');
    });
  };

  const parseWorldbookContent = (content) => {
    const entries = [];
    const lines = content.split('\n');
    let currentEntry = null;
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('[')) {
        if (currentEntry) entries.push(currentEntry);
        const key = trimmedLine.replace(/^\[(.*)\]$/, '$1').trim();
        currentEntry = {
          id: `entry_${Date.now()}_${entries.length}`,
          key,
          content: '',
          enabled: true
        };
      } else if (currentEntry) {
        currentEntry.content += line + '\n';
      }
    }
    if (currentEntry) entries.push(currentEntry);
    return entries;
  };

  const importWorldbook = async () => {
    if (!importWorldbookName.value || !importFile.value) return;
    try {
      let textContent = '';
      const f = importFile.value;
      if (f.type === 'text/plain') {
        textContent = await readTextFile(f);
      } else if (
        f.type === 'application/msword' ||
        f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        textContent = await readTextFile(f);
      } else {
        if (addConsoleLog) addConsoleLog('不支持的文件类型', 'error');
        return;
      }
      const wbEntries = parseWorldbookContent(textContent);
      const existingWorldbook = worldbooks.value.find(wb => wb.name === importWorldbookName.value);
      let worldbook;
      if (existingWorldbook && importMode.value === 'append') {
        worldbook = existingWorldbook;
        worldbook.entries = [...worldbook.entries, ...wbEntries];
      } else {
        const newWorldbook = {
          id: existingWorldbook ? existingWorldbook.id : `worldbook_${Date.now()}`,
          name: importWorldbookName.value,
          description: `从文件 ${f.name} 导入`,
          entries: wbEntries
        };
        if (existingWorldbook) {
          const index = worldbooks.value.findIndex(wb => wb.id === existingWorldbook.id);
          worldbooks.value[index] = newWorldbook;
        } else {
          worldbooks.value.unshift(newWorldbook);
        }
        worldbook = newWorldbook;
      }
      saveWorldbooks();
      showWorldbookImport.value = false;
      openWorldbookEditor(worldbook);
      if (addConsoleLog) addConsoleLog(`成功导入世界书: ${importWorldbookName.value}`, 'success');
    } catch (error) {
      console.error('导入世界书失败:', error);
      if (addConsoleLog) addConsoleLog(`导入世界书失败: ${error.message}`, 'error');
    }
  };

  // ==================== 预设操作 ====================
  const addNewPreset = () => {
    const newId = Date.now();
    const newPreset = {
      id: `ps_${newId}`,
      name: `新预设 ${presets.value.length + 1}`,
      content: '',
      segments: []
    };
    presets.value.unshift(newPreset);
    savePresets();
    openPresetEditor(newPreset);
  };
  const deletePreset = (id) => {
    if (!confirm('确定要删除这个预设吗？')) return;
    const index = presets.value.findIndex(p => p.id === id);
    if (index !== -1) presets.value.splice(index, 1);
    savePresets();
    if (editingPreset.value?.id === id) editingPreset.value = null;
    swipedPresetId.value = null;
  };
  const deleteCurrentPreset = () => {
    if (!editingPreset.value) return;
    if (confirm('确定要删除这个预设吗？')) {
      const index = presets.value.findIndex(p => p.id === editingPreset.value.id);
      if (index !== -1) {
        presets.value.splice(index, 1);
        editingPreset.value = null;
        savePresets();
      }
    }
  };
  const openPresetEditor = (preset) => {
    if (swipedPresetId.value === preset.id) return;
    swipedPresetId.value = null;
    const cloned = JSON.parse(JSON.stringify(preset));
    if (!Array.isArray(cloned.segments)) cloned.segments = [];
    editingPreset.value = cloned;
  };
  const savePresetEditor = () => {
    if (!editingPreset.value) return;
    const index = presets.value.findIndex(p => p.id === editingPreset.value.id);
    if (index !== -1) {
      presets.value[index] = editingPreset.value;
    }
    savePresets();
    editingPreset.value = null;
  };
  const cancelPresetEditor = () => { editingPreset.value = null; };
  const toggleSwipePreset = (id) => {
    swipedPresetId.value = swipedPresetId.value === id ? null : id;
  };
  const triggerPresetImport = () => {
    presetImportInput.value?.click();
  };
  const parsePresetJson = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target.result;
          const jsonString = new TextDecoder('utf-8').decode(arrayBuffer);
          const data = JSON.parse(jsonString);
          resolve(data);
        } catch {
          reject(new Error('解析JSON预设失败。'));
        }
      };
      reader.onerror = () => reject(new Error('读取JSON文件失败。'));
      reader.readAsArrayBuffer(file);
    });
  };
  const normalizePresetObject = (obj, filenameHint = '') => {
    if (!obj || typeof obj !== 'object') return null;
    const fallbackName = filenameHint ? filenameHint.replace(/\.[^.]+$/, '') : `导入预设 ${Date.now()}`;
    const name = String(obj.name || obj.title || obj.preset_name || fallbackName).trim();
    const contentField = obj.content ?? obj.text ?? obj.system_prompt ?? obj.prompt ?? '';
    const rawContent = typeof contentField === 'string' ? contentField : '';
    const items = obj.items || obj.entries || obj.sections || obj.blocks || obj.prompts || [];
    const segments = Array.isArray(items) ? items.map((it, idx) => ({
      id: `seg_${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
      title: String(it.title ?? it.name ?? it.key ?? `段落${idx + 1}`),
      content: String(it.content ?? it.text ?? it.value ?? ''),
      enabled: it.enabled !== false
    })) : [];
    if (segments.length === 0 && rawContent) {
      const parts = rawContent.split(/\n-{3,}\n|^#{1,3}\s/m).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        parts.forEach((txt, idx) => {
          segments.push({
            id: `seg_${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
            title: `段落${idx + 1}`,
            content: txt,
            enabled: true
          });
        });
      } else {
        segments.push({
          id: `seg_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          title: '正文',
          content: rawContent,
          enabled: true
        });
      }
    }
    return {
      id: `ps_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      content: rawContent || (segments.length > 0 ? segments.map(s => s.content).join('\n\n') : ''),
      segments
    };
  };
  const importPresetsFromData = (data, filenameHint = '') => {
    const isPromptBundle = (obj) => {
      if (!obj || typeof obj !== 'object') return false;
      if (!Array.isArray(obj.prompts)) return false;
      const bundleKeys = [
        'chat_completion_source', 'openai_model', 'claude_model', 'openrouter_model',
        'temperature', 'top_p', 'top_k', 'presence_penalty', 'frequency_penalty'
      ];
      return bundleKeys.some(key => Object.prototype.hasOwnProperty.call(obj, key));
    };
    const buildPresetFromPromptBundle = (obj, hint) => {
      const fallbackName = hint ? hint.replace(/\.[^.]+$/, '') : `导入预设 ${Date.now()}`;
      const name = String(obj.name || obj.title || obj.preset_name || fallbackName).trim();
      const segments = obj.prompts.map((prompt, idx) => {
        const title = String(prompt.name || prompt.title || prompt.identifier || `段落${idx + 1}`);
        const role = prompt.role ? String(prompt.role) : '';
        const body = String(prompt.content || '');
        const content = role ? `[${role}]\n${body}` : body;
        return {
          id: `seg_${Date.now()}_${idx}_${Math.random().toString(16).slice(2)}`,
          title,
          content,
          enabled: prompt.enabled !== false
        };
      });
      const enabledContent = segments.filter(s => s.enabled).map(s => s.content).filter(Boolean);
      return {
        id: `ps_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name,
        content: enabledContent.join('\n\n'),
        segments
      };
    };
    let list = [];
    if (Array.isArray(data)) {
      list = data;
    } else if (isPromptBundle(data)) {
      const preset = buildPresetFromPromptBundle(data, filenameHint);
      if (preset) presets.value.unshift(preset);
      savePresets();
      return;
    } else if (Array.isArray(data?.prompts)) {
      list = data.prompts;
    } else if (Array.isArray(data?.presets)) {
      list = data.presets;
    } else if (data?.preset) {
      list = [data.preset];
    } else {
      list = [data];
    }
    list.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const preset = normalizePresetObject(item, filenameHint);
      if (preset) presets.value.unshift(preset);
    });
    savePresets();
  };
  const handlePresetImport = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const data = await parsePresetJson(file);
      importPresetsFromData(data, file.name || '');
      event.target.value = '';
      if (addConsoleLog) addConsoleLog('预设导入成功', 'success');
    } catch (e) {
      if (addConsoleLog) addConsoleLog('预设导入失败：' + e.message, 'error');
      event.target.value = '';
    }
  };

  const activeWorldbookEntry = computed(() => {
    if (!editingWorldbook.value || !activeWorldbookEntryId.value) return null;
    return editingWorldbook.value.entries.find(e => e.id === activeWorldbookEntryId.value);
  });

  // ==================== 批量删除 ====================
  const batchDeleteTitle = computed(() => {
    if (batchDeleteType.value === 'worldbooks') return '批量删除世界书';
    if (batchDeleteType.value === 'presets') return '批量删除预设';
    return '批量删除角色';
  });
  const batchDeleteItems = computed(() => {
    if (batchDeleteType.value === 'worldbooks') {
      return worldbooks.value.map(wb => ({
        id: wb.id,
        name: wb.name || '未命名世界书',
        meta: `${wb.entries?.length || 0} 个条目`
      }));
    }
    if (batchDeleteType.value === 'presets') {
      return presets.value.map(p => ({
        id: p.id,
        name: p.name || '未命名预设',
        meta: `${p.segments?.length || 0} 个段落`
      }));
    }
    return characters.value.map(c => ({
      id: c.id,
      name: c.nickname || c.name || '未命名角色',
      meta: c.summary || '无简介'
    }));
  });
  const isAllBatchSelected = computed(() => {
    const total = batchDeleteItems.value.length;
    return total > 0 && batchDeleteSelections.value.length === total;
  });
  const selectedBatchCount = computed(() => batchDeleteSelections.value.length);
  const openBatchDelete = (type) => {
    batchDeleteType.value = type;
    batchDeleteSelections.value = [];
    showBatchDeleteDialog.value = true;
  };
  const closeBatchDelete = () => { showBatchDeleteDialog.value = false; };
  const selectAllBatchItems = () => {
    batchDeleteSelections.value = batchDeleteItems.value.map(item => item.id);
  };
  const clearBatchSelection = () => { batchDeleteSelections.value = []; };
  const invertBatchSelection = () => {
    const selected = new Set(batchDeleteSelections.value);
    batchDeleteSelections.value = batchDeleteItems.value
      .map(item => item.id)
      .filter(id => !selected.has(id));
  };
  const confirmBatchDelete = () => {
    if (batchDeleteSelections.value.length === 0) return;
    const label = batchDeleteTitle.value.replace('批量删除', '');
    if (!confirm(`确定删除选中的${label}吗？此操作不可撤销。`)) return;
    const selected = new Set(batchDeleteSelections.value);
    if (batchDeleteType.value === 'worldbooks') {
      worldbooks.value = worldbooks.value.filter(wb => !selected.has(wb.id));
      characters.value = characters.value.map(c => ({
        ...c,
        worldbookIds: c.worldbookIds?.filter(id => !selected.has(id)) || []
      }));
      if (editingWorldbook.value && selected.has(editingWorldbook.value.id)) {
        editingWorldbook.value = null;
        activeWorldbookEntryId.value = null;
      }
      saveWorldbooks();
      saveCharacters();
    } else if (batchDeleteType.value === 'presets') {
      presets.value = presets.value.filter(p => !selected.has(p.id));
      if (editingPreset.value && selected.has(editingPreset.value.id)) {
        editingPreset.value = null;
      }
      savePresets();
    } else {
      characters.value = characters.value.filter(c => !selected.has(c.id));
      if (editingCharacter.value && selected.has(editingCharacter.value.id)) {
        editingCharacter.value = null;
      }
      if (typeof onBatchDeleteCharacters === 'function') {
        onBatchDeleteCharacters(selected);
      }
      saveCharacters();
    }
    showBatchDeleteDialog.value = false;
  };

  loadCharacters();
  loadWorldbooks();
  loadPresets();

  return {
    characters, worldbooks, presets,
    editingCharacter, editingWorldbook, editingPreset,
    activeWorldbookEntryId,
    activeWorldbookEntry,
    swipedWorldbookId, swipedPresetId, expandedEntryIds,
    showWorldbookImport, importWorldbookName, importFile, importMode,
    showBatchDeleteDialog, batchDeleteType, batchDeleteSelections,
    batchDeleteTitle, batchDeleteItems, isAllBatchSelected, selectedBatchCount,
    newTagInput, characterImportInput, presetImportInput,

    addNewCharacter, deleteCharacter, openDossier, saveDossier, cancelDossier,
    addTag, removeTag, addKv, removeKv, addOpeningLine, removeOpeningLine,
    triggerAvatarUpload, triggerCharacterImport, handleCharacterImport,

    addNewWorldbook, deleteWorldbook, deleteCurrentWorldbook,
    openWorldbookEditor, saveWorldbookEditor, cancelWorldbookEditor,
    addWorldbookEntry, deleteWorldbookEntry, toggleEntryExpand, isEntryExpanded,
    toggleSwipeWorldbook, openWorldbookImport, handleFileUpload, importWorldbook,

    addNewPreset, deletePreset, deleteCurrentPreset,
    openPresetEditor, savePresetEditor, cancelPresetEditor,
    toggleSwipePreset, triggerPresetImport, handlePresetImport,

    openBatchDelete, closeBatchDelete, selectAllBatchItems, clearBatchSelection, invertBatchSelection, confirmBatchDelete,

    saveCharacters, loadCharacters, saveWorldbooks, loadWorldbooks, savePresets, loadPresets
  };
}

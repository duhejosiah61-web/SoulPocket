<template>
  <section class="shared-history-page">
    <SubPlaylist
      title="一起听过的歌"
      description="在这个平行宇宙，我们共享了 230 段旋律。"
      :tracks="sharedTracks"
      @back="$emit('back')"
      @play-all="$emit('play-all', sharedTracks)"
      @play-track="(track, index) => $emit('play-track', track, index)"
    />
  </section>
</template>

<script setup>
import SubPlaylist from './SubPlaylist.vue'

const sharedTracks = [
  {
    id: 'sh-001',
    title: '修炼爱情',
    artist: '林俊杰',
    time: '2023.11.23 · 许临野 首次分享',
    cover: 'https://picsum.photos/seed/shared-1/120/120'
  },
  {
    id: 'sh-002',
    title: 'The Middle',
    artist: 'Zedd, Maren Morris',
    time: '昨天深夜 · 你 正在循环',
    cover: 'https://picsum.photos/seed/shared-2/120/120'
  },
  {
    id: 'sh-003',
    title: '我怀念的',
    artist: '孙燕姿',
    time: '雨天 20:17 · 你们一起点了播放',
    cover: 'https://picsum.photos/seed/shared-3/120/120'
  },
  {
    id: 'sh-004',
    title: '夜曲',
    artist: '周杰伦',
    time: '凌晨 01:09 · 许临野 推荐给你',
    cover: 'https://picsum.photos/seed/shared-4/120/120'
  },
  {
    id: 'sh-005',
    title: 'Retrograde',
    artist: 'Dream Tunes',
    time: '上周末 · 你们共同收藏',
    cover: 'https://picsum.photos/seed/shared-5/120/120'
  },
  {
    id: 'sh-006',
    title: '晴天',
    artist: '周杰伦',
    time: '放学路上 · 你轻声跟唱',
    cover: 'https://picsum.photos/seed/shared-6/120/120'
  }
]

defineEmits(['back', 'play-all', 'play-track'])
</script>

<style scoped>
.shared-history-page {
  position: relative;
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(40, 50, 80, 0.40), transparent 55%),
    radial-gradient(circle at 20% 80%, rgba(26, 34, 64, 0.28), transparent 50%);
}

.shared-history-page :deep(.sub-playlist-page) {
  background: transparent;
}
</style>

<template>
  <section class="sub-playlist-page">
    <header class="sub-nav">
      <button class="back-btn" @click="$emit('back')" aria-label="返回">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
    </header>

    <section class="sub-header">
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
      <button class="play-all" @click="$emit('play-all')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12l10-6z"/></svg>
        播放全部
      </button>
    </section>

    <section class="track-list">
      <button
        v-for="(track, i) in tracks"
        :key="track.id || i"
        class="track-item"
        @click="$emit('play-track', track, i)"
      >
        <img class="cover" :src="track.cover || 'https://picsum.photos/96/96'" alt="cover" />
        <div class="meta">
          <h3>{{ track.title || '未知曲目' }}</h3>
          <p>{{ track.artist || '未知歌手' }} · {{ track.time || track.duration || '03:21' }}</p>
        </div>
        <span class="play-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 6v12l10-6z"/></svg>
        </span>
      </button>
    </section>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, default: '一起听过的歌' },
  description: { type: String, default: '把共同听过的旋律，收进这一页夜色里。' },
  tracks: { type: Array, default: () => [] }
})

defineEmits(['back', 'play-all', 'play-track'])
</script>

<style scoped>
.sub-playlist-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: #fff;
  background: rgba(8, 9, 12, 0.72);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
}

.sub-nav {
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 14px;
}

.back-btn {
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: rgba(255,255,255,.9);
  display: grid;
  place-items: center;
}

.back-btn svg,
.play-icon svg,
.play-all svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sub-header {
  min-height: 200px;
  padding: 10px 18px 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
}

.sub-header h1 {
  margin: 0;
  font-size: 34px;
  font-weight: 600;
}

.sub-header p {
  margin: 0;
  font-size: 13px;
  color: rgba(255,255,255,.56);
}

.play-all {
  margin-top: 6px;
  align-self: flex-start;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.10);
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.track-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 12px 20px;
}

.track-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 8px;
  text-align: left;
}

.cover {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  background: #2a2b30;
}

.meta {
  flex: 1;
  min-width: 0;
}

.meta h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta p {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255,255,255,.52);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.play-icon {
  width: 20px;
  height: 20px;
  color: rgba(255,255,255,.42);
  display: grid;
  place-items: center;
}
</style>

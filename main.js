import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { setupApp } from './script.js?v=uno202604';

const SubPlaylist = {
    props: {
        title: { type: String, default: '一起听过的歌' },
        description: { type: String, default: '把共同听过的旋律，收进这一页夜色里。' },
        tracks: { type: Array, default: () => [] }
    },
    emits: ['back', 'play-all', 'play-track'],
    template: `
      <section class="sub-playlist-page">
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
    `
};

const App = {
    setup() {
        return setupApp();
    }
};

const app = createApp(App);
app.component('sub-playlist', SubPlaylist);
app.component('SubPlaylist', SubPlaylist);
app.mount('#app');

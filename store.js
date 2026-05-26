/**
 * 跨模块状态协调：SoulLink 主会话切换时刷新/对齐 Feed、Mate、Peek（按需扩展）。
 */
import { watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

/**
 * @param {object} opts
 * @param {import('vue').Ref} opts.soulLinkActiveChat
 * @param {import('vue').Ref} [opts.characters]
 * @param {object} opts.feed reactive(useFeed)
 * @param {object} opts.mate reactive(useMate)
 * @param {object} opts.peek reactive(usePeek)
 */
export function attachSoulStoreCoordinators({ soulLinkActiveChat, characters, feed, mate, peek }) {
    watch(soulLinkActiveChat, (id) => {
        if (id == null || id === '') return;

        if (feed?.loadPosts && typeof feed.loadPosts === 'function') {
            Promise.resolve(feed.loadPosts()).catch((e) => console.warn('[SoulStore] feed.loadPosts', e));
        }

        const inRoster =
            !characters?.value ||
            !Array.isArray(characters.value) ||
            characters.value.some((c) => String(c?.id) === String(id));

        if (inRoster && mate && 'selectedMateCharacterId' in mate) {
            const n = Number(id);
            if (!Number.isNaN(n)) {
                mate.selectedMateCharacterId = n;
                if (typeof mate.saveToLocal === 'function') mate.saveToLocal();
            }
        }

        if (peek && 'peekSelectedCharacterId' in peek) {
            peek.peekSelectedCharacterId = String(id);
        }
    });
}

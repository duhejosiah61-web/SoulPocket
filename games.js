// =========================================================================
// == GAMES APP（通用工具 + UNO 引擎 + 其它小游戏兼容层）
// =========================================================================
import { ref, reactive } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { callAI } from './api.js';

const DB_NAME = 'SoulOS_DB';
const DB_VERSION = 2;
const GAME_STORE = 'gameStates';
const AI_TIMEOUT = 8000;

// ==================== 通用工具 ====================

/**
 * @param {Object} profile
 * @param {Object} _character
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
async function aiDecision(profile, _character, systemPrompt, userPrompt) {
    if (!profile || !profile.endpoint || !profile.key) {
        throw new Error('未配置 API');
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);
    try {
        const result = await callAI(profile, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], { signal: controller.signal, temperature: 0.35, max_tokens: 64 });
        clearTimeout(timeoutId);
        if (!result || !String(result).trim()) throw new Error('AI 返回空内容');
        return String(result).trim();
    } catch (err) {
        clearTimeout(timeoutId);
        const msg = err?.name === 'AbortError' ? '请求超时' : (err.message || String(err));
        throw new Error(`AI 决策失败: ${msg}`);
    }
}

function openSoulOsDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(GAME_STORE)) {
                database.createObjectStore(GAME_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

async function saveGameState(gameId, state) {
    const db = await openSoulOsDb();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(GAME_STORE, 'readwrite');
            const store = tx.objectStore(GAME_STORE);
            const putRequest = store.put({ id: gameId, state: JSON.parse(JSON.stringify(state)) });
            putRequest.onerror = () => reject(putRequest.error);
            tx.oncomplete = () => {
                try { db.close(); } catch { /* ignore */ }
                resolve();
            };
            tx.onerror = () => {
                try { db.close(); } catch { /* ignore */ }
                reject(tx.error);
            };
        } catch (e) {
            try { db.close(); } catch { /* ignore */ }
            reject(e);
        }
    });
}

async function loadGameState(gameId) {
    const db = await openSoulOsDb();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(GAME_STORE, 'readonly');
            const store = tx.objectStore(GAME_STORE);
            const getRequest = store.get(gameId);
            getRequest.onerror = () => {
                try { db.close(); } catch { /* ignore */ }
                reject(getRequest.error);
            };
            getRequest.onsuccess = () => {
                const result = getRequest.result;
                try { db.close(); } catch { /* ignore */ }
                resolve(result ? result.state : null);
            };
            tx.onerror = () => {
                try { db.close(); } catch { /* ignore */ }
                reject(tx.error);
            };
        } catch (e) {
            try { db.close(); } catch { /* ignore */ }
            reject(e);
        }
    });
}

function createGameCard(game, state, duration, participants, highlights = []) {
    const winnerLabel = state.winnerName || state.winner || '—';
    return {
        messageType: 'game_card',
        gameId: game.id,
        gameName: game.name,
        participants: participants.map((p) => ({ name: p.name, avatar: p.avatar })),
        duration,
        result: typeof winnerLabel === 'string' ? `${winnerLabel} 获胜` : '游戏结束',
        highlights: highlights.slice(0, 3),
        timestamp: Date.now(),
        snapshot: JSON.parse(JSON.stringify(state))
    };
}

// ==================== UNO（最终完美版 - 2026.04） ====================

function shuffleDeck(deck) {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function buildUnoDeck() {
    const colors = ['red', 'yellow', 'green', 'blue'];
    const values = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];
    let deck = [];

    colors.forEach((color) => {
        values.forEach((val) => {
            deck.push({ color, value: val, type: ['skip','reverse','draw2'].includes(val) ? 'action' : 'number' });
            if (val !== '0') deck.push({ color, value: val, type: 'number' });
        });
        deck.push({ color, value: 'skip', type: 'action' });
        deck.push({ color, value: 'reverse', type: 'action' });
        deck.push({ color, value: 'draw2', type: 'action' });
    });

    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'wild', value: 'wild', type: 'wild' });
        deck.push({ color: 'wild', value: 'wild_draw4', type: 'wild' });
    }
    return shuffleDeck(deck);
}

const UNO = {
    createState() {
        return reactive({
            deck: [],
            discardPile: [],
            players: [],
            currentPlayer: 0,
            currentColor: 'red',
            direction: 1,
            gameOver: false,
            winnerName: '',
            startTime: Date.now(),
            isThinking: false
        });
    },

    init(state, aiCount = 1) {
        state.deck = buildUnoDeck();
        state.players = [
            { id: 0, type: 'user', name: '你', hand: [] },
            ...Array.from({ length: aiCount }, (_, i) => ({
                id: i + 1,
                type: 'ai',
                name: '李寻野',
                hand: []
            }))
        ];

        state.players.forEach((p) => {
            p.hand = [];
            for (let j = 0; j < 7; j++) {
                if (state.deck.length) p.hand.push(state.deck.pop());
            }
        });

        let first = state.deck.pop();
        while (first && first.type === 'wild') {
            state.deck.unshift(first);
            first = state.deck.pop();
        }
        state.discardPile = [first];
        state.currentColor = first.color;
        state.currentPlayer = 0;
        state.direction = 1;
        state.gameOver = false;
        state.winnerName = '';
        state.isThinking = false;
    },

    playCard(state, cardIndex) {
        if (state.gameOver || state.currentPlayer !== 0) return false;

        const player = state.players[0];
        const card = player.hand[cardIndex];
        const top = state.discardPile[state.discardPile.length - 1];

        if (!card || (card.type !== 'wild' && card.color !== state.currentColor && card.value !== top.value)) {
            return false;
        }

        player.hand.splice(cardIndex, 1);
        state.discardPile.push(card);

        let nextPlayerAdvance = 1;

        if (card.type === 'wild') {
            state.currentColor = ['red','yellow','green','blue'][Math.floor(Math.random()*4)];
            if (card.value === 'wild_draw4') {
                UNO.drawCards(state, 1, 4);
                nextPlayerAdvance = 2;
            }
        } else {
            state.currentColor = card.color;

            if (card.value === 'draw2') {
                UNO.drawCards(state, 1, 2);
                nextPlayerAdvance = 2;
            } else if (card.value === 'skip') {
                nextPlayerAdvance = 2;
            } else if (card.value === 'reverse') {
                state.direction *= -1;
                if (state.players.length === 2) nextPlayerAdvance = 2;
            }
        }

        if (player.hand.length === 0) {
            state.gameOver = true;
            state.winnerName = '你';
            return true;
        }

        state.currentPlayer = (state.currentPlayer + nextPlayerAdvance * state.direction) % state.players.length;
        if (state.currentPlayer < 0) state.currentPlayer += state.players.length;

        return true;
    },

    drawCard(state) {
        if (state.gameOver || state.currentPlayer !== 0 || state.deck.length === 0) return;
        state.players[0].hand.push(state.deck.pop());
        state.currentPlayer = (state.currentPlayer + state.direction) % state.players.length;
        if (state.currentPlayer < 0) state.currentPlayer += state.players.length;
    },

    drawCards(state, playerIndex, count) {
        for (let i = 0; i < count; i++) {
            if (state.deck.length === 0) {
                const top = state.discardPile.pop();
                state.deck = shuffleDeck(state.discardPile);
                state.discardPile = [top];
            }
            if (state.deck.length > 0) {
                state.players[playerIndex].hand.push(state.deck.pop());
            }
        }
    },

    aiTurn(state, onDone) {
        const done = () => {
            if (typeof onDone === 'function') onDone();
        };

        if (state.gameOver || state.currentPlayer !== 1) {
            done();
            return;
        }

        state.isThinking = true;

        setTimeout(() => {
            try {
                const ai = state.players[1];
                const top = state.discardPile[state.discardPile.length - 1];

                for (let i = 0; i < ai.hand.length; i++) {
                    const card = ai.hand[i];
                    if (card.type === 'wild' || card.color === state.currentColor || card.value === top.value) {
                        ai.hand.splice(i, 1);
                        state.discardPile.push(card);

                        let advance = 1;

                        if (card.type === 'wild') {
                            state.currentColor = ['red','yellow','green','blue'][Math.floor(Math.random()*4)];
                            if (card.value === 'wild_draw4') {
                                UNO.drawCards(state, 0, 4);
                                advance = 2;
                            }
                        } else {
                            state.currentColor = card.color;
                            if (card.value === 'draw2') { UNO.drawCards(state, 0, 2); advance = 2; }
                            else if (card.value === 'skip') advance = 2;
                            else if (card.value === 'reverse') {
                                state.direction *= -1;
                                if (state.players.length === 2) advance = 2;
                            }
                        }

                        if (ai.hand.length === 0) {
                            state.gameOver = true;
                            state.winnerName = '李寻野';
                            state.isThinking = false;
                            done();
                            return;
                        }

                        state.currentPlayer = (1 + advance * state.direction) % state.players.length;
                        if (state.currentPlayer < 0) state.currentPlayer += state.players.length;

                        state.isThinking = false;
                        done();
                        return;
                    }
                }

                if (state.deck.length > 0) {
                    ai.hand.push(state.deck.pop());
                }
                state.currentPlayer = (1 + state.direction) % state.players.length;
                if (state.currentPlayer < 0) state.currentPlayer += state.players.length;

                state.isThinking = false;
                done();
            } catch (e) {
                state.isThinking = false;
                console.error('aiTurn', e);
                done();
            }
        }, 650);
    },

    injectCharacters(state, chars) {
        if (!state?.players || !Array.isArray(chars)) return;
        for (let i = 1; i < state.players.length; i++) {
            const c = chars[i - 1];
            if (c?.name) state.players[i].name = c.name;
        }
    },

    async runAiTurn(state, aiPlayerIndex, _profile, _onMsg) {
        if (state.gameOver || state.currentPlayer !== aiPlayerIndex) return;
        if (state.players[state.currentPlayer]?.type !== 'ai') return;
        await new Promise((resolve) => UNO.aiTurn(state, resolve));
    },

    generateCard(state, duration, participants) {
        return createGameCard({ id: 'uno', name: 'UNO' }, state, duration, participants, []);
    }
};

// ==================== useGames ====================

export function useGames(activeProfileRef, charactersRef) {
    const catalog = [
        {
            id: 'werewolf',
            name: '狼人杀',
            description: '多人参与的推理游戏，玩家需要通过发言和投票找出狼人',
            icon: 'fas fa-user-secret',
            status: 'available',
            players: '4-18人',
            duration: '15-30分钟',
            rules: '狼人杀是一款多人参与的推理游戏，玩家分为狼人、平民和神民三个阵营。游戏分为夜晚和白天两个阶段，夜晚狼人可以杀人，神民可以使用技能，白天所有玩家通过发言和投票找出狼人并放逐。',
            roles: [
                { name: '狼人', description: '夜晚可以选择一名玩家杀害', count: 2 },
                { name: '平民', description: '没有特殊技能，通过推理找出狼人', count: 2 },
                { name: '预言家', description: '夜晚可以查验一名玩家的身份', count: 1 },
                { name: '女巫', description: '拥有一瓶解药和一瓶毒药，可以救人或杀人', count: 1 },
                { name: '猎人', description: '被狼人杀害或被放逐时可以开枪带走一名玩家', count: 1 }
            ]
        },
        {
            id: 'undercover',
            name: '谁是卧底',
            description: '多人参与的文字推理游戏，通过描述找出卧底',
            icon: 'fas fa-user-ninja',
            status: 'available',
            players: '4-10人',
            duration: '10-20分钟',
            rules: '谁是卧底是一款文字推理游戏，玩家会收到一个词语，其中大部分玩家收到的是相同的词语，只有一名玩家收到的是不同的词语（卧底）。玩家轮流描述自己的词语，然后投票找出卧底。',
            wordPairs: [
                { normal: '苹果', undercover: '梨' },
                { normal: '电脑', undercover: '手机' },
                { normal: '猫', undercover: '狗' },
                { normal: '篮球', undercover: '足球' },
                { normal: '牛奶', undercover: '豆浆' }
            ]
        },
        {
            id: 'script',
            name: '剧本杀',
            description: '基于剧本的角色扮演推理游戏，通过线索找出凶手',
            icon: 'fas fa-book',
            status: 'available',
            players: '5-8人',
            duration: '60-120分钟',
            rules: '剧本杀是一款基于剧本的角色扮演推理游戏，玩家扮演剧本中的角色，通过阅读剧本、收集线索、讨论推理，找出真凶。每个角色都有自己的背景故事和秘密。',
            scripts: [
                {
                    id: 'script1',
                    name: '豪门夜宴',
                    description: '一场豪门盛宴，主人离奇死亡，谁是凶手？',
                    characters: [
                        { name: '大少爷', description: '家族继承人，性格傲慢' },
                        { name: '二小姐', description: '家族千金，聪明伶俐' },
                        { name: '管家', description: '服务家族多年，忠诚可靠' },
                        { name: '厨师', description: '新来的厨师，手艺精湛' },
                        { name: '女佣', description: '年轻漂亮，举止可疑' }
                    ]
                },
                {
                    id: 'script2',
                    name: '校园谜案',
                    description: '校园里发生了一起神秘事件，真相究竟是什么？',
                    characters: [
                        { name: '班长', description: '成绩优异，深受老师喜爱' },
                        { name: '转学生', description: '神秘的新同学，来历不明' },
                        { name: '体育委员', description: '阳光开朗，运动健将' },
                        { name: '学习委员', description: '沉默寡言，专注学习' },
                        { name: '老师', description: '年轻有为，教学有方' }
                    ]
                }
            ]
        },
        {
            id: 'uno',
            name: 'UNO',
            description: '经典卡牌游戏，通过策略出完手中的牌',
            icon: 'fas fa-cards',
            status: 'available',
            players: '2-4人',
            duration: '10-30分钟',
            rules: 'UNO是一款经典的卡牌游戏，玩家需要将手中的牌按照颜色或数字与出牌堆上的牌匹配。当玩家只剩一张牌时，必须喊"UNO"。先出完所有牌的玩家获胜。'
        },
        {
            id: 'rock-paper-scissors',
            name: '石头剪刀布',
            description: '经典的手势对战游戏，简单易上手',
            icon: 'fas fa-hand-rock',
            status: 'available',
            players: '2人',
            duration: '1-5分钟',
            rules: '石头剪刀布是一种简单的手势游戏，玩家同时出示手势：石头（握紧拳头）、剪刀（伸出食指和中指）或布（张开手掌）。石头胜剪刀，剪刀胜布，布胜石头。'
        },
        {
            id: 'truth-or-dare',
            name: '真心话大冒险',
            description: '通过转盘选择真心话或大冒险',
            icon: 'fas fa-spinner',
            status: 'available',
            players: '2-10人',
            duration: '10-30分钟',
            rules: '真心话大冒险是一种社交游戏，玩家通过转盘选择真心话或大冒险。选择真心话的玩家必须诚实回答问题，选择大冒险的玩家必须完成指定的挑战。',
            truths: [
                '说出你最尴尬的一件事',
                '你最喜欢的人是谁？',
                '你做过最疯狂的事是什么？',
                '你有什么秘密一直没告诉别人？',
                '你最害怕什么？'
            ],
            dares: [
                '学动物叫',
                '唱一首歌',
                '给好朋友打电话',
                '做10个俯卧撑',
                '模仿一个名人'
            ]
        },
        {
            id: 'ludo',
            name: '飞行棋',
            description: '经典的骰子移动游戏，先将所有飞机飞到终点',
            icon: 'fas fa-plane',
            status: 'available',
            players: '2-4人',
            duration: '15-30分钟',
            rules: '飞行棋是一种经典的骰子移动游戏，玩家通过掷骰子移动飞机。当掷出6时，可以起飞一架飞机。飞机需要绕棋盘一周后进入终点。先将所有飞机飞到终点的玩家获胜。'
        },
        {
            id: 'mahjong',
            name: '麻将',
            description: '经典中国麻将游戏，通过组合牌型获胜',
            icon: 'fas fa-tiles',
            status: 'coming_soon',
            players: '4人',
            duration: '30-60分钟'
        },
        {
            id: 'poker',
            name: '扑克',
            description: '多种扑克游戏玩法，包括德州扑克、斗地主等',
            icon: 'fas fa-playing-card',
            status: 'coming_soon',
            players: '2-10人',
            duration: '10-60分钟'
        }
    ];

    const currentGame = ref(null);
    const activeGame = ref(null);
    const gameMessages = ref([]);
    const gameState = reactive({
        phase: 'lobby',
        players: [],
        currentPlayer: 0,
        day: 1,
        votes: {},
        deadPlayers: [],
        rpsPlayerChoice: null,
        rpsAIChoice: null,
        rpsResult: null,
        rpsScore: { player: 0, ai: 0 },
        truthOrDare: null,
        currentTruth: null,
        currentDare: null,
        unoDeck: [],
        discardPile: [],
        playerHand: [],
        aiHands: [[], [], []],
        currentColor: null,
        unoCurrentTurn: 'player',
        unoWinner: null,
        gameOver: false,
        isThinking: false,
        winnerName: '',
        ludoBoard: [],
        ludoPlayers: [],
        currentDice: 0,
        ludoTrackLength: 20,
        ludoCurrentPlayer: 0,
        ludoWinner: null,
        ludoEffects: {},
        ludoPauseTurns: { player: 0, ai: 0 }
    });

    let unoInternal = null;

    let onGameStateChange = null;
    let onGameMessage = null;
    let onGameEnd = null;

    const setOnStateChange = (cb) => { onGameStateChange = typeof cb === 'function' ? cb : null; };
    const setOnGameMessage = (cb) => { onGameMessage = typeof cb === 'function' ? cb : null; };
    const setOnGameEnd = (cb) => { onGameEnd = typeof cb === 'function' ? cb : null; };

    function syncUnoToLegacy() {
        if (!unoInternal) return;
        gameState.unoDeck = unoInternal.deck;
        gameState.discardPile = unoInternal.discardPile;
        gameState.playerHand = unoInternal.players[0]?.hand || [];
        gameState.aiHands = [
            unoInternal.players[1]?.hand || [],
            unoInternal.players[2]?.hand || [],
            unoInternal.players[3]?.hand || []
        ];
        gameState.currentColor = unoInternal.currentColor;
        gameState.unoCurrentTurn = unoInternal.currentPlayer === 0 ? 'player' : 'ai';
        gameState.gameOver = unoInternal.gameOver;
        gameState.isThinking = !!unoInternal.isThinking;
        gameState.winnerName = unoInternal.winnerName || '';
        gameState.players = unoInternal.players;
        gameState.currentPlayer = unoInternal.currentPlayer;
        if (unoInternal.gameOver) {
            gameState.unoWinner = unoInternal.winnerName === '你' ? 'player' : 'ai';
            gameState.phase = 'end';
        } else {
            gameState.unoWinner = null;
            gameState.phase = 'game';
        }
    }

    function clearUno() {
        unoInternal = null;
        activeGame.value = null;
        gameState.gameOver = false;
        gameState.isThinking = false;
        gameState.winnerName = '';
        if (currentGame.value?.id === 'uno') {
            gameState.players = [];
        }
    }

    const startGame = (gameId) => {
        const game = catalog.find((g) => g.id === gameId);
        if (game && game.status === 'available') {
            currentGame.value = game;
            clearUno();
            Object.assign(gameState, {
                phase: 'lobby',
                players: [],
                currentPlayer: 0,
                day: 1,
                votes: {},
                deadPlayers: [],
                rpsPlayerChoice: null,
                rpsAIChoice: null,
                rpsResult: null,
                rpsScore: { player: 0, ai: 0 },
                truthOrDare: null,
                currentTruth: null,
                currentDare: null,
                unoDeck: [],
                discardPile: [],
                playerHand: [],
                aiHands: [[], [], []],
                currentColor: null,
                unoCurrentTurn: 'player',
                unoWinner: null,
                gameOver: false,
                isThinking: false,
                winnerName: '',
                ludoBoard: [],
                ludoPlayers: [],
                currentDice: 0,
                ludoTrackLength: 20,
                ludoCurrentPlayer: 0,
                ludoWinner: null,
                ludoEffects: {},
                ludoPauseTurns: { player: 0, ai: 0 }
            });
            return game;
        }
        return null;
    };

    const startGameWithOptions = async (gameId, options = {}) => {
        const g = startGame(gameId);
        if (!g || gameId !== 'uno') return g;
        unoInternal = UNO.createState();
        UNO.init(unoInternal, 1);
        const chars = options.aiCharacters || (charactersRef?.value || []).slice(0, 3);
        UNO.injectCharacters(unoInternal, chars);
        activeGame.value = UNO;
        syncUnoToLegacy();
        onGameStateChange?.(unoInternal);
        const profile = activeProfileRef?.value;
        if (profile && unoInternal.currentPlayer !== 0 && unoInternal.players[unoInternal.currentPlayer]?.type === 'ai') {
            await advanceUnoAiTurns(profile);
        }
        void saveGameState('game_uno', unoInternal).catch(() => {});
        return g;
    };

    async function advanceUnoAiTurns(profile) {
        const result = { messages: [], lastCard: null, winner: null };
        if (!unoInternal || unoInternal.gameOver) return result;
        const p = profile || activeProfileRef?.value;
        if (!p?.endpoint || !p?.key) return result;

        while (
            unoInternal
            && !unoInternal.gameOver
            && unoInternal.players[unoInternal.currentPlayer]?.type === 'ai'
        ) {
            const idx = unoInternal.currentPlayer;
            try {
                await UNO.runAiTurn(unoInternal, idx, p, (msg) => {
                    result.messages.push(msg);
                    gameMessages.value = [...gameMessages.value, { sender: 'UNO', text: msg, timestamp: Date.now() }];
                    onGameMessage?.(gameMessages.value);
                });
            } catch (e) {
                result.messages.push(String(e.message || e));
                break;
            }
            syncUnoToLegacy();
            onGameStateChange?.(unoInternal);
            void saveGameState('game_uno', unoInternal).catch(() => {});
            if (unoInternal.gameOver) {
                result.winner = unoInternal.winnerName === '你' ? 0 : 1;
                break;
            }
        }
        return result;
    }

    const joinGame = (playerName) => {
        if (currentGame.value && gameState.phase === 'lobby') {
            gameState.players.push({
                name: playerName,
                role: null,
                isAlive: true,
                vote: null
            });
            return true;
        }
        return false;
    };

    const startGameSession = () => {
        if (currentGame.value && gameState.phase === 'lobby' && gameState.players.length >= 4) {
            gameState.phase = 'game';
            if (currentGame.value.id === 'werewolf') {
                const roles = [];
                currentGame.value.roles.forEach((role) => {
                    for (let i = 0; i < role.count; i++) roles.push(role.name);
                });
                roles.sort(() => Math.random() - 0.5);
                gameState.players.forEach((player, index) => {
                    player.role = roles[index] || '平民';
                });
            }
            return true;
        }
        return false;
    };

    const castVote = (voterName, targetName) => {
        if (currentGame.value && gameState.phase === 'game') {
            const voter = gameState.players.find((p) => p.name === voterName);
            if (voter && voter.isAlive) {
                voter.vote = targetName;
                gameState.votes[voterName] = targetName;
                return true;
            }
        }
        return false;
    };

    const getVoteResults = () => {
        const voteCounts = {};
        Object.values(gameState.votes).forEach((vote) => {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        });
        let maxVotes = 0;
        let mostVoted = null;
        Object.entries(voteCounts).forEach(([player, count]) => {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = player;
            }
        });
        return { mostVoted, maxVotes, voteCounts };
    };

    const endDay = () => {
        if (currentGame.value && gameState.phase === 'game') {
            const results = getVoteResults();
            if (results.mostVoted) {
                const player = gameState.players.find((p) => p.name === results.mostVoted);
                if (player) {
                    player.isAlive = false;
                    gameState.deadPlayers.push(player);
                }
            }
            gameState.day++;
            gameState.votes = {};
            gameState.players.forEach((player) => {
                player.vote = null;
            });
            if (currentGame.value.id === 'werewolf') {
                const werewolves = gameState.players.filter((p) => p.isAlive && p.role === '狼人').length;
                const nonWerewolves = gameState.players.filter((p) => p.isAlive && p.role !== '狼人').length;
                if (werewolves === 0) gameState.phase = 'end';
                else if (werewolves >= nonWerewolves) gameState.phase = 'end';
            }
        }
    };

    const playRPS = (playerChoice) => {
        const choices = ['rock', 'paper', 'scissors'];
        const aiChoice = choices[Math.floor(Math.random() * choices.length)];
        gameState.rpsPlayerChoice = playerChoice;
        gameState.rpsAIChoice = aiChoice;
        let result;
        if (playerChoice === aiChoice) result = '平局';
        else if (
            (playerChoice === 'rock' && aiChoice === 'scissors')
            || (playerChoice === 'scissors' && aiChoice === 'paper')
            || (playerChoice === 'paper' && aiChoice === 'rock')
        ) {
            result = '你赢了';
            gameState.rpsScore.player++;
        } else {
            result = '你输了';
            gameState.rpsScore.ai++;
        }
        gameState.rpsResult = result;
        return { playerChoice, aiChoice, result, score: gameState.rpsScore };
    };

    const spinTruthOrDare = () => {
        const options = ['truth', 'dare'];
        const choice = options[Math.floor(Math.random() * options.length)];
        gameState.truthOrDare = choice;
        if (choice === 'truth') {
            const truths = currentGame.value.truths;
            gameState.currentTruth = truths[Math.floor(Math.random() * truths.length)];
            gameState.currentDare = null;
        } else {
            const dares = currentGame.value.dares;
            gameState.currentDare = dares[Math.floor(Math.random() * dares.length)];
            gameState.currentTruth = null;
        }
        return { choice, truth: gameState.currentTruth, dare: gameState.currentDare };
    };

    const syncAfterUnoAi = () => {
        syncUnoToLegacy();
        onGameStateChange?.(unoInternal);
        void saveGameState('game_uno', unoInternal).catch(() => {});
    };

    const startUNOGame = () => {
        if (!currentGame.value || currentGame.value.id !== 'uno') return false;
        const chars = (charactersRef?.value || []).slice(0, 3);
        unoInternal = UNO.createState();
        UNO.init(unoInternal, 1);
        UNO.injectCharacters(unoInternal, chars);
        activeGame.value = UNO;
        syncUnoToLegacy();
        onGameStateChange?.(unoInternal);
        void saveGameState('game_uno', unoInternal).catch(() => {});
        return true;
    };

    const isUnoPlayableCard = (card) => {
        if (!unoInternal || !card) return false;
        const top = unoInternal.discardPile[unoInternal.discardPile.length - 1];
        if (!top) return false;
        return card.type === 'wild' || card.color === unoInternal.currentColor || card.value === top.value;
    };

    const playUnoCard = (index) => {
        if (!unoInternal) return;
        const success = UNO.playCard(unoInternal, index);
        if (!success) return;

        syncUnoToLegacy();
        onGameStateChange?.(unoInternal);
        void saveGameState('game_uno', unoInternal).catch(() => {});

        if (!unoInternal.gameOver && unoInternal.currentPlayer !== 0) {
            UNO.aiTurn(unoInternal, syncAfterUnoAi);
        }
    };

    const drawUnoCardForPlayer = () => {
        if (!unoInternal) return null;
        UNO.drawCard(unoInternal);
        syncUnoToLegacy();
        onGameStateChange?.(unoInternal);
        void saveGameState('game_uno', unoInternal).catch(() => {});

        if (!unoInternal.gameOver && unoInternal.currentPlayer !== 0) {
            UNO.aiTurn(unoInternal, syncAfterUnoAi);
        }
        const hand = unoInternal.players[0]?.hand;
        return hand?.length ? hand[hand.length - 1] : null;
    };

    const aiTurnUNO = async () => {
        if (!unoInternal || unoInternal.gameOver) return null;
        const profile = activeProfileRef?.value;
        const topSig = () => {
            const t = unoInternal.discardPile[unoInternal.discardPile.length - 1];
            return t ? `${t.color}:${t.value}` : '';
        };
        const beforeTop = topSig();
        await advanceUnoAiTurns(profile);
        const afterTop = topSig();
        const played = beforeTop !== afterTop;
        const topCard = unoInternal.discardPile[unoInternal.discardPile.length - 1];
        let winner = null;
        if (unoInternal.gameOver) {
            winner = unoInternal.winnerName === '你' ? 'player' : 'ai';
        }
        return {
            action: played ? 'play' : 'draw',
            card: played ? topCard : null,
            winner
        };
    };

    const startLudoGame = () => {
        gameState.ludoBoard = [];
        gameState.ludoPlayers = [
            { color: 'red', planes: [-1, -1, -1, -1], home: false },
            { color: 'blue', planes: [-1, -1, -1, -1], home: false }
        ];
        gameState.ludoCurrentPlayer = 0;
        gameState.ludoWinner = null;
        gameState.currentDice = 0;
        gameState.ludoPauseTurns = { player: 0, ai: 0 };
        gameState.ludoEffects = {};
        const effectTypes = ['forward', 'backward', 'pause', 'question'];
        for (let i = 2; i < gameState.ludoTrackLength; i++) {
            if (Math.random() < 0.3) {
                const type = effectTypes[Math.floor(Math.random() * effectTypes.length)];
                let value = 1;
                if (type === 'forward' || type === 'backward') value = Math.random() < 0.5 ? 1 : 2;
                gameState.ludoEffects[i] = { type, value };
            }
        }
        gameState.phase = 'game';
        return true;
    };

    const rollDice = () => {
        const dice = Math.floor(Math.random() * 6) + 1;
        gameState.currentDice = dice;
        return dice;
    };

    const canMoveLudoPlane = (planePos, dice) => {
        if (planePos < 0) return dice === 6;
        return planePos + dice <= gameState.ludoTrackLength;
    };

    const applyLudoMove = (playerIndex, planeIndex, dice) => {
        const player = gameState.ludoPlayers[playerIndex];
        if (!player) return false;
        const pos = player.planes[planeIndex];
        if (!canMoveLudoPlane(pos, dice)) return false;
        player.planes[planeIndex] = pos < 0 ? 0 : pos + dice;
        const allHome = player.planes.every((p) => p >= gameState.ludoTrackLength);
        if (allHome) {
            gameState.ludoWinner = playerIndex === 0 ? 'player' : 'ai';
            gameState.phase = 'end';
        }
        return true;
    };

    const moveLudoPlane = (planeIndex) => {
        if (gameState.ludoCurrentPlayer !== 0 || gameState.currentDice <= 0 || gameState.phase === 'end') {
            return { ok: false };
        }
        if (gameState.ludoPauseTurns.player > 0) {
            gameState.ludoPauseTurns.player--;
            gameState.currentDice = 0;
            gameState.ludoCurrentPlayer = 1;
            return { ok: false, skipped: true };
        }
        const moved = applyLudoMove(0, planeIndex, gameState.currentDice);
        if (!moved) return { ok: false };
        const dice = gameState.currentDice;
        const currentPos = gameState.ludoPlayers[0].planes[planeIndex];
        const effect = gameState.ludoEffects[currentPos] || null;
        gameState.currentDice = 0;
        gameState.ludoCurrentPlayer = gameState.phase === 'end' ? 0 : 1;
        return { ok: true, dice, planeIndex, pos: currentPos, effect, playerKind: 'player' };
    };

    const aiTurnLudo = () => {
        if (gameState.ludoCurrentPlayer !== 1 || gameState.phase === 'end') return null;
        if (gameState.ludoPauseTurns.ai > 0) {
            gameState.ludoPauseTurns.ai--;
            gameState.currentDice = 0;
            gameState.ludoCurrentPlayer = 0;
            return { skipped: true, winner: gameState.ludoWinner };
        }
        const dice = Math.floor(Math.random() * 6) + 1;
        const ai = gameState.ludoPlayers[1];
        let moved = false;
        let movedPlaneIndex = -1;
        let movedPos = -1;
        for (let i = 0; i < ai.planes.length; i++) {
            if (applyLudoMove(1, i, dice)) {
                moved = true;
                movedPlaneIndex = i;
                movedPos = ai.planes[i];
                break;
            }
        }
        const effect = moved && movedPos >= 0 ? (gameState.ludoEffects[movedPos] || null) : null;
        gameState.currentDice = 0;
        if (gameState.phase !== 'end') {
            gameState.ludoCurrentPlayer = 0;
        }
        return { dice, moved, movedPlaneIndex, movedPos, effect, winner: gameState.ludoWinner, playerKind: 'ai' };
    };

    const applyLudoEffect = (playerKind, effect, planeIndex = 0) => {
        if (!effect) return { applied: false };
        const playerIndex = playerKind === 'player' ? 0 : 1;
        const planes = gameState.ludoPlayers[playerIndex]?.planes || [];
        const pos = planes[planeIndex];
        if (pos < 0) return { applied: false };

        if (effect.type === 'forward') {
            planes[planeIndex] = Math.min(gameState.ludoTrackLength, pos + (effect.value || 1));
        } else if (effect.type === 'backward') {
            planes[planeIndex] = Math.max(-1, pos - (effect.value || 1));
        } else if (effect.type === 'pause') {
            if (playerKind === 'player') gameState.ludoPauseTurns.player += effect.value || 1;
            else gameState.ludoPauseTurns.ai += effect.value || 1;
        } else if (effect.type === 'question') {
            return { applied: true, needsQuestion: true };
        }

        const allHome = planes.every((p) => p >= gameState.ludoTrackLength);
        if (allHome) {
            gameState.ludoWinner = playerKind;
            gameState.phase = 'end';
        }
        return { applied: true, needsQuestion: false };
    };

    const applyLudoQuestionResult = (playerKind, planeIndex, isCorrect) => {
        const playerIndex = playerKind === 'player' ? 0 : 1;
        const planes = gameState.ludoPlayers[playerIndex]?.planes || [];
        const pos = planes[planeIndex];
        if (pos < 0) return false;
        if (isCorrect) {
            planes[planeIndex] = Math.min(gameState.ludoTrackLength, pos + 2);
        } else {
            planes[planeIndex] = Math.max(-1, pos - 1);
        }
        const allHome = planes.every((p) => p >= gameState.ludoTrackLength);
        if (allHome) {
            gameState.ludoWinner = playerKind;
            gameState.phase = 'end';
        }
        return true;
    };

    const playerAction = async (action, payload) => {
        if (!activeGame.value || !unoInternal) return;
        if (action === 'playCard') {
            UNO.playCard(unoInternal, payload.cardIdx);
        } else if (action === 'drawCard') {
            UNO.drawCard(unoInternal);
        } else if (action === 'callUno') {
            return;
        } else {
            throw new Error(`未知动作: ${action}`);
        }
        syncUnoToLegacy();
        onGameStateChange?.(unoInternal);
        void saveGameState('game_uno', unoInternal).catch(() => {});
        if (!unoInternal.gameOver && unoInternal.currentPlayer !== 0) {
            UNO.aiTurn(unoInternal, syncAfterUnoAi);
        }
    };

    const endGame = async () => {
        if (activeGame.value && unoInternal) {
            const duration = Math.floor((Date.now() - (unoInternal.startTime || Date.now())) / 1000);
            const participants = unoInternal.players.map((p) => ({
                name: p.name,
                avatar: p.avatarUrl || ''
            }));
            const card = UNO.generateCard(unoInternal, duration, participants);
            onGameEnd?.(card);
        }
        clearUno();
        currentGame.value = null;
        gameMessages.value = [];
    };

    const checkGameEnd = () => {
        if (currentGame.value && currentGame.value.id === 'werewolf') {
            const werewolves = gameState.players.filter((p) => p.isAlive && p.role === '狼人').length;
            const nonWerewolves = gameState.players.filter((p) => p.isAlive && p.role !== '狼人').length;
            if (werewolves === 0) {
                gameState.phase = 'end';
                return { winner: '平民和神民' };
            }
            if (werewolves >= nonWerewolves) {
                gameState.phase = 'end';
                return { winner: '狼人' };
            }
        }
        return null;
    };

    const clearGameApp = () => {
        clearUno();
        currentGame.value = null;
        gameMessages.value = [];
    };

    const getUnoColor = (color) => {
        const map = {
            red: '#ef4444',
            yellow: '#eab308',
            green: '#22c55e',
            blue: '#3b82f6',
            wild: '#8b5cf6'
        };
        return map[color] || '#64748b';
    };

    return {
        games: catalog,
        gamesList: catalog,
        currentGame,
        activeGame,
        gameState,
        gameMessages,
        startGame,
        startGameWithOptions,
        joinGame,
        startGameSession,
        castVote,
        getVoteResults,
        endDay,
        checkGameEnd,
        playRPS,
        spinTruthOrDare,
        startUNOGame,
        isUnoPlayableCard,
        drawUnoCardForPlayer,
        playUnoCard,
        aiTurnUNO,
        advanceUnoAiTurns,
        startLudoGame,
        rollDice,
        moveLudoPlane,
        aiTurnLudo,
        applyLudoEffect,
        applyLudoQuestionResult,
        playerAction,
        endGame,
        setOnStateChange,
        setOnGameMessage,
        setOnGameEnd,
        saveGameState,
        loadGameState,
        aiDecision,
        clearGameApp,
        getUnoColor,
        UNO
    };
}

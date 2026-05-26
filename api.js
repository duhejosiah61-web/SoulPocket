/**
 * 统一 OpenAI 兼容 /chat/completions 调用：URL 候选、错误与正文解析集中处理。
 */

export function normalizeProfile(profile) {
    if (!profile) {
        return { endpoint: '', key: '', model: 'gpt-4o-mini' };
    }
    return {
        endpoint: String(profile.endpoint || '').trim(),
        key: String(profile.key || '').trim(),
        model:
            profile.model ||
            profile.openai_model ||
            profile.claude_model ||
            profile.openrouter_model ||
            'gpt-4o-mini'
    };
}

/** @param {string} endpointRaw */
export function buildChatCompletionUrlCandidates(endpointRaw) {
    const base = String(endpointRaw || '').trim().replace(/\/+$/, '');
    if (!base) return [];
    if (/\/chat\/completions$/i.test(base)) return [base];
    if (/\/v1$/i.test(base)) return [`${base}/chat/completions`];
    return [`${base}/v1/chat/completions`, `${base}/chat/completions`];
}

export function extractChatCompletionText(data) {
    if (!data || typeof data !== 'object') return '';
    if (data.error && (data.error.message || data.error.code)) {
        console.warn('[callAI] API error:', data.error.message || data.error.code || data.error);
    }
    const ch = data.choices?.[0];
    if (ch) {
        const msg = ch.message || ch.delta;
        if (msg?.content != null) {
            if (typeof msg.content === 'string') return msg.content;
            if (Array.isArray(msg.content)) {
                return msg.content
                    .map((c) => (typeof c === 'string' ? c : (c && (c.text || c.content)) || ''))
                    .join('');
            }
        }
        // DeepSeek / 部分模型会把正文放在 reasoning_content
        if (typeof msg?.reasoning_content === 'string' && msg.reasoning_content.trim()) {
            return msg.reasoning_content;
        }
        // 一些兼容实现可能直接提供 text 字段
        if (typeof ch.text === 'string' && ch.text.trim()) return ch.text;
    }
    const msgContent = data?.choices?.[0]?.message?.content;
    const legacy =
        (typeof msgContent === 'string' ? msgContent : Array.isArray(msgContent) ? msgContent.map((x) => x?.text || '').join('') : '') ||
        data?.choices?.[0]?.delta?.content;
    if (legacy) return String(legacy);

    // OpenAI Responses API / 部分网关：output[].content[].text
    const out0 = Array.isArray(data.output) ? data.output[0] : null;
    const outParts = out0?.content;
    if (Array.isArray(outParts) && outParts.length) {
        const t = outParts
            .map((p) => {
                if (!p) return '';
                if (typeof p === 'string') return p;
                if (typeof p.text === 'string') return p.text;
                if (typeof p.content === 'string') return p.content;
                return '';
            })
            .join('');
        if (t && String(t).trim()) return String(t);
    }

    if (data.message?.content != null && typeof data.message.content === 'string') {
        return data.message.content;
    }
    const parts = data.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts) && parts.length) {
        return parts.map((p) => (p && p.text) || '').join('');
    }
    if (typeof data.output_text === 'string') return data.output_text;
    if (typeof data.text === 'string') return data.text;
    if (data.data && typeof data.data === 'object') {
        const nested = extractChatCompletionText(data.data);
        if (nested) return nested;
    }
    return '';
}

function deepFindFirstText(obj, maxDepth = 6) {
    const allowKeys = new Set([
        'content',
        'text',
        'output_text',
        'answer',
        'result',
        'message',
        'reasoning_content'
    ]);
    const seen = new Set();
    const stack = [{ v: obj, d: 0 }];
    while (stack.length) {
        const { v, d } = stack.pop();
        if (!v || d > maxDepth) continue;
        // 注意：不要“随便拿到一个字符串”就当正文（例如 id: "chatcmpl-..."）
        // 这里只在命中 allowKeys 的字段时才会返回字符串。
        if (typeof v !== 'object') continue;
        if (seen.has(v)) continue;
        seen.add(v);

        if (Array.isArray(v)) {
            for (let i = v.length - 1; i >= 0; i--) stack.push({ v: v[i], d: d + 1 });
            continue;
        }

        const keys = Object.keys(v);
        for (let i = keys.length - 1; i >= 0; i--) {
            const k = keys[i];
            const vv = v[k];
            if (allowKeys.has(k) && typeof vv === 'string' && vv.trim()) return vv.trim();
            // message 可能是对象，递归进去
            if (allowKeys.has(k) && vv && typeof vv === 'object') stack.push({ v: vv, d: d + 1 });
        }
        for (let i = keys.length - 1; i >= 0; i--) {
            const k = keys[i];
            if (!allowKeys.has(k)) stack.push({ v: v[k], d: d + 1 });
        }
    }
    return '';
}

function summarizeKeys(data) {
    try {
        if (!data || typeof data !== 'object') return '';
        const top = Object.keys(data).slice(0, 18);
        const ch0 = data?.choices?.[0];
        const chKeys = ch0 && typeof ch0 === 'object' ? Object.keys(ch0).slice(0, 12) : [];
        const msg = ch0?.message;
        const msgKeys = msg && typeof msg === 'object' ? Object.keys(msg).slice(0, 12) : [];
        const obj = typeof data?.object === 'string' ? data.object : '';
        const finish = typeof ch0?.finish_reason === 'string' ? ch0.finish_reason : '';
        const deltaKeys = ch0?.delta && typeof ch0.delta === 'object' ? Object.keys(ch0.delta).slice(0, 12) : [];
        return `object=${obj} finish_reason=${finish} topKeys=${top.join(',')} choices0Keys=${chKeys.join(',')} deltaKeys=${deltaKeys.join(',')} messageKeys=${msgKeys.join(',')}`;
    } catch {
        return '';
    }
}

function tryExtractJsonObject(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    try {
        return JSON.parse(s);
    } catch {
        // continue
    }
    const noFences = s.replace(/```(?:json)?/gi, '').trim();
    const start = noFences.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < noFences.length; i++) {
        const ch = noFences[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') {
            inStr = true;
            continue;
        }
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
        if (depth === 0) {
            const candidate = noFences.slice(start, i + 1);
            try {
                return JSON.parse(candidate);
            } catch {
                return null;
            }
        }
    }
    return null;
}

function tryParseSseChatCompletions(rawText) {
    const s = String(rawText || '');
    if (!s.includes('data:')) return null;
    const lines = s.split(/\r?\n/);
    const chunks = [];
    for (const line of lines) {
        const t = String(line || '').trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
            chunks.push(JSON.parse(payload));
        } catch {
            // ignore malformed chunk
        }
    }
    if (!chunks.length) return null;
    let out = '';
    for (const c of chunks) {
        const piece = extractChatCompletionText(c);
        if (piece) out += piece;
    }
    return out;
}

/**
 * @param {object} profile  Console 内的 activeProfile 对象
 * @param {Array<{role:string,content:string}>} messages
 * @param {object} [options]
 * @param {number} [options.temperature]
 * @param {number} [options.max_tokens]
 * @param {boolean} [options.stream]
 * @param {AbortSignal} [options.signal]
 * @param {object} [options.extraBody] merge 进请求 body
 * @returns {Promise<string>}
 */
export async function callAI(profile, messages, options = {}) {
    const p = normalizeProfile(profile);
    if (!p.endpoint || !p.key) {
        throw new Error('未配置 API（需要 endpoint 与 key）');
    }

    const urls = buildChatCompletionUrlCandidates(p.endpoint);
    if (!urls.length) throw new Error('API endpoint 格式不正确');

    const body = {
        model: p.model,
        messages,
        temperature: options.temperature ?? 0.8,
        stream: options.stream ?? false,
        ...options.extraBody
    };
    if (typeof options.max_tokens === 'number') {
        body.max_tokens = options.max_tokens;
    } else if (typeof profile?.max_tokens === 'number') {
        body.max_tokens = profile.max_tokens;
    } else {
        body.max_tokens = 2000;
    }

    let lastErr = null;

    for (const url of urls) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${p.key}`,
                    ...(options.headers || {})
                },
                body: JSON.stringify(body),
                signal: options.signal
            });

            const rawText = await res.text();
            let data = null;
            try {
                data = rawText ? JSON.parse(rawText) : null;
            } catch {
                // Some gateways always return SSE chunks (chat.completion.chunk)
                const sseText = tryParseSseChatCompletions(rawText);
                if (sseText && String(sseText).trim()) return String(sseText);
                // DeepSeek/Grok/部分网关会返回带前后缀的 JSON，尝试容错提取
                data = tryExtractJsonObject(rawText);
                if (!data) {
                    lastErr = new Error(res.ok ? '响应非 JSON' : `API ${res.status}: ${rawText.slice(0, 200)}`);
                    if (!res.ok && res.status === 404) continue;
                    if (!res.ok) throw lastErr;
                    continue;
                }
            }

            if (!res.ok) {
                const hint = data?.error?.message || rawText.slice(0, 300);
                lastErr = new Error(`API ${res.status}: ${hint}`);
                if (res.status === 404) continue;
                throw lastErr;
            }

            const txt = extractChatCompletionText(data) || deepFindFirstText(data);
            if (txt && String(txt).trim()) return String(txt);

            // 明确报错：方便用户看出网关返回结构
            const hint = summarizeKeys(data);
            throw new Error(
                `API 返回内容为空（已解析 JSON，但未找到可用正文字段）。${hint ? `\n${hint}` : ''}\nraw=${String(rawText || '').slice(0, 420)}`
            );
        } catch (e) {
            if (e?.name === 'AbortError') throw e;
            lastErr = e;
        }
    }

    throw lastErr || new Error('无法连接到 AI 接口');
}

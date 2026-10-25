const ALLOWED_ORIGINS = new Set([
    'https://zinogabriel.github.io',
    'http://localhost:8888',
    'http://127.0.0.1:8888'
]);

function responseHeaders(origin) {
    const headers = {
        'Cache-Control': 'no-store',
        'Vary': 'Origin'
    };
    if (ALLOWED_ORIGINS.has(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    return headers;
}

const jsonResponse = (body, status = 200, origin = '') => Response.json(body, {
    status,
    headers: responseHeaders(origin)
});

function sanitizeSummary(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const categories = Array.isArray(value.categories)
        ? value.categories.slice(0, 12).map(category => ({
            name: String(category?.name || 'Other').slice(0, 60),
            amount: Number(category?.amount)
        })).filter(category => Number.isFinite(category.amount) && category.amount >= 0)
        : [];

    const total = Number(value.total);
    const budget = Number(value.budget);
    const count = Number(value.count);
    if (![total, budget, count].every(Number.isFinite) || total < 0 || budget < 0 || count < 0) return null;

    return {
        currency: /^[A-Z]{3}$/.test(value.currency) ? value.currency : 'NGN',
        period: String(value.period || 'this month').slice(0, 30),
        total,
        budget,
        count: Math.min(Math.floor(count), 100000),
        categories
    };
}

export default async function spendyAdvice(request) {
    const origin = request.headers.get('origin') || '';
    if (request.method === 'OPTIONS') {
        if (!ALLOWED_ORIGINS.has(origin)) return jsonResponse({ error: 'Origin not allowed.' }, 403);
        return new Response(null, {
            status: 204,
            headers: {
                ...responseHeaders(origin),
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Max-Age': '86400'
            }
        });
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin);
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin);

    const apiKey = process.env.GEMINI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!apiKey) return jsonResponse({ error: 'AI advice is not configured yet. Add GEMINI_API_KEY to the Netlify environment and redeploy.' }, 503, origin);
    if (!supabaseUrl || !supabaseAnonKey) {
        return jsonResponse({ error: 'Supabase server verification is not configured in Netlify.' }, 503, origin);
    }

    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return jsonResponse({ error: 'Please sign in to use AI advice.' }, 401, origin);

    try {
        const supabaseBaseUrl = new URL(supabaseUrl);
        if (supabaseBaseUrl.protocol !== 'https:') return jsonResponse({ error: 'Invalid Supabase configuration.' }, 500, origin);

        const authResponse = await fetch(`${supabaseBaseUrl.origin}/auth/v1/user`, {
            headers: {
                apikey: supabaseAnonKey,
                authorization
            },
            signal: AbortSignal.timeout(10000)
        });
        if (!authResponse.ok) return jsonResponse({ error: 'Your session could not be verified. Please sign in again.' }, 401, origin);

        const requestText = await request.text();
        if (requestText.length > 4000) return jsonResponse({ error: 'That request is too large. Please shorten your question.' }, 413, origin);
        const payload = JSON.parse(requestText);
        const question = typeof payload.question === 'string' ? payload.question.trim().slice(0, 400) : '';
        const summary = sanitizeSummary(payload.summary);
        if (!question || !summary) return jsonResponse({ error: 'A question and valid spending summary are required.' }, 400, origin);

        const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        if (!/^gemini-[a-z0-9.-]+$/i.test(model)) return jsonResponse({ error: 'Invalid Gemini model configuration.' }, 500, origin);

        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: 'You are Spendy, a friendly budgeting assistant. Give concise, practical spending insights based only on the aggregate totals provided. Do not invent transactions, shame the user, promise savings, or present this as professional financial or investment advice. If data is insufficient, say so.' }]
                },
                contents: [{
                    role: 'user',
                    parts: [{ text: JSON.stringify({ question, summary }) }]
                }],
                generationConfig: { maxOutputTokens: 300 },
                store: false
            }),
            signal: AbortSignal.timeout(25000)
        });

        if (!geminiResponse.ok) {
            console.error('Gemini request failed with status:', geminiResponse.status);
            return jsonResponse({ error: 'AI advice is temporarily unavailable. Try again shortly.' }, 502, origin);
        }

        const result = await geminiResponse.json();
        const advice = result.candidates?.[0]?.content?.parts
            ?.map(part => part.text || '')
            .join('')
            .trim();
        if (!advice) return jsonResponse({ error: 'Spendy could not create advice for that request.' }, 502, origin);

        return jsonResponse({ advice: advice.slice(0, 2500) }, 200, origin);
    } catch (error) {
        console.error('Spendy AI function error:', error.message);
        return jsonResponse({ error: 'AI advice is temporarily unavailable. Check the site configuration and try again.' }, 502, origin);
    }
}
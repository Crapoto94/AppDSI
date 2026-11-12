/**
 * Cache de réponses « stale-while-revalidate » pour les routes GET lentes (lectures Sedit / Oracle…).
 *
 *  - réponse plus jeune que `ttlMs`            → servie telle quelle ;
 *  - plus ancienne mais < `staleMs`             → servie IMMÉDIATEMENT, et recalculée en arrière-plan pour la requête suivante ;
 *  - absente ou ancienne (> `staleMs`)          → calculée (les demandes concurrentes partagent le même calcul).
 * `?refresh=1` force le recalcul. Réservé aux réponses indépendantes de l'utilisateur (le handler ne doit pas lire req.user).
 * `clear()` vide le cache : à appeler après une écriture. `warm()` permet de préchauffer une entrée (voir les routes).
 */
const stores = new Map();   // espace de noms -> Map(clé -> { ts, status, body, headers })
const inflight = new Map(); // espace:clé -> Promise

function keyOf(req) {
    const q = { ...(req.query || {}) };
    delete q.refresh; delete q.token; delete q._;
    return Object.keys(q).sort().map((k) => `${k}=${q[k]}`).join('&');
}

// Faux objet « res » qui capture la réponse d'un handler Express (res.status().json(), res.set(), res.send()).
function capture() {
    const headers = {};
    let status = 200;
    let resolve;
    const done = new Promise((r) => { resolve = r; });
    const res = {
        get statusCode() { return status; },
        status(c) { status = c; return res; },
        set(k, v) { headers[k] = v; return res; },
        setHeader(k, v) { headers[k] = v; return res; },
        getHeader(k) { return headers[k]; },
        json(body) { resolve({ status, body, headers }); return res; },
        send(body) { resolve({ status, body, headers }); return res; },
    };
    return { res, done };
}

function refresh(namespace, key, handler, reqLike) {
    const id = `${namespace}:${key}`;
    if (inflight.has(id)) return inflight.get(id);
    const { res, done } = capture();
    const p = Promise.resolve()
        .then(() => handler(reqLike, res))
        .then(() => done)
        .then((out) => {
            if (out.status === 200) {
                if (!stores.has(namespace)) stores.set(namespace, new Map());
                stores.get(namespace).set(key, { ts: Date.now(), ...out });
            }
            return out;
        })
        .finally(() => inflight.delete(id));
    // Un handler qui répond en erreur sans exception n'est pas stocké ; une exception remonte à l'appelant
    inflight.set(id, p);
    return p;
}

/** Enveloppe un handler Express : `router.get('/x', auth, swr.wrap('x', handler, { ttlMs }))`. */
function wrap(namespace, handler, { ttlMs = 60 * 1000, staleMs = 6 * 3600 * 1000 } = {}) {
    return async (req, res) => {
        const key = keyOf(req);
        const force = req.query && req.query.refresh === '1';
        const hit = stores.get(namespace) && stores.get(namespace).get(key);
        const age = hit ? Date.now() - hit.ts : Infinity;
        const reqLike = (refreshFlag) => ({ query: { ...(req.query || {}), ...(refreshFlag ? { refresh: '1' } : {}) }, params: req.params || {}, headers: req.headers || {}, user: req.user, method: 'GET', body: {} });

        if (!force && hit && age < staleMs) {
            res.set('X-Cache', age < ttlMs ? 'hit' : 'stale');
            if (hit.headers['X-Source']) res.set('X-Source', hit.headers['X-Source']);
            if (age >= ttlMs) refresh(namespace, key, handler, reqLike(true)).catch((e) => console.warn(`[SWR ${namespace}] rafraîchissement :`, e.message));
            return res.status(hit.status).json(hit.body);
        }
        try {
            const out = await refresh(namespace, key, handler, reqLike(force));
            res.set('X-Cache', 'miss');
            if (out.headers['X-Source']) res.set('X-Source', out.headers['X-Source']);
            return res.status(out.status).json(out.body);
        } catch (e) {
            console.error(`[SWR ${namespace}]`, e.message);
            return res.status(500).json({ message: e.message });
        }
    };
}

/** Préchauffe une entrée (même clé que celle d'une vraie requête avec cette query). */
function warm(namespace, handler, query) {
    const key = keyOf({ query });
    return refresh(namespace, key, handler, { query: { ...query, refresh: '1' }, params: {}, headers: {}, user: null, method: 'GET', body: {} });
}

/** Vide le cache (tous les espaces, ou un seul). */
function clear(namespace) {
    if (namespace) stores.delete(namespace); else stores.clear();
}

module.exports = { wrap, warm, clear };

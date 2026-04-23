// ============================================================================
// Reddit adapter — real OAuth2 + search + submit.
//
// Required env vars (all four must be set, else falls back to mock):
//   REDDIT_CLIENT_ID       — script-app client id from reddit.com/prefs/apps
//   REDDIT_CLIENT_SECRET   — script-app client secret
//   REDDIT_REFRESH_TOKEN   — long-lived refresh token from initial OAuth dance
//   REDDIT_USER_AGENT      — REQUIRED by Reddit, e.g. "MyCarConcierge/1.0 by u/your_handle"
//
// Channel usage:
//   social_channels.handle           = subreddit name without "r/" (e.g. "cars").
//                                       null = sitewide search.
//   social_channels.monitor_keywords = OR-joined query terms.
//   social_channels.config.flair     = optional flair text for submissions.
//
// monitor() returns lead-shaped rows; publish() submits a self-post and
// returns { external_post_id, url }.
// ============================================================================

const REDDIT_OAUTH = 'https://oauth.reddit.com';
const REDDIT_TOKEN = 'https://www.reddit.com/api/v1/access_token';

function isLive() {
  return Boolean(
    process.env.REDDIT_CLIENT_ID &&
    process.env.REDDIT_CLIENT_SECRET &&
    process.env.REDDIT_REFRESH_TOKEN &&
    process.env.REDDIT_USER_AGENT
  );
}

// Cache the access token across invocations within a single function instance.
let _tokenCache = { token: null, expires_at: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (_tokenCache.token && now < _tokenCache.expires_at - 30_000) {
    return _tokenCache.token;
  }
  const basic = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.REDDIT_REFRESH_TOKEN
  }).toString();

  const r = await fetch(REDDIT_TOKEN, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT
    },
    body
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`reddit_token_failed status=${r.status} body=${t.slice(0, 200)}`);
  }
  const j = await r.json();
  if (!j.access_token) throw new Error('reddit_token_missing_access_token');
  _tokenCache = {
    token: j.access_token,
    expires_at: now + (j.expires_in || 3600) * 1000
  };
  return _tokenCache.token;
}

async function redditFetch(path, init = {}) {
  const token = await getAccessToken();
  const headers = Object.assign({
    'Authorization': `Bearer ${token}`,
    'User-Agent': process.env.REDDIT_USER_AGENT
  }, init.headers || {});
  return fetch(REDDIT_OAUTH + path, Object.assign({}, init, { headers }));
}

// ---- monitor ---------------------------------------------------------------
// Reddit search: q=keyword(s), sort=new, t=hour, restrict_sr=on for in-sub.
async function monitor({ keywords = [], handle = null, limit = 25, since = null } = {}) {
  if (!keywords.length) return [];
  const q = keywords.map(k => `"${k.replace(/"/g, '')}"`).join(' OR ');
  const params = new URLSearchParams({
    q, sort: 'new', t: 'hour', limit: String(Math.min(limit, 100)), type: 'link'
  });
  let path;
  if (handle) {
    params.set('restrict_sr', 'on');
    path = `/r/${encodeURIComponent(handle)}/search?${params}`;
  } else {
    path = `/search?${params}`;
  }
  const r = await redditFetch(path);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`reddit_search_failed status=${r.status} body=${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const children = (j && j.data && Array.isArray(j.data.children)) ? j.data.children : [];
  const sinceMs = since ? new Date(since).getTime() : 0;

  return children
    .map(c => c.data)
    .filter(d => d && d.id && (!sinceMs || (d.created_utc * 1000) >= sinceMs))
    .map(d => ({
      external_id: `t3_${d.id}`,
      profile_url: `https://www.reddit.com/user/${d.author}`,
      author_handle: d.author ? `u/${d.author}` : null,
      text: [d.title || '', d.selftext || ''].filter(Boolean).join('\n\n').slice(0, 4000),
      posted_at: new Date(d.created_utc * 1000).toISOString(),
      context: {
        platform: 'reddit',
        subreddit: d.subreddit,
        permalink: `https://www.reddit.com${d.permalink}`,
        score: d.score,
        num_comments: d.num_comments,
        link_flair_text: d.link_flair_text || null,
        is_self: !!d.is_self
      }
    }));
}

// ---- publish ---------------------------------------------------------------
// Reddit /api/submit, kind=self (text post). Title = first 300 chars of body
// (Reddit hard-caps at 300); the full body lands in the selftext.
async function publish({ body, channel = null } = {}) {
  if (!body || !body.trim()) throw new Error('reddit_publish_empty_body');
  if (!channel || !channel.handle) throw new Error('reddit_publish_no_subreddit (channel.handle required)');

  const lines = body.trim().split('\n');
  const titleSource = lines[0] || body;
  const title = titleSource.slice(0, 300);
  const selftext = body.length > title.length ? body : body;

  const form = new URLSearchParams({
    sr: channel.handle,
    kind: 'self',
    title,
    text: selftext,
    api_type: 'json',
    sendreplies: 'true',
    resubmit: 'true'
  });
  if (channel.config && channel.config.flair) {
    form.set('flair_text', String(channel.config.flair));
  }

  const r = await redditFetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`reddit_submit_failed status=${r.status} body=${t.slice(0, 300)}`);
  }
  const j = await r.json();
  // Reddit returns { json: { errors: [...], data: { url, id, name, drafts_count } } }
  const errors = j && j.json && j.json.errors;
  if (Array.isArray(errors) && errors.length) {
    throw new Error('reddit_submit_errors: ' + JSON.stringify(errors));
  }
  const data = j && j.json && j.json.data;
  if (!data || !data.id) throw new Error('reddit_submit_no_id');
  return {
    external_post_id: data.name || `t3_${data.id}`,
    url: data.url || `https://www.reddit.com/r/${channel.handle}/comments/${data.id}/`,
    raw: data
  };
}

module.exports = { isLive, monitor, publish };

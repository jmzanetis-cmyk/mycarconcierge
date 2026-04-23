// ============================================================================
// Social-media plug-in channel adapters
//
// Each platform exports the same two-method shape so the Hunter monitor cron
// and the Promoter publish path stay platform-agnostic. Adapters fall back to
// MOCK MODE when the relevant credentials env vars aren't set — that lets us
// ship the agents safely without real social accounts wired up. Real API
// integration for each platform is intentionally a follow-up (each platform
// has its own auth dance worth its own task).
//
//   monitor({ keywords, since, limit })
//     → returns [{ external_id, profile_url, author_handle, text, posted_at,
//                  context }]
//
//   publish({ body, media_urls, channel })
//     → returns { external_post_id, url } on success, or throws.
//
// All adapters are pure: no DB writes, no events. The caller decides what to
// persist.
// ============================================================================

const PLATFORM_KEYWORD_HINTS = {
  reddit: ['mechanic', 'recommendation', 'check engine', 'oil change', 'shop near me'],
  x: ['need a mechanic', 'car broke', 'tow truck'],
  facebook: ['recommend a mechanic', 'auto shop near'],
  instagram: ['cartok', 'mechanic life', 'shop owner'],
  tiktok: ['carcare', 'mechanictiktok'],
  linkedin: ['auto shop owner', 'service writer', 'fleet manager']
};

function mockMonitor(platform, { keywords = [], limit = 5 } = {}) {
  // Deterministic-ish stub so the same input doesn't generate dupes within
  // a short window — uses the current 15-min bucket as the seed.
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const samples = [
    {
      author_handle: `${platform}_user_${bucket}_a`,
      text: `Anyone know a good mechanic in Austin? My check engine light came on. ${keywords[0] || PLATFORM_KEYWORD_HINTS[platform][0]}`,
      lead_hint: 'member'
    },
    {
      author_handle: `${platform}_shop_${bucket}_b`,
      text: `Independent shop owner here, looking for a better way to manage quotes. Anyone using a marketplace?`,
      lead_hint: 'provider'
    },
    {
      author_handle: `${platform}_user_${bucket}_c`,
      text: `Just got quoted $1200 for brakes. Is that high? Looking for a second opinion.`,
      lead_hint: 'member'
    }
  ].slice(0, limit);

  return samples.map((s, i) => ({
    external_id: `mock-${platform}-${bucket}-${i}`,
    profile_url: `https://${platform}.example.com/u/${s.author_handle}`,
    author_handle: s.author_handle,
    text: s.text,
    posted_at: new Date(bucket * 15 * 60 * 1000 + i * 1000).toISOString(),
    context: { mock: true, lead_hint: s.lead_hint, platform }
  }));
}

function mockPublish(platform, { body }) {
  const id = `mock-${platform}-${Date.now()}`;
  return {
    external_post_id: id,
    url: `https://${platform}.example.com/post/${id}`,
    body_preview: body.slice(0, 80),
    mock: true
  };
}

function makeAdapter(platform, opts) {
  return {
    platform,
    isLive() { return Boolean(process.env[opts.credEnv]); },
    async monitor(args) {
      // Real implementation goes here once creds are wired. For now mock.
      if (!this.isLive()) return mockMonitor(platform, args);
      // TODO: real API call. Until then we still mock — flip back to real
      // path here per-platform as integration tasks land.
      return mockMonitor(platform, args);
    },
    async publish(args) {
      if (!this.isLive()) return mockPublish(platform, args);
      return mockPublish(platform, args);
    }
  };
}

// Real Reddit adapter — falls back to mock when creds aren't all set.
const reddit = require('./social-adapter-reddit');
const redditAdapter = {
  platform: 'reddit',
  isLive() { return reddit.isLive(); },
  async monitor(args) {
    if (!reddit.isLive()) return mockMonitor('reddit', args);
    try { return await reddit.monitor(args); }
    catch (e) { console.warn('[reddit-adapter] monitor failed, mock fallback:', e.message); return mockMonitor('reddit', args); }
  },
  async publish(args) {
    if (!reddit.isLive()) return mockPublish('reddit', args);
    return reddit.publish(args); // throw on real-mode failure — operator sees it
  }
};

const ADAPTERS = {
  reddit:    redditAdapter,
  x:         makeAdapter('x',         { credEnv: 'X_BEARER_TOKEN' }),
  facebook:  makeAdapter('facebook',  { credEnv: 'FACEBOOK_PAGE_TOKEN' }),
  instagram: makeAdapter('instagram', { credEnv: 'INSTAGRAM_ACCESS_TOKEN' }),
  tiktok:    makeAdapter('tiktok',    { credEnv: 'TIKTOK_ACCESS_TOKEN' }),
  linkedin:  makeAdapter('linkedin',  { credEnv: 'LINKEDIN_ACCESS_TOKEN' })
};

function getAdapter(platform) {
  const a = ADAPTERS[platform];
  if (!a) throw new Error(`Unknown social platform: ${platform}`);
  return a;
}

function listAdapters() {
  return Object.keys(ADAPTERS).map(p => ({
    platform: p,
    live: ADAPTERS[p].isLive()
  }));
}

module.exports = { getAdapter, listAdapters, PLATFORM_KEYWORD_HINTS };

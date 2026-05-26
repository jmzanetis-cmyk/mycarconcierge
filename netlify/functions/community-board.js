// GET  /api/community-board — list crowd-funded service packages needing community support
// POST /api/community-board — create a new community funding request
const { createClient } = require('@supabase/supabase-js');

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  if (event.httpMethod === 'GET') {
    // Fetch crowd-funded packages with member info and contribution totals
    const { data: packages, error } = await sb.rpc('get_community_board').catch(() => ({ data: null, error: 'rpc' }));

    // Fallback: manual join if RPC not available
    const { data: pkgs } = await sb.from('maintenance_packages')
      .select(`
        id, title, description, member_id, category,
        funding_goal_cents, created_at,
        vehicles!maintenance_packages_vehicle_id_fkey(year, make, model)
      `)
      .eq('crowd_funded', true)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!pkgs) return json(200, { packages: [] });

    // Fetch member names and contribution aggregates in parallel
    const memberIds = [...new Set(pkgs.map(p => p.member_id).filter(Boolean))];
    const packageIds = pkgs.map(p => p.id);

    const [profilesRes, contribRes] = await Promise.all([
      sb.from('profiles').select('id, full_name').in('id', memberIds),
      sb.from('crowd_fund_contributions')
        .select('package_id, amount_cents')
        .in('package_id', packageIds)
        .eq('status', 'completed'),
    ]);

    const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));
    const contribMap = {};
    for (const c of (contribRes.data || [])) {
      if (!contribMap[c.package_id]) contribMap[c.package_id] = { total: 0, count: 0 };
      contribMap[c.package_id].total += c.amount_cents;
      contribMap[c.package_id].count += 1;
    }

    const enriched = pkgs.map(pkg => {
      const profile = profileMap[pkg.member_id] || {};
      const contrib = contribMap[pkg.id] || { total: 0, count: 0 };
      const v = pkg.vehicles;
      return {
        id: pkg.id,
        title: pkg.title,
        description: pkg.description,
        member_id: pkg.member_id,
        member_name: profile.full_name || 'A member',
        member_first_name: (profile.full_name || '').split(' ')[0] || 'A member',
        vehicle_label: v ? `${v.year} ${v.make} ${v.model}` : null,
        category: pkg.category,
        funding_goal_cents: pkg.funding_goal_cents,
        raised_cents: contrib.total,
        contributor_count: contrib.count,
        created_at: pkg.created_at,
      };
    });

    return json(200, { packages: enriched });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
    const { title, description, vehicle_id, category, funding_goal_cents } = body;
    if (!title) return json(400, { error: 'title required' });

    const { data: pkg, error } = await sb.from('maintenance_packages').insert({
      title,
      description,
      vehicle_id: vehicle_id || null,
      member_id: auth.user.id,
      category: category || 'general',
      funding_goal_cents: funding_goal_cents || null,
      crowd_funded: true,
      status: 'open',
    }).select('id').single();

    if (error) return json(500, { error: error.message });
    return json(201, { success: true, id: pkg.id });
  }

  return json(405, { error: 'Method not allowed' });
};

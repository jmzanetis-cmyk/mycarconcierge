const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); if (body.length > 50000) reject(new Error('Too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch(e) { reject(new Error('Invalid JSON')); } });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(data));
}

async function authenticate(req, res, getSupabaseClient) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '');
  if (!token) { json(res, 401, { error: 'Authentication required' }); return null; }
  const supabase = getSupabaseClient();
  if (!supabase) { json(res, 500, { error: 'Auth service unavailable' }); return null; }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) { json(res, 401, { error: 'Invalid or expired token' }); return null; }
  return user;
}

async function getProviderClub(db, userId) {
  const result = await db.query('SELECT * FROM car_clubs WHERE provider_id = $1', [userId]);
  return result.rows[0] || null;
}

function parseMultipartUpload(req) {
  return new Promise((resolve, reject) => {
    let body = Buffer.alloc(0);
    let totalSize = 0;
    const MAX_SIZE = 2 * 1024 * 1024;
    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) { reject(new Error('File too large (max 2MB)')); return; }
      body = Buffer.concat([body, chunk]);
    });
    req.on('end', () => {
      try {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) { reject(new Error('No boundary')); return; }
        const boundary = boundaryMatch[1];
        const parts = body.toString('binary').split('--' + boundary);
        let file = null, filename = '', fileContentType = '';
        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const headers = part.substring(0, headerEnd);
          const content = part.substring(headerEnd + 4, part.lastIndexOf('\r\n'));
          if (headers.includes('filename=')) {
            const fnMatch = headers.match(/filename="([^"]+)"/);
            if (fnMatch) filename = fnMatch[1];
            const ctMatch = headers.match(/Content-Type:\s*(.+)/i);
            if (ctMatch) fileContentType = ctMatch[1].trim();
            file = Buffer.from(content, 'binary');
          }
        }
        if (!file || !filename) { reject(new Error('No file found')); return; }
        resolve({ file, filename, contentType: fileContentType });
      } catch(e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = function handleCarClubRequest(req, res, { getSupabaseClient }) {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/car-club/')) return false;

  const method = req.method;
  const db = getPool();

  const handle = async () => {
    try {
      if (method === 'GET' && url === '/api/car-club/reward-templates') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const result = await db.query('SELECT * FROM reward_type_templates WHERE is_active = true ORDER BY sort_order ASC');
        json(res, 200, { templates: result.rows });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/my-club') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 200, { club: null }); return; }
        const rulesResult = await db.query('SELECT cr.*, rt.slug as template_slug, rt.icon as template_icon FROM club_reward_rules cr JOIN reward_type_templates rt ON cr.template_id = rt.id WHERE cr.club_id = $1 ORDER BY cr.created_at DESC', [club.id]);
        const memberCount = await db.query('SELECT COUNT(*) as count FROM club_memberships WHERE club_id = $1 AND is_active = true', [club.id]);
        json(res, 200, { club: { ...club, reward_rules: rulesResult.rows, member_count: Number.parseInt(memberCount.rows[0].count) } });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/create') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const existing = await getProviderClub(db, user.id);
        if (existing) { json(res, 409, { error: 'You already have a club' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.name) { json(res, 400, { error: 'Club name is required' }); return; }
        const result = await db.query(
          'INSERT INTO car_clubs (provider_id, name, description, welcome_message, theme_color, rules_text) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [user.id, body.name, body.description || null, body.welcome_message || null, body.theme_color || '#C9A84C', body.rules_text || null]
        );
        json(res, 201, { club: result.rows[0] });
        return;
      }

      if (method === 'PUT' && url === '/api/car-club/update') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (body.logo_url !== undefined && body.logo_url !== '' && !/^https?:\/\/.+/.test(body.logo_url)) { json(res, 400, { error: 'Invalid logo URL' }); return; }
        if (body.banner_url !== undefined && body.banner_url !== '' && !/^https?:\/\/.+/.test(body.banner_url)) { json(res, 400, { error: 'Invalid banner URL' }); return; }
        const fields = [];
        const values = [];
        let idx = 1;
        if (body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(body.name); }
        if (body.description !== undefined) { fields.push(`description = $${idx++}`); values.push(body.description); }
        if (body.welcome_message !== undefined) { fields.push(`welcome_message = $${idx++}`); values.push(body.welcome_message); }
        if (body.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(body.is_active); }
        if (body.logo_url !== undefined) { fields.push(`logo_url = $${idx++}`); values.push(body.logo_url); }
        if (body.banner_url !== undefined) { fields.push(`banner_url = $${idx++}`); values.push(body.banner_url || null); }
        if (body.theme_color !== undefined) { fields.push(`theme_color = $${idx++}`); values.push(body.theme_color || '#C9A84C'); }
        if (body.rules_text !== undefined) { fields.push(`rules_text = $${idx++}`); values.push(body.rules_text || null); }
        if (fields.length === 0) { json(res, 400, { error: 'No fields to update' }); return; }
        fields.push(`updated_at = NOW()`);
        values.push(club.id);
        const result = await db.query(`UPDATE car_clubs SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        json(res, 200, { club: result.rows[0] });
        return;
      }

      if (method === 'PUT' && url === '/api/car-club/update-logo') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (body.logo_url === undefined) { json(res, 400, { error: 'logo_url is required' }); return; }
        if (body.logo_url && !/^https?:\/\/.+/.test(body.logo_url)) { json(res, 400, { error: 'Invalid logo URL' }); return; }
        const result = await db.query('UPDATE car_clubs SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [body.logo_url, club.id]);
        json(res, 200, { club: result.rows[0] });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/upload-logo') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        let upload;
        try { upload = await parseMultipartUpload(req); } catch(e) { json(res, 400, { error: e.message || 'Upload failed' }); return; }
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(upload.contentType)) { json(res, 400, { error: 'Invalid file type. Allowed: PNG, JPEG, WebP' }); return; }
        const supabase = getSupabaseClient();
        if (!supabase) { json(res, 500, { error: 'Storage service unavailable' }); return; }
        try {
          await supabase.storage.createBucket('club-logos', { public: true, fileSizeLimit: 2097152 });
        } catch(e) {}
        const safeName = upload.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${club.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('club-logos').upload(filePath, upload.file, { contentType: upload.contentType, upsert: true });
        if (uploadError) { json(res, 500, { error: 'Failed to upload file: ' + uploadError.message }); return; }
        const { data: urlData } = supabase.storage.from('club-logos').getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;
        const updateResult = await db.query('UPDATE car_clubs SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [publicUrl, club.id]);
        json(res, 200, { club: updateResult.rows[0], logo_url: publicUrl });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/upload-banner') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        let upload;
        try { upload = await parseMultipartUpload(req); } catch(e) { json(res, 400, { error: e.message || 'Upload failed' }); return; }
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(upload.contentType)) { json(res, 400, { error: 'Invalid file type. Allowed: PNG, JPEG, WebP' }); return; }
        const supabase = getSupabaseClient();
        if (!supabase) { json(res, 500, { error: 'Storage service unavailable' }); return; }
        try { await supabase.storage.createBucket('club-banners', { public: true, fileSizeLimit: 3145728 }); } catch(e) {}
        const safeName = upload.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${club.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('club-banners').upload(filePath, upload.file, { contentType: upload.contentType, upsert: true });
        if (uploadError) { json(res, 500, { error: 'Failed to upload file: ' + uploadError.message }); return; }
        const { data: urlData } = supabase.storage.from('club-banners').getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;
        const updateResult = await db.query('UPDATE car_clubs SET banner_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [publicUrl, club.id]);
        json(res, 200, { club: updateResult.rows[0], banner_url: publicUrl });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/leaderboard') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const result = await db.query(
          `SELECT cm.member_id, SUM(mcb.punch_count) as total_punches, SUM(mcb.visit_count) as total_visits, cm.joined_at
           FROM club_memberships cm
           LEFT JOIN member_club_balances mcb ON mcb.membership_id = cm.id
           WHERE cm.club_id = $1 AND cm.is_active = true
           GROUP BY cm.id, cm.member_id, cm.joined_at
           ORDER BY total_punches DESC NULLS LAST
           LIMIT 20`,
          [club.id]
        );
        json(res, 200, { leaderboard: result.rows });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/members') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const result = await db.query(
          `SELECT cm.id as membership_id, cm.member_id, cm.joined_at, cm.is_active,
           COALESCE(json_agg(json_build_object(
             'reward_rule_id', mcb.reward_rule_id,
             'punch_count', mcb.punch_count,
             'total_spend', mcb.total_spend,
             'visit_count', mcb.visit_count,
             'points_balance', mcb.points_balance,
             'last_activity_at', mcb.last_activity_at
           )) FILTER (WHERE mcb.id IS NOT NULL), '[]') as balances
           FROM club_memberships cm
           LEFT JOIN member_club_balances mcb ON mcb.membership_id = cm.id
           WHERE cm.club_id = $1
           GROUP BY cm.id, cm.member_id, cm.joined_at, cm.is_active
           ORDER BY cm.joined_at DESC`,
          [club.id]
        );
        json(res, 200, { members: result.rows });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/activity') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const result = await db.query(
          `SELECT cal.* FROM club_activity_log cal
           JOIN club_memberships cm ON cm.id = cal.membership_id
           WHERE cm.club_id = $1
           ORDER BY cal.created_at DESC LIMIT 100`,
          [club.id]
        );
        json(res, 200, { activity: result.rows });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/rewards') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.template_id || !body.name || !body.parameters) { json(res, 400, { error: 'template_id, name, and parameters are required' }); return; }
        const activeCount = await db.query('SELECT COUNT(*) as count FROM club_reward_rules WHERE club_id = $1 AND is_active = true', [club.id]);
        if (Number.parseInt(activeCount.rows[0].count) >= 3) { json(res, 400, { error: 'Maximum 3 active reward rules per club' }); return; }
        const insertFields = ['club_id', 'template_id', 'name', 'description', 'parameters'];
        const insertValues = [club.id, body.template_id, body.name, body.description || null, JSON.stringify(body.parameters)];
        if (body.valid_until) { insertFields.push('valid_until'); insertValues.push(body.valid_until); }
        const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
        const result = await db.query(
          `INSERT INTO club_reward_rules (${insertFields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
          insertValues
        );
        json(res, 201, { reward_rule: result.rows[0] });
        return;
      }

      const rewardMatch = url.match(/^\/api\/car-club\/rewards\/([^/]+)$/);
      if (rewardMatch && (method === 'PUT' || method === 'DELETE')) {
        const ruleId = rewardMatch[1];
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const existing = await db.query('SELECT * FROM club_reward_rules WHERE id = $1 AND club_id = $2', [ruleId, club.id]);
        if (existing.rows.length === 0) { json(res, 404, { error: 'Reward rule not found' }); return; }

        if (method === 'DELETE') {
          const result = await db.query('UPDATE club_reward_rules SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *', [ruleId]);
          json(res, 200, { reward_rule: result.rows[0] });
          return;
        }

        if (method === 'PUT') {
          let body;
          try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
          if (body.is_active === true && !existing.rows[0].is_active) {
            const activeCount = await db.query('SELECT COUNT(*) FROM club_reward_rules WHERE club_id = $1 AND is_active = true', [club.id]);
            if (Number.parseInt(activeCount.rows[0].count) >= 3) {
              json(res, 400, { error: 'Maximum 3 active reward rules allowed. Deactivate one first.' });
              return;
            }
          }
          if (body.parameters && body.parameters.punches_required !== undefined) {
            const pr = Number.parseInt(body.parameters.punches_required);
            if (!pr || pr < 1) { json(res, 400, { error: 'punches_required must be at least 1' }); return; }
          }
          const fields = [];
          const values = [];
          let idx = 1;
          if (body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(body.name); }
          if (body.description !== undefined) { fields.push(`description = $${idx++}`); values.push(body.description); }
          if (body.parameters !== undefined) { fields.push(`parameters = $${idx++}`); values.push(JSON.stringify(body.parameters)); }
          if (body.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(body.is_active); }
          if (body.max_redemptions_per_member !== undefined) { fields.push(`max_redemptions_per_member = $${idx++}`); values.push(body.max_redemptions_per_member); }
          if (body.valid_from !== undefined) { fields.push(`valid_from = $${idx++}`); values.push(body.valid_from); }
          if (body.valid_until !== undefined) { fields.push(`valid_until = $${idx++}`); values.push(body.valid_until); }
          if (fields.length === 0) { json(res, 400, { error: 'No fields to update' }); return; }
          fields.push(`updated_at = NOW()`);
          values.push(ruleId);
          const result = await db.query(`UPDATE club_reward_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
          json(res, 200, { reward_rule: result.rows[0] });
          return;
        }
      }

      if (method === 'GET' && url === '/api/car-club/browse') {
        const result = await db.query(
          `SELECT c.id, c.provider_id, c.name, c.description, c.logo_url, c.banner_url, c.theme_color, c.welcome_message, c.rules_text, c.created_at,
           p.bgc_badge_verified, p.bgc_compliant_employees, p.bgc_total_employees, p.bgc_last_computed_at,
           (SELECT COUNT(*) FROM club_memberships WHERE club_id = c.id AND is_active = true) as member_count,
           (SELECT COUNT(*) FROM club_reward_rules WHERE club_id = c.id AND is_active = true) as reward_count
           FROM car_clubs c
           LEFT JOIN profiles p ON p.id = c.provider_id
           WHERE c.is_active = true AND c.provider_suspended = false ORDER BY c.created_at DESC`
        );
        json(res, 200, { clubs: result.rows });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/join') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.club_id) { json(res, 400, { error: 'club_id is required' }); return; }
        const clubCheck = await db.query('SELECT id, provider_suspended FROM car_clubs WHERE id = $1 AND is_active = true', [body.club_id]);
        if (clubCheck.rows.length === 0) { json(res, 404, { error: 'Club not found or inactive' }); return; }
        if (clubCheck.rows[0].provider_suspended) { json(res, 403, { error: 'This provider\'s club is temporarily unavailable' }); return; }
        const existingMembership = await db.query('SELECT id, is_active FROM club_memberships WHERE club_id = $1 AND member_id = $2', [body.club_id, user.id]);
        if (existingMembership.rows.length > 0) {
          if (existingMembership.rows[0].is_active) { json(res, 409, { error: 'Already a member of this club' }); return; }
          await db.query('UPDATE club_memberships SET is_active = true, joined_at = NOW() WHERE id = $1', [existingMembership.rows[0].id]);
          json(res, 200, { message: 'Rejoined club successfully' });
          return;
        }
        const membership = await db.query('INSERT INTO club_memberships (club_id, member_id) VALUES ($1, $2) RETURNING *', [body.club_id, user.id]);
        const activeRules = await db.query('SELECT id FROM club_reward_rules WHERE club_id = $1 AND is_active = true', [body.club_id]);
        for (const rule of activeRules.rows) {
          await db.query('INSERT INTO member_club_balances (membership_id, reward_rule_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [membership.rows[0].id, rule.id]);
        }
        json(res, 201, { membership: membership.rows[0] });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/leave') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.club_id) { json(res, 400, { error: 'club_id is required' }); return; }
        const result = await db.query('UPDATE club_memberships SET is_active = false WHERE club_id = $1 AND member_id = $2 AND is_active = true RETURNING id', [body.club_id, user.id]);
        if (result.rows.length === 0) { json(res, 404, { error: 'Membership not found' }); return; }
        json(res, 200, { message: 'Left club successfully' });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/my-clubs') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const result = await db.query(
          `SELECT cm.id as membership_id, cm.joined_at, cm.is_active,
           c.id as club_id, c.provider_id, c.name, c.description, c.logo_url, c.banner_url, c.theme_color, c.rules_text, c.provider_suspended,
           p.bgc_badge_verified, p.bgc_compliant_employees, p.bgc_total_employees, p.bgc_last_computed_at,
           COALESCE(json_agg(json_build_object(
             'reward_rule_id', mcb.reward_rule_id,
             'punch_count', mcb.punch_count,
             'total_spend', mcb.total_spend,
             'visit_count', mcb.visit_count,
             'points_balance', mcb.points_balance,
             'last_activity_at', mcb.last_activity_at
           )) FILTER (WHERE mcb.id IS NOT NULL), '[]') as balances
           FROM club_memberships cm
           JOIN car_clubs c ON c.id = cm.club_id
           LEFT JOIN profiles p ON p.id = c.provider_id
           LEFT JOIN member_club_balances mcb ON mcb.membership_id = cm.id
           WHERE cm.member_id = $1 AND cm.is_active = true
           GROUP BY cm.id, cm.joined_at, cm.is_active, c.id, c.provider_id, c.name, c.description, c.logo_url, c.banner_url, c.provider_suspended,
                    p.bgc_badge_verified, p.bgc_compliant_employees, p.bgc_total_employees, p.bgc_last_computed_at
           ORDER BY cm.joined_at DESC`,
          [user.id]
        );
        json(res, 200, { clubs: result.rows });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/my-rewards') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const result = await db.query(
          `SELECT crr.id, crr.status, crr.unlocked_at, crr.created_at,
           rr.name as reward_name, rr.description as reward_description, rr.parameters,
           c.name as club_name, c.id as club_id,
           rt.slug as template_slug, rt.icon as template_icon
           FROM club_reward_redemptions crr
           JOIN club_memberships cm ON cm.id = crr.membership_id
           JOIN club_reward_rules rr ON rr.id = crr.reward_rule_id
           JOIN car_clubs c ON c.id = cm.club_id
           JOIN reward_type_templates rt ON rt.id = rr.template_id
           WHERE cm.member_id = $1 AND crr.status = 'available'
           ORDER BY crr.unlocked_at DESC`,
          [user.id]
        );
        json(res, 200, { rewards: result.rows });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/log-activity') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        if (club.provider_suspended) { json(res, 403, { error: 'Your club is suspended. Activity logging is disabled.' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.member_id || !body.reward_rule_id || !body.activity_type) { json(res, 400, { error: 'member_id, reward_rule_id, and activity_type are required' }); return; }
        const membership = await db.query('SELECT id FROM club_memberships WHERE club_id = $1 AND member_id = $2 AND is_active = true', [club.id, body.member_id]);
        if (membership.rows.length === 0) { json(res, 404, { error: 'Member not found in your club' }); return; }
        const membershipId = membership.rows[0].id;
        const rule = await db.query('SELECT cr.*, rt.slug as template_slug FROM club_reward_rules cr JOIN reward_type_templates rt ON rt.id = cr.template_id WHERE cr.id = $1 AND cr.club_id = $2 AND cr.is_active = true', [body.reward_rule_id, club.id]);
        if (rule.rows.length === 0) { json(res, 404, { error: 'Reward rule not found' }); return; }
        const rewardRule = rule.rows[0];

        await db.query(
          'INSERT INTO club_activity_log (membership_id, reward_rule_id, activity_type, quantity, amount, description) VALUES ($1, $2, $3, $4, $5, $6)',
          [membershipId, body.reward_rule_id, body.activity_type, body.quantity || 1, body.amount || null, body.description || null]
        );

        let balanceRow = await db.query('SELECT * FROM member_club_balances WHERE membership_id = $1 AND reward_rule_id = $2', [membershipId, body.reward_rule_id]);
        if (balanceRow.rows.length === 0) {
          await db.query('INSERT INTO member_club_balances (membership_id, reward_rule_id) VALUES ($1, $2)', [membershipId, body.reward_rule_id]);
          balanceRow = await db.query('SELECT * FROM member_club_balances WHERE membership_id = $1 AND reward_rule_id = $2', [membershipId, body.reward_rule_id]);
        }
        const balance = balanceRow.rows[0];
        const qty = body.quantity || 1;

        let redemptionCreated = false;

        if (rewardRule.template_slug === 'punch_card') {
          const activePromo = await db.query(
            'SELECT punch_multiplier FROM club_promotions WHERE club_id = $1 AND is_active = true AND NOW() BETWEEN starts_at AND ends_at ORDER BY punch_multiplier DESC LIMIT 1',
            [club.id]
          );
          const multiplier = activePromo.rows.length > 0 ? (Number.parseInt(activePromo.rows[0].punch_multiplier) || 1) : 1;
          const effectiveQty = qty * multiplier;
          const newPunchCount = (balance.punch_count || 0) + effectiveQty;
          await db.query('UPDATE member_club_balances SET punch_count = $1, last_activity_at = NOW(), updated_at = NOW() WHERE id = $2', [newPunchCount, balance.id]);
          const punchesRequired = Math.max(Number.parseInt(rewardRule.parameters.punches_required) || 1, 1);
          const threshold75 = Math.ceil(punchesRequired * 0.75);
          if (newPunchCount >= threshold75 && newPunchCount < punchesRequired) {
            const existingAlert = await db.query(
              `SELECT id FROM notification_queue WHERE user_id = $1 AND type = 'progress_alert' AND data->>'reward_rule_id' = $2 AND created_at > NOW() - INTERVAL '24 hours'`,
              [body.member_id, body.reward_rule_id]
            );
            if (existingAlert.rows.length === 0) {
              const remaining = punchesRequired - newPunchCount;
              await db.query(
                'INSERT INTO notification_queue (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)',
                [body.member_id, 'progress_alert', 'Almost There!', `You're ${remaining} punch${remaining !== 1 ? 'es' : ''} away from earning: ${rewardRule.name}`, JSON.stringify({ club_id: club.id, reward_rule_id: body.reward_rule_id, membership_id: membershipId })]
              );
            }
          }
          if (newPunchCount >= punchesRequired) {
            const existingAvailable = await db.query(
              'SELECT COUNT(*) FROM club_reward_redemptions WHERE membership_id = $1 AND reward_rule_id = $2 AND status = $3',
              [membershipId, body.reward_rule_id, 'available']
            );
            if (Number.parseInt(existingAvailable.rows[0].count) === 0) {
              await db.query(
                'INSERT INTO club_reward_redemptions (membership_id, reward_rule_id, status) VALUES ($1, $2, $3)',
                [membershipId, body.reward_rule_id, 'available']
              );
              redemptionCreated = true;
              await db.query(
                'INSERT INTO notification_queue (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)',
                [body.member_id, 'reward_unlocked', 'Reward Unlocked!', `You earned: ${rewardRule.name}`, JSON.stringify({ club_id: club.id, reward_rule_id: body.reward_rule_id })]
              );
            }
            if (rewardRule.parameters.auto_reset !== false) {
              await db.query('UPDATE member_club_balances SET punch_count = 0, updated_at = NOW() WHERE id = $1', [balance.id]);
            }
          }
        } else if (rewardRule.template_slug === 'spend_discount') {
          const newSpend = Number.parseFloat(balance.total_spend || 0) + Number.parseFloat(body.amount || 0);
          await db.query('UPDATE member_club_balances SET total_spend = $1, last_activity_at = NOW(), updated_at = NOW() WHERE id = $2', [newSpend, balance.id]);
        } else if (rewardRule.template_slug === 'visit_milestone') {
          const newVisitCount = (balance.visit_count || 0) + qty;
          await db.query('UPDATE member_club_balances SET visit_count = $1, last_activity_at = NOW(), updated_at = NOW() WHERE id = $2', [newVisitCount, balance.id]);
        } else {
          await db.query('UPDATE member_club_balances SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1', [balance.id]);
        }

        json(res, 200, { success: true, redemption_created: redemptionCreated });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/redeem') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.redemption_id) { json(res, 400, { error: 'redemption_id is required' }); return; }
        const redemption = await db.query(
          `SELECT crr.* FROM club_reward_redemptions crr
           JOIN club_memberships cm ON cm.id = crr.membership_id
           WHERE crr.id = $1 AND cm.club_id = $2 AND crr.status = 'available'`,
          [body.redemption_id, club.id]
        );
        if (redemption.rows.length === 0) { json(res, 404, { error: 'Redemption not found or already redeemed' }); return; }
        const result = await db.query('UPDATE club_reward_redemptions SET status = $1, redeemed_at = NOW() WHERE id = $2 RETURNING *', ['redeemed', body.redemption_id]);
        json(res, 200, { redemption: result.rows[0] });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/free-bids') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const result = await db.query(
          `SELECT COALESCE(SUM(bids_credited), 0) as total_earned, COALESCE(SUM(bids_credited - bids_remaining), 0) as total_used, COALESCE(SUM(bids_remaining), 0) as remaining
           FROM free_bid_credits WHERE provider_id = $1`,
          [user.id]
        );
        json(res, 200, result.rows[0]);
        return;
      }

      if (method === 'GET' && url === '/api/car-club/notifications') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const result = await db.query('SELECT * FROM notification_queue WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT 50', [user.id]);
        json(res, 200, { notifications: result.rows });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/notifications/read') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.notification_ids || !Array.isArray(body.notification_ids) || body.notification_ids.length === 0) { json(res, 400, { error: 'notification_ids array is required' }); return; }
        await db.query('UPDATE notification_queue SET is_read = true WHERE user_id = $1 AND id = ANY($2)', [user.id, body.notification_ids]);
        json(res, 200, { success: true });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/admin/suspend-provider') {
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        const adminKey = req.headers['x-admin-key'];
        if (!adminKey || adminKey !== process.env.ADMIN_PASSWORD) { json(res, 401, { error: 'Admin authentication required' }); return; }
        if (!body.provider_id) { json(res, 400, { error: 'provider_id is required' }); return; }
        const result = await db.query(
          'UPDATE car_clubs SET provider_suspended = true WHERE provider_id = $1 AND is_active = true RETURNING id, name',
          [body.provider_id]
        );
        if (result.rows.length === 0) { json(res, 404, { error: 'No active club found for this provider' }); return; }
        json(res, 200, { success: true, message: `Club "${result.rows[0].name}" suspended`, club_id: result.rows[0].id });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/admin/unsuspend-provider') {
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        const adminKey = req.headers['x-admin-key'];
        if (!adminKey || adminKey !== process.env.ADMIN_PASSWORD) { json(res, 401, { error: 'Admin authentication required' }); return; }
        if (!body.provider_id) { json(res, 400, { error: 'provider_id is required' }); return; }
        const result = await db.query(
          'UPDATE car_clubs SET provider_suspended = false WHERE provider_id = $1 RETURNING id, name',
          [body.provider_id]
        );
        if (result.rows.length === 0) { json(res, 404, { error: 'No club found for this provider' }); return; }
        json(res, 200, { success: true, message: `Club "${result.rows[0].name}" reactivated`, club_id: result.rows[0].id });
        return;
      }

      const params = new URLSearchParams(req.url.split('?')[1] || '');

      if (method === 'GET' && url === '/api/car-club/testimonials') {
        const clubId = params.get('club_id');
        if (!clubId) { json(res, 400, { error: 'club_id is required' }); return; }
        try {
          const result = await db.query(
            'SELECT ct.id, ct.club_id, ct.member_id, ct.rating, ct.content, ct.created_at FROM club_testimonials ct WHERE ct.club_id = $1 AND ct.is_approved = true ORDER BY ct.created_at DESC LIMIT 20',
            [clubId]
          );
          json(res, 200, { testimonials: result.rows });
        } catch(e) {
          json(res, 200, { testimonials: [] });
        }
        return;
      }

      if (method === 'POST' && url === '/api/car-club/testimonials') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.club_id || !body.rating || !body.content) { json(res, 400, { error: 'club_id, rating, and content are required' }); return; }
        if (body.content.length < 3) { json(res, 400, { error: 'Content too short' }); return; }
        const rating = Number.parseInt(body.rating);
        if (rating < 1 || rating > 5) { json(res, 400, { error: 'Rating must be between 1 and 5' }); return; }
        const membership = await db.query('SELECT id FROM club_memberships WHERE club_id = $1 AND member_id = $2 AND is_active = true', [body.club_id, user.id]);
        if (membership.rows.length === 0) { json(res, 403, { error: 'You must be an active member of this club' }); return; }
        const result = await db.query(
          `INSERT INTO club_testimonials (club_id, member_id, rating, content) VALUES ($1, $2, $3, $4)
           ON CONFLICT (club_id, member_id) DO UPDATE SET rating = $3, content = $4, updated_at = NOW()
           RETURNING *`,
          [body.club_id, user.id, rating, body.content.substring(0, 1000)]
        );
        json(res, 201, { testimonial: result.rows[0] });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/my-testimonials') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        try {
          const result = await db.query(
            `SELECT ct.*, c.name as club_name FROM club_testimonials ct JOIN car_clubs c ON c.id = ct.club_id WHERE ct.member_id = $1 ORDER BY ct.created_at DESC`,
            [user.id]
          );
          json(res, 200, { testimonials: result.rows });
        } catch(e) {
          json(res, 200, { testimonials: [] });
        }
        return;
      }

      if (method === 'GET' && url === '/api/car-club/promotions') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        try {
          const result = await db.query('SELECT * FROM club_promotions WHERE club_id = $1 ORDER BY created_at DESC', [club.id]);
          json(res, 200, { promotions: result.rows });
        } catch(e) {
          json(res, 200, { promotions: [] });
        }
        return;
      }

      if (method === 'POST' && url === '/api/car-club/promotions') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.name || !body.starts_at || !body.ends_at) { json(res, 400, { error: 'name, starts_at, and ends_at are required' }); return; }
        const activeCount = await db.query('SELECT COUNT(*) as count FROM club_promotions WHERE club_id = $1 AND is_active = true', [club.id]);
        if (Number.parseInt(activeCount.rows[0].count) >= 3) { json(res, 400, { error: 'Maximum 3 active promotions allowed' }); return; }
        const result = await db.query(
          'INSERT INTO club_promotions (club_id, name, description, punch_multiplier, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [club.id, body.name, body.description || null, Number.parseInt(body.punch_multiplier) || 2, body.starts_at, body.ends_at]
        );
        json(res, 201, { promotion: result.rows[0] });
        return;
      }

      const promoMatch = url.match(/^\/api\/car-club\/promotions\/([^/]+)$/);
      if (promoMatch && (method === 'PUT' || method === 'DELETE')) {
        const promoId = promoMatch[1];
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const existing = await db.query('SELECT * FROM club_promotions WHERE id = $1 AND club_id = $2', [promoId, club.id]);
        if (existing.rows.length === 0) { json(res, 404, { error: 'Promotion not found' }); return; }
        if (method === 'DELETE') {
          const result = await db.query('UPDATE club_promotions SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *', [promoId]);
          json(res, 200, { promotion: result.rows[0] });
          return;
        }
        if (method === 'PUT') {
          let body;
          try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
          const fields = [];
          const values = [];
          let idx = 1;
          if (body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(body.name); }
          if (body.description !== undefined) { fields.push(`description = $${idx++}`); values.push(body.description); }
          if (body.punch_multiplier !== undefined) { fields.push(`punch_multiplier = $${idx++}`); values.push(Number.parseInt(body.punch_multiplier) || 2); }
          if (body.starts_at !== undefined) { fields.push(`starts_at = $${idx++}`); values.push(body.starts_at); }
          if (body.ends_at !== undefined) { fields.push(`ends_at = $${idx++}`); values.push(body.ends_at); }
          if (body.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(body.is_active); }
          if (fields.length === 0) { json(res, 400, { error: 'No fields to update' }); return; }
          fields.push(`updated_at = NOW()`);
          values.push(promoId);
          const result = await db.query(`UPDATE club_promotions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
          json(res, 200, { promotion: result.rows[0] });
          return;
        }
      }

      if (method === 'GET' && url === '/api/car-club/active-promotions') {
        const clubId = params.get('club_id');
        if (!clubId) { json(res, 400, { error: 'club_id is required' }); return; }
        try {
          const result = await db.query(
            'SELECT * FROM club_promotions WHERE club_id = $1 AND is_active = true AND NOW() BETWEEN starts_at AND ends_at ORDER BY created_at DESC',
            [clubId]
          );
          json(res, 200, { promotions: result.rows });
        } catch(e) {
          json(res, 200, { promotions: [] });
        }
        return;
      }

      if (method === 'GET' && url === '/api/car-club/analytics') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }

        const totalMembers = await db.query(
          'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM club_memberships WHERE club_id = $1',
          [club.id]
        );

        const newMembers = await db.query(
          'SELECT COUNT(*) as count FROM club_memberships WHERE club_id = $1 AND joined_at >= NOW() - INTERVAL \'30 days\'',
          [club.id]
        );

        const totalPunches = await db.query(
          'SELECT COALESCE(SUM(mcb.punch_count), 0) as total FROM member_club_balances mcb JOIN club_memberships cm ON cm.id = mcb.membership_id WHERE cm.club_id = $1',
          [club.id]
        );

        const rewardsRedeemed = await db.query(
          'SELECT COUNT(*) as count FROM club_reward_redemptions crr JOIN club_memberships cm ON cm.id = crr.membership_id WHERE cm.club_id = $1 AND crr.status = \'redeemed\'',
          [club.id]
        );

        const rewardsAvailable = await db.query(
          'SELECT COUNT(*) as count FROM club_reward_redemptions crr JOIN club_memberships cm ON cm.id = crr.membership_id WHERE cm.club_id = $1 AND crr.status = \'available\'',
          [club.id]
        );

        const activity30 = await db.query(
          'SELECT COUNT(*) as count FROM club_activity_log cal JOIN club_memberships cm ON cm.id = cal.membership_id WHERE cm.club_id = $1 AND cal.created_at >= NOW() - INTERVAL \'30 days\'',
          [club.id]
        );

        const monthlyTrend = await db.query(
          `SELECT TO_CHAR(cal.created_at, 'YYYY-MM') as month, COUNT(*) as count
           FROM club_activity_log cal
           JOIN club_memberships cm ON cm.id = cal.membership_id
           WHERE cm.club_id = $1 AND cal.created_at >= NOW() - INTERVAL '6 months'
           GROUP BY TO_CHAR(cal.created_at, 'YYYY-MM')
           ORDER BY month ASC`,
          [club.id]
        );

        const activeCount = Number.parseInt(totalMembers.rows[0].active) || 0;
        const totalPunchCount = Number.parseInt(totalPunches.rows[0].total) || 0;
        const avgPunches = activeCount > 0 ? Math.round((totalPunchCount / activeCount) * 10) / 10 : 0;

        const retentionQuery = await db.query(
          'SELECT COUNT(DISTINCT cm.member_id) as count FROM club_activity_log cal JOIN club_memberships cm ON cm.id = cal.membership_id WHERE cm.club_id = $1 AND cm.is_active = true AND cal.created_at >= NOW() - INTERVAL \'30 days\'',
          [club.id]
        );
        const retentionRate = activeCount > 0 ? Math.round((Number.parseInt(retentionQuery.rows[0].count) / activeCount) * 100) : 0;

        const activePromos = await db.query(
          'SELECT COUNT(*) as count FROM club_promotions WHERE club_id = $1 AND is_active = true AND NOW() BETWEEN starts_at AND ends_at',
          [club.id]
        );

        json(res, 200, {
          analytics: {
            total_members: Number.parseInt(totalMembers.rows[0].total) || 0,
            active_members: activeCount,
            new_members_30d: Number.parseInt(newMembers.rows[0].count) || 0,
            total_punches: totalPunchCount,
            rewards_redeemed: Number.parseInt(rewardsRedeemed.rows[0].count) || 0,
            rewards_available: Number.parseInt(rewardsAvailable.rows[0].count) || 0,
            activity_30d: Number.parseInt(activity30.rows[0].count) || 0,
            monthly_trend: monthlyTrend.rows,
            avg_punches_per_member: avgPunches,
            retention_rate: retentionRate,
            active_promotions: Number.parseInt(activePromos.rows[0].count) || 0
          }
        });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/recommended') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const result = await db.query(
          `SELECT c.id, c.provider_id, c.name, c.description, c.logo_url, c.banner_url,
           p.bgc_badge_verified, p.bgc_compliant_employees, p.bgc_total_employees, p.bgc_last_computed_at,
           (SELECT COUNT(*) FROM club_memberships WHERE club_id = c.id AND is_active = true) as member_count,
           (SELECT COUNT(*) FROM club_reward_rules WHERE club_id = c.id AND is_active = true) as reward_count
           FROM car_clubs c
           LEFT JOIN profiles p ON p.id = c.provider_id
           WHERE c.is_active = true AND c.provider_suspended = false
           AND c.id NOT IN (SELECT club_id FROM club_memberships WHERE member_id = $1 AND is_active = true)
           ORDER BY member_count DESC LIMIT 6`,
          [user.id]
        );
        json(res, 200, { clubs: result.rows });
        return;
      }

      const productMatch = url.match(/^\/api\/car-club\/products\/([^/]+)$/);
      const productImagesMatch = url.match(/^\/api\/car-club\/products\/([^/]+)\/images$/);
      const productImageDeleteMatch = url.match(/^\/api\/car-club\/products\/([^/]+)\/images\/([^/]+)$/);
      const storeMatch = url.match(/^\/api\/car-club\/store\/([^/]+)$/);
      const orderMatch = url.match(/^\/api\/car-club\/orders\/([^/]+)$/);

      if (method === 'GET' && url === '/api/car-club/products') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const result = await db.query(
          `SELECT p.*, (SELECT json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url, 'sort_order', pi.sort_order) ORDER BY pi.sort_order) FROM club_product_images pi WHERE pi.product_id = p.id) as images FROM club_products p WHERE p.club_id = $1 ORDER BY p.sort_order, p.created_at DESC`,
          [club.id]
        );
        json(res, 200, { products: result.rows });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/products') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.name) { json(res, 400, { error: 'Product name is required' }); return; }
        if (!body.price || !Number.isInteger(body.price) || body.price <= 0) { json(res, 400, { error: 'Price must be a positive integer (in cents)' }); return; }
        const result = await db.query(
          'INSERT INTO club_products (club_id, provider_id, name, description, price, compare_at_price, category, sku, inventory_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
          [club.id, user.id, body.name, body.description || null, body.price, body.compare_at_price || null, body.category || null, body.sku || null, body.inventory_count || 0]
        );
        json(res, 201, { product: result.rows[0] });
        return;
      }

      if (productImageDeleteMatch && method === 'DELETE') {
        const productId = productImageDeleteMatch[1];
        const imageId = productImageDeleteMatch[2];
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const imageCheck = await db.query(
          'SELECT pi.id FROM club_product_images pi JOIN club_products p ON p.id = pi.product_id WHERE pi.id = $1 AND pi.product_id = $2 AND p.club_id = $3',
          [imageId, productId, club.id]
        );
        if (imageCheck.rows.length === 0) { json(res, 404, { error: 'Image not found' }); return; }
        await db.query('DELETE FROM club_product_images WHERE id = $1', [imageId]);
        json(res, 200, { success: true });
        return;
      }

      if (productImagesMatch && method === 'POST') {
        const productId = productImagesMatch[1];
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const productCheck = await db.query('SELECT id FROM club_products WHERE id = $1 AND club_id = $2', [productId, club.id]);
        if (productCheck.rows.length === 0) { json(res, 404, { error: 'Product not found' }); return; }
        let upload;
        try { upload = await parseMultipartUpload(req); } catch(e) { json(res, 400, { error: e.message || 'Upload failed' }); return; }
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(upload.contentType)) { json(res, 400, { error: 'Invalid file type. Allowed: PNG, JPEG, WebP' }); return; }
        const supabase = getSupabaseClient();
        if (!supabase) { json(res, 500, { error: 'Storage service unavailable' }); return; }
        try {
          await supabase.storage.createBucket('club-products', { public: true, fileSizeLimit: 2097152 });
        } catch(e) {}
        const safeName = upload.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${club.id}/${productId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('club-products').upload(filePath, upload.file, { contentType: upload.contentType, upsert: true });
        if (uploadError) { json(res, 500, { error: 'Failed to upload file: ' + uploadError.message }); return; }
        const { data: urlData } = supabase.storage.from('club-products').getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;
        const result = await db.query('INSERT INTO club_product_images (product_id, image_url) VALUES ($1, $2) RETURNING *', [productId, publicUrl]);
        json(res, 200, { image: result.rows[0] });
        return;
      }

      if (productMatch && method === 'PUT') {
        const productId = productMatch[1];
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const productCheck = await db.query('SELECT id FROM club_products WHERE id = $1 AND club_id = $2', [productId, club.id]);
        if (productCheck.rows.length === 0) { json(res, 404, { error: 'Product not found' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        const fields = [];
        const values = [];
        let idx = 1;
        if (body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(body.name); }
        if (body.description !== undefined) { fields.push(`description = $${idx++}`); values.push(body.description); }
        if (body.price !== undefined) { fields.push(`price = $${idx++}`); values.push(body.price); }
        if (body.compare_at_price !== undefined) { fields.push(`compare_at_price = $${idx++}`); values.push(body.compare_at_price); }
        if (body.category !== undefined) { fields.push(`category = $${idx++}`); values.push(body.category); }
        if (body.sku !== undefined) { fields.push(`sku = $${idx++}`); values.push(body.sku); }
        if (body.inventory_count !== undefined) { fields.push(`inventory_count = $${idx++}`); values.push(body.inventory_count); }
        if (body.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(body.is_active); }
        if (body.sort_order !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(body.sort_order); }
        if (fields.length === 0) { json(res, 400, { error: 'No fields to update' }); return; }
        fields.push(`updated_at = NOW()`);
        values.push(productId);
        const result = await db.query(`UPDATE club_products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        json(res, 200, { product: result.rows[0] });
        return;
      }

      if (productMatch && method === 'DELETE') {
        const productId = productMatch[1];
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const productCheck = await db.query('SELECT id FROM club_products WHERE id = $1 AND club_id = $2', [productId, club.id]);
        if (productCheck.rows.length === 0) { json(res, 404, { error: 'Product not found' }); return; }
        await db.query('DELETE FROM club_products WHERE id = $1', [productId]);
        json(res, 200, { success: true });
        return;
      }

      if (storeMatch && method === 'GET') {
        const clubId = storeMatch[1];
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const clubCheck = await db.query('SELECT id, name, logo_url FROM car_clubs WHERE id = $1 AND is_active = true AND provider_suspended = false', [clubId]);
        if (clubCheck.rows.length === 0) { json(res, 404, { error: 'Club not found or unavailable' }); return; }
        const result = await db.query(
          `SELECT p.*, (SELECT json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url, 'sort_order', pi.sort_order) ORDER BY pi.sort_order) FROM club_product_images pi WHERE pi.product_id = p.id) as images FROM club_products p WHERE p.club_id = $1 AND p.is_active = true ORDER BY p.sort_order, p.created_at DESC`,
          [clubId]
        );
        json(res, 200, { products: result.rows, club: { name: clubCheck.rows[0].name, logo_url: clubCheck.rows[0].logo_url } });
        return;
      }

      if (method === 'POST' && url === '/api/car-club/store/checkout') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        if (!body.club_id) { json(res, 400, { error: 'club_id is required' }); return; }
        if (!body.items || !Array.isArray(body.items) || body.items.length === 0) { json(res, 400, { error: 'items array is required and must not be empty' }); return; }
        const clubCheck = await db.query('SELECT id, provider_id FROM car_clubs WHERE id = $1 AND is_active = true AND provider_suspended = false', [body.club_id]);
        if (clubCheck.rows.length === 0) { json(res, 404, { error: 'Club not found or unavailable' }); return; }
        const providerId = clubCheck.rows[0].provider_id;
        const productIds = body.items.map(i => i.product_id);
        const productsResult = await db.query('SELECT id, name, price, is_active FROM club_products WHERE id = ANY($1) AND club_id = $2', [productIds, body.club_id]);
        if (productsResult.rows.length !== productIds.length) { json(res, 400, { error: 'One or more products not found' }); return; }
        const inactiveProducts = productsResult.rows.filter(p => !p.is_active);
        if (inactiveProducts.length > 0) { json(res, 400, { error: 'One or more products are no longer available' }); return; }
        const productMap = {};
        for (const p of productsResult.rows) { productMap[p.id] = p; }
        let subtotal = 0;
        const lineItems = [];
        for (const item of body.items) {
          const product = productMap[item.product_id];
          if (!product) { json(res, 400, { error: 'Product not found: ' + item.product_id }); return; }
          const qty = Number.parseInt(item.quantity) || 1;
          subtotal += product.price * qty;
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: { name: product.name },
              unit_amount: product.price
            },
            quantity: qty
          });
        }
        const providerProfile = await db.query('SELECT stripe_account_id FROM profiles WHERE id = $1', [providerId]);
        if (!providerProfile.rows[0] || !providerProfile.rows[0].stripe_account_id) { json(res, 400, { error: 'Provider not set up for payments' }); return; }
        const providerStripeAccountId = providerProfile.rows[0].stripe_account_id;
        const { STRIPE_API_VERSION } = require('../lib/stripe-api-version');
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
        const platformFee = Math.round(subtotal * 0.02);
        const total = subtotal + platformFee;
        const baseUrl = process.env.APP_URL || 'https://mycarconcierge.com';
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: lineItems,
          mode: 'payment',
          payment_intent_data: {
            application_fee_amount: platformFee,
            transfer_data: { destination: providerStripeAccountId }
          },
          success_url: `${baseUrl}/car-club-member.html?checkout=success`,
          cancel_url: `${baseUrl}/car-club-member.html?checkout=cancel`,
          metadata: { club_id: body.club_id, member_id: user.id, provider_id: providerId, type: 'club_merch' }
        });
        const order = await db.query(
          'INSERT INTO club_orders (club_id, member_id, provider_id, stripe_session_id, subtotal, platform_fee, total, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [body.club_id, user.id, providerId, session.id, subtotal, platformFee, total, 'pending']
        );
        for (const item of body.items) {
          const product = productMap[item.product_id];
          await db.query(
            'INSERT INTO club_order_items (order_id, product_id, product_name, product_price, quantity, variant) VALUES ($1, $2, $3, $4, $5, $6)',
            [order.rows[0].id, item.product_id, product.name, product.price, Number.parseInt(item.quantity) || 1, item.variant || null]
          );
        }
        json(res, 200, { checkout_url: session.url, order_id: order.rows[0].id });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/orders') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const params = new URLSearchParams(req.url.split('?')[1] || '');
        const statusFilter = params.get('status');
        let query = `SELECT o.*, COALESCE(json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name, 'product_price', oi.product_price, 'quantity', oi.quantity, 'variant', oi.variant)) FILTER (WHERE oi.id IS NOT NULL), '[]') as items FROM club_orders o LEFT JOIN club_order_items oi ON oi.order_id = o.id WHERE o.club_id = $1`;
        const queryParams = [club.id];
        if (statusFilter) {
          query += ` AND o.status = $2`;
          queryParams.push(statusFilter);
        }
        query += ` GROUP BY o.id ORDER BY o.created_at DESC`;
        const result = await db.query(query, queryParams);
        json(res, 200, { orders: result.rows });
        return;
      }

      if (orderMatch && method === 'PUT') {
        const orderId = orderMatch[1];
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const club = await getProviderClub(db, user.id);
        if (!club) { json(res, 404, { error: 'No club found' }); return; }
        const orderCheck = await db.query('SELECT * FROM club_orders WHERE id = $1 AND club_id = $2', [orderId, club.id]);
        if (orderCheck.rows.length === 0) { json(res, 404, { error: 'Order not found' }); return; }
        let body;
        try { body = await parseBody(req); } catch(e) { json(res, 400, { error: 'Invalid request body' }); return; }
        const currentStatus = orderCheck.rows[0].status;
        const allowedTransitions = { paid: 'processing', processing: 'shipped', shipped: 'delivered' };
        if (body.status && allowedTransitions[currentStatus] !== body.status) {
          json(res, 400, { error: `Cannot transition from ${currentStatus} to ${body.status}` });
          return;
        }
        const fields = [];
        const values = [];
        let idx = 1;
        if (body.status !== undefined) { fields.push(`status = $${idx++}`); values.push(body.status); }
        if (body.tracking_number !== undefined) { fields.push(`tracking_number = $${idx++}`); values.push(body.tracking_number); }
        if (body.tracking_url !== undefined) { fields.push(`tracking_url = $${idx++}`); values.push(body.tracking_url); }
        if (body.notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(body.notes); }
        if (fields.length === 0) { json(res, 400, { error: 'No fields to update' }); return; }
        fields.push(`updated_at = NOW()`);
        values.push(orderId);
        const result = await db.query(`UPDATE club_orders SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        json(res, 200, { order: result.rows[0] });
        return;
      }

      if (method === 'GET' && url === '/api/car-club/my-orders') {
        const user = await authenticate(req, res, getSupabaseClient);
        if (!user) return;
        const result = await db.query(
          `SELECT o.*, c.name as club_name, COALESCE(json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name, 'product_price', oi.product_price, 'quantity', oi.quantity, 'variant', oi.variant)) FILTER (WHERE oi.id IS NOT NULL), '[]') as items FROM club_orders o JOIN car_clubs c ON c.id = o.club_id LEFT JOIN club_order_items oi ON oi.order_id = o.id WHERE o.member_id = $1 GROUP BY o.id, c.name ORDER BY o.created_at DESC`,
          [user.id]
        );
        json(res, 200, { orders: result.rows });
        return;
      }

      json(res, 404, { error: 'Endpoint not found' });
    } catch (err) {
      console.error('[CAR_CLUB_API] Error:', err.message);
      json(res, 500, { error: 'Internal server error' });
    }
  };

  handle();
  return true;
};

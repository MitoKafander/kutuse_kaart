// Self-service account deletion (GDPR art 17).
//
// The supabase-js client can't delete auth.users rows with the anon key — only
// the service-role key can, and that key must never ship to the browser. So
// the client calls this endpoint with its session access token; we verify the
// JWT server-side, anonymize the user's public contributions (prices + votes
// lose their user_id so the price history survives, matching Privacy Policy
// s9 item2), delete the private tables, then drop the auth.users row.

import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

type NodeReq = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};
type NodeRes = {
  status: (code: number) => NodeRes;
  setHeader: (name: string, value: string) => void;
  json: (data: any) => void;
};

export default async function handler(req: NodeReq, res: NodeRes) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(204).json({});
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Server missing Supabase credentials.' });
  }

  const authHdr = req.headers['authorization'];
  const header = Array.isArray(authHdr) ? authHdr[0] : authHdr;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token.' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the JWT to a user before doing anything destructive.
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user?.id) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
  const uid = userRes.user.id;

  // Null out public contributions so the history survives (privacy policy
  // s9 item2). Partial unique index on votes(price_id, user_id) is WHERE
  // user_id IS NOT NULL, so nulling these rows never conflicts.
  const { error: pricesErr } = await admin.from('prices').update({ user_id: null }).eq('user_id', uid);
  if (pricesErr) return res.status(500).json({ error: `prices anonymize failed: ${pricesErr.message}` });

  const { error: votesErr } = await admin.from('votes').update({ user_id: null }).eq('user_id', uid);
  if (votesErr) return res.status(500).json({ error: `votes anonymize failed: ${votesErr.message}` });

  // Private tables without ON DELETE CASCADE from auth.users need explicit
  // cleanup before we can drop the auth row (user_favorites is NOT NULL FK,
  // user_profiles PK FK, neither has a cascade clause).
  const { error: favErr } = await admin.from('user_favorites').delete().eq('user_id', uid);
  if (favErr) return res.status(500).json({ error: `favorites delete failed: ${favErr.message}` });

  const { error: profErr } = await admin.from('user_profiles').delete().eq('id', uid);
  if (profErr) return res.status(500).json({ error: `profile delete failed: ${profErr.message}` });

  // user_loyalty_discounts (phase13) and feedback (phase33) have cascade/set-null
  // FKs, so auth.users delete handles them. Drop the auth row last.
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return res.status(500).json({ error: `auth delete failed: ${delErr.message}` });

  return res.status(200).json({ ok: true });
}

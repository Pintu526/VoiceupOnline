import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchGauPointsLeaderboard, fetchMyGauPointsWallet } from './remote';
import type { GauPointsLeader, GauPointsWallet } from './remote';

interface Props {
  client: SupabaseClient;
  workspaceId: string;
  campaignId: string;
  enabled: boolean;
  signedIn: boolean;
}

/** Opt-in panel; it never alters signing, registration, or campaign data. */
export function GauPointsPanel({ client, workspaceId, campaignId, enabled, signedIn }: Props) {
  const [wallet, setWallet] = useState<GauPointsWallet | null>(null);
  const [leaders, setLeaders] = useState<GauPointsLeader[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setWallet(null); setLeaders([]); setError('');
    if (!enabled) return () => { active = false; };
    setLoading(true);
    Promise.all([
      signedIn ? fetchMyGauPointsWallet(client, workspaceId, campaignId) : Promise.resolve(null),
      fetchGauPointsLeaderboard(client, workspaceId, campaignId)
    ]).then(([nextWallet, nextLeaders]) => {
      if (active) { setWallet(nextWallet); setLeaders(nextLeaders); }
    }).catch(() => {
      if (active) setError('GauPoints are temporarily unavailable.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, workspaceId, campaignId, enabled, signedIn]);
  if (!enabled) return null;
  return <section aria-label="GauPoints recognition" className="gaupoints-panel">
    <h2>GauPoints</h2>
    <p>Campaign recognition only. No cash value or redemption.</p>
    {loading && <p role="status">Loading GauPoints…</p>}
    {error && <p role="alert">{error}</p>}
    {signedIn && wallet && <div>
      <p>Available: <strong>{wallet.balance.toLocaleString()}</strong> GP</p>
      <p>Lifetime valid: <strong>{wallet.lifetimeValid.toLocaleString()}</strong> GP</p>
      <p>Completed round: <strong>{wallet.currentRound}</strong></p>
      {wallet.referralCode && <p>Your referral code: <code>{wallet.referralCode}</code></p>}
    </div>}
    {!signedIn && <p>Sign in to view your private wallet.</p>}
    <h3>Recognition leaderboard</h3>
    <ol>{leaders.map((leader, index) => <li key={`${leader.rank}-${index}`}>
      #{leader.rank} {leader.alias}: {leader.lifetimeValid.toLocaleString()} GP
    </li>)}</ol>
  </section>;
}

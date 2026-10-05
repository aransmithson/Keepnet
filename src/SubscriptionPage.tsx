import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Check, Sparkles, Tag, ShieldCheck, Gift, RefreshCw } from 'lucide-react';
import { useStore, actions } from './store';
import { usePremiumMembership, useMembershipPending } from './membership';
import { useAuth, isUserAdmin } from './auth';

export const SubscriptionPage = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { appliedCoupon, subscriptionExpiresAt } = useStore();
  const premium = usePremiumMembership();
  const membershipPending = useMembershipPending();
  const admin = isUserAdmin(user);
  const trial = Boolean(appliedCoupon && !appliedCoupon.startsWith('ADMIN_'));
  const [couponInput, setCouponInput] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleApplyCoupon = async () => {
    if (pending || membershipPending) return;
    if (!user) { setFeedback({ type: 'error', message: 'Sign in before redeeming a membership code.' }); return; }
    if (!couponInput.trim()) { setFeedback({ type: 'error', message: 'Enter a membership code.' }); return; }
    setPending(true);
    setFeedback(null);
    try {
      const result = await actions.applyCoupon(couponInput);
      setFeedback({ type: result.success ? 'success' : 'error', message: result.message });
      if (result.success) setCouponInput('');
    } catch { setFeedback({ type: 'error', message: 'Your code could not be redeemed. Check your connection and try again.' }); }
    finally { setPending(false); }
  };

  const handleCancelTrial = async () => {
    if (pending || !window.confirm('End your trial and return to Lite? Your personal journal will stay available.')) return;
    setPending(true);
    setFeedback(null);
    try {
      const result = await actions.cancelCouponTrial();
      setFeedback({ type: result ? 'success' : 'error', message: result ? 'Your trial has ended. Your free journal stays available.' : 'Your trial could not be ended. Please try again.' });
    } catch { setFeedback({ type: 'error', message: 'Your trial could not be ended. Check your connection and try again.' }); }
    finally { setPending(false); }
  };

  return <div className="content subscription-page">
    <div className="page-header"><button type="button" className="icon-btn" onClick={() => nav('/profile')} aria-label="Back to profile"><ArrowLeft size={20} /></button><div><div className="eyebrow"><Crown size={15} /> Membership</div><h1 className="page-title">{premium || membershipPending ? 'Your membership' : 'Keepnet Premium'}</h1></div></div>
    {feedback && <div className={`coupon-feedback-banner ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}><span>{feedback.message}</span></div>}
    {premium ? <section className="card active-trial-card" aria-labelledby="membership-status-title">
      <div className="membership-status-heading"><span className="trial-badge-icon"><Crown size={24} aria-hidden="true" /></span><div><h2 id="membership-status-title">Premium active</h2><span className="trial-status-pill">{admin ? 'Administrator access' : trial ? 'Trial membership' : appliedCoupon ? 'Membership pass' : 'Active membership'}</span></div></div>
      <p className="muted">{subscriptionExpiresAt ? <>Available until <strong>{new Date(subscriptionExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. Your membership will return to Lite when this access ends.</> : 'Your account has ongoing Premium access.'}</p>
      {trial && !admin ? <><p className="muted membership-management-note">This trial does not start a paid subscription or charge your card.</p><button type="button" className="btn-secondary" disabled={pending} onClick={handleCancelTrial}>{pending ? 'Updating…' : 'End trial and return to Lite'}</button></> : <p className="muted membership-management-note">{admin ? 'This access comes from your administrator role.' : 'This page shows your current account access. There is no automatic payment or renewal to manage in Keepnet.'}</p>}
    </section> : membershipPending ? <section className="card" role="status"><h2>Checking membership…</h2><p className="muted">Your account access will appear after Keepnet connects. Your personal journal stays available while you wait.</p></section> : <>
      <section className="card coupon-card" id="coupon-redemption-card" aria-labelledby="coupon-title"><div className="membership-status-heading"><span className="coupon-icon-wrap"><Gift size={22} aria-hidden="true" /></span><div><h2 id="coupon-title">Try Premium for a month</h2><p className="muted">No card or automatic subscription required.</p></div></div>
        <p className="muted">Use a trial code below, or enter a membership code you have been given.</p>
        <div className="coupon-suggestions">{['KEEPNET1M', 'ANGLER30'].map(code => <button className="coupon-quick-chip" key={code} type="button" aria-label={`Use membership code ${code}`} onClick={() => setCouponInput(code)} disabled={pending}><Tag size={15} />{code}</button>)}</div>
        {user ? <form className="coupon-form-row" onSubmit={event => { event.preventDefault(); handleApplyCoupon(); }}><label className="coupon-label"><span className="sr-only">Membership code</span><input id="coupon-code-input" className="coupon-input" placeholder="Enter membership code" value={couponInput} onChange={event => setCouponInput(event.target.value)} autoCapitalize="characters" autoComplete="off" disabled={pending} /></label><button className="btn-primary" type="submit" disabled={pending || !couponInput.trim()}>{pending ? <RefreshCw size={16} className="spin" /> : <Gift size={16} />}{pending ? 'Redeeming…' : 'Redeem code'}</button></form> : <Link className="btn-primary" to="/settings">Sign in to redeem a code</Link>}
      </section>
      <section className="card plan-card current-plan" aria-labelledby="lite-title"><div className="plan-header"><h2 className="plan-title" id="lite-title">Your free journal</h2><span className="plan-active-chip"><Check size={15} /> Keepnet Lite</span></div><p className="muted">Your sessions, catches and personal bests remain available when Premium access ends.</p><ul className="plan-features-list"><li><Check size={17} /> Sessions and catch logging</li><li><Check size={17} /> Photos, weights and personal notes</li><li><Check size={17} /> Personal bests and achievements</li><li><Check size={17} /> Private journal on your device</li></ul></section>
    </>}
    <section className="card plan-card featured" aria-labelledby="premium-benefits-title"><div className="plan-header"><div><div className="eyebrow"><Sparkles size={15} /> {premium ? 'Included with your access' : 'Premium features'}</div><h2 className="plan-title" id="premium-benefits-title">More from the water</h2></div></div><ul className="plan-features-list"><li><Crown size={17} /><span>Browse the UK fisheries directory, search waters and compare distances from your location.</span></li><li><Crown size={17} /><span>Add comments and rig advice to shared community catches.</span></li><li><Crown size={17} /><span>Keep confidential catches and water locations private.</span></li></ul>{premium && <Link to="/fisheries" className="btn-secondary">Explore fisheries</Link>}</section>
    <p className="membership-journal-note"><ShieldCheck size={18} aria-hidden="true" /><span>Your personal fishing journal stays yours. Keep photos and records private, and choose what to share.</span></p>
  </div>;
};

export default SubscriptionPage;

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Crown, Check, Sparkles, Tag, ShieldCheck,
  Calendar, Zap, EyeOff, Camera, FileText, Gift, X
} from 'lucide-react';
import { useStore, actions } from './store';

export const SubscriptionPage = () => {
  const nav = useNavigate();
  const { appliedCoupon, subscriptionExpiresAt } = useStore();

  const isPremiumActive = actions.isPremium();
  const [couponInput, setCouponInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');

  const handleApplyCoupon = (codeToApply?: string) => {
    const code = codeToApply || couponInput;
    if (!code.trim()) {
      setFeedback({ type: 'error', message: 'Please enter a coupon code.' });
      return;
    }
    const res = actions.applyCoupon(code);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setCouponInput('');
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleCancelTrial = () => {
    if (window.confirm('Do you want to end your free trial and return to Lite? Your personal catches and journal will remain completely intact.')) {
      actions.cancelCouponTrial();
      setFeedback({ type: 'success', message: 'Trial ended. You are now on the Keepnet Lite plan.' });
    }
  };

  // Calculate days remaining in trial
  const daysRemaining = subscriptionExpiresAt
    ? Math.max(0, Math.ceil((new Date(subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="content subscription-page">
      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="icon-btn"
          onClick={() => nav(-1)}
          aria-label="Go back"
          id="sub-back-btn"
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
            <Crown size={13} /> Membership & Plans
          </div>
          <h1 className="serif page-title" style={{ margin: 0, fontSize: 22 }}>
            Keepnet Premium
          </h1>
        </div>
      </div>

      {/* Active Trial Banner if currently active */}
      {isPremiumActive && (
        <div className="card active-trial-card">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="trial-badge-icon">
                <Crown size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="serif" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Keepnet Premium Active
                  </span>
                  <span className="trial-status-pill">
                    {appliedCoupon ? `Trial (${appliedCoupon})` : 'Active Subscriber'}
                  </span>
                </div>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {subscriptionExpiresAt ? (
                    <>
                      Valid until <strong>{new Date(subscriptionExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                      {daysRemaining !== null && ` · ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`}
                    </>
                  ) : (
                    'Unlimited Pro Bankside Intelligence enabled.'
                  )}
                </p>
              </div>
            </div>

            {appliedCoupon && (
              <button
                type="button"
                className="btn-secondary"
                style={{ height: 32, fontSize: 12, padding: '0 10px', marginTop: 2 }}
                onClick={handleCancelTrial}
                title="Cancel trial and return to Lite"
              >
                Cancel Trial
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1-Month Free Trial Coupon Entry Card */}
      <div className="card coupon-card" id="coupon-redemption-card">
        <div className="row-between" style={{ alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="coupon-icon-wrap">
              <Gift size={18} />
            </div>
            <div>
              <h2 className="serif" style={{ margin: 0, fontSize: 16 }}>
                Redeem Free Trial Coupon
              </h2>
              <span className="muted" style={{ fontSize: 12 }}>
                Enjoy 1 month of Keepnet Premium with zero credit card required
              </span>
            </div>
          </div>
          <span className="count-pill" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700, fontSize: 11 }}>
            1 Month Free
          </span>
        </div>

        {/* Quick Suggestion Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12 }}>Recommended:</span>
          <button
            type="button"
            className="coupon-quick-chip"
            onClick={() => {
              setCouponInput('KEEPNET1M');
              handleApplyCoupon('KEEPNET1M');
            }}
            title="Click to apply KEEPNET1M"
          >
            <Tag size={12} />
            <span>KEEPNET1M</span>
          </button>
          <button
            type="button"
            className="coupon-quick-chip"
            onClick={() => {
              setCouponInput('ANGLER30');
              handleApplyCoupon('ANGLER30');
            }}
            title="Click to apply ANGLER30"
          >
            <Tag size={12} />
            <span>ANGLER30</span>
          </button>
        </div>

        {/* Input & Submit Form */}
        <div className="coupon-form-row">
          <input
            type="text"
            id="coupon-code-input"
            className="coupon-input"
            placeholder="Enter promo or coupon code..."
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApplyCoupon();
              }
            }}
            aria-label="Coupon code for free trial"
          />
          <button
            type="button"
            id="apply-coupon-btn"
            className="btn-primary"
            style={{ height: 42, padding: '0 16px', fontSize: 13, minWidth: 110 }}
            onClick={() => handleApplyCoupon()}
          >
            Apply Code
          </button>
        </div>

        {feedback && (
          <div className={`coupon-feedback-banner ${feedback.type}`}>
            {feedback.type === 'success' ? <Check size={16} /> : <X size={16} />}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {/* Billing Cycle Toggle */}
      <div className="billing-cycle-switch-wrap">
        <div className="billing-cycle-toggle" role="group" aria-label="Subscription billing frequency">
          <button
            type="button"
            className={`billing-btn ${billingCycle === 'annual' ? 'active' : ''}`}
            onClick={() => setBillingCycle('annual')}
          >
            <span>Annual (Save 41%)</span>
            <span className="best-value-pill">Best Value</span>
          </button>
          <button
            type="button"
            className={`billing-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
            onClick={() => setBillingCycle('monthly')}
          >
            <span>Monthly</span>
          </button>
        </div>
      </div>

      {/* Plans Comparison Grid */}
      <div className="plans-grid">
        {/* Plan 1: Lite (Free Forever) */}
        <div className={`card plan-card ${!isPremiumActive ? 'current-plan' : ''}`}>
          <div className="plan-header">
            <div>
              <div className="eyebrow" style={{ color: 'var(--text-secondary)' }}>Personal Journal</div>
              <h3 className="serif plan-title">Keepnet Lite</h3>
            </div>
            <div className="plan-price">
              <span className="serif" style={{ fontSize: 26, fontWeight: 700 }}>£0</span>
              <span className="muted" style={{ fontSize: 12 }}> / forever</span>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 13, margin: '8px 0 16px' }}>
            Essential bankside logging and dependable personal catch journal.
          </p>

          <div className="plan-status-row">
            {!isPremiumActive ? (
              <span className="plan-active-chip">
                <Check size={13} /> Active Plan
              </span>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>Free Default Tier</span>
            )}
          </div>

          <ul className="plan-features-list">
            <li><Check size={15} color="var(--accent-green)" /> <span>Unlimited catches & fishing sessions</span></li>
            <li><Check size={15} color="var(--accent-green)" /> <span>Personal diary, species & weight logging</span></li>
            <li><Check size={15} color="var(--accent-green)" /> <span>Manual venue & swim naming (retained forever)</span></li>
            <li><Check size={15} color="var(--accent-green)" /> <span>Personal bests & bankside hours tracking</span></li>
            <li><Check size={15} color="var(--accent-green)" /> <span>Core achievements & avatar flair</span></li>
            <li><Check size={15} color="var(--accent-green)" /> <span>100% offline bankside PWA support</span></li>
            <li><Check size={15} color="var(--accent-green)" /> <span>Standard photo storage</span></li>
            <li className="muted"><EyeOff size={15} /> <span>Discover Map & Fisheries: Preview mode</span></li>
          </ul>
        </div>

        {/* Plan 2: Premium Subscription */}
        <div className={`card plan-card featured ${isPremiumActive ? 'current-plan' : ''}`}>
          <div className="featured-ribbon">
            <Sparkles size={12} /> Specimen Suite
          </div>

          <div className="plan-header">
            <div>
              <div className="eyebrow" style={{ color: 'var(--copper, #C9772B)' }}>Bankside Intelligence & Discover</div>
              <h3 className="serif plan-title">Keepnet Premium</h3>
            </div>
            <div className="plan-price">
              {billingCycle === 'annual' ? (
                <>
                  <span className="serif" style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-green)' }}>£10.49</span>
                  <span className="muted" style={{ fontSize: 12 }}> / year</span>
                  <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginTop: 2 }}>Just ~87p / month · Save 41%</div>
                </>
              ) : (
                <>
                  <span className="serif" style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-green)' }}>£1.49</span>
                  <span className="muted" style={{ fontSize: 12 }}> / month</span>
                </>
              )}
            </div>
          </div>

          <p className="muted" style={{ fontSize: 13, margin: '8px 0 16px' }}>
            Full live Discover map, 60+ UK fisheries, solunar feeding windows, and tactical intel.
          </p>

          <div className="plan-status-row">
            {isPremiumActive ? (
              <span className="plan-active-chip premium">
                <Crown size={13} /> Active Plan
              </span>
            ) : (
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', height: 42, fontSize: 13, gap: 6 }}
                onClick={() => {
                  const input = document.getElementById('coupon-code-input') as HTMLInputElement;
                  if (input) {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    input.focus();
                  }
                }}
              >
                <Gift size={15} /> Redeem 1 Month Free Trial
              </button>
            )}
          </div>

          <ul className="plan-features-list">
            <li>
              <Crown size={15} color="var(--copper, #C9772B)" />
              <div>
                <strong>Live Discover Map & Community Waters</strong>
                <div className="muted" style={{ fontSize: 11 }}>Explore public waters, shared sessions & community catches</div>
              </div>
            </li>
            <li>
              <Crown size={15} color="var(--copper, #C9772B)" />
              <div>
                <strong>Full UK Fisheries Directory (60+ Venues)</strong>
                <div className="muted" style={{ fontSize: 11 }}>GPS distance sorting, ticket info, rules & directions</div>
              </div>
            </li>
            <li>
              <Zap size={15} color="var(--copper, #C9772B)" />
              <div>
                <strong>Atmospheric & Barometric Predictor</strong>
                <div className="muted" style={{ fontSize: 11 }}>Feeding run correlations on pressure swings</div>
              </div>
            </li>
            <li>
              <Calendar size={15} color="var(--copper, #C9772B)" />
              <div>
                <strong>Solunar Major & Minor Bite Windows</strong>
                <div className="muted" style={{ fontSize: 11 }}>Moon phase & localized solar bite peaks</div>
              </div>
            </li>
            <li>
              <EyeOff size={15} color="var(--copper, #C9772B)" />
              <div>
                <strong>Syndicate Stealth Cloak</strong>
                <div className="muted" style={{ fontSize: 11 }}>Air-gaps GPS coordinates & keeps secret waters private</div>
              </div>
            </li>
            <li>
              <Camera size={15} color="var(--copper, #C9772B)" />
              <div>
                <strong>Uncompressed 4K Photo Vault</strong>
                <div className="muted" style={{ fontSize: 11 }}>Full camera resolution trophy photography</div>
              </div>
            </li>
            <li>
              <FileText size={15} color="var(--copper, #C9772B)" />
              <div>
                <strong>Printable PDF Dossiers & PB Certificates</strong>
                <div className="muted" style={{ fontSize: 11 }}>1-click exports for syndicate catch returns</div>
              </div>
            </li>
            <li>
              <Sparkles size={15} color="var(--copper, #C9772B)" />
              <div>
                <strong>Golden Pro Avatar Ring & Prestige</strong>
                <div className="muted" style={{ fontSize: 11 }}>Distinctive badge styling across community feeds</div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* Safety & Integrity Guarantee Notice */}
      <div className="accuracy-notice" style={{ marginTop: 20 }}>
        <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent-green)' }} />
        <span style={{ fontSize: 12, lineHeight: 1.45 }}>
          <strong>Keepnet Angler Guarantee:</strong> You can cancel anytime. If your subscription or trial ever ends, your personal catch records, photos, and journal history remain 100% accessible to you forever.
        </span>
      </div>
    </div>
  );
};

export default SubscriptionPage;

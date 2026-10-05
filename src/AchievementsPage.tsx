import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, ArrowLeft, Check, Sparkles, Lock, Award,
  Search, CheckCircle2, Fish, Scale
} from 'lucide-react';
import { useStore, actions } from './store';
import {
  evaluateAchievements,
  getEquippedAchievement,
  type BadgeTier,
  type AchievementCategory
} from './achievements';

const CATEGORIES: { id: AchievementCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All Badges', icon: '🏆' },
  { id: 'social', label: 'Community & Likes', icon: '❤️' },
  { id: 'size', label: 'Specimen Sizes', icon: '🐟' },
  { id: 'pb', label: 'Personal Bests', icon: '⚡' },
  { id: 'time', label: 'Bankside Hours', icon: '⏳' },
  { id: 'catches', label: 'Catch Numbers', icon: '🎣' },
  { id: 'species', label: 'Species Variety', icon: '🎯' },
  { id: 'sessions', label: 'Sessions', icon: '🗓️' },
];

const TIER_COLORS: Record<BadgeTier, { name: string; border: string; bg: string; text: string; glow: string }> = {
  bronze: {
    name: 'Bronze',
    border: 'rgba(205, 127, 50, 0.45)',
    bg: 'rgba(205, 127, 50, 0.12)',
    text: '#e69a58',
    glow: '0 0 16px rgba(205, 127, 50, 0.25)',
  },
  silver: {
    name: 'Silver',
    border: 'rgba(148, 163, 184, 0.45)',
    bg: 'rgba(148, 163, 184, 0.12)',
    text: '#cbd5e1',
    glow: '0 0 16px rgba(148, 163, 184, 0.25)',
  },
  gold: {
    name: 'Gold',
    border: 'rgba(245, 158, 11, 0.5)',
    bg: 'rgba(245, 158, 11, 0.14)',
    text: '#fbbf24',
    glow: '0 0 18px rgba(245, 158, 11, 0.3)',
  },
  specimen: {
    name: 'Specimen Trophy',
    border: 'rgba(168, 85, 247, 0.55)',
    bg: 'rgba(168, 85, 247, 0.16)',
    text: '#c084fc',
    glow: '0 0 22px rgba(168, 85, 247, 0.35)',
  },
};

export const AchievementsPage = () => {
  const nav = useNavigate();
  const { catches, sessions, equippedAchievementId, name, likesGivenCount = 0 } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnlockedOnly, setShowUnlockedOnly] = useState(false);

  const socialStats = useMemo(() => ({
    likesGiven: likesGivenCount || 0,
    likesReceived: actions.getTotalLikesReceived(),
    sharedCount: catches.filter((c) => c.isShared).length,
  }), [likesGivenCount, catches]);

  // Evaluate all achievements against the user's live journal and social activity
  const evaluatedAchievements = useMemo(
    () => evaluateAchievements(catches, sessions, socialStats),
    [catches, sessions, socialStats]
  );

  const unlockedCount = useMemo(
    () => evaluatedAchievements.filter((a) => a.unlocked).length,
    [evaluatedAchievements]
  );

  const totalCount = evaluatedAchievements.length;
  const percentage = Math.round((unlockedCount / totalCount) * 100);

  // Currently equipped badge
  const equipped = useMemo(
    () => getEquippedAchievement(equippedAchievementId, evaluatedAchievements),
    [equippedAchievementId, evaluatedAchievements]
  );

  // Tier counts
  const specimenCount = evaluatedAchievements.filter((a) => a.tier === 'specimen' && a.unlocked).length;
  const goldCount = evaluatedAchievements.filter((a) => a.tier === 'gold' && a.unlocked).length;
  const silverCount = evaluatedAchievements.filter((a) => a.tier === 'silver' && a.unlocked).length;
  const bronzeCount = evaluatedAchievements.filter((a) => a.tier === 'bronze' && a.unlocked).length;

  // Filtered list
  const filtered = useMemo(() => {
    return evaluatedAchievements.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (showUnlockedOnly && !item.unlocked) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesSpecies = item.speciesTarget?.toLowerCase().includes(q);
        const matchesFlair = item.flairTitle.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesSpecies && !matchesFlair) {
          return false;
        }
      }
      return true;
    });
  }, [evaluatedAchievements, selectedCategory, showUnlockedOnly, searchQuery]);

  return (
    <div className="content achievements-page">
      {/* Top Navigation Bar */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="icon-btn"
          onClick={() => nav('/profile')}
          aria-label="Back to Profile"
          id="achievements-back-btn"
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
            <Trophy size={13} /> Angler Gamification
          </div>
          <h1 className="serif page-title" style={{ margin: 0, fontSize: 22 }}>
            Achievements & Badges
          </h1>
        </div>
      </div>

      {/* Equipped Flair Avatar Card */}
      <div className="card equipped-flair-card">
        <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className={`avatar-container tier-${equipped?.tier || 'none'}`}>
              <div className="avatar-placeholder">
                {equipped ? (
                  <span className="avatar-flair-icon" role="img" aria-label={equipped.title}>
                    {equipped.icon}
                  </span>
                ) : (
                  <Fish size={32} />
                )}
              </div>
              {equipped && (
                <div
                  className={`avatar-flair-badge tier-badge-${equipped.tier}`}
                  title={equipped.flairTitle}
                >
                  <span>{equipped.icon}</span>
                </div>
              )}
            </div>
            <div>
              <div className="eyebrow" style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>
                Equipped Profile Avatar Flair
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{equipped ? equipped.flairTitle : 'No Badge Equipped'}</span>
                {equipped && <Sparkles size={15} style={{ color: TIER_COLORS[equipped.tier].text }} />}
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                {equipped
                  ? `Shown on ${name || 'Angler'}'s profile picture, catch shares, and community leaderboards.`
                  : 'Equip any unlocked trophy below to show off your achievement on your profile picture.'}
              </p>
            </div>
          </div>

          {equipped && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px', height: 32 }}
              onClick={() => actions.setEquippedAchievement(null)}
              id="unequip-achievement-btn"
            >
              Unequip Flair
            </button>
          )}
        </div>
      </div>

      {/* Progress & Milestone Overview */}
      <div className="card achievements-overview-card">
        <div className="row-between" style={{ alignItems: 'baseline', marginBottom: 8 }}>
          <div>
            <span className="serif" style={{ fontSize: 26, fontWeight: 700 }}>
              {unlockedCount}
            </span>
            <span className="muted" style={{ fontSize: 14, marginLeft: 4 }}>
              / {totalCount} Badges Unlocked
            </span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
            {percentage}% Completed
          </span>
        </div>

        {/* Animated Progress Bar */}
        <div className="achievement-progress-track">
          <div
            className="achievement-progress-fill"
            style={{ width: `${Math.max(3, percentage)}%` }}
          />
        </div>

        {/* Tier Milestones Breakdown */}
        <div className="badge-tier-breakdown">
          <div className="tier-count specimen" title="Specimen Trophies">
            <span className="tier-dot" />
            <span>{specimenCount} Specimen</span>
          </div>
          <div className="tier-count gold" title="Gold Badges">
            <span className="tier-dot" />
            <span>{goldCount} Gold</span>
          </div>
          <div className="tier-count silver" title="Silver Badges">
            <span className="tier-dot" />
            <span>{silverCount} Silver</span>
          </div>
          <div className="tier-count bronze" title="Bronze Badges">
            <span className="tier-dot" />
            <span>{bronzeCount} Bronze</span>
          </div>
        </div>
      </div>

      {/* Search & Category Filter Controls */}
      <div className="achievement-controls">
        <div className="search-box" style={{ flex: 1 }}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search specimen badges, species, or targets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            aria-label="Search Achievements"
          />
          {searchQuery && (
            <button
              type="button"
              className="icon-btn search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <button
          type="button"
          className={`filter-toggle-btn ${showUnlockedOnly ? 'active' : ''}`}
          onClick={() => setShowUnlockedOnly(!showUnlockedOnly)}
          title="Toggle unlocked badges only"
        >
          <CheckCircle2 size={15} />
          <span>Unlocked Only</span>
        </button>
      </div>

      {/* Category Pills Bar */}
      <div className="category-scroll-bar" role="tablist" aria-label="Achievement Categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat.id}
            className={`category-pill ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Achievements Cards Grid */}
      <div className="achievements-grid">
        {filtered.length === 0 ? (
          <div className="card empty-card" style={{ padding: '32px 20px', textAlign: 'center', gridColumn: '1 / -1' }}>
            <Trophy size={40} style={{ color: 'var(--muted)', margin: '0 auto 10px', opacity: 0.5 }} />
            <h3 className="serif" style={{ fontSize: 18, marginBottom: 4 }}>No Badges Found</h3>
            <p className="muted" style={{ fontSize: 13, maxWidth: 360, margin: '0 auto' }}>
              No achievements match your search or filter. Try switching category or clearing the unlocked-only filter.
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const isEquipped = equippedAchievementId === item.id;
            const tierStyle = TIER_COLORS[item.tier];

            return (
              <div
                key={item.id}
                className={`card achievement-card ${item.unlocked ? 'unlocked' : 'locked'} ${isEquipped ? 'equipped' : ''}`}
                style={{
                  borderColor: isEquipped ? tierStyle.border : undefined,
                  boxShadow: isEquipped ? tierStyle.glow : undefined,
                }}
              >
                <div className="achievement-card-header">
                  {/* Badge Icon with Tier Halo */}
                  <div
                    className="achievement-icon-wrapper"
                    style={{
                      background: item.unlocked ? tierStyle.bg : 'var(--surface-sunken)',
                      borderColor: item.unlocked ? tierStyle.border : 'var(--border-color)',
                      boxShadow: item.unlocked ? tierStyle.glow : 'none',
                    }}
                  >
                    <span className="achievement-emoji" role="img" aria-label={item.title}>
                      {item.icon}
                    </span>
                    {!item.unlocked && (
                      <div className="lock-badge">
                        <Lock size={11} />
                      </div>
                    )}
                  </div>

                  {/* Header Title & Tier Tag */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-between" style={{ alignItems: 'baseline', gap: 6 }}>
                      <span
                        className="achievement-tier-pill"
                        style={{
                          background: tierStyle.bg,
                          color: tierStyle.text,
                          borderColor: tierStyle.border,
                        }}
                      >
                        {tierStyle.name}
                      </span>
                      {item.unlocked && (
                        <span className="mini-badge-unlocked">
                          <Check size={11} /> Unlocked
                        </span>
                      )}
                    </div>
                    <h3 className="achievement-card-title">{item.title}</h3>
                  </div>
                </div>

                {/* Description */}
                <p className="achievement-card-desc">{item.description}</p>

                {/* Specimen Target Milestone Callout */}
                {item.speciesTarget && (
                  <div className="achievement-target-tag">
                    <Scale size={12} />
                    <span>Specimen Target: {item.speciesTarget} ≥ {item.target / 16} lb</span>
                  </div>
                )}

                {/* Progress Tracker */}
                <div className="achievement-meter">
                  <div className="row-between achievement-meter-labels">
                    <span>Progress</span>
                    <span>
                      <strong>{item.current}</strong> / {item.unit === 'lb' ? item.target / 16 : item.target}{' '}
                      {item.unit || ''}
                    </span>
                  </div>
                  <div className="achievement-progress-track small">
                    <div
                      className="achievement-progress-fill small"
                      style={{
                        width: `${item.unlocked ? 100 : item.progress}%`,
                        background: item.unlocked
                          ? (item.tier === 'specimen'
                              ? 'linear-gradient(90deg, #9333ea, #c084fc)'
                              : item.tier === 'gold'
                              ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                              : 'var(--accent-gradient, #10b981)')
                          : 'var(--muted)',
                      }}
                    />
                  </div>
                </div>

                {/* Bottom Action: Equip to Profile Avatar */}
                <div className="achievement-card-footer">
                  {item.unlocked ? (
                    isEquipped ? (
                      <button
                        type="button"
                        className="btn-equipped"
                        onClick={() => actions.setEquippedAchievement(null)}
                        title="Click to unequip"
                      >
                        <Sparkles size={14} />
                        <span>Equipped on Avatar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-equip"
                        onClick={() => actions.setEquippedAchievement(item.id)}
                        id={`equip-btn-${item.id}`}
                      >
                        <Award size={14} />
                        <span>Equip to Avatar</span>
                      </button>
                    )
                  ) : (
                    <div className="locked-helper-text">
                      <Lock size={12} />
                      <span>Log catches to unlock flair</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AchievementsPage;

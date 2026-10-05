import { Fragment, useMemo, useState } from 'react';
import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Check, Search, Trophy, X,
} from 'lucide-react';
import { useStore, actions, imperialToMetric } from './store';
import { evaluateAchievements, type AchievementCategory } from './achievements';
import AchievementBadge from './AchievementBadge';
import './AchievementsPage.css';

type Category = 'all' | 'catches' | 'community' | 'exploration' | 'milestones';
const CATEGORIES: { id: Category; label: string; categories: AchievementCategory[] }[] = [
  { id: 'all', label: 'All', categories: [] },
  { id: 'catches', label: 'Catches', categories: ['catches', 'size'] },
  { id: 'community', label: 'Community', categories: ['social'] },
  { id: 'exploration', label: 'Exploration', categories: ['species', 'sessions'] },
  { id: 'milestones', label: 'Milestones', categories: ['pb', 'time'] },
];

export const AchievementsPage = () => {
  const { catches, sessions, equippedAchievementId, likesGivenCount = 0, catchLikes, unitSystem = 'imperial' } = useStore();
  const [category, setCategory] = useState<Category>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [earnedOnly, setEarnedOnly] = useState(false);
  const achievements = useMemo(() => evaluateAchievements(catches, sessions, {
    likesGiven: likesGivenCount,
    likesReceived: catches.reduce((total, record) => total + (catchLikes?.[record.id] ?? record.likesCount ?? 0), 0),
    sharedCount: catches.filter(c => c.isShared).length,
  }), [catches, sessions, likesGivenCount, catchLikes]);
  const filtered = useMemo(() => {
    const group = CATEGORIES.find(c => c.id === category)!;
    return achievements.filter(item =>
      (category === 'all' || group.categories.includes(item.category)) &&
      (!earnedOnly || item.unlocked) &&
      `${item.title} ${item.description} ${item.speciesTarget || ''} ${item.flairTitle}`.toLowerCase().includes(query.trim().toLowerCase())
    ).sort((a, b) => {
      // Bring the first catch and earned badges to the front of the collection.
      if (category === 'all' && !query && !earnedOnly) {
        if (a.id === 'catches_1') return -1;
        if (b.id === 'catches_1') return 1;
      }
      return Number(b.unlocked) - Number(a.unlocked);
    });
  }, [achievements, category, earnedOnly, query]);
  const selected = filtered.find(item => item.id === selectedId) ||
    filtered.find(item => item.id === equippedAchievementId) ||
    filtered.find(item => item.unlocked) || filtered[0];
  const rows = Array.from({ length: Math.ceil(filtered.length / 4) }, (_, i) => filtered.slice(i * 4, i * 4 + 4));
  const earnedCount = achievements.filter(item => item.unlocked).length;
  const metricPounds = (pounds: number) => {
    const value = imperialToMetric(pounds, 0);
    return (value.kg + value.g / 1000).toLocaleString('en-GB', { maximumFractionDigits: 3 });
  };

  return (
    <div className="content achievements-page badge-gallery-page">
      <div className="badge-gallery-heading">
        <div>
          <h1>Achievements</h1>
          <p>Earn badges for your catches, activity and community contributions.</p>
        </div>
        <button type="button" className="badge-search-toggle" aria-label={searchOpen ? 'Close badge search' : 'Search badges'} aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setQuery(''); }}>
          {searchOpen ? <X size={19} /> : <Search size={19} />}
        </button>
      </div>
      {searchOpen && (
        <div className="badge-gallery-search">
          <Search size={16} aria-hidden="true" />
          <input autoFocus aria-label="Search achievements" placeholder="Search badges or species" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}
      <div className="badge-category-bar" aria-label="Achievement categories">
        {CATEGORIES.map(cat => (
          <button type="button" key={cat.id} aria-pressed={category === cat.id} className={category === cat.id ? 'active' : ''} onClick={() => { setCategory(cat.id); setSelectedId(null); }}>
            {cat.label}
          </button>
        ))}
      </div>
      <div className="badge-collection-summary">
        <span><strong>{earnedCount}</strong> / {achievements.length} achieved</span>
        <button type="button" aria-pressed={earnedOnly} onClick={() => setEarnedOnly(!earnedOnly)} className={earnedOnly ? 'active' : ''}><Check size={13} /> Achieved only</button>
      </div>
      <div className="badge-collection">
        {rows.map((row, rowIndex) => (
          <Fragment key={rowIndex}>
            <div className="badge-collection-row">
              {row.map(item => (
                <button type="button" className={`badge-collection-item ${item.id === selected?.id ? 'is-selected' : ''} ${item.unlocked ? 'is-earned' : ''}`} key={item.id}
                  onClick={() => setSelectedId(item.id)} aria-pressed={item.id === selected?.id} aria-controls="selected-badge-detail" aria-label={`${item.title}, ${item.unlocked ? 'achieved' : 'locked'}`}>
                  <AchievementBadge item={item} selected={item.id === selected?.id} />
                  <span className="badge-name">{item.id === 'catches_1' ? 'First Catch' : item.title}</span>
                </button>
              ))}
            </div>
            {selected && row.some(item => item.id === selected.id) && (
              <section className={`badge-detail-panel ${selected.unlocked ? 'is-achieved' : ''}`} id="selected-badge-detail" aria-labelledby="selected-badge-title" style={{ '--badge-pointer': `${12.5 + row.findIndex(item => item.id === selected.id) * 25}%` } as CSSProperties}>
                <AchievementBadge item={selected} selected={selected.unlocked} />
                <div className="badge-detail-copy">
                  <h2 id="selected-badge-title">{selected.id === 'catches_1' ? 'First Catch' : selected.title}</h2>
                  <p>{selected.description}</p>
                  <strong className="badge-detail-progress">{selected.unit === 'lb' && unitSystem === 'metric' ? `${metricPounds(selected.current)} / ${metricPounds(selected.target / 16)} kg` : `${selected.current} / ${selected.unit === 'lb' ? selected.target / 16 : selected.target}${selected.unit ? ` ${selected.unit}` : ''}`}</strong>
                  {selected.unlocked ? (
                    <>
                      <span className="badge-achieved-status"><Check size={15} /> Achieved</span>
                      <button type="button" className="badge-equip-action" onClick={() => actions.setEquippedAchievement(equippedAchievementId === selected.id ? null : selected.id)}>
                        {equippedAchievementId === selected.id ? 'Unequip profile badge' : 'Equip on profile'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="badge-detail-track" role="progressbar" aria-label={`${selected.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={selected.progress}>
                        <span style={{ width: `${selected.progress}%` }} />
                      </div>
                      <span className="badge-locked-status">Keep going to unlock this badge</span>
                    </>
                  )}
                </div>
              </section>
            )}
          </Fragment>
        ))}
        {!filtered.length && <div className="badge-empty"><Trophy size={30} /><h2>No badges found</h2><p>Try another category or change your filters.</p><button type="button" onClick={() => { setCategory('all'); setQuery(''); setEarnedOnly(false); }}>Show all badges</button></div>}
      </div>
      <Link to="/profile" className="badge-profile-link"><ArrowLeft size={15} /> Back to profile</Link>
    </div>
  );
};

export default AchievementsPage;

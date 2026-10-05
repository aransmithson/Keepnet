import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Clock, Fish, Globe, Heart, Images, Lock, MapPin, MessageSquare, MoreHorizontal, Plus } from 'lucide-react';
import { actions, fmtDay, fmtTime, fmtWeight, useStore, type Catch } from './store';
import { fetchCatchComments, fetchCatchLikes } from './cloud';
import './HomeDashboard.css';

function RecentCatchCard({ catchItem, commentCount }: { catchItem: Catch; commentCount?: number }) {
  const { catchLikes = {}, likedCatchIds = [] } = useStore();
  const photos = [...new Set([catchItem.image, ...(catchItem.images || [])].filter((photo): photo is string => Boolean(photo)))];
  const shared = catchItem.isShared && !catchItem.isConfidential;
  const liked = likedCatchIds.includes(catchItem.id);
  const likes = catchLikes[catchItem.id] ?? catchItem.likesCount ?? 0;
  const reportUrl = `/catches/${catchItem.id}`;
  return (
    <article className="home-catch-card" id={`home-catch-${catchItem.id}`}>
      <Link to={reportUrl} className={`home-catch-photo ${photos.length ? '' : 'without-photo'}`} aria-label={`View ${catchItem.species} catch photos`}>
        {photos.length ? <><img src={photos[0]} alt={catchItem.species} loading="lazy" /><span className="home-catch-photo-count"><Images size={13} />{photos.length}</span></> : <><Fish size={33} strokeWidth={1.4} /><span>No catch photo</span></>}
      </Link>
      <div className="home-catch-body">
        <Link to={reportUrl} className="home-catch-report" aria-label={`View ${catchItem.species}, ${fmtWeight(catchItem)}`}>
          <div className="home-catch-heading"><h3>{catchItem.species}</h3><span className={`home-catch-visibility ${shared ? 'shared' : 'private'}`}>{shared ? <Globe size={11} /> : <Lock size={11} />}{shared ? 'Shared' : 'Private'}</span></div>
          <strong className="home-catch-weight">{fmtWeight(catchItem)}</strong>
          <span className="home-catch-bait">{catchItem.bait || 'Bait not logged'}</span>
          <ChevronRight size={18} className="home-catch-chevron" />
        </Link>
        <div className="home-catch-footer">
          <span className="home-catch-date" title={new Date(catchItem.caughtAt).toLocaleString('en-GB')}><Clock size={16} />{fmtDay(catchItem.caughtAt)}</span>
          {shared && <div className="home-catch-reactions">
            <button className={liked ? 'liked' : ''} aria-pressed={liked} aria-label={`${liked ? 'Unlike' : 'Like'} ${catchItem.species} catch, ${likes} likes`} onClick={() => {
              if (catchLikes[catchItem.id] === undefined) actions.setCatchLikes(catchItem.id, likes);
              actions.toggleCatchLike(catchItem.id);
            }}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /><span>{likes}</span></button>
            <Link to={`${reportUrl}#comments-section`} aria-label={`View comments on ${catchItem.species} catch${commentCount === undefined ? '' : `, ${commentCount} comments`}`}><MessageSquare size={16} /><span>{commentCount ?? '—'}</span></Link>
          </div>}
        </div>
      </div>
      <details className="home-catch-menu"><summary aria-label={`Options for ${catchItem.species} catch`}><MoreHorizontal size={20} /></summary><div><Link to={reportUrl}>View catch <ChevronRight size={14} /></Link><Link to={`/sessions/${catchItem.sessionId}`}>View session <MapPin size={14} /></Link></div></details>
    </article>
  );
}

export default function HomeDashboard({ onStart, onLogCatch }: { onStart: () => void; onLogCatch: (sessionId: string) => void }) {
  const { sessions, catches } = useStore();
  const active = sessions.find(session => !session.endedAt);
  const recent = useMemo(() => [...catches].sort((a, b) => new Date(b.caughtAt).getTime() - new Date(a.caughtAt).getTime()).slice(0, 3), [catches]);
  const sharedIds = JSON.stringify(recent.filter(catchItem => catchItem.isShared && !catchItem.isConfidential).map(catchItem => catchItem.id));
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids: string[] = JSON.parse(sharedIds);
    if (!ids.length) return;
    let cancelled = false;
    fetchCatchLikes().then(likes => { if (!cancelled && Object.keys(likes).length) actions.setAllCatchLikes(likes); });
    for (const id of ids) {
      fetchCatchComments(id).then(comments => { if (!cancelled) setCommentCounts(current => ({ ...current, [id]: comments.length })); });
    }
    return () => { cancelled = true; };
  }, [sharedIds]);

  return (
    <main className="content home-dashboard">
      <header className="home-journal-hero"><h1>Time by the water.</h1><p>Your personal fishing journal</p></header>
      <section className={`home-session-panel ${active ? 'in-progress' : ''}`} id={active ? 'active-session-card' : undefined} aria-labelledby="home-session-title">
        <div className="home-session-copy"><span className="home-session-icon"><MapPin size={24} /></span><div><span className="home-session-eyebrow">{active ? <><span className="live-dot" />Session in progress</> : 'Start fishing'}</span><h2 id="home-session-title">{active ? active.venueName : 'Ready for your next session?'}</h2><p>{active ? `Started ${fmtTime(active.startedAt)}${active.weather ? ` · ${Math.round(active.weather.temperature)}°C · ${active.weather.description}` : ''}` : 'Log your swim, capture live weather conditions via GPS, and record every catch.'}</p></div></div>
        {active ? <><button className="home-session-action" id="home-log-catch-btn" onClick={() => onLogCatch(active.id)}><Fish size={21} /><span>Log a catch now</span><ChevronRight size={20} /></button><Link className="home-resume-session" to={`/sessions/${active.id}`}>View session <ChevronRight size={15} /></Link></> : <button className="home-session-action" id="start-session-btn" onClick={onStart}><Plus size={23} /><span>New Fishing Session</span><ChevronRight size={20} /></button>}
      </section>
      <section className="home-recent-catches" aria-labelledby="home-recent-title">
        <div className="home-recent-heading"><h2 id="home-recent-title">Recent catches</h2>{catches.length > 0 && <Link to="/sessions?tab=catches">View all catches <ChevronRight size={17} /></Link>}</div>
        {recent.length ? <div className="home-catch-list">{recent.map(catchItem => <RecentCatchCard key={catchItem.id} catchItem={catchItem} commentCount={commentCounts[catchItem.id]} />)}</div> : <div className="home-catches-empty"><Fish size={31} strokeWidth={1.5} /><h3>No catches logged yet</h3><p>{active ? 'Log your first catch from the session above.' : 'Start a session to log your first catch by the water.'}</p></div>}
      </section>
    </main>
  );
}

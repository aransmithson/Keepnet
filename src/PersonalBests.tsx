import { Link } from 'react-router-dom';
import { ChevronRight, Fish, MapPin, Trophy } from 'lucide-react';
import { fmtDay, fmtWeight, type Catch, type Session } from './store';
import './Profile.css';

export default function PersonalBests({ records, sessions }: { records: Catch[]; sessions: Session[] }) {
  const biggest = records[0];
  const venue = (catchRecord: Catch) => sessions.find(session => session.id === catchRecord.sessionId)?.venueName;
  return (
    <section className="profile-personal-bests" aria-labelledby="personal-bests-title">
      <div className="personal-bests-heading">
        <div>
          <h2 id="personal-bests-title"><Trophy size={21} /> Personal bests</h2>
          <p>Your best catch for every species.</p>
        </div>
        {records.length > 0 && <span className="personal-bests-count">{records.length} species</span>}
      </div>
      {biggest ? (
        <>
          <Link to={`/catches/${biggest.id}`} className={`personal-best-feature ${biggest.image ? 'has-photo' : ''}`} aria-label={`View your biggest fish: ${biggest.species}, ${fmtWeight(biggest)}`}>
            {biggest.image ? <img src={biggest.image} alt={biggest.species} /> : <Fish className="personal-best-feature-fish" size={110} strokeWidth={1} aria-hidden="true" />}
            <div className="personal-best-feature-copy">
              <span className="personal-best-feature-label"><Trophy size={14} /> Biggest fish</span>
              <h3>{biggest.species}</h3>
              <strong>{fmtWeight(biggest)}</strong>
              <span className="personal-best-feature-date">{venue(biggest) ? `${venue(biggest)} · ` : ''}{fmtDay(biggest.caughtAt)}</span>
            </div>
            <span className="personal-best-open"><ChevronRight size={20} /></span>
          </Link>
          <div className="personal-bests-grid">
            {records.map(record => (
              <Link to={`/catches/${record.id}`} className="personal-best-record" key={record.id} aria-label={`${record.species} personal best: ${fmtWeight(record)}`}>
                <div className="personal-best-photo">
                  {record.image ? <img src={record.image} alt={record.species} loading="lazy" /> : <Fish size={38} strokeWidth={1.4} aria-hidden="true" />}
                  <span className="personal-best-marker"><Trophy size={11} /> PB</span>
                </div>
                <div className="personal-best-record-copy">
                  <h3>{record.species}</h3>
                  <strong>{fmtWeight(record)}</strong>
                  {venue(record) && <span className="personal-best-venue"><MapPin size={11} /> {venue(record)}</span>}
                  <span className="personal-best-date">{fmtDay(record.caughtAt)}</span>
                  <span className="personal-best-view">View catch <ChevronRight size={12} /></span>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="card personal-bests-empty">
          <Trophy size={34} strokeWidth={1.4} />
          <h3>Your records start here</h3>
          <p>Log a catch with its weight to start your personal best collection.</p>
          <Link to="/sessions" className="btn-secondary">Go to your journal <ChevronRight size={15} /></Link>
        </div>
      )}
    </section>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Send, Crown, Trash2, Sparkles, AlertCircle, RefreshCw, MessageSquare, Lock } from 'lucide-react';
import { usePremiumMembership, useMembershipPending } from './membership';
import { useAuth, isUserAdmin } from './auth';
import { fetchCatchComments, postCatchComment, deleteCatchComment, type CatchComment } from './cloud';
import { fmtDay, fmtTime } from './store';
import Avatar from './Avatar';
import { getAccountScope } from './accountScope';

export const CatchComments = ({ catchId, isSharedCatch = false, catchSpecies, onCountChange }: {
  catchId: string; isSharedCatch?: boolean; catchSpecies?: string; onCountChange?: (count: number) => void;
}) => {
  const { user } = useAuth();
  const premium = usePremiumMembership();
  const membershipPending = useMembershipPending();
  const [comments, setComments] = useState<CatchComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const countRef = useRef(onCountChange);
  const requestGeneration = useRef(0);
  useEffect(() => { countRef.current = onCountChange; }, [onCountChange]);

  useEffect(() => {
    let cancelled = false;
    const generation = ++requestGeneration.current;
    const scope = getAccountScope();
    const isCurrent = () => !cancelled && generation === requestGeneration.current && scope === getAccountScope();
    setComments([]);
    setCommentText('');
    setSubmitting(false);
    setDeletingId(null);
    setError(null);
    setLoadError(false);
    if (!isSharedCatch || catchId.startsWith('sample-')) {
      setLoading(false);
      countRef.current?.(0);
      return () => { cancelled = true; requestGeneration.current++; };
    }
    setLoading(true);
    fetchCatchComments(catchId).then(data => {
      if (isCurrent()) { setComments(data); countRef.current?.(data.length); }
    }).catch(() => {
      if (isCurrent()) { setError('Comments could not load. Check your connection and try again.'); setLoadError(true); }
    }).finally(() => { if (isCurrent()) setLoading(false); });
    return () => { cancelled = true; requestGeneration.current++; };
  }, [catchId, isSharedCatch, retry, user?.id]);

  const sorted = useMemo(() => [...comments].sort((a, b) => {
    const difference = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return order === 'newest' ? difference : -difference;
  }), [comments, order]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentText.trim() || submitting || loading || deletingId) return;
    if (!user || !premium || !isSharedCatch) { setError('Sign in with an active Premium membership to comment on a shared catch.'); return; }
    setSubmitting(true);
    setError(null);
    const generation = requestGeneration.current;
    const scope = getAccountScope();
    const isCurrent = () => generation === requestGeneration.current && scope === getAccountScope();
    try {
      const result = await postCatchComment(catchId, commentText.trim());
      if (!isCurrent()) return;
      if (!result.success || !result.comment) { setError(result.error || 'Your comment could not be posted. Please try again.'); return; }
      const next = [...comments.filter(comment => comment.id !== result.comment!.id), result.comment];
      setComments(next);
      countRef.current?.(next.length);
      setCommentText('');
    } catch { if (isCurrent()) setError('Your comment could not be posted. Check your connection and try again.'); }
    finally { if (isCurrent()) setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (deletingId || submitting || !window.confirm('Delete this comment?')) return;
    setDeletingId(id);
    setError(null);
    const generation = requestGeneration.current;
    const scope = getAccountScope();
    const isCurrent = () => generation === requestGeneration.current && scope === getAccountScope();
    try {
      const deleted = await deleteCatchComment(id);
      if (!isCurrent()) return;
      if (!deleted) { setError('The comment could not be deleted. Please try again.'); return; }
      const next = comments.filter(comment => comment.id !== id);
      setComments(next);
      countRef.current?.(next.length);
    } catch { if (isCurrent()) setError('The comment could not be deleted. Check your connection and try again.'); }
    finally { if (isCurrent()) setDeletingId(null); }
  };

  return <section className="card catch-comments-section" aria-labelledby="catch-comments-title">
    <div className="comments-heading">
      <h2 id="catch-comments-title">Comments{!loadError && ` (${loading ? '…' : comments.length})`}</h2>
      {comments.length > 1 && <label className="comments-sort"><span className="sr-only">Sort comments</span><select value={order} onChange={event => setOrder(event.target.value as 'newest' | 'oldest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>}
    </div>
    {!isSharedCatch ? <p className="comments-private"><Lock size={17} aria-hidden="true" /> This catch is private. Public discussions are available on shared catches.</p> : catchId.startsWith('sample-') ? <p className="muted">This is an example catch. Discussions are available on community members' shared catches.</p> : <>
      {error && <div className="auth-message error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{error}</span>{loadError && <button type="button" className="link-button" onClick={() => setRetry(value => value + 1)}>Retry</button>}</div>}
      {user && premium ? <form onSubmit={handleSubmit} className="comment-compose">
        <div className="comment-compose-row"><Avatar name={user.nickname || user.name} label="Your avatar" /><label className="comment-compose-input"><span className="sr-only">Comment on {catchSpecies || 'this catch'}</span><textarea rows={2} placeholder="Add a comment or rig advice…" value={commentText} onChange={event => setCommentText(event.target.value)} maxLength={1000} disabled={submitting} /></label></div>
        <div className="comment-compose-footer"><span>{commentText.length} / 1000</span><button type="submit" className="btn-primary" disabled={submitting || loading || deletingId !== null || !commentText.trim()}>{submitting ? <RefreshCw size={16} className="spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{submitting ? 'Posting…' : 'Post comment'}</button></div>
      </form> : <div className="comments-access">
        <p role={membershipPending ? 'status' : undefined}>{membershipPending ? 'Checking membership… You can read the discussion while Keepnet connects.' : user ? 'Premium members can add comments and rig advice. Everyone can read the discussion.' : 'Sign in to take part in community discussions.'}</p>
        <Link to={user ? '/subscription' : '/settings'} className="btn-secondary">{membershipPending ? 'Membership details' : user ? <><Sparkles size={16} /> Unlock Premium · 1-Month Free Trial</> : 'Sign in'}</Link>
      </div>}
      {loading ? <p className="comments-loading" role="status"><RefreshCw size={17} className="spin" aria-hidden="true" /> Loading comments…</p> : !loadError && !comments.length ? <div className="comments-empty"><MessageSquare size={25} aria-hidden="true" /><p>No comments yet.</p></div> : <div className="comment-list">{sorted.map(comment => <article className="comment-thread-item" key={comment.id}>
        <Avatar name={comment.user_name} />
        <div className="comment-copy"><div className="comment-byline"><strong>{comment.user_name || 'Angler'}</strong>{comment.is_premium === 1 && <span className="mini-badge comment-member-badge"><Crown size={11} aria-hidden="true" /> Premium</span>}<time dateTime={comment.created_at}>{fmtDay(comment.created_at)} · {fmtTime(comment.created_at)}</time></div><p>{comment.comment}</p></div>
        {user && (user.id === comment.user_id || isUserAdmin(user)) && <button className="icon-btn comment-delete" type="button" onClick={() => handleDelete(comment.id)} disabled={deletingId !== null || submitting} aria-label={`Delete comment by ${comment.user_name || 'Angler'}`}>{deletingId === comment.id ? <RefreshCw size={16} className="spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}</button>}
      </article>)}</div>}
    </>}
  </section>;
};

export default CatchComments;

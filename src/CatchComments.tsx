import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare, Send, Crown, Trash2, Sparkles, AlertCircle, RefreshCw, User
} from 'lucide-react';
import { actions, useStore } from './store';
import { useAuth } from './auth';
import { fetchCatchComments, postCatchComment, deleteCatchComment, type CatchComment } from './cloud';

export const CatchComments = ({
  catchId,
  isSharedCatch = false,
  catchSpecies,
}: {
  catchId: string;
  isSharedCatch?: boolean;
  catchSpecies?: string;
}) => {
  const store = useStore();
  const { user } = useAuth();
  const isPremiumActive = actions.isPremium() || store.subscriptionTier === 'premium';

  const [comments, setComments] = useState<CatchComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadComments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCatchComments(catchId);
      setComments(data);
    } catch {
      setError('Unable to load comments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [catchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    if (!user) {
      setError('Please sign in to post comments.');
      return;
    }

    if (!isPremiumActive) {
      setError('Commenting is reserved strictly for Keepnet Premium members.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await postCatchComment(catchId, commentText.trim());
    if (res.success && res.comment) {
      setComments((prev) => [...prev, res.comment!]);
      setCommentText('');
    } else {
      setError(res.error || 'Failed to post comment');
    }
    setSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    setDeletingId(commentId);
    const success = await deleteCatchComment(commentId);
    if (success) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } else {
      alert('Failed to delete comment');
    }
    setDeletingId(null);
  };

  const isOwnerOrAdmin = (commentUserId: string) => {
    if (!user) return false;
    return user.id === commentUserId || user.email === 'aransmithson@gmail.com' || user.email === 'aransmithson@googlemail.com' || !!user.isAdmin;
  };

  return (
    <div className="card catch-comments-section" style={{ marginTop: 14, padding: '18px 16px' }}>
      {/* Header */}
      <div className="row-between" style={{ alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'rgba(201, 119, 43, 0.12)',
              color: 'var(--copper)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MessageSquare size={16} />
          </div>
          <div>
            <h3 className="serif" style={{ margin: 0, fontSize: 16 }}>
              Angler Discussion &amp; Tactics
            </h3>
            <span className="muted" style={{ fontSize: 11 }}>
              {isSharedCatch ? 'Community tactical notes & rig advice' : 'Specimen Suite catch feedback'}
            </span>
          </div>
        </div>

        <span className="count-pill" style={{ background: 'var(--surface-sunken)', fontSize: 11 }}>
          {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
        </span>
      </div>

      {error && (
        <div className="auth-message error" style={{ margin: '0 0 12px', fontSize: 12 }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <RefreshCw size={18} className="spin" style={{ color: 'var(--accent-green)', margin: '0 auto 6px' }} />
          <div className="muted" style={{ fontSize: 12 }}>Loading angler comments...</div>
        </div>
      ) : comments.length === 0 ? (
        <div
          style={{
            padding: '16px',
            background: 'var(--surface-sunken)',
            borderRadius: 10,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          <MessageSquare size={22} className="muted" style={{ margin: '0 auto 6px', opacity: 0.6 }} />
          <p className="muted" style={{ fontSize: 13, margin: '0 0 4px' }}>
            No comments on this {catchSpecies || 'catch'} report yet.
          </p>
          <span className="muted" style={{ fontSize: 11 }}>
            {isPremiumActive
              ? 'Be the first Premium specimen hunter to share tactical feedback or ask about the swim!'
              : 'Keepnet Premium members can leave tactical advice and rig discussions.'}
          </span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10, marginBottom: 16 }}>
          {comments.map((cmt) => (
            <div
              key={cmt.id}
              className="catch-comment-item"
              style={{
                padding: '10px 12px',
                background: 'var(--surface-sunken)',
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                fontSize: 13,
              }}
            >
              <div className="row-between" style={{ alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'rgba(1, 71, 49, 0.12)',
                      color: 'var(--accent-green)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {cmt.user_name ? cmt.user_name.charAt(0).toUpperCase() : <User size={12} />}
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                    {cmt.user_name}
                  </span>
                  <span
                    className="mini-badge"
                    style={{
                      borderColor: 'rgba(201, 119, 43, 0.4)',
                      background: 'rgba(201, 119, 43, 0.1)',
                      color: 'var(--copper)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 10,
                      padding: '1px 6px',
                    }}
                  >
                    <Crown size={9} /> Specimen Pro
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="muted" style={{ fontSize: 10 }}>
                    {new Date(cmt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  {isOwnerOrAdmin(cmt.user_id) && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 22, height: 22, color: 'var(--muted)' }}
                      onClick={() => handleDelete(cmt.id)}
                      disabled={deletingId === cmt.id}
                      title="Delete comment"
                      aria-label="Delete comment"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.45, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {cmt.comment}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Input or Locked Gating Banner */}
      {isPremiumActive ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea
              rows={2}
              className="comment-textarea"
              placeholder={`Share tactical advice, rig feedback, or congratulate ${catchSpecies ? `on this ${catchSpecies}` : 'the angler'}...`}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={1000}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--card-bg)',
                color: 'var(--text-primary)',
                fontSize: 13,
                resize: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !commentText.trim()}
              style={{ height: 42, padding: '0 14px', fontSize: 12, gap: 5, alignSelf: 'flex-end' }}
            >
              {submitting ? <RefreshCw size={13} className="spin" /> : <Send size={13} />}
              <span>Post</span>
            </button>
          </div>
          <div className="row-between" style={{ fontSize: 11, color: 'var(--muted)', padding: '0 4px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--copper)' }}>
              <Crown size={11} /> Keepnet Premium Member Discussion
            </span>
            <span>{commentText.length} / 1000</span>
          </div>
        </form>
      ) : (
        /* Locked Feature Banner for Lite / Non-Subscribers */
        <div
          className="card"
          style={{
            background: 'linear-gradient(135deg, rgba(201, 119, 43, 0.08), rgba(1, 71, 49, 0.04))',
            border: '1px solid rgba(201, 119, 43, 0.35)',
            padding: '14px 16px',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--copper)', marginBottom: 4 }}>
            <Crown size={16} />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Keepnet Premium Discussion
            </span>
          </div>
          <h4 className="serif" style={{ margin: '0 0 4px', fontSize: 15 }}>
            Join the Conversation with Keepnet Premium
          </h4>
          <p className="muted" style={{ fontSize: 12, maxWidth: 460, margin: '0 auto 12px', lineHeight: 1.45 }}>
            Tactical notes, bait queries, swim discussions, and angler feedback are exclusive to Keepnet Premium members (£1.49/mo or £10.49/yr).
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Link
              to="/subscription"
              className="btn-primary"
              style={{ fontSize: 12, height: 34, padding: '0 14px', gap: 6, textDecoration: 'none' }}
            >
              <Sparkles size={13} />
              <span>Unlock Premium · 1-Month Free Trial</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatchComments;

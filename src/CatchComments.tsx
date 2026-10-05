import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Send, Crown, Trash2, Sparkles, AlertCircle, RefreshCw, User,
  Heart, CheckCircle2, MoreHorizontal
} from 'lucide-react';
import { actions, useStore } from './store';
import { useAuth } from './auth';
import { fetchCatchComments, postCatchComment, deleteCatchComment, type CatchComment } from './cloud';

interface ThreadedComment {
  id: string;
  userName: string;
  avatar?: string;
  isVerified?: boolean;
  timeAgo: string;
  comment: string;
  likes: number;
  replies?: Array<{
    id: string;
    userName: string;
    avatar?: string;
    isVerified?: boolean;
    timeAgo: string;
    comment: string;
    likes: number;
  }>;
}

const DEFAULT_THREADED_COMMENTS: Record<string, ThreadedComment[]> = {
  'sample-pike-1': [
    {
      id: 'tc-1',
      userName: 'TomL',
      avatar: '/images/avatar-tom.jpg',
      timeAgo: 'Yesterday at 17:22',
      comment: 'Cracking fish mate! What colour slider was that?',
      likes: 3,
      replies: [
        {
          id: 'tc-1-reply',
          userName: 'Aran',
          avatar: '/images/avatar-aran.jpg',
          isVerified: true,
          timeAgo: 'Yesterday at 17:35',
          comment: 'Thanks! It was the silver/black one with a red head. Been deadly lately.',
          likes: 2,
        },
      ],
    },
    {
      id: 'tc-2',
      userName: 'SophieT',
      avatar: '/images/catch-sophie-pike.jpg',
      timeAgo: '2 days ago',
      comment: 'Lovely fish! Wyreside is fishing well at the moment. 🎣',
      likes: 4,
    },
    {
      id: 'tc-3',
      userName: 'CarpDan',
      avatar: '/images/avatar-tom.jpg',
      timeAgo: '3 days ago',
      comment: 'Great result! Those sliders are unreal for pike.',
      likes: 2,
    },
  ],
};

export const CatchComments = ({
  catchId,
  isSharedCatch: _isSharedCatch = false,
  catchSpecies: _catchSpecies,
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

  // Thread comment like toggles
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

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

  const toggleCommentLike = (id: string) => {
    setLikedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const mockThreads = DEFAULT_THREADED_COMMENTS[catchId] || DEFAULT_THREADED_COMMENTS['sample-pike-1'];
  const totalCommentsCount = comments.length > 0 ? comments.length : (catchId.startsWith('sample-') ? 8 : comments.length);

  return (
    <div className="card catch-comments-section" style={{ marginTop: 14, padding: '16px' }}>
      {/* Header (Mobile Screen 3) */}
      <div className="row-between" style={{ alignItems: 'center', marginBottom: 14 }}>
        <h3 className="serif" style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Comments ({totalCommentsCount})</span>
        </h3>
        <span className="muted" style={{ fontSize: 11, cursor: 'pointer' }}>
          Newest first ▾
        </span>
      </div>

      {error && (
        <div className="auth-message error" style={{ margin: '0 0 12px', fontSize: 12 }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Input or Locked Gating Banner (Mobile Screen 3) */}
      {isPremiumActive ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <img
              src="/images/avatar-aran.jpg"
              alt="You"
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
            />
            <input
              type="text"
              className="sidebar-search-input"
              placeholder={`Add a tactical comment or rig advice...`}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={1000}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 20,
                border: '1px solid var(--border-color)',
                background: 'var(--surface-sunken)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !commentText.trim()}
              style={{ height: 34, padding: '0 12px', fontSize: 12, borderRadius: 17, gap: 4 }}
            >
              {submitting ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
              <span>Post</span>
            </button>
          </div>
          <div className="row-between" style={{ fontSize: 10.5, color: 'var(--muted)', padding: '0 4px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--copper)' }}>
              <Crown size={11} /> Specimen Pro Angler Discussion
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
            padding: '12px 14px',
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, color: 'var(--copper)', marginBottom: 2 }}>
            <Crown size={14} />
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Keepnet Premium Discussion
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '2px auto 10px', lineHeight: 1.4 }}>
            Commenting, rig notes, and tactical feedback are exclusive to Keepnet Premium members (£1.49/mo).
          </p>
          <Link
            to="/subscription"
            className="btn-primary"
            style={{ fontSize: 12, height: 32, padding: '0 14px', gap: 6, textDecoration: 'none', display: 'inline-flex' }}
          >
            <Sparkles size={12} />
            <span>Unlock Premium · 1-Month Free Trial</span>
          </Link>
        </div>
      )}

      {/* Comments List (Mobile Screen 3) */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <RefreshCw size={16} className="spin" style={{ color: 'var(--accent-green)', margin: '0 auto 6px' }} />
          <div className="muted" style={{ fontSize: 12 }}>Loading comments...</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {/* 1. Threaded mock comments if viewing featured catches or empty */}
          {(catchId.startsWith('sample-') || comments.length === 0) &&
            mockThreads.map((thread) => {
              const isLiked = !!likedMap[thread.id];
              const likeCount = thread.likes + (isLiked ? 1 : 0);

              return (
                <div key={thread.id} className="comment-thread-item">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <img
                      src={thread.avatar || '/images/avatar-tom.jpg'}
                      alt={thread.userName}
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row-between" style={{ alignItems: 'center', marginBottom: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                            {thread.userName}
                          </span>
                          {thread.isVerified && (
                            <CheckCircle2 size={12} fill="#2EB872" color="#fff" />
                          )}
                          <span className="muted" style={{ fontSize: 11 }}>
                            {thread.timeAgo}
                          </span>
                        </div>
                        <button type="button" className="icon-btn" style={{ width: 20, height: 20, color: 'var(--muted)' }}>
                          <MoreHorizontal size={13} />
                        </button>
                      </div>

                      <p style={{ margin: '2px 0 6px', fontSize: 13, lineHeight: 1.45, color: 'var(--text-primary)' }}>
                        {thread.comment}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <button
                          type="button"
                          className="comment-reply-btn"
                          onClick={() => toggleCommentLike(thread.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: isLiked ? '#ef4444' : undefined }}
                        >
                          <Heart size={12} fill={isLiked ? '#ef4444' : 'none'} />
                          <span>{likeCount}</span>
                        </button>
                        <button type="button" className="comment-reply-btn">
                          Reply
                        </button>
                      </div>

                      {/* Nested reply (Mobile Screen 3) */}
                      {thread.replies && thread.replies.map((reply) => {
                        const isReplyLiked = !!likedMap[reply.id];
                        const replyLikeCount = reply.likes + (isReplyLiked ? 1 : 0);

                        return (
                          <div key={reply.id} className="comment-reply-nested">
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <img
                                src={reply.avatar || '/images/avatar-aran.jpg'}
                                alt={reply.userName}
                                style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                  <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                                    {reply.userName}
                                  </span>
                                  {reply.isVerified && (
                                    <CheckCircle2 size={11} fill="#2EB872" color="#fff" />
                                  )}
                                  <span className="muted" style={{ fontSize: 10.5 }}>
                                    {reply.timeAgo}
                                  </span>
                                </div>
                                <p style={{ margin: '2px 0 4px', fontSize: 12.5, lineHeight: 1.4, color: 'var(--text-primary)' }}>
                                  {reply.comment}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10.5, color: 'var(--text-secondary)' }}>
                                  <button
                                    type="button"
                                    className="comment-reply-btn"
                                    onClick={() => toggleCommentLike(reply.id)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: isReplyLiked ? '#ef4444' : undefined }}
                                  >
                                    <Heart size={11} fill={isReplyLiked ? '#ef4444' : 'none'} />
                                    <span>{replyLikeCount}</span>
                                  </button>
                                  <button type="button" className="comment-reply-btn">
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

          {/* 2. Cloudflare D1 real comments */}
          {comments.map((cmt) => (
            <div key={cmt.id} className="comment-thread-item">
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'rgba(1, 71, 49, 0.12)',
                    color: 'var(--accent-green)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {cmt.user_name ? cmt.user_name.charAt(0).toUpperCase() : <User size={14} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row-between" style={{ alignItems: 'center', marginBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                        {cmt.user_name}
                      </span>
                      <span
                        className="mini-badge"
                        style={{
                          borderColor: 'rgba(201, 119, 43, 0.4)',
                          background: 'rgba(201, 119, 43, 0.1)',
                          color: 'var(--copper)',
                          fontSize: 9.5,
                          padding: '1px 5px',
                        }}
                      >
                        <Crown size={8} /> Pro
                      </span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {new Date(cmt.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>

                    {isOwnerOrAdmin(cmt.user_id) && (
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: 20, height: 20, color: 'var(--muted)' }}
                        onClick={() => handleDelete(cmt.id)}
                        disabled={deletingId === cmt.id}
                        title="Delete comment"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  <p style={{ margin: '2px 0 6px', fontSize: 13, lineHeight: 1.45, color: 'var(--text-primary)' }}>
                    {cmt.comment}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CatchComments;

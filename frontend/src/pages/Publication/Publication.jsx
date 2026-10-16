import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, date, useResource } from "../../hooks/api";
import { useApp } from "../../components/context";
import {
  Avatar,
  Empty,
  Feedback,
  Modal,
  RichBody,
} from "../../components/Common";
import PublicationCard, {
  PublicationActions,
  PublicationMenu,
} from "../../components/PublicationCard";
import "./Publication.css";
import { invalidateFeeds } from "../../hooks/feedCache";
function Comments({ publication, onCount }) {
  const { user, requireUser, toast } = useApp(),
    [items, setItems] = useState([]),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [body, setBody] = useState(""),
    [reply, setReply] = useState(null),
    [editing, setEditing] = useState(null),
    [remove, setRemove] = useState(null),
    [report, setReport] = useState(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/publications/${publication.id}/comments?page=${page}`)
      .then((data) => {
        if (active) {
          setItems((old) =>
            page === 1
              ? data.items
              : [
                  ...old,
                  ...data.items.filter((n) => !old.some((o) => o.id === n.id)),
                ],
          );
          setHasMore(data.hasMore);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [publication.id, page, version]);
  const anchored = useRef(false);
  useEffect(() => {
    if (loading || anchored.current || !window.location.hash) return;
    const node = document.getElementById(
      decodeURIComponent(window.location.hash.slice(1)),
    );
    if (node) {
      node.scrollIntoView({ block: "start" });
      anchored.current = true;
    }
  }, [loading, items]);
  function reload() {
    setPage(1);
    setVersion((n) => n + 1);
    onCount();
  }
  async function submit(e) {
    e.preventDefault();
    if (!requireUser() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(
        editing
          ? `/comments/${editing.id}`
          : `/publications/${publication.id}/comments`,
        {
          method: editing ? "PATCH" : "POST",
          body: { body, parent_id: reply?.id },
        },
      );
      setBody("");
      setReply(null);
      setEditing(null);
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="comments" id="comments">
      <h2>
        The conversation{" "}
        <span className="muted">{publication.comment_count}</span>
      </h2>
      <form onSubmit={submit}>
        {reply && (
          <p className="muted">
            Replying to {reply.author_name}{" "}
            <button type="button" onClick={() => setReply(null)}>
              Cancel reply
            </button>
          </p>
        )}
        {editing && (
          <p>
            Editing your comment{" "}
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setBody("");
              }}
            >
              Cancel edit
            </button>
          </p>
        )}
        <label>
          <span className="sr-only">Your comment</span>
          <textarea
            rows={3}
            maxLength={4000}
            required
            placeholder="Add a thoughtful perspective…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy
            ? "Saving…"
            : editing
              ? "Save changes"
              : "Join the conversation"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items.map((c) => (
        <article
          className={`comment ${c.parent_id ? "reply" : ""}`}
          id={`comment-${c.id}`}
          key={c.id}
        >
          <div className="byline">
            <Link to={`/u/${c.author_handle}`}>
              <Avatar
                user={{ name: c.author_name, avatar_url: c.author_avatar }}
              />
              {c.author_name}
            </Link>
            <time>{date(c.created_at)}</time>
          </div>
          {c.parent_id && (
            <p className="muted reply-context">
              Reply to{" "}
              {items.find((x) => x.id === c.parent_id)?.author_name ||
                "an earlier comment"}
            </p>
          )}
          <p className="comment-body">{c.body}</p>
          <div className="actions">
            <button
              onClick={() => {
                if (requireUser()) {
                  setReply(c);
                  setEditing(null);
                  setBody("");
                  document.querySelector("#comments textarea")?.focus();
                }
              }}
            >
              Reply
            </button>
            {user?.id === c.author_id && (
              <button
                onClick={() => {
                  setEditing(c);
                  setReply(null);
                  setBody(c.body);
                  document.querySelector("#comments textarea")?.focus();
                }}
              >
                Edit
              </button>
            )}
            {(user?.id === c.author_id ||
              user?.id === publication.author_id ||
              user?.role === "admin") && (
              <button onClick={() => setRemove(c)}>Delete</button>
            )}
            <button
              onClick={() => {
                if (requireUser()) setReport(c);
              }}
            >
              Report
            </button>
          </div>
        </article>
      ))}
      {loading && <p role="status">Loading discussion…</p>}
      {!loading && !items.length && (
        <Empty title="Start the conversation.">
          Share a question or add a perspective.
        </Empty>
      )}
      {hasMore && (
        <button disabled={loading} onClick={() => setPage((p) => p + 1)}>
          More comments
        </button>
      )}
      {remove && (
        <Modal
          title="Delete this comment?"
          busy={busy}
          onClose={() => setRemove(null)}
        >
          <p>Replies to this comment will also be removed.</p>
          <div className="actions">
            <button disabled={busy} onClick={() => setRemove(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/comments/${remove.id}`, { method: "DELETE" });
                  setRemove(null);
                  reload();
                } catch (e) {
                  toast(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete comment
            </button>
          </div>
        </Modal>
      )}
      {report && (
        <Modal
          title="Report comment"
          busy={busy}
          onClose={() => setReport(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/reports", {
                  method: "POST",
                  body: { comment_id: report.id, reason },
                });
                setReport(null);
                setReason("");
                toast("Report submitted.");
              } catch (e) {
                toast(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Reason
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button disabled={busy} className="primary">
              Submit report
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
export function FollowButton({ profile, onChange }) {
  const { user, requireUser, toast } = useApp(),
    [busy, setBusy] = useState(false);
  if (user?.id === profile.id) return null;
  return (
    <button
      className="button"
      disabled={busy}
      aria-pressed={profile.is_following}
      onClick={async () => {
        if (!requireUser() || busy) return;
        setBusy(true);
        try {
          await api(`/profiles/${profile.id}/follow`, {
            method: "PUT",
            body: { active: !profile.is_following },
          });
          invalidateFeeds();
          onChange?.({
            ...profile,
            is_following: !profile.is_following,
            follower_count:
              profile.follower_count + (profile.is_following ? -1 : 1),
          });
        } catch (e) {
          toast(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {profile.is_following ? "Following" : "Follow"}
    </button>
  );
}
export default function Publication() {
  const { slug } = useParams(),
    { revision } = useApp(),
    { data, error, loading } = useResource(
      `/publications/slug/${slug}`,
      revision,
    ),
    [post, setPost] = useState(null),
    [author, setAuthor] = useState(null),
    [related, setRelated] = useState([]);
  useEffect(() => {
    setPost(data?.publication || null);
    if (!data?.publication) return;
    let active = true;
    api(`/profiles/${data.publication.author_handle}`)
      .then((d) => {
        if (active) setAuthor(d.profile);
      })
      .catch(() => {});
    api(`/publications?topic=${encodeURIComponent(data.publication.topic)}`)
      .then((d) => {
        if (active)
          setRelated(
            d.items.filter((p) => p.id !== data.publication.id).slice(0, 3),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [data]);
  return (
    <section className="reader-page">
      <Feedback loading={loading} error={error}>
        {post && (
          <>
            <Link className="back-link" to="/">
              ← Back to the feed
            </Link>
            <div className="reader-topic">
              <Link to={`/topics/${encodeURIComponent(post.topic)}`}>
                {post.topic}
              </Link>
              <span>
                {post.format === "brief" ? "Brief" : "Story"}
                {post.status === "draft" ? " · Draft preview" : ""}
              </span>
            </div>
            <h1>{post.title}</h1>
            {post.summary && <p className="reader-subtitle">{post.summary}</p>}
            <div className="reader-byline">
              <Link to={`/u/${post.author_handle}`}>
                <Avatar
                  user={{
                    name: post.author_name,
                    avatar_url: post.author_avatar,
                  }}
                />
                <span>
                  {post.author_name}
                  <small>
                    {date(post.published_at)} ·{" "}
                    {Math.max(
                      1,
                      Math.ceil(post.body.split(/\s+/).length / 220),
                    )}{" "}
                    min read
                  </small>
                </span>
              </Link>
              {author && <FollowButton profile={author} onChange={setAuthor} />}
            </div>
            {post.updated_at !== post.created_at && (
              <p className="muted fine-print">
                Updated {date(post.updated_at)}
              </p>
            )}
            {post.cover_url && (
              <img
                className="reader-cover"
                src={post.cover_url}
                alt={post.title}
              />
            )}
            <RichBody content={post.content} body={post.body} />
            {post.tags.length > 0 && (
              <div className="tag-list">
                {post.tags.map((t) => (
                  <Link key={t} to={`/search?q=${encodeURIComponent(t)}`}>
                    {t}
                  </Link>
                ))}
              </div>
            )}
            {post.sources.length > 0 && (
              <div className="sources">
                <h2>Sources & further reading</h2>
                {post.sources.map((s) => (
                  <a key={s} href={s} target="_blank" rel="noopener noreferrer">
                    {s}
                  </a>
                ))}
              </div>
            )}
            {post.status === "published" && (
              <div className="preview-footer">
                <PublicationActions item={post} onChange={setPost} />
                <PublicationMenu item={post} />
              </div>
            )}
            {author && (
              <div className="author-note">
                <Avatar user={author} large />
                <div>
                  <Link to={`/u/${author.handle}`}>
                    <h2>{author.name}</h2>
                  </Link>
                  <p>{author.bio || "Writing and exploring at kai."}</p>
                  <Link to={`/u/${author.handle}/followers`}>
                    {author.follower_count} followers
                  </Link>
                </div>
              </div>
            )}
            {post.status === "published" && (
              <Comments
                publication={post}
                onCount={() => {
                  invalidateFeeds();
                  api(`/publications/slug/${slug}`)
                    .then((d) => setPost(d.publication))
                    .catch(() => {});
                }}
              />
            )}
            {related.length > 0 && (
              <section className="related">
                <h2>More to explore</h2>
                {related.map((p) => (
                  <PublicationCard
                    key={p.id}
                    item={p}
                    onChange={(item) =>
                      setRelated((old) =>
                        old.map((p) => (p.id === item.id ? item : p)),
                      )
                    }
                  />
                ))}
              </section>
            )}
          </>
        )}
      </Feedback>
    </section>
  );
}

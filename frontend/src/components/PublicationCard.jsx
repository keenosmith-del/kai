import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Heart,
  Bookmark,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Flag,
  Pencil,
} from "lucide-react";
import { Avatar, Modal } from "./Common";
import { api, date } from "../hooks/api";
import { useApp } from "./context";
export function PublicationActions({ item, onChange }) {
  const { requireUser, toast } = useApp(),
    [busy, setBusy] = useState(false);
  async function toggle(kind) {
    if (!requireUser() || busy) return;
    setBusy(true);
    const key = kind === "liked" ? "is_liked" : "is_saved",
      active = !item[key],
      before = item;
    onChange?.({
      ...item,
      [key]: active,
      like_count: item.like_count + (kind === "liked" ? (active ? 1 : -1) : 0),
    });
    try {
      const data = await api(`/publications/${item.id}/interactions`, {
        method: "PUT",
        body: { kind, active },
      });
      onChange?.({ ...item, ...data });
    } catch (e) {
      onChange?.(before);
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    const url = `${window.location.origin}/stories/${item.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied.");
      }
    } catch (e) {
      if (e.name !== "AbortError") toast("Unable to share this link.");
    }
  }
  return (
    <div className="publication-actions">
      <button
        disabled={busy}
        aria-label={item.is_liked ? "Unlike" : "Like"}
        aria-pressed={item.is_liked}
        onClick={() => toggle("liked")}
      >
        <Heart size={16} fill={item.is_liked ? "currentColor" : "none"} />
        <span>{item.like_count}</span>
      </button>
      <Link
        to={`/stories/${item.slug}#comments`}
        aria-label={`${item.comment_count} comments`}
      >
        <MessageCircle size={16} />
        <span>{item.comment_count}</span>
      </Link>
      <button onClick={share} aria-label="Share publication">
        <Share2 size={16} />
      </button>
      <button
        className="save-action"
        disabled={busy}
        onClick={() => toggle("saved")}
        aria-label={item.is_saved ? "Unsave" : "Save"}
        aria-pressed={item.is_saved}
      >
        <Bookmark size={16} fill={item.is_saved ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
export function PublicationMenu({ item }) {
  const { user, requireUser, compose, toast } = useApp(),
    [open, setOpen] = useState(false),
    [report, setReport] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  return (
    <>
      <div className="more-menu">
        <button
          aria-label="Publication options"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <MoreHorizontal size={18} />
        </button>
        {open && (
          <>
            <button
              className="menu-dismiss"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <div className="popover">
              <button
                onClick={() => {
                  setOpen(false);
                  if (requireUser()) setReport(true);
                }}
              >
                <Flag size={15} />
                Report publication
              </button>
              {(user?.id === item.author_id || user?.role === "admin") && (
                <button
                  onClick={() => {
                    setOpen(false);
                    compose(item);
                  }}
                >
                  <Pencil size={15} />
                  Edit publication
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {report && (
        <Modal
          title="Report publication"
          busy={busy}
          onClose={() => setReport(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/reports", {
                  method: "POST",
                  body: { publication_id: item.id, reason },
                });
                setReport(false);
                toast("Report sent to the editorial team.");
              } catch (e) {
                toast(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              What should we review?
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setReport(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Submit report
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export default function PublicationCard({ item, onChange }) {
  return (
    <article className="publication-preview">
      <div className="publication-copy">
        <div className="byline">
          <Link to={`/u/${item.author_handle}`}>
            <Avatar
              user={{ name: item.author_name, avatar_url: item.author_avatar }}
            />
            <span>{item.author_name}</span>
          </Link>
          <time dateTime={item.published_at}>{date(item.published_at)}</time>
        </div>
        <Link to={`/stories/${item.slug}`} className="publication-title">
          <h2>{item.title}</h2>
        </Link>
        {item.summary && <p className="publication-summary">{item.summary}</p>}
        <div className="publication-meta">
          <Link to={`/topics/${encodeURIComponent(item.topic)}`}>
            {item.topic}
          </Link>
          <span>
            {item.format === "brief"
              ? "Brief"
              : `${Math.max(1, Math.ceil(item.body.split(/\s+/).length / 220))} min read`}
          </span>
          {item.status === "draft" && <span>Draft</span>}
        </div>
        <div className="preview-footer">
          <PublicationActions item={item} onChange={onChange} />
          <PublicationMenu item={item} />
        </div>
      </div>
      {item.cover_url && (
        <Link
          className="thumbnail-link"
          to={`/stories/${item.slug}`}
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            className="publication-thumbnail"
            src={item.cover_url}
            alt=""
            loading="lazy"
          />
        </Link>
      )}
    </article>
  );
}

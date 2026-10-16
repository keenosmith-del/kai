import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../components/context";
import { api, date } from "../../hooks/api";
import { Feedback, Empty, Modal } from "../../components/Common";
import "./MyStudio.css";
export default function MyStudio({ drafts = false, admin = false }) {
  const { compose, revision, refresh, toast } = useApp(),
    [items, setItems] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState(null),
    [remove, setRemove] = useState(null),
    [busy, setBusy] = useState(false),
    [statusFilter, setStatusFilter] = useState("");
  const view = admin ? "admin" : drafts ? "drafts" : "mine";
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/publications?view=${view}&status=${statusFilter}`)
      .then((d) => {
        if (active) {
          setItems(d.items);
          setCursor(d.nextCursor);
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
  }, [view, revision, statusFilter]);
  async function status(p) {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/publications/${p.id}`, {
        method: "PATCH",
        body: {
          ...p,
          status: p.status === "published" ? "draft" : "published",
        },
      });
      refresh();
      toast(
        p.status === "published"
          ? "Publication moved to drafts."
          : "Publication is live.",
      );
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="studio-page">
      {!admin && (
        <div className="page-intro">
          <h1>{drafts ? "Ideas in progress." : "Your editorial studio."}</h1>
          <p>
            {drafts
              ? "Pick up where your curiosity left you."
              : "A place to write, refine and publish."}
          </p>
          <div className="actions">
            <button onClick={() => compose()} className="primary">
              + New post
            </button>
            <Link className="button" to={drafts ? "/studio" : "/drafts"}>
              {drafts ? "All publications" : "Drafts"}
            </Link>
          </div>
        </div>
      )}
      {!drafts && (
        <div className="feed-tabs">
          {[
            ["", "All"],
            ["published", "Published"],
            ["draft", "Drafts"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <Feedback loading={loading && !items.length} error={error}>
        {items.length ? (
          items.map((p) => (
            <article className="studio-row" key={p.id}>
              <div>
                <span className="muted">
                  {p.status === "draft" ? "Draft" : "Published"} · {p.format} ·{" "}
                  {date(p.updated_at)}
                  {admin ? ` · ${p.author_name}` : ""}
                </span>
                <Link to={`/stories/${p.slug}`}>
                  <h2>{p.title}</h2>
                </Link>
              </div>
              <div className="actions">
                <button disabled={busy} onClick={() => compose(p)}>
                  Edit
                </button>
                <button disabled={busy} onClick={() => status(p)}>
                  {p.status === "published" ? "Unpublish" : "Publish"}
                </button>
                <button disabled={busy} onClick={() => setRemove(p)}>
                  Delete
                </button>
              </div>
            </article>
          ))
        ) : (
          <Empty title="Every story starts somewhere.">
            <button onClick={() => compose()}>
              Write your first publication
            </button>
          </Empty>
        )}
      </Feedback>
      {cursor && (
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const d = await api(
                `/publications?view=${view}&status=${statusFilter}&cursor=${cursor}`,
              );
              setItems((old) => [...old, ...d.items]);
              setCursor(d.nextCursor);
            } catch (e) {
              setError(e.message);
            } finally {
              setLoading(false);
            }
          }}
        >
          Load more
        </button>
      )}
      {remove && (
        <Modal
          title="Delete this publication?"
          busy={busy}
          onClose={() => setRemove(null)}
        >
          <p>
            “{remove.title}” and its discussion will be permanently removed.
          </p>
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
                  await api(`/publications/${remove.id}`, { method: "DELETE" });
                  setRemove(null);
                  refresh();
                  toast("Publication deleted.");
                } catch (e) {
                  toast(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete publication
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

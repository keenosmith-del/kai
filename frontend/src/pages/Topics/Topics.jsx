import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Feed from "../../components/Feed";
import { useApp } from "../../components/context";
import { api, useResource } from "../../hooks/api";
import { Empty, Feedback } from "../../components/Common";
import "./Topics.css";
import { invalidateFeeds } from "../../hooks/feedCache";
export default function Topics() {
  const { topic } = useParams(),
    { revision, requireUser, toast } = useApp(),
    { data, error, loading } = useResource("/topics", revision),
    [items, setItems] = useState([]),
    [busy, setBusy] = useState("");
  useEffect(() => {
    setItems(data?.items || []);
  }, [data]);
  async function follow(t) {
    if (!requireUser() || busy) return;
    setBusy(t.name);
    try {
      await api(`/topics/${encodeURIComponent(t.name)}/follow`, {
        method: "PUT",
        body: { active: !t.is_followed },
      });
      invalidateFeeds();
      setItems((old) =>
        old.map((x) =>
          x.name === t.name ? { ...x, is_followed: !x.is_followed } : x,
        ),
      );
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy("");
    }
  }
  if (topic) {
    const t = items.find((x) => x.name === topic);
    return (
      <section>
        <div className="topic-heading">
          <span className="muted">A topic to explore</span>
          <h1>{topic}</h1>
          {t && (
            <button
              disabled={!!busy}
              aria-pressed={t.is_followed}
              onClick={() => follow(t)}
            >
              {t.is_followed ? "Following topic" : "Follow topic"}
            </button>
          )}
        </div>
        <Feed topic={topic} compactHeading />
      </section>
    );
  }
  return (
    <section className="topics-page">
      <div className="page-intro">
        <h1>Follow your curiosity.</h1>
        <p>Find the ideas you want to spend time with.</p>
      </div>
      <Feedback loading={loading} error={error}>
        {items.length ? (
          <div className="topic-list">
            {items.map((t) => (
              <div className="topic-row" key={t.name}>
                <Link to={`/topics/${encodeURIComponent(t.name)}`}>
                  <h2>{t.name}</h2>
                  <span className="muted">
                    {t.publication_count} publications
                  </span>
                </Link>
                <button
                  disabled={!!busy}
                  aria-pressed={t.is_followed}
                  onClick={() => follow(t)}
                >
                  {t.is_followed ? "Following" : "Follow"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </Feedback>
    </section>
  );
}

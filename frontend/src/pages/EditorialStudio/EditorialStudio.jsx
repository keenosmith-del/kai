import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useResource } from "../../hooks/api";
import { useApp } from "../../components/context";
import { Feedback, Modal } from "../../components/Common";
import MyStudio from "../MyStudio/MyStudio";
import "./EditorialStudio.css";
export default function EditorialStudio() {
  const { revision, refresh, toast } = useApp(),
    [usersPage, setUsersPage] = useState(1),
    [reportsPage, setReportsPage] = useState(1),
    { data, loading, error } = useResource(
      `/admin/overview?usersPage=${usersPage}&reportsPage=${reportsPage}`,
      revision,
    ),
    { data: topics } = useResource("/topics", revision),
    [topic, setTopic] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(null),
    [rename, setRename] = useState(null),
    [newName, setNewName] = useState("");
  async function act(path, method, body) {
    setBusy(true);
    try {
      await api(path, { method, body });
      refresh();
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editorial-page">
      <div className="page-intro">
        <h1>The editorial desk.</h1>
        <p>Care for the publication and its community.</p>
      </div>
      <Feedback loading={loading} error={error}>
        {data && (
          <>
            <div className="editorial-statistics">
              {Object.entries(data.statistics).map(([key, value]) => (
                <span key={key}>
                  <strong>{value}</strong> {key}
                </span>
              ))}
            </div>
            <h2>Reports to review</h2>
            {!data.reports.length && <p className="muted">No open reports.</p>}
            {data.reports.map((r) => (
              <article className="report-row" key={r.id}>
                <Link
                  to={`/stories/${r.slug}${r.comment_id ? `#comment-${r.comment_id}` : ""}`}
                >
                  <strong>{r.title}</strong>
                </Link>
                {r.comment_body && <p>{r.comment_body}</p>}
                <p>{r.reason}</p>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => act(`/admin/reports/${r.id}`, "PATCH", {})}
                  >
                    Resolve
                  </button>
                  {r.comment_id && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          type: "comment",
                          id: r.comment_id,
                          title: "Remove reported comment?",
                        })
                      }
                    >
                      Remove comment
                    </button>
                  )}
                </div>
              </article>
            ))}
            <div className="actions">
              {reportsPage > 1 && (
                <button onClick={() => setReportsPage((p) => p - 1)}>
                  Previous reports
                </button>
              )}
              {data.reportsHasMore && (
                <button onClick={() => setReportsPage((p) => p + 1)}>
                  Next reports
                </button>
              )}
            </div>
            <h2 className="section-title">Publication management</h2>
            <MyStudio admin />
            <h2 className="section-title">Community accounts</h2>
            {data.users.map((u) => (
              <div className="moderation-user" key={u.id}>
                <Link to={`/u/${u.handle}`}>
                  {u.name} <span className="muted">{u.role}</span>
                </Link>
                {u.role !== "admin" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        type: "user",
                        ...u,
                        title: u.suspended
                          ? "Restore account?"
                          : "Suspend account?",
                      })
                    }
                  >
                    {u.suspended ? "Restore" : "Suspend"}
                  </button>
                )}
              </div>
            ))}
            <div className="actions">
              {usersPage > 1 && (
                <button onClick={() => setUsersPage((p) => p - 1)}>
                  Previous accounts
                </button>
              )}
              {data.usersHasMore && (
                <button onClick={() => setUsersPage((p) => p + 1)}>
                  Next accounts
                </button>
              )}
            </div>
            <h2 className="section-title">Publication topics</h2>
            <div className="tag-list">
              {topics?.items.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    setRename(t.name);
                    setNewName(t.name);
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <form
              className="actions"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act("/admin/topics", "POST", { name: topic }))
                  setTopic("");
              }}
            >
              <input
                aria-label="New topic"
                maxLength={60}
                required
                minLength={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <button disabled={busy}>Add topic</button>
            </form>
          </>
        )}
      </Feedback>
      {confirm && (
        <Modal
          title={confirm.title}
          busy={busy}
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm.type === "user"
              ? "Suspension signs out this reader and hides their profile and publications until restored."
              : "The comment and its replies will be removed."}
          </p>
          <div className="actions">
            <button disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                const ok =
                  confirm.type === "user"
                    ? await act(`/admin/users/${confirm.id}`, "PATCH", {
                        suspended: !confirm.suspended,
                      })
                    : await act(`/comments/${confirm.id}`, "DELETE");
                if (ok) setConfirm(null);
              }}
            >
              Confirm {confirm.type === "user" ? "account change" : "removal"}
            </button>
          </div>
        </Modal>
      )}
      {rename && (
        <Modal title="Rename topic" busy={busy} onClose={() => setRename(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  `/admin/topics/${encodeURIComponent(rename)}`,
                  "PATCH",
                  { name: newName },
                )
              )
                setRename(null);
            }}
          >
            <label>
              Topic name
              <input
                required
                minLength={2}
                maxLength={60}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <button disabled={busy} className="primary">
              Save topic
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

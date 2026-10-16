import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../../components/context";
import { api } from "../../hooks/api";
import { Avatar, Empty, Feedback } from "../../components/Common";
import { FollowButton } from "../Publication/Publication";
import "./Followers.css";
export default function Followers({ kind = "followers" }) {
  const { handle } = useParams(),
    { user } = useApp(),
    [items, setItems] = useState([]),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const name = handle || user?.handle;
  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [name, kind]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/profiles/${name}/${kind}?page=${page}`)
      .then((d) => {
        if (active) {
          setItems((old) => (page === 1 ? d.items : [...old, ...d.items]));
          setMore(d.hasMore);
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
  }, [name, kind, page]);
  return (
    <section className="people-page">
      <div className="page-intro">
        <h1>{kind === "followers" ? "Followers." : "Following."}</h1>
        <p>
          <Link to={`/u/${name}`}>@{name}</Link>
        </p>
      </div>
      <Feedback loading={loading && !items.length} error={error}>
        {items.length ? (
          items.map((a) => (
            <div className="author-row" key={a.id}>
              <Link to={`/u/${a.handle}`}>
                <Avatar user={a} />
                <span>
                  {a.name}
                  <small>@{a.handle}</small>
                </span>
              </Link>
              <FollowButton
                profile={a}
                onChange={(value) =>
                  setItems((old) => old.map((x) => (x.id === a.id ? value : x)))
                }
              />
            </div>
          ))
        ) : (
          <Empty title="A circle still growing.">
            <Link to="/explore">Discover people to follow.</Link>
          </Empty>
        )}
      </Feedback>
      {more && (
        <button disabled={loading} onClick={() => setPage((p) => p + 1)}>
          Load more
        </button>
      )}
    </section>
  );
}

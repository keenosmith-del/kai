import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useResource } from "../../hooks/api";
import { Avatar, Feedback } from "../../components/Common";
import { FollowButton } from "../Publication/Publication";
import Feed from "../../components/Feed";
import "./Explore.css";
export default function Explore() {
  const { data, loading, error } = useResource("/profiles"),
    { data: topics } = useResource("/topics"),
    [authors, setAuthors] = useState([]);
  useEffect(() => setAuthors(data?.items || []), [data]);
  return (
    <section className="explore-page">
      <div className="page-intro">
        <h1>Room for new ideas.</h1>
        <p>Discover the people and perspectives shaping AI.</p>
      </div>
      <div className="tag-list">
        {topics?.items.map((t) => (
          <Link key={t.name} to={`/topics/${encodeURIComponent(t.name)}`}>
            {t.name}
          </Link>
        ))}
      </div>
      <h2 className="section-title">People to read</h2>
      <Feedback loading={loading} error={error}>
        <div className="author-list">
          {authors.map((a) => (
            <div className="author-row" key={a.id}>
              <Link to={`/u/${a.handle}`}>
                <Avatar user={a} />
                <span>
                  {a.name}
                  <small className="muted">@{a.handle}</small>
                </span>
              </Link>
              <FollowButton
                profile={a}
                onChange={(value) =>
                  setAuthors((old) =>
                    old.map((x) => (x.id === a.id ? value : x)),
                  )
                }
              />
            </div>
          ))}
        </div>
      </Feedback>
      <h2 className="section-title">Across the publication</h2>
      <Feed compactHeading />
    </section>
  );
}

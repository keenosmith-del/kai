import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { api, useResource } from "../hooks/api";
import { useApp } from "./context";
import PublicationCard from "./PublicationCard";
import { Empty, Feedback } from "./Common";
import { feedCache as cache } from "../hooks/feedCache";
export default function Feed({
  title,
  description,
  view = "feed",
  sort = "latest",
  topic,
  author,
  home = false,
  compactHeading = false,
}) {
  const { user, compose, revision, requireUser } = useApp(),
    [params, setParams] = useSearchParams(),
    [query, setQuery] = useState(params.get("q") || ""),
    [result, setResult] = useState({
      items: [],
      loading: true,
      error: "",
      nextCursor: null,
    }),
    [more, setMore] = useState(false),
    request = useRef(0),
    { data: topics } = useResource("/topics"),
    { data: preferences } = useResource(user ? "/settings" : "/topics");
  const homeView = params.get("feed") || preferences?.default_feed || "for-you";
  const selectedView = home
    ? homeView === "latest"
      ? "feed"
      : homeView
    : view;
  const values = new URLSearchParams({
    view: selectedView,
    sort: params.get("sort") || sort,
  });
  if (params.get("q")) values.set("q", params.get("q"));
  if (topic || params.get("topic"))
    values.set("topic", topic || params.get("topic"));
  if (params.get("format")) values.set("format", params.get("format"));
  if (author) values.set("author", author);
  const endpoint = `/publications?${values}`,
    cacheKey = `${user?.id || "guest"}:${revision}:${endpoint}`,
    urlQuery = params.get("q") || "";
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== (params.get("q") || "")) {
        const p = new URLSearchParams(params);
        if (query) p.set("q", query);
        else p.delete("q");
        setParams(p, { replace: true });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, params, setParams]);
  useEffect(() => {
    const token = ++request.current;
    if (cache.has(cacheKey)) {
      setResult(cache.get(cacheKey));
      return;
    }
    setResult({ items: [], loading: true, error: "", nextCursor: null });
    api(endpoint)
      .then((data) => {
        if (request.current === token) {
          const s = { ...data, loading: false, error: "" };
          setResult(s);
          cache.set(cacheKey, s);
        }
      })
      .catch((e) => {
        if (request.current === token)
          setResult({
            items: [],
            loading: false,
            error: e.message,
            nextCursor: null,
          });
      });
    return () => {
      if (request.current === token) request.current = token + 1;
    };
  }, [endpoint, cacheKey]);
  async function load() {
    if (more) return;
    const token = request.current;
    setMore(true);
    try {
      const data = await api(
        `${endpoint}&cursor=${encodeURIComponent(result.nextCursor)}`,
      );
      if (token === request.current)
        setResult((old) => {
          const s = {
            ...data,
            items: [...old.items, ...data.items],
            loading: false,
            error: "",
          };
          cache.set(cacheKey, s);
          return s;
        });
    } catch (e) {
      if (token === request.current)
        setResult((s) => ({ ...s, error: e.message }));
    } finally {
      setMore(false);
    }
  }
  function update(key, value) {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p);
  }
  function change(item) {
    setResult((s) => {
      const next = {
        ...s,
        items: s.items.map((p) => (p.id === item.id ? item : p)),
      };
      cache.set(cacheKey, next);
      return next;
    });
    for (const [key] of cache) {
      if (key !== cacheKey) cache.delete(key);
    }
  }
  return (
    <section
      className={`feed-page ${preferences?.feed_density === "compact" ? "density-compact" : ""}`}
    >
      {!compactHeading && (
        <div className="page-intro">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      )}
      {home && (
        <div className="feed-tabs">
          {[
            ["for-you", "For you"],
            ["feed", "Latest"],
            ["following", "Following"],
          ].map(([v, label]) => (
            <button
              key={v}
              aria-pressed={selectedView === v}
              onClick={() => {
                if (v === "following" && !user) requireUser("/?feed=following");
                else update("feed", v);
              }}
            >
              {label}
            </button>
          ))}
          <button className="push-right" onClick={() => compose()}>
            <Plus size={16} /> New post
          </button>
        </div>
      )}
      {home && selectedView === "for-you" && (
        <p className="feed-explanation">
          Authors and topics you follow come first. Recent publications fill out
          the view.
        </p>
      )}
      <div className="feed-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search publications"
            placeholder="Find a new perspective"
            maxLength={150}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {!topic && (
          <select
            aria-label="Filter by topic"
            value={params.get("topic") || ""}
            onChange={(e) => update("topic", e.target.value)}
          >
            <option value="">All topics</option>
            {topics?.items.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Publication format"
          value={params.get("format") || ""}
          onChange={(e) => update("format", e.target.value)}
        >
          <option value="">All formats</option>
          <option value="brief">Briefs</option>
          <option value="story">Stories</option>
        </select>
        <select
          aria-label="Sort publications"
          value={params.get("sort") || sort}
          onChange={(e) => update("sort", e.target.value)}
        >
          <option value="latest">Latest</option>
          <option value="trending">Trending</option>
          <option value="relevance">Relevance</option>
        </select>
        {params.size > 0 && (
          <button
            onClick={() => {
              setQuery("");
              setParams({});
            }}
          >
            Clear
          </button>
        )}
      </div>
      <Feedback
        loading={result.loading}
        error={result.items.length ? null : result.error}
      >
        {result.items.length ? (
          result.items.map((item) => (
            <PublicationCard key={item.id} item={item} onChange={change} />
          ))
        ) : (
          <Empty
            title={
              selectedView === "following"
                ? "Follow a few curious minds."
                : view === "drafts"
                  ? "Your next idea starts here."
                  : "A little quiet here."
            }
          >
            {selectedView === "following" ? (
              <Link to="/explore">
                Explore authors and topics to shape your feed.
              </Link>
            ) : ["mine", "drafts"].includes(view) ? (
              <button onClick={() => compose()}>Write a new publication</button>
            ) : (
              <Link to="/explore">
                Explore topics or try a different search.
              </Link>
            )}
          </Empty>
        )}
      </Feedback>
      {result.items.length > 0 && result.error && (
        <p className="error" role="alert">
          {result.error}
        </p>
      )}
      {result.nextCursor && (
        <button className="load-more" disabled={more} onClick={load}>
          {more ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  );
}

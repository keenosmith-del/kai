import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './Home.css';

const VIEWS = new Set(['feed', 'saved', 'liked', 'account', 'settings']);
const INITIAL_DRAFT = { title: '', summary: '', topic: 'Research', body: '' };

const paths = {
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  close: <path d="M5 5l14 14M19 5 5 19" />,
  home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/></>,
  saved: <path d="M6 4h12v17l-6-4-6 4z" />,
  liked: <path d="M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z" />,
  account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></>,
  plus: <path d="M12 4v16M4 12h16" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  logout: <><path d="M10 4H4v16h6"/><path d="M14 8l4 4-4 4m-9-4h13"/></>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
};

function Icon({ name, size = 18, filled = false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[name]}
  </svg>;
}

function Avatar({ user, small = false }) {
  const initials = (user?.name || 'Reader').trim().split(/\s+/).slice(0, 2)
    .map(part => part.charAt(0)).join('').toUpperCase();
  return <span className={`kai-avatar ${small ? 'kai-avatar-small' : ''}`} aria-hidden="true">{initials}</span>;
}

function prettyDate(date) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(date));
}

function PublicationActions({ item, onToggle, onShare, busyId }) {
  return <div className="kai-publication-actions">
    <button type="button" className={item.is_liked ? 'is-active' : ''}
      aria-label={item.is_liked ? 'Unlike publication' : 'Like publication'}
      aria-pressed={item.is_liked} disabled={busyId === item.id}
      onClick={() => onToggle(item, 'liked')}>
      <Icon name="liked" size={18} filled={item.is_liked} />
      <span>{item.like_count || 'Like'}</span>
    </button>
    <button type="button" className={item.is_saved ? 'is-active' : ''}
      aria-label={item.is_saved ? 'Remove from saved' : 'Save publication'}
      aria-pressed={item.is_saved} disabled={busyId === item.id}
      onClick={() => onToggle(item, 'saved')}>
      <Icon name="saved" size={18} filled={item.is_saved} /><span>{item.is_saved ? 'Saved' : 'Save'}</span>
    </button>
    <button type="button" onClick={() => onShare(item)} aria-label="Share publication">
      <Icon name="share" size={18} /><span>Share</span>
    </button>
  </div>;
}

function PublicationCard({ item, feature, onOpen, onToggle, onShare, busyId }) {
  return <article className={`kai-publication ${feature ? 'kai-feature' : ''}`}>
    <button className={`kai-cover kai-topic-${slugTopic(item.topic)}`} type="button"
      onClick={() => onOpen(item)} aria-label={`Read ${item.title}`}>
      <span className="kai-cover-label">{item.topic}</span>
      <span className="kai-cover-word">{item.title}</span>
      <span className="kai-cover-mark">k ᐧ ai</span>
    </button>
    <div className="kai-publication-copy">
      <div className="kai-story-meta"><span>{item.format === 'brief' ? 'Brief' : 'Story'}</span><span>{prettyDate(item.published_at)}</span></div>
      <button className="kai-title-link" type="button" onClick={() => onOpen(item)}><h3>{item.title}</h3></button>
      <p>{item.summary || item.body.slice(0, 175)}</p>
      <div className="kai-story-author"><Avatar user={{ name: item.author_name }} small /> <span>By {item.author_name}</span></div>
      <PublicationActions item={item} onToggle={onToggle} onShare={onShare} busyId={busyId} />
    </div>
  </article>;
}

function slugTopic(topic) {
  return (topic || 'research').toLowerCase().replace(/[^a-z]+/g, '-');
}

export default function Home({ user }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.has(params.get('view')) ? params.get('view') : 'feed';
  const sidebarRef = useRef(null);
  const articleRef = useRef(null);
  const composerRef = useRef(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [topic, setTopic] = useState('All');
  const [topics, setTopics] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [publishing, setPublishing] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [density, setDensity] = useState('comfortable');
  const [savingDensity, setSavingDensity] = useState(false);

  const feedView = ['feed', 'saved', 'liked'].includes(view);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetch('/api/publications/preferences/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Unable to load preferences')))
      .then(data => { if (active) setDensity(data.feed_density); })
      .catch(() => { /* The default density remains usable if preferences cannot load. */ });
    return () => { active = false; };
  }, [user]);

  const loadPublications = useCallback(async (nextPage, append = false, signal) => {
    const query = new URLSearchParams({ view, page: String(nextPage) });
    if (debouncedSearch) query.set('q', debouncedSearch);
    if (topic !== 'All') query.set('topic', topic);
    const response = await fetch(`/api/publications?${query}`, { credentials: 'include', signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load publications.');
    setTopics(data.topics);
    setItems(previous => append ? [...previous, ...data.items] : data.items);
    setPage(nextPage);
    setHasMore(data.hasMore);
  }, [view, debouncedSearch, topic]);

  useEffect(() => {
    if (!feedView) return;
    const controller = new AbortController();
    setLoading(true);
    setFetchError('');
    setItems([]);
    setPage(1);
    loadPublications(1, false, controller.signal)
      .catch(e => { if (e.name !== 'AbortError') setFetchError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [feedView, loadPublications, reloadKey]);

  function chooseView(nextView) {
    sidebarRef.current?.close();
    setSearch('');
    setTopic('All');
    if (!user && nextView !== 'feed') return navigate('/signin');
    setParams(nextView === 'feed' ? {} : { view: nextView });
  }

  function openSidebar() {
    sidebarRef.current?.showModal();
  }
  function closeSidebar() {
    sidebarRef.current?.close();
  }
  function openPublication(item) {
    setSelected(item);
    articleRef.current?.showModal();
  }
  function closePublication() {
    articleRef.current?.close();
    setSelected(null);
    if (params.has('publication')) {
      const next = new URLSearchParams(params);
      next.delete('publication');
      setParams(next, { replace: true });
    }
  }
  function openComposer() {
    setDraft(INITIAL_DRAFT);
    setComposerError('');
    composerRef.current?.showModal();
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    try { await loadPublications(page + 1, true); }
    catch (error) { setFetchError(error.message); }
    finally { setLoading(false); }
  }

  async function toggleInteraction(item, kind) {
    if (!user) return navigate('/signin');
    if (busyId) return;
    setBusyId(item.id);
    setActionError('');
    const active = !item[`is_${kind}`];
    try {
      const response = await fetch(`/api/publications/${item.id}/interactions`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save interaction.');
      const update = row => row.id === item.id ? { ...row, ...data } : row;
      setItems(old => old.map(update).filter(row =>
        view === 'saved' ? row.is_saved : view === 'liked' ? row.is_liked : true));
      setSelected(old => old?.id === item.id ? update(old) : old);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyId(null);
    }
  }

  async function sharePublication(item) {
    const url = `${window.location.origin}/?publication=${encodeURIComponent(item.slug)}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url); setActionError('Link copied to clipboard.'); }
      else setActionError('Copy this link: ' + url);
    } catch (error) {
      if (error.name !== 'AbortError') setActionError('Unable to share this publication.');
    }
  }

  const linkedSlug = params.get('publication');
  useEffect(() => {
    if (!linkedSlug) return;
    // A shared brief can be several pages deep; fetch the permalink directly.
    const controller = new AbortController();
    fetch(`/api/publications/slug/${encodeURIComponent(linkedSlug)}`, {
      credentials: 'include', signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Publication not found.')))
      .then(data => {
        if (controller.signal.aborted) return;
        setSelected(data.publication);
        if (!articleRef.current?.open) articleRef.current?.showModal();
      })
      .catch(error => { if (error.name !== 'AbortError') setActionError(error.message); });
    return () => controller.abort();
  }, [linkedSlug]);

  async function publishBrief(event) {
    event.preventDefault();
    if (publishing) return;
    setPublishing(true);
    setComposerError('');
    try {
      const response = await fetch('/api/publications', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to publish.');
      composerRef.current?.close();
      setDraft(INITIAL_DRAFT);
      setSearch(''); setTopic('All');
      setParams({});
      setReloadKey(v => v + 1);
    } catch (error) { setComposerError(error.message); }
    finally { setPublishing(false); }
  }

  async function updateDensity(next) {
    if (!user || savingDensity || next === density) return;
    setSavingDensity(true);
    setActionError('');
    try {
      const response = await fetch('/api/publications/preferences/me', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_density: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update preferences.');
      setDensity(data.feed_density);
    } catch (error) { setActionError(error.message); }
    finally { setSavingDensity(false); }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Unable to sign out.');
      window.location.replace('/signin');
    } catch (error) { setActionError(error.message); setSigningOut(false); }
  }

  const heading = view === 'saved' ? 'Your saved stories.' : view === 'liked' ? 'Stories you liked.'
    : view === 'account' ? 'Your account.' : view === 'settings' ? 'Reading settings.'
      : 'A clearer view of AI.';
  const description = view === 'feed' ? 'Research, ideas and developments shaping what comes next.'
    : view === 'saved' ? 'The publications you want to return to.'
      : view === 'liked' ? 'Ideas that caught your attention.'
        : view === 'account' ? 'Your identity and connected sign-in methods.'
          : 'Shape how publications appear in your feed.';

  return <div className={`kai-app kai-density-${density}`}>
    <header className="kai-header">
      <div className="kai-brand-group">
        <button type="button" className="kai-mascot-trigger" onClick={openSidebar} aria-label="Open navigation" aria-haspopup="dialog">
          <img src="/kailor-head.png" alt="" />
        </button>
        <button type="button" className="kai-wordmark" onClick={() => chooseView('feed')}>k ᐧ ai</button>
      </div>
      <div className="kai-header-user">
        {user ? <>
          <button type="button" className="kai-profile-trigger" onClick={() => chooseView('account')} aria-label="View account">
            <Avatar user={user} /><span>{user.name}</span>
          </button>
          <button type="button" className="kai-signout" onClick={signOut} disabled={signingOut}>Sign out</button>
        </> : <button className="kai-signout" type="button" onClick={() => navigate('/signin')}>Sign in</button>}
      </div>
    </header>

    <main className="kai-main" id="main">
      <section className="kai-introduction">
        <div className="kai-title-group">
          <h1>{heading}</h1><p>{description}</p>
        </div>
        {view === 'feed' && user?.role === 'admin' &&
          <button type="button" className="kai-primary-action" onClick={openComposer}>
            <Icon name="plus" size={18}/> Quick post
          </button>}
      </section>

      {actionError && <p className="kai-toast" role="status">{actionError}
        <button type="button" onClick={() => setActionError('')} aria-label="Dismiss notification"><Icon name="close" size={14}/></button>
      </p>}

      {feedView ? <>
        <div className="kai-controls">
          <label className="kai-search"><Icon name="search" size={19}/><span className="kai-sr-only">Search publications</span>
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search publications, tools, ideas..." />
          </label>
          <span className="kai-controls-label">{view === 'feed' ? 'Discover' : 'Your collection'}</span>
        </div>
        <nav className="kai-topic-nav" aria-label="Filter publications by topic">
          {['All', ...topics].map(value => <button type="button" key={value} onClick={() => setTopic(value)}
            aria-pressed={topic === value} className={topic === value ? 'is-selected' : ''}>{value}</button>)}
        </nav>

        {fetchError && <div className="kai-empty" role="alert"><h2>Unable to load publications.</h2><p>{fetchError}</p>
          <button type="button" onClick={() => setReloadKey(x => x + 1)}>Try again</button></div>}
        {!fetchError && loading && !items.length && <p className="kai-load-status" role="status">Loading publications...</p>}
        {!fetchError && !loading && !items.length &&
          <div className="kai-empty"><span className="kai-empty-mark">k ᐧ ai</span>
            <h2>{view === 'saved' ? 'Nothing saved yet.' : view === 'liked' ? 'No liked publications yet.' : 'The first publication is on its way.'}</h2>
            <p>{view === 'feed' ? 'New publications will appear here as they are published.' : 'Explore the feed and add stories to your collection.'}</p>
            {view !== 'feed' && <button type="button" onClick={() => chooseView('feed')}>Explore publications</button>}
            {view === 'feed' && user?.role === 'admin' && <button type="button" onClick={openComposer}>Publish your first brief</button>}
          </div>}
        {!!items.length && <section className="kai-publication-grid" aria-label="Publications">
          {items.map((item, index) => <PublicationCard key={item.id} item={item} feature={index === 0 && page === 1 && view === 'feed' && !debouncedSearch && topic === 'All'}
            onOpen={openPublication} onToggle={toggleInteraction} onShare={sharePublication} busyId={busyId} />)}
        </section>}
        {hasMore && !fetchError && <div className="kai-more"><button type="button" onClick={loadMore} disabled={loading}>{loading ? 'Loading...' : 'Load more publications'} <Icon name="arrow" size={17}/></button></div>}
      </> : view === 'account' ? <section className="kai-detail-panel">
        <div className="kai-account-heading"><Avatar user={user}/><div><h2>{user.name}</h2><span>{user.role === 'admin' ? 'Editorial administrator' : 'Reader'}</span></div></div>
        <div className="kai-detail-row"><span>Email</span><strong>{user.email}</strong></div>
        <div className="kai-detail-row"><span>GitHub sign-in</span><strong>{user.github_connected ? 'Connected' : 'Not connected'}</strong></div>
        {!user.github_connected && <a className="kai-connect-link" href="/api/auth/github?link=1">Connect your GitHub account <Icon name="arrow" size={17}/></a>}
      </section> : <section className="kai-detail-panel"><h2>Feed appearance</h2><p>Choose how much space each publication takes up. This setting follows your account.</p>
        <fieldset className="kai-radio-options"><legend>Publication density</legend>
          {['comfortable', 'compact'].map(value => <label key={value}><input type="radio" checked={density === value} disabled={savingDensity} onChange={() => updateDensity(value)} />
            <span>{value === 'comfortable' ? 'Comfortable' : 'Compact'}</span></label>)}
        </fieldset>
      </section>}
    </main>

    <footer className="kai-footer"><span>© {new Date().getFullYear()} kai.</span><span>Artificial intelligence, in context.</span></footer>

    <dialog ref={sidebarRef} className="kai-sidebar-dialog"
      onClick={event => { if (event.target === sidebarRef.current) closeSidebar(); }} aria-label="kai navigation">
      <div className="kai-sidebar-inner">
        <div className="kai-sidebar-top"><span className="kai-sidebar-logo">k ᐧ ai</span>
          <button type="button" onClick={closeSidebar} aria-label="Close navigation"><Icon name="close" size={20}/></button></div>
        <nav className="kai-sidebar-links" aria-label="Main navigation">
          {[['feed','Home','home'],['saved','Saved','saved'],['liked','Liked','liked'],['account','Account','account'],['settings','Settings','settings']].map(([key,label,icon]) =>
            <button key={key} type="button" className={view === key ? 'is-current' : ''} onClick={() => chooseView(key)}>
              <Icon name={icon} size={19}/><span>{label}</span></button>)}
        </nav>
        <div className="kai-sidebar-bottom">{user ? <><Avatar user={user}/><div><strong>{user.name}</strong><span>{user.email}</span></div></> : <><Avatar/><button type="button" onClick={() => navigate('/signin')}>Sign in</button></>}</div>
      </div>
    </dialog>

    <dialog ref={articleRef} className="kai-reader-dialog" onClose={() => {
      setSelected(null);
      if (params.has('publication')) {
        const next = new URLSearchParams(params);
        next.delete('publication');
        setParams(next, { replace: true });
      }
    }} aria-label="Read publication">
      {selected && <div className="kai-reader-inner"><div className="kai-reader-top"><span>k ᐧ ai</span>
        <button type="button" onClick={closePublication} aria-label="Close publication"><Icon name="close"/></button></div>
        <span className="kai-reader-topic">{selected.topic} · {prettyDate(selected.published_at)}</span>
        <h2>{selected.title}</h2>{selected.summary && <p className="kai-reader-summary">{selected.summary}</p>}
        <div className="kai-story-author"><Avatar user={{ name: selected.author_name }} small/><span>By {selected.author_name}</span></div>
        <div className="kai-reader-body">{selected.body}</div>
        <PublicationActions item={selected} onToggle={toggleInteraction} onShare={sharePublication} busyId={busyId}/>
      </div>}
    </dialog>

    {user?.role === 'admin' && <dialog ref={composerRef} className="kai-composer-dialog" aria-label="Publish a brief">
      <div className="kai-composer-top"><div><span>k ᐧ ai</span><h2>Quick post</h2><p>Publish a concise update to the main feed.</p></div>
        <button type="button" onClick={() => composerRef.current?.close()} aria-label="Close composer"><Icon name="close" /></button></div>
      <form onSubmit={publishBrief} className="kai-composer-form">
        <label>Title<input required minLength={5} maxLength={180} value={draft.title}
          onChange={e => setDraft(d => ({...d,title:e.target.value}))} placeholder="What's new in AI?" /></label>
        <label>Topic<select value={draft.topic} onChange={e => setDraft(d => ({...d,topic:e.target.value}))}>
          {['Research','Language models','AI agents','Engineering','Automation','Models & tools','AI in business','Perspectives'].map(t => <option key={t}>{t}</option>)}
        </select></label>
        <label>Summary <span>(optional)</span><textarea rows={2} maxLength={400} value={draft.summary}
          onChange={e => setDraft(d => ({...d,summary:e.target.value}))} placeholder="One-sentence context for readers"/></label>
        <label>Publication <textarea required minLength={20} maxLength={10000} rows={7} value={draft.body}
          onChange={e => setDraft(d => ({...d,body:e.target.value}))} placeholder="Explain the development and why it matters..."/></label>
        {composerError && <p className="kai-form-error" role="alert">{composerError}</p>}
        <button type="submit" className="kai-publish" disabled={publishing}>{publishing ? 'Publishing...' : 'Publish brief'} <Icon name="arrow" size={18}/></button>
      </form>
    </dialog>}
  </div>;
}

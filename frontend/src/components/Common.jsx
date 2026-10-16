import { useEffect, useLayoutEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
export function Avatar({ user = {}, large = false }) {
  const name = user.name || user.author_name || "Reader",
    src = user.avatar_url || user.author_avatar;
  return src ? (
    <img
      className={`avatar ${large ? "large" : ""}`}
      src={src}
      alt={`${name}'s profile`}
    />
  ) : (
    <span className={`avatar ${large ? "large" : ""}`} aria-label={name}>
      {name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function Feedback({ loading, error, children }) {
  return loading ? (
    <p className="feedback" role="status">
      Loading…
    </p>
  ) : error ? (
    <p className="feedback error" role="alert">
      {error}
    </p>
  ) : (
    children
  );
}
export function Empty({ title = "Nothing here yet.", children }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>
        {children || "New publications will appear here as authors publish."}
      </p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  busy = false,
  wide = false,
}) {
  const ref = useRef(),
    callback = useRef(),
    label = useId();
  useLayoutEffect(() => {
    callback.current = { onClose, busy };
  }, [onClose, busy]);
  useEffect(() => {
    const before = document.activeElement,
      shell = document.querySelector(".application"),
      prior = shell?.inert;
    if (shell) shell.inert = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!callback.current.busy) callback.current.onClose();
      }
      if (e.key === "Tab") {
        const all = [
          ...ref.current.querySelectorAll(
            'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[contenteditable="true"],[tabindex="0"]',
          ),
        ].filter((n) => n.getClientRects().length);
        const first = all[0],
          last = all.at(-1);
        if (
          e.shiftKey &&
          (!ref.current.contains(document.activeElement) ||
            document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (shell) shell.inert = prior;
      document.body.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={label}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-heading">
          <h2 id={label}>{title}</h2>
          <button
            className="close"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
export function RichBody({ content, body }) {
  function render(n, key) {
    if (n.type === "text") {
      let child = n.text;
      for (const m of n.marks || []) {
        if (m.type === "bold") child = <strong>{child}</strong>;
        if (m.type === "italic") child = <em>{child}</em>;
        if (m.type === "strike") child = <s>{child}</s>;
        if (m.type === "code") child = <code>{child}</code>;
        if (m.type === "link" && /^https?:\/\//.test(m.attrs?.href))
          child = (
            <a href={m.attrs.href} target="_blank" rel="noopener noreferrer">
              {child}
            </a>
          );
      }
      return <span key={key}>{child}</span>;
    }
    const kids = n.content?.map((c, i) => render(c, i));
    if (n.type === "image")
      return (
        <img
          key={key}
          src={n.attrs.src}
          alt={n.attrs.alt || ""}
          loading="lazy"
        />
      );
    if (n.type === "hardBreak") return <br key={key} />;
    const tags = {
      doc: "div",
      paragraph: "p",
      heading: `h${Math.min(3, Math.max(1, n.attrs?.level || 2))}`,
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
      blockquote: "blockquote",
      codeBlock: "pre",
      horizontalRule: "br",
    };
    const Tag = tags[n.type] || "div";
    return <Tag key={key}>{kids}</Tag>;
  }
  return (
    <div className="rich-body">
      {content
        ? render(content, 0)
        : body?.split("\n\n").map((p, i) => (
            <p key={i} style={{ whiteSpace: "pre-wrap" }}>
              {p}
            </p>
          ))}
    </div>
  );
}

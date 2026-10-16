import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Modal, RichBody } from "./Common";
import { useApp } from "./context";
import { api, uploadImage, useResource } from "../hooks/api";
const blank = {
  title: "",
  summary: "",
  format: "brief",
  topic: "Research",
  tags: [],
  sources: [],
  cover_url: "",
  body: "",
  status: "draft",
};
export default function Composer({ publication, onClose, onSaved }) {
  const { toast } = useApp(),
    [initial] = useState(publication || blank),
    [form, setForm] = useState({ ...blank, ...publication }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [leave, setLeave] = useState(false),
    [preview, setPreview] = useState(false),
    [link, setLink] = useState(null),
    [dirty, setDirty] = useState(false),
    [imagePreview, setImagePreview] = useState(null),
    { data } = useResource("/topics");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      Image,
    ],
    content: publication?.content || {
      type: "doc",
      content: publication?.body?.split("\n\n").map((t) => ({
        type: "paragraph",
        content: t ? [{ type: "text", text: t }] : [],
      })) || [{ type: "paragraph" }],
    },
    onUpdate: () => setDirty(true),
    editorProps: {
      attributes: {
        "aria-label": "Publication content",
        class: "article-editor",
      },
    },
  });
  useEffect(() => {
    editor?.setEditable(!busy);
  }, [editor, busy]);
  useEffect(() => {
    const guard = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }
  function close() {
    if (busy) return;
    if (leave) setLeave(false);
    else if (dirty) setLeave(true);
    else onClose();
  }
  async function save(status) {
    if (busy || !editor) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        ...form,
        status,
        content: editor.getJSON(),
        tags: form.tags.map((t) => t.trim()).filter(Boolean),
        sources: form.sources.map((s) => s.trim()).filter(Boolean),
      };
      const result = await api(
        form.id ? `/publications/${form.id}` : "/publications",
        { method: form.id ? "PATCH" : "POST", body },
      );
      setDirty(false);
      toast(status === "published" ? "Publication is live." : "Draft saved.");
      onSaved(result.publication);
      onClose();
    } catch (e) {
      setError(e.message);
      setLeave(false);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file, inline = false) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const src = await uploadImage(file);
      if (inline) editor.chain().focus().setImage({ src }).run();
      else change("cover_url", src);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={form.id ? "Edit publication" : "A new perspective."}
      onClose={close}
      busy={busy}
      wide
    >
      {leave ? (
        <div className="discard-panel">
          <h3>Keep your writing?</h3>
          <p>
            Save it as a draft before leaving, or return to finish your piece.
            {form.status === "published" &&
              " Saving as a draft removes it from the public feed."}
          </p>
          <div className="actions">
            <button disabled={busy} onClick={() => setLeave(false)}>
              Return to editing
            </button>
            <button disabled={busy} onClick={onClose}>
              Discard changes
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => save("draft")}
            >
              Save draft
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="composer-switch">
            <button
              aria-pressed={form.format === "brief"}
              onClick={() => change("format", "brief")}
            >
              Brief
            </button>
            <button
              aria-pressed={form.format === "story"}
              onClick={() => change("format", "story")}
            >
              Story
            </button>
            <button className="push-right" onClick={() => setPreview(!preview)}>
              {preview ? "Edit" : "Preview"}
            </button>
          </div>
          {preview ? (
            <div className="composer-preview">
              <h1>{form.title || "Your title"}</h1>
              {form.cover_url && (
                <img
                  className="publication-thumbnail"
                  src={form.cover_url}
                  alt="Thumbnail preview"
                />
              )}
              <p className="lead">{form.summary}</p>
              <RichBody content={editor?.getJSON()} />
            </div>
          ) : (
            <fieldset disabled={busy} className="composer-fields">
              <label>
                Title
                <input
                  maxLength={180}
                  placeholder="An idea worth sharing"
                  value={form.title}
                  onChange={(e) => change("title", e.target.value)}
                />
              </label>
              <label>
                Subtitle <span className="muted">optional</span>
                <input
                  maxLength={400}
                  value={form.summary}
                  onChange={(e) => change("summary", e.target.value)}
                />
              </label>
              <div className="editor-tools" aria-label="Text formatting">
                {[
                  ["Bold", "bold"],
                  ["Italic", "italic"],
                  ["Heading", "heading"],
                  ["Bullets", "bulletList"],
                  ["Numbered list", "orderedList"],
                  ["Quote", "blockquote"],
                ].map(([label, command]) => (
                  <button
                    key={command}
                    aria-pressed={editor?.isActive(command) || false}
                    onClick={() => {
                      const c = editor.chain().focus();
                      ({
                        bold: () => c.toggleBold(),
                        italic: () => c.toggleItalic(),
                        heading: () => c.toggleHeading({ level: 2 }),
                        bulletList: () => c.toggleBulletList(),
                        orderedList: () => c.toggleOrderedList(),
                        blockquote: () => c.toggleBlockquote(),
                      })
                        [command]()
                        .run();
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() =>
                    setLink(editor?.getAttributes("link").href || "")
                  }
                >
                  Link
                </button>
                <label className="upload-button">
                  Inline image
                  <input
                    disabled={busy}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    onChange={(e) => upload(e.target.files[0], true)}
                  />
                </label>
              </div>
              {link !== null && (
                <div className="actions">
                  <input
                    aria-label="Link address"
                    placeholder="https://…"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      if (!link) editor.chain().focus().unsetLink().run();
                      else if (/^https?:\/\//i.test(link))
                        editor.chain().focus().setLink({ href: link }).run();
                      else {
                        setError("Use an http or https link.");
                        return;
                      }
                      setLink(null);
                    }}
                  >
                    Apply link
                  </button>
                  <button onClick={() => setLink(null)}>Cancel</button>
                </div>
              )}
              <EditorContent editor={editor} />
              <div className="form-columns">
                <label>
                  Topic
                  <select
                    value={form.topic}
                    onChange={(e) => change("topic", e.target.value)}
                  >
                    {(data?.items || [{ name: "Research" }]).map((t) => (
                      <option key={t.name}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tags <span className="muted">comma separated</span>
                  <input
                    value={form.tags.join(",")}
                    onChange={(e) => change("tags", e.target.value.split(","))}
                  />
                </label>
              </div>
              <label>
                References{" "}
                <span className="muted">one source URL per line</span>
                <textarea
                  rows={2}
                  value={form.sources.join("\n")}
                  onChange={(e) =>
                    change("sources", e.target.value.split("\n"))
                  }
                />
              </label>
              <div className="cover-field">
                {(imagePreview || form.cover_url) && (
                  <img
                    className="publication-thumbnail"
                    src={imagePreview || form.cover_url}
                    alt="Publication thumbnail preview"
                  />
                )}
                <label className="upload-button">
                  {form.cover_url ? "Change thumbnail" : "Choose a thumbnail"}
                  <input
                    disabled={busy}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const src = URL.createObjectURL(file);
                        setImagePreview(src);
                        upload(file).finally(() => {
                          URL.revokeObjectURL(src);
                          setImagePreview(null);
                        });
                      }
                    }}
                  />
                </label>
                {form.cover_url && (
                  <button onClick={() => change("cover_url", "")}>
                    Remove
                  </button>
                )}
              </div>
            </fieldset>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="composer-bottom">
            <span className="muted" role="status">
              {busy
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : initial.id
                    ? "Saved publication"
                    : "Your voice, your perspective."}
            </span>
            <div className="actions">
              <button disabled={busy} onClick={close}>
                Cancel
              </button>
              <button disabled={busy} onClick={() => save("draft")}>
                Save draft
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => save("published")}
              >
                {form.status === "published" ? "Update publication" : "Publish"}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

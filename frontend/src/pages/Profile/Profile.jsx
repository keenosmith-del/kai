import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, date, uploadImage, useResource } from "../../hooks/api";
import { useApp } from "../../components/context";
import { Avatar, Feedback, Modal } from "../../components/Common";
import { FollowButton } from "../Publication/Publication";
import Feed from "../../components/Feed";
import "./Profile.css";
export default function Profile() {
  const { handle } = useParams(),
    { user, setUser, revision, refresh, toast } = useApp(),
    { data, loading, error } = useResource(
      `/profiles/${handle || user?.handle}`,
      revision,
    ),
    [profile, setProfile] = useState(null),
    [editing, setEditing] = useState(false),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [formError, setError] = useState(""),
    [avatar, setAvatar] = useState(null),
    [preview, setPreview] = useState("");
  useEffect(() => {
    setProfile(data?.profile || null);
  }, [data]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function edit() {
    setForm({
      name: user.name,
      handle: user.handle,
      bio: user.bio || "",
      website: user.website || "",
      avatar_url: user.avatar_url || "",
    });
    setAvatar(null);
    setPreview("");
    setError("");
    setEditing(true);
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const avatar_url = avatar
        ? await uploadImage(avatar, "avatar")
        : form.avatar_url;
      const result = await api("/profile", {
        method: "PATCH",
        body: { ...form, avatar_url },
      });
      setUser(result.user);
      setEditing(false);
      refresh();
      toast("Profile updated.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-page">
      <Feedback loading={loading} error={error}>
        {profile && (
          <>
            <div className="profile-intro">
              <Avatar user={profile} large />
              <div>
                <h1>{profile.name}</h1>
                <p className="muted">@{profile.handle}</p>
              </div>
              {user?.id === profile.id ? (
                <button onClick={edit}>Edit profile</button>
              ) : (
                <FollowButton profile={profile} onChange={setProfile} />
              )}
            </div>
            {profile.bio && <p className="profile-bio">{profile.bio}</p>}
            {profile.website && (
              <a
                className="profile-site"
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                {profile.website}
              </a>
            )}
            <div className="profile-details">
              <Link to={`/u/${profile.handle}/followers`}>
                {profile.follower_count} followers
              </Link>
              <Link to={`/u/${profile.handle}/following`}>
                {profile.following_count} following
              </Link>
              <span>Joined {date(profile.created_at)}</span>
            </div>
            {user?.id === profile.id && (
              <div className="actions">
                <Link className="button" to="/studio">
                  My studio
                </Link>
                <Link className="button" to="/drafts">
                  Drafts
                </Link>
              </div>
            )}
            <h2 className="profile-publications-title">Publications</h2>
            <Feed author={profile.handle} compactHeading />
          </>
        )}
      </Feedback>
      {editing && (
        <Modal
          title="Your profile"
          busy={busy}
          onClose={() => setEditing(false)}
        >
          <form onSubmit={save}>
            <div className="avatar-editor">
              <Avatar
                user={{
                  name: form.name,
                  avatar_url: preview || form.avatar_url,
                }}
                large
              />
              <label className="upload-button">
                Choose profile photo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      if (file.size > 8 * 1024 * 1024) {
                        setError("Choose an image up to 8 MB.");
                        return;
                      }
                      setAvatar(file);
                      setPreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
              {(avatar || form.avatar_url) && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatar(null);
                    setPreview("");
                    setForm((f) => ({ ...f, avatar_url: "" }));
                  }}
                >
                  Remove photo
                </button>
              )}
            </div>
            <p className="muted fine-print">
              Images are normalized and cropped to a circular portrait.
            </p>
            {[
              ["name", "Display name", 120],
              ["handle", "Handle", 48],
              ["website", "Website", 2048],
            ].map(([key, label, max]) => (
              <label key={key}>
                {label}
                <input
                  required={key !== "website"}
                  type={key === "website" ? "url" : "text"}
                  maxLength={max}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label>
              Biography
              <textarea
                maxLength={600}
                rows={4}
                value={form.bio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bio: e.target.value }))
                }
              />
            </label>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

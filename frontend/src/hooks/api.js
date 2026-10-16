import { useEffect, useState } from "react";
export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers:
      body instanceof FormData
        ? rest.headers
        : { "Content-Type": "application/json", ...rest.headers },
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "Unable to complete this request."),
      { status: response.status },
    );
  return data;
}
export function useResource(path, version = 0) {
  const [state, set] = useState({ data: null, loading: true, error: "" });
  useEffect(() => {
    let active = true;
    set((s) => ({ ...s, loading: true, error: "" }));
    api(path)
      .then((data) => {
        if (active) set({ data, loading: false, error: "" });
      })
      .catch((e) => {
        if (active) set({ data: null, loading: false, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return state;
}
export async function uploadImage(file, kind = "publication") {
  const body = new FormData();
  body.append("image", file);
  body.append("kind", kind);
  return (await api("/media", { method: "POST", body })).url;
}
export const date = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Draft";

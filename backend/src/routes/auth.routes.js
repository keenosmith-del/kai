import { Router } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import {
  currentUser,
  destroySession,
  issueSession,
} from "../services/sessions.js";

export const authRouter = Router();

const origin = process.env.APP_ORIGIN || "http://localhost:5175";
const callbackUrl =
  process.env.GITHUB_CALLBACK_URL || `${origin}/api/auth/github/callback`;

const production = process.env.NODE_ENV === "production";
const oauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: production,
  path: "/api/auth/github",
};

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});
const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many registrations. Try again later." },
});
const oauthLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

// A second protection layer for cookie-authenticated, state-changing calls.
authRouter.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const sentOrigin = req.get("origin");
    if (sentOrigin && sentOrigin !== origin) {
      return res.status(403).json({ error: "Invalid request origin." });
    }
  }
  next();
});

function normalEmail(input) {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    email_verified: user.email_verified,
    onboarding_completed_at: user.onboarding_completed_at ?? null,
    github_connected: user.github_connected ?? false,
  };
}

authRouter.post("/register", registerLimit, async (req, res) => {
  const { name, email, password } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = normalEmail(email);
  if (
    cleanName.length < 2 ||
    cleanName.length > 120 ||
    !cleanEmail ||
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 256
  ) {
    return res
      .status(400)
      .json({ error: "Check your name, email and password (8+ characters)." });
  }

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, 'reader', FALSE)
       RETURNING id, name, email, role, email_verified`,
      [cleanName, cleanEmail, passwordHash],
    );
    await issueSession(req, res, rows[0].id);
    return res.status(201).json({ user: publicUser(rows[0]) });
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    }
    throw error;
  }
});

authRouter.post("/login", loginLimit, async (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = normalEmail(email);
  if (!cleanEmail || typeof password !== "string" || password.length > 256) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const { rows } = await pool.query(
    `SELECT id, name, email, role, email_verified, password_hash
     FROM users WHERE LOWER(email) = $1`,
    [cleanEmail],
  );
  const user = rows[0];
  if (
    !user ||
    !user.password_hash ||
    !(await verifyPassword(password, user.password_hash))
  ) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  await issueSession(req, res, user.id);
  return res.json({ user: publicUser(user) });
});

authRouter.get("/me", async (req, res) => {
  return res.json({ user: await currentUser(req) });
});

authRouter.post("/onboarding/complete", async (req, res) => {
  const user = await currentUser(req);

  if (!user) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET
       onboarding_completed_at =
         COALESCE(onboarding_completed_at, NOW()),
       updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [user.id],
  );

  if (!rows.length) {
    return res.status(404).json({
      error: "Account not found.",
    });
  }

  return res.json({
    user: await currentUser(req),
  });
});

authRouter.post("/logout", async (req, res) => {
  await destroySession(req, res);
  return res.json({ ok: true });
});

function oauthConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
}

function clearOauthCookies(res) {
  for (const name of [
    "kai_oauth_state",
    "kai_oauth_verifier",
    "kai_oauth_link",
  ]) {
    res.clearCookie(name, oauthCookieOptions);
  }
}

function oauthError(res, reason) {
  const destination = new URL(origin);
  destination.searchParams.set("auth_error", reason);
  return res.redirect(destination.toString());
}

function stringsEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

authRouter.get("/github", oauthLimit, async (req, res) => {
  if (!oauthConfigured()) {
    return res.status(503).json({ error: "GitHub sign-in is not configured." });
  }

  const link = req.query.link === "1";
  if (link && !(await currentUser(req))) {
    return res.status(401).json({ error: "Sign in before connecting GitHub." });
  }

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const maxAge = 10 * 60 * 1000;

  res.cookie("kai_oauth_state", state, { ...oauthCookieOptions, maxAge });
  res.cookie("kai_oauth_verifier", verifier, { ...oauthCookieOptions, maxAge });
  if (link) {
    res.cookie("kai_oauth_link", "1", { ...oauthCookieOptions, maxAge });
  } else {
    res.clearCookie("kai_oauth_link", oauthCookieOptions);
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return res.redirect(url.toString());
});

async function githubJson(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "kai-publication",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`GitHub API failed: HTTP ${response.status}`);
  return response.json();
}

authRouter.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;
  const expectedState = req.cookies?.kai_oauth_state;
  const verifier = req.cookies?.kai_oauth_verifier;
  const isLink = req.cookies?.kai_oauth_link === "1";
  clearOauthCookies(res);

  if (req.query.error) return oauthError(res, "github_cancelled");
  if (
    typeof code !== "string" ||
    !stringsEqual(state, expectedState) ||
    typeof verifier !== "string" ||
    verifier.length < 43
  ) {
    return oauthError(res, "github_invalid_state");
  }

  try {
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: callbackUrl,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("GitHub token exchange failed");
    }

    // A fresh /user request is required for every OAuth sign-in.
    const profile = await githubJson(
      "https://api.github.com/user",
      tokenData.access_token,
    );
    if (!Number.isSafeInteger(profile.id))
      throw new Error("Invalid GitHub profile ID");
    const providerId = String(profile.id);

    if (isLink) {
      const signedInUser = await currentUser(req);
      if (!signedInUser) return oauthError(res, "login_required");
      const { rows } = await pool.query(
        `SELECT user_id FROM auth_identities
         WHERE provider = 'github' AND provider_user_id = $1`,
        [providerId],
      );
      if (rows.length && rows[0].user_id !== signedInUser.id) {
        return oauthError(res, "github_in_use");
      }
      await pool.query(
        `INSERT INTO auth_identities (user_id, provider, provider_user_id)
         VALUES ($1, 'github', $2)
         ON CONFLICT (provider, provider_user_id) DO NOTHING`,
        [signedInUser.id, providerId],
      );
      return res.redirect(`${origin}/?github_linked=1`);
    }

    const existing = await pool.query(
      `SELECT u.id FROM auth_identities ai
       JOIN users u ON u.id = ai.user_id
       WHERE ai.provider = 'github' AND ai.provider_user_id = $1`,
      [providerId],
    );
    let userId = existing.rows[0]?.id;

    if (!userId) {
      const addresses = await githubJson(
        "https://api.github.com/user/emails?per_page=100",
        tokenData.access_token,
      );
      const selected = Array.isArray(addresses)
        ? (addresses.find((item) => item.verified && item.primary) ??
          addresses.find((item) => item.verified))
        : null;
      const email = normalEmail(selected?.email);
      if (!email) return oauthError(res, "github_verified_email_required");

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const duplicate = await client.query(
          "SELECT id FROM users WHERE LOWER(email) = $1",
          [email],
        );
        if (duplicate.rowCount) {
          await client.query("ROLLBACK");
          return oauthError(res, "account_exists");
        }

        const name = String(profile.name || profile.login || "GitHub reader")
          .trim()
          .slice(0, 120);
        const created = await client.query(
          `INSERT INTO users (name, email, role, email_verified)
           VALUES ($1, $2, 'reader', TRUE) RETURNING id`,
          [name, email],
        );
        userId = created.rows[0].id;
        await client.query(
          `INSERT INTO auth_identities (user_id, provider, provider_user_id)
           VALUES ($1, 'github', $2)`,
          [userId, providerId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") return oauthError(res, "account_exists");
        throw error;
      } finally {
        client.release();
      }
    }

    await issueSession(req, res, userId);
    return res.redirect(origin);
  } catch (error) {
    console.error("GitHub OAuth failed:", error.message);
    return oauthError(res, "github_failed");
  }
});

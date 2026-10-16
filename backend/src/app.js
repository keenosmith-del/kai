import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { pool } from "./db/pool.js";
import { authRouter } from "./routes/auth.routes.js";
import { publicationRouter } from "./routes/publications.routes.js";
import { platformRouter } from "./routes/platform.routes.js";
import { securityRouter } from "./routes/security.routes.js";
export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY)
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
app.use(helmet());
app.use(cookieParser());
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const expected = process.env.APP_ORIGIN || "http://localhost:5175";
    if (
      (req.get("origin") && req.get("origin") !== expected) ||
      req.get("sec-fetch-site") === "cross-site"
    )
      return res.status(403).json({ error: "Invalid request origin." });
  }
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1500,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  }),
);
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
    return mutationLimit(req, res, next);
  next();
});
const mutationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many changes. Please wait a few minutes." },
});
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", application: "kai", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});
app.use("/api/auth", authRouter);
app.use(
  "/api/security",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  securityRouter,
);
app.use("/api/publications", publicationRouter);
app.use("/api", platformRouter);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use((error, _req, res, _next) => {
  if (error.code === "23505")
    return res.status(409).json({ error: "This value is already in use." });
  if (error.code === "23503")
    return res
      .status(400)
      .json({ error: "The related record no longer exists." });
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status === 500) console.error("API error:", error);
  res.status(status).json({
    error:
      status === 500 ? "An unexpected server error occurred." : error.message,
  });
});

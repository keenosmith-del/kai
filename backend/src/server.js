import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pool } from "./db/pool.js";
import { authRouter } from "./routes/auth.routes.js";

const app = express();
const port = Number(process.env.PORT || 5051);

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", application: "kai", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.use("/api/auth", authRouter);

app.use((error, _req, res, _next) => {
  console.error("API error:", error);
  res.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(port, () => {
  console.log(`kai API running on http://localhost:${port}`);
});

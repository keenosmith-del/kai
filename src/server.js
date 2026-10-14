import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5051;

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    application: "kai",
    service: "api",
  });
});

app.listen(PORT, () => {
  console.log(`kai API running on http://localhost:${PORT}`);
});

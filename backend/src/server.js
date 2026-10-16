import { app } from "./app.js";
const port = Number(process.env.PORT || 5051);
app.listen(port, () =>
  console.log(`kai API running on http://localhost:${port}`),
);

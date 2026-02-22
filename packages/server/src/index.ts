import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ status: "ok" });
});

app.get("/health", (c) => {
  return c.json({ healthy: true });
});

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};

#!/usr/bin/env bun
import { createApp } from "./app"
import { parseArgs } from "util"
import diffPage from "./diff-page/index.html"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "opencode-url": { type: "string", default: "http://localhost:4096" },
    port: { type: "string", default: "3000" },
  },
})

const opencodeUrl = values["opencode-url"]!
const port = parseInt(values.port!, 10)

export const { app, ds, stateStream, instanceId } = createApp(opencodeUrl)

console.log(`Server starting on port ${port} (opencode: ${opencodeUrl})`)

export default {
  port,
  routes: {
    "/diff": diffPage,
  },
  fetch: app.fetch,
}

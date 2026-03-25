import { sessions } from "./sessions"
import { projects } from "./projects"
import { diffs } from "./diffs"
import { models } from "./models"
import { agents } from "./agents"
import { commands } from "./commands"
import { snapshot } from "./snapshot"

export type { RouterContext } from "./context"

/** The complete oRPC router — mounted at /api/* in the Hono app. */
export const router = {
  sessions,
  projects,
  diffs,
  models,
  agents,
  commands,
  snapshot,
}

export type Router = typeof router

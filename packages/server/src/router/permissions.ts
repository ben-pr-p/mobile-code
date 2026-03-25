import { ORPCError } from "@orpc/server"
import { z } from "zod/v4"
import { base } from "./base"

export const permissions = {
  /** Reply to a pending permission request (approve once, always, or reject). */
  reply: base
    .input(z.object({
      requestId: z.string(),
      sessionId: z.string(),
      reply: z.enum(["once", "always", "reject"]),
    }))
    .handler(async ({ input, context }) => {
      const sessionRes = await context.client.session.get({ sessionID: input.sessionId })
      const directory = sessionRes.data?.directory
      const res = await context.client.permission.reply({
        requestID: input.requestId,
        reply: input.reply,
        ...(directory ? { directory } : {}),
      })
      if ((res as any).error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Permission reply failed",
        })
      }
      return { success: true }
    }),
}

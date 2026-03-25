import { base } from "./base"

export const snapshot = {
  /** Return materialized ephemeral state so clients can bootstrap without replaying history. */
  ephemeral: base
    .handler(async ({ context }) => {
      return context.stateStream.getEphemeralSnapshot()
    }),
}

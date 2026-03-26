/**
 * Vendored from @durable-streams/state/src/stream-db.ts
 *
 * Stream-backed database built on TanStack DB collections. Creates collections
 * that are fed from a DurableStream connection and kept in sync via an
 * EventDispatcher that routes stream events to the correct collection.
 */
// [FLOCKCODE] Renamed import to allow createCollectionFn callback override
import { createCollection as defaultCreateCollection, createOptimisticAction } from "@tanstack/db"
import { DurableStream as DurableStreamClass } from "@durable-streams/client"
import { isChangeEvent, isControlEvent } from "./types"
import type { Collection, SyncConfig } from "@tanstack/db"
import type { ChangeEvent, StateEvent } from "./types"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import type {
  DurableStream,
  DurableStreamOptions,
  StreamResponse,
} from "@durable-streams/client"

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Definition for a single collection in the stream state
 */
export interface CollectionDefinition<T = unknown> {
  /** Standard Schema for validating values */
  schema: StandardSchemaV1<T>
  /** The type field value in change events that map to this collection */
  type: string
  /** The property name in T that serves as the primary key */
  primaryKey: string
}

/**
 * Helper methods for creating change events for a collection
 */
export interface CollectionEventHelpers<T> {
  /**
   * Create an insert change event
   */
  insert: (params: {
    key?: string
    value: T
    headers?: Omit<Record<string, string>, `operation`>
  }) => ChangeEvent<T>
  /**
   * Create an update change event
   */
  update: (params: {
    key?: string
    value: T
    oldValue?: T
    headers?: Omit<Record<string, string>, `operation`>
  }) => ChangeEvent<T>
  /**
   * Create a delete change event
   */
  delete: (params: {
    key?: string
    oldValue?: T
    headers?: Omit<Record<string, string>, `operation`>
  }) => ChangeEvent<T>
  /**
   * Create an upsert change event (insert or update)
   */
  upsert: (params: {
    key?: string
    value: T
    headers?: Omit<Record<string, string>, `operation`>
  }) => ChangeEvent<T>
}

/**
 * Collection definition enhanced with event creation helpers
 */
export type CollectionWithHelpers<T = unknown> = CollectionDefinition<T> &
  CollectionEventHelpers<T>

/**
 * Stream state definition containing all collections
 */
export type StreamStateDefinition = Record<string, CollectionDefinition>

/**
 * Stream state schema with helper methods for creating change events
 */
export type StateSchema<T extends Record<string, CollectionDefinition>> = {
  [K in keyof T]: CollectionWithHelpers<
    T[K] extends CollectionDefinition<infer U> ? U : unknown
  >
}

/**
 * Definition for a single action that can be passed to createOptimisticAction
 */
export interface ActionDefinition<TParams = any, TContext = any> {
  onMutate: (params: TParams) => void
  mutationFn: (params: TParams, context: TContext) => Promise<any>
}

/**
 * Factory function for creating actions with access to db and stream context
 */
export type ActionFactory<
  TDef extends StreamStateDefinition,
  TActions extends Record<string, ActionDefinition<any>>,
> = (context: { db: StreamDB<TDef>; stream: DurableStream }) => TActions

/**
 * Map action definitions to callable action functions
 */
export type ActionMap<TActions extends Record<string, ActionDefinition<any>>> =
  {
    [K in keyof TActions]: ReturnType<typeof createOptimisticAction<any>>
  }

// [FLOCKCODE] StreamCollectionConfig and CreateCollectionFn — added to support
// pluggable collection creation (e.g. wrapping with persistedCollectionOptions).

/**
 * The collection config that createStreamDB builds for each collection before
 * passing it to createCollection (or the user-supplied createCollectionFn).
 *
 * Callers can wrap this with persistedCollectionOptions() or any other
 * collection-options wrapper before creating the collection.
 */
export interface StreamCollectionConfig {
  id: string
  schema: StandardSchemaV1<object>
  getKey: (item: any) => string
  sync: SyncConfig<any, string>
  startSync: boolean
  gcTime: number
}

/**
 * Callback for creating a collection. Receives the config that createStreamDB
 * would normally pass to createCollection, plus the collection name from the
 * state definition. Return a Collection instance.
 *
 * Use this to wrap the config with persistedCollectionOptions() or apply
 * any other per-collection customization before creating the collection.
 */
export type CreateCollectionFn = (
  /** The key from the state definition (e.g. "projects", "sessions") */
  name: string,
  /** The collection config ready to pass to createCollection */
  config: StreamCollectionConfig
) => Collection<any, string>

/**
 * Options for creating a stream DB
 */
export interface CreateStreamDBOptions<
  TDef extends StreamStateDefinition = StreamStateDefinition,
  TActions extends Record<string, ActionDefinition<any>> = Record<
    string,
    never
  >,
> {
  /** Options for creating the durable stream (stream is created lazily on preload) */
  streamOptions: DurableStreamOptions
  /** The stream state definition */
  state: TDef
  /** Optional factory function to create actions with db and stream context */
  actions?: ActionFactory<TDef, TActions>
  // [FLOCKCODE] createCollectionFn — added to support pluggable collection creation
  /**
   * Optional callback to customize how collections are created.
   *
   * When provided, this function is called for each collection instead of
   * the default createCollection(). This is the hook for adding persistence
   * (e.g. wrapping with persistedCollectionOptions()) or any other
   * per-collection customization.
   *
   * When omitted, collections are created with the default createCollection()
   * from @tanstack/db.
   */
  createCollectionFn?: CreateCollectionFn
}

/**
 * Extract the value type from a CollectionDefinition
 */
type ExtractCollectionType<T extends CollectionDefinition> =
  T extends CollectionDefinition<infer U> ? U : unknown

/**
 * Map collection definitions to TanStack DB Collection types
 */
type CollectionMap<TDef extends StreamStateDefinition> = {
  [K in keyof TDef]: Collection<ExtractCollectionType<TDef[K]> & object, string>
}

/**
 * The StreamDB interface - provides typed access to collections
 */
export type StreamDB<TDef extends StreamStateDefinition> = {
  collections: CollectionMap<TDef>
} & StreamDBMethods

/**
 * StreamDB with actions
 */
export type StreamDBWithActions<
  TDef extends StreamStateDefinition,
  TActions extends Record<string, ActionDefinition<any>>,
> = StreamDB<TDef> & {
  actions: ActionMap<TActions>
}

/**
 * Utility methods available on StreamDB
 */
export interface StreamDBUtils {
  /**
   * Wait for a specific transaction ID to be synced through the stream
   * @param txid The transaction ID to wait for (UUID string)
   * @param timeout Optional timeout in milliseconds (defaults to 5000ms)
   * @returns Promise that resolves when the txid is synced
   */
  awaitTxId: (txid: string, timeout?: number) => Promise<void>
}

/**
 * Methods available on a StreamDB instance
 */
export interface StreamDBMethods {
  /**
   * The underlying DurableStream instance
   */
  stream: DurableStream

  /**
   * Preload all collections by consuming the stream until up-to-date
   */
  preload: () => Promise<void>

  /**
   * Close the stream connection and cleanup
   */
  close: () => void

  /**
   * Utility methods for advanced stream operations
   */
  utils: StreamDBUtils
}

// ============================================================================
// Internal Event Dispatcher
// ============================================================================

/**
 * Handler for collection sync events
 */
interface CollectionSyncHandler {
  begin: () => void
  write: (value: object, type: `insert` | `update` | `delete`) => void
  commit: () => void
  markReady: () => void
  truncate: () => void
  primaryKey: string
}

/**
 * Internal event dispatcher that routes stream events to collection handlers
 */
class EventDispatcher {
  /** Map from event type to collection handler */
  private handlers = new Map<string, CollectionSyncHandler>()

  /** Handlers that have pending writes (need commit) */
  private pendingHandlers = new Set<CollectionSyncHandler>()

  /** Whether we've received the initial up-to-date signal */
  private isUpToDate = false

  /** Resolvers and rejecters for preload promises */
  private preloadResolvers: Array<() => void> = []
  private preloadRejecters: Array<(error: Error) => void> = []

  /** Set of all txids that have been seen and committed */
  private seenTxids = new Set<string>()

  /** Txids collected during current batch (before commit) */
  private pendingTxids = new Set<string>()

  /** Resolvers waiting for specific txids */
  private txidResolvers = new Map<
    string,
    Array<{
      resolve: () => void
      reject: (error: Error) => void
      timeoutId: ReturnType<typeof setTimeout>
    }>
  >()

  /** Track existing keys per collection for upsert logic */
  private existingKeys = new Map<string, Set<string>>()

  /**
   * Register a handler for a specific event type
   */
  registerHandler(eventType: string, handler: CollectionSyncHandler): void {
    this.handlers.set(eventType, handler)
    // Initialize key tracking for upsert logic
    if (!this.existingKeys.has(eventType)) {
      this.existingKeys.set(eventType, new Set())
    }
  }

  /**
   * Dispatch a change event to the appropriate collection.
   * Writes are buffered until commit() is called via markUpToDate().
   */
  dispatchChange(event: StateEvent): void {
    if (!isChangeEvent(event)) return

    // Check for txid in headers and collect it
    if (event.headers.txid && typeof event.headers.txid === `string`) {
      this.pendingTxids.add(event.headers.txid)
    }

    const handler = this.handlers.get(event.type)
    if (!handler) {
      // Unknown event type - ignore silently
      return
    }

    let operation = event.headers.operation

    // Validate that values are objects (required for key tracking)
    if (operation !== `delete`) {
      if (typeof event.value !== `object` || event.value === null) {
        throw new Error(
          `StreamDB collections require object values; got ${typeof event.value} for type=${event.type}, key=${event.key}`
        )
      }
    }

    // Get value, ensuring it's an object
    const originalValue = (event.value ?? {}) as object

    // Create a shallow copy to avoid mutating the original
    const value = { ...originalValue }

    // Set the primary key field on the value object from the event key
    ;(value as any)[handler.primaryKey] = event.key

    // Begin transaction on first write to this handler
    if (!this.pendingHandlers.has(handler)) {
      handler.begin()
      this.pendingHandlers.add(handler)
    }

    // Handle upsert by converting to insert or update
    if (operation === `upsert`) {
      const keys = this.existingKeys.get(event.type)
      const existing = keys?.has(event.key)
      operation = existing ? `update` : `insert`
    }

    // Track key existence for upsert logic
    const keys = this.existingKeys.get(event.type)
    if (operation === `insert` || operation === `update`) {
      keys?.add(event.key)
    } else {
      // Must be delete
      keys?.delete(event.key)
    }

    try {
      handler.write(value, operation)
    } catch (error) {
      console.error(`[StreamDB] Error in handler.write():`, error)
      console.error(`[StreamDB] Event that caused error:`, {
        type: event.type,
        key: event.key,
        operation,
      })
      throw error
    }
  }

  /**
   * Handle control events from the stream JSON items
   */
  dispatchControl(event: StateEvent): void {
    if (!isControlEvent(event)) return

    switch (event.headers.control) {
      case `reset`:
        // Truncate all collections
        Array.from(this.handlers.values()).forEach((handler) => {
          handler.truncate()
        })
        // Clear key tracking
        Array.from(this.existingKeys.values()).forEach((keys) => {
          keys.clear()
        })
        this.pendingHandlers.clear()
        this.isUpToDate = false
        break

      case `snapshot-start`:
      case `snapshot-end`:
        // These are hints for snapshot boundaries
        break
    }
  }

  /**
   * Commit all pending writes and handle up-to-date signal
   */
  markUpToDate(): void {
    // Commit all handlers that have pending writes
    const handlersToCommit = Array.from(this.pendingHandlers)
    for (let i = 0; i < handlersToCommit.length; i++) {
      const handler = handlersToCommit[i]
      try {
        handler.commit()
      } catch (error) {
        console.error(`[StreamDB] Error in handler.commit():`, error)

        // WORKAROUND for TanStack DB groupBy bug
        if (
          error instanceof Error &&
          error.message.includes(`already exists in the collection`) &&
          error.message.includes(`live-query`)
        ) {
          console.warn(
            `[StreamDB] Known TanStack DB groupBy bug detected - continuing despite error`
          )
          console.warn(
            `[StreamDB] Queries with groupBy may show stale data until fixed`
          )
          continue // Don't throw, let other handlers commit
        }

        throw error
      }
    }
    this.pendingHandlers.clear()

    // Commit pending txids
    Array.from(this.pendingTxids).forEach((txid) => {
      this.seenTxids.add(txid)

      // Resolve any promises waiting for this txid
      const resolvers = this.txidResolvers.get(txid)
      if (resolvers) {
        resolvers.forEach(({ resolve, timeoutId }) => {
          clearTimeout(timeoutId)
          resolve()
        })
        this.txidResolvers.delete(txid)
      }
    })
    this.pendingTxids.clear()

    if (!this.isUpToDate) {
      this.isUpToDate = true
      // Mark all collections as ready
      Array.from(this.handlers.values()).forEach((handler) => {
        handler.markReady()
      })
      // Resolve all preload promises
      for (const resolve of this.preloadResolvers) {
        resolve()
      }
      this.preloadResolvers = []
    }
  }

  /**
   * Wait for the stream to reach up-to-date state
   */
  waitForUpToDate(): Promise<void> {
    if (this.isUpToDate) {
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      this.preloadResolvers.push(resolve)
      this.preloadRejecters.push(reject)
    })
  }

  /**
   * Reject all waiting preload promises with an error
   */
  rejectAll(error: Error): void {
    for (const reject of this.preloadRejecters) {
      reject(error)
    }
    this.preloadResolvers = []
    this.preloadRejecters = []

    // Also reject all pending txid promises
    Array.from(this.txidResolvers.values()).forEach((resolvers) => {
      resolvers.forEach(({ reject, timeoutId }) => {
        clearTimeout(timeoutId)
        reject(error)
      })
    })
    this.txidResolvers.clear()
  }

  /**
   * Check if we've received up-to-date
   */
  get ready(): boolean {
    return this.isUpToDate
  }

  /**
   * Wait for a specific txid to be seen in the stream
   */
  awaitTxId(txid: string, timeout: number = 5000): Promise<void> {
    // Check if we've already seen this txid
    if (this.seenTxids.has(txid)) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove this resolver from the map
        const resolvers = this.txidResolvers.get(txid)
        if (resolvers) {
          const index = resolvers.findIndex((r) => r.timeoutId === timeoutId)
          if (index !== -1) {
            resolvers.splice(index, 1)
          }
          if (resolvers.length === 0) {
            this.txidResolvers.delete(txid)
          }
        }
        reject(new Error(`Timeout waiting for txid: ${txid}`))
      }, timeout)

      // Add to resolvers map
      if (!this.txidResolvers.has(txid)) {
        this.txidResolvers.set(txid, [])
      }
      this.txidResolvers.get(txid)!.push({ resolve, reject, timeoutId })
    })
  }
}

// ============================================================================
// Sync Factory
// ============================================================================

/**
 * Create a sync config for a stream-backed collection
 */
function createStreamSyncConfig<T extends object>(
  eventType: string,
  dispatcher: EventDispatcher,
  primaryKey: string
): SyncConfig<T, string> {
  return {
    sync: ({ begin, write, commit, markReady, truncate }: {
      begin: () => void
      write: (message: { value: T; type: 'insert' | 'update' | 'delete' }) => void
      commit: () => void
      markReady: () => void
      truncate: () => void
    }) => {
      // Register this collection's handler with the dispatcher
      dispatcher.registerHandler(eventType, {
        begin,
        write: (value, type) => {
          write({
            value: value as T,
            type,
          })
        },
        commit,
        markReady,
        truncate,
        primaryKey,
      })

      // If the dispatcher is already up-to-date, mark ready immediately
      if (dispatcher.ready) {
        markReady()
      }

      // Return cleanup function
      return () => {
        // No cleanup needed - stream lifecycle managed by StreamDB
      }
    },
  }
}

// ============================================================================
// Main Implementation
// ============================================================================

/**
 * Reserved collection names that would collide with StreamDB properties
 */
const RESERVED_COLLECTION_NAMES = new Set([
  `collections`,
  `preload`,
  `close`,
  `utils`,
  `actions`,
])

/**
 * Create helper functions for a collection
 */
function createCollectionHelpers<T>(
  eventType: string,
  primaryKey: string,
  schema: StandardSchemaV1<T>
): CollectionEventHelpers<T> {
  return {
    insert: ({ key, value, headers }): ChangeEvent<T> => {
      const result = schema[`~standard`].validate(value)
      if (`issues` in result) {
        throw new Error(
          `Validation failed for ${eventType} insert: ${result.issues?.map((i: any) => i.message).join(`, `) ?? `Unknown validation error`}`
        )
      }

      const derived = (value as any)[primaryKey]
      const finalKey =
        key ?? (derived != null && derived !== `` ? String(derived) : undefined)
      if (finalKey == null || finalKey === ``) {
        throw new Error(
          `Cannot create ${eventType} insert event: must provide either 'key' or a value with a non-empty '${primaryKey}' field`
        )
      }

      return {
        type: eventType,
        key: finalKey,
        value,
        headers: { ...headers, operation: `insert` },
      }
    },
    update: ({ key, value, oldValue, headers }): ChangeEvent<T> => {
      const result = schema[`~standard`].validate(value)
      if (`issues` in result) {
        throw new Error(
          `Validation failed for ${eventType} update: ${result.issues?.map((i: any) => i.message).join(`, `) ?? `Unknown validation error`}`
        )
      }

      if (oldValue !== undefined) {
        const oldResult = schema[`~standard`].validate(oldValue)
        if (`issues` in oldResult) {
          throw new Error(
            `Validation failed for ${eventType} update (oldValue): ${oldResult.issues?.map((i: any) => i.message).join(`, `) ?? `Unknown validation error`}`
          )
        }
      }

      const derived = (value as any)[primaryKey]
      const finalKey =
        key ?? (derived != null && derived !== `` ? String(derived) : undefined)
      if (finalKey == null || finalKey === ``) {
        throw new Error(
          `Cannot create ${eventType} update event: must provide either 'key' or a value with a non-empty '${primaryKey}' field`
        )
      }

      return {
        type: eventType,
        key: finalKey,
        value,
        old_value: oldValue,
        headers: { ...headers, operation: `update` },
      }
    },
    delete: ({ key, oldValue, headers }): ChangeEvent<T> => {
      if (oldValue !== undefined) {
        const result = schema[`~standard`].validate(oldValue)
        if (`issues` in result) {
          throw new Error(
            `Validation failed for ${eventType} delete (oldValue): ${result.issues?.map((i: any) => i.message).join(`, `) ?? `Unknown validation error`}`
          )
        }
      }

      const finalKey =
        key ?? (oldValue ? String((oldValue as any)[primaryKey]) : undefined)
      if (!finalKey) {
        throw new Error(
          `Cannot create ${eventType} delete event: must provide either 'key' or 'oldValue' with a ${primaryKey} field`
        )
      }

      return {
        type: eventType,
        key: finalKey,
        old_value: oldValue,
        headers: { ...headers, operation: `delete` },
      }
    },
    upsert: ({ key, value, headers }): ChangeEvent<T> => {
      const result = schema[`~standard`].validate(value)
      if (`issues` in result) {
        throw new Error(
          `Validation failed for ${eventType} upsert: ${result.issues?.map((i: any) => i.message).join(`, `) ?? `Unknown validation error`}`
        )
      }

      const derived = (value as any)[primaryKey]
      const finalKey =
        key ?? (derived != null && derived !== `` ? String(derived) : undefined)
      if (finalKey == null || finalKey === ``) {
        throw new Error(
          `Cannot create ${eventType} upsert event: must provide either 'key' or a value with a non-empty '${primaryKey}' field`
        )
      }

      return {
        type: eventType,
        key: finalKey,
        value,
        headers: { ...headers, operation: `upsert` },
      }
    },
  }
}

/**
 * Create a state schema definition with typed collections and event helpers
 */
export function createStateSchema<
  T extends Record<string, CollectionDefinition>,
>(collections: T): StateSchema<T> {
  // Validate no reserved collection names
  for (const name of Object.keys(collections)) {
    if (RESERVED_COLLECTION_NAMES.has(name)) {
      throw new Error(
        `Reserved collection name "${name}" - this would collide with StreamDB properties (${Array.from(RESERVED_COLLECTION_NAMES).join(`, `)})`
      )
    }
  }

  // Validate no duplicate event types
  const typeToCollection = new Map<string, string>()
  for (const [collectionName, def] of Object.entries(collections)) {
    const existing = typeToCollection.get(def.type)
    if (existing) {
      throw new Error(
        `Duplicate event type "${def.type}" - used by both "${existing}" and "${collectionName}" collections`
      )
    }
    typeToCollection.set(def.type, collectionName)
  }

  // Enhance collections with helper methods
  const enhancedCollections: any = {}
  for (const [name, collectionDef] of Object.entries(collections)) {
    enhancedCollections[name] = {
      ...collectionDef,
      ...createCollectionHelpers(
        collectionDef.type,
        collectionDef.primaryKey,
        collectionDef.schema
      ),
    }
  }

  return enhancedCollections
}

/**
 * Create a stream-backed database with TanStack DB collections.
 *
 * Synchronous — creates the stream handle and collections but does not
 * start the stream connection. Call `db.preload()` to connect and sync
 * initial data.
 */
export function createStreamDB<
  TDef extends StreamStateDefinition,
  TActions extends Record<string, ActionDefinition<any>> = Record<
    string,
    never
  >,
>(
  options: CreateStreamDBOptions<TDef, TActions>
): TActions extends Record<string, never>
  ? StreamDB<TDef>
  : StreamDBWithActions<TDef, TActions> {
  // [FLOCKCODE] Destructure createCollectionFn (added option)
  const { streamOptions, state, actions: actionsFactory, createCollectionFn } = options

  // Create a stream handle (lightweight, doesn't connect until stream() is called)
  const stream = new DurableStreamClass(streamOptions)

  // Create the event dispatcher
  const dispatcher = new EventDispatcher()

  // Create TanStack DB collections for each definition
  const collectionInstances: Record<string, Collection<object, string>> = {}

  for (const [name, definition] of Object.entries(state)) {
    // [FLOCKCODE] Extract config into StreamCollectionConfig so createCollectionFn
    // can wrap it (e.g. with persistedCollectionOptions) before creating the collection
    const config: StreamCollectionConfig = {
      id: `stream-db:${name}`,
      schema: definition.schema as StandardSchemaV1<object>,
      getKey: (item: any) => String(item[definition.primaryKey]),
      sync: createStreamSyncConfig(
        definition.type,
        dispatcher,
        definition.primaryKey
      ),
      startSync: true,
      // Disable GC - we manage lifecycle via db.close()
      gcTime: 0,
    }

    // [FLOCKCODE] Use createCollectionFn if provided, else default createCollection
    const collection = createCollectionFn
      ? createCollectionFn(name, config)
      : defaultCreateCollection(config)

    collectionInstances[name] = collection
  }

  // Stream consumer state (lazy initialization)
  let streamResponse: StreamResponse<StateEvent> | null = null
  const abortController = new AbortController()
  let consumerStarted = false

  /**
   * Start the stream consumer (called lazily on first preload)
   */
  const startConsumer = async (): Promise<void> => {
    if (consumerStarted) return
    consumerStarted = true

    // Start streaming (this is where the connection actually happens)
    streamResponse = await stream.stream<StateEvent>({
      live: true,
      signal: abortController.signal,
    })

    // Track batch processing for debugging
    let batchCount = 0

    // Process events as they come in
    streamResponse.subscribeJson((batch) => {
      try {
        batchCount++

        for (const event of batch.items) {
          if (isChangeEvent(event)) {
            dispatcher.dispatchChange(event)
          } else if (isControlEvent(event)) {
            dispatcher.dispatchControl(event)
          }
        }

        // Check batch-level up-to-date signal
        if (batch.upToDate) {
          dispatcher.markUpToDate()
        }
      } catch (error) {
        console.error(`[StreamDB] Error processing batch:`, error)
        // Reject all waiting preload promises
        dispatcher.rejectAll(error as Error)
        // Abort the stream to stop further processing
        abortController.abort()
      }
      return Promise.resolve()
    })
  }

  // Build the StreamDB object with methods
  const dbMethods: StreamDBMethods = {
    stream,
    preload: async () => {
      await startConsumer()
      await dispatcher.waitForUpToDate()
    },
    close: () => {
      // Reject all pending operations before aborting
      dispatcher.rejectAll(new Error(`StreamDB closed`))
      abortController.abort()
    },
    utils: {
      awaitTxId: (txid: string, timeout?: number) =>
        dispatcher.awaitTxId(txid, timeout),
    },
  }

  // Combine collections with methods
  const db = {
    collections: collectionInstances,
    ...dbMethods,
  } as unknown as StreamDB<TDef>

  // If actions factory is provided, wrap actions and return db with actions
  if (actionsFactory) {
    const actionDefs = actionsFactory({ db, stream })
    const wrappedActions: Record<
      string,
      ReturnType<typeof createOptimisticAction>
    > = {}
    for (const [name, def] of Object.entries(actionDefs)) {
      wrappedActions[name] = createOptimisticAction({
        onMutate: def.onMutate,
        mutationFn: def.mutationFn,
      })
    }

    return {
      ...db,
      actions: wrappedActions,
    } as any
  }

  return db as any
}

// ============================================================================
// [FLOCKCODE] Multi-stream DB — create one DB, attach multiple streams
// ============================================================================

/**
 * Captured sync callbacks for a single collection. These are the functions
 * that TanStack DB passes into the `sync.sync()` callback. We capture them
 * so that multiple EventDispatchers (one per stream) can drive the same
 * collection.
 */
interface CapturedSyncCallbacks {
  begin: () => void
  write: (message: { value: any; type: 'insert' | 'update' | 'delete' }) => void
  commit: () => void
  markReady: () => void
  truncate: () => void
}

/**
 * A sync config that captures the TanStack DB sync callbacks and exposes
 * them for external use. This allows multiple EventDispatchers to drive
 * writes into the same collection.
 */
function createCapturingSyncConfig(): {
  syncConfig: SyncConfig<any, string>
  getCallbacks: () => CapturedSyncCallbacks | null
} {
  let captured: CapturedSyncCallbacks | null = null

  const syncConfig: SyncConfig<any, string> = {
    sync: ({ begin, write, commit, markReady, truncate }: {
      begin: () => void
      write: (message: { value: any; type: 'insert' | 'update' | 'delete' }) => void
      commit: () => void
      markReady: () => void
      truncate: () => void
    }) => {
      captured = { begin, write, commit, markReady, truncate }
      return () => {
        captured = null
      }
    },
  }

  return { syncConfig, getCallbacks: () => captured }
}

/**
 * A handle returned by appendStreamToDb for managing one stream's lifecycle.
 */
export interface StreamHandle {
  /** The underlying DurableStream instance */
  stream: DurableStream
  /** Connect and sync until up-to-date */
  preload: () => Promise<void>
  /** Close this stream connection */
  close: () => void
  /** Wait for a specific txid from this stream */
  awaitTxId: (txid: string, timeout?: number) => Promise<void>
}

/**
 * A multi-stream DB that holds collections and allows attaching streams.
 */
export interface MultiStreamDB<TDef extends StreamStateDefinition> {
  /** All collections in this DB */
  collections: CollectionMap<TDef>
  /** Close all attached streams */
  close: () => void
}

/**
 * Options for creating a multi-stream DB (no streams attached yet).
 */
export interface CreateDbWithNoStreamsOptions<
  TDef extends StreamStateDefinition = StreamStateDefinition,
> {
  /** The combined state definition for all collections */
  state: TDef
  /** Optional callback to customize collection creation (e.g. persistence) */
  createCollectionFn?: CreateCollectionFn
  // [FLOCKCODE] Local-only collections — no sync config, client-written directly
  /**
   * Collection names that are local-only (no sync, no stream).
   * These collections are created without a sync config and can be written
   * to directly via the TanStack DB collection API (insert/update/delete).
   */
  localCollectionNames?: ReadonlySet<string>
}

/**
 * Internal state stored per collection to support multi-stream routing.
 */
interface CollectionEntry {
  definition: CollectionDefinition
  collection: Collection<object, string>
  getCallbacks: () => CapturedSyncCallbacks | null
}

/**
 * Create a DB with collections but no stream connections.
 *
 * Collections are created immediately and their sync callbacks are captured.
 * Use `appendStreamToDb()` to attach one or more streams that will feed
 * events into the collections.
 *
 * @example
 * ```ts
 * const db = createDbWithNoStreams({ state: allCollectionsDef });
 * const stateStream = appendStreamToDb(db, {
 *   streamOptions: { url: `${base}/${instanceId}` },
 *   collectionNames: ['projects', 'sessions', 'messages'],
 * });
 * const ephemeralStream = appendStreamToDb(db, {
 *   streamOptions: { url: `${base}/${instanceId}/ephemeral` },
 *   collectionNames: ['sessionStatuses', 'messages', 'changes', ...],
 * });
 * await Promise.all([stateStream.preload(), ephemeralStream.preload()]);
 * ```
 */
export function createDbWithNoStreams<
  TDef extends StreamStateDefinition,
>(
  options: CreateDbWithNoStreamsOptions<TDef>
): MultiStreamDB<TDef> & { _entries: Map<string, CollectionEntry> } {
  const { state, createCollectionFn, localCollectionNames } = options

  const collectionInstances: Record<string, Collection<object, string>> = {}
  const entries = new Map<string, CollectionEntry>()
  const streamHandles: StreamHandle[] = []

  for (const [name, definition] of Object.entries(state)) {
    const isLocal = localCollectionNames?.has(name) ?? false

    if (isLocal) {
      // [FLOCKCODE] Local-only collection — no sync, client-written directly.
      // These are used for backends config, connection state, etc.
      const config: StreamCollectionConfig = {
        id: `stream-db:${name}`,
        schema: definition.schema as StandardSchemaV1<object>,
        getKey: (item: any) => String(item[definition.primaryKey]),
        sync: undefined as any, // No sync — local-only
        startSync: false,
        gcTime: 0,
      }

      // Remove sync from the config entirely before passing to createCollection
      const { sync: _sync, startSync: _startSync, ...localConfig } = config
      const collection = createCollectionFn
        ? createCollectionFn(name, config)
        : defaultCreateCollection(localConfig as any)

      collectionInstances[name] = collection
      // Local collections still get an entry but with a no-op getCallbacks
      entries.set(name, { definition, collection, getCallbacks: () => null })
    } else {
      // Stream-fed collection — create with capturing sync config
      const { syncConfig, getCallbacks } = createCapturingSyncConfig()

      const config: StreamCollectionConfig = {
        id: `stream-db:${name}`,
        schema: definition.schema as StandardSchemaV1<object>,
        getKey: (item: any) => String(item[definition.primaryKey]),
        sync: syncConfig,
        startSync: true,
        gcTime: 0,
      }

      const collection = createCollectionFn
        ? createCollectionFn(name, config)
        : defaultCreateCollection(config)

      collectionInstances[name] = collection
      entries.set(name, { definition, collection, getCallbacks })
    }
  }

  return {
    collections: collectionInstances as unknown as CollectionMap<TDef>,
    close: () => {
      for (const handle of streamHandles) {
        handle.close()
      }
    },
    // Exposed for appendStreamToDb — not part of the public interface
    _entries: entries,
  }
}

/**
 * Options for attaching a stream to an existing multi-stream DB.
 */
export interface AppendStreamOptions {
  /** Options for creating the DurableStream connection */
  streamOptions: DurableStreamOptions
  /**
   * Which collections this stream feeds events into.
   * These must be keys from the state definition passed to createDbWithNoStreams.
   */
  collectionNames: string[]
  // [FLOCKCODE] backendUrl stamping — injected into every row by the write handler
  /**
   * Backend URL to stamp on every row written by this stream.
   * This lets queries join/filter by backend without the server knowing its own URL.
   */
  backendUrl?: string
  /**
   * Collections whose key should be rewritten as `${backendUrl}:${originalKey}`.
   * Used for backendProjects where the same project ID can exist on multiple backends.
   * The original key is also stored as `projectId` on the value.
   */
  compositeKeyCollections?: Set<string>
}

/**
 * Attach a DurableStream to an existing multi-stream DB.
 *
 * Creates a new stream connection and EventDispatcher that routes events
 * to the specified subset of collections. Multiple streams can feed into
 * the same collection (e.g. `messages` from both state and ephemeral streams).
 *
 * Returns a StreamHandle for managing this stream's lifecycle independently.
 */
export function appendStreamToDb<TDef extends StreamStateDefinition>(
  db: MultiStreamDB<TDef> & { _entries: Map<string, CollectionEntry> },
  options: AppendStreamOptions
): StreamHandle {
  const { streamOptions, collectionNames, backendUrl, compositeKeyCollections } = options

  // Create a stream handle (lightweight, doesn't connect until stream() is called)
  const stream = new DurableStreamClass(streamOptions)

  // Create a dedicated EventDispatcher for this stream
  const dispatcher = new EventDispatcher()

  // Register handlers for each collection this stream feeds
  for (const name of collectionNames) {
    const entry = db._entries.get(name)
    if (!entry) {
      throw new Error(
        `[appendStreamToDb] Collection "${name}" not found in DB. ` +
        `Available: ${Array.from(db._entries.keys()).join(', ')}`
      )
    }

    const callbacks = entry.getCallbacks()
    if (!callbacks) {
      throw new Error(
        `[appendStreamToDb] Collection "${name}" sync callbacks not yet available. ` +
        `Ensure collection sync has started (startSync: true).`
      )
    }

    // [FLOCKCODE] Determine if this collection needs composite keys
    const needsCompositeKey = compositeKeyCollections?.has(name) ?? false
    const pk = entry.definition.primaryKey

    // Register this collection's sync callbacks with the dispatcher
    dispatcher.registerHandler(entry.definition.type, {
      begin: callbacks.begin,
      write: (value, type) => {
        // [FLOCKCODE] Stamp backendUrl on every row
        if (backendUrl) {
          ;(value as any).backendUrl = backendUrl
        }
        // [FLOCKCODE] Rewrite key to composite for collections that need it.
        // Store the original key as `projectId` and set the primary key to
        // `${backendUrl}:${originalKey}`.
        if (needsCompositeKey && backendUrl) {
          const originalKey = String((value as any)[pk])
          ;(value as any).projectId = originalKey
          ;(value as any)[pk] = `${backendUrl}:${originalKey}`
        }
        callbacks.write({ value, type })
      },
      commit: callbacks.commit,
      markReady: callbacks.markReady,
      truncate: callbacks.truncate,
      primaryKey: pk,
    })
  }

  // Stream consumer state (lazy initialization)
  let streamResponse: StreamResponse<StateEvent> | null = null
  const abortController = new AbortController()
  let consumerStarted = false

  const startConsumer = async (): Promise<void> => {
    if (consumerStarted) return
    consumerStarted = true

    streamResponse = await stream.stream<StateEvent>({
      live: true,
      signal: abortController.signal,
    })

    let batchCount = 0

    streamResponse.subscribeJson((batch) => {
      try {
        batchCount++

        for (const event of batch.items) {
          if (isChangeEvent(event)) {
            dispatcher.dispatchChange(event)
          } else if (isControlEvent(event)) {
            dispatcher.dispatchControl(event)
          }
        }

        if (batch.upToDate) {
          dispatcher.markUpToDate()
        }
      } catch (error) {
        console.error(`[StreamDB] Error processing batch:`, error)
        dispatcher.rejectAll(error as Error)
        abortController.abort()
      }
      return Promise.resolve()
    })
  }

  const handle: StreamHandle = {
    stream,
    preload: async () => {
      await startConsumer()
      await dispatcher.waitForUpToDate()
    },
    close: () => {
      dispatcher.rejectAll(new Error(`Stream closed`))
      abortController.abort()
    },
    awaitTxId: (txid: string, timeout?: number) =>
      dispatcher.awaitTxId(txid, timeout),
  }

  return handle
}

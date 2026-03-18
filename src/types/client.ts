import { 
  object, 
  string, 
  boolean, 
  number, 
  optional, 
  type InferOutput, 
  type InferInput 
} from 'valibot'

/**
 * Client options for Zaileys V4.
 * Uses Valibot for runtime validation and type inference.
 */

export const ClientOptionsSchema = object({
  /**
   * Auth configuration.
   * Path to session directory or custom auth provider.
   */
  auth: string(),

  /**
   * Whether to automatically update presence (typing/composing) before sending.
   * Default: false
   */
  autoPresence: optional(boolean(), false),

  /**
   * Whether to automatically extract and add mentions from text content.
   * Default: true
   */
  autoMentions: optional(boolean(), true),

  /**
   * Maximum recursive reply chain depth to fetch.
   * Default: 3
   */
  maxReplies: optional(number(), 3),

  /**
   * Whether to automatically read incoming messages.
   * Default: false
   */
  autoRead: optional(boolean(), false),

  /**
   * Custom logger implementation.
   */
  logger: optional(object({
    info: optional(string()), // Placeholder for now
  })),
})

export type ClientOptions = InferOutput<typeof ClientOptionsSchema>
export type ClientOptionsInput = InferInput<typeof ClientOptionsSchema>

/**
 * Final Client interface (Skeleton for now).
 */
export interface Client {
  readonly options: ClientOptions
  // More methods to be added in Phase 6
}

import type { z } from 'zod'

/**
 * A server action's contract: the one source of truth for its input and
 * output. The Worker validates input against it and strips any output field
 * the contract does not declare; the browser client checks the response
 * against it. Both sides infer their TypeScript types from it.
 */
export interface ActionContract<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> {
  /** One sentence for humans and agents: what the action does and who may call it. */
  description: string
  input: TInput
  output: TOutput
}

export function defineAction<TInput extends z.ZodType, TOutput extends z.ZodType>(
  contract: ActionContract<TInput, TOutput>,
): ActionContract<TInput, TOutput> {
  return contract
}

/** What the caller sends (before defaults and transforms). */
export type ActionInput<C extends ActionContract> = z.input<C['input']>

/** What the handler receives after validation. */
export type ParsedActionInput<C extends ActionContract> = z.output<C['input']>

/** What the caller receives on success. */
export type ActionOutput<C extends ActionContract> = z.output<C['output']>

export type ContractRegistry = Readonly<Record<string, ActionContract>>

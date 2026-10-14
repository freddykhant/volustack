import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "~/env";
import { CoachIntentFormSchema, type CoachIntentForm } from "~/schema";
import type { ModelContext } from "./context";
import { COACH_SYSTEM_PROMPT, COACH_TOOL_NAME, COACH_TOOL_SCHEMA, userTurn } from "./prompt";

export type CoachFailure = "no_key" | "timeout" | "api_error" | "invalid_form";

export type InterpretResult =
  | { ok: true; form: CoachIntentForm; model: string; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; reason: CoachFailure };

export interface CoachInterpreter {
  interpret(text: string, context: ModelContext): Promise<InterpretResult>;
}

const TIMEOUT_MS = 8000;
const MAX_TOKENS = 400;

export function coachEnabled(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

/**
 * The intent form out of a model response, or null. Only the forced tool's input is read:
 * any text the model wrote is ignored, and the input is parsed by the same schema the
 * rest of the app trusts.
 */
export function parseToolResponse(content: unknown): CoachIntentForm | null {
  if (!Array.isArray(content)) return null;
  for (const block of content as { type?: unknown; name?: unknown; input?: unknown }[]) {
    if (block?.type !== "tool_use" || block.name !== COACH_TOOL_NAME) continue;
    const parsed = CoachIntentFormSchema.safeParse(block.input);
    return parsed.success ? parsed.data : null;
  }
  return null;
}

export const anthropicInterpreter: CoachInterpreter = {
  async interpret(text, context) {
    if (!env.ANTHROPIC_API_KEY) return { ok: false, reason: "no_key" };
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
    try {
      const res = await client.messages.create({
        model: env.COACH_MODEL,
        max_tokens: MAX_TOKENS,
        system: COACH_SYSTEM_PROMPT,
        tools: [
          {
            name: COACH_TOOL_NAME,
            description: "Record what the athlete's message means.",
            // The SDK types the schema as `{ type: "object", ... }`; ours is a plain JSON Schema record.
            input_schema: COACH_TOOL_SCHEMA as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: COACH_TOOL_NAME },
        messages: [{ role: "user", content: userTurn(text, context) }],
      });
      const form = parseToolResponse(res.content);
      if (form === null) return { ok: false, reason: "invalid_form" };
      return {
        ok: true,
        form,
        model: res.model,
        inputTokens: res.usage?.input_tokens ?? null,
        outputTokens: res.usage?.output_tokens ?? null,
      };
    } catch (err) {
      return { ok: false, reason: err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "api_error" };
    }
  },
};

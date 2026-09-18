/**
 * Provider-agnostic AI client speaking the OpenAI-compatible chat completions
 * protocol — works with Z.ai, DeepSeek, OpenAI, OpenRouter, Ollama, LM Studio…
 *
 * Configuration (first match wins, see .env.local):
 *   AI_API_KEY + AI_BASE_URL + AI_MODEL   fully explicit
 *   DEEPSEEK_API_KEY                      → https://api.deepseek.com · deepseek-flash
 *   ZAI_API_KEY                           → https://api.z.ai/api/paas/v4 · glm-4.6
 *   OPENAI_API_KEY                        → https://api.openai.com/v1 · gpt-4o-mini
 */

export interface AIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export function resolveAIConfig(): AIConfig | null {
  const model = process.env.AI_MODEL;
  if (process.env.AI_API_KEY) {
    return {
      apiKey: process.env.AI_API_KEY,
      baseURL: (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: model ?? "gpt-4o-mini",
    };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: (process.env.AI_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, ""),
      model: model ?? "deepseek-flash",
    };
  }
  if (process.env.ZAI_API_KEY) {
    return {
      apiKey: process.env.ZAI_API_KEY,
      baseURL: (process.env.AI_BASE_URL ?? "https://api.z.ai/api/paas/v4").replace(/\/+$/, ""),
      model: model ?? "glm-4.6",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: model ?? "gpt-4o-mini",
    };
  }
  return null;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletions(
  config: AIConfig,
  messages: LLMMessage[],
  opts: { stream?: boolean } = {},
): Promise<Response> {
  return fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: opts.stream ?? false,
    }),
  });
}

/** yields assistant text deltas from an OpenAI-compatible SSE stream */
export async function* streamContent(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) yield delta;
      } catch {
        // keep-alives and partial frames — ignore
      }
    }
  }
}

/** pulls the first JSON object/array out of a model reply, fences and all */
export function extractJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "");
  const starts = [cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

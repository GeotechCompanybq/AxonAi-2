const provider = process.env.AI_PROVIDER ?? "google";

async function buildAI() {
  if (provider !== "nvidia") {
    // Default: Google Gemini via Genkit
    const { genkit } = await import("genkit");
    const { googleAI } = await import("@genkit-ai/googleai");
    return genkit({ plugins: [googleAI()], model: "googleai/gemini-2.0-flash" });
  }

  // NVIDIA path using direct fetch to OpenAI-compatible API
  type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
  const apiKey = process.env.NVIDIA_API_KEY || "";
  const baseURL =
    process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  const model = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";

  function buildMessages(promptText: string, input: unknown): ChatMessage[] {
    const system: ChatMessage = {
      role: "system",
      content:
        "Respond strictly in JSON with an 'output' field matching the requested output schema.",
    };
    const user: ChatMessage = {
      role: "user",
      content: `${promptText}\n\nInput JSON:\n${JSON.stringify(
        input,
        null,
        2
      )}`,
    };
    return [system, user];
  }

  function parseJsonSafely<T = any>(raw: string): { output: T } | null {
    try {
      let text = raw.trim();
      if (text.startsWith("```")) {
        text = text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
      }
      const direct = JSON.parse(text);
      if (direct && typeof direct === "object") return direct as { output: T };
    } catch {}
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const slice = raw.slice(start, end + 1);
      try {
        const obj = JSON.parse(slice);
        if (obj && typeof obj === "object") return obj as { output: T };
      } catch {}
    }
    return null;
  }

  return {
    definePrompt<TIn = any, TOut = any>(cfg: {
      name: string;
      input: { schema: unknown };
      output: { schema: unknown };
      prompt: string;
    }) {
      return async (input: TIn): Promise<{ output: TOut }> => {
        const messages = buildMessages(cfg.prompt, input);
        const timeoutMs = Number(process.env.NVIDIA_TIMEOUT_MS || 20000);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        let resp: Response;
        try {
          resp = await fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.2,
              // response_format may be ignored; we'll parse robustly
            }),
          });
        } catch (e: any) {
          if (e?.name === "AbortError") {
            throw new Error(`NVIDIA API timeout after ${timeoutMs}ms`);
          }
          throw e;
        } finally {
          clearTimeout(timeoutId);
        }
        const raw = await resp.text();
        let data: any;
        try {
          data = JSON.parse(raw);
        } catch {
          data = { raw };
        }
        if (!resp.ok) {
          const message =
            typeof data === "string" ? data : data?.raw || JSON.stringify(data);
          throw new Error(`NVIDIA API error ${resp.status}: ${message}`);
        }
        const content =
          data?.choices?.[0]?.message?.content ?? data?.raw ?? "{}";
        const parsed = parseJsonSafely<TOut>(content);
        if (parsed) return parsed as { output: TOut };
        return { output: content as unknown as TOut };
      };
    },
    // Provide a no-op tool definition so callers can register tools without errors
    defineTool<TIn = any, TOut = any>(
      _cfg: {
        name: string;
        description?: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
      },
      _handler: (input: TIn) => Promise<TOut> | TOut
    ) {
      // Return a simple token the definePrompt can accept in `tools` arrays if provided
      return { __tool: true } as const;
    },
    defineFlow<TIn = any, TOut = any>(
      _meta: { name: string; inputSchema?: unknown; outputSchema?: unknown },
      handler: (input: TIn) => Promise<TOut>
    ) {
      return async (input: TIn): Promise<TOut> => handler(input);
    },
  } as const;
}

export const ai = await buildAI();

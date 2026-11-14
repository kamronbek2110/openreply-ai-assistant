import type { AiHistoryMessage } from "./assistant";

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

export async function generateGeminiReply({
  instructions,
  messages,
  maxOutputTokens = 300,
}: {
  instructions: string;
  messages: AiHistoryMessage[];
  maxOutputTokens?: number;
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const contents = messages.map((message) => ({
    role: message.role === "ASSISTANT" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  for (let index = 1; index < contents.length; index += 1) {
    if (contents[index].role === contents[index - 1].role) {
      contents[index - 1].parts[0].text += `\n${contents[index].parts[0].text}`;
      contents.splice(index, 1);
      index -= 1;
    }
  }
  while (contents[0]?.role === "model") contents.shift();
  if (!contents.length) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const request = (thinking: boolean) =>
    fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents,
        generationConfig: {
          maxOutputTokens,
          temperature: 0.5,
          ...(thinking ? { thinkingConfig: { thinkingLevel: "MINIMAL" } } : {}),
        },
      }),
    });

  try {
    let response = await request(true);
    if (response.status === 400) response = await request(false);
    if (!response.ok) return null;
    const result = (await response.json()) as GeminiResponse;
    const text = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

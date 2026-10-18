export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("POST only", { status: 405 });
    }
    const body = await request.json();

    // 取 model（cc-switch 会发真实模型名，比如 @cf/deepseek/deepseek-v4-pro）
    const model = body.model;
    if (!model) {
      return new Response(JSON.stringify({ error: { message: "model required" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // OpenAI messages → Workers AI prompt：把 system + user/assistant 顺序拼起来
    const messages = body.messages ?? [];
    const prompt = messages
      .map((m) => `${m.role === "system" ? "[system]" : m.role === "user" ? "[user]" : "[assistant]"} ${m.content}`)
      .join("\n");

    const input = {
      text: prompt,
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 2048,
      stop: body.stop,
    };

    const aiModel = env.AI.get(model);
    const result = await aiModel.run(input);

    // 取文本：Workers AI 各模型返回字段不一，常见的有 result.text / result.response / result.content[0].text
    let text = result.text ?? result.response ?? (result.content?.[0]?.text) ?? "";

    const openaiResponse = {
      id: `cmpl-${Date.now()}`,
      object: "chat.completion",
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        },
      ],
    };

    return new Response(JSON.stringify(openaiResponse), {
      headers: { "content-type": "application/json" },
    });
  },
}

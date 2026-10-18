export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({ error: { message: "POST only" } }),
          { status: 405, headers: { "content-type": "application/json" } },
        );
      }

      // 鉴权(可选,删掉这段即可跳过)
      const auth = request.headers.get("authorization") || "";
      if (env.WORKER_SECRET && !auth.startsWith("Bearer ") || auth.slice(7) !== env.WORKER_SECRET) {
        return new Response(
          JSON.stringify({ error: { message: "unauthorized" } }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      }

      const body = await request.json();
      const model = body.model;
      if (!model) {
        return new Response(
          JSON.stringify({ error: { message: "model required" } }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }

      // 显式检查 env.AI 是否绑定(之前 1101 最可能的原因)
      if (!env.AI) {
        return new Response(
          JSON.stringify({
            error: {
              message: "env.AI binding not found on this Worker. " +
                "Add the Workers AI binding in the Worker's Settings → Bindings → Bindings.",
            },
          }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }

      const aiModel = env.AI.get(model);
      if (!aiModel) {
        return new Response(
          JSON.stringify({
            error: {
              message: `model ${model} not found via env.AI.get() in this account/region. ` +
                `Check available models at dash.cloudflare.com → AI → 模型列表, or use a region-specific alias.`,
              code: "model_not_found",
            },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        );
      }

      const messages = body.messages ?? [];
      const prompt = messages
        .map((m) => `${m.role === "system" ? "[system]" : m.role === "user" ? "[user]" : "[assistant]"} ${m.content}`)
        .join("\n");

      const result = await aiModel.run({
        text: prompt,
        temperature: body.temperature ?? 0.7,
        max_tokens: body.max_tokens ?? 2048,
      });

      const text =
        result.text ?? result.response ?? result.content?.[0]?.text ?? result.completion ?? JSON.stringify(result);

      return new Response(
        JSON.stringify({
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
        }),
        { headers: { "content-type": "application/json" } },
      );
    } catch (e) {
      // 兜底:任何没被上面接住的异常都转成 500 + 结构化 JSON,不再 1101
      return new Response(
        JSON.stringify({
          error: {
            message: `unhandled worker error: ${e?.message ?? String(e)}`,
            stack: e?.stack,
          },
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  },
};

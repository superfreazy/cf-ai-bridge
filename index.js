export default {
  async fetch(request, env) {
    // 1. 鉴权(客户端传 Bearer,和 WORKER_SECRET 一致)
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.WORKER_SECRET}`) {
      return new Response(
        JSON.stringify({ error: { message: "unauthorized" } }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }

    // 2. 把请求体原样(含 model/messages)转发到 Cloudflare 官方 REST
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/v1/chat/completions`;
    const upstream = await fetch(url, {
      method: request.method,
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${env.CF_API_TOKEN}`,
        "cf-aig-gateway-id": env.CF_GATEWAY_ID,
      },
      body: request.body,
      duplex: "half",
    });

    // 3. 透传上游响应(OpenAI 格式,含 status code)
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  },
};

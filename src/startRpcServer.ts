/**
 * @license MIT
 * Copyright (c) 2025 Raphael Ceccato Pauli
 * See LICENSE.md file for full license text.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { RPCError } from "./rpc-error";
import { Router, ResponseLike } from "./rpc";

interface RpcServerOptions {
  host?: string;
  port?: number;
  backlog?: number;
  router: Router<any, any>;
}

export function startRpcServer({ host = "localhost", port = 3000, backlog = 511, router }: RpcServerOptions) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const method = req.method || "GET";

    if (method !== "POST" || !url.pathname.startsWith("/rpc/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 404, message: "Not Found" } }));
      return;
    }

    const [, , ...pathParts] = url.pathname.split("/");
    const path = pathParts.join(".");

    try {
      const body = await new Promise<string>((resolve, reject) => {
        let data = "";
        req.on("data", (chunk: Buffer) => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
      });

      const { input, context } = JSON.parse(body || "{}");

      const responseWrapper: ResponseLike = {
        setHeader: (key, value) => res.setHeader(key, value),
        status: (code) => res.writeHead(code),
      };

      const result = await router.call(context || {}, path, input, responseWrapper);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result }));
    } catch (err) {
      const httpErr = err instanceof RPCError
        ? err
        : new RPCError(500, "Internal server error");

      res.writeHead(httpErr.code, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: {
          code: httpErr.code,
          message: httpErr.message,
          payload: httpErr.payload ?? null,
        },
      }));
    }
  });

  server.listen(port, host, backlog, () => {
    console.log(`🚀 RPC server running at http://${host}:${port}`);
  });

  return server;
}

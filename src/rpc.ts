/**
 * @license MIT
 * Copyright (c) 2025 Raphael Ceccato Pauli
 * See LICENSE.md file for full license text.
 */

import { z, ZodTypeAny } from "zod";
import { RPCError } from "./rpc-error";

export interface ResponseLike {
  setHeader(key: string, value: string): void;
  status?(code: number): void;
}

export type Middleware<C = any> = (
  ctx: C,
  input: any,
  res: ResponseLike,
  next: () => Promise<any>
) => Promise<any>;

export class Procedure<I extends ZodTypeAny, O extends ZodTypeAny, C = unknown> {
  constructor(
    private inputSchema: I,
    private outputSchema: O,
    private handler: (ctx: C, input: z.infer<I>, res: ResponseLike) => Promise<z.infer<O>> | z.infer<O>,
    public middlewares: Middleware<C>[] = []
  ) {}

  async call(ctx: C, input: unknown, res: ResponseLike): Promise<z.infer<O>> {
    const parsedInput = this.inputSchema.parse(input);
    const composed = this.middlewares.reduceRight<() => Promise<any>>(
      (next, middleware) => () => middleware(ctx, parsedInput, res, next),
      () => Promise.resolve(this.handler(ctx, parsedInput, res))
    );
    const result = await composed();
    return this.outputSchema.parse(result);
  }
}

export function procedure<I extends ZodTypeAny = any>() {
  return {
    input(input: I) {
      return {
        output<O extends ZodTypeAny>(output: O) {
          return {
            implement<C = unknown>(
              fn: (ctx: C, input: z.infer<I>, res: ResponseLike) => Promise<z.infer<O>> | z.infer<O>
            ) {
              return new Procedure<I, O, C>(input, output, fn);
            },
          };
        },
      };
    },
  };
}

type AnyProcedure = Procedure<any, any, any>;
type RouterRecord<C> = Record<string, AnyProcedure | Router<any, C>>;

export class Router<T extends RouterRecord<C>, C = unknown> {
  public middlewares: Middleware<C>[] = [];

  constructor(public routes: T) {
    Object.assign(this, routes);
  }

  use(mw: Middleware<C>): this {
    this.middlewares.push(mw);
    return this;
  }

  async call(ctx: C, path: string | string[], input: unknown, res: ResponseLike): Promise<any> {
    const parts = Array.isArray(path) ? path : path.split(".");
    const [first, ...rest] = parts;

    const target = this.routes[first];
    if (!target) throw new RPCError(404, `Route '${parts.join(".")}' not found`);

    if (target instanceof Procedure) {
      if (rest.length > 0) throw new RPCError(400, `Route '${parts.join(".")}' is not callable`);
      target.middlewares = [...this.middlewares, ...target.middlewares];
      return target.call(ctx, input, res);
    }

    if (target instanceof Router) {
      target.middlewares.unshift(...this.middlewares);
      return target.call(ctx, rest, input, res);
    }

    throw new RPCError(400, `Invalid route at '${first}'`);
  }
}

export function createRouter<T extends RouterRecord<C>, C = unknown>(routes: T): Router<T, C> {
  return new Router(routes);
}

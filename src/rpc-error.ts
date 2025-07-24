/**
 * @license MIT
 * Copyright (c) 2025 Raphael Ceccato Pauli
 * See LICENSE.md file for full license text.
 */

export class RPCError<TPayload = unknown> extends Error {
  code: number;
  payload?: TPayload;

  constructor(code: number, message: string, payload?: TPayload) {
    super(message);
    this.code = code;
    this.payload = payload;
    Object.setPrototypeOf(this, RPCError.prototype);
  }
}

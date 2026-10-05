import { createTranscriber } from "./transcriber.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

Deno.serve(
  createTranscriber({
    env: (name) => Deno.env.get(name),
    fetch: (input, init) => fetch(input, init),
    log: (entry) => console.log(JSON.stringify(entry)),
  }),
);

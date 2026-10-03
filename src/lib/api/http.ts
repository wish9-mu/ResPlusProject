// Small helpers shared by the API route handlers.
import { NextResponse } from "next/server";
import type { z } from "zod";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

// Parses and validates a JSON body. Returns the data, or a 400 response.
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.infer<S> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: jsonError(400, "Body must be JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { response: jsonError(400, "Invalid request.") };
  }
  return { data: parsed.data };
}

// Nest error bodies carry a human-readable `message` (a string, or a list
// for validation errors); fall back when the body isn't JSON.
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message) && typeof body.message[0] === "string") return body.message[0];
  } catch {
    // not JSON
  }
  return fallback;
}

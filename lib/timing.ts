import "server-only";

/**
 * Times one phase of a server render and prints a single line to the server
 * log. Deliberately outside any cache wrapper: a cached read logs nothing
 * when it hits, which makes "no log appeared" impossible to tell apart from
 * "the page never ran".
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[timing] ${label}=${Date.now() - start}ms`);
  }
}

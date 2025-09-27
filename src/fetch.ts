import pLimit from "p-limit";

const limit = pLimit(10);

export async function limitedFetch(
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  return await limit(() => {
    return fetch(...args);
  });
}

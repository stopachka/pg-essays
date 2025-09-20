import pLimit from "p-limit";

const limit = pLimit(10);

export default async function limitedFetch(
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  return await limit(() => {
    console.log(`Fetching ${args[0]}`);
    return fetch(...args);
  });
}

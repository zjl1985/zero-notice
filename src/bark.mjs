export async function sendBark({ deviceKey, baseUrl, title, body, group, timeoutMs = 8_000 }) {
  const url = new URL(
    `/${encodeURIComponent(deviceKey)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`,
    `${baseUrl}/`,
  );
  if (group) url.searchParams.set("group", group);

  let response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`Bark request failed: ${error?.cause?.code || error.name}`);
  }

  const text = await response.text();
  if (!response.ok) throw new Error(`Bark returned HTTP ${response.status}`);

  try {
    const result = JSON.parse(text);
    if (result.code !== 200) throw new Error("Bark returned a non-success code");
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Bark returned an invalid JSON response");
    throw error;
  }
}

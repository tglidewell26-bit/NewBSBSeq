import {
  customerClipboard,
  type FinishMessage,
} from "@workspace/api-zod/finisher";

export async function copySequence(
  messages: FinishMessage[],
  bodyOnly = false,
) {
  const payload = customerClipboard(messages, bodyOnly);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([payload.html], { type: "text/html" }),
          "text/plain": new Blob([payload.text], { type: "text/plain" }),
        }),
      ]);
      return "rich";
    } catch {
      // Browsers that reject rich clipboard data can still accept plain text.
    }
  }
  await navigator.clipboard.writeText(payload.text);
  return "plain";
}

// Only file-specific failures allow the next file to start. No automatic retries.
const fileErrors = new Set(["INVALID_FILE", "INPUT_TOO_LARGE", "INVALID_MODEL_OUTPUT"]);
export async function runAnalysisQueue<T>(items: T[], options: {
  stopped: () => boolean;
  analyze: (item: T) => Promise<void>;
  failed: (item: T, error: Error) => void;
}) {
  for (const item of items) {
    if (options.stopped()) break;
    try { await options.analyze(item); }
    catch (failure) {
      const error = failure instanceof Error ? failure : new Error("Analysis failed.");
      options.failed(item, error);
      if (!fileErrors.has((error as Error & { code?: string }).code ?? "")) break;
    }
  }
}

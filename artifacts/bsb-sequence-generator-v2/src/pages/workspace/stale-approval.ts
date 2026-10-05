type ReviewError = { message: string; status?: number; data?: unknown };

/** Recognize structured errors and older saved-version 409 responses. */
export function staleApprovalReason(error: ReviewError): string {
  if (error.status !== undefined && error.status !== 409) return "";
  const data = error.data && typeof error.data === "object"
    ? error.data as { error?: unknown; errorType?: unknown; issues?: unknown }
    : undefined;
  const details = Array.isArray(data?.issues)
    ? data.issues.flatMap(issue => typeof issue?.message === "string" ? [issue.message] : [])
    : [];
  const reason = [typeof data?.error === "string" ? data.error : "", ...details].filter(Boolean).join(" ") || error.message;
  const staleType = typeof data?.errorType === "string" &&
    ["INVALID_TREE", "STALE_ASSESSMENT", "TREE_HASH_MISMATCH", "EVIDENCE_VERSION_MISMATCH", "MISSING_SAVED_PATH"].includes(data.errorType);
  return staleType || /stale approval|decision[- ]tree|tree[- ]hash|research packet changed|evidence.*(?:version|changed|mismatch)|assessment changed|saved.*(?:version|decision|path|branch|outcome|trace)/i.test(reason)
    ? reason
    : "";
}
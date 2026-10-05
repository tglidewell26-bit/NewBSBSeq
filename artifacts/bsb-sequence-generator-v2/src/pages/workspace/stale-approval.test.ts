import { test } from "node:test";
import assert from "node:assert/strict";
import { staleApprovalReason } from "./stale-approval.ts";

for (const message of [
  "The saved decision tree snapshot is corrupted or was created by an incompatible tree-hash version. Re-run the decision tree before approval.",
  "The research packet changed after this assessment. Re-run the decision tree before approval.",
  "The saved decision path is missing. Re-run the decision tree before approval.",
  "The saved assessment is not valid for this saved version.",
  "Saved decision path is invalid.",
]) {
  test(`recognizes stale approval: ${message}`, () => {
    assert.equal(staleApprovalReason({ message, status: 409 }), message);
    assert.equal(staleApprovalReason({ message: `HTTP 409 Conflict: ${message}` }), `HTTP 409 Conflict: ${message}`);
  });
}

test("reads structured stale codes and evidence-version issues", () => {
  assert.equal(staleApprovalReason({
    status: 409, message: "HTTP 409 Conflict", data: { errorType: "INVALID_TREE", error: "The saved trace is malformed." },
  }), "The saved trace is malformed.");
  assert.equal(staleApprovalReason({
    status: 409, message: "HTTP 409 Conflict",
    data: { error: "Stale approval", issues: [{ path: "evidenceVersion", message: "Evidence or assessment changed; reassess before review." }] },
  }), "Stale approval Evidence or assessment changed; reassess before review.");
});

test("does not offer a paid refresh for unrelated conflicts or non-409 failures", () => {
  for (const message of ["Approval cannot authorize unsupported instruments.", "Second instrument confirmation required", "Select each instrument only once."]) {
    assert.equal(staleApprovalReason({ status: 409, message }), "");
  }
  assert.equal(staleApprovalReason({ status: 500, message: "Failed to read the saved decision tree" }), "");
});
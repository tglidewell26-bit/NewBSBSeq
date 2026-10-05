import { expect, test, type Page, type Route } from "@playwright/test";

const packetId = "synthetic-approval-packet";
const packetPath = `/api/bsb-v2/packets/${packetId}`;
const originalAssessmentId = "fixture-assessment-before-refresh";
const refreshedAssessmentId = "fixture-assessment-after-refresh";

type StaleResponse = {
  error: string;
  errorType?: string;
  issues?: Array<{ path: string; message: string }>;
};

const staleResponses: Array<{ name: string; response: StaleResponse }> = [
  {
    name: "tree-hash mismatch",
    response: {
      errorType: "TREE_HASH_MISMATCH",
      error: "The saved decision-tree tree-hash no longer matches.",
    },
  },
  {
    name: "evidence-version mismatch",
    response: {
      errorType: "EVIDENCE_VERSION_MISMATCH",
      error: "The evidence version changed after the assessment.",
    },
  },
  {
    name: "missing saved path",
    response: {
      errorType: "MISSING_SAVED_PATH",
      error: "The saved decision path is missing.",
    },
  },
  {
    name: "legacy generic saved-version conflict",
    response: {
      error: "The saved assessment is not valid for this saved version.",
    },
  },
];

function assessment(id: string, instrument: "CellScape" | "CosMx") {
  return {
    id,
    provider: "OPENAI",
    mock: false,
    evidenceVersion: `fixture-evidence-${id}`,
    instruments: [{
      instrument,
      fit: "POTENTIAL_FIT",
      recommendation: `${instrument} fixture recommendation`,
      evidenceIds: ["fixture-evidence-1"],
      ruleIds: [],
      alternatives: [],
      currentUse: "Unknown",
      accountStatus: "Unknown",
      readiness: "Unknown",
    }],
    limitations: [],
    semanticReviewNeeded: false,
    approvable: true,
    demoMode: false,
    validatedRealAssessment: true,
    selectedInstruments: [instrument],
    selectionReason: `Fixture selected ${instrument}.`,
    decisionTrace: {
      treeHash: `fixture-tree-${id}`,
      buyerUnit: "Synthetic Imaging Unit",
      path: [],
      graph: { nodes: [] },
      outcome: { nodeId: "fixture-outcome", text: "Fixture fit", instrument },
    },
  };
}

function packetRecord(overrides: Record<string, unknown> = {}) {
  const original = assessment(originalAssessmentId, "CellScape");
  return {
    id: packetId,
    stage: "ASSESSED",
    inputHash: "synthetic-input-hash",
    researchPacket: {
      schemaVersion: "bsb-company-research-v1",
      brief: "Synthetic browser fixture; never sent to a model provider.",
      qualificationEvidence: {},
    },
    normalizedEvidence: [{
      evidenceState: "SUPPORTED",
      assessmentType: "CAPABILITY",
      claim: "Synthetic fixture capability claim",
      sourceUrl: null,
      basisFacts: ["Synthetic fixture evidence."],
      basisSourceUrls: [],
      inference: null,
      evidenceId: "fixture-evidence-1",
      provenanceType: "CONFIRMED_ACCOUNT",
      locations: ["fixture"],
      supportStatus: "SUPPORTED",
      supportIssues: [],
    }],
    validation: { structurallyValid: true, supportValid: true, errors: [], warnings: [] },
    assessment: original,
    buyerUnits: ["Synthetic Imaging Unit"],
    createdAt: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

type HarnessOptions = {
  staleResponse: StaleResponse;
  refreshFailsAtAttemptLimit?: boolean;
};

async function openStaleApprovalDialog(page: Page, options: HarnessOptions) {
  let activePacket = packetRecord();
  const assessmentRequests: Array<Record<string, unknown>> = [];
  const reviewRequests: Array<Record<string, unknown>> = [];
  const unexpectedApiRequests: string[] = [];
  let packetReadCount = 0;
  let releaseRefreshResponse = () => {};
  let refreshRequestSeen = () => {};
  const refreshGate = new Promise<void>(resolve => { releaseRefreshResponse = resolve; });
  const refreshSeen = new Promise<void>(resolve => { refreshRequestSeen = resolve; });

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === "/api/bsb-v2/assessment-config" && method === "GET") {
      await route.fulfill({
        json: { enabled: true, missing: [], model: "synthetic-browser-fixture", treeBudgetUsd: 2 },
      });
      return;
    }

    if (url.pathname === packetPath && method === "GET") {
      packetReadCount += 1;
      await route.fulfill({ json: activePacket });
      return;
    }

    if (url.pathname === "/api/bsb-v2/packets" && method === "GET") {
      await route.fulfill({ json: [] });
      return;
    }

    if (url.pathname === `${packetPath}/reviews` && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      reviewRequests.push(body);
      if (reviewRequests.length === 1) {
        await route.fulfill({ status: 409, json: options.staleResponse });
      } else {
        await route.fulfill({
          json: {
            id: "fixture-review",
            decision: "APPROVE",
            approvedInstruments: body.approvedInstruments,
            evidenceVersion: body.evidenceVersion,
            note: "",
            demoMode: false,
            validatedRealAssessment: true,
            createdAt: "2026-01-02T03:04:05.000Z",
          },
        });
      }
      return;
    }

    if (url.pathname === `${packetPath}/assess` && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      assessmentRequests.push(body);
      refreshRequestSeen();

      if (options.refreshFailsAtAttemptLimit) {
        activePacket = packetRecord({
          assessmentRun: {
            id: "fixture-failed-run",
            state: "FAILED",
            attempt: 2,
            startedAt: "2026-01-02T03:04:05.000Z",
            error: { error: "ATTEMPT_LIMIT: assessment attempt limit reached.", issues: [] },
          },
        });
        await route.fulfill({
          status: 409,
          json: { errorType: "ATTEMPT_LIMIT", error: "Assessment attempt limit reached.", issues: [] },
        });
      } else {
        await refreshGate;
        const refreshed = assessment(refreshedAssessmentId, "CosMx");
        activePacket = packetRecord({ assessment: refreshed });
        await route.fulfill({ json: refreshed });
      }
      return;
    }

    unexpectedApiRequests.push(`${method} ${url.pathname}`);
    await route.fulfill({
      status: 501,
      json: { error: "Unstubbed API request in stale-approval browser test." },
    });
  });

  await page.goto(`/workspace/packet/${packetId}`);
  await expect(page.getByRole("button", { name: "Approve Assessment" })).toBeVisible();
  await page.getByRole("button", { name: "Approve Assessment" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Approve Assessment" })).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm Approval" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "This decision must be refreshed before approval.",
  );

  return {
    dialog,
    assessmentRequests,
    reviewRequests,
    unexpectedApiRequests,
    get packetReadCount() { return packetReadCount; },
    refreshSeen,
    releaseRefreshResponse: () => {
      activePacket = packetRecord({ assessment: assessment(refreshedAssessmentId, "CosMx") });
      releaseRefreshResponse();
    },
  };
}

for (const scenario of staleResponses) {
  test(`recovers from ${scenario.name} only after an explicit refresh`, async ({ page }) => {
    const harness = await openStaleApprovalDialog(page, { staleResponse: scenario.response });
    const { dialog } = harness;

    expect(harness.reviewRequests).toHaveLength(1);
    expect(harness.assessmentRequests).toHaveLength(0);
    await expect(dialog.getByRole("alert")).toContainText(scenario.response.error);

    const cancelButton = dialog.getByRole("button", { name: "Cancel" });
    const footerActions = cancelButton.locator("xpath=..");
    const refreshButton = footerActions.getByRole("button", { name: "Refresh decision tree" });
    await expect(cancelButton).toBeVisible();
    await expect(refreshButton).toBeVisible();
    await expect(refreshButton.locator("xpath=..")).toContainText("Cancel");

    await refreshButton.click();
    await harness.refreshSeen;
    await expect(dialog).toBeHidden();
    expect(harness.assessmentRequests).toHaveLength(1);
    expect(harness.assessmentRequests[0]).toEqual({
      mode: "REAL_INPUT",
      rerun: true,
      retry: false,
      buyerUnit: "Synthetic Imaging Unit",
    });

    harness.releaseRefreshResponse();
    await expect(page.getByText("Decision tree refreshed", { exact: true })).toBeVisible();
    await expect.poll(() => harness.packetReadCount).toBeGreaterThan(1);

    await page.getByRole("button", { name: "Approve Assessment" }).click();
    const reopenedDialog = page.getByRole("dialog");
    const refreshedInstrument = reopenedDialog.getByRole("checkbox", { name: "CosMx" });
    await expect(refreshedInstrument).toBeChecked();

    await reopenedDialog.getByRole("button", { name: "Confirm Approval" }).click();
    await expect.poll(() => harness.reviewRequests).toHaveLength(2);
    expect(harness.reviewRequests[1]).toMatchObject({
      assessmentId: refreshedAssessmentId,
      evidenceVersion: `fixture-evidence-${refreshedAssessmentId}`,
      approvedInstruments: ["CosMx"],
    });
    expect(harness.unexpectedApiRequests).toEqual([]);
  });
}

test("ATTEMPT_LIMIT keeps the old assessment and does not retry the refresh", async ({ page }) => {
  const harness = await openStaleApprovalDialog(page, {
    staleResponse: staleResponses[0].response,
    refreshFailsAtAttemptLimit: true,
  });
  const refreshButton = harness.dialog.getByRole("button", { name: "Refresh decision tree" });

  await refreshButton.click();
  await harness.refreshSeen;
  await expect(harness.dialog).toBeHidden();
  await expect(page.getByText("Refresh failed", { exact: true })).toBeVisible();
  await expect.poll(() => harness.packetReadCount).toBeGreaterThan(1);
  expect(harness.assessmentRequests).toHaveLength(1);
  expect(harness.assessmentRequests[0]).toMatchObject({
    mode: "REAL_INPUT",
    rerun: true,
    retry: false,
  });

  await page.getByRole("tab", { name: "Instrument Assessment" }).click();
  await expect(page.getByRole("alert")).toContainText("Your previous assessment remains saved.");
  await expect(page.getByText("CellScape fixture recommendation")).toBeVisible();

  await page.getByRole("button", { name: "Approve Assessment" }).click();
  const reopenedDialog = page.getByRole("dialog");
  await expect(reopenedDialog.getByRole("checkbox", { name: "CellScape" })).toBeChecked();
  expect(harness.reviewRequests).toHaveLength(1);
  expect(harness.assessmentRequests).toHaveLength(1);
  expect(harness.unexpectedApiRequests).toEqual([]);
});
import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: db }));
import { runSequenceJob } from "../src/lib/sequence-jobs";
import { digest } from "../src/lib/sequences";
import { sequenceFixture } from "./sequence-fixture";

describe("writer/reviewer worker with simulated persistence", () => {
  it.each([false, true])("preserves two calls; factual failure = %s", async factualFailure => {
    const { row, authority, touches, review } = sequenceFixture();
    const job: any = {
      id: "synthetic-job", packet_id: "synthetic-packet", state: "QUEUED",
      authority, authority_hash: digest(authority), violations: [], sequence: null,
    };
    db.query.mockReset();
    db.connect.mockResolvedValue({ query: db.query, release: vi.fn() });
    db.query.mockImplementation(async (sql: string, args: any[] = []) => {
      if (sql.startsWith("SELECT * FROM bsb_v2_packets")) return { rows: [row] };
      if (sql.startsWith("SELECT * FROM bsb_v2_sequence_jobs")) return { rows: [job] };
      if (sql.includes("FROM bsb_v2_knowledge_assets")) return { rows: [] };
      if (sql.includes("SET state='WRITING'")) job.state = "WRITING";
      else if (sql.includes("SET state='APPROVED'")) {
        job.state = "APPROVED";
        job.sequence = JSON.parse(args[1]);
        job.violations = JSON.parse(args[4]);
      } else if (sql.includes("SET state='VALIDATION_FAILED'")) {
        job.state = "VALIDATION_FAILED";
        job.violations = JSON.parse(args[1]);
        job.safe_touches = JSON.parse(args[2]);
        job.draft_touches = JSON.parse(args[3]);
      } else if (sql.includes("SET state=$2")) {
        job.state = args[1]; job.error = args[2];
      }
      return { rows: [job], rowCount: 1 };
    });
    const result = {
      reviews: review.reviews.map((r, i) => ({
        ...r, violations: i ? [] : [
          { ruleId: "VOICE", rejectedSpan: touches[0].middle, message: "Repeated opening", nextAction: "Optional rephrasing" },
          ...(factualFailure ? [{ ruleId: "UNSUPPORTED_COMPANY", rejectedSpan: touches[0].middle, message: "Invented result", nextAction: "Remove result" }] : []),
        ],
      })),
    };
    const provider = vi.fn().mockImplementation(async request => ({
      value: request.text.format.name === "bsb_sequence" ? { touches } : result,
      usage: { model: "synthetic", inputTokens: 100, outputTokens: 100, estimatedCostUsd: 0 },
    }));
    await runSequenceJob(job.id, undefined, provider);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls.map(([request]) => request.text.format.name)).toEqual(["bsb_sequence", "bsb_sequence_review"]);
    expect(job.state, job.error).toBe(factualFailure ? "VALIDATION_FAILED" : "APPROVED");
    if (factualFailure) {
      expect(job.draft_touches).toHaveLength(9);
      expect(job.safe_touches).toHaveLength(8);
      expect(job.violations.map((v: any) => v.ruleId)).toEqual(["UNSUPPORTED_COMPANY"]);
    } else {
      expect(job.sequence).toHaveLength(9);
      expect(job.violations.map((v: any) => v.ruleId)).toEqual(["VOICE"]);
    }
  });
});

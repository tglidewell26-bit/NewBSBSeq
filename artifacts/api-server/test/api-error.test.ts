import { describe, expect, it } from "vitest";
import { ApiError } from "../../../lib/api-client-react/src/custom-fetch";

describe("client-visible intake errors", () => {
  it("preserves field paths and corrective messages in the displayed error", () => {
    const payload = { error: "Packet structure is invalid", issues: [
      { path: "researchPacket.qualificationEvidence", message: "Expected an object." },
      { path: "researchPacket.schemaVersion", message: "Unsupported version." },
    ] };
    const error = new ApiError(new Response(null, { status: 400 }), payload,
      { method: "POST", url: "/api/bsb-v2/packets" });
    expect(error.message).toContain("researchPacket.qualificationEvidence: Expected an object.");
    expect(error.message).toContain("researchPacket.schemaVersion: Unsupported version.");
    expect(error.data).toEqual(payload);
  });

  it("keeps generic outages distinct and tolerates malformed issue details", () => {
    const error = new ApiError(new Response(null, { status: 503 }),
      { error: "Service unavailable", issues: [null, { path: {}, message: [] }] },
      { method: "GET", url: "/api/bsb-v2/packets" });
    expect(error.message).toContain("Service unavailable");
    expect(error.message).not.toContain("[object Object]");
  });
});

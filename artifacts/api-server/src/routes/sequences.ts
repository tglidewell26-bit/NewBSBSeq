import { Router } from "express";
import { sequenceBodyText } from "@workspace/api-zod/sequence-format";
import { listSavedTrips, saveTrip } from "../lib/saved-trips";
import {
  createSequenceJob,
  listSequenceJobs,
  getSequenceJob,
  cancelSequenceJob,
  sequenceConfig,
} from "../lib/sequence-jobs";
import { AssessmentError } from "../lib/live-assessment";
import { digest } from "../lib/sequences";
import { attachmentNotes } from "../lib/sequence-assets";
const router = Router();
function handle(action: (req: any, res: any) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      await action(req, res);
    } catch (e) {
      const x =
        e instanceof AssessmentError
          ? e
          : new AssessmentError(
              "SERVER_FAILED",
              "Sequence service could not complete the request. Reload saved job status before retrying.",
              500,
            );
      res.status(x.status).json({
        error: x.message,
        errorType: x.code,
        failedStage: "SEQUENCE",
        issues: x.issues,
      });
    }
  };
}
router.get("/bsb-v2/sequence-config", (_req, res) =>
  res.json(sequenceConfig()),
);
router.get(
  "/bsb-v2/trips",
  handle(async (_req, res) => {
    res.json(await listSavedTrips());
  }),
);
router.post(
  "/bsb-v2/trips",
  handle(async (req, res) => {
    res.status(201).json(await saveTrip(req.body));
  }),
);
router.get(
  "/bsb-v2/packets/:packetId/sequences",
  handle(async (req, res) => {
    res.json(await listSequenceJobs(req.params.packetId));
  }),
);
router.post(
  "/bsb-v2/packets/:packetId/sequences",
  handle(async (req, res) => {
    res
      .status(202)
      .json(await createSequenceJob(req.params.packetId, req.body));
  }),
);
router.get(
  "/bsb-v2/sequences/:id",
  handle(async (req, res) => {
    res.json(await getSequenceJob(req.params.id));
  }),
);
router.post(
  "/bsb-v2/sequences/:id/cancel",
  handle(async (req, res) => {
    res.json(await cancelSequenceJob(req.params.id));
  }),
);
router.post(
  "/bsb-v2/sequences/:id/regenerate",
  handle(async (req, res) => {
    const parent = await getSequenceJob(req.params.id);
    res.status(202).json(
      await createSequenceJob(
        parent.packetId,
        {
          idempotencyKey: req.body.idempotencyKey,
          settings: parent.authority.settings,
        },
        parent.id,
      ),
    );
  }),
);
router.get(
  "/bsb-v2/sequences/:id/export",
  handle(async (req, res) => {
    const job = await getSequenceJob(req.params.id);
    if (
      job.state !== "APPROVED" ||
      !job.sequence ||
      digest(job.sequence) !== job.contentHash
    )
      throw new AssessmentError(
        "EXPORT_BLOCKED",
        "Only an unchanged, validated sequence can be exported.",
        409,
      );
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bsb-sequence-${job.id}.txt"`,
    );
    res.send(
      job.sequence
        .map(
          (t) =>
            `${t.touchId}\n${t.subject ? `Subject: ${t.subject}\n\n` : ""}${sequenceBodyText(t.body)}${attachmentNotes(job.authority, t.touchId, t)}`,
        )
        .join("\n\n---\n\n"),
    );
  }),
);
export default router;

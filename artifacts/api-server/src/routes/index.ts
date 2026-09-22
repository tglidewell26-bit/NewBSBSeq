import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bsbV2Router from "./bsb-v2";
import sequenceRouter from "./sequences";
import knowledgeAssetsRouter from "./knowledge-assets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bsbV2Router);
router.use(sequenceRouter);
router.use(knowledgeAssetsRouter);

export default router;

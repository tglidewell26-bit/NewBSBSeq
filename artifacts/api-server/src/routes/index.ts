import { Router, type IRouter } from "express";
import healthRouter from "./health";
import finisherRouter from "./finisher";
import knowledgeAssetsRouter from "./knowledge-assets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(finisherRouter);
router.use(knowledgeAssetsRouter);

export default router;

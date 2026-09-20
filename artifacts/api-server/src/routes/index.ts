import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bsbV2Router from "./bsb-v2";
import sequenceRouter from "./sequences";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bsbV2Router);
router.use(sequenceRouter);

export default router;

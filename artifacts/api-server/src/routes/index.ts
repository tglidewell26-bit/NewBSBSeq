import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bsbV2Router from "./bsb-v2";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bsbV2Router);

export default router;

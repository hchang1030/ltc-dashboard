import { Router, type IRouter } from "express";
import healthRouter from "./health";
import residentsRouter from "./residents";
import bowelMovementsRouter from "./bowelMovements";
import physicianRouter from "./physician";

const router: IRouter = Router();

router.use(healthRouter);
router.use(residentsRouter);
router.use(bowelMovementsRouter);
router.use(physicianRouter);

export default router;

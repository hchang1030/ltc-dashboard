import { Router, type IRouter } from "express";
import healthRouter from "./health";
import residentsRouter from "./residents";
import bowelMovementsRouter from "./bowelMovements";
import painRouter from "./pain";
import behaviorRouter from "./behavior";
import intakeRouter from "./intake";
import fallRouter from "./fall";
import vitalRouter from "./vital";
import physicianRouter from "./physician";
import communicationBinderRouter from "./communicationBinder";
import faxDirectoryRouter from "./faxDirectory";
import faxLogsRouter from "./faxLogs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(residentsRouter);
router.use(bowelMovementsRouter);
router.use(painRouter);
router.use(behaviorRouter);
router.use(intakeRouter);
router.use(fallRouter);
router.use(vitalRouter);
router.use(physicianRouter);
router.use(communicationBinderRouter);
router.use(faxDirectoryRouter);
router.use(faxLogsRouter);

export default router;

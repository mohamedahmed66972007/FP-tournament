import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tournamentsRouter from "./tournaments";
import questionsRouter from "./questions";
import registrationsRouter from "./registrations";
import botConfigRouter from "./botConfig";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tournamentsRouter);
router.use(questionsRouter);
router.use(registrationsRouter);
router.use(botConfigRouter);

export default router;

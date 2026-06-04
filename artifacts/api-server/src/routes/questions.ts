import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, questionsTable } from "@workspace/db";
import {
  ListQuestionsParams,
  ListQuestionsResponse,
  CreateQuestionParams,
  CreateQuestionBody,
  UpdateQuestionParams,
  UpdateQuestionBody,
  UpdateQuestionResponse,
  DeleteQuestionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tournaments/:id/questions", async (req, res): Promise<void> => {
  const params = ListQuestionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const questions = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.tournamentId, params.data.id))
    .orderBy(questionsTable.order);

  const mapped = questions.map((q) => ({
    ...q,
    options: q.options ?? null,
  }));

  res.json(ListQuestionsResponse.parse(mapped));
});

router.post("/tournaments/:id/questions", async (req, res): Promise<void> => {
  const params = CreateQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [question] = await db
    .insert(questionsTable)
    .values({ ...parsed.data, tournamentId: params.data.id })
    .returning();

  res.status(201).json({ ...question, options: question.options ?? null });
});

router.patch("/tournaments/:id/questions/:questionId", async (req, res): Promise<void> => {
  const params = UpdateQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(questionsTable)
    .set(parsed.data)
    .where(and(eq(questionsTable.id, params.data.questionId), eq(questionsTable.tournamentId, params.data.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  res.json(UpdateQuestionResponse.parse({ ...updated, options: updated.options ?? null }));
});

router.delete("/tournaments/:id/questions/:questionId", async (req, res): Promise<void> => {
  const params = DeleteQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(questionsTable)
    .where(and(eq(questionsTable.id, params.data.questionId), eq(questionsTable.tournamentId, params.data.id)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;

import { Router, type IRouter } from "express";
import { testDatabaseConnection, migrateToDatabase } from "../lib/dbMigrator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/database/test-connection", async (req, res): Promise<void> => {
  const newDatabaseUrl = req.body?.newDatabaseUrl;
  if (!newDatabaseUrl || typeof newDatabaseUrl !== "string") {
    res.status(400).json({ error: "رابط قاعدة البيانات مطلوب" });
    return;
  }

  try {
    new URL(newDatabaseUrl);
  } catch {
    res.status(400).json({ error: "رابط URL غير صحيح" });
    return;
  }

  try {
    await testDatabaseConnection(newDatabaseUrl);
    res.json({ success: true, message: "الاتصال بقاعدة البيانات نجح" });
  } catch (err: any) {
    logger.warn({ err }, "Database connection test failed");
    res.status(400).json({ error: "فشل الاتصال: " + (err?.message ?? "خطأ غير معروف") });
  }
});

router.post("/database/migrate", async (req, res): Promise<void> => {
  const newDatabaseUrl = req.body?.newDatabaseUrl;
  if (!newDatabaseUrl || typeof newDatabaseUrl !== "string") {
    res.status(400).json({ error: "رابط قاعدة البيانات مطلوب" });
    return;
  }

  try {
    new URL(newDatabaseUrl);
  } catch {
    res.status(400).json({ error: "رابط URL غير صحيح" });
    return;
  }

  try {
    const result = await migrateToDatabase(newDatabaseUrl);
    res.json({
      success: true,
      migrated: result,
      message: "تم الترحيل بنجاح. قم بتحديث DATABASE_URL في wispbyte بنفس الرابط الجديد.",
    });
  } catch (err: any) {
    logger.error({ err }, "Database migration failed");
    res.status(500).json({ error: "فشل الترحيل: " + (err?.message ?? "خطأ غير معروف") });
  }
});

export default router;

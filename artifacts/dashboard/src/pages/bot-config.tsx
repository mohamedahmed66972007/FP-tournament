import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetBotConfig,
  useUpdateBotConfig,
  getGetBotConfigQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bot, Save, Server, Hash, Database, CheckCircle2, AlertCircle, Loader2, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

const configSchema = z.object({
  guildId: z.string().min(1, "ID السيرفر مطلوب"),
  announcementChannelId: z.string().min(1, "ID القناة مطلوب"),
});

const dbSchema = z.object({
  newDatabaseUrl: z.string().min(10, "الرابط مطلوب"),
});

type DbTestStatus = "idle" | "testing" | "success" | "error";
type MigrateStatus = "idle" | "migrating" | "success" | "error";

export default function BotConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useGetBotConfig({
    query: { queryKey: getGetBotConfigQueryKey() }
  });

  const updateMutation = useUpdateBotConfig({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBotConfigQueryKey() });
        toast({ title: "تم حفظ إعدادات البوت بنجاح" });
      },
      onError: () => {
        toast({ title: "فشل حفظ الإعدادات", variant: "destructive" });
      }
    }
  });

  const form = useForm<z.infer<typeof configSchema>>({
    resolver: zodResolver(configSchema),
    defaultValues: { guildId: "", announcementChannelId: "" },
  });

  const dbForm = useForm<z.infer<typeof dbSchema>>({
    resolver: zodResolver(dbSchema),
    defaultValues: { newDatabaseUrl: "" },
  });

  const [testStatus, setTestStatus] = useState<DbTestStatus>("idle");
  const [testError, setTestError] = useState("");
  const [migrateStatus, setMigrateStatus] = useState<MigrateStatus>("idle");
  const [migrateError, setMigrateError] = useState("");
  const [migrateResult, setMigrateResult] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (config) {
      form.reset({
        guildId: config.guildId || "",
        announcementChannelId: config.announcementChannelId || "",
      });
    }
  }, [config, form]);

  function onSubmit(values: z.infer<typeof configSchema>) {
    updateMutation.mutate({
      data: { guildId: values.guildId, announcementChannelId: values.announcementChannelId }
    });
  }

  function handleDbUrlChange() {
    setTestStatus("idle");
    setMigrateStatus("idle");
    setMigrateResult(null);
    setTestError("");
    setMigrateError("");
  }

  async function handleTestConnection() {
    const url = dbForm.getValues("newDatabaseUrl");
    if (!url) { dbForm.setError("newDatabaseUrl", { message: "أدخل الرابط أولاً" }); return; }
    setTestStatus("testing"); setTestError("");
    try {
      const res = await fetch("/api/database/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDatabaseUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) { setTestStatus("error"); setTestError(data.error || "فشل الاتصال"); return; }
      setTestStatus("success");
    } catch {
      setTestStatus("error"); setTestError("تعذر الاتصال بالخادم");
    }
  }

  async function handleMigrate() {
    const url = dbForm.getValues("newDatabaseUrl");
    if (!url) { dbForm.setError("newDatabaseUrl", { message: "أدخل الرابط أولاً" }); return; }
    if (testStatus !== "success") {
      toast({ title: "اختبر الاتصال أولاً قبل الترحيل", variant: "destructive" });
      return;
    }
    setMigrateStatus("migrating"); setMigrateError(""); setMigrateResult(null);
    try {
      const res = await fetch("/api/database/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newDatabaseUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) { setMigrateStatus("error"); setMigrateError(data.error || "فشل الترحيل"); return; }
      setMigrateStatus("success");
      setMigrateResult(data.migrated);
      toast({ title: "تم الترحيل بنجاح ✅" });
    } catch {
      setMigrateStatus("error"); setMigrateError("تعذر الاتصال بالخادم");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">إعدادات البوت</h1>
        <p className="text-muted-foreground">اربط البوت بسيرفر Discord وأدر قاعدة البيانات.</p>
      </div>

      {/* Discord Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            إعدادات Discord
          </CardTitle>
          <CardDescription>
            معرّفات السيرفر والقناة التي يستخدمها البوت.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="guildId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID سيرفر Discord</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Server className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input className="pr-9" placeholder="مثال: 123456789012345678" {...field} data-testid="input-guild-id" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="announcementChannelId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID قناة الإعلانات</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Hash className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input className="pr-9" placeholder="مثال: 987654321098765432" {...field} data-testid="input-channel-id" />
                      </div>
                    </FormControl>
                    <p className="text-[0.8rem] text-muted-foreground mt-2">
                      القناة التي سيرسل فيها البوت إعلانات القبول.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button type="submit" disabled={updateMutation.isPending || isLoading} data-testid="btn-save-config">
                <Save className="ml-2 h-4 w-4" />
                {updateMutation.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      {/* Database Migration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            ترحيل قاعدة البيانات
          </CardTitle>
          <CardDescription>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...dbForm}>
            <div className="space-y-3">
              <FormField
                control={dbForm.control}
                name="newDatabaseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رابط قاعدة البيانات الجديدة</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="postgresql://user:pass@host/db?sslmode=require"
                        {...field}
                        onChange={(e) => { field.onChange(e); handleDbUrlChange(); }}
                        className="font-mono text-sm"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {testStatus === "success" && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  الاتصال نجح — يمكنك الترحيل الآن
                </div>
              )}
              {testStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {testError}
                </div>
              )}

              {migrateStatus === "success" && migrateResult && (
                <Alert className="border-green-500/50 bg-green-500/10">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-sm space-y-1">
                    <p className="font-semibold text-green-700 dark:text-green-400">تم الترحيل بنجاح ✅</p>
                    <ul className="text-muted-foreground space-y-0.5 mt-1 text-xs">
                      <li>• البطولات: {migrateResult.tournaments}</li>
                      <li>• الأسئلة: {migrateResult.questions}</li>
                      <li>• التسجيلات: {migrateResult.registrations}</li>
                      <li>• الإعدادات: {migrateResult.botConfig}</li>
                    </ul>
                    <p className="mt-2 font-medium text-amber-600 dark:text-amber-400 text-xs">
                      ⚠️ حدّث <code className="bg-muted px-1 rounded">.env</code> في wispbyte بنفس الرابط ثم أعد تشغيل البوت.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              {migrateStatus === "error" && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {migrateError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testStatus === "testing" || migrateStatus === "migrating"}
                >
                  {testStatus === "testing"
                    ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري الاختبار...</>
                    : <><Database className="ml-2 h-4 w-4" />اختبار الاتصال</>}
                </Button>

                <Button
                  type="button"
                  onClick={handleMigrate}
                  disabled={testStatus !== "success" || migrateStatus === "migrating" || migrateStatus === "success"}
                >
                  {migrateStatus === "migrating"
                    ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري الترحيل...</>
                    : migrateStatus === "success"
                    ? <><CheckCircle2 className="ml-2 h-4 w-4" />تم الترحيل</>
                    : <><ArrowRightLeft className="ml-2 h-4 w-4" />ترحيل البيانات</>}
                </Button>
              </div>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

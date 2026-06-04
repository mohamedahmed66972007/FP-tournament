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
import { Bot, Save, Server, Hash, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const configSchema = z.object({
  guildId: z.string().min(1, "ID السيرفر مطلوب"),
  announcementChannelId: z.string().min(1, "ID القناة مطلوب"),
  botToken: z.string().optional(),
});

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
    defaultValues: {
      guildId: "",
      announcementChannelId: "",
      botToken: "",
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        guildId: config.guildId || "",
        announcementChannelId: config.announcementChannelId || "",
        botToken: "",
      });
    }
  }, [config, form]);

  function onSubmit(values: z.infer<typeof configSchema>) {
    updateMutation.mutate({
      data: {
        guildId: values.guildId,
        announcementChannelId: values.announcementChannelId,
        ...(values.botToken ? { botToken: values.botToken } : {}),
      }
    });
  }

  const isBotTokenSaved = config?.botToken === "***";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">إعدادات البوت</h1>
        <p className="text-muted-foreground">اربط البوت بسيرفر Discord الخاص بك.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            إعدادات الاتصال
          </CardTitle>
          <CardDescription>
            هذه المعرّفات ضرورية لكي يعمل البوت ويرسل الإعلانات في القناة الصحيحة.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <div className="p-4 bg-muted rounded-lg flex items-center justify-between border">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${isBotTokenSaved ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
                  <span className="font-medium">
                    {isBotTokenSaved ? "البوت مُعدَّل بنجاح" : "يحتاج إلى إعداد"}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">الحالة</span>
              </div>

              <FormField
                control={form.control}
                name="botToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      توكن البوت (Bot Token)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={isBotTokenSaved ? "••••••••••••••••••••••••• (محفوظ)" : "أدخل توكن البوت هنا"}
                        {...field}
                        data-testid="input-bot-token"
                      />
                    </FormControl>
                    <p className="text-[0.8rem] text-muted-foreground mt-1">
                      {isBotTokenSaved
                        ? "التوكن محفوظ. أدخل توكن جديد فقط إذا أردت تغييره."
                        : "أدخل توكن البوت من Discord Developer Portal."}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
    </div>
  );
}

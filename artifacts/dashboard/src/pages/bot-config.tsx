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
import { Bot, Save, Server, Hash, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const configSchema = z.object({
  guildId: z.string().min(1, "ID السيرفر مطلوب"),
  announcementChannelId: z.string().min(1, "ID القناة مطلوب"),
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
    },
  });

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
      data: {
        guildId: values.guildId,
        announcementChannelId: values.announcementChannelId,
      }
    });
  }

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
            إعدادات Discord
          </CardTitle>
          <CardDescription>
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
    </div>
  );
}

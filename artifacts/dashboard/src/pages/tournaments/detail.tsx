import { useState } from "react";
import { useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetTournament,
  useListQuestions,
  useCreateQuestion,
  useDeleteQuestion,
  getGetTournamentQueryKey,
  getListQuestionsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Plus, Trash2, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { QuestionInputType } from "@workspace/api-client-react/src/generated/api.schemas";

const questionTypeLabels: Record<string, string> = {
  text: "نص قصير",
  number: "رقم",
  select: "قائمة منسدلة",
  multiselect: "اختيار متعدد",
  radio: "اختيار واحد",
};

const questionSchema = z.object({
  label: z.string().min(1, "نص السؤال مطلوب"),
  type: z.enum(["text", "number", "select", "multiselect", "radio"]),
  options: z.string().optional(),
  required: z.boolean().default(true),
});

export default function TournamentDetail() {
  const { id } = useParams();
  const tournamentId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tournament, isLoading: isLoadingTournament } = useGetTournament(tournamentId, {
    query: { enabled: !!tournamentId, queryKey: getGetTournamentQueryKey(tournamentId) }
  });

  const { data: questions, isLoading: isLoadingQuestions } = useListQuestions(tournamentId, {
    query: { enabled: !!tournamentId, queryKey: getListQuestionsQueryKey(tournamentId) }
  });

  const createQuestionMutation = useCreateQuestion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey(tournamentId) });
        form.reset({ label: "", type: "text", options: "", required: true });
        toast({ title: "تم إضافة السؤال بنجاح" });
      }
    }
  });

  const deleteQuestionMutation = useDeleteQuestion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey(tournamentId) });
        toast({ title: "تم حذف السؤال بنجاح" });
      }
    }
  });

  const form = useForm<z.infer<typeof questionSchema>>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      label: "",
      type: "text",
      options: "",
      required: true,
    },
  });

  const questionType = form.watch("type");
  const needsOptions = ["select", "multiselect", "radio"].includes(questionType);

  function onSubmit(values: z.infer<typeof questionSchema>) {
    createQuestionMutation.mutate({
      id: tournamentId,
      data: {
        label: values.label,
        type: values.type as QuestionInputType,
        options: values.options ? values.options.split(",").map(s => s.trim()) : null,
        required: values.required,
        order: (questions?.length || 0) + 1
      }
    });
  }

  if (isLoadingTournament) {
    return <div className="p-8 text-center text-muted-foreground">جاري تحميل تفاصيل البطولة...</div>;
  }

  if (!tournament) {
    return <div className="p-8 text-center text-destructive">البطولة غير موجودة</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/tournaments">
          <Button variant="outline" size="icon"><ArrowRight className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
          <p className="text-muted-foreground">تعديل نموذج التسجيل وأسئلته.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>معاينة نموذج التسجيل</CardTitle>
            <CardDescription>هذا ما سيراه اللاعبون عند التسجيل.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingQuestions ? (
              <div className="text-sm text-muted-foreground">جاري تحميل الأسئلة...</div>
            ) : questions?.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 bg-muted rounded-md text-center">
                لم يتم إضافة أسئلة مخصصة بعد.
              </div>
            ) : (
              <div className="space-y-4">
                {questions?.map((q) => (
                  <div key={q.id} className="flex items-start gap-4 p-3 bg-muted/50 rounded-md border">
                    <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-grab flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {q.label} {q.required && <span className="text-destructive">*</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">
                        النوع: {questionTypeLabels[q.type] ?? q.type}
                      </p>
                      {q.options && q.options.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {q.options.map((opt, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-background border rounded">{opt}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-8 w-8 flex-shrink-0"
                      onClick={() => deleteQuestionMutation.mutate({ id: q.id })}
                      data-testid={`btn-delete-question-${q.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>إضافة سؤال جديد</CardTitle>
            <CardDescription>أضف حقلاً جديداً لنموذج التسجيل.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>نص السؤال</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: ما هو رتبتك في اللعبة؟" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>نوع الإدخال</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر النوع" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="text">نص قصير</SelectItem>
                          <SelectItem value="number">رقم</SelectItem>
                          <SelectItem value="select">قائمة منسدلة</SelectItem>
                          <SelectItem value="multiselect">اختيار متعدد</SelectItem>
                          <SelectItem value="radio">اختيار واحد</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {needsOptions && (
                  <FormField
                    control={form.control}
                    name="options"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الخيارات (مفصولة بفاصلة)</FormLabel>
                        <FormControl>
                          <Input placeholder="مثال: برونز, فضة, ذهب, بلاتين" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="required"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>حقل إلزامي</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          يجب على اللاعب الإجابة على هذا السؤال للتسجيل.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createQuestionMutation.isPending}>
                  <Plus className="ml-2 h-4 w-4" />
                  {createQuestionMutation.isPending ? "جاري الإضافة..." : "إضافة السؤال"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

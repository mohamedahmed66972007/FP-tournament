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
  useUpdateQuestion,
  getGetTournamentQueryKey,
  getListQuestionsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowRight, Plus, Trash2, GripVertical, Pencil, Send } from "lucide-react";
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

type QuestionFormValues = z.infer<typeof questionSchema>;

export default function TournamentDetail() {
  const { id } = useParams();
  const tournamentId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingQuestion, setEditingQuestion] = useState<{ id: number; questionId: number } | null>(null);
  const [sendMsgOpen, setSendMsgOpen] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [isSending, setIsSending] = useState(false);

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

  const updateQuestionMutation = useUpdateQuestion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListQuestionsQueryKey(tournamentId) });
        setEditingQuestion(null);
        editForm.reset();
        toast({ title: "تم تعديل السؤال بنجاح" });
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

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: { label: "", type: "text", options: "", required: true },
  });

  const editForm = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: { label: "", type: "text", options: "", required: true },
  });

  const questionType = form.watch("type");
  const editQuestionType = editForm.watch("type");
  const needsOptions = ["select", "multiselect", "radio"].includes(questionType);
  const editNeedsOptions = ["select", "multiselect", "radio"].includes(editQuestionType);

  function onSubmit(values: QuestionFormValues) {
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

  function openEditDialog(q: NonNullable<typeof questions>[number]) {
    setEditingQuestion({ id: tournamentId, questionId: q.id });
    editForm.reset({
      label: q.label,
      type: q.type as any,
      options: q.options ? q.options.join(", ") : "",
      required: q.required,
    });
  }

  function onEditSubmit(values: QuestionFormValues) {
    if (!editingQuestion) return;
    updateQuestionMutation.mutate({
      id: editingQuestion.id,
      questionId: editingQuestion.questionId,
      data: {
        label: values.label,
        type: values.type as QuestionInputType,
        options: values.options ? values.options.split(",").map(s => s.trim()) : null,
        required: values.required,
      }
    });
  }

  async function handleSendMessage() {
    if (!channelId.trim()) {
      toast({ title: "أدخل ID القناة", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/send-registration-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channelId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل إرسال الرسالة");
      toast({ title: "تم إرسال رسالة التسجيل بنجاح ✅" });
      setSendMsgOpen(false);
      setChannelId("");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  }

  if (isLoadingTournament) {
    return <div className="p-8 text-center text-muted-foreground">جاري تحميل تفاصيل البطولة...</div>;
  }

  if (!tournament) {
    return <div className="p-8 text-center text-destructive">البطولة غير موجودة</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/tournaments">
          <Button variant="outline" size="icon"><ArrowRight className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight truncate">{tournament.name}</h1>
          <p className="text-muted-foreground text-sm">تعديل نموذج التسجيل وأسئلته.</p>
        </div>
        <Button
          variant="default"
          className="flex items-center gap-2"
          onClick={() => setSendMsgOpen(true)}
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">إرسال رسالة التسجيل</span>
          <span className="sm:hidden">إرسال</span>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>الأسئلة الحالية</CardTitle>
            <CardDescription>هذا ما سيراه اللاعبون عند التسجيل.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingQuestions ? (
              <div className="text-sm text-muted-foreground">جاري تحميل الأسئلة...</div>
            ) : questions?.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 bg-muted rounded-md text-center">
                لم يتم إضافة أسئلة بعد.
              </div>
            ) : (
              <div className="space-y-3">
                {questions?.map((q) => (
                  <div key={q.id} className="flex items-start gap-2 p-3 bg-muted/50 rounded-md border">
                    <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-grab flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-words">
                        {q.label} {q.required && <span className="text-destructive">*</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mb-1">
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
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() => openEditDialog(q)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive h-8 w-8"
                        onClick={() => deleteQuestionMutation.mutate({ id: q.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
                          <Input placeholder="مثال: Mobile, PC, iPad, Controller" {...field} />
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

      {/* Edit Question Dialog */}
      <Dialog open={!!editingQuestion} onOpenChange={(open) => { if (!open) setEditingQuestion(null); }}>
        <DialogContent dir="rtl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>تعديل السؤال</DialogTitle>
            <DialogDescription>عدّل نص السؤال أو نوعه أو خياراته.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نص السؤال</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع الإدخال</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
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
              {editNeedsOptions && (
                <FormField
                  control={editForm.control}
                  name="options"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الخيارات (مفصولة بفاصلة)</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: Mobile, PC, iPad, Controller" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={editForm.control}
                name="required"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>حقل إلزامي</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updateQuestionMutation.isPending}>
                  {updateQuestionMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Send Registration Message Dialog */}
      <Dialog open={sendMsgOpen} onOpenChange={setSendMsgOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              إرسال رسالة التسجيل
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              سيُرسل البوت رسالة إلى القناة المحددة تحتوي على تفاصيل البطولة وزر التسجيل.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">ID القناة (Channel ID)</label>
              <Input
                placeholder="مثال: 987654321098765432"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                يمكنك الحصول على ID القناة بالضغط عليها بزر يمين واختيار &quot;Copy Channel ID&quot;.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendMsgOpen(false)}>إلغاء</Button>
            <Button onClick={handleSendMessage} disabled={isSending}>
              <Send className="ml-2 h-4 w-4" />
              {isSending ? "جاري الإرسال..." : "إرسال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

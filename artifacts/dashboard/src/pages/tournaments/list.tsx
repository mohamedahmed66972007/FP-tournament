import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListTournaments,
  useCreateTournament,
  useUpdateTournament,
  useDeleteTournament,
  getListTournamentsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings, Trash2, Plus, Play, Pause } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { TournamentInputType } from "@workspace/api-client-react";

const typeLabels: Record<string, string> = {
  solo: "سولو",
  duo: "دو",
  squad: "سكواد",
};

const statusLabels: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
};

const formSchema = z.object({
  name: z.string().min(1, "اسم البطولة مطلوب"),
  type: z.enum(["solo", "duo", "squad"]),
  maxParticipants: z.string().optional().transform(v => v && v.trim() !== "" ? parseInt(v, 10) : null),
  prize: z.string().optional().transform(v => v && v.trim() !== "" ? v.trim() : null),
});

export default function TournamentList() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tournaments, isLoading } = useListTournaments({
    query: { queryKey: getListTournamentsQueryKey() }
  });

  const createMutation = useCreateTournament({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        setIsCreateOpen(false);
        form.reset();
        toast({ title: "تم إنشاء البطولة بنجاح" });
      },
      onError: (err: any) => {
        toast({ title: "خطأ في إنشاء البطولة", description: err.message, variant: "destructive" });
      }
    }
  });

  const updateMutation = useUpdateTournament({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        toast({ title: "تم تحديث البطولة بنجاح" });
      }
    }
  });

  const deleteMutation = useDeleteTournament({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
        toast({ title: "تم حذف البطولة بنجاح" });
      }
    }
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "solo",
      maxParticipants: "" as any,
      prize: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createMutation.mutate({
      data: {
        name: values.name,
        type: values.type as TournamentInputType,
        maxParticipants: values.maxParticipants,
        prize: values.prize,
      }
    });
  }

  function toggleStatus(id: number, currentStatus: string) {
    updateMutation.mutate({
      id,
      data: { status: currentStatus === "active" ? "inactive" : "active" }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">البطولات</h1>
          <p className="text-muted-foreground">أدر بطولاتك وإعداداتها.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="btn-create-tournament">
              <Plus className="ml-2 h-4 w-4" /> إنشاء بطولة
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إنشاء بطولة جديدة</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم البطولة</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: بطولة على 500 جولد" {...field} />
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
                      <FormLabel>نوع البطولة</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر النوع" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="solo">سولو</SelectItem>
                          <SelectItem value="duo">دو</SelectItem>
                          <SelectItem value="squad">سكواد</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxParticipants"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الحد الأقصى للمشاركين (اختياري)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="اتركه فارغاً لعدد غير محدود"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="prize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الجائزة (اختياري)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="مثال: 500 جولد"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المشاركون</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead className="text-left">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    جاري تحميل البطولات...
                  </TableCell>
                </TableRow>
              ) : tournaments?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد بطولات بعد.
                  </TableCell>
                </TableRow>
              ) : (
                tournaments?.map((tournament) => (
                  <TableRow key={tournament.id} data-testid={`row-tournament-${tournament.id}`}>
                    <TableCell className="font-medium">{tournament.name}</TableCell>
                    <TableCell>
                      <Badge variant={tournament.status === "active" ? "default" : "secondary"}>
                        {statusLabels[tournament.status] ?? tournament.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{typeLabels[tournament.type] ?? tournament.type}</TableCell>
                    <TableCell>
                      {tournament.acceptedCount} / {tournament.maxParticipants || "∞"}
                    </TableCell>
                    <TableCell>{format(new Date(tournament.createdAt), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-left">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleStatus(tournament.id, tournament.status)}
                          title={tournament.status === "active" ? "إيقاف" : "تفعيل"}
                          data-testid={`btn-toggle-${tournament.id}`}
                        >
                          {tournament.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Link href={`/tournaments/${tournament.id}`}>
                          <Button variant="outline" size="sm" title="الإعدادات">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من حذف هذه البطولة؟")) {
                              deleteMutation.mutate({ id: tournament.id });
                            }
                          }}
                          title="حذف"
                          data-testid={`btn-delete-${tournament.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

import { Fragment, useState, useMemo } from "react";
import {
  useListRegistrations,
  useApproveRegistration,
  useRejectRegistration,
  useDeleteRegistration,
  getListRegistrationsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

const statusLabels: Record<string, string> = {
  approved: "مقبول",
  rejected: "مرفوض",
  pending: "معلق",
};

const PLAYER_LABELS = ["الأول", "الثاني", "الثالث", "الرابع"];
const FORM_KEY_ORDER = [
  "اسم الفريق",
  ...PLAYER_LABELS.flatMap(label => [
    `اسم اللاعب ${label}`,
    `آيدي اللاعب ${label}`,
    `جهاز اللاعب ${label}`,
    `ديسكورد اللاعب ${label}`,
  ]),
  "اسم اللاعب",
  "آيدي اللاعب",
  "الجهاز",
  "ديسكورد اللاعب",
];

function sortedFormEntries(formData: Record<string, unknown>): [string, unknown][] {
  const ordered = FORM_KEY_ORDER
    .filter(k => k in formData)
    .map(k => [k, formData[k]] as [string, unknown]);
  const orderedKeys = new Set(ordered.map(([k]) => k));
  const remaining = Object.entries(formData).filter(([k]) => !orderedKeys.has(k));
  return [...ordered, ...remaining];
}

function useQuestionMap(tournamentIds: number[]): Record<number, Record<string, string>> {
  const results = useQueries({
    queries: tournamentIds.map((tid) => ({
      queryKey: ["questions", tid],
      queryFn: async () => {
        const res = await fetch(`/api/tournaments/${tid}/questions`);
        if (!res.ok) return [];
        return res.json() as Promise<Array<{ id: number; label: string }>>;
      },
      staleTime: 60_000,
    })),
  });

  return useMemo(() => {
    const map: Record<number, Record<string, string>> = {};
    tournamentIds.forEach((tid, i) => {
      const questions: Array<{ id: number; label: string }> = (results[i]?.data as any) ?? [];
      map[tid] = {};
      questions.forEach((q) => {
        map[tid][`q_${q.id}`] = q.label;
      });
    });
    return map;
  }, [results, tournamentIds]);
}

export default function Registrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const [rejectDialogState, setRejectDialogState] = useState<{
    isOpen: boolean;
    regId: number | null;
    reason: string;
  }>({ isOpen: false, regId: null, reason: "" });

  const [deleteDialogState, setDeleteDialogState] = useState<{
    isOpen: boolean;
    regId: number | null;
    username: string;
  }>({ isOpen: false, regId: null, username: "" });

  const filterParams = statusFilter !== "all" ? { status: statusFilter as any } : undefined;

  const { data: registrations, isLoading } = useListRegistrations(
    filterParams,
    { query: { queryKey: getListRegistrationsQueryKey(filterParams) } }
  );

  const invalidateAll = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/registrations"], exact: false });

  const approveMutation = useApproveRegistration({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        toast({ title: "تم قبول التسجيل" });
      }
    }
  });

  const rejectMutation = useRejectRegistration({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setRejectDialogState({ isOpen: false, regId: null, reason: "" });
        toast({ title: "تم رفض التسجيل" });
      }
    }
  });

  const deleteMutation = useDeleteRegistration({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setDeleteDialogState({ isOpen: false, regId: null, username: "" });
        toast({ title: "تم حذف التسجيل" });
      }
    }
  });

  const tournamentIds = useMemo(() => {
    const ids = new Set<number>();
    registrations?.forEach(r => ids.add(r.tournamentId));
    return Array.from(ids);
  }, [registrations]);

  const questionsByTournament = useQuestionMap(tournamentIds);

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">{statusLabels.approved}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{statusLabels.rejected}</Badge>;
      default:
        return <Badge variant="secondary">{statusLabels.pending}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">التسجيلات</h1>
          <p className="text-muted-foreground">راجع وأدر طلبات تسجيل اللاعبين.</p>
        </div>
        <div className="w-[200px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter">
              <SelectValue placeholder="تصفية حسب الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="pending">معلق</SelectItem>
              <SelectItem value="approved">مقبول</SelectItem>
              <SelectItem value="rejected">مرفوض</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>مستخدم Discord</TableHead>
                <TableHead>رقم البطولة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead className="text-left">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    جاري تحميل التسجيلات...
                  </TableCell>
                </TableRow>
              ) : registrations?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد تسجيلات.
                  </TableCell>
                </TableRow>
              ) : (
                registrations?.map((reg) => (
                  <Fragment key={reg.id}>
                    <TableRow className={expandedRows[reg.id] ? "border-b-0" : ""} data-testid={`row-reg-${reg.id}`}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => toggleRow(reg.id)}
                          data-testid={`btn-expand-${reg.id}`}
                        >
                          {expandedRows[reg.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{reg.discordUsername}</div>
                        <div className="text-xs text-muted-foreground" data-testid={`text-discord-id-${reg.id}`}>{reg.discordUserId}</div>
                      </TableCell>
                      <TableCell>#{reg.tournamentId}</TableCell>
                      <TableCell>{getStatusBadge(reg.status)}</TableCell>
                      <TableCell>{format(new Date(reg.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell className="text-left">
                        <div className="flex justify-end gap-2">
                          {reg.status === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                onClick={() => approveMutation.mutate({ id: reg.id })}
                                disabled={approveMutation.isPending}
                                data-testid={`btn-approve-${reg.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4 ml-1" /> قبول
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setRejectDialogState({ isOpen: true, regId: reg.id, reason: "" })}
                                data-testid={`btn-reject-${reg.id}`}
                              >
                                <XCircle className="h-4 w-4 ml-1" /> رفض
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteDialogState({ isOpen: true, regId: reg.id, username: reg.discordUsername })}
                            data-testid={`btn-delete-${reg.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows[reg.id] && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={6} className="p-4 border-t-0">
                          <div className="rounded-md border bg-card p-4">
                            <h4 className="font-semibold mb-3">إجابات المستخدم</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              {sortedFormEntries(reg.formData as Record<string, unknown>).map(([key, value]) => {
                                const label = questionsByTournament[reg.tournamentId]?.[key] ?? key;
                                return (
                                  <div key={key}>
                                    <div className="text-sm font-medium text-muted-foreground">{label}</div>
                                    <div className="text-sm mt-1">
                                      {Array.isArray(value) ? value.join("، ") : String(value || "—")}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {reg.rejectionReason && (
                              <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm border border-destructive/20">
                                <strong>سبب الرفض:</strong> {reg.rejectionReason}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={rejectDialogState.isOpen}
        onOpenChange={(isOpen) => setRejectDialogState(prev => ({ ...prev, isOpen }))}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>رفض التسجيل</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">سبب الرفض (اختياري)</label>
            <Textarea
              placeholder="مثال: الرتبة أعلى من المستوى المطلوب لهذه البطولة"
              value={rejectDialogState.reason}
              onChange={(e) => setRejectDialogState(prev => ({ ...prev, reason: e.target.value }))}
              data-testid="textarea-rejection-reason"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectDialogState(prev => ({ ...prev, isOpen: false }))}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectDialogState.regId &&
                rejectMutation.mutate({
                  id: rejectDialogState.regId,
                  data: { reason: rejectDialogState.reason || null }
                })
              }
              disabled={rejectMutation.isPending}
              data-testid="btn-confirm-reject"
            >
              {rejectMutation.isPending ? "جاري الرفض..." : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogState.isOpen}
        onOpenChange={(isOpen) => setDeleteDialogState(prev => ({ ...prev, isOpen }))}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف التسجيل</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            هل أنت متأكد من حذف تسجيل <span className="font-semibold text-foreground">{deleteDialogState.username}</span>؟
            <br />
            لا يمكن التراجع عن هذا الإجراء.
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogState(prev => ({ ...prev, isOpen: false }))}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteDialogState.regId &&
                deleteMutation.mutate({ id: deleteDialogState.regId })
              }
              disabled={deleteMutation.isPending}
              data-testid="btn-confirm-delete"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { Fragment, useState } from "react";
import {
  useListRegistrations,
  useApproveRegistration,
  useRejectRegistration,
  getListRegistrationsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

const statusLabels: Record<string, string> = {
  approved: "مقبول",
  rejected: "مرفوض",
  pending: "معلق",
};

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

  const { data: registrations, isLoading } = useListRegistrations(
    statusFilter !== "all" ? { query: { status: statusFilter as any } } : undefined,
    { query: { queryKey: getListRegistrationsQueryKey(statusFilter !== "all" ? { status: statusFilter as any } : undefined) } }
  );

  const approveMutation = useApproveRegistration({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRegistrationsQueryKey() });
        toast({ title: "تم قبول التسجيل" });
      }
    }
  });

  const rejectMutation = useRejectRegistration({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRegistrationsQueryKey() });
        setRejectDialogState({ isOpen: false, regId: null, reason: "" });
        toast({ title: "تم رفض التسجيل" });
      }
    }
  });

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
                        {reg.status === "pending" && (
                          <div className="flex justify-end gap-2">
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
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedRows[reg.id] && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={6} className="p-4 border-t-0">
                          <div className="rounded-md border bg-card p-4">
                            <h4 className="font-semibold mb-3">إجابات النموذج</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              {Object.entries(reg.formData).map(([key, value]) => (
                                <div key={key}>
                                  <div className="text-sm font-medium text-muted-foreground">{key}</div>
                                  <div className="text-sm mt-1">
                                    {Array.isArray(value) ? value.join("، ") : String(value || "—")}
                                  </div>
                                </div>
                              ))}
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
    </div>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, Clock, UserX, Gamepad2 } from "lucide-react";
import { Link } from "wouter";
import { useGetActiveTournament, useGetTournamentStats, getGetActiveTournamentQueryKey, getGetTournamentStatsQueryKey } from "@workspace/api-client-react";

const typeLabels: Record<string, string> = {
  solo: "سولو",
  duo: "دو",
  squad: "سكواد",
};

export default function Dashboard() {
  const { data: activeTournament, isLoading: isLoadingTournament } = useGetActiveTournament({
    query: { queryKey: getGetActiveTournamentQueryKey() }
  });

  const { data: stats } = useGetTournamentStats(
    activeTournament?.id ?? 0,
    { query: { enabled: !!activeTournament?.id, queryKey: getGetTournamentStatsQueryKey(activeTournament?.id ?? 0) } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">نظرة عامة</h1>
        <p className="text-muted-foreground">راقب البطولة النشطة وآخر التسجيلات.</p>
      </div>

      {isLoadingTournament ? (
        <div className="h-40 flex items-center justify-center bg-card rounded-xl border">
          <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
        </div>
      ) : activeTournament ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي التسجيلات</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalRegistrations ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {stats?.remainingSeats !== undefined && stats?.remainingSeats !== null
                    ? `${stats.remainingSeats} مقعد متبقٍ`
                    : "مقاعد غير محدودة"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">قيد المراجعة</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.pendingCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">تحتاج إلى مراجعتك</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">مقبولون</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{stats?.approvedCount ?? 0}</div>
                <p className="text-xs text-muted-foreground">جاهزون للمشاركة</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">مرفوضون</CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{stats?.rejectedCount ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-primary" />
                البطولة النشطة
              </CardTitle>
              <CardDescription>جاري قبول التسجيلات الآن</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-xl font-bold">{activeTournament.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <span className="px-2 py-0.5 rounded-full bg-secondary">
                      {typeLabels[activeTournament.type] ?? activeTournament.type}
                    </span>
                    <span>
                      {activeTournament.maxParticipants
                        ? `الحد الأقصى: ${activeTournament.maxParticipants} لاعب`
                        : "عدد غير محدود"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/tournaments/${activeTournament.id}`}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                  >
                    إدارة الإعدادات
                  </Link>
                  <Link
                    href="/registrations"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                  >
                    مراجعة الطلبات المعلقة
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gamepad2 className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
            <h3 className="text-xl font-bold mb-2">لا توجد بطولة نشطة</h3>
            <p className="text-muted-foreground mb-6 max-w-sm text-center">
              لا توجد بطولة نشطة حالياً. أنشئ بطولة جديدة أو فعّل بطولة موجودة لبدء قبول التسجيلات.
            </p>
            <Link
              href="/tournaments"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              الذهاب إلى البطولات
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import TopBar from "@/components/dashboard/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { buildBoardingTags, buildDaycareTags, tagToneClass } from "@/lib/operationsTags";
import {
  parseDaycareBillingPath,
  visibleDaycareNotes,
  resolveDaycareSessionInvoiceId,
  isDaycareHourlyPending,
  isSingleDayInvoiceMissing,
  isHourlyBillingInvoiced,
  isHourlyBillingDraft,
  enrichDaycareSessionInvoiceMap,
} from "@/lib/daycareSessionMeta";
import { useDaycareSessionInvoiceMap } from "@/hooks/useDaycareSessionInvoiceMap";
import { DaycareSessionInvoiceLink } from "@/components/daycare/DaycareSessionInvoiceLink";
import {
  CompleteHourlyBillingDialog,
  type HourlyBillingSession,
} from "@/components/daycare/CompleteHourlyBillingDialog";

type ServiceType = "daycare" | "boarding";
type DatePreset = "day" | "today" | "tomorrow" | "next7";

interface DaycareRow {
  id: string;
  ownerId: string;
  petId: string;
  petName: string;
  ownerName: string;
  sessionDate: string;
  checkedIn: boolean;
  packageId: string | null;
  checkedInAt: string | null;
  notes: string | null;
}

interface BoardingRow {
  id: string;
  petNames: string;
  ownerName: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  roomName: string;
}

type DaycareSessionSelectRow = {
  id: string;
  owner_id: string;
  pet_id: string;
  session_date: string;
  checked_in: boolean | null;
  package_id: string | null;
  checked_in_at: string | null;
  notes: string | null;
  pets: { name: string | null } | null;
  owners: { first_name: string | null; last_name: string | null } | null;
};

type BoardingSelectRow = {
  id: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  rooms: { display_name: string | null } | null;
  owners: { first_name: string | null; last_name: string | null } | null;
  booking_pets: Array<{ pets: { name: string | null } | null }> | null;
};

const TODAY = format(new Date(), "yyyy-MM-dd");

function normalizeService(value: string | null): ServiceType {
  return value === "boarding" ? "boarding" : "daycare";
}

export default function ServiceCheckinsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const service = normalizeService(searchParams.get("service"));
  const date = searchParams.get("date") || TODAY;
  const preset = (searchParams.get("preset") as DatePreset | null) ?? "day";

  const [loading, setLoading] = useState(true);
  const [daycareRows, setDaycareRows] = useState<DaycareRow[]>([]);
  const [boardingRows, setBoardingRows] = useState<BoardingRow[]>([]);
  const [hourlyBillingTarget, setHourlyBillingTarget] = useState<{
    ownerId: string;
    ownerName: string;
    sessionDate: string;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      const endDate = preset === "next7" ? format(addDays(parseISO(date), 6), "yyyy-MM-dd") : date;
      if (service === "daycare") {
        const { data, error } = await supabase
          .from("daycare_sessions")
          .select(
            "id, owner_id, pet_id, session_date, checked_in, package_id, checked_in_at, notes, pets(name), owners(first_name, last_name)",
          )
          .gte("session_date", date)
          .lte("session_date", endDate)
          .order("checked_in_at", { ascending: true });

        if (!error) {
          const mapped = ((data ?? []) as DaycareSessionSelectRow[]).map((row) => ({
            id: row.id,
            ownerId: row.owner_id,
            petId: row.pet_id,
            petName: row.pets?.name ?? "—",
            ownerName: ownerDisplayName(row.owners?.first_name, row.owners?.last_name),
            sessionDate: row.session_date,
            checkedIn: Boolean(row.checked_in),
            packageId: row.package_id ?? null,
            checkedInAt: row.checked_in_at,
            notes: row.notes,
          }));
          setDaycareRows(mapped);
        } else {
          setDaycareRows([]);
        }
      } else {
        const { data, error } = await supabase
          .from("bookings")
          .select("id, status, check_in_date, check_out_date, rooms(display_name), owners(first_name, last_name), booking_pets(pets(name))")
          .gte("check_in_date", date)
          .lte("check_in_date", endDate)
          .neq("status", "cancelled")
          .order("created_at", { ascending: true });

        if (!error) {
          const mapped = ((data ?? []) as BoardingSelectRow[]).map((row) => ({
            id: row.id,
            status: row.status,
            checkInDate: row.check_in_date,
            checkOutDate: row.check_out_date,
            roomName: row.rooms?.display_name ?? "—",
            ownerName: [row.owners?.first_name, row.owners?.last_name].filter(Boolean).join(" ") || "—",
            petNames: (row.booking_pets ?? [])
              .map((bp) => bp.pets?.name)
              .filter(Boolean)
              .join(" & ") || "—",
          }));
          setBoardingRows(mapped);
        } else {
          setBoardingRows([]);
        }
      }
      setLoading(false);
    };
    void load();
  }, [service, date, preset]);

  const daycareSessionIds = useMemo(() => daycareRows.map((r) => r.id), [daycareRows]);
  const { data: invoiceIdByServiceId = new Map<string, string>() } =
    useDaycareSessionInvoiceMap(daycareSessionIds);

  const invoiceIdBySessionId = useMemo(
    () =>
      enrichDaycareSessionInvoiceMap(
        daycareRows.map((row) => ({
          id: row.id,
          owner_id: row.ownerId,
          session_date: row.sessionDate,
          notes: row.notes,
          package_id: row.packageId,
        })),
        invoiceIdByServiceId,
      ),
    [daycareRows, invoiceIdByServiceId],
  );

  const hourlyBillingSessions = useMemo((): HourlyBillingSession[] => {
    if (!hourlyBillingTarget) return [];
    return daycareRows
      .filter((row) => {
        if (row.ownerId !== hourlyBillingTarget.ownerId) return false;
        if (row.sessionDate !== hourlyBillingTarget.sessionDate) return false;
        return isDaycareHourlyPending(
          {
            sessionId: row.id,
            notes: row.notes,
            packageId: row.packageId,
            checkedIn: row.checkedIn,
          },
          invoiceIdBySessionId,
        );
      })
      .map((row) => ({
        id: row.id,
        petId: row.petId,
        petName: row.petName,
        notes: row.notes,
      }));
  }, [hourlyBillingTarget, daycareRows, invoiceIdBySessionId]);

  const pendingHourlyCount = useMemo(
    () =>
      daycareRows.filter((row) =>
        isDaycareHourlyPending(
          {
            sessionId: row.id,
            notes: row.notes,
            packageId: row.packageId,
            checkedIn: row.checkedIn,
          },
          invoiceIdBySessionId,
        ),
      ).length,
    [daycareRows, invoiceIdBySessionId],
  );

  const title = useMemo(
    () => (service === "daycare" ? "Daycare check-ins by day" : "Boarding check-ins by day"),
    [service],
  );

  const selectedDateLabel = useMemo(() => {
    if (preset === "next7") {
      return `${format(parseISO(date), "d MMM")} - ${format(addDays(parseISO(date), 6), "d MMM yyyy")}`;
    }
    return format(parseISO(date), "d MMM yyyy");
  }, [date, preset]);

  const setParam = (key: "service" | "date" | "preset", value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    }, { replace: true });
  };

  return (
    <>
      <TopBar title="Daily Check-ins" />
      <main className="flex-1 overflow-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">View check-ins for a selected date.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/")}>Back to dashboard</Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2">
              <Button
                variant={service === "daycare" ? "default" : "outline"}
                onClick={() => {
                  setParam("service", "daycare");
                }}
              >
                Daycare
              </Button>
              <Button
                variant={service === "boarding" ? "default" : "outline"}
                onClick={() => {
                  setParam("service", "boarding");
                }}
              >
                Boarding
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant={preset === "today" ? "default" : "outline"} onClick={() => {
                setParam("date", TODAY);
                setParam("preset", "today");
              }}>Today</Button>
              <Button variant={preset === "tomorrow" ? "default" : "outline"} onClick={() => {
                setParam("date", format(addDays(new Date(), 1), "yyyy-MM-dd"));
                setParam("preset", "tomorrow");
              }}>Tomorrow</Button>
              <Button variant={preset === "next7" ? "default" : "outline"} onClick={() => {
                setParam("date", TODAY);
                setParam("preset", "next7");
              }}>Next 7 days</Button>
            </div>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setParam("date", e.target.value);
                setParam("preset", "day");
              }}
              className="sm:w-56"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              <span>
                {service === "daycare" ? "Daycare check-ins" : "Boarding check-ins"} on {selectedDateLabel}
              </span>
              {service === "daycare" && pendingHourlyCount > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200 font-normal">
                  Pending hourly billing: {pendingHourlyCount}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : service === "daycare" ? (
              daycareRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No daycare check-ins for this day.</p>
              ) : (
                <div className="space-y-2">
                  {daycareRows.map((row) => {
                    const billingPath = parseDaycareBillingPath(row.notes, row.packageId);
                    const invoiceId = resolveDaycareSessionInvoiceId(
                      row.id,
                      row.notes,
                      invoiceIdBySessionId,
                    );
                    const hourlyPending = isDaycareHourlyPending(
                      {
                        sessionId: row.id,
                        notes: row.notes,
                        packageId: row.packageId,
                        checkedIn: row.checkedIn,
                      },
                      invoiceIdBySessionId,
                    );
                    const invoiceMissing = isSingleDayInvoiceMissing(
                      {
                        sessionId: row.id,
                        notes: row.notes,
                        packageId: row.packageId,
                        checkedIn: row.checkedIn,
                      },
                      invoiceIdBySessionId,
                    );
                    const visibleNotes = visibleDaycareNotes(row.notes);

                    return (
                      <div
                        key={row.id}
                        className="rounded-md border px-3 py-2 text-sm flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(row.sessionDate), "d MMM yyyy")}
                          </p>
                          <p className="font-medium">{row.petName} - {row.ownerName}</p>
                          <p className="text-xs text-muted-foreground">{visibleNotes || "No notes"}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {buildDaycareTags({
                              sessionDate: row.sessionDate,
                              todayDate: TODAY,
                              checkedIn: row.checkedIn,
                              packageId: row.packageId,
                              billingPath,
                              hasInvoice: isHourlyBillingInvoiced(row.notes),
                              hasDraftInvoice: isHourlyBillingDraft(row.notes),
                            }).map((tag) => (
                              <Badge
                                key={`${row.id}-${tag.key}`}
                                variant="outline"
                                className={tagToneClass(tag.tone)}
                              >
                                {tag.label}
                              </Badge>
                            ))}
                            {invoiceMissing && (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                Invoice missing
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="min-w-[190px] space-y-2 shrink-0">
                          <p className="text-right text-xs text-muted-foreground">
                            {row.checkedInAt ? format(parseISO(row.checkedInAt), "HH:mm") : "—"}
                          </p>
                          {invoiceId && (
                            <DaycareSessionInvoiceLink
                              invoiceId={invoiceId}
                              testId={`service-checkins-view-invoice-${row.id}`}
                            />
                          )}
                          {hourlyPending && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="w-full h-8 text-xs"
                              data-testid={`service-checkins-complete-hourly-${row.id}`}
                              onClick={() =>
                                setHourlyBillingTarget({
                                  ownerId: row.ownerId,
                                  ownerName: row.ownerName,
                                  sessionDate: row.sessionDate,
                                })
                              }
                            >
                              Complete hourly billing
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : boardingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No boarding check-ins for this day.</p>
            ) : (
              <div className="space-y-2">
                {boardingRows.map((row) => (
                  <div key={row.id} className="rounded-md border px-3 py-2 text-sm flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.petNames} - {row.ownerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.roomName} - {format(parseISO(row.checkInDate), "d MMM")} to {format(parseISO(row.checkOutDate), "d MMM")}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {buildBoardingTags({
                          status: row.status,
                          checkInDate: row.checkInDate,
                          checkOutDate: row.checkOutDate,
                          todayDate: TODAY,
                        }).map((tag) => (
                          <Badge key={`${row.id}-${tag.key}`} variant="outline" className={tagToneClass(tag.tone)}>
                            {tag.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{row.status.replace("_", " ")}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <CompleteHourlyBillingDialog
        open={Boolean(hourlyBillingTarget) && hourlyBillingSessions.length > 0}
        onOpenChange={(open) => {
          if (!open) setHourlyBillingTarget(null);
        }}
        ownerId={hourlyBillingTarget?.ownerId ?? ""}
        ownerName={hourlyBillingTarget?.ownerName ?? ""}
        sessions={hourlyBillingSessions}
        onSuccess={() => {
          setHourlyBillingTarget(null);
          queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          void (async () => {
            setLoading(true);
            const endDate = preset === "next7" ? format(addDays(parseISO(date), 6), "yyyy-MM-dd") : date;
            const { data } = await supabase
              .from("daycare_sessions")
              .select(
                "id, owner_id, pet_id, session_date, checked_in, package_id, checked_in_at, notes, pets(name), owners(first_name, last_name)",
              )
              .gte("session_date", date)
              .lte("session_date", endDate)
              .order("checked_in_at", { ascending: true });
            if (data) {
              setDaycareRows(
                (data as DaycareSessionSelectRow[]).map((row) => ({
                  id: row.id,
                  ownerId: row.owner_id,
                  petId: row.pet_id,
                  petName: row.pets?.name ?? "—",
                  ownerName: ownerDisplayName(row.owners?.first_name, row.owners?.last_name),
                  sessionDate: row.session_date,
                  checkedIn: Boolean(row.checked_in),
                  packageId: row.package_id ?? null,
                  checkedInAt: row.checked_in_at,
                  notes: row.notes,
                })),
              );
            }
            setLoading(false);
          })();
        }}
      />
    </>
  );
}

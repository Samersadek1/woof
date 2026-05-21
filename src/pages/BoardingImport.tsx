import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AlertCircle, Check, ExternalLink, Loader2, Upload } from "lucide-react";
import TopBar from "@/components/dashboard/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { useRooms } from "@/hooks/useBookings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  MSH_BOARDING_CSV_PATH,
  aggregateMshStays,
  matchMshStays,
  parseMshBoardingCsv,
  stayOverlapsWindow,
  summarizeMatches,
  type MshMatchStatus,
  type MshStayMatch,
  type OwnerWithPetsIndex,
} from "@/lib/mshBoardingImport";

const STATUS_LABEL: Record<MshMatchStatus, string> = {
  ready: "Ready",
  owner_only: "Pet not found",
  owner_ambiguous: "Ambiguous owner",
  owner_weak: "Weak owner match",
  no_owner: "No owner match",
  already_in_db: "Already in system",
};

const STATUS_VARIANT: Record<
  MshMatchStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  owner_only: "secondary",
  owner_ambiguous: "destructive",
  owner_weak: "outline",
  no_owner: "destructive",
  already_in_db: "secondary",
};

type FilterKey = "all" | "importable" | "ready" | "review" | "no_match";

async function fetchOwnersIndex(): Promise<OwnerWithPetsIndex[]> {
  const PAGE = 1000;
  const all: OwnerWithPetsIndex[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("owners")
      .select("id, first_name, last_name, phone, pets(id, name, species, owner_id)")
      .order("last_name")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as OwnerWithPetsIndex[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default function BoardingImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useRooms();

  const [dateFrom, setDateFrom] = useState("2026-05-01");
  const [dateTo, setDateTo] = useState("2026-05-31");
  const [filter, setFilter] = useState<FilterKey>("importable");
  const [search, setSearch] = useState("");
  const [roomByStayKey, setRoomByStayKey] = useState<Record<string, string>>({});

  const csvQuery = useQuery({
    queryKey: ["msh-boarding-csv"],
    queryFn: async () => {
      const res = await fetch(MSH_BOARDING_CSV_PATH);
      if (!res.ok) throw new Error(`Failed to load CSV (${res.status})`);
      return parseMshBoardingCsv(await res.text());
    },
    staleTime: Infinity,
  });

  const ownersQuery = useQuery({
    queryKey: ["msh-boarding-owners-index"],
    queryFn: fetchOwnersIndex,
    staleTime: 5 * 60 * 1000,
  });

  const bookingsQuery = useQuery({
    queryKey: ["msh-boarding-existing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, owner_id, room_id, check_in_date, check_out_date, booking_pets(pet_id)")
        .eq("booking_type", "boarding")
        .neq("status", "cancelled")
        .gte("check_out_date", "2026-01-01");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stays = useMemo(() => {
    const nights = csvQuery.data ?? [];
    const agg = aggregateMshStays(nights);
    return agg.filter((s) => stayOverlapsWindow(s, dateFrom || null, dateTo || null));
  }, [csvQuery.data, dateFrom, dateTo]);

  const matched = useMemo(() => {
    if (!ownersQuery.data || !bookingsQuery.data) return [];
    return matchMshStays(stays, ownersQuery.data, rooms, bookingsQuery.data);
  }, [stays, ownersQuery.data, bookingsQuery.data, rooms]);

  const summary = useMemo(() => summarizeMatches(matched), [matched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matched.filter((row) => {
      if (filter === "importable" && !row.importable) return false;
      if (filter === "ready" && row.match_status !== "ready") return false;
      if (filter === "review" && !row.room_needs_review && row.match_status !== "owner_ambiguous")
        return false;
      if (
        filter === "no_match" &&
        row.match_status !== "no_owner" &&
        row.match_status !== "owner_weak"
      )
        return false;
      if (!q) return true;
      const blob = `${row.owner_name} ${row.pet_name} ${row.owner_db_name ?? ""} ${row.calendar_room}`.toLowerCase();
      return blob.includes(q);
    });
  }, [matched, filter, search]);

  const stayKey = (row: MshStayMatch) =>
    `${row.owner_name}|${row.pet_name}|${row.start_date}|${row.end_date}|${row.calendar_room}`;

  const createFromRow = useMutation({
    mutationFn: async (row: MshStayMatch) => {
      const key = stayKey(row);
      const roomId = roomByStayKey[key] ?? row.room_suggestions[0]?.id;
      if (!row.owner_id || !row.pet_id || !roomId) {
        throw new Error("Owner, pet, and room are required");
      }
      const { data, error } = await supabase
        .from("bookings")
        .insert({
          owner_id: row.owner_id,
          room_id: roomId,
          check_in_date: row.start_date,
          check_out_date: row.end_date,
          status: "confirmed",
          booking_type: "boarding",
          notes: [
            "Imported from legacy MSH calendar CSV",
            row.calendar_raw ? `Source: ${row.calendar_raw}` : "",
            row.calendar_room ? `Calendar room: ${row.calendar_room}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          do_not_move: false,
          pickup_required: false,
          dropoff_required: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: petErr } = await supabase.from("booking_pets").insert({
        booking_id: data.id,
        pet_id: row.pet_id,
      });
      if (petErr) throw petErr;
      return data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["msh-boarding-existing"] });
      toast.success("Boarding booking created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const loading =
    csvQuery.isLoading || ownersQuery.isLoading || bookingsQuery.isLoading;

  const ownersBlocked =
    !ownersQuery.isLoading && (ownersQuery.data?.length ?? 0) === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar title="Boarding calendar import" />

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-[1600px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Main Branch legacy calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Matches{" "}
              <code className="text-xs bg-muted px-1 rounded">msh_boarding_pet_night_detail_MAIN_BRANCH_ONLY_2026-05-19.csv</code>{" "}
              to customers and pets in Supabase, then lets you create confirmed boarding bookings.
              Sign in as staff so customer data can load (anon keys are blocked by RLS).
            </p>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label htmlFor="date-from">Stay overlaps from</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[160px] mt-1"
                />
              </div>
              <div>
                <Label htmlFor="date-to">to</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[160px] mt-1"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  placeholder="Owner, pet, room…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {ownersBlocked && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6 flex gap-3 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="font-medium text-foreground">No customers loaded</p>
                <p className="text-muted-foreground mt-1">
                  Log in to the admin app, or add{" "}
                  <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code> to{" "}
                  <code className="text-xs">.env</code> and run{" "}
                  <code className="text-xs">npm run msh:boarding:match:may</code> from the terminal.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(
              [
                ["Stays in range", summary.total],
                ["Ready", summary.ready],
                ["Can import", summary.importable],
                ["Pet missing", summary.owner_only],
                ["Ambiguous", summary.owner_ambiguous],
                ["No match", summary.no_owner],
              ] as const
            ).map(([label, n]) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{n}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["importable", "Can import"],
              ["ready", "Ready"],
              ["review", "Needs review"],
              ["no_match", "No match"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? "default" : "outline"}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>CSV owner / pet</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Calendar room</TableHead>
                  <TableHead>Matched customer</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Loading CSV and customer index…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No rows for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
                    const key = stayKey(row);
                    const selectedRoom =
                      roomByStayKey[key] ?? row.room_suggestions[0]?.id ?? "";
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[row.match_status]}>
                            {STATUS_LABEL[row.match_status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.owner_name}</div>
                          <div className="text-muted-foreground text-xs">{row.pet_name}</div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(parseISO(row.start_date), "d MMM yyyy")}
                          <br />→ {format(parseISO(row.end_date), "d MMM yyyy")}
                          <div className="text-muted-foreground">{row.night_count} nights in file</div>
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px]">
                          {row.calendar_room}
                          {row.room_review_flag ? (
                            <div className="text-amber-600 mt-1">{row.room_review_flag}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.owner_db_name ? (
                            <>
                              <Link
                                to={`/customers/${row.owner_id}`}
                                className="text-primary hover:underline inline-flex items-center gap-1"
                              >
                                {row.owner_db_name}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                              {row.pet_id ? (
                                <div className="text-muted-foreground mt-0.5">
                                  Pet match {row.pet_match_score}%
                                </div>
                              ) : (
                                <div className="text-amber-600 mt-1">Pet not in profile</div>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {row.owner_alternatives.length > 1 && (
                            <div className="text-muted-foreground mt-1">
                              Alt:{" "}
                              {row.owner_alternatives
                                .slice(1, 3)
                                .map((a) => a.name)
                                .join(", ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.room_suggestions.length > 0 ? (
                            <Select
                              value={selectedRoom}
                              onValueChange={(v) =>
                                setRoomByStayKey((prev) => ({ ...prev, [key]: v }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs max-w-[200px]">
                                <SelectValue placeholder="Pick room" />
                              </SelectTrigger>
                              <SelectContent>
                                {row.room_suggestions.map((r) => (
                                  <SelectItem key={r.id} value={r.id}>
                                    {r.display_name} ({r.wing})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-amber-600">Map manually in Boarding</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.importable && row.owner_id && row.pet_id ? (
                            <Button
                              size="sm"
                              disabled={createFromRow.isPending || !selectedRoom}
                              onClick={() => createFromRow.mutate(row)}
                            >
                              {createFromRow.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4 mr-1" />
                              )}
                              Create
                            </Button>
                          ) : row.existing_booking_id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate("/boarding")}
                            >
                              In calendar
                            </Button>
                          ) : row.owner_id ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link to={`/customers/${row.owner_id}`}>Fix profile</Link>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" asChild>
                              <Link to="/customers">Find customer</Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

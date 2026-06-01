import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { BoardingNightCapacity } from "@/hooks/useBoardingCapacity";
import type { KennelMapOccupancy, KennelMapRoom, UnassignedBoardingRow } from "@/hooks/useBoardingCapacity";
import { requiredClassLabel } from "@/lib/boardingCapacity";
import {
  groupKennelMapRoomsByZone,
  kennelMapOccupantLabel,
  kennelMapRoomLabel,
} from "@/lib/kennelMapDisplay";

function unassignedArrivalLabel(arrival: UnassignedBoardingRow["arrival"]): string {
  switch (arrival) {
    case "arriving_today":
      return "arriving today";
    case "here_now":
      return "here now";
    default:
      return "upcoming";
  }
}

function capacitySummary(capacity: BoardingNightCapacity): string {
  const free = `${capacity.large_free} large · ${capacity.total_free} total free`;
  if (capacity.feasible) {
    return `All ${capacity.unassigned} fit tonight · ${free}`;
  }
  return `${capacity.reason} · ${free} · ${capacity.unassigned} unassigned`;
}

type Props = {
  date: string;
  rooms: KennelMapRoom[];
  occ: KennelMapOccupancy[];
  queue: UnassignedBoardingRow[];
  capacity: BoardingNightCapacity | null | undefined;
};

export function KennelMapPrintView({ date, rooms, occ, queue, capacity }: Props) {
  const titleDate = format(parseISO(date), "EEEE, d MMMM yyyy");

  const occByRoom = useMemo(() => {
    const m = new Map<string, KennelMapOccupancy>();
    for (const row of occ) {
      if (row.room_id) m.set(row.room_id, row);
    }
    return m;
  }, [occ]);

  const zones = useMemo(() => groupKennelMapRoomsByZone(rooms), [rooms]);

  return (
    <div className="kennel-map-print">
      <header className="mb-4 border-b border-black pb-3">
        <h1 className="print-label text-xl font-bold">Kennel map</h1>
        <p className="print-sans mt-1 text-sm">{titleDate}</p>
        {capacity ? (
          <p className="print-sans mt-1 text-xs text-neutral-700">{capacitySummary(capacity)}</p>
        ) : null}
      </header>

      <div className="kennel-map-print-layout print-sans text-[11px]">
        <section className="kennel-map-print-unassigned">
          <h2 className="print-label mb-2 text-sm font-semibold">
            Unassigned · {queue.length}
          </h2>
          {queue.length === 0 ? (
            <p className="text-neutral-600">All dogs have a kennel tonight.</p>
          ) : (
            <table className="kennel-map-print-table w-full border-collapse">
              <thead>
                <tr>
                  <th className="kennel-map-print-th">Dog(s)</th>
                  <th className="kennel-map-print-th">Owner</th>
                  <th className="kennel-map-print-th">Class</th>
                  <th className="kennel-map-print-th">Arrival</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <tr key={row.booking_id}>
                    <td className="kennel-map-print-td font-medium">
                      {row.dog_names || "—"}
                      {row.booking_ref ? (
                        <span className="block text-[10px] font-normal text-neutral-600">
                          {row.booking_ref}
                        </span>
                      ) : null}
                    </td>
                    <td className="kennel-map-print-td">{row.owner_name || "—"}</td>
                    <td className="kennel-map-print-td">
                      {row.required_class === "large" && row.has_restriction
                        ? "Large · restriction"
                        : requiredClassLabel(row.required_class)}
                    </td>
                    <td className="kennel-map-print-td">{unassignedArrivalLabel(row.arrival)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="kennel-map-print-zones">
          {zones.map(({ zone, rooms: zoneRooms, sizeClass }) => (
            <div key={zone} className="kennel-map-print-zone mb-3 break-inside-avoid">
              <div className="mb-1 flex items-center justify-between gap-2 border-b border-neutral-400 pb-1">
                <h3 className="print-label text-sm font-semibold">{zone}</h3>
                <span className="text-[10px] uppercase tracking-wide text-neutral-600">
                  {requiredClassLabel(sizeClass)}
                </span>
              </div>
              <div className="kennel-map-print-room-grid">
                {zoneRooms.map((room) => {
                  const occupied = occByRoom.get(room.id);
                  return (
                    <div
                      key={room.id}
                      className={`kennel-map-print-room print-keep-color ${
                        occupied ? "kennel-map-print-room-occupied" : "kennel-map-print-room-empty"
                      }`}
                    >
                      <div className="font-semibold leading-tight">{kennelMapRoomLabel(room)}</div>
                      <div className="mt-0.5 truncate text-[10px] text-neutral-700">
                        {occupied ? kennelMapOccupantLabel(occupied) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      <style>{`
        .kennel-map-print-layout {
          display: grid;
          grid-template-columns: minmax(14rem, 22rem) minmax(0, 1fr);
          gap: 1rem;
          align-items: start;
        }

        .kennel-map-print-table {
          border: 1px solid #374151;
        }
        .kennel-map-print-th {
          border: 1px solid #374151;
          padding: 4px 6px;
          text-align: left;
          font-size: 10px;
          font-weight: 700;
          background: #e8e8e8;
        }
        .kennel-map-print-td {
          border: 1px solid #9ca3af;
          padding: 4px 6px;
          vertical-align: top;
        }

        .kennel-map-print-room-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(4.75rem, 1fr));
          gap: 4px;
        }
        .kennel-map-print-room {
          min-height: 2.75rem;
          border: 1px solid #9ca3af;
          padding: 4px;
          line-height: 1.2;
        }
        .kennel-map-print-room-occupied {
          border-color: #2563eb;
          background: #dbeafe;
        }
        .kennel-map-print-room-empty {
          background: #fff;
        }

        @media print {
          .kennel-map-print-layout {
            grid-template-columns: minmax(12rem, 18rem) minmax(0, 1fr);
            gap: 0.75rem;
          }
          .kennel-map-print-room-occupied {
            background: #dbeafe !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .kennel-map-print-th {
            background: #e8e8e8 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}

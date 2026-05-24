import type { ReactNode } from "react";
import type { Database } from "@/integrations/supabase/types";
import {
  sortImportPlaceholderRooms,
  IMPORT_PLACEHOLDER_ROW_BG,
} from "@/lib/boardingUnknownKennel";

type Room = Database["public"]["Tables"]["rooms"]["Row"];

type Props = {
  placeholderRooms: Room[];
  roomColW: number;
  dayColW: number;
  daysWidth: number;
  renderRoomRow: (roomId: string, isPlaceholder: boolean) => ReactNode;
};

export function UnknownKennelCalendarSection({
  placeholderRooms,
  roomColW,
  dayColW,
  daysWidth,
  renderRoomRow,
}: Props) {
  const sortedPlaceholders = sortImportPlaceholderRooms(placeholderRooms);
  if (sortedPlaceholders.length === 0) return null;

  return (
    <div className="border-t-2 border-amber-300/80">
      <div
        className={`flex sticky left-0 ${IMPORT_PLACEHOLDER_ROW_BG} border-b border-amber-200`}
        style={{ minWidth: roomColW + daysWidth }}
      >
        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-900">
          Unknown kennel — assign real room (imported)
        </div>
      </div>

      {sortedPlaceholders.map((room) => (
        <div key={room.id} className="flex">
          <div
            style={{ minWidth: roomColW, width: roomColW }}
            className={`shrink-0 border-r border-b border-amber-100 flex items-center px-3 text-sm ${IMPORT_PLACEHOLDER_ROW_BG}`}
          >
            <span className="truncate" title={room.display_name}>
              <span className="font-medium text-amber-950">{room.display_name}</span>
              <span className="ml-1.5 text-[10px] text-amber-700/80">UNK</span>
            </span>
          </div>
          {renderRoomRow(room.id, true)}
        </div>
      ))}
    </div>
  );
}

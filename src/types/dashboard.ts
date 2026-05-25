export type DashboardMetrics = {
  as_of: string;
  today: {
    check_ins: number;
    check_outs: number;
    daycare_attending: number;
    grooming_appointments: number;
    assessments_scheduled: number;
  };
  occupancy: {
    /** Kennel rooms with a guest + unassigned guests on site (capacity used). */
    boarding_occupied: number;
    boarding_rooms_occupied: number;
    boarding_unassigned_guests: number;
    boarding_total_rooms: number;
    cattery_occupied: number;
    cattery_total_rooms: number;
  };
  alerts: {
    overdue_invoices_count: number;
    overdue_invoices_aed: number;
    outstanding_invoices_count: number;
    outstanding_invoices_aed: number;
    low_wallet_members: number;
    pets_unassessed: number;
    vaccinations_expiring_30d: number;
    vaccinations_expired: number;
  };
  financial_7d: {
    invoiced: number;
    collected: number;
    refunded: number;
  };
};

export type ScheduleItem = {
  bookingId: string;
  petId: string | null;
  ownerId: string;
  petName: string;
  ownerName: string;
  roomNumber: string | null;
  time: string | null;
  sortKey: string;
};

export type ParkSlotItem = {
  id: string;
  slotStart: string;
  slotEnd: string;
  sizeLane: "small" | "big";
  isAssessment: boolean;
  petId: string | null;
  ownerId: string | null;
  petName: string;
  ownerInitials: string;
};

export type TodaySchedule = {
  check_ins: ScheduleItem[];
  check_outs: ScheduleItem[];
  daycare: ScheduleItem[];
  park: ParkSlotItem[];
  grooming: ScheduleItem[];
  assessments: ParkSlotItem[];
};

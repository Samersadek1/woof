import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type BookingItem = Database["public"]["Tables"]["booking_items"]["Row"];
type BookingItemInsert = Database["public"]["Tables"]["booking_items"]["Insert"];
type BookingItemUpdate = Database["public"]["Tables"]["booking_items"]["Update"];

export const bookingItemsQueryKeys = {
  list: (bookingId: string) => ["booking-items", bookingId] as const,
};

export function useBookingItems(bookingId: string) {
  return useQuery({
    queryKey: bookingItemsQueryKeys.list(bookingId),
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_items")
        .select("*")
        .eq("booking_id", bookingId)
        .order("category", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as BookingItem[];
    },
  });
}

export function useCreateBookingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (row: BookingItemInsert) => {
      const { data, error } = await supabase
        .from("booking_items")
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data as BookingItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: bookingItemsQueryKeys.list(data.booking_id),
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useUpdateBookingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: BookingItemUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("booking_items")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as BookingItem;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: bookingItemsQueryKeys.list(data.booking_id),
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

export function useDeleteBookingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, bookingId }: { id: string; bookingId: string }) => {
      const { error } = await supabase.from("booking_items").delete().eq("id", id);
      if (error) throw error;
      return { bookingId };
    },
    onSuccess: ({ bookingId }) => {
      queryClient.invalidateQueries({
        queryKey: bookingItemsQueryKeys.list(bookingId),
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function assertPhotoSize(file: File) {
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Photo must be 10MB or smaller");
  }
}

/**
 * Uploads to `booking-item-photos/{bookingId}/{itemId}/...` and appends public URL to `photo_urls`.
 */
export function useUploadItemPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      bookingId,
      itemId,
      file,
    }: {
      bookingId: string;
      itemId: string;
      file: File;
    }) => {
      assertPhotoSize(file);
      const safe = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const path = `${bookingId}/${itemId}/${safe}`;
      const { error: upErr } = await supabase.storage
        .from("booking-item-photos")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("booking-item-photos").getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { data: row, error: selErr } = await supabase
        .from("booking_items")
        .select("photo_urls")
        .eq("id", itemId)
        .single();
      if (selErr) throw selErr;
      const next = [...(row.photo_urls ?? []), publicUrl];
      const { error: updErr } = await supabase
        .from("booking_items")
        .update({ photo_urls: next })
        .eq("id", itemId);
      if (updErr) throw updErr;
      return publicUrl;
    },
    onSuccess: (_url, v) => {
      queryClient.invalidateQueries({
        queryKey: bookingItemsQueryKeys.list(v.bookingId),
      });
    },
  });
}

/** For rows not yet inserted — path `bookingId/staged/{stagedKey}/...` */
export function useUploadStagedItemPhoto() {
  return useMutation({
    mutationFn: async ({
      bookingId,
      stagedKey,
      file,
    }: {
      bookingId: string;
      stagedKey: string;
      file: File;
    }) => {
      assertPhotoSize(file);
      const safe = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const path = `${bookingId}/staged/${stagedKey}/${safe}`;
      const { error: upErr } = await supabase.storage
        .from("booking-item-photos")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("booking-item-photos").getPublicUrl(path);
      return pub.publicUrl as string;
    },
  });
}

export async function uploadOverviewPhoto(bookingId: string, file: File): Promise<string> {
  assertPhotoSize(file);
  const safe = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const path = `${bookingId}/overview/${safe}`;
  const { error: upErr } = await supabase.storage
    .from("booking-item-photos")
    .upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("booking-item-photos").getPublicUrl(path);
  return pub.publicUrl as string;
}

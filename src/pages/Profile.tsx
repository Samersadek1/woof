import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import TopBar from "@/components/dashboard/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { StaffRow, StaffRole } from "@/hooks/useStaff";

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  management: "Management",
  booking_coordinator: "Booking coordinator",
  groomer: "Groomer",
  kennel_staff: "Kennel staff",
  night_staff: "Night staff",
};

const ProfilePage = () => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
  });

  const staffQuery = useQuery({
    queryKey: ["my_staff_profile", user?.email ?? ""],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("email", user!.email!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as StaffRow | null;
    },
  });

  const staff = staffQuery.data;
  useEffect(() => {
    if (!staff) return;
    setForm({
      first_name: staff.first_name ?? "",
      last_name: staff.last_name ?? "",
      phone: staff.phone ?? "",
    });
  }, [staff]);

  const saveProfile = async () => {
    if (!staff?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("staff")
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
      })
      .eq("id", staff.id);
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to save profile.");
      return;
    }
    await staffQuery.refetch();
    toast.success("Profile updated.");
  };

  return (
    <>
      <TopBar title="My Profile" />
      <main className="flex-1 overflow-auto p-8">
        {staffQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading profile...
          </div>
        ) : !staff ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No staff profile found for <span className="font-medium">{user?.email ?? "current user"}</span>.
            </CardContent>
          </Card>
        ) : (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Account details</span>
                <Badge variant={staff.active ? "default" : "secondary"}>
                  {staff.active ? "Active" : "Inactive"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First name</Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={staff.email ?? ""} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Input value={ROLE_LABELS[staff.role]} disabled />
              </div>
              <Button onClick={saveProfile} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save profile
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
};

export default ProfilePage;

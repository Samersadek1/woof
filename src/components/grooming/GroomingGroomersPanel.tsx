import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateGroomingGroomer,
  useDeactivateGroomingGroomer,
  useGroomingGroomers,
} from "@/hooks/useGroomingGroomers";
import { toast } from "sonner";

export function GroomingGroomersPanel() {
  const { data: groomers = [], isLoading } = useGroomingGroomers();
  const createGroomer = useCreateGroomingGroomer();
  const deactivateGroomer = useDeactivateGroomingGroomer();
  const [newName, setNewName] = useState("");

  const addGroomer = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Enter a groomer name.");
      return;
    }
    createGroomer.mutate(trimmed, {
      onSuccess: () => {
        toast.success("Groomer added.");
        setNewName("");
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add groomer."),
    });
  };

  return (
    <section
      className="rounded-lg border bg-card p-4 space-y-3"
      data-testid="grooming-groomers-panel"
    >
      <div>
        <h3 className="text-sm font-semibold">Groomers</h3>
        <p className="text-xs text-muted-foreground">
          Names appear in the groomer dropdown on new and edited appointments.
        </p>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading groomers…
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {groomers.map((g) => (
            <li
              key={g.id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-sm"
            >
              <span>{g.name}</span>
              {!g.id.startsWith("fallback-") ? (
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  aria-label={`Remove ${g.name}`}
                  data-testid={`grooming-groomer-remove-${g.id}`}
                  disabled={deactivateGroomer.isPending}
                  onClick={() =>
                    deactivateGroomer.mutate(g.id, {
                      onSuccess: () => toast.success(`${g.name} removed from list.`),
                      onError: (e) =>
                        toast.error(e instanceof Error ? e.message : "Could not remove groomer."),
                    })
                  }
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1 min-w-[12rem] flex-1">
          <Label htmlFor="grooming-new-groomer-name" className="text-xs">
            Add groomer
          </Label>
          <Input
            id="grooming-new-groomer-name"
            data-testid="grooming-new-groomer-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGroomer();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="grooming-add-groomer-btn"
          disabled={createGroomer.isPending}
          onClick={addGroomer}
        >
          {createGroomer.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="ml-1">Add</span>
        </Button>
      </div>
    </section>
  );
}

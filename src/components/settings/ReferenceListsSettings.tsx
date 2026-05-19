import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  useAddDogBreed,
  useDeleteDogBreed,
  useDogBreedsQuery,
} from "@/hooks/useReferenceLists";

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "Something went wrong";
}

export function ReferenceListsSettings() {
  const [breedNew, setBreedNew] = useState("");
  const [deletingBreedId, setDeletingBreedId] = useState<string | null>(null);

  const breedsQ = useDogBreedsQuery();
  const addBreed = useAddDogBreed();
  const delBreed = useDeleteDogBreed();

  const breeds = breedsQ.data ?? [];

  function submitBreed() {
    const name = breedNew.trim();
    if (!name) return;
    addBreed.mutate(name, {
      onSuccess: () => {
        setBreedNew("");
        toast.success("Breed added");
      },
      onError: (e) => toast.error(extractErrorMessage(e)),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Dog breeds</h2>
      <p className="text-sm text-muted-foreground">
        Used in Add Pet and pet profile breed dropdowns. Vet clinics are managed under Settings → Vets.
      </p>
      {breedsQ.isError && (
        <Alert variant="destructive">
          <AlertTitle>Could not load breeds</AlertTitle>
          <AlertDescription>
            {extractErrorMessage(breedsQ.error)}. If this is the first time, run{" "}
            <code className="rounded bg-muted px-1 text-xs">sql/create-reference-lists.sql</code> and{" "}
            <code className="rounded bg-muted px-1 text-xs">sql/seed-reference-lists.sql</code> in the Supabase SQL
            editor.
          </AlertDescription>
        </Alert>
      )}
      <motionBreedForm
        breedNew={breedNew}
        setBreedNew={setBreedNew}
        submitBreed={submitBreed}
        breedsQ={breedsQ}
        addBreed={addBreed}
      />
      {breedsQ.isLoading ? (
        <Skeleton className="h-72 w-full rounded-md" />
      ) : (
        <ScrollArea className="h-72 rounded-md border">
          <ul className="divide-y p-2">
            {breeds.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">No breeds yet.</li>
            ) : (
              breeds.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 py-2 px-1">
                  <span className="text-sm break-words pr-2">{row.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    aria-label={`Delete ${row.name}`}
                    disabled={deletingBreedId !== null}
                    onClick={() => {
                      setDeletingBreedId(row.id);
                      delBreed.mutate(row.id, {
                        onSuccess: () => toast.success("Breed removed"),
                        onError: (e) => toast.error(extractErrorMessage(e)),
                        onSettled: () => setDeletingBreedId(null),
                      });
                    }}
                  >
                    {deletingBreedId === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      )}
      <p className="text-xs text-muted-foreground">
        {breeds.length} breed{breeds.length !== 1 ? "s" : ""} in the list.
      </p>
    </div>
  );
}

function motionBreedForm({
  breedNew,
  setBreedNew,
  submitBreed,
  breedsQ,
  addBreed,
}: {
  breedNew: string;
  setBreedNew: (v: string) => void;
  submitBreed: () => void;
  breedsQ: ReturnType<typeof useDogBreedsQuery>;
  addBreed: ReturnType<typeof useAddDogBreed>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Input
        placeholder="New breed name"
        value={breedNew}
        onChange={(e) => setBreedNew(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submitBreed();
          }
        }}
        className="max-w-md flex-1 min-w-[12rem]"
        disabled={breedsQ.isLoading || addBreed.isPending}
      />
      <Button
        type="button"
        onClick={() => void submitBreed()}
        disabled={!breedNew.trim() || breedsQ.isLoading || addBreed.isPending}
      >
        {addBreed.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Adding…
          </>
        ) : (
          "Add breed"
        )}
      </Button>
    </div>
  );
}

/**
 * PetDocuments
 *
 * Manages a gallery of passport / document images stored per pet in Supabase
 * Storage under the path  pet-photos/passports/{petId}/
 *
 * - Lists all uploaded files for the pet
 * - Shows image thumbnails (inline) or a file-icon for PDFs
 * - Multi-file upload button
 * - Delete button per image
 */

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Upload, Trash2, FileText, Loader2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StorageFile {
  name: string;
  publicUrl: string;
  isImage: boolean;
}

const BUCKET = "pet-photos";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ACCEPTED_TYPES = /^image\/|application\/pdf$/;
const ACCEPTED_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|pdf)$/i;

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.test(file.type)) return true;
  return ACCEPTED_EXT.test(file.name);
}

function acceptedFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter(isAcceptedFile);
}

function passportFolder(petId: string) {
  return `passports/${petId}`;
}

async function listFiles(petId: string): Promise<StorageFile[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(passportFolder(petId), { sortBy: { column: "created_at", order: "asc" } });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  return data
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => {
      const path = `${passportFolder(petId)}/${f.name}`;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const lower = f.name.toLowerCase();
      const isImage = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/.test(lower);
      return { name: f.name, publicUrl: urlData.publicUrl, isImage };
    });
}

interface PetDocumentsProps {
  petId: string;
}

export function PetDocuments({ petId }: PetDocumentsProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const queryKey = ["pet-documents", petId];

  const { data: files, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFiles(petId),
  });

  const uploadFiles = async (raw: FileList | File[] | null) => {
    const selected = acceptedFiles(raw ?? []);
    if (!selected.length) {
      if (raw?.length) {
        toast.error("Only images and PDFs can be uploaded.");
      }
      return;
    }

    setUploading(true);
    let successCount = 0;

    for (const file of selected) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is too large (max 50 MB).`);
        continue;
      }
      const safeName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const path = `${passportFolder(petId)}/${safeName}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false });

      if (error) {
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
      } else {
        successCount++;
      }
    }

    setUploading(false);

    if (fileInputRef.current) fileInputRef.current.value = "";

    if (successCount > 0) {
      toast.success(
        successCount === 1
          ? "1 document uploaded"
          : `${successCount} documents uploaded`
      );
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (uploading) return;
    void uploadFiles(e.dataTransfer.files);
  };

  const handleDelete = async (fileName: string) => {
    setDeletingName(fileName);
    const path = `${passportFolder(petId)}/${fileName}`;
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    setDeletingName(null);

    if (error) {
      toast.error("Delete failed: " + error.message);
    } else {
      toast.success("Document removed");
      queryClient.invalidateQueries({ queryKey });
    }
  };

  return (
    <div
      className={cn(
        "space-y-4 rounded-lg transition-colors",
        isDragOver && "ring-2 ring-primary ring-offset-2 bg-primary/5"
      )}
      data-testid="pet-passport-dropzone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Upload button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : files?.length
            ? `${files.length} document${files.length !== 1 ? "s" : ""}`
            : "No documents yet"}
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {uploading ? "Uploading…" : "Upload"}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          data-testid="pet-passport-upload"
          onChange={handleUpload}
        />
      </div>

      {/* Gallery */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : files && files.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground text-center">
            Drop more images or PDFs anywhere in this area
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((file) => (
            <div
              key={file.name}
              className="relative group rounded-lg border overflow-hidden bg-muted/30"
            >
              {file.isImage ? (
                <a
                  href={file.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square"
                >
                  <img
                    src={file.publicUrl}
                    alt={file.name}
                    className="w-full h-full object-cover transition-opacity group-hover:opacity-80"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove("hidden");
                    }}
                  />
                  <div className="hidden absolute inset-0 flex items-center justify-center">
                    <ImageOff className="h-8 w-8 text-muted-foreground" />
                  </div>
                </a>
              ) : (
                <a
                  href={file.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex aspect-square items-center justify-center flex-col gap-1 p-3 hover:bg-muted/60 transition-colors"
                >
                  <FileText className="h-10 w-10 text-muted-foreground" />
                  <span className="text-[10px] text-center text-muted-foreground break-all line-clamp-2">
                    {file.name}
                  </span>
                </a>
              )}

              {/* Delete button — visible on hover */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow hover:bg-destructive hover:text-white"
                    disabled={deletingName === file.name}
                  >
                    {deletingName === file.name ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete document?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove <strong>{file.name}</strong> from storage. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleDelete(file.name)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "rounded-lg border border-dashed p-8 text-center transition-colors",
            isDragOver && "border-primary bg-primary/5"
          )}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Drop passport photos or vaccination booklet images here, or choose files
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose files
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { PhotoAlbum } from "@prisma/client";
import { Upload, Trash2, Star, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/browser";
import { compressImage } from "@/lib/image-compression";
import { uploadPhotoFromBrowser } from "@/lib/storage";
import { toast } from "@/lib/hooks/use-toast";
import {
  createPhotoRecord,
  deletePhotoById,
  togglePortfolio,
} from "@/lib/actions/fotos";

type Photo = {
  id: string;
  storagePath: string;
  album: PhotoAlbum;
  caption: string | null;
  isPortfolio: boolean;
  signedUrl: string | null;
};

const ALBUM_LABELS: Record<PhotoAlbum, string> = {
  ANTES: "Antes",
  DURANTE: "Durante",
  DEPOIS: "Depois",
};

export function PhotosTab({
  obraId,
  photos,
}: {
  obraId: string;
  photos: Photo[];
}) {
  const [selectedAlbum, setSelectedAlbum] = useState<PhotoAlbum>("DURANTE");
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);

  const grouped: Record<PhotoAlbum, Photo[]> = {
    ANTES: photos.filter((p) => p.album === "ANTES"),
    DURANTE: photos.filter((p) => p.album === "DURANTE"),
    DEPOIS: photos.filter((p) => p.album === "DEPOIS"),
  };

  async function handleUpload() {
    if (!files || files.length === 0) return;
    setUploading(true);
    const arr = Array.from(files);
    setProgress({ done: 0, total: arr.length });
    const supabase = createClient();
    try {
      for (let i = 0; i < arr.length; i++) {
        const compressed = await compressImage(arr[i]);
        const { path } = await uploadPhotoFromBrowser(supabase, obraId, compressed);
        await createPhotoRecord({
          obraId,
          storagePath: path,
          album: selectedAlbum,
          caption: caption || null,
          isPortfolio: false,
        });
        setProgress({ done: i + 1, total: arr.length });
      }
      toast({ title: `${arr.length} foto(s) enviada(s)` });
      setFiles(null);
      setCaption("");
      const input = document.getElementById("photo-input") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (e: any) {
      toast({
        title: "Erro no upload",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4" /> Adicionar fotos
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Album</Label>
              <Select
                value={selectedAlbum}
                onValueChange={(v) => setSelectedAlbum(v as PhotoAlbum)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANTES">Antes</SelectItem>
                  <SelectItem value="DURANTE">Durante</SelectItem>
                  <SelectItem value="DEPOIS">Depois</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Legenda (opcional)</Label>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Aplicada a todas as fotos"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Selecionar fotos</Label>
            <Input
              id="photo-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(e.target.files)}
            />
          </div>
          {progress && (
            <p className="text-sm text-muted-foreground">
              Comprimindo e enviando {progress.done} de {progress.total}...
            </p>
          )}
          <Button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !files || files.length === 0}
          >
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar
          </Button>
        </CardContent>
      </Card>

      {(["ANTES", "DURANTE", "DEPOIS"] as PhotoAlbum[]).map((alb) => (
        <section key={alb} className="space-y-2">
          <h3 className="font-semibold">
            {ALBUM_LABELS[alb]} ({grouped[alb].length})
          </h3>
          {grouped[alb].length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem fotos.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {grouped[alb].map((p) => (
                <PhotoTile key={p.id} photo={p} onView={() => setViewing(p)} />
              ))}
            </div>
          )}
        </section>
      ))}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black">
          {viewing?.signedUrl && (
            <div className="relative">
              <img
                src={viewing.signedUrl}
                alt={viewing.caption ?? ""}
                className="w-full max-h-[85vh] object-contain"
              />
              {viewing.caption && (
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white p-3 text-sm">
                  {viewing.caption}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhotoTile({ photo, onView }: { photo: Photo; onView: () => void }) {
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Excluir esta foto?")) return;
    startTransition(async () => {
      try {
        await deletePhotoById(photo.id);
      } catch (e: any) {
        toast({
          title: "Erro",
          description: e?.message,
          variant: "destructive",
        });
      }
    });
  }

  function handleTogglePortfolio(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      try {
        await togglePortfolio(photo.id, !photo.isPortfolio);
      } catch (e: any) {
        toast({
          title: "Erro",
          description: e?.message,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="relative group aspect-square rounded-md overflow-hidden bg-muted">
      {photo.signedUrl ? (
        <button onClick={onView} className="w-full h-full">
          <img
            src={photo.signedUrl}
            alt={photo.caption ?? ""}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      ) : (
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Indisponivel
        </div>
      )}
      <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleTogglePortfolio}
          disabled={pending}
          className="bg-black/60 text-white p-1.5 rounded"
          title={photo.isPortfolio ? "Tirar do portfolio" : "Usar no portfolio"}
        >
          <Star
            className={`h-3.5 w-3.5 ${
              photo.isPortfolio ? "fill-amber-400 text-amber-400" : ""
            }`}
          />
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="bg-destructive/80 text-white p-1.5 rounded"
          title="Excluir"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {photo.isPortfolio && (
        <div className="absolute top-1 left-1 bg-amber-500 text-white p-1 rounded">
          <Star className="h-3 w-3 fill-current" />
        </div>
      )}
    </div>
  );
}

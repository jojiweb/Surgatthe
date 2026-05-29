import { Skeleton } from "@/components/ui/skeleton";

export default function DiaNovoLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-1 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-28 rounded-full shrink-0" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

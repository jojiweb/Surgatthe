import { Skeleton } from "@/components/ui/skeleton";

export default function ObraDetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

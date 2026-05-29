import { Skeleton } from "@/components/ui/skeleton";

export default function SalariosLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid md:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-80" />
        ))}
      </div>
    </div>
  );
}

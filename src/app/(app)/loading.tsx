import { Skeleton } from "@/components/ui/skeleton";

export default function AppSegmentLoading() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-16" />
        </div>
        <div className="hidden md:block overflow-auto border rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Project</th>
                <th className="text-left p-2">Task</th>
                <th className="text-right p-2">Hours</th>
                <th className="text-left p-2">Notes</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="p-2">
                    <Skeleton className="h-4 w-40" />
                  </td>
                  <td className="p-2">
                    <Skeleton className="h-4 w-32" />
                  </td>
                  <td className="p-2 text-right">
                    <Skeleton className="h-4 w-14 ml-auto" />
                  </td>
                  <td className="p-2">
                    <Skeleton className="h-4 w-full" />
                  </td>
                  <td className="p-2 text-right">
                    <Skeleton className="h-8 w-8 ml-auto rounded" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


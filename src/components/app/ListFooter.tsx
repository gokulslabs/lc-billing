import { PAGE_SIZE } from "@/lib/paging";
import { Button } from "@/components/ui/button";

export function ListFooter({
  page,
  total,
  shown,
  onPage,
}: {
  page: number;
  total: number;
  shown: number;
  onPage: (page: number) => void;
}) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>
        Showing {shown.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {pages.toLocaleString("en-IN")}
          </span>
          <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

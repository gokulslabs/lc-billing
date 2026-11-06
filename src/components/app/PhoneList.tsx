import type { ReactNode } from "react";

export function PhoneCards({ children }: { children: ReactNode }) {
  return <div className="space-y-3 md:hidden">{children}</div>;
}

export function DeskTable({ children }: { children: ReactNode }) {
  return <div className="hidden rounded-2xl border border-border bg-card md:block">{children}</div>;
}

export function PhoneCard({
  title,
  detail,
  children,
}: {
  title: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="text-base font-medium leading-snug">{title}</div>
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
      {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </article>
  );
}

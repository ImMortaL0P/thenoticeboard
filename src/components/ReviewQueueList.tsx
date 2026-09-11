"use client";

import Link from "next/link";
import { formatDate } from "@/lib/domain";

type Props = {
  id: string;
  title: string;
  orgShortName: string;
  sourceName: string | null;
  origin: string;
  advertisementNo: string | null;
  totalVacancies: number | null;
  minQualification: string;
  applyLast: string | null;
  createdAt: string;
  maxAge: number | null;
  rejectReason: string | null;
};

const qualLabels: Record<string, string> = {
  any: "Any",
  "10th": "10th pass",
  "12th": "12th pass",
  diploma: "Diploma",
  graduate: "Graduate",
  engineering: "Engineering",
  postgraduate: "Post-grad",
  phd: "PhD",
};

export function ReviewQueueList(props: Props) {
  return (
    <Link
      href={`/admin/review/${props.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {props.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">{props.orgShortName}</span>
          {props.sourceName && <span>{props.sourceName}</span>}
          <span className="rounded bg-[var(--bg-card)] p-0.5 px-1.5 ring-1 ring-border capitalize">
            {props.origin}
          </span>
          {props.rejectReason && (
            <span className="max-w-[24rem] truncate rounded bg-red-50 p-0.5 px-1.5 text-red-700 ring-1 ring-red-200">
              {props.rejectReason}
            </span>
          )}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-3 text-right text-xs text-muted-foreground md:flex">
        {props.advertisementNo && <span className="rounded bg-muted px-1.5 py-0.5">{props.advertisementNo}</span>}
        {props.totalVacancies && <span>{props.totalVacancies} posts</span>}
        <span>{qualLabels[props.minQualification] ?? props.minQualification}</span>
        {typeof props.maxAge === "number" && <span>≤{props.maxAge} yr</span>}
        <span>{props.applyLast ? `by ${formatDate(props.applyLast)}` : "—"}</span>
        <span>{formatDate(props.createdAt)}</span>
      </div>
      <span className="text-muted-foreground">→</span>
    </Link>
  );
}
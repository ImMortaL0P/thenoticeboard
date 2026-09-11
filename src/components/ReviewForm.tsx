"use client";

import { useState, useActionState, type ReactNode } from "react";
import { saveDraftAction, approveAction, rejectAction, type ActionState } from "@/app/admin/actions";

type ReviewDefaults = {
  title: string;
  titleHi: string;
  summary: string;
  summaryHi: string;
  advertisementNo: string;
  postNames: string;
  totalVacancies: number;
  minQualification: string;
  qualificationDetails: string;
  minAge: number;
  maxAge: number;
  ageCutoffDate: string;
  applyLast: string;
  feeLast: string;
  examDate: string;
  admitCardDate: string;
  resultDate: string;
  notificationDate: string;
  state: string;
  location: string;
  payLevel: string;
  selectionProcess: string;
  applyUrl: string;
  officialNotificationPdfUrl: string;
  officialSourceUrl: string;
  feeGeneral: number;
  feeReserved: number;
  feeOther: string;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="input" />;
}

export function ReviewForm({
  defaults,
  id,
  extractionMethod,
}: {
  defaults: ReviewDefaults;
  id: string;
  extractionMethod: string | null;
}) {
  const [showReject, setShowReject] = useState(false);
  const [saveState, saveFormAction, savePending] = useActionState<ActionState, FormData>(saveDraftAction, undefined);
  const [approveState, approveFormAction, approvePending] = useActionState<ActionState, FormData>(approveAction, undefined);
  const [rejectState, rejectFormAction, rejectPending] = useActionState<ActionState, FormData>(rejectAction, undefined);

  const quals = [
    "any", "10th", "12th", "diploma", "graduate", "engineering", "postgraduate", "phd",
  ] as const;

  const state = approveState?.message ?? approveState?.error ?? saveState?.message ?? saveState?.error ?? rejectState?.message ?? rejectState?.error;

  return (
    <form id="review-form" className="card p-5">
      {extractionMethod === "rules" && (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Extracted automatically by rules, please check dates, vacancies and fees against the official
          notification before approving.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Title (English)">
          <TextInput name="title" defaultValue={defaults.title} required />
        </Field>
        <Field label="Title (Hindi)">
          <TextInput name="titleHi" defaultValue={defaults.titleHi} />
        </Field>
        <Field label="Advertisement no.">
          <TextInput name="advertisementNo" defaultValue={defaults.advertisementNo} />
        </Field>
        <Field label="Post names (comma-separated)">
          <TextInput name="postNames" defaultValue={defaults.postNames} />
        </Field>
        <Field label="Total vacancies">
          <TextInput name="totalVacancies" type="number" min={1} defaultValue={defaults.totalVacancies || ""} />
        </Field>
        <Field label="Minimum qualification">
          <select name="minQualification" defaultValue={defaults.minQualification} className="input">
            {quals.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </Field>
        <Field label="Qualification details">
          <TextInput name="qualificationDetails" defaultValue={defaults.qualificationDetails} />
        </Field>
        <Field label="State">
          <TextInput name="state" defaultValue={defaults.state} />
        </Field>
        <Field label="Location">
          <TextInput name="location" defaultValue={defaults.location} />
        </Field>
        <Field label="Pay level">
          <TextInput name="payLevel" defaultValue={defaults.payLevel} />
        </Field>
        <Field label="Selection process">
          <TextInput name="selectionProcess" defaultValue={defaults.selectionProcess} />
        </Field>
        <Field label="Fee - general (₹)">
          <TextInput name="feeGeneral" type="number" min={0} defaultValue={defaults.feeGeneral || ""} />
        </Field>
        <Field label="Fee - SC/ST/PwBD (₹)">
          <TextInput name="feeReserved" type="number" min={0} defaultValue={defaults.feeReserved || ""} />
        </Field>
        <Field label="Fee - other notes">
          <TextInput name="feeOther" defaultValue={defaults.feeOther} />
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key dates (YYYY-MM-DD)</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Notification date">
            <TextInput name="notificationDate" defaultValue={defaults.notificationDate} placeholder="2026-09-01" />
          </Field>
          <Field label="Apply last">
            <TextInput name="applyLast" defaultValue={defaults.applyLast} placeholder="2026-09-30" />
          </Field>
          <Field label="Fee last">
            <TextInput name="feeLast" defaultValue={defaults.feeLast} placeholder="2026-09-28" />
          </Field>
          <Field label="Exam date">
            <TextInput name="examDate" defaultValue={defaults.examDate} placeholder="2026-11-15" />
          </Field>
          <Field label="Admit card">
            <TextInput name="admitCardDate" defaultValue={defaults.admitCardDate} />
          </Field>
          <Field label="Result">
            <TextInput name="resultDate" defaultValue={defaults.resultDate} />
          </Field>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Age</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Min age">
            <TextInput name="minAge" type="number" min={0} defaultValue={defaults.minAge || ""} />
          </Field>
          <Field label="Max age">
            <TextInput name="maxAge" type="number" min={0} defaultValue={defaults.maxAge || ""} />
          </Field>
          <Field label="Age cutoff date">
            <TextInput name="ageCutoffDate" defaultValue={defaults.ageCutoffDate} placeholder="2026-09-01" />
          </Field>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary & links</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Summary (English)">
            <textarea name="summary" defaultValue={defaults.summary} rows={2} className="input resize-y" />
          </Field>
          <Field label="Summary (Hindi)">
            <textarea name="summaryHi" defaultValue={defaults.summaryHi} rows={2} className="input resize-y" />
          </Field>
          <Field label="Apply URL">
            <TextInput name="applyUrl" defaultValue={defaults.applyUrl} placeholder="https://…" />
          </Field>
          <Field label="Official PDF URL">
            <TextInput name="officialNotificationPdfUrl" defaultValue={defaults.officialNotificationPdfUrl} placeholder="https://…" />
          </Field>
          <Field label="Source URL">
            <TextInput name="officialSourceUrl" defaultValue={defaults.officialSourceUrl} placeholder="https://…" />
          </Field>
        </div>
      </div>

      <input type="hidden" name="id" value={id} />

      {state && (
        <p className={`mt-4 text-sm font-medium ${approveState?.error || saveState?.error || rejectState?.error ? "text-destructive" : "text-emerald-600"}`}>
          {state}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button form="review-form" className="btn btn-outline" disabled={savePending} formAction={saveFormAction}>
          {savePending ? "Saving…" : "Save draft"}
        </button>
        <button
          form="review-form"
          className="btn btn-primary"
          disabled={approvePending}
          formAction={approveFormAction}
        >
          {approvePending ? "Approving…" : "Approve & publish"}
        </button>
        {!showReject ? (
          <button type="button" className="btn btn-outline !border-red-200 !text-red-700 hover:!bg-red-50" onClick={() => setShowReject(true)}>
            Reject…
          </button>
        ) : (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              name="rejectReason"
              className="input flex-1"
              placeholder="Reason (required)"
              required
            />
            <button
              form="review-form"
              className="btn !border-red-300 bg-red-50 !text-red-700 hover:bg-red-100"
              disabled={rejectPending}
              formAction={rejectFormAction}
            >
              {rejectPending ? "Rejecting…" : "Reject"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
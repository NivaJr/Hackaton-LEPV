import { z } from "zod";

export class SchoolReportError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "SchoolReportError";
  }
}

/** Vercel rejects larger request bodies before they reach the route. */
export const MAX_REPORT_BYTES = 4 * 1024 * 1024;
export const MAX_REPORT_LABEL = 80;

export const ReportLabelSchema = z.string().trim().min(1).max(MAX_REPORT_LABEL);

export interface SchoolReportFile { id: string; label: string; uploadedAt: string; sizeBytes: number; }

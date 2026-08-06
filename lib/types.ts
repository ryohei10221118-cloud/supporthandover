export type CaseStatus = "pending" | "replied" | "Move to HO" | "Follow up" | "Closed" | string;

export interface CaseRow {
  seq: string;
  date: string;
  op: string;
  note: string;
  department: string;
  cs: string;
  reply: string;
  status: CaseStatus;
  issue: string;
  isClosed: boolean;
  isOverdue: boolean;
  daysOpen: number | null;
}

export type CaseStatus = "pending" | "replied" | "Move to HO" | "Follow up" | "Closed" | string;

export interface CaseRow {
  rowIndex: number;
  seq: string;
  date: string;
  op: string;
  note: string;
  department: string;
  cs: string;
  priority: string;
  reply: string;
  status: CaseStatus;
  issue: string;
  isClosed: boolean;
  isCompleted: boolean;
  isOverdue: boolean;
  daysOpen: number | null;
}

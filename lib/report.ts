import { fmtDateTime, fmtDay, fmtDuration, fmtHours, fmtLongDay } from "./time";
import { countedHours, displayStatus, type Profile, type Task } from "./types";

const label: Record<string, string> = {
  pending: "Pending",
  submitted: "Awaiting approval",
  approved: "Approved",
  overdue: "Overdue",
  rejected: "Rejected",
  discarded: "Discarded",
};

function rows(tasks: Task[]) {
  return tasks.map((t) => {
    const late = t.completed_late && t.submitted_at
      ? `Late by ${fmtDuration(Math.max(0, new Date(t.submitted_at).getTime() - new Date(t.due_at).getTime()))}`
      : t.submitted_at
        ? "On time"
        : t.status === "overdue"
          ? `Overdue by ${fmtDuration(Date.now() - new Date(t.due_at).getTime())}`
          : "";
    return [
      fmtDay(t.planned_start_at),
      t.title,
      fmtDateTime(t.due_at, true),
      t.submitted_at ? fmtDateTime(t.submitted_at, true) : "-",
      fmtHours(t.estimated_hours),
      t.credited_hours != null ? fmtHours(t.credited_hours) : "-",
      label[displayStatus(t)],
      late,
    ];
  });
}

function summary(tasks: Task[]) {
  const approved = tasks.filter((t) => t.status === "approved");
  const finished = tasks.filter((t) => t.status === "approved" || t.status === "submitted");
  const onTime = finished.filter((t) => !t.completed_late).length;
  return {
    total: tasks.length,
    approved: approved.length,
    approvedHours: approved.reduce((s, t) => s + countedHours(t), 0),
    plannedHours: tasks.reduce((s, t) => s + t.estimated_hours, 0),
    onTime,
    late: finished.length - onTime,
    overdue: tasks.filter((t) => t.status === "overdue").length,
    discarded: tasks.filter((t) => t.status === "discarded").length,
    awaiting: tasks.filter((t) => t.status === "submitted").length,
    onTimePct: finished.length ? Math.round((onTime / finished.length) * 100) : 0,
  };
}

const HEAD = ["Date", "Task", "Due", "Completed", "Est.", "Worked", "Status", "Timing"];
const fileBase = (m: Profile, from: string, to: string) =>
  `${m.full_name.replace(/[^\w]+/g, "-").toLowerCase()}-report-${from}-to-${to}`;

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(member: Profile, tasks: Task[], from: string, to: string) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const s = summary(tasks);
  const lines = [
    ["Member", member.full_name],
    ["Role", member.title],
    ["Period", `${from} to ${to}`],
    ["Tasks", String(s.total)],
    ["Approved hours", fmtHours(s.approvedHours)],
    ["On time", String(s.onTime)],
    ["Late", String(s.late)],
    ["Still overdue", String(s.overdue)],
    ["Discarded", String(s.discarded)],
    [],
    HEAD,
    ...rows(tasks),
  ];
  // The BOM makes Excel read the file as UTF-8.
  save(new Blob(["﻿" + lines.map((l) => l.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }), `${fileBase(member, from, to)}.csv`);
}

export async function downloadPdf(member: Profile, tasks: Task[], from: string, to: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const s = summary(tasks);
  const M = 40;

  // Header band
  doc.setFillColor(217, 119, 6);
  doc.rect(0, 0, W, 6, "F");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(180, 83, 9);
  doc.text("OCTAITE ACCOUNTABILITY", M, 40);
  doc.setFontSize(20).setTextColor(28, 25, 23);
  doc.text(`${member.full_name}: work report`, M, 66);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120, 113, 108);
  doc.text(`${member.title || "Team member"}  |  ${fmtDay(`${from}T12:00:00+05:00`)} to ${fmtDay(`${to}T12:00:00+05:00`)}  |  Times in PKT`, M, 84);

  // Summary tiles
  const tiles: [string, string][] = [
    ["Approved hours", `${fmtHours(s.approvedHours)}h`],
    ["Tasks", `${s.total}`],
    ["Approved", `${s.approved}`],
    ["On time", `${s.onTimePct}%`],
    ["Late", `${s.late}`],
    ["Overdue / discarded", `${s.overdue} / ${s.discarded}`],
  ];
  const gap = 8;
  const tw = (W - M * 2 - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([k, v], i) => {
    const x = M + i * (tw + gap);
    doc.setFillColor(i === 0 ? 254 : 250, i === 0 ? 243 : 250, i === 0 ? 199 : 249);
    doc.setDrawColor(231, 229, 228);
    doc.roundedRect(x, 102, tw, 50, 6, 6, "FD");
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(28, 25, 23);
    doc.text(v, x + 10, 126);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120, 113, 108);
    doc.text(k, x + 10, 141);
  });

  autoTable(doc, {
    startY: 172,
    margin: { left: M, right: M },
    head: [HEAD],
    body: tasks.length ? rows(tasks) : [["", "No tasks in this period.", "", "", "", "", "", ""]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 6, textColor: [28, 25, 23], lineColor: [231, 229, 228], lineWidth: 0.5 },
    headStyles: { fillColor: [28, 25, 23], textColor: [250, 250, 249], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: { 1: { cellWidth: 135 }, 4: { halign: "right" }, 5: { halign: "right" } },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const v = String(d.cell.raw ?? "");
      if (d.column.index >= 6 && /Overdue|Late|Rejected|Discarded/.test(v)) d.cell.styles.textColor = [185, 28, 28];
      if (d.column.index === 6 && v === "Approved") d.cell.styles.textColor = [22, 101, 52];
    },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120, 113, 108);
      doc.text(`Generated ${fmtLongDay()}`, M, H - 24);
      doc.text(`Page ${doc.getNumberOfPages()}`, W - M, H - 24, { align: "right" });
    },
  });

  doc.save(`${fileBase(member, from, to)}.pdf`);
}

/**
 * CSV export utility for expenses.
 * Runs entirely client-side using Dexie data, zero backend dependencies.
 */

import type { Expense } from "@/features/domain/entities";
import { formatMinorUnits, type MinorUnits } from "@/features/domain/money";

/**
 * Escape a value for CSV (RFC 4180).
 * Wraps in double quotes if contains comma, double quote, or newline.
 * Escapes double quotes by doubling them.
 */
function escapeCsvValue(value: string): string {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/**
 * Format an Expense amount in minor units to a human-readable string with currency.
 */
function formatExpenseAmount(amountMinor: MinorUnits, currency: string): string {
  return `${formatMinorUnits(amountMinor, currency)} ${currency}`;
}

/**
 * Convert an array of Expense objects to a CSV string.
 * Columns: Date, Title, Category, Amount, Currency, Paid By
 */
export function expensesToCsv(expenses: Expense[]): string {
  // Sort by date descending (newest first)
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

  const headers = ["Date", "Title", "Category", "Amount", "Currency", "Paid By"];
  const rows = sorted.map((expense) => [
    expense.date, // Date (ISO format yyyy-mm-dd)
    expense.description, // Title/Description
    expense.category ?? "Uncategorized", // Category
    formatExpenseAmount(expense.amountMinor, expense.currency), // Amount with currency
    expense.currency, // Currency code
    expense.paidBy, // Paid By (user ID)
  ]);

  const allRows = [headers, ...rows];
  return allRows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

/**
 * Generate a Blob from expenses and trigger a download.
 * Filename: viatik-expenses.csv
 */
export function downloadExpensesCsv(expenses: Expense[], filename = "viatik-expenses.csv"): void {
  const csv = expensesToCsv(expenses);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
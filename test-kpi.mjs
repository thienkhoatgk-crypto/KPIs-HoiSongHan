import { calculateMonthlyScore, calculateWeeklyBreakdown } from './src/lib/kpi.js';
import { DEFAULT_KPI_SETTINGS } from './src/types.js';

const mockReport = {
  id: "test",
  userId: "user1",
  week: "2024-05",
  date: new Date(),
  presenceStatus: "present",
  // simulate missing fields
};

const allReports = [mockReport];

try {
  const weekly = calculateWeeklyBreakdown(mockReport, allReports, DEFAULT_KPI_SETTINGS);
  console.log("Weekly breakdown OK:", weekly);
  
  const monthly = calculateMonthlyScore(allReports, allReports, DEFAULT_KPI_SETTINGS);
  console.log("Monthly score OK:", monthly);
} catch (e) {
  console.error("CRASH:", e);
}

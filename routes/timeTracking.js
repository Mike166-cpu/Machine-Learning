const express = require("express");
const axios = require("axios");
const router = express.Router();
const performanceAnalyzer = require("../services/mlServices");

router.get("/sessions", async (req, res) => {
  try {
    const response = await axios.get(
      "https://backend-hr1.jjm-manufacturing.com/api/timetrack/approveSessions"
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json({
      message: "Error fetching approved time tracking data",
      error: err.message,
    });
  }
});

const generateRecommendations = (metrics) => {
  const recommendations = [];

  // Work hours analysis
  if (metrics.workHoursRatio < 0.9) {
    recommendations.push({
      type: "work_hours",
      severity: "high",
      message: "Work hours are significantly below expected (8h/day)",
      suggestion: "Review scheduling and time management practices",
    });
  } else if (metrics.workHoursRatio > 1.2) {
    recommendations.push({
      type: "work_hours",
      severity: "medium",
      message: "Consistently working overtime hours",
      suggestion: "Monitor for potential burnout and workload distribution",
    });
  }

  // Attendance analysis
  if (metrics.onTimeRate < 0.8) {
    recommendations.push({
      type: "attendance",
      severity: "high",
      message: "Attendance punctuality needs improvement",
      suggestion:
        "Consider adjusting commute schedule or discussing flexible hours",
    });
  }

  return recommendations;
};

const calculateEmployeeMetrics = (entry) => {
  // Improved number parsing with type checking
  const parseHours = (value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      return parseFloat(value.replace("H", "")) || 0;
    }
    return 0;
  };

  // Parse hours with safeguards
  const workHours = parseHours(entry.total_hours);
  const overtimeHours = parseHours(entry.overtime_hours);
  const onTimeScore = entry.entry_status === "on_time" ? 1 : 0;
  const expectedHours = 8;
  const workHoursRatio = workHours / expectedHours || 0;
  const hoursScore = Math.min(workHoursRatio, 1);

  // Calculate score with validation
  const score = onTimeScore * 0.6 + hoursScore * 0.4;

  const metrics = {
    workHoursRatio: Number(workHoursRatio.toFixed(2)) || 0,
    onTimeRate: onTimeScore,
    totalHours: Number(workHours.toFixed(2)) || 0,
    overtimeHours: Number(Math.max(0, overtimeHours).toFixed(2)) || 0,
  };

  return {
    name: entry.employee_fullname || "Unknown",
    employeeId: entry.employee_id || "",
    score: Number(score.toFixed(2)) || 0,
    department: entry.position || "Unassigned",
    recentTrend: "stable",
    metrics,
    recommendations: generateRecommendations(metrics),
  };
};

router.get("/analyze-performance", async (req, res) => {
  try {
    const response = await axios.get(
      "https://backend-hr1.jjm-manufacturing.com/api/timetrack/approveSessions"
    );
    const timeTrackingData = response.data;

    if (!Array.isArray(timeTrackingData) || timeTrackingData.length === 0) {
      return res
        .status(400)
        .json({ message: "No data available for analysis" });
    }

    // Clean and validate the data
    const cleanedData = timeTrackingData
      .filter((entry) => entry && entry.employee_fullname) // Remove invalid entries
      .map((entry) => ({
        ...entry,
        total_hours: parseFloat(entry.total_hours?.replace("H", "")) || 0,
        overtime_hours: parseFloat(entry.overtime_hours?.replace("H", "")) || 0,
        entry_status: entry.entry_status || "unknown",
        position: entry.position || "Unassigned",
      }));
    if (cleanedData.length === 0) {
      return res
        .status(400)
        .json({ message: "No valid data available for analysis" });
    }

    // Process employee metrics
    const employeeMetrics = cleanedData.map(calculateEmployeeMetrics);

    // Group by department
    const departmentGroups = employeeMetrics.reduce((groups, employee) => {
      const dept = employee.department;
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(employee);
      return groups;
    }, {});

    // Calculate department statistics
    const departmentStats = Object.entries(departmentGroups).reduce(
      (stats, [dept, employees]) => {
        const validEmployees = employees.filter((e) => !isNaN(e.score));
        const employeeCount = validEmployees.length;

        if (employeeCount === 0) return stats;

        const avgScore =
          validEmployees.reduce((sum, e) => sum + e.score, 0) / employeeCount;
        const avgHours =
          validEmployees.reduce((sum, e) => sum + e.metrics.totalHours, 0) /
          employeeCount;
        const onTimeCount = validEmployees.filter(
          (e) => e.metrics.onTimeRate === 1
        ).length;

        stats[dept] = {
          averageScore: Number(avgScore.toFixed(2)) || 0,
          employeeCount: employeeCount,
          avgWorkHours: Number(avgHours.toFixed(2)) || 0,
          onTimeRate:
            Number(((onTimeCount / employeeCount) * 100).toFixed(2)) || 0,
        };
        return stats;
      },
      {}
    );

    // Calculate overall metrics
    const validMetrics = employeeMetrics.filter((e) => !isNaN(e.score));
    const analysisResults = {
      topPerformers: validMetrics.sort((a, b) => b.score - a.score).slice(0, 5),
      totalEmployees: new Set(cleanedData.map((e) => e.employee_id)).size,
      averageScore:
        Number(
          (
            validMetrics.reduce((sum, e) => sum + e.score, 0) /
            validMetrics.length
          ).toFixed(2)
        ) || 0,
      departmentStats,
      workHoursAnalysis: {
        averageRatio:
          Number(
            (
              validMetrics.reduce(
                (sum, e) => sum + e.metrics.workHoursRatio,
                0
              ) / validMetrics.length
            ).toFixed(2)
          ) || 0,
        totalOvertimeHours:
          Number(
            validMetrics
              .reduce((sum, e) => sum + e.metrics.overtimeHours, 0)
              .toFixed(2)
          ) || 0,
        complianceRate:
          Number(
            (
              (validMetrics.filter(
                (e) =>
                  e.metrics.workHoursRatio >= 0.9 &&
                  e.metrics.workHoursRatio <= 1.1
              ).length /
                validMetrics.length) *
              100
            ).toFixed(2)
          ) || 0,
      },
    };

    res.json({
      descriptions: {
        topPerformers:
          "List of top 5 employees based on overall performance score",
        totalEmployees: "Total number of employees analyzed",
        averageScore:
          "Average performance score across all employees (0-1 scale)",
        departmentStats:
          "Performance statistics grouped by department/position",
        workHoursAnalysis:
          "Detailed analysis of work hours compliance and overtime",
      },
      ...analysisResults,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({
      message: "Error analyzing performance",
      error: err.message,
    });
  }
});

module.exports = router;

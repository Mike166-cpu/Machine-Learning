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

const calculateEmployeeMetrics = async (entry) => {
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
    attendanceStreak: calculateAttendanceStreak(entry.attendance_history || []),
    efficiencyRate: calculateEfficiencyRate(workHours, entry.tasks_completed || 0),
    breakTimeCompliance: calculateBreakCompliance(entry.break_durations || []),
    workloadDistribution: analyzeWorkloadDistribution(entry.daily_tasks || [])
  };

  // Get ML-based performance analysis
  const mlSuggestions = await performanceAnalyzer.analyze({
    workHours: workHours,
    overtimeHours: overtimeHours,
    onTimeRate: onTimeScore,
    attendanceHistory: entry.attendance_history || [],
    performance: score
  });

  return {
    name: entry.employee_fullname || "Unknown",
    employeeId: entry.employee_id || "",
    score: Number(score.toFixed(2)) || 0,
    department: entry.position || "Unassigned",
    recentTrend: mlSuggestions.trend || "stable",
    metrics,
    recommendations: [
      ...generateRecommendations(metrics),
      ...mlSuggestions.recommendations,
      ...generateWorkLifeBalanceRecommendations(metrics),
      ...generateCareerGrowthSuggestions(entry)
    ],
    mlInsights: {
      predictedPerformance: mlSuggestions.predictedScore,
      improvementAreas: mlSuggestions.improvementAreas,
      riskFactors: mlSuggestions.riskFactors,
      potentialImpact: calculatePotentialImpact(metrics)
    },
    detailedAnalysis: {
      workPatterns: analyzeWorkPatterns(entry),
      skillGaps: identifySkillGaps(entry),
      teamCollaboration: analyzeTeamCollaboration(entry),
      productivityTrends: analyzeProductivityTrends(entry),
      developmentNeeds: identifyDevelopmentNeeds(entry)
    }
  };
};

// Add new helper functions
const calculateAttendanceStreak = (history) => {
  if (!history || !Array.isArray(history)) return 0;
  
  let streak = 0;
  // Count consecutive on-time entries from most recent
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] && history[i].status === 'on_time') {
      streak++;
    } else {
      break;
    }
  }
  return Math.min(streak, 30); // Cap at 30 days
};

const calculateEfficiencyRate = (hours, tasksCompleted) => {
  return hours > 0 ? Number((tasksCompleted / hours).toFixed(2)) : 0;
};

const calculateBreakCompliance = (breaks) => {
  if (!breaks || breaks.length === 0) return 1;
  const standardBreak = 60; // 1 hour total break time
  const actualBreak = breaks.reduce((sum, duration) => sum + duration, 0);
  return Number((standardBreak / actualBreak).toFixed(2));
};

const analyzeWorkPatterns = (entry) => {
  return {
    peakProductivityHours: identifyPeakHours(entry.hourly_productivity || []),
    consistencyScore: calculateConsistencyScore(entry.daily_performance || []),
    collaborationMetrics: analyzeCollaboration(entry.team_interactions || []),
    workloadBalance: assessWorkloadBalance(entry.tasks || [])
  };
};

const generateWorkLifeBalanceRecommendations = (metrics) => {
  const recommendations = [];
  
  if (metrics.overtimeHours > 2) {
    recommendations.push({
      type: 'work_life_balance',
      severity: 'high',
      message: 'Excessive overtime may lead to burnout',
      suggestion: 'Consider delegating tasks or discussing workload adjustment',
      actionItems: [
        'Review task prioritization',
        'Schedule regular breaks',
        'Implement time-blocking techniques'
      ]
    });
  }

  if (metrics.breakTimeCompliance < 0.8) {
    recommendations.push({
      type: 'well_being',
      severity: 'medium',
      message: 'Break time utilization below recommended levels',
      suggestion: 'Encourage regular breaks to maintain productivity',
      actionItems: [
        'Set break time reminders',
        'Create a dedicated break area',
        'Practice stress-relief activities'
      ]
    });
  }

  return recommendations;
};

const generateCareerGrowthSuggestions = (entry) => {
  return [{
    type: 'career_development',
    severity: 'info',
    message: 'Opportunities for skill enhancement identified',
    suggestion: 'Consider focusing on key growth areas',
    actionItems: [
      'Participate in relevant training programs',
      'Seek mentorship opportunities',
      'Take on challenging projects'
    ]
  }];
};

const calculatePotentialImpact = (metrics) => {
  return {
    productivity: assessProductivityPotential(metrics),
    teamDynamics: assessTeamImpact(metrics),
    organizational: assessOrganizationalImpact(metrics)
  };
};

const analyzeWorkloadDistribution = (tasks = []) => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      distribution: 'balanced',
      taskCompletion: 100,
      workloadScore: 1
    };
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const workloadScore = completedTasks / totalTasks;

  return {
    distribution: workloadScore >= 0.8 ? 'optimal' : workloadScore >= 0.6 ? 'balanced' : 'suboptimal',
    taskCompletion: Math.round((completedTasks / totalTasks) * 100),
    workloadScore: Number(workloadScore.toFixed(2))
  };
};

const identifySkillGaps = (entry) => {
  return {
    technical: assessTechnicalSkills(entry.skills_assessment || {}),
    soft: assessSoftSkills(entry.performance_reviews || []),
    training_needs: identifyTrainingNeeds(entry)
  };
};

const assessTechnicalSkills = (assessment = {}) => {
  const baselineSkills = ['communication', 'teamwork', 'problem_solving'];
  return baselineSkills.map(skill => ({
    skill,
    level: assessment[skill] || 'developing',
    gap: assessment[skill] ? 'none' : 'improvement_needed'
  }));
};

const assessSoftSkills = (reviews = []) => {
  return {
    leadership: calculateSkillScore(reviews, 'leadership'),
    communication: calculateSkillScore(reviews, 'communication'),
    teamwork: calculateSkillScore(reviews, 'teamwork')
  };
};

const calculateSkillScore = (reviews, skillType) => {
  if (reviews.length === 0) return 'N/A';
  const skillScores = reviews
    .filter(review => review[skillType])
    .map(review => review[skillType]);
  return skillScores.length > 0
    ? (skillScores.reduce((a, b) => a + b, 0) / skillScores.length).toFixed(2)
    : 'N/A';
};

const identifyTrainingNeeds = (entry) => {
  const needs = [];
  if (entry.performance_score < 0.7) needs.push('Performance Improvement');
  if (entry.technical_score < 0.6) needs.push('Technical Skills');
  if (entry.communication_score < 0.6) needs.push('Communication Skills');
  return needs;
};

const analyzeTeamCollaboration = (entry) => {
  return {
    collaborationScore: calculateCollaborationScore(entry),
    teamInteractions: analyzeTeamInteractions(entry.team_interactions || []),
    projectContributions: assessProjectContributions(entry.project_involvement || [])
  };
};

const calculateCollaborationScore = (entry) => {
  const baseScore = 0.7; // Default collaboration score
  let score = baseScore;
  
  if (entry.team_feedback) score += 0.1;
  if (entry.project_contributions > 5) score += 0.1;
  if (entry.peer_reviews && entry.peer_reviews.length > 0) score += 0.1;
  
  return Number(Math.min(1, score).toFixed(2));
};

const analyzeProductivityTrends = (entry) => {
  return {
    dailyProductivity: calculateDailyProductivity(entry.daily_tasks || []),
    weeklyTrend: analyzeWeeklyTrend(entry.weekly_performance || []),
    efficiency: calculateEfficiencyMetrics(entry)
  };
};

const calculateDailyProductivity = (tasks = []) => {
  if (tasks.length === 0) return { score: 0, trend: 'stable' };
  
  const completionRates = tasks.map(task => ({
    date: task.date,
    rate: task.completed / task.total
  }));
  
  return {
    score: Number((completionRates.reduce((acc, curr) => acc + curr.rate, 0) / completionRates.length).toFixed(2)),
    trend: determineTrend(completionRates.map(r => r.rate))
  };
};

const determineTrend = (values) => {
  if (values.length < 2) return 'stable';
  const recent = values.slice(-3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const firstAvg = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  
  if (avg > firstAvg * 1.1) return 'improving';
  if (avg < firstAvg * 0.9) return 'declining';
  return 'stable';
};

const assessProductivityPotential = (metrics) => {
  const potentialScore = {
    value: 0,
    factors: []
  };

  // Assess work hours efficiency
  if (metrics.workHoursRatio < 0.9) {
    potentialScore.value += 0.3;
    potentialScore.factors.push('Work hours optimization');
  }

  // Assess break time usage
  if (metrics.breakTimeCompliance < 0.8) {
    potentialScore.value += 0.2;
    potentialScore.factors.push('Break time management');
  }

  // Assess efficiency rate
  if (metrics.efficiencyRate < 1) {
    potentialScore.value += 0.2;
    potentialScore.factors.push('Task efficiency');
  }

  return {
    potentialGain: Number(potentialScore.value.toFixed(2)),
    improvementFactors: potentialScore.factors
  };
};

const assessTeamImpact = (metrics) => {
  const impact = {
    score: 0,
    areas: []
  };

  // Assess collaboration potential
  if (metrics.workloadDistribution?.distribution !== 'optimal') {
    impact.score += 0.25;
    impact.areas.push('Team collaboration');
  }

  // Assess knowledge sharing
  if (metrics.attendanceStreak > 5) {
    impact.score += 0.25;
    impact.areas.push('Knowledge sharing');
  }

  return {
    impactScore: Number(impact.score.toFixed(2)),
    impactAreas: impact.areas
  };
};

const assessOrganizationalImpact = (metrics) => {
  const orgImpact = {
    score: 0,
    influences: []
  };

  // Assess productivity influence
  if (metrics.workHoursRatio > 0.95) {
    orgImpact.score += 0.3;
    orgImpact.influences.push('High productivity model');
  }

  // Assess resource utilization
  if (metrics.breakTimeCompliance > 0.9) {
    orgImpact.score += 0.2;
    orgImpact.influences.push('Efficient resource utilization');
  }

  return {
    organizationalScore: Number(orgImpact.score.toFixed(2)),
    organizationalInfluences: orgImpact.influences
  };
};

const identifyPeakHours = (hourlyData = []) => {
  if (!Array.isArray(hourlyData) || hourlyData.length === 0) {
    return {
      peak: '9-10',
      productivity: 1,
      pattern: 'consistent'
    };
  }

  const hourlyProductivity = hourlyData.map(hour => ({
    timeSlot: hour.time_slot,
    productivity: hour.tasks_completed / hour.total_tasks || 0
  }));

  const peakHour = hourlyProductivity.reduce((max, hour) => 
    hour.productivity > max.productivity ? hour : max
  , hourlyProductivity[0]);

  return {
    peak: peakHour.timeSlot,
    productivity: Number(peakHour.productivity.toFixed(2)),
    pattern: determineProductivityPattern(hourlyProductivity)
  };
};

const calculateConsistencyScore = (dailyPerformance = []) => {
  if (dailyPerformance.length < 2) return 1;

  const scores = dailyPerformance.map(day => day.performance_score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
  const consistencyScore = 1 - Math.min(Math.sqrt(variance), 0.5);

  return Number(consistencyScore.toFixed(2));
};

const analyzeCollaboration = (interactions = []) => {
  return {
    frequency: calculateInteractionFrequency(interactions),
    quality: assessInteractionQuality(interactions),
    impact: measureTeamImpact(interactions)
  };
};

const calculateInteractionFrequency = (interactions) => {
  if (!interactions.length) return 0;
  const averageInteractionsPerDay = interactions.length / 30; // Assuming 30-day period
  return Number(Math.min(averageInteractionsPerDay / 5, 1).toFixed(2));
};

const assessInteractionQuality = (interactions) => {
  if (!interactions.length) return { score: 0, type: 'minimal' };
  
  const positiveInteractions = interactions.filter(i => i.feedback === 'positive').length;
  const qualityScore = positiveInteractions / interactions.length;
  
  return {
    score: Number(qualityScore.toFixed(2)),
    type: qualityScore >= 0.8 ? 'excellent' : qualityScore >= 0.6 ? 'good' : 'needs_improvement'
  };
};

const measureTeamImpact = (interactions) => {
  if (!interactions.length) return { score: 0, influence: 'neutral' };
  
  const impactScore = interactions.reduce((sum, interaction) => 
    sum + (interaction.impact_score || 0), 0) / interactions.length;
  
  return {
    score: Number(impactScore.toFixed(2)),
    influence: impactScore >= 0.8 ? 'high' : impactScore >= 0.5 ? 'moderate' : 'low'
  };
};

const assessWorkloadBalance = (tasks = []) => {
  if (!tasks.length) return { score: 1, status: 'balanced' };

  const workloadScore = tasks.reduce((sum, task) => 
    sum + (task.complexity || 1), 0) / (tasks.length * 2);
  
  return {
    score: Number(workloadScore.toFixed(2)),
    status: workloadScore > 0.8 ? 'overloaded' : 
           workloadScore < 0.4 ? 'underutilized' : 'balanced'
  };
};

const determineProductivityPattern = (hourlyData) => {
  if (hourlyData.length < 4) return 'insufficient_data';
  
  const variations = hourlyData.slice(1).map((hour, i) => 
    Math.abs(hour.productivity - hourlyData[i].productivity)
  );
  
  const avgVariation = variations.reduce((a, b) => a + b, 0) / variations.length;
  
  if (avgVariation < 0.1) return 'consistent';
  if (avgVariation < 0.2) return 'moderate_variation';
  return 'high_variation';
};

const analyzeWeeklyTrend = (weeklyPerformance = []) => {
  if (weeklyPerformance.length < 2) {
    return {
      trend: 'stable',
      consistency: 1,
      weeklyScores: []
    };
  }

  const scores = weeklyPerformance.map(week => ({
    week: week.week_number,
    score: week.performance_score
  }));

  const trend = calculateTrendDirection(scores);
  const consistency = calculateWeeklyConsistency(scores);

  return {
    trend,
    consistency: Number(consistency.toFixed(2)),
    weeklyScores: scores
  };
};

const calculateTrendDirection = (scores) => {
  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, s) => sum + s.score, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, s) => sum + s.score, 0) / secondHalf.length;
  
  if (secondAvg > firstAvg * 1.1) return 'improving';
  if (secondAvg < firstAvg * 0.9) return 'declining';
  return 'stable';
};

const calculateWeeklyConsistency = (scores) => {
  const variations = scores.slice(1).map((week, i) => 
    Math.abs(week.score - scores[i].score)
  );
  
  return 1 - Math.min(variations.reduce((a, b) => a + b, 0) / variations.length, 0.5);
};

const calculateEfficiencyMetrics = (entry) => {
  return {
    taskCompletion: calculateTaskCompletionRate(entry.daily_tasks || []),
    timeUtilization: calculateTimeUtilization(entry),
    qualityScore: assessWorkQuality(entry.completed_tasks || [])
  };
};

const calculateTaskCompletionRate = (tasks) => {
  if (!tasks.length) return 1;
  return Number((tasks.filter(t => t.status === 'completed').length / tasks.length).toFixed(2));
};

const calculateTimeUtilization = (entry) => {
  const targetHours = 8;
  const actualHours = entry.total_hours || 0;
  return Number(Math.min(actualHours / targetHours, 1.2).toFixed(2));
};

const assessWorkQuality = (tasks) => {
  if (!tasks.length) return 1;
  const qualityScores = tasks.map(t => t.quality_score || 1);
  return Number((qualityScores.reduce((a, b) => a + b, 0) / tasks.length).toFixed(2));
};

const analyzeTeamInteractions = (interactions = []) => {
  if (!Array.isArray(interactions) || interactions.length === 0) {
    return {
      frequency: 0,
      quality: 'neutral',
      impact: 'low'
    };
  }

  const interactionStats = {
    total: interactions.length,
    positive: interactions.filter(i => i.type === 'positive').length,
    collaborative: interactions.filter(i => i.nature === 'collaborative').length
  };

  return {
    frequency: Number((interactionStats.total / 30).toFixed(2)), // interactions per day
    quality: interactionStats.positive / interactionStats.total > 0.7 ? 'high' : 'moderate',
    impact: interactionStats.collaborative / interactionStats.total > 0.5 ? 'significant' : 'moderate'
  };
};

const assessProjectContributions = (projects = []) => {
  if (!Array.isArray(projects) || projects.length === 0) {
    return {
      level: 'neutral',
      score: 0,
      highlights: []
    };
  }

  const completedProjects = projects.filter(p => p.status === 'completed');
  const contributionScore = completedProjects.reduce((sum, project) => 
    sum + (project.contribution_weight || 1), 0) / projects.length;

  return {
    level: contributionScore > 0.8 ? 'high' : contributionScore > 0.5 ? 'moderate' : 'low',
    score: Number(contributionScore.toFixed(2)),
    highlights: completedProjects
      .filter(p => p.contribution_weight > 0.7)
      .map(p => p.project_name)
  };
};

const identifyDevelopmentNeeds = (entry) => {
  const developmentAreas = [];
  const metrics = entry.metrics || {};

  // Time Management
  if (metrics.workHoursRatio < 0.9) {
    developmentAreas.push({
      area: 'Time Management Skills',
      description: 'Improvement needed in work hours utilization and scheduling',
      suggestedActions: [
        'Use time tracking tools',
        'Set daily work schedules',
        'Prioritize tasks effectively'
      ]
    });
  }

  // Skill Development
  if (entry.skills_assessment) {
    const skillGaps = assessSkillGaps(entry.skills_assessment);
    skillGaps.forEach(gap => {
      developmentAreas.push({
        area: gap,
        description: `Enhancement required in ${gap.toLowerCase()}`,
        suggestedActions: [
          `Attend ${gap.toLowerCase()} training sessions`,
          'Practice through assigned projects',
          'Seek mentor guidance'
        ]
      });
    });
  }

  // Team Collaboration
  if (metrics.teamCollaboration?.score < 0.7) {
    developmentAreas.push({
      area: 'Team Collaboration Skills',
      description: 'Room for improvement in team interactions and cooperation',
      suggestedActions: [
        'Participate in team building activities',
        'Take initiative in group projects',
        'Improve communication with team members'
      ]
    });
  }

  // Leadership Development
  if (shouldRecommendLeadership(entry)) {
    developmentAreas.push({
      area: 'Leadership Development',
      description: 'Potential for leadership role identified',
      suggestedActions: [
        'Participate in leadership training programs',
        'Take on team lead responsibilities',
        'Mentor junior team members'
      ]
    });
  }

  // Performance Improvement
  if (entry.score < 0.7) {
    developmentAreas.push({
      area: 'Performance Enhancement',
      description: 'Overall performance needs attention',
      suggestedActions: [
        'Set clear performance goals',
        'Regular check-ins with supervisor',
        'Identify and address specific challenges'
      ]
    });
  }

  return developmentAreas;
};

const shouldRecommendLeadership = (entry) => {
  const criteria = {
    performanceThreshold: 0.8,
    experienceYears: 2,
    hasTeamProjects: true
  };

  return (
    (entry.performance_score || 0) >= criteria.performanceThreshold &&
    (entry.years_of_experience || 0) >= criteria.experienceYears &&
    entry.project_involvement?.some(p => p.role === 'lead')
  );
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

    // Train the ML model first
    await performanceAnalyzer.trainModel(timeTrackingData);

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

    // Process employee metrics (now with await since it's async)
    const employeeMetrics = await Promise.all(cleanedData.map(calculateEmployeeMetrics));

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
    const validMetrics = employeeMetrics.filter((e) => e && e.score !== undefined);
    const analysisResults = {
      topPerformers: validMetrics
        .filter(e => e.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
      totalEmployees: cleanedData.length,
      averageScore: validMetrics.length > 0 
        ? Number((validMetrics.reduce((sum, e) => sum + e.score, 0) / validMetrics.length).toFixed(2))
        : 0,
      departmentStats,
      workHoursAnalysis: {
        averageRatio: validMetrics.length > 0
          ? Number((validMetrics.reduce((sum, e) => sum + (e.metrics?.workHoursRatio || 0), 0) / validMetrics.length).toFixed(2))
          : 0,
        totalOvertimeHours: Number(validMetrics.reduce((sum, e) => sum + (e.metrics?.overtimeHours || 0), 0).toFixed(2)),
        complianceRate: validMetrics.length > 0
          ? Number(((validMetrics.filter(e => 
              e.metrics?.workHoursRatio >= 0.9 && 
              e.metrics?.workHoursRatio <= 1.1
            ).length / validMetrics.length) * 100).toFixed(2))
          : 0,
      },
      employeeDetails: validMetrics.map(e => ({
        name: e.name,
        score: e.score,
        department: e.department,
        metrics: e.metrics,
        recommendations: e.recommendations
      }))
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

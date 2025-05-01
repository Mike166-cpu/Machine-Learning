const tf = require("@tensorflow/tfjs");

class PerformanceAnalyzer {
  constructor() {
    this.model = null;
    this.initialized = false;
  }

  createModel() {
    try {
      const model = tf.sequential();

      // Input layer with batch normalization
      model.add(
        tf.layers.dense({
          units: 64,
          inputShape: [5],
          activation: "relu",
          kernelInitializer: "glorotNormal",
        })
      );
      model.add(tf.layers.batchNormalization());
      model.add(tf.layers.dropout({ rate: 0.3 }));

      // Hidden layer
      model.add(
        tf.layers.dense({
          units: 32,
          activation: "relu",
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
        })
      );
      model.add(tf.layers.batchNormalization());
      model.add(tf.layers.dropout({ rate: 0.2 }));

      // Output layer
      model.add(
        tf.layers.dense({
          units: 1,
          activation: "sigmoid",
          kernelInitializer: "glorotNormal",
        })
      );

      model.compile({
        optimizer: tf.train.adamax(0.001),
        loss: "binaryCrossentropy",
        metrics: ["accuracy"],
      });

      return model;
    } catch (error) {
      console.error("Error creating model:", error);
      throw error;
    }
  }

  preprocessData(timeTrackingData) {
    try {
      if (!Array.isArray(timeTrackingData) || timeTrackingData.length === 0) {
        throw new Error("Invalid input data");
      }

      // Validate and clean data first
      const validData = timeTrackingData.filter(
        (entry) => entry && typeof entry === "object"
      );
      if (validData.length === 0) {
        throw new Error("No valid entries in data");
      }

      // Calculate normalization values
      const stats = this.calculateStats(validData);

      return validData.map((entry) => {
        const minutesLate = Number(entry.minutes_late) || 0;
        const onTime = entry.entry_status === "on_time" ? 1 : 0;
        const totalHours = this.parseHours(entry.total_hours);
        const overtimeHours = this.parseHours(entry.overtime_hours);
        const isHoliday = entry.is_holiday ? 1 : 0;

        const performanceScore = this.calculatePerformanceScore({
          ...entry,
          total_hours: totalHours,
          overtime_hours: overtimeHours,
        });

        return {
          features: [
            (minutesLate - stats.minutesLate.mean) / stats.minutesLate.std,
            onTime,
            (totalHours - stats.totalHours.mean) / stats.totalHours.std,
            (overtimeHours - stats.overtimeHours.mean) /
              stats.overtimeHours.std,
            isHoliday,
          ],
          label: performanceScore,
        };
      });
    } catch (error) {
      console.error("Error preprocessing data:", error);
      throw error;
    }
  }

  calculateStats(data) {
    const stats = {
      minutesLate: { values: [], mean: 0, std: 1 },
      totalHours: { values: [], mean: 0, std: 1 },
      overtimeHours: { values: [], mean: 0, std: 1 },
    };

    // Collect values
    data.forEach((entry) => {
      stats.minutesLate.values.push(Number(entry.minutes_late) || 0);
      stats.totalHours.values.push(this.parseHours(entry.total_hours));
      stats.overtimeHours.values.push(this.parseHours(entry.overtime_hours));
    });

    // Calculate mean and std for each feature
    for (const feature in stats) {
      const values = stats[feature].values;
      stats[feature].mean = values.reduce((a, b) => a + b, 0) / values.length;
      stats[feature].std =
        Math.sqrt(
          values.reduce((a, b) => a + Math.pow(b - stats[feature].mean, 2), 0) /
            values.length
        ) || 1;
    }

    return stats;
  }

  calculatePerformanceScore(entry) {
    const onTimeWeight = 0.4;
    const hoursWeight = 0.3;
    const overtimeWeight = 0.2;
    const holidayWeight = 0.1;

    const onTimeScore =
      entry.minutes_late === 0 ? 1 : Math.max(0, 1 - entry.minutes_late / 60);
    const hoursScore = Math.min(1, this.parseHours(entry.total_hours) / 8);
    const overtimeScore = Math.min(
      1,
      this.parseHours(entry.overtime_hours) / 4
    );
    const holidayScore = entry.is_holiday ? 1 : 0;

    return (
      onTimeScore * onTimeWeight +
      hoursScore * hoursWeight +
      overtimeScore * overtimeWeight +
      holidayScore * holidayWeight
    );
  }

  parseHours(timeString) {
    try {
      if (!timeString) return 0;

      if (typeof timeString === "number") return timeString;

      if (typeof timeString === "string") {
        // Handle "H" format (e.g. "8H")
        const simpleMatch = timeString.match(/(\d+)H/);
        if (simpleMatch) {
          return parseInt(simpleMatch[1]);
        }

        // Handle "H M" format (e.g. "8H 30M")
        const fullMatch = timeString.match(/(\d+)H\s*(\d+)?M?/);
        if (fullMatch) {
          const hours = parseInt(fullMatch[1]) || 0;
          const minutes = parseInt(fullMatch[2]) || 0;
          return hours + minutes / 60;
        }

        // Try parsing as float if it's just a number
        const numericValue = parseFloat(timeString);
        if (!isNaN(numericValue)) {
          return numericValue;
        }
      }

      return 0;
    } catch (error) {
      console.warn("Error parsing hours:", error);
      return 0;
    }
  }

  async trainModel(data) {
    try {
      if (!this.model) {
        this.model = this.createModel();
      }

      const processedData = this.preprocessData(data);
      const xs = tf.tensor2d(processedData.map((d) => d.features));
      const ys = tf.tensor2d(processedData.map((d) => [d.label]));

      const history = await this.model.fit(xs, ys, {
        epochs: 50,
        batchSize: 16,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(
              `Epoch ${epoch}: loss = ${logs.loss.toFixed(
                4
              )}, accuracy = ${logs.acc.toFixed(
                4
              )}, val_loss = ${logs.val_loss.toFixed(4)}`
            );
          },
        },
      });

      this.initialized = true;
      xs.dispose();
      ys.dispose();
      return history;
    } catch (error) {
      console.error("Error training model:", error);
      throw error;
    }
  }

  async predictPerformance(employeeData) {
    try {
      if (!this.initialized) {
        throw new Error("Model not trained yet");
      }

      const processed = this.preprocessData([employeeData]);
      const tensor = tf.tensor2d(processed.map((d) => d.features));
      const prediction = await this.model.predict(tensor).array();
      tensor.dispose();
      return prediction[0][0];
    } catch (error) {
      console.error("Error predicting performance:", error);
      throw error;
    }
  }

  async analyzeWithAI(timeTrackingData) {
    try {
      // Group data by employee
      const employeeData = timeTrackingData.reduce((acc, entry) => {
        if (!acc[entry.employee_id]) {
          acc[entry.employee_id] = [];
        }
        acc[entry.employee_id].push(entry);
        return acc;
      }, {});

      await this.trainModel(timeTrackingData);

      const predictions = await Promise.all(
        Object.entries(employeeData).map(async ([employeeId, entries]) => {
          try {
            const scores = await Promise.all(
              entries.map((entry) => this.predictPerformance(entry))
            );

            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            const recentEntries = entries.slice(-30); // Last 30 entries

            return {
              employee_id: employeeId,
              employee_fullname: entries[0].employee_fullname,
              position: entries[0].position,
              performance_score: parseFloat(avgScore.toFixed(4)),
              total_entries: entries.length,
              metrics: {
                attendance_rate:
                  entries.filter((e) => e.minutes_late === 0).length /
                  entries.length,
                avg_work_hours:
                  entries.reduce(
                    (acc, e) => acc + this.parseHours(e.total_hours),
                    0
                  ) / entries.length,
                avg_overtime:
                  entries.reduce(
                    (acc, e) => acc + this.parseHours(e.overtime_hours),
                    0
                  ) / entries.length,
                recent_trend: this.calculateTrend(recentEntries),
              },
            };
          } catch (error) {
            console.error(`Error analyzing employee ${employeeId}:`, error);
            return null;
          }
        })
      );

      const validPredictions = predictions.filter((p) => p !== null);
      const topPerformers = validPredictions
        .sort((a, b) => b.performance_score - a.performance_score)
        .slice(0, 5);

      return {
        topPerformers,
        totalEmployees: Object.keys(employeeData).length,
        averageScore:
          validPredictions.reduce((acc, p) => acc + p.performance_score, 0) /
          validPredictions.length,
        departmentStats: this.calculateDepartmentStats(validPredictions),
      };
    } catch (error) {
      throw new Error(`AI Analysis failed: ${error.message}`);
    }
  }

  calculateTrend(entries) {
    if (entries.length < 2) return "neutral";
    const scores = entries.map((e) => this.calculatePerformanceScore(e));
    const trend = scores[scores.length - 1] - scores[0];
    return trend > 0.1 ? "improving" : trend < -0.1 ? "declining" : "stable";
  }

  calculateDepartmentStats(predictions) {
    return predictions.reduce((acc, p) => {
      const position = p.position || "Unknown";
      if (!acc[position]) {
        acc[position] = {
          count: 0,
          avgScore: 0,
          topPerformer: null,
        };
      }
      acc[position].count++;
      acc[position].avgScore += p.performance_score;
      if (
        !acc[position].topPerformer ||
        p.performance_score > acc[position].topPerformer.performance_score
      ) {
        acc[position].topPerformer = p;
      }
      return acc;
    }, {});
  }

  async analyze(employeeData) {
    try {
      // Check if model needs training with sample data if not initialized
      if (!this.initialized) {
        return {
          predictedScore: employeeData.performance || 0,
          trend: "stable",
          recommendations: generateRecommendations({
            workHoursRatio: employeeData.workHours / 8,
            onTimeRate: employeeData.onTimeRate,
          }),
          improvementAreas: [],
          riskFactors: [],
        };
      }

      const predictedScore = await this.predictPerformance(employeeData);
      const currentScore = employeeData.performance;

      const recommendations = [];
      const improvementAreas = [];
      const riskFactors = [];

      // Analyze work hours
      if (employeeData.workHours < 7) {
        improvementAreas.push("Work Hours");
        recommendations.push({
          type: "productivity",
          severity: "medium",
          message: "Working hours below optimal level",
          suggestion: "Consider maintaining consistent 8-hour workday",
        });
      }

      // Analyze overtime patterns
      if (employeeData.overtimeHours > 2) {
        riskFactors.push("High Overtime");
        recommendations.push({
          type: "worklife_balance",
          severity: "medium",
          message: "Regular overtime detected",
          suggestion: "Review workload distribution to prevent burnout",
        });
      }

      // Determine performance trend
      const trend =
        predictedScore > currentScore
          ? "improving"
          : predictedScore < currentScore
          ? "declining"
          : "stable";

      return {
        predictedScore: Number(predictedScore.toFixed(2)),
        trend,
        recommendations,
        improvementAreas,
        riskFactors,
      };
    } catch (error) {
      console.error("Error in ML analysis:", error);
      return {
        predictedScore: employeeData.performance || 0,
        trend: "stable",
        recommendations: [],
        improvementAreas: [],
        riskFactors: [],
      };
    }
  }
}

module.exports = new PerformanceAnalyzer();

import { Task, TaskEstimation, TaskHistory, LearningData } from '../App';

// Learning engine for issue #9 - AI estimation accuracy improvement
export class LearningEngine {
  private static instance: LearningEngine;
  private learningData: Map<string, LearningData> = new Map();

  private constructor() {
    this.loadLearningData();
  }

  public static getInstance(): LearningEngine {
    if (!LearningEngine.instance) {
      LearningEngine.instance = new LearningEngine();
    }
    return LearningEngine.instance;
  }

  // Record actual time spent on a task
  public recordActualTime(
    task: Task,
    actualTime: {
      準備: number;
      設計: number;
      実装: number;
      改善: number;
    },
    adjustmentReason: TaskHistory['adjustmentReason'] = 'user_manual'
  ): void {
    console.log(`Recording actual time for task: ${task.title}`);

    // Create task history entry
    const taskHistory: TaskHistory = {
      taskId: task.id,
      originalEstimation: task.estimation || this.getDefaultEstimation(),
      actualTime,
      adjustmentReason,
      timestamp: new Date()
    };

    // Save to task history
    this.saveTaskHistory(taskHistory);

    // Update learning data
    this.updateLearningData(task, taskHistory);

    // Update task with actual time
    task.actualTime = actualTime;
  }

  // Update learning data based on task history
  private updateLearningData(task: Task, history: TaskHistory): void {
    const taskType = this.classifyTask(task);
    const userId = 'default'; // In real app, this would be the actual user ID

    let learningData = this.learningData.get(taskType);
    
    if (!learningData) {
      learningData = this.createInitialLearningData(userId, taskType);
      this.learningData.set(taskType, learningData);
    }

    // Calculate estimation accuracy
    const accuracy = this.calculateEstimationAccuracy(
      history.originalEstimation,
      history.actualTime
    );

    // Update accuracy with exponential moving average
    const alpha = 0.1; // Learning rate
    learningData.estimationAccuracy = 
      alpha * accuracy + (1 - alpha) * learningData.estimationAccuracy;

    // Update under/over estimation rates
    const totalEstimated = history.originalEstimation.total;
    const totalActual = Object.values(history.actualTime).reduce((sum, time) => sum + time, 0);
    
    if (totalActual > totalEstimated) {
      // Underestimation
      learningData.commonPatterns.underestimationRate = 
        alpha * 1 + (1 - alpha) * learningData.commonPatterns.underestimationRate;
      learningData.commonPatterns.overestimationRate = 
        (1 - alpha) * learningData.commonPatterns.overestimationRate;
    } else if (totalActual < totalEstimated) {
      // Overestimation
      learningData.commonPatterns.overestimationRate = 
        alpha * 1 + (1 - alpha) * learningData.commonPatterns.overestimationRate;
      learningData.commonPatterns.underestimationRate = 
        (1 - alpha) * learningData.commonPatterns.underestimationRate;
    }

    // Update phase distribution based on actual time
    const actualTotal = totalActual || 1; // Avoid division by zero
    learningData.commonPatterns.phaseDistribution = {
      準備: alpha * (history.actualTime.準備 / actualTotal) +
                  (1 - alpha) * learningData.commonPatterns.phaseDistribution.準備,
      設計: alpha * (history.actualTime.設計 / actualTotal) +
               (1 - alpha) * learningData.commonPatterns.phaseDistribution.設計,
      実装: alpha * (history.actualTime.実装 / actualTotal) +
                      (1 - alpha) * learningData.commonPatterns.phaseDistribution.実装,
      改善: alpha * (history.actualTime.改善 / actualTotal) +
                   (1 - alpha) * learningData.commonPatterns.phaseDistribution.改善
    };

    learningData.lastUpdated = new Date();

    // Save updated learning data
    this.saveLearningData();
  }

  // Classify task for learning purposes
  private classifyTask(task: Task): string {
    // Simple classification based on project and keywords
    if (task.project) {
      return task.project;
    }
    
    if (task.keywords.length > 0) {
      return task.keywords[0];
    }
    
    // Default classification based on title analysis
    const title = task.title.toLowerCase();
    if (title.includes('買い物') || title.includes('購入')) return '買い物';
    if (title.includes('掃除') || title.includes('片付け')) return '家事';
    if (title.includes('会議') || title.includes('ミーティング')) return '仕事';
    if (title.includes('勉強') || title.includes('学習')) return '学習';
    
    return 'その他';
  }

  // Calculate estimation accuracy (0-1, where 1 is perfect)
  private calculateEstimationAccuracy(
    estimation: TaskEstimation,
    actualTime: TaskHistory['actualTime']
  ): number {
    const estimatedTotal = estimation.total;
    const actualTotal = Object.values(actualTime).reduce((sum, time) => sum + time, 0);
    
    if (estimatedTotal === 0 && actualTotal === 0) return 1;
    if (estimatedTotal === 0 || actualTotal === 0) return 0;
    
    // Calculate accuracy as 1 - (relative error)
    const relativeError = Math.abs(estimatedTotal - actualTotal) / Math.max(estimatedTotal, actualTotal);
    return Math.max(0, 1 - relativeError);
  }

  // Create initial learning data for a new task type
  private createInitialLearningData(userId: string, taskType: string): LearningData {
    return {
      userId,
      taskType,
      estimationAccuracy: 0.7, // Start with moderate confidence
      commonPatterns: {
        underestimationRate: 0.5,
        overestimationRate: 0.5,
        phaseDistribution: {
          準備: 0.2,
          設計: 0.3,
          実装: 0.4,
          改善: 0.1
        }
      },
      lastUpdated: new Date()
    };
  }

  // Get improved estimation based on learning data
  public getImprovedEstimation(task: Task): TaskEstimation {
    const taskType = this.classifyTask(task);
    const learningData = this.learningData.get(taskType);
    
    // Start with basic estimation
    let baseEstimation = this.getDefaultEstimation();
    
    // Adjust based on priority
    const priorityMultiplier = task.priority === 3 ? 1.5 : task.priority === 1 ? 0.7 : 1.0;
    baseEstimation.total = Math.floor(baseEstimation.total * priorityMultiplier);
    
    if (!learningData) {
      // No learning data available, return basic estimation
      return this.redistributePhases(baseEstimation, baseEstimation.total);
    }

    // Apply learning-based adjustments
    let adjustedTotal = baseEstimation.total;
    
    // Adjust for under/over estimation patterns
    if (learningData.commonPatterns.underestimationRate > 0.6) {
      // User tends to underestimate, increase time
      adjustedTotal *= 1.2;
    } else if (learningData.commonPatterns.overestimationRate > 0.6) {
      // User tends to overestimate, decrease time
      adjustedTotal *= 0.9;
    }
    
    adjustedTotal = Math.floor(adjustedTotal);
    
    // Redistribute phases based on learned patterns
    const improvedEstimation = this.redistributePhases(baseEstimation, adjustedTotal);
    improvedEstimation.confidence = learningData.estimationAccuracy;
    
    // Apply learned phase distribution
    const patterns = learningData.commonPatterns.phaseDistribution;
    improvedEstimation.準備 = Math.floor(adjustedTotal * patterns.準備);
    improvedEstimation.設計 = Math.floor(adjustedTotal * patterns.設計);
    improvedEstimation.実装 = Math.floor(adjustedTotal * patterns.実装);
    improvedEstimation.改善 = Math.floor(adjustedTotal * patterns.改善);

    // Ensure total matches
    const phaseSum = improvedEstimation.準備 + improvedEstimation.設計 +
                     improvedEstimation.実装 + improvedEstimation.改善;
    if (phaseSum !== adjustedTotal) {
      improvedEstimation.実装 += adjustedTotal - phaseSum;
    }
    
    console.log(`Improved estimation for ${task.title}:`, improvedEstimation);
    return improvedEstimation;
  }

  // Redistribute phases based on total time
  private redistributePhases(baseEstimation: TaskEstimation, newTotal: number): TaskEstimation {
    const ratio = newTotal / baseEstimation.total;
    
    return {
      準備: Math.floor(baseEstimation.準備 * ratio),
      設計: Math.floor(baseEstimation.設計 * ratio),
      実装: Math.floor(baseEstimation.実装 * ratio),
      改善: Math.floor(baseEstimation.改善 * ratio),
      total: newTotal,
      confidence: baseEstimation.confidence
    };
  }

  // Get default estimation
  private getDefaultEstimation(): TaskEstimation {
    const baseTime = 60; // 1 hour
    return {
      準備: Math.floor(baseTime * 0.2),     // 20%
      設計: Math.floor(baseTime * 0.3),         // 30%
      実装: Math.floor(baseTime * 0.4), // 40%
      改善: Math.floor(baseTime * 0.1),    // 10%
      total: baseTime,
      confidence: 0.7
    };
  }

  // Save task history
  private saveTaskHistory(history: TaskHistory): void {
    try {
      const stored = localStorage.getItem('familytasks_task_history');
      const histories: TaskHistory[] = stored ? JSON.parse(stored) : [];
      histories.push(history);
      
      // Keep only last 1000 entries
      if (histories.length > 1000) {
        histories.splice(0, histories.length - 1000);
      }
      
      localStorage.setItem('familytasks_task_history', JSON.stringify(histories));
    } catch (error) {
      console.error('Failed to save task history:', error);
    }
  }

  // Load learning data from storage
  private loadLearningData(): void {
    try {
      const stored = localStorage.getItem('familytasks_learning_data');
      if (stored) {
        const data: LearningData[] = JSON.parse(stored);
        data.forEach(item => {
          this.learningData.set(item.taskType, item);
        });
      }
    } catch (error) {
      console.error('Failed to load learning data:', error);
    }
  }

  // Save learning data to storage
  private saveLearningData(): void {
    try {
      const data = Array.from(this.learningData.values());
      localStorage.setItem('familytasks_learning_data', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save learning data:', error);
    }
  }

  // Get learning insights for UI
  public getLearningInsights(): {
    taskTypes: string[];
    accuracyByType: Map<string, number>;
    overallAccuracy: number;
    totalTasksLearned: number;
  } {
    const taskTypes = Array.from(this.learningData.keys());
    const accuracyByType = new Map<string, number>();
    let totalAccuracy = 0;
    
    this.learningData.forEach((data, taskType) => {
      accuracyByType.set(taskType, data.estimationAccuracy);
      totalAccuracy += data.estimationAccuracy;
    });
    
    const overallAccuracy = taskTypes.length > 0 ? totalAccuracy / taskTypes.length : 0;
    
    // Get total tasks learned from history
    const stored = localStorage.getItem('familytasks_task_history');
    const totalTasksLearned = stored ? JSON.parse(stored).length : 0;
    
    return {
      taskTypes,
      accuracyByType,
      overallAccuracy,
      totalTasksLearned
    };
  }
}

// Export singleton instance
export const learningEngine = LearningEngine.getInstance();

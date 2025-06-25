import { LearningEngine } from '../services/learningEngine';
import { Task, TaskEstimation, TaskHistory } from '../App';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock as any;

// Mock console methods
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

describe('LearningEngine', () => {
  let learningEngine: LearningEngine;
  let mockTask: Task;
  let mockEstimation: TaskEstimation;
  let mockActualTime: TaskHistory['actualTime'];

  beforeEach(() => {
    learningEngine = LearningEngine.getInstance();
    
    mockTask = {
      id: 'test-task-1',
      title: 'Test Implementation Task',
      description: 'Test Description',
      status: 'todo',
      keywords: ['implementation', 'coding'],
      priority: 2,
      project: '仕事',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockEstimation = {
      準備: 12,      // 20% of 60
      設計: 18,          // 30% of 60
      実装: 24,  // 40% of 60
      改善: 6,      // 10% of 60
      total: 60,
      confidence: 0.7
    };

    mockActualTime = {
      準備: 15,
      設計: 20,
      実装: 30,
      改善: 5
    };

    // Clear localStorage mock
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = LearningEngine.getInstance();
      const instance2 = LearningEngine.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('recordActualTime', () => {
    beforeEach(() => {
      mockTask.estimation = mockEstimation;
    });

    it('should record actual time and create task history', () => {
      learningEngine.recordActualTime(mockTask, mockActualTime, 'user_manual');

      // Should save task history
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'familytasks_task_history',
        expect.any(String)
      );

      // Should save learning data
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'familytasks_learning_data',
        expect.any(String)
      );

      // Should update task with actual time
      expect(mockTask.actualTime).toEqual(mockActualTime);
    });

    it('should use default estimation if task has no estimation', () => {
      const taskWithoutEstimation = { ...mockTask, estimation: undefined };
      
      learningEngine.recordActualTime(taskWithoutEstimation, mockActualTime, 'user_manual');

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => {
        learningEngine.recordActualTime(mockTask, mockActualTime, 'user_manual');
      }).not.toThrow();

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('getImprovedEstimation', () => {
    it('should return basic estimation for unknown task types', () => {
      const result = learningEngine.getImprovedEstimation(mockTask);

      expect(result).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.準備 + result.設計 + result.実装 + result.改善)
        .toBe(result.total);
    });

    it('should adjust estimation based on priority', () => {
      const highPriorityTask = { ...mockTask, priority: 3 as const };
      const lowPriorityTask = { ...mockTask, priority: 1 as const };
      const normalPriorityTask = { ...mockTask, priority: 2 as const };

      const highResult = learningEngine.getImprovedEstimation(highPriorityTask);
      const lowResult = learningEngine.getImprovedEstimation(lowPriorityTask);
      const normalResult = learningEngine.getImprovedEstimation(normalPriorityTask);

      expect(highResult.total).toBeGreaterThan(normalResult.total);
      expect(lowResult.total).toBeLessThan(normalResult.total);
    });

    it('should apply learning data when available', () => {
      // First, record some actual time to create learning data
      mockTask.estimation = mockEstimation;
      learningEngine.recordActualTime(mockTask, mockActualTime, 'user_manual');

      // Then get improved estimation for similar task
      const similarTask = { ...mockTask, id: 'similar-task' };
      const result = learningEngine.getImprovedEstimation(similarTask);

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('getLearningInsights', () => {
    it('should return empty insights when no learning data exists', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const insights = learningEngine.getLearningInsights();

      expect(insights.taskTypes).toEqual([]);
      expect(insights.overallAccuracy).toBe(0);
      expect(insights.totalTasksLearned).toBe(0);
    });

    it('should return insights based on learning data', () => {
      // Record some learning data first
      mockTask.estimation = mockEstimation;
      learningEngine.recordActualTime(mockTask, mockActualTime, 'user_manual');

      const insights = learningEngine.getLearningInsights();

      expect(insights.taskTypes.length).toBeGreaterThan(0);
      expect(insights.overallAccuracy).toBeGreaterThan(0);
      expect(insights.accuracyByType.size).toBeGreaterThan(0);
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const insights = learningEngine.getLearningInsights();

      expect(insights.taskTypes).toEqual([]);
      expect(insights.overallAccuracy).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('task classification', () => {
    it('should classify tasks by project', () => {
      const taskWithProject = { ...mockTask, project: '家事' };
      const result = learningEngine.getImprovedEstimation(taskWithProject);
      expect(result).toBeDefined();
    });

    it('should classify tasks by keywords', () => {
      const taskWithKeywords = { ...mockTask, project: undefined, keywords: ['買い物'] };
      const result = learningEngine.getImprovedEstimation(taskWithKeywords);
      expect(result).toBeDefined();
    });

    it('should classify tasks by title content', () => {
      const shoppingTask = { ...mockTask, project: undefined, keywords: [], title: '食材を買い物に行く' };
      const cleaningTask = { ...mockTask, project: undefined, keywords: [], title: '部屋を掃除する' };
      
      const shoppingResult = learningEngine.getImprovedEstimation(shoppingTask);
      const cleaningResult = learningEngine.getImprovedEstimation(cleaningTask);
      
      expect(shoppingResult).toBeDefined();
      expect(cleaningResult).toBeDefined();
    });
  });

  describe('estimation accuracy calculation', () => {
    it('should calculate perfect accuracy for identical estimates and actuals', () => {
      const perfectEstimation = { ...mockEstimation };
      const perfectActual = {
        準備: 12,
        設計: 18,
        実装: 24,
        改善: 6
      };

      mockTask.estimation = perfectEstimation;
      learningEngine.recordActualTime(mockTask, perfectActual, 'user_manual');

      const insights = learningEngine.getLearningInsights();
      expect(insights.overallAccuracy).toBe(1);
    });

    it('should calculate lower accuracy for different estimates and actuals', () => {
      const estimation = { ...mockEstimation, total: 60 };
      const actual = {
        準備: 30,  // Much higher than estimated
        設計: 30,
        実装: 30,
        改善: 30
      }; // Total: 120 minutes vs 60 estimated

      mockTask.estimation = estimation;
      learningEngine.recordActualTime(mockTask, actual, 'user_manual');

      const insights = learningEngine.getLearningInsights();
      expect(insights.overallAccuracy).toBeLessThan(1);
      expect(insights.overallAccuracy).toBeGreaterThan(0);
    });
  });
});

import { RealtimeScheduler } from '../services/realtimeScheduler';
import { Task, WorkingHours, ReschedulingEvent } from '../App';

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

describe('RealtimeScheduler', () => {
  let scheduler: RealtimeScheduler;
  let mockTask: Task;
  let mockWorkingHours: WorkingHours;

  beforeEach(() => {
    scheduler = RealtimeScheduler.getInstance();
    
    mockTask = {
      id: 'test-task-1',
      title: 'Test Task',
      description: 'Test Description',
      status: 'todo',
      keywords: [],
      priority: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      calendarEvents: [{
        id: 'event-1',
        taskId: 'test-task-1',
        phase: '実装',
        startTime: new Date('2024-01-01T10:00:00'),
        endTime: new Date('2024-01-01T11:00:00'),
        googleEventId: 'google-event-1'
      }]
    };

    mockWorkingHours = {
      monday: { start: '09:00', end: '18:00', enabled: true },
      tuesday: { start: '09:00', end: '18:00', enabled: true },
      wednesday: { start: '09:00', end: '18:00', enabled: true },
      thursday: { start: '09:00', end: '18:00', enabled: true },
      friday: { start: '09:00', end: '18:00', enabled: true },
      saturday: { start: '10:00', end: '16:00', enabled: false },
      sunday: { start: '10:00', end: '16:00', enabled: false }
    };

    // Clear localStorage mock
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  afterEach(() => {
    // Clean up event listeners
    scheduler.removeEventListener('test-listener');
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = RealtimeScheduler.getInstance();
      const instance2 = RealtimeScheduler.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('addEventListener and removeEventListener', () => {
    it('should add and remove event listeners', () => {
      const mockListener = jest.fn();
      
      scheduler.addEventListener('test-listener', mockListener);
      
      // Create a mock rescheduling event
      const mockEvent: ReschedulingEvent = {
        id: 'test-event',
        triggeredBy: 'calendar_change',
        affectedTasks: ['test-task-1'],
        timestamp: new Date(),
        changes: []
      };

      // Trigger notification (this would normally be called internally)
      (scheduler as any).notifyListeners(mockEvent);
      
      expect(mockListener).toHaveBeenCalledWith(mockEvent);
      
      // Remove listener
      scheduler.removeEventListener('test-listener');
      
      // Trigger again - should not be called
      (scheduler as any).notifyListeners(mockEvent);
      
      expect(mockListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleCalendarChange', () => {
    beforeEach(() => {
      // Mock localStorage to return test tasks
      localStorageMock.getItem.mockReturnValue(JSON.stringify([mockTask]));
    });

    it('should handle calendar change events', async () => {
      const mockListener = jest.fn();
      scheduler.addEventListener('test-listener', mockListener);

      await scheduler.handleCalendarChange('updated', 'google-event-1', 'primary');

      // Should have called the listener with a rescheduling event
      expect(mockListener).toHaveBeenCalled();
      
      const calledEvent = mockListener.mock.calls[0][0] as ReschedulingEvent;
      expect(calledEvent.triggeredBy).toBe('calendar_change');
      expect(calledEvent.affectedTasks).toContain('test-task-1');
    });

    it('should not reschedule if already in progress', async () => {
      const mockListener = jest.fn();
      scheduler.addEventListener('test-listener', mockListener);

      // Set rescheduling in progress
      (scheduler as any).reschedulingInProgress = true;

      await scheduler.handleCalendarChange('updated', 'google-event-1', 'primary');

      // Should not have called the listener
      expect(mockListener).not.toHaveBeenCalled();
    });
  });

  describe('rescheduleAffectedTasks', () => {
    it('should reschedule tasks and return rescheduling event', async () => {
      const tasks = [mockTask];
      
      const result = await scheduler.rescheduleAffectedTasks(
        tasks,
        'manual_adjustment',
        mockWorkingHours
      );

      expect(result).toBeDefined();
      expect(result.triggeredBy).toBe('manual_adjustment');
      expect(result.affectedTasks).toContain('test-task-1');
      expect(result.changes).toBeDefined();
    });

    it('should save rescheduling event to localStorage', async () => {
      const tasks = [mockTask];
      
      await scheduler.rescheduleAffectedTasks(
        tasks,
        'manual_adjustment',
        mockWorkingHours
      );

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'familytasks_rescheduling_events',
        expect.any(String)
      );
    });
  });

  describe('checkReschedulingNeeded', () => {
    it('should return false for tasks without calendar events', async () => {
      const taskWithoutEvents = { ...mockTask, calendarEvents: undefined };
      
      const result = await scheduler.checkReschedulingNeeded(
        taskWithoutEvents,
        mockWorkingHours
      );

      expect(result).toBe(false);
    });

    it('should return false for tasks with empty calendar events', async () => {
      const taskWithEmptyEvents = { ...mockTask, calendarEvents: [] };
      
      const result = await scheduler.checkReschedulingNeeded(
        taskWithEmptyEvents,
        mockWorkingHours
      );

      expect(result).toBe(false);
    });
  });

  describe('getReschedulingHistory', () => {
    it('should return empty array when no history exists', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const history = scheduler.getReschedulingHistory();
      
      expect(history).toEqual([]);
    });

    it('should return parsed history from localStorage', () => {
      const mockHistory = [{
        id: 'event-1',
        triggeredBy: 'calendar_change',
        affectedTasks: ['task-1'],
        timestamp: new Date().toISOString(),
        changes: []
      }];
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockHistory));
      
      const history = scheduler.getReschedulingHistory();
      
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('event-1');
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });
      
      const history = scheduler.getReschedulingHistory();
      
      expect(history).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });
  });
});

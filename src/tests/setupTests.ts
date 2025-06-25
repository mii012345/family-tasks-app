// Jest setup file for issue #9 tests

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

// Mock Google APIs
Object.defineProperty(window, 'gapi', {
  value: {
    load: jest.fn(),
    client: {
      init: jest.fn(),
      calendar: {
        events: {
          list: jest.fn(),
          insert: jest.fn(),
          update: jest.fn(),
          delete: jest.fn()
        }
      }
    }
  }
});

// Mock Google Identity Services
Object.defineProperty(window, 'google', {
  value: {
    accounts: {
      oauth2: {
        initTokenClient: jest.fn()
      }
    }
  }
});

// Mock Notification API
Object.defineProperty(window, 'Notification', {
  value: jest.fn().mockImplementation(() => ({
    close: jest.fn()
  })),
  configurable: true
});

Object.defineProperty(Notification, 'permission', {
  value: 'granted',
  configurable: true
});

Object.defineProperty(Notification, 'requestPermission', {
  value: jest.fn().mockResolvedValue('granted'),
  configurable: true
});

// Mock EventSource for WebSocket-like functionality
Object.defineProperty(window, 'EventSource', {
  value: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  })),
  configurable: true
});

// Mock fetch API
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Mock Date.now for consistent testing
const mockDateNow = jest.fn(() => 1640995200000); // 2022-01-01T00:00:00.000Z
Object.defineProperty(Date, 'now', {
  value: mockDateNow
});

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  sessionStorageMock.removeItem.mockClear();
  sessionStorageMock.clear.mockClear();
});

// Helper function to create mock tasks
export const createMockTask = (overrides = {}) => ({
  id: 'test-task-1',
  title: 'Test Task',
  description: 'Test Description',
  status: 'todo' as const,
  keywords: [],
  priority: 2 as const,
  createdAt: new Date('2022-01-01T00:00:00.000Z'),
  updatedAt: new Date('2022-01-01T00:00:00.000Z'),
  ...overrides
});

// Helper function to create mock working hours
export const createMockWorkingHours = () => ({
  monday: { start: '09:00', end: '18:00', enabled: true },
  tuesday: { start: '09:00', end: '18:00', enabled: true },
  wednesday: { start: '09:00', end: '18:00', enabled: true },
  thursday: { start: '09:00', end: '18:00', enabled: true },
  friday: { start: '09:00', end: '18:00', enabled: true },
  saturday: { start: '10:00', end: '16:00', enabled: false },
  sunday: { start: '10:00', end: '16:00', enabled: false }
});

// Helper function to create mock task estimation
export const createMockEstimation = (overrides = {}) => ({
  準備: 12,
  設計: 18,
  実装: 24,
  改善: 6,
  total: 60,
  confidence: 0.7,
  ...overrides
});

// Helper function to create mock calendar event
export const createMockCalendarEvent = (overrides = {}) => ({
  id: 'event-1',
  taskId: 'test-task-1',
  phase: '実装' as const,
  startTime: new Date('2022-01-01T10:00:00.000Z'),
  endTime: new Date('2022-01-01T11:00:00.000Z'),
  googleEventId: 'google-event-1',
  ...overrides
});

// Helper function to create mock rescheduling event
export const createMockReschedulingEvent = (overrides = {}) => ({
  id: 'reschedule-1',
  triggeredBy: 'calendar_change' as const,
  affectedTasks: ['test-task-1'],
  timestamp: new Date('2022-01-01T00:00:00.000Z'),
  changes: [{
    taskId: 'test-task-1',
    oldSchedule: {
      start: new Date('2022-01-01T10:00:00.000Z'),
      end: new Date('2022-01-01T11:00:00.000Z')
    },
    newSchedule: {
      start: new Date('2022-01-01T14:00:00.000Z'),
      end: new Date('2022-01-01T15:00:00.000Z')
    }
  }],
  ...overrides
});

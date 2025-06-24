import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Settings, Bell, Calendar, Trash2, Clock } from 'lucide-react';
import CalendarSettings from './components/CalendarSettings';
import ScheduleView from './components/ScheduleView';
import { scheduleTask, estimateTaskTime } from './services/scheduler';
import { createEvent, isSignedIn } from './services/googleCalendar';

// Types
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'doing' | 'done' | 'wiki';
  project?: string;
  keywords: string[];
  priority: 1 | 2 | 3;
  dueDate?: Date;
  notificationTime?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Google Calendar integration fields
  calendarEvents?: CalendarEvent[];
  scheduledStartDate?: Date;
  scheduledEndDate?: Date;
  workspace?: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface Workspace {
  id: string;
  name: string;
  color: string;
}

// Google Calendar integration types
export interface WorkingHours {
  monday: { start: string; end: string; enabled: boolean };
  tuesday: { start: string; end: string; enabled: boolean };
  wednesday: { start: string; end: string; enabled: boolean };
  thursday: { start: string; end: string; enabled: boolean };
  friday: { start: string; end: string; enabled: boolean };
  saturday: { start: string; end: string; enabled: boolean };
  sunday: { start: string; end: string; enabled: boolean };
}

export interface CalendarEvent {
  id: string;
  taskId: string;
  phase: 'incubation' | 'design' | 'implementation' | 'improvement';
  startTime: Date;
  endTime: Date;
  googleEventId?: string;
}

export interface UserSettings {
  workingHours: WorkingHours;
  googleCalendarEnabled: boolean;
  defaultTaskDuration: number; // minutes
  bufferTime: number; // buffer time between tasks (minutes)
  googleAccessToken?: string;
  googleRefreshToken?: string;
}

// Utility functions for natural language processing
const parseQuickInput = (input: string): Partial<Task> => {
  console.log('🔍 Parsing input:', input);

  // ハッシュタグ抽出: #買い物 #緊急
  const hashtags = [...input.matchAll(/#([^\s]+)/g)].map(m => m[1]);
  console.log('📝 Extracted hashtags:', hashtags);

  // プロジェクト抽出: プロジェクト:家事 or @家事
  const projectMatch = input.match(/(?:プロジェクト:|@)([^\s]+)/);
  const project = projectMatch?.[1];
  console.log('📁 Extracted project:', project);

  // 優先度抽出: ！！！ or 重要 or 緊急
  let priority: 1 | 2 | 3 = 2;
  if (input.includes('！！！') || input.includes('緊急') || input.includes('高')) {
    priority = 3;
  } else if (input.includes('！！') || input.includes('重要') || input.includes('中')) {
    priority = 2;
  } else if (input.includes('！') && !input.includes('！！')) {
    priority = 2;
  } else if (input.includes('低') || input.includes('後で')) {
    priority = 1;
  }
  console.log('⭐ Extracted priority:', priority);

  // 日時解析
  console.log('📅 Starting datetime parsing...');
  const { dueDate, notificationTime } = parseDatetime(input);
  console.log('📅 Final extracted dates:', {
    dueDate: dueDate ? dueDate.toLocaleString('ja-JP') : 'なし',
    notificationTime: notificationTime ? notificationTime.toLocaleString('ja-JP') : 'なし'
  });
  
  // ステータス判定
  let status: Task['status'] = 'todo';
  if (input.includes('メモ') || input.includes('wiki') || input.includes('資料')) status = 'wiki';
  if (input.includes('進行中') || input.includes('作業中')) status = 'doing';
  
  // タイトル抽出（上記要素を除去）
  let title = input
    .replace(/#[^\s]+/g, '') // ハッシュタグ除去
    .replace(/(?:プロジェクト:|@)[^\s]+/g, '') // プロジェクト除去
    .replace(/！+/g, '') // 感嘆符除去
    .replace(/(重要|緊急|高|中|低|後で)/g, '') // 優先度キーワード除去
    .replace(/(明日|今日)\s*\d{1,2}時/g, '') // 時間指定除去
    .replace(/(明日|今日)/g, '') // 日付キーワード除去（時間指定なしの場合）
    .replace(/(月|火|水|木|金|土|日)曜日?/g, '') // 曜日除去
    .replace(/\d+時間後/g, '') // 相対時間除去
    .replace(/(メモ|wiki|資料|進行中|作業中)/g, '') // ステータスキーワード除去
    .replace(/に?通知/g, '') // 通知キーワード除去
    .replace(/\s+/g, ' ') // 複数スペースを1つに
    .trim();
  
  const result = {
    title: title || input,
    project,
    keywords: hashtags,
    priority,
    dueDate,
    notificationTime,
    status
  };
  
  console.log('Parse result:', result);
  return result;
};

const parseDatetime = (input: string) => {
  const now = new Date();
  let dueDate: Date | undefined;
  let notificationTime: Date | undefined;

  // 明日15時 - 時間指定がある場合はdueDateとnotificationTimeの両方を設定
  const tomorrowMatch = input.match(/明日\s*(\d{1,2})時/);
  if (tomorrowMatch) {
    const hour = parseInt(tomorrowMatch[1]);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hour, 0, 0, 0);
    dueDate = new Date(tomorrow); // dueDateも設定
    notificationTime = tomorrow;
    console.log('Tomorrow with time match found:', tomorrow);
  }

  // 今日17時 - 時間指定がある場合はdueDateとnotificationTimeの両方を設定
  const todayMatch = input.match(/今日\s*(\d{1,2})時/);
  if (todayMatch) {
    const hour = parseInt(todayMatch[1]);
    const today = new Date(now);
    today.setHours(hour, 0, 0, 0);
    dueDate = new Date(today); // dueDateも設定
    notificationTime = today;
    console.log('Today with time match found:', today);
  }

  // 明日（時間指定なし）
  if (input.includes('明日') && !tomorrowMatch) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999); // 明日の終わりまで
    dueDate = tomorrow;
    console.log('Tomorrow dueDate set:', tomorrow);
  }

  // 今日（時間指定なし）
  if (input.includes('今日') && !todayMatch) {
    const today = new Date(now);
    today.setHours(23, 59, 59, 999); // 今日の終わりまで
    dueDate = today;
    console.log('Today dueDate set:', today);
  }

  // 曜日指定
  const dayMap: Record<string, number> = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 0 };
  const dayMatch = input.match(/(月|火|水|木|金|土|日)曜日?/);
  if (dayMatch) {
    const targetDay = dayMap[dayMatch[1]];
    const nextWeekday = new Date(now);
    const daysUntilTarget = (targetDay - now.getDay() + 7) % 7 || 7;
    nextWeekday.setDate(now.getDate() + daysUntilTarget);
    nextWeekday.setHours(23, 59, 59, 999); // その日の終わりまで
    dueDate = nextWeekday;
    console.log('Day match found:', nextWeekday);
  }

  // 2時間後
  const hoursMatch = input.match(/(\d+)時間後/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1]);
    const futureTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
    dueDate = new Date(futureTime); // dueDateも設定
    notificationTime = futureTime;
    console.log('Hours match found:', futureTime);
  }

  console.log('parseDatetime result:', { dueDate, notificationTime });
  return { dueDate, notificationTime };
};

// Local storage utilities
const STORAGE_KEYS = {
  TASKS: 'familytasks_tasks',
  PROJECTS: 'familytasks_projects',
  WORKSPACES: 'familytasks_workspaces',
  CURRENT_WORKSPACE: 'familytasks_current_workspace',
  USER_SETTINGS: 'familytasks_user_settings',
  GOOGLE_ACCESS_TOKEN: 'familytasks_google_access_token',
  GOOGLE_TOKEN_EXPIRY: 'familytasks_google_token_expiry'
};

// Default settings
const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: { start: '09:00', end: '18:00', enabled: true },
  tuesday: { start: '09:00', end: '18:00', enabled: true },
  wednesday: { start: '09:00', end: '18:00', enabled: true },
  thursday: { start: '09:00', end: '18:00', enabled: true },
  friday: { start: '09:00', end: '18:00', enabled: true },
  saturday: { start: '10:00', end: '16:00', enabled: false },
  sunday: { start: '10:00', end: '16:00', enabled: false }
};

const DEFAULT_USER_SETTINGS: UserSettings = {
  workingHours: DEFAULT_WORKING_HOURS,
  googleCalendarEnabled: false,
  defaultTaskDuration: 60, // 1 hour
  bufferTime: 15 // 15 minutes
};

const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    const parsed = JSON.parse(stored);
    // Date objectsを復元
    if (key === STORAGE_KEYS.TASKS) {
      return parsed.map((task: any) => ({
        ...task,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        notificationTime: task.notificationTime ? new Date(task.notificationTime) : undefined,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt)
      }));
    }
    return parsed;
  } catch {
    return defaultValue;
  }
};

const saveToStorage = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

// Main component
const FamilyTasksPWA: React.FC = () => {
  // State
  const [tasks, setTasks] = useState<Task[]>(() => loadFromStorage(STORAGE_KEYS.TASKS, []));
  const [projects] = useState<Project[]>(() => loadFromStorage(STORAGE_KEYS.PROJECTS, [
    { id: '1', name: '家事', color: '#10B981', icon: '🏠' },
    { id: '2', name: '仕事', color: '#3B82F6', icon: '💼' },
    { id: '3', name: '買い物', color: '#F59E0B', icon: '🛒' }
  ]));
  const [workspaces] = useState<Workspace[]>(() => loadFromStorage(STORAGE_KEYS.WORKSPACES, [
    { id: '1', name: 'プライベート', color: '#3B82F6' },
    { id: '2', name: '家族', color: '#10B981' }
  ]));
  const [currentWorkspace, setCurrentWorkspace] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_WORKSPACE, '1')
  );
  const [userSettings, setUserSettings] = useState<UserSettings>(() =>
    loadFromStorage(STORAGE_KEYS.USER_SETTINGS, DEFAULT_USER_SETTINGS)
  );
  
  const [quickInput, setQuickInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [showScheduleView, setShowScheduleView] = useState(false);
  const [notification, setNotification] = useState<string>('');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isSchedulingTask, setIsSchedulingTask] = useState(false);
  
  const quickInputRef = useRef<HTMLInputElement>(null);
  
  // Auto-save to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.TASKS, tasks);
  }, [tasks]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PROJECTS, projects);
  }, [projects]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.WORKSPACES, workspaces);
  }, [workspaces]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_WORKSPACE, currentWorkspace);
  }, [currentWorkspace]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.USER_SETTINGS, userSettings);
  }, [userSettings]);
  
  // Quick add task
  const handleQuickAdd = async () => {
    if (!quickInput.trim() || isAddingTask) return;

    setIsAddingTask(true);

    const parsed = parseQuickInput(quickInput);
    const newTask: Task = {
      id: Date.now().toString(),
      title: parsed.title || quickInput,
      description: '',
      status: parsed.status || 'todo',
      project: parsed.project,
      keywords: parsed.keywords || [],
      priority: parsed.priority || 2,
      dueDate: parsed.dueDate,
      notificationTime: parsed.notificationTime,
      createdAt: new Date(),
      updatedAt: new Date(),
      workspace: currentWorkspace
    };

    // Auto-schedule to Google Calendar if enabled and has due date
    console.log('Calendar scheduling check:', {
      googleCalendarEnabled: userSettings.googleCalendarEnabled,
      isSignedIn: isSignedIn(),
      hasDueDate: !!newTask.dueDate,
      taskTitle: newTask.title,
      dueDate: newTask.dueDate,
      userSettings: userSettings
    });

    if (userSettings.googleCalendarEnabled && isSignedIn() && newTask.dueDate) {
      try {
        // Show progress notification
        setNotification('📅 Googleカレンダーにスケジュール中...');

        console.log('Starting calendar scheduling for task:', newTask.title);
        const estimation = estimateTaskTime(newTask);
        console.log('Task estimation:', estimation);

        setNotification('🔍 最適な時間を検索中...');
        const calendarEvents = await scheduleTask(
          newTask,
          estimation,
          userSettings.workingHours,
          userSettings.bufferTime
        );
        console.log('Generated calendar events:', calendarEvents);

        // Create events in Google Calendar
        setNotification('📝 カレンダーイベントを作成中...');
        const googleEvents = [];
        for (let i = 0; i < calendarEvents.length; i++) {
          const event = calendarEvents[i];
          setNotification(`📝 イベント作成中... (${i + 1}/${calendarEvents.length})`);
          console.log('Creating calendar event:', event);
          const googleEvent = await createEvent(event, newTask.title);
          console.log('Created Google event:', googleEvent);
          googleEvents.push({
            ...event,
            googleEventId: googleEvent.id
          });
        }

        newTask.calendarEvents = googleEvents;
        newTask.scheduledStartDate = calendarEvents[0]?.startTime;
        newTask.scheduledEndDate = calendarEvents[calendarEvents.length - 1]?.endTime;
        console.log('Successfully scheduled task to calendar');
      } catch (error) {
        console.error('Failed to schedule task to calendar:', error);
        setNotification('❌ カレンダー追加に失敗しました');
        setTimeout(() => setNotification(''), 3000);
        // Continue with task creation even if calendar scheduling fails
      }
    }

    setTasks(prev => [newTask, ...prev]);
    setQuickInput('');

    // Show confirmation
    if (newTask.calendarEvents && newTask.calendarEvents.length > 0) {
      setNotification(`タスク「${newTask.title}」をGoogleカレンダーに追加しました`);
    } else {
      setNotification(`タスク「${newTask.title}」を追加しました`);
    }
    setTimeout(() => setNotification(''), 3000);

    // Schedule notification if needed
    if (newTask.notificationTime) {
      scheduleNotification(newTask);
    }

    setIsAddingTask(false);
  };
  
  // Schedule browser notification
  const scheduleNotification = (task: Task) => {
    if (!task.notificationTime || !('Notification' in window)) return;
    
    const delay = task.notificationTime.getTime() - Date.now();
    if (delay <= 0) return;
    
    setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification('📋 タスクのお知らせ', {
          body: task.title,
          icon: '/icons/icon-192x192.png',
          tag: task.id
        });
      }
    }, delay);
  };
  
  // Request notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };
  
  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(query) ||
        task.keywords.some(k => k.toLowerCase().includes(query)) ||
        task.project?.toLowerCase().includes(query)
      );
    }
    return true;
  });
  
  // Group tasks by status
  const tasksByStatus = {
    todo: filteredTasks.filter(t => t.status === 'todo'),
    doing: filteredTasks.filter(t => t.status === 'doing'),
    done: filteredTasks.filter(t => t.status === 'done'),
    wiki: filteredTasks.filter(t => t.status === 'wiki')
  };
  
  // Update task status
  const updateTaskStatus = (taskId: string, newStatus: Task['status']) => {
    setTasks(prev => prev.map(task =>
      task.id === taskId
        ? { ...task, status: newStatus, updatedAt: new Date() }
        : task
    ));
  };

  // Update task
  const updateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(task =>
      task.id === updatedTask.id ? updatedTask : task
    ));
  };

  // Delete task
  const deleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
    setSelectedTask(null);
  };
  
  // Get project info
  const getProject = (projectName?: string) => {
    return projects.find(p => p.name === projectName);
  };
  
  // Priority colors
  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 3: return 'text-red-500';
      case 2: return 'text-yellow-500';
      case 1: return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };
  
  // Task card component
  const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
    const project = getProject(task.project);
    const isOverdue = task.dueDate && task.dueDate < new Date() && task.status !== 'done';
    const isUpcoming = task.notificationTime && task.notificationTime > new Date() && 
                       task.notificationTime.getTime() - Date.now() < 24 * 60 * 60 * 1000; // 24時間以内
    
    return (
      <div 
        className={`bg-white rounded-lg p-3 shadow-sm border cursor-pointer hover:shadow-md transition-shadow ${
          isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200'
        }`}
        onClick={() => setSelectedTask(task)}
      >
        {/* Header with title and priority */}
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-gray-900 flex-1 mr-2">{task.title}</h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Priority indicator */}
            <span className={`text-sm font-bold ${getPriorityColor(task.priority)}`}>
              {task.priority === 3 ? '🔴' : task.priority === 1 ? '🔵' : '🟡'}
            </span>
          </div>
        </div>
        
        {/* Keywords */}
        {task.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {task.keywords.map(keyword => (
              <span key={keyword} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                #{keyword}
              </span>
            ))}
          </div>
        )}
        
        {/* Project info */}
        {project && (
          <div className="mb-2">
            <span 
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full text-white font-medium"
              style={{ backgroundColor: project.color }}
            >
              {project.icon} {project.name}
            </span>
          </div>
        )}
        
        {/* Date and time info */}
        <div className="space-y-1">
          {task.dueDate && (
            <div className={`flex items-center gap-1 text-xs ${
              isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'
            }`}>
              <Calendar className="w-3 h-3" />
              <span>期限: {task.dueDate.toLocaleDateString('ja-JP', {
                month: 'short',
                day: 'numeric',
                weekday: 'short'
              })}</span>
              {isOverdue && <span className="text-red-500 font-bold">⚠️ 期限切れ</span>}
            </div>
          )}

          {task.notificationTime && (
            <div className={`flex items-center gap-1 text-xs ${
              isUpcoming ? 'text-orange-600 font-medium' : 'text-gray-600'
            }`}>
              <Bell className="w-3 h-3" />
              <span>通知: {task.notificationTime.toLocaleString('ja-JP', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</span>
              {isUpcoming && <span className="text-orange-500">🔔 まもなく</span>}
            </div>
          )}

          {/* Calendar integration status */}
          {task.calendarEvents && task.calendarEvents.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <Calendar className="w-3 h-3" />
              <span>📅 Googleカレンダーに追加済み ({task.calendarEvents.length}件)</span>
            </div>
          )}
        </div>
        
        {/* Created date */}
        <div className="mt-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            作成: {task.createdAt.toLocaleDateString('ja-JP')}
          </span>
        </div>
      </div>
    );
  };
  
  // Kanban column component
  const KanbanColumn: React.FC<{ 
    title: string; 
    status: Task['status']; 
    tasks: Task[]; 
    color: string 
  }> = ({ title, tasks, color }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: color }}></div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {tasks.length}
        </span>
      </div>
      
      <div className="space-y-3 min-h-[200px]">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
        
        {tasks.length === 0 && (
          <div className="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded-lg">
            タスクがありません
          </div>
        )}
      </div>
    </div>
  );
  
  // Initialize notifications on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">FamilyTasks</h1>
              <select 
                value={currentWorkspace}
                onChange={(e) => setCurrentWorkspace(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowScheduleView(true)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                title="スケジュール表示"
              >
                <Clock className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowCalendarSettings(true)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                title="カレンダー設定"
              >
                <Calendar className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={requestNotificationPermission}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
              >
                <Bell className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Quick Add */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={quickInputRef}
                type="text"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isAddingTask && handleQuickAdd()}
                placeholder={isAddingTask ? "タスクを追加中..." : "タスクを追加: 「牛乳買う #買い物 @家事 明日15時」"}
                disabled={isAddingTask}
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isAddingTask ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
              />
              <button
                onClick={handleQuickAdd}
                disabled={isAddingTask}
                className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 rounded ${
                  isAddingTask
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600'
                } text-white`}
              >
                {isAddingTask ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="検索..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>
      
      {/* Notification */}
      {notification && (
        <div className={`fixed top-32 left-1/2 transform -translate-x-1/2 text-white px-4 py-2 rounded-lg shadow-lg z-50 ${
          notification.includes('❌') || notification.includes('失敗')
            ? 'bg-red-500'
            : notification.includes('📅') || notification.includes('🔍') || notification.includes('📝')
            ? 'bg-blue-500'
            : 'bg-green-500'
        }`}>
          {notification}
        </div>
      )}
      
      {/* Kanban Board */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <KanbanColumn 
            title="ToDo" 
            status="todo" 
            tasks={tasksByStatus.todo} 
            color="#F59E0B" 
          />
          <KanbanColumn 
            title="進行中" 
            status="doing" 
            tasks={tasksByStatus.doing} 
            color="#3B82F6" 
          />
          <KanbanColumn 
            title="完了" 
            status="done" 
            tasks={tasksByStatus.done} 
            color="#10B981" 
          />
          <KanbanColumn 
            title="Wiki" 
            status="wiki" 
            tasks={tasksByStatus.wiki} 
            color="#8B5CF6" 
          />
        </div>
      </main>
      
      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">タスク詳細</h3>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
                <p className="text-gray-900">{selectedTask.title}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                <select
                  value={selectedTask.status}
                  onChange={(e) => updateTaskStatus(selectedTask.id, e.target.value as Task['status'])}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  <option value="todo">ToDo</option>
                  <option value="doing">進行中</option>
                  <option value="done">完了</option>
                  <option value="wiki">Wiki</option>
                </select>
              </div>
              
              {selectedTask.project && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">プロジェクト</label>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const project = getProject(selectedTask.project);
                      return project ? (
                        <span 
                          className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full text-white font-medium"
                          style={{ backgroundColor: project.color }}
                        >
                          {project.icon} {project.name}
                        </span>
                      ) : (
                        <span className="text-gray-900">{selectedTask.project}</span>
                      );
                    })()}
                  </div>
                </div>
              )}
              
              {selectedTask.priority && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${getPriorityColor(selectedTask.priority)}`}>
                      {selectedTask.priority === 3 ? '🔴 高' : selectedTask.priority === 1 ? '🔵 低' : '🟡 中'}
                    </span>
                    <select
                      value={selectedTask.priority}
                      onChange={(e) => {
                        const updatedTask = { ...selectedTask, priority: parseInt(e.target.value) as 1 | 2 | 3 };
                        setTasks(prev => prev.map(task => 
                          task.id === selectedTask.id ? updatedTask : task
                        ));
                        setSelectedTask(updatedTask);
                      }}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      <option value={1}>🔵 低</option>
                      <option value={2}>🟡 中</option>
                      <option value={3}>🔴 高</option>
                    </select>
                  </div>
                </div>
              )}
              
              {selectedTask.dueDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">期限</label>
                  <p className="text-gray-900">
                    {selectedTask.dueDate.toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    })}
                  </p>
                </div>
              )}
              
              {selectedTask.keywords.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">キーワード</label>
                  <div className="flex flex-wrap gap-1">
                    {selectedTask.keywords.map(keyword => (
                      <span key={keyword} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        #{keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedTask.notificationTime && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">通知時刻</label>
                  <p className="text-gray-900">
                    {selectedTask.notificationTime.toLocaleString('ja-JP')}
                  </p>
                </div>
              )}
              
              {/* Calendar integration button */}
              {userSettings.googleCalendarEnabled && isSignedIn() && selectedTask.dueDate && (
                <div className="pt-4 border-t border-gray-200">
                  {selectedTask.calendarEvents && selectedTask.calendarEvents.length > 0 ? (
                    <div className="text-sm text-green-600 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>Googleカレンダーに追加済み ({selectedTask.calendarEvents.length}件)</span>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        if (isSchedulingTask) return;
                        setIsSchedulingTask(true);
                        try {
                          setNotification('📅 Googleカレンダーにスケジュール中...');
                          const estimation = estimateTaskTime(selectedTask);
                          const calendarEvents = await scheduleTask(
                            selectedTask,
                            estimation,
                            userSettings.workingHours,
                            userSettings.bufferTime
                          );

                          setNotification('📝 カレンダーイベントを作成中...');
                          // Create events in Google Calendar
                          const googleEvents = [];
                          for (const event of calendarEvents) {
                            const googleEvent = await createEvent(event, selectedTask.title);
                            googleEvents.push({
                              ...event,
                              googleEventId: googleEvent.id
                            });
                          }

                          const updatedTask = {
                            ...selectedTask,
                            calendarEvents: googleEvents,
                            scheduledStartDate: calendarEvents[0]?.startTime,
                            scheduledEndDate: calendarEvents[calendarEvents.length - 1]?.endTime
                          };

                          updateTask(updatedTask);
                          setSelectedTask(updatedTask);
                          setNotification(`✅ タスク「${selectedTask.title}」をGoogleカレンダーに追加しました`);
                          setTimeout(() => setNotification(''), 3000);
                        } catch (error) {
                          console.error('Failed to schedule task:', error);
                          setNotification('❌ カレンダーへの追加に失敗しました');
                          setTimeout(() => setNotification(''), 3000);
                        } finally {
                          setIsSchedulingTask(false);
                        }
                      }}
                      disabled={isSchedulingTask}
                      className={`w-full py-2 px-4 rounded flex items-center justify-center gap-2 ${
                        isSchedulingTask
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-500 hover:bg-blue-600'
                      } text-white`}
                    >
                      {isSchedulingTask ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          追加中...
                        </>
                      ) : (
                        <>
                          <Calendar className="w-4 h-4" />
                          Googleカレンダーに追加
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => deleteTask(selectedTask.id)}
                  className="flex-1 bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  削除
                </button>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="flex-1 bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Settings Modal */}
      {showCalendarSettings && (
        <CalendarSettings
          userSettings={userSettings}
          onSettingsChange={setUserSettings}
          onClose={() => setShowCalendarSettings(false)}
        />
      )}

      {/* Schedule View Modal */}
      {showScheduleView && (
        <ScheduleView
          tasks={tasks}
          userSettings={userSettings}
          onTaskUpdate={updateTask}
          onClose={() => setShowScheduleView(false)}
        />
      )}
    </div>
  );
};

export default FamilyTasksPWA;
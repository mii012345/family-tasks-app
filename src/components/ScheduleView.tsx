import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Task, CalendarEvent, UserSettings } from '../App';
import { scheduleTask, estimateTaskTime } from '../services/scheduler';
import { createEvent } from '../services/googleCalendar';

interface ScheduleViewProps {
  tasks: Task[];
  userSettings: UserSettings;
  onTaskUpdate: (task: Task) => void;
  onClose: () => void;
}

const ScheduleView: React.FC<ScheduleViewProps> = ({
  tasks,
  userSettings,
  onTaskUpdate,
  onClose
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);

  // Auto-schedule tasks when component mounts
  useEffect(() => {
    autoScheduleTasks();
  }, [tasks, userSettings]);

  // Auto-schedule unscheduled tasks
  const autoScheduleTasks = async () => {
    if (!userSettings.googleCalendarEnabled) return;

    setIsScheduling(true);
    const updatedTasks: Task[] = [];

    for (const task of tasks) {
      if (task.status !== 'done' && task.dueDate && !task.calendarEvents) {
        try {
          const estimation = estimateTaskTime(task);
          const calendarEvents = await scheduleTask(
            task,
            estimation,
            userSettings.workingHours,
            userSettings.bufferTime
          );

          // Create events in Google Calendar
          const googleEvents = [];
          for (const event of calendarEvents) {
            const googleEvent = await createEvent(event, task.title);
            googleEvents.push({
              ...event,
              googleEventId: googleEvent.id
            });
          }

          const updatedTask = {
            ...task,
            calendarEvents: googleEvents,
            scheduledStartDate: calendarEvents[0]?.startTime,
            scheduledEndDate: calendarEvents[calendarEvents.length - 1]?.endTime
          };

          updatedTasks.push(updatedTask);
          onTaskUpdate(updatedTask);
        } catch (error) {
          console.error('Failed to schedule task:', task.title, error);
        }
      } else {
        updatedTasks.push(task);
      }
    }

    setScheduledTasks(updatedTasks);
    setIsScheduling(false);
  };

  // Get tasks for current view
  const getTasksForView = () => {
    const startDate = getViewStartDate();
    const endDate = getViewEndDate();

    return scheduledTasks.filter(task => {
      if (!task.calendarEvents) return false;
      
      return task.calendarEvents.some((event: CalendarEvent) =>
        event.startTime >= startDate && event.startTime <= endDate
      );
    });
  };

  // Get view start date
  const getViewStartDate = () => {
    if (viewMode === 'day') {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      return start;
    } else {
      const start = new Date(currentDate);
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      return start;
    }
  };

  // Get view end date
  const getViewEndDate = () => {
    if (viewMode === 'day') {
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      return end;
    } else {
      const end = new Date(currentDate);
      const dayOfWeek = end.getDay();
      end.setDate(end.getDate() + (6 - dayOfWeek));
      end.setHours(23, 59, 59, 999);
      return end;
    }
  };

  // Navigate to previous period
  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  // Navigate to next period
  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  // Get time slots for display
  const getTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour < 24; hour++) {
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:00`,
        hour
      });
    }
    return slots;
  };

  // Get events for specific time slot
  const getEventsForSlot = (date: Date, hour: number) => {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(date);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    const events: Array<{ task: Task; event: CalendarEvent }> = [];

    for (const task of getTasksForView()) {
      if (!task.calendarEvents) continue;

      for (const event of task.calendarEvents) {
        if (event.startTime < slotEnd && event.endTime > slotStart) {
          events.push({ task, event });
        }
      }
    }

    // Sort events by phase order (準備 -> 設計 -> 実装 -> 改善), then by start time
    return events.sort((a, b) => {
      const phaseOrderA = getPhaseOrder(a.event.phase);
      const phaseOrderB = getPhaseOrder(b.event.phase);

      if (phaseOrderA !== phaseOrderB) {
        return phaseOrderA - phaseOrderB;
      }

      // If same phase, sort by start time
      return a.event.startTime.getTime() - b.event.startTime.getTime();
    });
  };

  // Get phase color
  const getPhaseColor = (phase: CalendarEvent['phase']) => {
    const colors: Record<CalendarEvent['phase'], string> = {
      準備: 'bg-blue-100 text-blue-800 border-blue-200',
      設計: 'bg-green-100 text-green-800 border-green-200',
      実装: 'bg-purple-100 text-purple-800 border-purple-200',
      改善: 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[phase];
  };

  // Get phase label
  const getPhaseLabel = (phase: CalendarEvent['phase']) => {
    const labels: Record<CalendarEvent['phase'], string> = {
      準備: '準備',
      設計: '設計',
      実装: '実装',
      改善: '改善'
    };
    return labels[phase];
  };

  // Get phase order for sorting (準備 -> 設計 -> 実装 -> 改善)
  const getPhaseOrder = (phase: CalendarEvent['phase']): number => {
    const order: Record<CalendarEvent['phase'], number> = {
      準備: 1,
      設計: 2,
      実装: 3,
      改善: 4
    };
    return order[phase] || 999;
  };

  // Render day view
  const renderDayView = () => {
    const timeSlots = getTimeSlots();
    
    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="font-medium text-center py-2 bg-gray-50 rounded">
              {currentDate.toLocaleDateString('ja-JP', { 
                month: 'short', 
                day: 'numeric',
                weekday: 'short'
              })}
            </div>
            {timeSlots.map(slot => {
              const events = getEventsForSlot(currentDate, slot.hour);
              return (
                <div key={slot.time} className="flex border-b border-gray-100">
                  <div className="w-16 text-sm text-gray-500 py-2 px-2">
                    {slot.time}
                  </div>
                  <div className="flex-1 min-h-[60px] p-2">
                    {events.map(({ task, event }, index) => (
                      <div
                        key={`${task.id}-${event.id}-${index}`}
                        className={`text-xs p-2 rounded border mb-1 ${getPhaseColor(event.phase)}`}
                      >
                        <div className="font-medium truncate">{task.title}</div>
                        <div className="text-xs opacity-75">
                          {getPhaseLabel(event.phase)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Render week view
  const renderWeekView = () => {
    const startDate = getViewStartDate();
    const days: Date[] = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }

    const timeSlots = getTimeSlots();

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-8 gap-1">
          <div className="w-16"></div>
          {days.map(day => (
            <div key={day.toISOString()} className="font-medium text-center py-2 bg-gray-50 rounded text-sm">
              {day.toLocaleDateString('ja-JP', { 
                month: 'short', 
                day: 'numeric',
                weekday: 'short'
              })}
            </div>
          ))}
          
          {timeSlots.map(slot => (
            <React.Fragment key={slot.time}>
              <div className="w-16 text-sm text-gray-500 py-2 px-2 border-b border-gray-100">
                {slot.time}
              </div>
              {days.map(day => {
                const events = getEventsForSlot(day, slot.hour);
                return (
                  <div key={`${day.toISOString()}-${slot.time}`} className="min-h-[60px] p-1 border-b border-gray-100">
                    {events.map(({ task, event }, index) => (
                      <div
                        key={`${task.id}-${event.id}-${index}`}
                        className={`text-xs p-1 rounded border mb-1 ${getPhaseColor(event.phase)}`}
                      >
                        <div className="font-medium truncate text-xs">{task.title}</div>
                        <div className="text-xs opacity-75">
                          {getPhaseLabel(event.phase)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              スケジュール表示
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          
          {/* Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button
                onClick={navigatePrevious}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium">
                {viewMode === 'day' 
                  ? currentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
                  : `${getViewStartDate().toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} - ${getViewEndDate().toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}`
                }
              </span>
              <button
                onClick={navigateNext}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-1 rounded text-sm ${
                  viewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                日
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1 rounded text-sm ${
                  viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                週
              </button>
              <button
                onClick={autoScheduleTasks}
                disabled={isScheduling}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {isScheduling ? '調整中...' : '再調整'}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {viewMode === 'day' ? renderDayView() : renderWeekView()}
      </div>
    </div>
  );
};

export default ScheduleView;

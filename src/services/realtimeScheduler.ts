import { Task, WorkingHours, CalendarEvent, TaskEstimation, ReschedulingEvent } from '../App';
import { isTimeSlotAvailable } from './googleCalendar';
import { scheduleTask } from './scheduler';

// Real-time scheduler for issue #9
export class RealtimeScheduler {
  private static instance: RealtimeScheduler;
  private reschedulingInProgress = false;
  private eventListeners: Map<string, (event: ReschedulingEvent) => void> = new Map();

  private constructor() {}

  public static getInstance(): RealtimeScheduler {
    if (!RealtimeScheduler.instance) {
      RealtimeScheduler.instance = new RealtimeScheduler();
    }
    return RealtimeScheduler.instance;
  }

  // Add event listener for rescheduling events
  public addEventListener(id: string, listener: (event: ReschedulingEvent) => void): void {
    this.eventListeners.set(id, listener);
  }

  // Remove event listener
  public removeEventListener(id: string): void {
    this.eventListeners.delete(id);
  }

  // Notify all listeners about rescheduling event
  private notifyListeners(event: ReschedulingEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in rescheduling event listener:', error);
      }
    });
  }

  // Handle calendar change event from webhook
  public async handleCalendarChange(
    eventType: 'created' | 'updated' | 'deleted',
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<void> {
    if (this.reschedulingInProgress) {
      console.log('Rescheduling already in progress, skipping...');
      return;
    }

    console.log(`Calendar change detected: ${eventType} - ${eventId}`);

    try {
      this.reschedulingInProgress = true;
      
      // Get affected tasks (tasks that have calendar events)
      const affectedTasks = await this.getAffectedTasks(eventId, calendarId);
      
      if (affectedTasks.length === 0) {
        console.log('No affected tasks found for calendar change');
        return;
      }

      // Trigger rescheduling for affected tasks
      const reschedulingEvent = await this.rescheduleAffectedTasks(
        affectedTasks,
        'calendar_change'
      );

      // Notify listeners
      this.notifyListeners(reschedulingEvent);

    } catch (error) {
      console.error('Error handling calendar change:', error);
    } finally {
      this.reschedulingInProgress = false;
    }
  }

  // Get tasks affected by calendar change
  private async getAffectedTasks(eventId: string, _calendarId: string): Promise<Task[]> {
    // This would typically query the database or local storage
    // For now, we'll return an empty array as a placeholder
    // In real implementation, this would find tasks with calendar events
    // that might be affected by the calendar change
    
    const storedTasks = localStorage.getItem('familytasks_tasks');
    if (!storedTasks) return [];

    const tasks: Task[] = JSON.parse(storedTasks);
    
    // Find tasks that have calendar events that might be affected
    return tasks.filter(task => 
      task.calendarEvents && 
      task.calendarEvents.some(event => event.googleEventId === eventId) &&
      task.status !== 'done'
    );
  }

  // Reschedule affected tasks
  public async rescheduleAffectedTasks(
    tasks: Task[],
    triggeredBy: ReschedulingEvent['triggeredBy'],
    workingHours?: WorkingHours,
    bufferTime: number = 15
  ): Promise<ReschedulingEvent> {
    console.log(`Rescheduling ${tasks.length} affected tasks`);

    const reschedulingEvent: ReschedulingEvent = {
      id: Date.now().toString(),
      triggeredBy,
      affectedTasks: tasks.map(t => t.id),
      timestamp: new Date(),
      changes: []
    };

    // Get default working hours if not provided
    const finalWorkingHours = workingHours || (() => {
      const storedSettings = localStorage.getItem('familytasks_user_settings');
      const userSettings = storedSettings ? JSON.parse(storedSettings) : null;
      return userSettings?.workingHours || this.getDefaultWorkingHours();
    })();

    for (const task of tasks) {
      try {
        const oldSchedule = this.getTaskSchedule(task);

        // Re-estimate task time (this could use learning data in the future)
        const estimation = this.estimateTaskTime(task);

        // Find new available time slots
        let newCalendarEvents;
        try {
          newCalendarEvents = await scheduleTask(
            task,
            estimation,
            finalWorkingHours,
            bufferTime
          );
        } catch (scheduleError) {
          const errorMessage = scheduleError instanceof Error ? scheduleError.message : String(scheduleError);
          console.warn(`Cannot reschedule task ${task.title}: ${errorMessage}`);

          // If scheduling fails, keep the original schedule
          if (task.calendarEvents && task.calendarEvents.length > 0) {
            console.log(`Keeping original schedule for task: ${task.title}`);
            continue; // Skip to next task, keep original schedule
          } else {
            // If no original schedule exists, try with relaxed constraints
            console.log(`Attempting relaxed scheduling for task: ${task.title}`);
            try {
              newCalendarEvents = await this.scheduleTaskWithRelaxedConstraints(
                task,
                estimation,
                finalWorkingHours,
                bufferTime
              );
            } catch (relaxedError) {
              console.error(`Even relaxed scheduling failed for ${task.title}:`, relaxedError);
              continue; // Skip this task entirely
            }
          }
        }

        if (newCalendarEvents && newCalendarEvents.length > 0) {
          const newSchedule = {
            start: newCalendarEvents[0].startTime,
            end: newCalendarEvents[newCalendarEvents.length - 1].endTime
          };

          // Record the change only if schedule actually changed
          if (oldSchedule && (
            oldSchedule.start.getTime() !== newSchedule.start.getTime() ||
            oldSchedule.end.getTime() !== newSchedule.end.getTime()
          )) {
            reschedulingEvent.changes.push({
              taskId: task.id,
              oldSchedule,
              newSchedule
            });
          }

          // Update task with new schedule
          task.calendarEvents = newCalendarEvents;
          task.scheduledStartDate = newSchedule.start;
          task.scheduledEndDate = newSchedule.end;
          task.lastRescheduled = new Date();

          // Add to rescheduling history
          if (!task.reschedulingHistory) {
            task.reschedulingHistory = [];
          }
          task.reschedulingHistory.push(reschedulingEvent);

          console.log(`Rescheduled task: ${task.title}`);
        } else {
          console.warn(`No schedule found for task: ${task.title}, keeping original if exists`);
        }
      } catch (error) {
        console.error(`Failed to reschedule task ${task.title}:`, error);
        // Keep the original schedule - don't modify the task
      }
    }

    // Save rescheduling event to storage
    this.saveReschedulingEvent(reschedulingEvent);

    return reschedulingEvent;
  }

  // Get current schedule of a task
  private getTaskSchedule(task: Task): { start: Date; end: Date } | null {
    if (!task.calendarEvents || task.calendarEvents.length === 0) {
      return null;
    }

    const sortedEvents = task.calendarEvents.sort((a, b) => 
      a.startTime.getTime() - b.startTime.getTime()
    );

    return {
      start: sortedEvents[0].startTime,
      end: sortedEvents[sortedEvents.length - 1].endTime
    };
  }

  // Estimate task time (placeholder - will be enhanced with learning data)
  private estimateTaskTime(task: Task): TaskEstimation {
    // Use existing estimation if available
    if (task.estimation) {
      return task.estimation;
    }

    // Basic estimation logic (to be enhanced with AI/learning)
    const baseTime = 60; // 1 hour base time
    
    // Adjust based on priority
    const priorityMultiplier = task.priority === 3 ? 1.5 : task.priority === 1 ? 0.7 : 1.0;
    const adjustedTime = Math.floor(baseTime * priorityMultiplier);

    return {
      準備: Math.floor(adjustedTime * 0.2),     // 20%
      設計: Math.floor(adjustedTime * 0.3),         // 30%
      実装: Math.floor(adjustedTime * 0.4), // 40%
      改善: Math.floor(adjustedTime * 0.1),    // 10%
      total: adjustedTime,
      confidence: 0.7
    };
  }

  // Get default working hours
  private getDefaultWorkingHours(): WorkingHours {
    return {
      monday: { start: '09:00', end: '18:00', enabled: true },
      tuesday: { start: '09:00', end: '18:00', enabled: true },
      wednesday: { start: '09:00', end: '18:00', enabled: true },
      thursday: { start: '09:00', end: '18:00', enabled: true },
      friday: { start: '09:00', end: '18:00', enabled: true },
      saturday: { start: '10:00', end: '16:00', enabled: false },
      sunday: { start: '10:00', end: '16:00', enabled: false }
    };
  }

  // Save rescheduling event to storage
  private saveReschedulingEvent(event: ReschedulingEvent): void {
    try {
      const stored = localStorage.getItem('familytasks_rescheduling_events');
      const events: ReschedulingEvent[] = stored ? JSON.parse(stored) : [];
      events.push(event);
      
      // Keep only last 100 events to prevent storage bloat
      if (events.length > 100) {
        events.splice(0, events.length - 100);
      }
      
      localStorage.setItem('familytasks_rescheduling_events', JSON.stringify(events));
    } catch (error) {
      console.error('Failed to save rescheduling event:', error);
    }
  }

  // Check if rescheduling is needed for a task
  public async checkReschedulingNeeded(
    task: Task,
    _workingHours: WorkingHours,
    calendarId: string = 'primary'
  ): Promise<boolean> {
    if (!task.calendarEvents || task.calendarEvents.length === 0) {
      return false;
    }

    // Check if any of the task's calendar events have conflicts
    for (const event of task.calendarEvents) {
      const hasConflict = !(await isTimeSlotAvailable(
        event.startTime,
        event.endTime,
        calendarId
      ));
      
      if (hasConflict) {
        return true;
      }
    }

    return false;
  }

  // Schedule task with relaxed constraints (fallback method)
  private async scheduleTaskWithRelaxedConstraints(
    task: Task,
    estimation: TaskEstimation,
    workingHours: WorkingHours,
    bufferTime: number
  ): Promise<CalendarEvent[]> {
    console.log(`Attempting relaxed scheduling for: ${task.title}`);

    // Try extending the due date by a week if it's too tight
    const originalDueDate = task.dueDate;
    if (originalDueDate) {
      const extendedDueDate = new Date(originalDueDate);
      extendedDueDate.setDate(extendedDueDate.getDate() + 7); // Add 7 days

      const taskWithExtendedDue = { ...task, dueDate: extendedDueDate };

      try {
        const events = await scheduleTask(
          taskWithExtendedDue,
          estimation,
          workingHours,
          bufferTime
        );

        console.log(`Successfully scheduled with extended due date: ${task.title}`);
        return events;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`Extended due date scheduling also failed: ${errorMessage}`);
      }
    }

    // If that fails, try with reduced buffer time
    try {
      const reducedBufferTime = Math.max(5, bufferTime / 2); // Minimum 5 minutes
      const events = await scheduleTask(
        task,
        estimation,
        workingHours,
        reducedBufferTime
      );

      console.log(`Successfully scheduled with reduced buffer time: ${task.title}`);
      return events;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`Reduced buffer time scheduling also failed: ${errorMessage}`);
    }

    // If that also fails, try with shorter task duration
    try {
      const reducedEstimation = {
        ...estimation,
        準備: Math.floor(estimation.準備 * 0.7),
        設計: Math.floor(estimation.設計 * 0.7),
        実装: Math.floor(estimation.実装 * 0.7),
        改善: Math.floor(estimation.改善 * 0.7),
        total: Math.floor(estimation.total * 0.7)
      };

      const events = await scheduleTask(
        task,
        reducedEstimation,
        workingHours,
        bufferTime
      );

      console.log(`Successfully scheduled with reduced duration: ${task.title}`);
      return events;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`Reduced duration scheduling also failed: ${errorMessage}`);
      throw new Error(`Cannot schedule task ${task.title} even with relaxed constraints`);
    }
  }

  // Get rescheduling history
  public getReschedulingHistory(): ReschedulingEvent[] {
    try {
      const stored = localStorage.getItem('familytasks_rescheduling_events');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load rescheduling history:', error);
      return [];
    }
  }
}

// Export singleton instance
export const realtimeScheduler = RealtimeScheduler.getInstance();

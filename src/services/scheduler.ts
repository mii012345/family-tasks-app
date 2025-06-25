import { Task, WorkingHours, CalendarEvent, TaskEstimation } from '../App';
import { getEvents, isTimeSlotAvailable } from './googleCalendar';

// Time slot interface
interface TimeSlot {
  start: Date;
  end: Date;
  duration: number; // minutes
}

// Find available time slots within working hours
export const findAvailableTimeSlots = async (
  startDate: Date,
  endDate: Date,
  workingHours: WorkingHours,
  bufferTime: number = 15,
  calendarId: string = 'primary'
): Promise<TimeSlot[]> => {
  const availableSlots: TimeSlot[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dayOfWeek = getDayOfWeek(currentDate);
    const dayConfig = workingHours[dayOfWeek];

    if (dayConfig.enabled) {
      const daySlots = await findDayAvailableSlots(
        currentDate,
        dayConfig.start,
        dayConfig.end,
        bufferTime,
        calendarId
      );
      availableSlots.push(...daySlots);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return availableSlots;
};

// Find available slots for a specific day
const findDayAvailableSlots = async (
  date: Date,
  startTime: string,
  endTime: string,
  bufferTime: number,
  calendarId: string
): Promise<TimeSlot[]> => {
  const slots: TimeSlot[] = [];
  
  // Create start and end times for the day
  const dayStart = new Date(date);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  dayStart.setHours(startHour, startMinute, 0, 0);

  const dayEnd = new Date(date);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  dayEnd.setHours(endHour, endMinute, 0, 0);

  try {
    // Get existing events for the day
    const events = await getEvents(calendarId, dayStart, dayEnd);
    
    // Sort events by start time
    const sortedEvents = events
      .filter((event: any) => event.start?.dateTime && event.end?.dateTime)
      .map((event: any) => ({
        start: new Date(event.start.dateTime),
        end: new Date(event.end.dateTime)
      }))
      .sort((a: any, b: any) => a.start.getTime() - b.start.getTime());

    let currentTime = new Date(dayStart);

    // Find gaps between events
    for (const event of sortedEvents) {
      if (currentTime < event.start) {
        const slotEnd = new Date(event.start.getTime() - bufferTime * 60 * 1000);
        if (slotEnd > currentTime) {
          const duration = Math.floor((slotEnd.getTime() - currentTime.getTime()) / (60 * 1000));
          if (duration >= 30) { // Minimum 30 minutes slot
            slots.push({
              start: new Date(currentTime),
              end: new Date(slotEnd),
              duration
            });
          }
        }
      }
      currentTime = new Date(event.end.getTime() + bufferTime * 60 * 1000);
    }

    // Check for slot after last event
    if (currentTime < dayEnd) {
      const duration = Math.floor((dayEnd.getTime() - currentTime.getTime()) / (60 * 1000));
      if (duration >= 30) {
        slots.push({
          start: new Date(currentTime),
          end: new Date(dayEnd),
          duration
        });
      }
    }

  } catch (error) {
    console.error('Failed to find day available slots:', error);
    // If calendar access fails, assume the entire working day is available
    const duration = Math.floor((dayEnd.getTime() - dayStart.getTime()) / (60 * 1000));
    slots.push({
      start: new Date(dayStart),
      end: new Date(dayEnd),
      duration
    });
  }

  return slots;
};

// Schedule task blocks based on estimation
export const scheduleTask = async (
  task: Task,
  estimation: TaskEstimation,
  workingHours: WorkingHours,
  bufferTime: number = 15,
  calendarId: string = 'primary'
): Promise<CalendarEvent[]> => {
  console.log('scheduleTask: Starting scheduling for task:', task.title);
  if (!task.dueDate) {
    throw new Error('Task must have a due date for scheduling');
  }
  console.log('scheduleTask: Task has due date:', task.dueDate);

  const phases: Array<{ phase: CalendarEvent['phase']; duration: number }> = [
    { phase: '準備' as const, duration: estimation.準備 },
    { phase: '設計' as const, duration: estimation.設計 },
    { phase: '実装' as const, duration: estimation.実装 },
    { phase: '改善' as const, duration: estimation.改善 }
  ].filter(p => p.duration > 0);

  console.log('scheduleTask: Phases to schedule:', phases);

  // Find available time slots from now until due date
  const now = new Date();
  const availableSlots = await findAvailableTimeSlots(
    now,
    task.dueDate,
    workingHours,
    bufferTime,
    calendarId
  );

  // Schedule phases in chronological order (準備 -> 設計 -> 実装 -> 改善)
  const scheduledEvents: CalendarEvent[] = [];
  let remainingPhases = [...phases]; // Remove .reverse() to maintain chronological order

  for (const slot of availableSlots) { // Remove .reverse() to start from earliest available time
    if (remainingPhases.length === 0) break;

    let slotStart = new Date(slot.start);
    let remainingSlotTime = slot.duration;

    while (remainingPhases.length > 0 && remainingSlotTime >= 30) {
      const phase = remainingPhases[0];
      const timeToAllocate = Math.min(phase.duration, remainingSlotTime);

      const eventStart = new Date(slotStart);
      const eventEnd = new Date(slotStart.getTime() + timeToAllocate * 60 * 1000);

      scheduledEvents.push({
        id: `${task.id}-${phase.phase}-${Date.now()}`,
        taskId: task.id,
        phase: phase.phase,
        startTime: eventStart,
        endTime: eventEnd
      });

      // Update remaining time for this phase
      phase.duration -= timeToAllocate;
      if (phase.duration <= 0) {
        remainingPhases.shift();
      }

      // Update slot tracking
      slotStart = new Date(eventEnd.getTime() + bufferTime * 60 * 1000);
      remainingSlotTime -= (timeToAllocate + bufferTime);
    }
  }

  if (remainingPhases.length > 0) {
    const totalRemainingTime = remainingPhases.reduce((sum, phase) => sum + phase.duration, 0);
    const totalAvailableTime = availableSlots.reduce((sum, slot) => sum + slot.duration, 0);

    console.warn(`Scheduling constraint violation for task "${task.title}":`, {
      remainingPhases: remainingPhases.length,
      totalRemainingTime,
      totalAvailableTime,
      dueDate: task.dueDate,
      scheduledEvents: scheduledEvents.length
    });

    throw new Error(
      `Not enough available time to schedule all task phases before due date. ` +
      `Need ${totalRemainingTime} minutes, but only ${totalAvailableTime} minutes available.`
    );
  }

  return scheduledEvents; // Return in chronological order (準備 -> 設計 -> 実装 -> 改善)
};

// Get optimal task duration based on available slots
export const getOptimalTaskDuration = (
  availableSlots: TimeSlot[],
  totalEstimatedTime: number
): number => {
  if (availableSlots.length === 0) return totalEstimatedTime;

  const totalAvailableTime = availableSlots.reduce((sum, slot) => sum + slot.duration, 0);
  
  if (totalAvailableTime < totalEstimatedTime) {
    console.warn('Not enough available time for estimated task duration');
    return totalAvailableTime;
  }

  return totalEstimatedTime;
};

// Reschedule task when calendar changes
export const rescheduleTask = async (
  task: Task,
  estimation: TaskEstimation,
  workingHours: WorkingHours,
  bufferTime: number = 15,
  calendarId: string = 'primary'
): Promise<CalendarEvent[]> => {
  // Remove existing calendar events for this task
  if (task.calendarEvents) {
    // Note: In a real implementation, you would delete these from Google Calendar
    console.log('Removing existing calendar events for task:', task.id);
  }

  // Schedule new events
  return await scheduleTask(task, estimation, workingHours, bufferTime, calendarId);
};

// Utility function to get day of week key
const getDayOfWeek = (date: Date): keyof WorkingHours => {
  const days: Array<keyof WorkingHours> = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  ];
  return days[date.getDay()];
};

// Check if a time slot conflicts with existing events
export const hasTimeConflict = async (
  startTime: Date,
  endTime: Date,
  calendarId: string = 'primary'
): Promise<boolean> => {
  return !(await isTimeSlotAvailable(startTime, endTime, calendarId));
};

// Get next available time slot of specified duration
export const getNextAvailableSlot = async (
  duration: number, // minutes
  workingHours: WorkingHours,
  bufferTime: number = 15,
  calendarId: string = 'primary'
): Promise<TimeSlot | null> => {
  const now = new Date();
  const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const availableSlots = await findAvailableTimeSlots(
    now,
    oneWeekLater,
    workingHours,
    bufferTime,
    calendarId
  );

  return availableSlots.find(slot => slot.duration >= duration) || null;
};

// Enhanced AI estimation using learning engine (issue #9)
export const estimateTaskTime = (task: Task): TaskEstimation => {
  // Import learning engine dynamically to avoid circular dependencies
  try {
    const { learningEngine } = require('./learningEngine');
    return learningEngine.getImprovedEstimation(task);
  } catch (error) {
    console.warn('Learning engine not available, using basic estimation:', error);

    // Fallback to basic estimation
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
};

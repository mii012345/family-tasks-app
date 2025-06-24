import { Task, WorkingHours, CalendarEvent } from '../App';
import { getEvents, isTimeSlotAvailable } from './googleCalendar';

// Time slot interface
interface TimeSlot {
  start: Date;
  end: Date;
  duration: number; // minutes
}

// Task estimation interface (placeholder for AI integration)
interface TaskEstimation {
  incubation: number;    // minutes
  design: number;        // minutes
  implementation: number; // minutes
  improvement: number;   // minutes
  total: number;         // minutes
  confidence: number;    // 0-1
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
    { phase: 'incubation' as const, duration: estimation.incubation },
    { phase: 'design' as const, duration: estimation.design },
    { phase: 'implementation' as const, duration: estimation.implementation },
    { phase: 'improvement' as const, duration: estimation.improvement }
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

  // Schedule phases in reverse order (from due date backwards)
  const scheduledEvents: CalendarEvent[] = [];
  let remainingPhases = [...phases].reverse();

  for (const slot of availableSlots.reverse()) {
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
    throw new Error('Not enough available time to schedule all task phases before due date');
  }

  return scheduledEvents.reverse(); // Return in chronological order
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

// Placeholder for AI estimation (to be implemented with AI service)
export const estimateTaskTime = (_task: Task): TaskEstimation => {
  // This is a placeholder implementation
  // In the real implementation, this would call the AI service
  const baseTime = 60; // 1 hour base time

  return {
    incubation: Math.floor(baseTime * 0.2),     // 20%
    design: Math.floor(baseTime * 0.3),         // 30%
    implementation: Math.floor(baseTime * 0.4), // 40%
    improvement: Math.floor(baseTime * 0.1),    // 10%
    total: baseTime,
    confidence: 0.7
  };
};

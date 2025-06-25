import { useState, useEffect, useCallback, useRef } from 'react';
import { Task, ReschedulingEvent, WorkingHours } from '../App';
import { realtimeScheduler } from '../services/realtimeScheduler';
import { webhookHandler } from '../services/webhookHandler';
import { learningEngine } from '../services/learningEngine';

// Real-time sync hook for issue #9
export const useRealTimeSync = (
  tasks: Task[],
  workingHours: WorkingHours,
  onTasksUpdate: (tasks: Task[]) => void,
  onError?: (error: string) => void
) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [reschedulingEvents, setReschedulingEvents] = useState<ReschedulingEvent[]>([]);
  const [pendingRescheduling, setPendingRescheduling] = useState<ReschedulingEvent | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  
  const eventListenerIdRef = useRef<string>('');

  // Initialize real-time sync
  useEffect(() => {
    const initializeSync = async () => {
      try {
        setSyncStatus('syncing');
        
        // Generate unique listener ID
        eventListenerIdRef.current = `sync-${Date.now()}`;
        
        // Add event listener for rescheduling events
        realtimeScheduler.addEventListener(
          eventListenerIdRef.current,
          handleReschedulingEvent
        );
        
        // Start webhook listener
        webhookHandler.startListening();
        
        // Load existing rescheduling events
        const existingEvents = realtimeScheduler.getReschedulingHistory();
        setReschedulingEvents(existingEvents);
        
        setIsConnected(true);
        setLastSyncTime(new Date());
        setSyncStatus('idle');
        
        console.log('Real-time sync initialized');
      } catch (error) {
        console.error('Failed to initialize real-time sync:', error);
        setSyncStatus('error');
      }
    };

    initializeSync();

    // Cleanup on unmount
    return () => {
      if (eventListenerIdRef.current) {
        realtimeScheduler.removeEventListener(eventListenerIdRef.current);
      }
      webhookHandler.stopListening();
    };
  }, []);

  // Handle rescheduling events
  const handleReschedulingEvent = useCallback((event: ReschedulingEvent) => {
    console.log('Received rescheduling event:', event);
    
    setReschedulingEvents(prev => [...prev, event]);
    setPendingRescheduling(event);
    setLastSyncTime(new Date());
    
    // Auto-apply rescheduling after a short delay (can be made configurable)
    setTimeout(() => {
      applyRescheduling(event);
    }, 2000);
  }, []);

  // Apply rescheduling to tasks
  const applyRescheduling = useCallback((event: ReschedulingEvent) => {
    console.log('Applying rescheduling:', event);
    
    const updatedTasks = tasks.map(task => {
      const change = event.changes.find(c => c.taskId === task.id);
      if (change) {
        return {
          ...task,
          scheduledStartDate: change.newSchedule.start,
          scheduledEndDate: change.newSchedule.end,
          lastRescheduled: event.timestamp,
          reschedulingHistory: [
            ...(task.reschedulingHistory || []),
            event
          ]
        };
      }
      return task;
    });
    
    onTasksUpdate(updatedTasks);
    setPendingRescheduling(null);
  }, [tasks, onTasksUpdate]);

  // Reject rescheduling
  const rejectRescheduling = useCallback(() => {
    console.log('Rejecting rescheduling');
    setPendingRescheduling(null);
  }, []);

  // Manually trigger rescheduling check
  const triggerReschedulingCheck = useCallback(async () => {
    try {
      setSyncStatus('syncing');

      // Find tasks that need rescheduling
      const tasksNeedingReschedule = tasks.filter(task =>
        task.status !== 'done' &&
        task.calendarEvents &&
        task.calendarEvents.length > 0
      );

      if (tasksNeedingReschedule.length > 0) {
        console.log(`Attempting to reschedule ${tasksNeedingReschedule.length} tasks`);

        try {
          const event = await realtimeScheduler.rescheduleAffectedTasks(
            tasksNeedingReschedule,
            'manual_adjustment',
            workingHours
          );

          // Only handle the event if there were actual changes
          if (event.changes.length > 0) {
            handleReschedulingEvent(event);
            console.log(`Successfully rescheduled ${event.changes.length} tasks`);
          } else {
            console.log('No tasks needed rescheduling');
          }
        } catch (rescheduleError) {
          console.error('Rescheduling failed:', rescheduleError);
          // Don't set error status for rescheduling failures - they're expected sometimes
          console.log('Some tasks could not be rescheduled due to time constraints');

          // Notify user about the issue
          if (onError) {
            onError('一部のタスクは時間制約のため再スケジュールできませんでした。期限を延長するか、タスクの見積もり時間を短縮してください。');
          }
        }
      } else {
        console.log('No tasks found that need rescheduling');
      }

      setSyncStatus('idle');
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Failed to trigger rescheduling check:', error);
      setSyncStatus('error');

      // Reset to idle after a short delay
      setTimeout(() => {
        setSyncStatus('idle');
      }, 3000);
    }
  }, [tasks, workingHours, handleReschedulingEvent]);

  // Record actual time for learning
  const recordActualTime = useCallback((
    task: Task,
    actualTime: {
      準備: number;
      設計: number;
      実装: number;
      改善: number;
    }
  ) => {
    learningEngine.recordActualTime(task, actualTime, 'user_manual');
    console.log(`Recorded actual time for task: ${task.title}`);
  }, []);

  // Get improved estimation using learning engine
  const getImprovedEstimation = useCallback((task: Task) => {
    return learningEngine.getImprovedEstimation(task);
  }, []);

  // Get learning insights
  const getLearningInsights = useCallback(() => {
    return learningEngine.getLearningInsights();
  }, []);

  // Check connection status
  const checkConnectionStatus = useCallback(() => {
    const webhookStatus = webhookHandler.getStatus();
    setIsConnected(webhookStatus.isListening);
    return webhookStatus;
  }, []);

  // Force reconnection
  const reconnect = useCallback(async () => {
    try {
      setSyncStatus('syncing');
      
      // Stop current connections
      webhookHandler.stopListening();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Restart
      webhookHandler.startListening();
      
      setIsConnected(true);
      setLastSyncTime(new Date());
      setSyncStatus('idle');
      
      console.log('Real-time sync reconnected');
    } catch (error) {
      console.error('Failed to reconnect:', error);
      setSyncStatus('error');
    }
  }, []);

  // Get sync statistics
  const getSyncStats = useCallback(() => {
    return {
      totalReschedulingEvents: reschedulingEvents.length,
      lastSyncTime,
      isConnected,
      syncStatus,
      tasksWithSchedule: tasks.filter(t => t.calendarEvents && t.calendarEvents.length > 0).length,
      tasksNeedingReschedule: tasks.filter(t => 
        t.status !== 'done' && 
        t.lastRescheduled && 
        new Date().getTime() - t.lastRescheduled.getTime() > 24 * 60 * 60 * 1000 // 24 hours
      ).length
    };
  }, [reschedulingEvents, lastSyncTime, isConnected, syncStatus, tasks]);

  // Periodic sync check
  useEffect(() => {
    const interval = setInterval(() => {
      checkConnectionStatus();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [checkConnectionStatus]);

  return {
    // Connection status
    isConnected,
    lastSyncTime,
    syncStatus,
    
    // Rescheduling
    reschedulingEvents,
    pendingRescheduling,
    applyRescheduling,
    rejectRescheduling,
    triggerReschedulingCheck,
    
    // Learning
    recordActualTime,
    getImprovedEstimation,
    getLearningInsights,
    
    // Connection management
    checkConnectionStatus,
    reconnect,
    getSyncStats
  };
};

// Hook for learning insights only
export const useLearningInsights = () => {
  const [insights, setInsights] = useState(learningEngine.getLearningInsights());
  
  useEffect(() => {
    const updateInsights = () => {
      setInsights(learningEngine.getLearningInsights());
    };
    
    // Update insights periodically
    const interval = setInterval(updateInsights, 10000); // Every 10 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  return insights;
};

// Hook for rescheduling history
export const useReschedulingHistory = () => {
  const [history, setHistory] = useState<ReschedulingEvent[]>([]);
  
  useEffect(() => {
    const loadHistory = () => {
      const events = realtimeScheduler.getReschedulingHistory();
      setHistory(events);
    };
    
    loadHistory();
    
    // Update history periodically
    const interval = setInterval(loadHistory, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  return history;
};

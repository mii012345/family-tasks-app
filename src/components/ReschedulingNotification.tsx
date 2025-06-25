import React, { useState } from 'react';
import { Calendar, Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { ReschedulingEvent, Task } from '../App';

interface ReschedulingNotificationProps {
  event: ReschedulingEvent;
  tasks: Task[];
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

const ReschedulingNotification: React.FC<ReschedulingNotificationProps> = ({
  event,
  tasks,
  onApprove,
  onReject,
  onClose
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // Get task by ID
  const getTask = (taskId: string) => {
    return tasks.find(t => t.id === taskId);
  };

  // Format time
  const formatTime = (date: Date) => {
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get trigger reason text
  const getTriggerReasonText = (triggeredBy: ReschedulingEvent['triggeredBy']) => {
    switch (triggeredBy) {
      case 'calendar_change':
        return 'カレンダーの変更';
      case 'task_update':
        return 'タスクの更新';
      case 'manual_adjustment':
        return '手動調整';
      default:
        return '不明';
    }
  };

  // Get trigger reason icon
  const getTriggerReasonIcon = (triggeredBy: ReschedulingEvent['triggeredBy']) => {
    switch (triggeredBy) {
      case 'calendar_change':
        return <Calendar className="w-4 h-4" />;
      case 'task_update':
        return <Clock className="w-4 h-4" />;
      case 'manual_adjustment':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed top-4 right-4 bg-white rounded-lg shadow-xl border border-gray-200 max-w-md w-full z-50">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-full">
              {getTriggerReasonIcon(event.triggeredBy)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                スケジュール再調整
              </h3>
              <p className="text-sm text-gray-600">
                {getTriggerReasonText(event.triggeredBy)}により発生
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Summary */}
        <div className="mb-4">
          <p className="text-sm text-gray-700">
            <span className="font-medium">{event.changes.length}件</span>のタスクのスケジュールが調整されました
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatTime(event.timestamp)}
          </p>
        </div>

        {/* Affected tasks preview */}
        <div className="space-y-2 mb-4">
          {event.changes.slice(0, 2).map((change, index) => {
            const task = getTask(change.taskId);
            if (!task) return null;

            return (
              <div key={index} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm text-gray-900 truncate">
                    {task.title}
                  </h4>
                  <span className="text-xs text-gray-500">
                    {task.priority === 3 ? '🔴' : task.priority === 1 ? '🔵' : '🟡'}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="text-red-600">変更前:</span>
                    <span>{formatTime(change.oldSchedule.start)} - {formatTime(change.oldSchedule.end)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="text-green-600">変更後:</span>
                    <span>{formatTime(change.newSchedule.start)} - {formatTime(change.newSchedule.end)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {event.changes.length > 2 && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  詳細を隠す
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  他 {event.changes.length - 2} 件を表示
                </>
              )}
            </button>
          )}
        </div>

        {/* Detailed view */}
        {showDetails && (
          <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
            {event.changes.slice(2).map((change, index) => {
              const task = getTask(change.taskId);
              if (!task) return null;

              return (
                <div key={index + 2} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm text-gray-900 truncate">
                      {task.title}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {task.priority === 3 ? '🔴' : task.priority === 1 ? '🔵' : '🟡'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="text-red-600">変更前:</span>
                      <span>{formatTime(change.oldSchedule.start)} - {formatTime(change.oldSchedule.end)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="text-green-600">変更後:</span>
                      <span>{formatTime(change.newSchedule.start)} - {formatTime(change.newSchedule.end)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            承認
          </button>
          <button
            onClick={onReject}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            拒否
          </button>
        </div>

        {/* Help text */}
        <p className="text-xs text-gray-500 mt-3 text-center">
          承認すると変更が適用され、拒否すると元のスケジュールが維持されます
        </p>
      </div>
    </div>
  );
};

export default ReschedulingNotification;

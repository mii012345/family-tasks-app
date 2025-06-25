import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Settings as SettingsIcon, CheckCircle, XCircle } from 'lucide-react';
import { WorkingHours, UserSettings } from '../App';
import { 
  initializeGoogleAPI, 
  isSignedIn, 
  signIn, 
  signOut, 
  getCurrentUser 
} from '../services/googleCalendar';

interface CalendarSettingsProps {
  userSettings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  onClose: () => void;
}

const CalendarSettings: React.FC<CalendarSettingsProps> = ({
  userSettings,
  onSettingsChange,
  onClose
}) => {
  const [settings, setSettings] = useState<UserSettings>(userSettings);
  const [isGoogleAPIReady, setIsGoogleAPIReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Initialize Google API on component mount
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const initAPI = async () => {
      const success = await initializeGoogleAPI();
      setIsGoogleAPIReady(success);

      if (success) {
        // Check initial sign-in status (this will also restore from storage)
        if (isSignedIn()) {
          const user = await getCurrentUser();
          if (user) {
            setCurrentUser(user);
            setSettings((prev: UserSettings) => ({ ...prev, googleCalendarEnabled: true }));
          }
        }

        // Note: GIS doesn't have a built-in auth state listener like the old auth2
        // We'll rely on the periodic check and manual updates

        // Set up a periodic check for auth status
        const checkAuthStatus = async () => {
          if (isSignedIn()) {
            const user = await getCurrentUser();
            if (user && !currentUser) {
              setCurrentUser(user);
              setSettings((prev: UserSettings) => ({ ...prev, googleCalendarEnabled: true }));
            }
          }
        };

        intervalId = setInterval(checkAuthStatus, 2000);
      }
    };

    initAPI();

    // Cleanup function
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentUser]);

  // Handle Google sign in
  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const success = await signIn();

      if (success) {
        // Wait a moment for the auth state to update, then check multiple times
        const checkUser = async (attempt: number = 0) => {
          const user = await getCurrentUser();

          if (user) {
            setCurrentUser(user);
            setSettings((prev: UserSettings) => ({ ...prev, googleCalendarEnabled: true }));
          } else if (attempt < 5) {
            // Retry up to 5 times with increasing delays
            setTimeout(() => checkUser(attempt + 1), (attempt + 1) * 200);
          }
        };

        setTimeout(() => checkUser(), 100);
      }
    } catch (error) {
      console.error('Failed to sign in:', error);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle Google sign out
  const handleGoogleSignOut = async () => {
    try {
      await signOut();
      setCurrentUser(null);
      setSettings((prev: UserSettings) => ({ ...prev, googleCalendarEnabled: false }));
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  // Handle working hours change
  const handleWorkingHoursChange = (
    day: keyof WorkingHours,
    field: 'start' | 'end' | 'enabled',
    value: string | boolean
  ) => {
    setSettings((prev: UserSettings) => ({
      ...prev,
      workingHours: {
        ...prev.workingHours,
        [day]: {
          ...prev.workingHours[day],
          [field]: value
        }
      }
    }));
  };

  // Save settings
  const handleSave = () => {
    console.log('Saving calendar settings:', settings);
    onSettingsChange(settings);
    onClose();
  };

  // Reset to defaults
  const handleReset = () => {
    setSettings(userSettings);
  };

  const dayLabels: Record<keyof WorkingHours, string> = {
    monday: '月曜日',
    tuesday: '火曜日',
    wednesday: '水曜日',
    thursday: '木曜日',
    friday: '金曜日',
    saturday: '土曜日',
    sunday: '日曜日'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5" />
              カレンダー設定
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          {/* Google Calendar Integration */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Googleカレンダー連携
            </h3>
            
            {!isGoogleAPIReady ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="text-yellow-800 font-medium mb-2">Google APIを初期化中...</div>
                <div className="text-sm text-yellow-700">
                  初期化に時間がかかる場合は、Google API認証情報が正しく設定されているか確認してください。
                  <br />
                  .envファイルにVITE_GOOGLE_CLIENT_IDとVITE_GOOGLE_API_KEYを設定する必要があります。
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {currentUser ? (
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="font-medium text-green-900">
                          {currentUser.name}
                        </div>
                        <div className="text-sm text-green-700">
                          {currentUser.email}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleGoogleSignOut}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      サインアウト
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-gray-400" />
                        <div className="text-gray-600">
                          Googleカレンダーに接続されていません
                        </div>
                      </div>
                      <button
                        onClick={handleGoogleSignIn}
                        disabled={isSigningIn}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSigningIn ? 'サインイン中...' : 'Googleでサインイン'}
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      ※ ポップアップがブロックされた場合は、ブラウザの設定でポップアップを許可してください
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Working Hours */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              就業時間設定
            </h3>
            
            <div className="space-y-3">
              {Object.entries(dayLabels).map(([day, label]) => {
                const dayKey = day as keyof WorkingHours;
                const dayConfig = settings.workingHours[dayKey];
                
                return (
                  <div key={day} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg">
                    <div className="w-16">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={dayConfig.enabled}
                          onChange={(e) => handleWorkingHoursChange(dayKey, 'enabled', e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium">{label}</span>
                      </label>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="time"
                        value={dayConfig.start}
                        onChange={(e) => handleWorkingHoursChange(dayKey, 'start', e.target.value)}
                        disabled={!dayConfig.enabled}
                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                      />
                      <span className="text-gray-500">〜</span>
                      <input
                        type="time"
                        value={dayConfig.end}
                        onChange={(e) => handleWorkingHoursChange(dayKey, 'end', e.target.value)}
                        disabled={!dayConfig.enabled}
                        className="px-3 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task Settings */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              タスク設定
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  デフォルトタスク時間（分）
                </label>
                <input
                  type="number"
                  min="15"
                  max="480"
                  step="15"
                  value={settings.defaultTaskDuration}
                  onChange={(e) => setSettings((prev: UserSettings) => ({
                    ...prev,
                    defaultTaskDuration: parseInt(e.target.value) || 60
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  タスク間のバッファ時間（分）
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="5"
                  value={settings.bufferTime}
                  onChange={(e) => setSettings((prev: UserSettings) => ({
                    ...prev,
                    bufferTime: parseInt(e.target.value) || 15
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              リセット
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarSettings;

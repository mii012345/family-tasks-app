import React, { useState } from 'react';
import { Brain, TrendingUp, Target, BarChart3, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useLearningInsights } from '../hooks/useRealTimeSync';

interface LearningInsightsProps {
  onClose: () => void;
}

const LearningInsights: React.FC<LearningInsightsProps> = ({ onClose }) => {
  const insights = useLearningInsights();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  // Get accuracy color
  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.8) return 'text-green-600';
    if (accuracy >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get accuracy badge color
  const getAccuracyBadgeColor = (accuracy: number) => {
    if (accuracy >= 0.8) return 'bg-green-100 text-green-800';
    if (accuracy >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Brain className="w-6 h-6 text-blue-600" />
              学習インサイト
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {/* Overall Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">全体精度</h3>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {formatPercentage(insights.overallAccuracy)}
              </div>
              <p className="text-sm text-blue-700">
                見積もり精度の平均値
              </p>
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-green-900">学習済みタスク</h3>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {insights.totalTasksLearned}
              </div>
              <p className="text-sm text-green-700">
                実績データを収集したタスク数
              </p>
            </div>

            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900">カテゴリ数</h3>
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {insights.taskTypes.length}
              </div>
              <p className="text-sm text-purple-700">
                学習対象のタスクカテゴリ
              </p>
            </div>
          </div>

          {/* Task Type Accuracy */}
          <div className="mb-6">
            <button
              onClick={() => toggleSection('accuracy')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">カテゴリ別精度</h3>
              </div>
              {expandedSection === 'accuracy' ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>

            {expandedSection === 'accuracy' && (
              <div className="mt-4 space-y-3">
                {insights.taskTypes.map(taskType => {
                  const accuracy = insights.accuracyByType.get(taskType) || 0;
                  return (
                    <div key={taskType} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{taskType}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAccuracyBadgeColor(accuracy)}`}>
                          {formatPercentage(accuracy)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            accuracy >= 0.8 ? 'bg-green-500' :
                            accuracy >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${accuracy * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        見積もり精度: {accuracy >= 0.8 ? '優秀' : accuracy >= 0.6 ? '良好' : '要改善'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Learning Progress */}
          <div className="mb-6">
            <button
              onClick={() => toggleSection('progress')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">学習進捗</h3>
              </div>
              {expandedSection === 'progress' ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>

            {expandedSection === 'progress' && (
              <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">学習状況</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">データ収集済み</span>
                        <span className="font-medium">{insights.totalTasksLearned}件</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">学習カテゴリ</span>
                        <span className="font-medium">{insights.taskTypes.length}種類</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">平均精度</span>
                        <span className={`font-medium ${getAccuracyColor(insights.overallAccuracy)}`}>
                          {formatPercentage(insights.overallAccuracy)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">改善提案</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      {insights.overallAccuracy < 0.6 && (
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>より多くのタスクで実績時間を記録すると精度が向上します</span>
                        </div>
                      )}
                      {insights.taskTypes.length < 3 && (
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>異なる種類のタスクを追加すると学習効果が高まります</span>
                        </div>
                      )}
                      {insights.totalTasksLearned < 10 && (
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>10件以上のタスクで学習すると信頼性が向上します</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* How It Works */}
          <div className="mb-6">
            <button
              onClick={() => toggleSection('howto')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">学習の仕組み</h3>
              </div>
              {expandedSection === 'howto' ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>

            {expandedSection === 'howto' && (
              <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
                <div className="space-y-4 text-sm text-gray-700">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">📊 データ収集</h4>
                    <p>タスクの見積もり時間と実際にかかった時間を比較して学習データを蓄積します。</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">🧠 パターン認識</h4>
                    <p>タスクの種類や特徴に基づいて、あなたの作業パターンを分析します。</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">🎯 精度向上</h4>
                    <p>学習したパターンを基に、将来のタスクの見積もり精度を自動的に改善します。</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">🔄 継続学習</h4>
                    <p>新しいデータが追加されるたびに、モデルが継続的に更新されます。</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Close button */}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningInsights;

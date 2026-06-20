<script setup lang="ts">
import { computed } from 'vue';
import { useFEAStore } from '../store/fea';

const store = useFEAStore();

const sortedByStress = computed(() => {
  return [...store.comparisonResults]
    .filter((r) => r.solved)
    .sort((a, b) => a.maxStress - b.maxStress);
});

const sortedByDisplacement = computed(() => {
  return [...store.comparisonResults]
    .filter((r) => r.solved)
    .sort((a, b) => a.maxDisplacement - b.maxDisplacement);
});

const maxStressValue = computed(() => {
  const solved = store.comparisonResults.filter((r) => r.solved);
  if (solved.length === 0) return 1;
  return Math.max(...solved.map((r) => r.maxStress));
});

const maxDisplacementValue = computed(() => {
  const solved = store.comparisonResults.filter((r) => r.solved);
  if (solved.length === 0) return 1;
  return Math.max(...solved.map((r) => r.maxDisplacement));
});

function getStressPercent(value: number): number {
  return (value / maxStressValue.value) * 100;
}

function getDisplacementPercent(value: number): number {
  return (value / maxDisplacementValue.value) * 100;
}

function getStressBarColor(presetName: string): string {
  if (store.bestStressPreset?.presetName === presetName) {
    return 'bg-green-500';
  }
  return 'bg-red-500';
}

function getDisplacementBarColor(presetName: string): string {
  if (store.bestDisplacementPreset?.presetName === presetName) {
    return 'bg-green-500';
  }
  return 'bg-amber-500';
}

function getRankBadgeColor(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-red-600 text-white';
    case 2:
      return 'bg-orange-500 text-white';
    case 3:
      return 'bg-yellow-500 text-white';
    default:
      return 'bg-slate-600 text-white';
  }
}

function handleResetCache() {
  if (confirm('确定要清除所有已保存的对比数据吗？')) {
    store.clearComparisonState();
    store.initComparison();
  }
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4 space-y-4">
    <div class="flex items-center justify-between border-b border-slate-700 pb-2">
      <h3 class="text-sm font-bold text-slate-200">方案对比总览</h3>
      <button
        @click="store.toggleComparison()"
        class="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 transition"
      >
        {{ store.comparisonEnabled ? '关闭对比' : '展开对比' }}
      </button>
    </div>

    <div v-if="!store.comparisonEnabled" class="text-xs text-slate-500 text-center py-4">
      点击"展开对比"查看多方案对比分析
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center gap-2">
        <button
          @click="store.solveAllPresets()"
          class="flex-1 py-2 rounded text-xs font-bold bg-purple-700 text-white hover:bg-purple-600 transition"
        >
          ⚡ 一键求解所有方案
        </button>
        <button
          @click="handleResetCache"
          class="py-2 px-2 rounded text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 transition"
          title="清除已保存的对比数据"
        >
          🗑 重置
        </button>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1">
          <span class="text-xs text-slate-400">Top</span>
          <select
            :value="store.topNCritical"
            @change="store.setTopNCritical(Number(($event.target as HTMLSelectElement).value))"
            class="bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-purple-500"
          >
            <option :value="3">3</option>
            <option :value="5">5</option>
            <option :value="10">10</option>
          </select>
          <span class="text-xs text-slate-400">危险单元</span>
        </div>
        <div v-if="store.allSolved" class="ml-auto flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span class="text-[10px] text-green-400">数据已持久化</span>
        </div>
      </div>

      <div v-if="!store.allSolved" class="text-xs text-amber-400 bg-amber-900/30 rounded p-2 text-center">
        ⚠ 请先点击"一键求解所有方案"获取对比数据
      </div>

      <div v-if="store.allSolved && store.bestStressPreset" class="bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-700/50 rounded p-3">
        <div class="text-xs text-green-300 font-medium mb-1">🏆 最优方案推荐</div>
        <div class="text-sm text-white">
          <span class="font-bold">{{ store.bestStressPreset.presetLabel }}</span>
          <span class="text-slate-400 text-xs ml-2">
            应力最优 ({{ (store.bestStressPreset.maxStress / 1e6).toFixed(2) }} MPa)
            <span v-if="store.bestDisplacementPreset?.presetName === store.bestStressPreset?.presetName">
              · 同时位移最优
            </span>
          </span>
        </div>
      </div>

      <div class="space-y-2">
        <div class="text-xs text-slate-400 font-medium">关键指标对比</div>
        <div class="bg-slate-900 rounded overflow-hidden">
          <table class="w-full text-xs">
            <thead class="bg-slate-700/50">
              <tr>
                <th class="text-left px-3 py-2 text-slate-300 font-medium">方案</th>
                <th class="text-right px-3 py-2 text-slate-300 font-medium">最大应力</th>
                <th class="text-right px-3 py-2 text-slate-300 font-medium">最大位移</th>
                <th class="text-center px-3 py-2 text-slate-300 font-medium">单元/节点</th>
                <th class="text-center px-3 py-2 text-slate-300 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="result in store.comparisonResults"
                :key="result.presetName"
                class="border-t border-slate-700/50 hover:bg-slate-800/50 transition"
              >
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <span
                      v-if="store.bestStressPreset?.presetName === result.presetName"
                      class="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-[8px] text-white"
                      title="应力最优"
                    >
                      S
                    </span>
                    <span
                      v-if="store.bestDisplacementPreset?.presetName === result.presetName && store.bestStressPreset?.presetName !== result.presetName"
                      class="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center text-[8px] text-white"
                      title="位移最优"
                    >
                      D
                    </span>
                    <span class="text-slate-200 font-medium">{{ result.presetLabel }}</span>
                  </div>
                </td>
                <td class="px-3 py-2 text-right">
                  <div v-if="result.solved" class="space-y-1">
                    <div class="font-mono text-red-400 font-bold">
                      {{ (result.maxStress / 1e6).toFixed(2) }} MPa
                    </div>
                    <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        :class="getStressBarColor(result.presetName)"
                        class="h-full rounded-full transition-all duration-500"
                        :style="{ width: getStressPercent(result.maxStress) + '%' }"
                      />
                    </div>
                    <div class="text-[10px] text-slate-500">
                      排名 #{{ sortedByStress.findIndex((r) => r.presetName === result.presetName) + 1 }}
                    </div>
                  </div>
                  <span v-else class="text-slate-600">—</span>
                </td>
                <td class="px-3 py-2 text-right">
                  <div v-if="result.solved" class="space-y-1">
                    <div class="font-mono text-amber-400 font-bold">
                      {{ (result.maxDisplacement * 1000).toFixed(3) }} mm
                    </div>
                    <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        :class="getDisplacementBarColor(result.presetName)"
                        class="h-full rounded-full transition-all duration-500"
                        :style="{ width: getDisplacementPercent(result.maxDisplacement) + '%' }"
                      />
                    </div>
                    <div class="text-[10px] text-slate-500">
                      排名 #{{ sortedByDisplacement.findIndex((r) => r.presetName === result.presetName) + 1 }}
                    </div>
                  </div>
                  <span v-else class="text-slate-600">—</span>
                </td>
                <td class="px-3 py-2 text-center">
                  <span class="text-slate-400 font-mono">
                    {{ result.elementCount }} / {{ result.nodeCount }}
                  </span>
                </td>
                <td class="px-3 py-2 text-center">
                  <button
                    @click="store.loadPresetFromComparison(result.presetName)"
                    class="text-xs px-2 py-1 rounded bg-sky-700 text-white hover:bg-sky-600 transition"
                  >
                    查看
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="store.allSolved" class="space-y-2">
        <div class="text-xs text-slate-400 font-medium">危险单元排行对比</div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div
            v-for="result in store.comparisonResults"
            :key="result.presetName"
            class="bg-slate-900 rounded p-3"
          >
            <div class="text-xs font-medium text-slate-300 mb-2 pb-1 border-b border-slate-700 flex items-center justify-between">
              <span>{{ result.presetLabel }}</span>
              <span
                v-if="store.bestStressPreset?.presetName === result.presetName"
                class="text-[10px] bg-green-700 text-white px-1.5 py-0.5 rounded"
              >
                应力最优
              </span>
            </div>
            <div class="space-y-1.5">
              <div
                v-for="crit in result.criticalElements"
                :key="crit.elementId"
                class="flex items-center gap-2 text-xs"
              >
                <span
                  :class="getRankBadgeColor(crit.rank)"
                  class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                >
                  {{ crit.rank }}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-300 font-mono">
                      #{{ crit.elementId }} ({{ crit.nodeIds[0] }}→{{ crit.nodeIds[1] }})
                    </span>
                    <span class="text-red-400 font-mono font-bold ml-2">
                      {{ (crit.stress / 1e6).toFixed(1) }}
                    </span>
                  </div>
                  <div class="h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
                    <div
                      class="h-full bg-gradient-to-r from-yellow-500 to-red-500 rounded-full"
                      :style="{ width: (crit.stress / result.maxStress) * 100 + '%' }"
                    />
                  </div>
                </div>
              </div>
              <div v-if="result.criticalElements.length === 0" class="text-xs text-slate-600 text-center py-2">
                暂无数据
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="store.allSolved" class="border-t border-slate-700 pt-3">
        <div class="text-xs text-slate-400 font-medium mb-2">可视化对比</div>
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-900 rounded p-3">
            <div class="text-[10px] text-slate-500 mb-1">最大应力对比 (MPa)</div>
            <div class="flex items-end gap-2 h-24">
              <div
                v-for="result in store.comparisonResults"
                :key="result.presetName"
                class="flex-1 flex flex-col items-center gap-1"
              >
                <div class="text-[10px] font-mono text-red-400 font-bold">
                  {{ (result.maxStress / 1e6).toFixed(0) }}
                </div>
                <div
                  class="w-full bg-gradient-to-t from-red-600 to-red-400 rounded-t transition-all duration-500"
                  :style="{ height: getStressPercent(result.maxStress) + '%' }"
                />
                <div class="text-[9px] text-slate-500 truncate w-full text-center">
                  {{ result.presetLabel }}
                </div>
              </div>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-3">
            <div class="text-[10px] text-slate-500 mb-1">最大位移对比 (mm)</div>
            <div class="flex items-end gap-2 h-24">
              <div
                v-for="result in store.comparisonResults"
                :key="result.presetName"
                class="flex-1 flex flex-col items-center gap-1"
              >
                <div class="text-[10px] font-mono text-amber-400 font-bold">
                  {{ (result.maxDisplacement * 1000).toFixed(2) }}
                </div>
                <div
                  class="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t transition-all duration-500"
                  :style="{ height: getDisplacementPercent(result.maxDisplacement) + '%' }"
                />
                <div class="text-[9px] text-slate-500 truncate w-full text-center">
                  {{ result.presetLabel }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

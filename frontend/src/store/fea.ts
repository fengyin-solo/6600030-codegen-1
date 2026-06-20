import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type {
  FEAModel,
  FEAResult,
  PresetComparisonResult,
  CriticalElement,
} from '../types';
import {
  solve as feaSolve,
  presetCantileverBeam,
  presetBridgeTruss,
  presetSimpleFrame,
  jetColormap,
} from '../utils/fea-solver';

const PRESET_CONFIGS = [
  { name: 'cantilever', label: '悬臂梁', factory: presetCantileverBeam },
  { name: 'bridge', label: '桥梁桁架', factory: presetBridgeTruss },
  { name: 'frame', label: '简单框架', factory: presetSimpleFrame },
];

const STORAGE_KEY = 'fea-comparison-state';

interface PersistedComparisonState {
  comparisonEnabled: boolean;
  comparisonResults: PresetComparisonResult[];
  topNCritical: number;
  version: number;
}

const STORAGE_VERSION = 1;

function saveComparisonState(
  enabled: boolean,
  results: PresetComparisonResult[],
  topN: number
) {
  try {
    const state: PersistedComparisonState = {
      comparisonEnabled: enabled,
      comparisonResults: results,
      topNCritical: topN,
      version: STORAGE_VERSION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('保存对比状态失败:', e);
  }
}

function loadComparisonState(): PersistedComparisonState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedComparisonState;
    if (parsed.version !== STORAGE_VERSION) return null;
    return parsed;
  } catch (e) {
    console.warn('加载对比状态失败:', e);
    return null;
  }
}

function clearComparisonState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('清除对比状态失败:', e);
  }
}

function rebuildModelsForResults(results: PresetComparisonResult[]): PresetComparisonResult[] {
  return results.map((r) => {
    const config = PRESET_CONFIGS.find((c) => c.name === r.presetName);
    const baseModel = config ? config.factory() : r.model;
    return {
      ...r,
      model: baseModel,
      result: r.solved ? r.result : null,
    };
  });
}

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');
  const topNCritical = ref(5);

  const persisted = loadComparisonState();
  const comparisonEnabled = ref(persisted?.comparisonEnabled ?? false);
  const comparisonResults = ref<PresetComparisonResult[]>(
    persisted?.comparisonResults && persisted.comparisonResults.length > 0
      ? rebuildModelsForResults(persisted.comparisonResults)
      : []
  );
  if (persisted?.topNCritical) {
    topNCritical.value = persisted.topNCritical;
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  function loadPreset(name: string) {
    selectedPreset.value = name;
    result.value = null;
    selectedElement.value = null;
    switch (name) {
      case 'cantilever':
        model.value = presetCantileverBeam();
        break;
      case 'bridge':
        model.value = presetBridgeTruss();
        break;
      case 'frame':
        model.value = presetSimpleFrame();
        break;
      default:
        model.value = presetCantileverBeam();
    }
  }

  function solve() {
    result.value = feaSolve(model.value);
  }

  function toggleDeformed() {
    showDeformed.value = !showDeformed.value;
  }

  function selectElement(id: number | null) {
    selectedElement.value = id;
  }

  function setHeatmapMode(mode: 'stress' | 'strain' | 'force') {
    heatmapMode.value = mode;
  }

  function addLoad(nodeId: number, fx: number, fy: number) {
    model.value.loads.push({ nodeId, fx, fy });
  }

  function toggleFixed(nodeId: number) {
    const node = model.value.nodes.find((n) => n.id === nodeId);
    if (node) node.fixed = !node.fixed;
  }

  function getCriticalElements(
    modelData: FEAModel,
    resultData: FEAResult,
    topN: number
  ): CriticalElement[] {
    const elements = modelData.elements;
    const stresses = resultData.stresses;

    const elementStresses = elements.map((el, idx) => ({
      element: el,
      stress: Math.abs(stresses[idx]),
    }));

    elementStresses.sort((a, b) => b.stress - a.stress);

    return elementStresses.slice(0, topN).map((item, idx) => ({
      elementId: item.element.id,
      stress: item.stress,
      nodeIds: item.element.nodeIds,
      rank: idx + 1,
    }));
  }

  function initComparison() {
    comparisonResults.value = PRESET_CONFIGS.map((config) => {
      const presetModel = config.factory();
      return {
        presetName: config.name,
        presetLabel: config.label,
        model: presetModel,
        result: null,
        solved: false,
        maxStress: 0,
        maxDisplacement: 0,
        criticalElements: [],
        elementCount: presetModel.elements.length,
        nodeCount: presetModel.nodes.length,
      };
    });
    saveComparisonState(
      comparisonEnabled.value,
      comparisonResults.value,
      topNCritical.value
    );
  }

  function solveAllPresets() {
    for (const compResult of comparisonResults.value) {
      const solverResult = feaSolve(compResult.model);
      compResult.result = solverResult;
      compResult.solved = true;
      compResult.maxStress = solverResult.maxStress;
      compResult.maxDisplacement = solverResult.maxDisplacement;
      compResult.criticalElements = getCriticalElements(
        compResult.model,
        solverResult,
        topNCritical.value
      );
    }
    saveComparisonState(
      comparisonEnabled.value,
      comparisonResults.value,
      topNCritical.value
    );
  }

  function toggleComparison() {
    comparisonEnabled.value = !comparisonEnabled.value;
    if (comparisonEnabled.value && comparisonResults.value.length === 0) {
      const stored = loadComparisonState();
      if (stored?.comparisonResults && stored.comparisonResults.length > 0) {
        comparisonResults.value = rebuildModelsForResults(stored.comparisonResults);
      } else {
        initComparison();
      }
    }
    saveComparisonState(
      comparisonEnabled.value,
      comparisonResults.value,
      topNCritical.value
    );
  }

  function setTopNCritical(n: number) {
    topNCritical.value = n;
    if (comparisonResults.value.length > 0) {
      for (const compResult of comparisonResults.value) {
        if (compResult.result) {
          compResult.criticalElements = getCriticalElements(
            compResult.model,
            compResult.result,
            n
          );
        }
      }
    }
    saveComparisonState(
      comparisonEnabled.value,
      comparisonResults.value,
      topNCritical.value
    );
  }

  function loadPresetFromComparison(presetName: string) {
    comparisonEnabled.value = false;
    saveComparisonState(
      comparisonEnabled.value,
      comparisonResults.value,
      topNCritical.value
    );
    loadPreset(presetName);
  }

  // ─── Persistence Watchers ─────────────────────────────────────────────────
  watch(
    [comparisonEnabled, comparisonResults, topNCritical],
    ([enabled, results, topN]) => {
      saveComparisonState(enabled, results, topN);
    },
    { deep: true }
  );

  // ─── Computed ─────────────────────────────────────────────────────────────
  const maxStress = computed(() => {
    if (!result.value) return 0;
    return result.value.maxStress;
  });

  const maxDisplacement = computed(() => {
    if (!result.value) return 0;
    return result.value.maxDisplacement;
  });

  const elementColors = computed(() => {
    const colors = new Map<number, string>();
    if (!result.value || model.value.elements.length === 0) {
      for (const el of model.value.elements) {
        colors.set(el.id, '#6b7280');
      }
      return colors;
    }

    let values: number[];
    switch (heatmapMode.value) {
      case 'stress':
        values = result.value.stresses.map(Math.abs);
        break;
      case 'strain':
        values = result.value.strains.map(Math.abs);
        break;
      case 'force':
        values = model.value.elements.map((e) => Math.abs(e.force));
        break;
      default:
        values = result.value.stresses.map(Math.abs);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    for (let i = 0; i < model.value.elements.length; i++) {
      colors.set(
        model.value.elements[i].id,
        jetColormap(values[i], min, max)
      );
    }
    return colors;
  });

  const allSolved = computed(() => {
    if (comparisonResults.value.length === 0) return false;
    return comparisonResults.value.every((r) => r.solved);
  });

  const bestStressPreset = computed(() => {
    const solved = comparisonResults.value.filter((r) => r.solved);
    if (solved.length === 0) return null;
    return solved.reduce((best, curr) =>
      curr.maxStress < best.maxStress ? curr : best
    );
  });

  const bestDisplacementPreset = computed(() => {
    const solved = comparisonResults.value.filter((r) => r.solved);
    if (solved.length === 0) return null;
    return solved.reduce((best, curr) =>
      curr.maxDisplacement < best.maxDisplacement ? curr : best
    );
  });

  const currentCriticalElements = computed(() => {
    if (!result.value) return [];
    return getCriticalElements(model.value, result.value, topNCritical.value);
  });

  return {
    model,
    result,
    selectedPreset,
    showDeformed,
    deformationScale,
    selectedElement,
    heatmapMode,
    maxStress,
    maxDisplacement,
    elementColors,
    comparisonEnabled,
    comparisonResults,
    topNCritical,
    allSolved,
    bestStressPreset,
    bestDisplacementPreset,
    currentCriticalElements,
    loadPreset,
    solve,
    toggleDeformed,
    selectElement,
    setHeatmapMode,
    addLoad,
    toggleFixed,
    initComparison,
    solveAllPresets,
    toggleComparison,
    setTopNCritical,
    loadPresetFromComparison,
    getCriticalElements,
    clearComparisonState,
  };
});

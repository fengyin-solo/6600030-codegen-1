import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
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

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');
  const comparisonEnabled = ref(false);
  const comparisonResults = ref<PresetComparisonResult[]>([]);
  const topNCritical = ref(5);

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
  }

  function toggleComparison() {
    comparisonEnabled.value = !comparisonEnabled.value;
    if (comparisonEnabled.value && comparisonResults.value.length === 0) {
      initComparison();
    }
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
  }

  function loadPresetFromComparison(presetName: string) {
    comparisonEnabled.value = false;
    loadPreset(presetName);
  }

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
  };
});

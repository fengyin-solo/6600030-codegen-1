export interface Node {
  id: number;
  x: number;
  y: number;
  fixed: boolean;       // boundary condition
  displacementX: number;
  displacementY: number;
}

export interface Element {
  id: number;
  nodeIds: [number, number];  // 2-node truss element
  area: number;               // cross-section area (m²)
  youngsModulus: number;      // Pa
  stress: number;             // computed
  strain: number;             // computed
  force: number;              // computed
}

export interface Load {
  nodeId: number;
  fx: number;   // force X component (N)
  fy: number;   // force Y component (N)
}

export interface FEAModel {
  nodes: Node[];
  elements: Element[];
  loads: Load[];
}

export interface FEAResult {
  displacements: number[];    // global displacement vector
  stresses: number[];          // per-element stress
  strains: number[];           // per-element strain
  maxDisplacement: number;
  maxStress: number;
  reactionForces: { nodeId: number; fx: number; fy: number }[];
}

export interface CriticalElement {
  elementId: number;
  stress: number;
  nodeIds: [number, number];
  rank: number;
}

export interface PresetComparisonResult {
  presetName: string;
  presetLabel: string;
  model: FEAModel;
  result: FEAResult | null;
  solved: boolean;
  maxStress: number;
  maxDisplacement: number;
  criticalElements: CriticalElement[];
  elementCount: number;
  nodeCount: number;
}

export interface ComparisonState {
  enabled: boolean;
  results: PresetComparisonResult[];
  topNCritical: number;
}

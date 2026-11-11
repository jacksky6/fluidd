declare namespace Klipper {
  export type MultitoolStage = 'release' | 'pickup' | 'heat_wait'

  export interface MultitoolState {
    current_tool: number;
    tool_count: number;
    active: boolean;
    spool_ids: number[];
    base_tool?: number;
    change_from_tool?: number;
    change_to_tool?: number;
    heater_mode?: 'per_tool' | 'shared';
    shared_extruder?: ExtruderKey;
    shared_heater_suspended?: boolean;
    shared_heater_fault?: boolean;
    tool_temperatures?: Array<number | null>;
    tool_target_temperatures?: Array<number | null>;
  }

  export interface MultitoolClampState {
    state: 'clamped' | 'released' | 'unknown' | null;
    raw_state?: string;
    seeded?: boolean;
  }

  export interface MultitoolFilamentState {
    tool_count: number;
    loaded: Array<boolean | null>;
    continuation_groups: number[][];
    runout_continue_length?: number;
    runout?: {
      active: boolean;
      tool?: number;
      remaining_mm?: number;
      continue_length?: number;
    };
  }

  export interface MultitoolOffsetsState {
    applied_x: number;
    applied_y: number;
    applied_z: number;
    applied_tool: number;
    applied_base?: number;
    adaptive: boolean;
  }

  export interface MultitoolStatsScope {
    count?: number;
    elapsed?: number;
    stages?: Partial<Record<MultitoolStage, number>>;
  }

  export interface MultitoolStatsState {
    tc_current?: MultitoolStatsScope & {
      active?: boolean;
      active_stage?: MultitoolStage | null;
    };
    tc_print?: MultitoolStatsScope;
    tc_total?: MultitoolStatsScope;
    tc_daily?: Array<{ date: string; count: number }>;
  }
}

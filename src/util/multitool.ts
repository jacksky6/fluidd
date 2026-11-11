import type { PrinterStatus } from '@/store/printer/types'
import type { Spool } from '@/store/spoolman/types'

export interface MultitoolTool {
  index: number;
  current: boolean;
  loaded: boolean | null;
  spoolId: number;
  spool?: Spool;
  percent: number | null;
}

export const multitoolStages: Klipper.MultitoolStage[] = ['release', 'pickup', 'heat_wait']

export const getMultitoolStageBreakdown = (scope?: Klipper.MultitoolStatsScope) => {
  const stages = multitoolStages.map(key => {
    const value = scope?.stages?.[key] ?? 0
    return { key, seconds: Number.isFinite(value) ? Math.max(0, value) : 0 }
  })
  const total = stages.reduce((sum, stage) => sum + stage.seconds, 0)
  return stages.map(stage => ({ ...stage, percent: total > 0 ? stage.seconds / total * 100 : 0 }))
}

export const getMultitoolTools = (
  status: Klipper.MultitoolState | undefined,
  filament: Klipper.MultitoolFilamentState | undefined,
  spools: readonly Spool[]
): MultitoolTool[] => {
  if (!status || !Number.isSafeInteger(status.tool_count) || status.tool_count < 1) return []

  return Array.from({ length: status.tool_count }, (_, index) => {
    const spoolId = status.spool_ids?.[index] ?? 0
    const spool = spools.find(spool => spool.id === spoolId)
    const remaining = spool?.remaining_weight
    const initial = spool?.initial_weight ?? spool?.filament.weight

    return {
      index,
      current: status.current_tool === index,
      loaded: typeof filament?.loaded?.[index] === 'boolean' ? filament.loaded[index] : null,
      spoolId,
      spool,
      percent: remaining != null && initial != null && initial > 0
        ? Math.ceil(Math.min(100, Math.max(0, remaining / initial * 100)))
        : null
    }
  })
}

export const getMultitoolCommand = (status: Klipper.MultitoolState, tool: number): string | null => {
  if (!Number.isSafeInteger(tool) || tool < 0 || tool >= status.tool_count) return null

  return tool === status.current_tool ? 'UNTOOL' : `T${tool}`
}

export const getMultitoolBlockReason = (context: {
  status?: Klipper.MultitoolState;
  ready: boolean;
  pending: boolean;
  printerState: PrinterStatus;
  idleState: string;
  homedAxes: string;
}, requireHomed = true): 'not_ready' | 'busy' | 'heater_fault' | 'not_homed' | null => {
  if (!context.ready || !context.status) return 'not_ready'
  if (context.status.shared_heater_fault) return 'heater_fault'
  if (
    context.pending || context.status.active ||
    context.printerState === 'printing' || context.printerState === 'busy' ||
    context.printerState === 'loading' || context.idleState === 'Printing'
  ) return 'busy'
  if (requireHomed && !['x', 'y', 'z'].every(axis => context.homedAxes.includes(axis))) {
    return 'not_homed'
  }

  return null
}

export const getMultitoolGroups = (groups: number[][] | undefined, toolCount: number): number[][] => {
  return (groups ?? [])
    .map(group => [...new Set(group.filter(tool => Number.isInteger(tool) && tool >= 0 && tool < toolCount))])
    .filter(group => group.length >= 2)
}

export const getMultitoolTemperature = (
  printer: Klipper.PrinterState,
  tool: number
): { temperature: number | null; target: number | null } => {
  const status = printer.multitool
  if (!status) return { temperature: null, target: null }

  const shared = status.heater_mode === 'shared'
  const observable = !shared || (tool === status.current_tool && !status.shared_heater_suspended)
  const extruder = printer[shared ? (status.shared_extruder ?? 'extruder') : tool === 0 ? 'extruder' : `extruder${tool}`]

  return {
    // 固定红外测温只能测量当前安装的热端，挂架热端不能借用此读数。
    temperature: observable
      ? (status.tool_temperatures ? status.tool_temperatures[tool] ?? null : extruder?.temperature ?? null)
      : null,
    target: status.tool_target_temperatures
      ? status.tool_target_temperatures[tool] ?? null
      : (!shared || tool === status.current_tool) ? extruder?.target ?? null : null
  }
}

export const formatMultitoolDuration = (seconds = 0): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const rounded = Math.round(seconds)
  if (rounded < 3600) return `${Math.floor(rounded / 60)}m ${rounded % 60}s`

  return `${Math.floor(rounded / 3600)}h ${Math.floor(rounded % 3600 / 60)}m`
}

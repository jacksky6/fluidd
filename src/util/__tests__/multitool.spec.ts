import {
  formatMultitoolDuration, getMultitoolBlockReason, getMultitoolCommand,
  getMultitoolGroups, getMultitoolTemperature, getMultitoolTools
} from '../multitool'
import { createState } from '@/store/printer/state'
import type { Spool } from '@/store/spoolman/types'

const status = (): Klipper.MultitoolState => ({
  current_tool: 0,
  tool_count: 2,
  active: false,
  spool_ids: [5, 0],
  heater_mode: 'shared',
  shared_extruder: 'extruder'
})

const context = () => ({
  status: status(),
  ready: true,
  pending: false,
  printerState: 'ready' as const,
  idleState: 'Ready',
  homedAxes: 'xyz'
})

describe('multitool commands and interlocks', () => {
  it('uses the plugin commands without registering or assuming physical tool state', () => {
    expect(getMultitoolCommand(status(), 0)).toBe('UNTOOL')
    expect(getMultitoolCommand(status(), 1)).toBe('T1')
    expect(getMultitoolCommand({ ...status(), current_tool: -1 }, 0)).toBe('T0')
  })

  it.each([-1, 2, 0.5, NaN, Infinity])('rejects invalid tool %s', tool => {
    expect(getMultitoolCommand(status(), tool)).toBeNull()
  })

  it('permits idle and paused changes with all axes homed', () => {
    expect(getMultitoolBlockReason(context())).toBeNull()
    expect(getMultitoolBlockReason({ ...context(), printerState: 'paused' })).toBeNull()
  })

  it.each(['printing', 'busy', 'loading'] as const)('blocks printer state %s', printerState => {
    expect(getMultitoolBlockReason({ ...context(), printerState })).toBe('busy')
  })

  it('blocks pending requests, tool changes, motion, disconnected and faulted states', () => {
    expect(getMultitoolBlockReason({ ...context(), pending: true })).toBe('busy')
    expect(getMultitoolBlockReason({ ...context(), status: { ...status(), active: true } })).toBe('busy')
    expect(getMultitoolBlockReason({ ...context(), idleState: 'Printing' })).toBe('busy')
    expect(getMultitoolBlockReason({ ...context(), ready: false })).toBe('not_ready')
    expect(getMultitoolBlockReason({ ...context(), status: undefined })).toBe('not_ready')
    expect(getMultitoolBlockReason({ ...context(), status: { ...status(), shared_heater_fault: true } })).toBe('heater_fault')
  })

  it.each(['', 'x', 'xy', 'yz'])('requires XYZ homing for motion (%s)', homedAxes => {
    expect(getMultitoolBlockReason({ ...context(), homedAxes })).toBe('not_homed')
    expect(getMultitoolBlockReason({ ...context(), homedAxes }, false)).toBeNull()
  })
})

describe('multitool state presentation', () => {
  it('does not confuse filament status with physical pickup detection', () => {
    const tools = getMultitoolTools(status(), undefined, [])
    expect(tools.map(tool => tool.loaded)).toEqual([null, null])
    expect(tools[0].current).toBe(true)
    expect(tools[0].spoolId).toBe(5)
    expect(tools[0].spool).toBeUndefined()
    expect(tools[0].percent).toBeNull()
  })

  it('keeps false, unknown and true filament states separate', () => {
    const filament: Klipper.MultitoolFilamentState = {
      tool_count: 2, loaded: [false, true], continuation_groups: []
    }
    expect(getMultitoolTools(status(), filament, []).map(tool => tool.loaded)).toEqual([false, true])
  })

  it.each([undefined, 0, -1, 1.5, NaN, Infinity])('handles missing or invalid tool count %s', count => {
    expect(getMultitoolTools(count === undefined ? undefined : { ...status(), tool_count: count }, undefined, [])).toEqual([])
  })

  it.each([[0, 0], [500, 50], [1500, 100], [-1, 0]])('bounds remaining weight %s to %s percent', (weight, percent) => {
    const spool: Spool = {
      id: 5,
      registered: new Date(),
      archived: false,
      filament_name: 'PLA',
      remaining_weight: weight,
      initial_weight: 1000,
      filament: { id: 1, registered: new Date(), density: 1.24, diameter: 1.75 }
    }
    expect(getMultitoolTools(status(), undefined, [spool])[0].percent).toBe(percent)
  })

  it('filters invalid and duplicate continuation group members without changing source arrays', () => {
    const groups = [[0, 1, 1, -1, 8], [0], [1, 0]]
    expect(getMultitoolGroups(groups, 2)).toEqual([[0, 1], [1, 0]])
    expect(groups[0]).toEqual([0, 1, 1, -1, 8])
  })

  it('only exposes the shared sensor reading for the mounted observable tool', () => {
    const printer = createState().printer
    printer.multitool = status()
    printer.extruder = { temperature: 180, target: 200 } as Klipper.ExtruderState
    expect(getMultitoolTemperature(printer, 0)).toEqual({ temperature: 180, target: 200 })
    expect(getMultitoolTemperature(printer, 1)).toEqual({ temperature: null, target: null })
    printer.multitool.shared_heater_suspended = true
    expect(getMultitoolTemperature(printer, 0).temperature).toBeNull()
  })

  it('preserves reported null temperatures and logical targets, including target zero', () => {
    const printer = createState().printer
    printer.multitool = { ...status(), tool_temperatures: [null, null], tool_target_temperatures: [0, 220] }
    printer.extruder = { temperature: 180, target: 200 } as Klipper.ExtruderState
    expect(getMultitoolTemperature(printer, 0)).toEqual({ temperature: null, target: 0 })
    expect(getMultitoolTemperature(printer, 1)).toEqual({ temperature: null, target: 220 })
  })

  it('supports independent heaters and printers without multitool', () => {
    const printer = createState().printer
    expect(getMultitoolTemperature(printer, 0)).toEqual({ temperature: null, target: null })
    printer.multitool = { ...status(), heater_mode: 'per_tool' }
    printer.extruder1 = { temperature: 220, target: 230 } as Klipper.ExtruderState
    expect(getMultitoolTemperature(printer, 1)).toEqual({ temperature: 220, target: 230 })
  })

  it.each([[0, '0.0s'], [59, '59.0s'], [119.8, '2m 0s'], [3600, '1h 0m'], [-1, '—'], [NaN, '—']])('formats %s seconds', (seconds, expected) => {
    expect(formatMultitoolDuration(seconds)).toBe(expected)
  })
})

/** @vitest-environment jsdom */
/// <reference lib="webworker" />
/// <reference lib="dom" />
import type {} from '@/plugins/filters'
import type {} from '@/plugins/colorSet'
import type {} from 'vuetify-confirm'
import Vue from 'vue'
import { shallowMount } from '@vue/test-utils'
import MultitoolCard from '../MultitoolCard.vue'
import { createState } from '@/store/printer/state'
import { SocketActions } from '@/api/socketActions'

vi.mock('@/api/socketActions', () => ({
  SocketActions: { printerGcodeScript: vi.fn().mockResolvedValue('ok') }
}))

const mountCard = () => {
  const state = Vue.observable({
    printer: createState(),
    config: { uiSettings: { multitool: { reverseTools: false, expandedSections: [0, 1, 2] } } },
    spoolman: { dialog: { show: false } }
  })
  Vue.set(state.printer.printer, 'multitool', {
    tool_count: 2, current_tool: 0, active: false, spool_ids: [5, 0], heater_mode: 'shared'
  })
  state.printer.printer.toolhead.homed_axes = 'xyz'
  const commit = vi.fn()
  const wrapper = shallowMount(MultitoolCard, {
    mocks: {
      $typedState: state,
      $typedGetters: {
        'socket/getIsReady': true,
        'printer/getKlippyReady': true,
        'printer/getPrinterState': 'ready',
        'wait/hasWaitsBy': () => false,
        'spoolman/getAvailableSpools': [],
        'server/componentSupport': () => true
      },
      $typedCommit: commit,
      $typedDispatch: vi.fn(),
      $t: (key: string) => key
    }
  })
  return { wrapper, state, commit }
}

afterEach(() => vi.clearAllMocks())

describe('MultitoolCard command handling', () => {
  it('rejects repeated clicks while the first mechanical command is pending', async () => {
    const { wrapper } = mountCard()
    let complete = () => {}
    vi.mocked(SocketActions.printerGcodeScript).mockReturnValueOnce(new Promise(resolve => {
      complete = () => resolve('ok')
    }))
    const first = wrapper.vm.changeTool(1)
    await wrapper.vm.changeTool(1)
    expect(SocketActions.printerGcodeScript).toHaveBeenCalledTimes(1)
    expect(SocketActions.printerGcodeScript).toHaveBeenCalledWith('T1', { wait: 'multitool.change' })
    complete()
    await first
    expect(wrapper.vm.pendingTool).toBeNull()
    // 显示状态由后端上报决定，发送成功不等于热端已拿取成功。
    expect(wrapper.vm.status?.current_tool).toBe(0)
    wrapper.destroy()
  })

  it('returns the mounted tool and does not retry a failed command', async () => {
    const { wrapper } = mountCard()
    vi.mocked(SocketActions.printerGcodeScript).mockRejectedValueOnce(new Error('pickup failed'))
    await wrapper.vm.changeTool(0)
    expect(SocketActions.printerGcodeScript).toHaveBeenCalledTimes(1)
    expect(SocketActions.printerGcodeScript).toHaveBeenCalledWith('UNTOOL', { wait: 'multitool.change' })
    expect(wrapper.vm.pendingTool).toBeNull()
    wrapper.destroy()
  })

  it('rechecks interlocks when called directly rather than trusting disabled buttons', async () => {
    const { wrapper, state } = mountCard()
    state.printer.printer.toolhead.homed_axes = 'xy'
    await wrapper.vm.changeTool(1)
    state.printer.printer.toolhead.homed_axes = 'xyz'
    Vue.set(state.printer.printer.multitool!, 'shared_heater_fault', true)
    await wrapper.vm.changeTool(1)
    expect(SocketActions.printerGcodeScript).not.toHaveBeenCalled()
    wrapper.destroy()
  })

  it('preserves spool binding when selection is cancelled', async () => {
    const { wrapper, commit } = mountCard()
    wrapper.vm.selectSpool(0)
    expect(commit).toHaveBeenCalledWith('spoolman/setDialogState', {
      show: true, spoolSelectionOnly: true, selectedSpoolId: 5
    })
    await wrapper.vm.onSpoolSelection({ show: false, selectedSpoolId: 5 })
    expect(SocketActions.printerGcodeScript).not.toHaveBeenCalled()
    wrapper.destroy()
  })

  it('keeps controls locked while the statistics module still reports a change', async () => {
    const { wrapper, state } = mountCard()
    Vue.set(state.printer.printer, 'multitool_stats', { tc_current: { active: true } })
    await wrapper.vm.changeTool(1)
    expect(SocketActions.printerGcodeScript).not.toHaveBeenCalled()
    wrapper.destroy()
  })

  it('assigns and clears a per-tool spool using the plugin command', async () => {
    const { wrapper } = mountCard()
    wrapper.vm.selectSpool(1)
    await wrapper.vm.onSpoolSelection({ show: false, selectedSpoolId: 12 })
    expect(SocketActions.printerGcodeScript).toHaveBeenLastCalledWith(
      'SET_TOOL_SPOOL_ID TOOL=1 SPOOL_ID=12', { wait: 'multitool.spool' }
    )
    wrapper.vm.selectSpool(0)
    await wrapper.vm.onSpoolSelection({ show: false })
    expect(SocketActions.printerGcodeScript).toHaveBeenLastCalledWith(
      'SET_TOOL_SPOOL_ID TOOL=0 SPOOL_ID=0', { wait: 'multitool.spool' }
    )
    wrapper.destroy()
  })

  it('shows an assumed clamp state as unverified and accepts zero calibrated offsets', () => {
    const { wrapper, state } = mountCard()
    Vue.set(state.printer.printer, 'multitool_clamp', { state: 'clamped', seeded: true })
    expect(wrapper.vm.clampVerified).toBe(false)
    Vue.set(state.printer.printer, 'save_variables', {
      variables: { t1_offset_x: 0, t1_offset_y: 0, t1_offset_z: 0 }
    })
    expect(wrapper.vm.isCalibrated(1)).toBe(true)
    expect(wrapper.vm.savedOffset(1, 'z')).toBe('0.000')
    wrapper.destroy()
  })

  it('only names an actually loaded continuation tool', () => {
    const { wrapper, state } = mountCard()
    Vue.set(state.printer.printer, 'multitool_filament', {
      tool_count: 2,
      loaded: [false, null],
      continuation_groups: [[0, 1]],
      runout: { active: true, tool: 0 }
    })
    expect(wrapper.vm.nextTool).toBeNull()
    Vue.set(state.printer.printer.multitool_filament!.loaded, 1, true)
    expect(wrapper.vm.nextTool).toBe(1)
    wrapper.destroy()
  })
})

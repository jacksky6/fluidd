/** @vitest-environment jsdom */
/// <reference lib="webworker" />
/// <reference lib="dom" />
import type {} from '@/plugins/filters'
import type {} from '@/plugins/colorSet'
import type {} from 'vuetify-confirm'
import Vue from 'vue'
import { shallowMount } from '@vue/test-utils'
import MultitoolCard from '../MultitoolCard.vue'
import CollapsableCard from '@/components/common/CollapsableCard.vue'
import { createState } from '@/store/printer/state'
import { SocketActions } from '@/api/socketActions'

vi.mock('@/api/socketActions', () => ({
  SocketActions: { printerGcodeScript: vi.fn().mockResolvedValue('ok') }
}))

const mountCard = (spoolman = true, showSpoolman = false) => {
  const state = Vue.observable({
    printer: createState(),
    config: { uiSettings: { multitool: { reverseTools: false, showSpoolman, expandedSections: [0, 1, 2] } } },
    spoolman: { dialog: { show: false } }
  })
  Vue.set(state.printer.printer, 'multitool', {
    tool_count: 2, current_tool: 0, active: false, spool_ids: [5, 0], heater_mode: 'shared'
  })
  state.printer.printer.toolhead.homed_axes = 'xyz'
  const commit = vi.fn()
  const dispatch = vi.fn()
  const wrapper = shallowMount(MultitoolCard, {
    mocks: {
      $typedState: state,
      $typedGetters: {
        'socket/getIsReady': true,
        'printer/getKlippyReady': true,
        'printer/getPrinterState': 'ready',
        'wait/hasWaitsBy': () => false,
        'spoolman/getAvailableSpools': [],
        'server/componentSupport': () => spoolman
      },
      $typedCommit: commit,
      $typedDispatch: dispatch,
      $t: (key: string) => key
    }
  })
  return { wrapper, state, commit, dispatch }
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
    const { wrapper, commit } = mountCard(true, true)
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
    const { wrapper } = mountCard(true, true)
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

describe('MultitoolCard presentation and layout', () => {
  it('hides spool information by default even when Spoolman is installed', () => {
    const { wrapper, commit } = mountCard()
    expect(wrapper.find('[data-spool-tool]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('multitool.no_spool')
    expect(wrapper.text()).not.toContain('multitool.unknown_remaining')
    wrapper.vm.selectSpool(0)
    expect(commit).not.toHaveBeenCalled()
    wrapper.destroy()
  })

  it('only shows spool binding when explicitly enabled and supported', () => {
    const disabled = mountCard(false, true)
    expect(disabled.wrapper.find('[data-spool-tool]').exists()).toBe(false)
    disabled.wrapper.destroy()
    const enabled = mountCard(true, true)
    expect(enabled.wrapper.findAll('[data-spool-tool]')).toHaveLength(2)
    enabled.wrapper.destroy()
  })

  it('persists the optional spool display preference', () => {
    const { wrapper, dispatch } = mountCard()
    wrapper.vm.showSpoolman = true
    expect(dispatch).toHaveBeenCalledWith('config/saveByPath', {
      path: 'uiSettings.multitool.showSpoolman', value: true, server: true
    })
    wrapper.destroy()
  })

  it('enables native layout controls rather than staying in normal card mode', () => {
    const { wrapper } = mountCard()
    const props = wrapper.findComponent(CollapsableCard).props()
    expect(props.draggable).toBe(true)
    expect(props.layoutPath).toBe('dashboard.multitool-card')
    const card = shallowMount(CollapsableCard, {
      propsData: { title: 'Toolchanger', draggable: props.draggable, layoutPath: props.layoutPath },
      mocks: {
        $typedState: { config: { layoutMode: true } },
        $typedGetters: {
          'layout/getSpecificLayoutName': 'dashboard',
          'layout/getConfig': () => ({ id: 'multitool-card', enabled: true, collapsed: false })
        }
      }
    })
    expect(card.vm.inLayout).toBe(true)
    expect(card.find('.collapsable-card-title').classes()).toContain('draggable')
    card.destroy()
    wrapper.destroy()
  })

  it('keeps the mounted tool visible when unhomed controls are disabled', async () => {
    const { wrapper, state } = mountCard()
    state.printer.printer.toolhead.homed_axes = ''
    await Vue.nextTick()
    expect(wrapper.vm.blockReason).toBe('not_homed')
    expect(wrapper.findAll('.multitool-tool-current')).toHaveLength(1)
    expect(wrapper.find('.multitool-tool-current').text()).toContain('T0')
    wrapper.destroy()
  })

  it('does not describe an inactive offset as a missing physical tool', async () => {
    const { wrapper, state } = mountCard()
    Vue.set(state.printer.printer, 'multitool_offsets', {
      applied_tool: -1, applied_x: 0, applied_y: 0, applied_z: 0, adaptive: false
    })
    await Vue.nextTick()
    expect(wrapper.text()).toContain('multitool.offsets_inactive')
    expect(wrapper.text()).not.toContain('multitool.no_tool')
    wrapper.destroy()
  })

  it('omits unused sensors and target-zero clutter without inventing readings', () => {
    const { wrapper, state } = mountCard()
    Vue.set(state.printer.printer.multitool!, 'tool_temperatures', [23.5, null])
    Vue.set(state.printer.printer.multitool!, 'tool_target_temperatures', [0, 0])
    expect(wrapper.vm.temperature(0)).toBe('23.5 °C')
    expect(wrapper.vm.temperature(1)).toBe('multitool.temperature_unavailable')
    expect(wrapper.text()).not.toContain('multitool.loaded_unknown')
    wrapper.destroy()
  })
})

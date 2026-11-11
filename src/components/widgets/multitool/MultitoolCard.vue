<template>
  <collapsable-card
    :title="$t('multitool.title')"
    icon="$printer3dNozzle"
    layout-path="dashboard.multitool-card"
  >
    <template #menu>
      <v-menu
        left
        offset-y
        :close-on-content-click="false"
      >
        <template #activator="{ on, attrs }">
          <app-btn
            icon
            :title="$t('multitool.settings')"
            v-bind="attrs"
            v-on="on"
          >
            <v-icon dense>
              {{ settingsIcon }}
            </v-icon>
          </app-btn>
        </template>
        <v-card class="pa-4">
          <v-switch
            v-model="reverseTools"
            :label="$t('multitool.reverse')"
            class="mt-0"
            hide-details
          />
        </v-card>
      </v-menu>
    </template>

    <v-card-text>
      <div class="d-flex flex-wrap align-center mb-3 multitool-status">
        <span class="font-weight-medium">{{ $t('multitool.current') }}: {{ currentToolLabel }}</span>
        <v-chip
          v-if="status?.heater_mode === 'shared'"
          small
          outlined
        >
          {{ $t('multitool.shared') }}
        </v-chip>
        <v-chip
          v-if="clamp"
          small
          :color="clampVerified ? (clamp.state === 'clamped' ? 'success' : undefined) : 'warning'"
          outlined
        >
          {{ $t(`multitool.${clampVerified ? clamp.state : 'clamp_unknown'}`) }}
        </v-chip>
      </div>

      <v-alert
        v-if="status?.shared_heater_fault"
        type="error"
        dense
        text
      >
        {{ $t('multitool.heater_fault') }}
      </v-alert>
      <v-alert
        v-else-if="status?.shared_heater_suspended"
        type="info"
        dense
        text
      >
        {{ $t('multitool.suspended') }}
      </v-alert>

      <v-alert
        v-if="swapActive"
        type="info"
        dense
        text
        aria-live="polite"
      >
        <div class="d-flex flex-wrap align-center multitool-status">
          <strong>{{ $t('multitool.swap') }}</strong>
          <span>{{ toolLabel(status?.change_from_tool) }} → {{ toolLabel(status?.change_to_tool) }}</span>
          <span>{{ $t('multitool.elapsed') }} {{ duration(stats?.tc_current?.elapsed) }}</span>
        </div>
        <div
          v-if="stats"
          class="d-flex flex-wrap mt-2 multitool-status"
        >
          <v-chip
            v-for="stage in stages"
            :key="stage"
            small
            :color="stats.tc_current?.active_stage === stage ? 'primary' : undefined"
          >
            {{ $t(`multitool.${stage}_stage`) }}
            {{ duration(stats.tc_current?.stages?.[stage]) }}
          </v-chip>
        </div>
      </v-alert>

      <v-alert
        v-if="runout?.active"
        type="warning"
        dense
        text
        aria-live="polite"
      >
        <strong>{{ $t('multitool.runout') }} · {{ toolLabel(runout.tool) }}</strong>
        <div>{{ $t('multitool.remaining', { remaining: remaining.toFixed(1), total: continuationLength.toFixed(1) }) }}</div>
        <div>{{ nextTool === null ? $t('multitool.no_continuation') : $t('multitool.next_tool', { tool: nextTool }) }}</div>
        <v-progress-linear
          v-if="continuationLength > 0"
          :value="Math.min(100, Math.max(0, (continuationLength - remaining) / continuationLength * 100))"
          color="warning"
          class="mt-2"
        />
      </v-alert>

      <div
        v-if="tools.length"
        class="multitool-rack"
      >
        <div
          v-for="tool in displayTools"
          :key="tool.index"
          class="multitool-tool pa-3"
          :class="{ 'multitool-tool-current': tool.current }"
        >
          <div class="text-h6">
            T{{ tool.index }}
          </div>
          <app-btn
            icon
            class="multitool-spool my-2"
            :disabled="!supportsSpoolman || !!editBlockReason"
            :title="$t('multitool.bind_spool', { tool: tool.index })"
            :aria-label="$t('multitool.bind_spool', { tool: tool.index })"
            @click="selectSpool(tool.index)"
          >
            <v-icon
              :color="tool.spool?.filament.color_hex || 'grey'"
              size="48"
            >
              $filament
            </v-icon>
          </app-btn>
          <div
            class="text-body-2 multitool-spool-name"
            :title="tool.spool?.filament_name"
          >
            {{ tool.spool?.filament_name || (tool.spoolId ? $t('multitool.missing_spool', { id: tool.spoolId }) : $t('multitool.no_spool')) }}
          </div>
          <div class="text-caption text--secondary">
            {{ spoolAmount(tool) }}
          </div>
          <v-progress-linear
            v-if="tool.percent !== null"
            :value="tool.percent"
            height="4"
            class="my-2"
            :color="tool.spool?.filament.color_hex || 'primary'"
          />
          <div class="text-caption mt-2">
            {{ $t(`multitool.${tool.loaded === null ? 'loaded_unknown' : tool.loaded ? 'loaded' : 'unloaded'}`) }}
          </div>
          <div class="text-caption mb-2">
            {{ temperature(tool.index) }}
          </div>
          <app-btn
            small
            block
            :color="tool.current ? 'primary' : undefined"
            :disabled="!!blockReason"
            :loading="pendingTool === tool.index"
            :title="blockReason ? $t(`multitool.${blockReason}`) : undefined"
            :data-tool="tool.index"
            @click="changeTool(tool.index)"
          >
            {{ $t(`multitool.${tool.current ? 'release' : 'pickup'}`, { tool: tool.index }) }}
          </app-btn>
        </div>
      </div>
      <div
        v-else
        class="text--secondary text-center py-4"
      >
        {{ $t('multitool.no_tools') }}
      </div>
      <div
        v-if="blockReason && !swapActive && !status?.shared_heater_fault"
        class="text-caption text--secondary mt-3"
      >
        {{ $t(`multitool.${blockReason}`) }}
      </div>

      <div
        v-if="offsets"
        class="text-caption mt-3"
      >
        {{ $t('multitool.applied') }}: {{ toolLabel(offsets.applied_tool) }}
        · X {{ offset(offsets.applied_x) }} Y {{ offset(offsets.applied_y) }} Z {{ offset(offsets.applied_z) }}
        <span v-if="offsets.adaptive"> · {{ $t('multitool.adaptive') }}</span>
      </div>
      <div
        v-if="!stats && !offsets && !clamp && !filament"
        class="text-caption text--secondary mt-3"
      >
        {{ $t('multitool.optional') }}
      </div>
    </v-card-text>

    <v-expansion-panels
      v-if="groups.length || stats || offsets"
      :value="settings.expandedSections"
      multiple
      flat
      @change="saveExpandedSections"
    >
      <v-expansion-panel v-if="groups.length">
        <v-expansion-panel-header>{{ $t('multitool.groups') }}</v-expansion-panel-header>
        <v-expansion-panel-content>
          <div
            v-for="group in groups"
            :key="group.join(',')"
            class="text-body-2 mb-2"
          >
            {{ $t('multitool.group', { group: groups.indexOf(group) + 1 }) }}:
            {{ group.map(tool => `T${tool}`).join(' → ') }}
          </div>
        </v-expansion-panel-content>
      </v-expansion-panel>
      <v-expansion-panel v-if="stats">
        <v-expansion-panel-header>{{ $t('multitool.stats') }}</v-expansion-panel-header>
        <v-expansion-panel-content>
          <div
            v-for="item in statisticItems"
            :key="item.key"
            class="d-flex justify-space-between text-body-2 mb-2"
          >
            <span>{{ $t(`multitool.${item.key}`) }}</span>
            <strong>{{ item.value }}</strong>
          </div>
          <v-divider class="my-3" />
          <div
            v-for="stage in stages"
            :key="stage"
            class="d-flex justify-space-between text-body-2 mb-2"
          >
            <span>{{ $t(`multitool.${stage}_stage`) }}</span>
            <span>{{ duration(stats.tc_print?.stages?.[stage]) }}</span>
          </div>
        </v-expansion-panel-content>
      </v-expansion-panel>
      <v-expansion-panel v-if="offsets">
        <v-expansion-panel-header>{{ $t('multitool.offsets') }}</v-expansion-panel-header>
        <v-expansion-panel-content>
          <v-simple-table dense>
            <thead>
              <tr><th>T</th><th>X</th><th>Y</th><th>Z</th><th /></tr>
            </thead>
            <tbody>
              <tr
                v-for="tool in tools"
                :key="tool.index"
                :class="{ 'primary--text': tool.current }"
              >
                <td>T{{ tool.index }}</td>
                <td>{{ savedOffset(tool.index, 'x') }}</td>
                <td>{{ savedOffset(tool.index, 'y') }}</td>
                <td>{{ savedOffset(tool.index, 'z') }}</td>
                <td class="text-caption">
                  {{ tool.index === (status?.base_tool ?? 0) ? $t('multitool.base') : isCalibrated(tool.index) ? '' : $t('multitool.uncalibrated') }}
                </td>
              </tr>
            </tbody>
          </v-simple-table>
        </v-expansion-panel-content>
      </v-expansion-panel>
    </v-expansion-panels>
  </collapsable-card>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'
import { consola } from 'consola'
import { mdiCog } from '@mdi/js'
import StateMixin from '@/mixins/state'
import { SocketActions } from '@/api/socketActions'
import type { SpoolSelectionDialogState } from '@/store/spoolman/types'
import type { MultitoolConfig } from '@/store/config/types'
import {
  formatMultitoolDuration, getMultitoolBlockReason, getMultitoolCommand,
  getMultitoolGroups, getMultitoolTemperature, getMultitoolTools, multitoolStages,
  type MultitoolTool
} from '@/util/multitool'
import { multitoolMessages } from './locales'

@Component({
  i18n: { messages: multitoolMessages }
})
export default class MultitoolCard extends Mixins(StateMixin) {
  pendingTool: number | null = null
  selectedSpoolTool: number | null = null
  stages = multitoolStages
  settingsIcon = mdiCog
  duration = formatMultitoolDuration

  get printer () { return this.$typedState.printer.printer }
  get status () { return this.printer.multitool }
  get filament () { return this.printer.multitool_filament }
  get clamp () { return this.printer.multitool_clamp }
  get stats () { return this.printer.multitool_stats }
  get offsets () { return this.printer.multitool_offsets }
  get runout () { return this.filament?.runout }
  get settings () { return this.$typedState.config.uiSettings.multitool }
  get variables () { return this.printer.save_variables?.variables ?? {} }

  get tools () {
    return getMultitoolTools(this.status, this.filament, this.$typedGetters['spoolman/getAvailableSpools'])
  }

  get displayTools () { return this.reverseTools ? [...this.tools].reverse() : this.tools }
  get currentToolLabel () { return this.toolLabel(this.status?.current_tool) }
  get swapActive () { return !!(this.status?.active || this.stats?.tc_current?.active) }
  get clampVerified () { return !this.clamp?.seeded && ['clamped', 'released'].includes(this.clamp?.state ?? '') }
  get supportsSpoolman () { return this.$typedGetters['server/componentSupport']('spoolman') }
  get groups () { return getMultitoolGroups(this.filament?.continuation_groups, this.tools.length) }
  get remaining () { return Math.max(0, this.runout?.remaining_mm ?? 0) }
  get continuationLength () { return Math.max(0, this.runout?.continue_length ?? this.filament?.runout_continue_length ?? 0) }

  get nextTool (): number | null {
    const tool = this.runout?.tool ?? this.status?.current_tool ?? -1
    const group = this.groups.find(group => group.includes(tool))
    if (!group) return null
    const start = group.indexOf(tool)
    for (let step = 1; step < group.length; step++) {
      const next = group[(start + step) % group.length]
      if (this.filament?.loaded[next] === true) return next
    }
    return null
  }

  get controlContext () {
    return {
      status: this.status,
      ready: this.socketReady && this.klippyReady,
      pending: this.pendingTool !== null || this.swapActive || this.hasWaitsBy('multitool.'),
      printerState: this.printerState,
      idleState: this.printer.idle_timeout.state,
      homedAxes: this.printer.toolhead.homed_axes
    }
  }

  get blockReason () { return getMultitoolBlockReason(this.controlContext) }
  get editBlockReason () { return getMultitoolBlockReason(this.controlContext, false) }
  get reverseTools () { return this.settings.reverseTools }
  set reverseTools (value: boolean) { this.saveSetting('reverseTools', value) }

  get statisticItems () {
    const print = this.stats?.tc_print
    const total = this.stats?.tc_total
    const count = print?.count ?? 0
    return [
      { key: 'print_count', value: count },
      { key: 'print_elapsed', value: this.duration(print?.elapsed) },
      { key: 'average', value: this.duration(count > 0 ? (print?.elapsed ?? 0) / count : 0) },
      { key: 'total_count', value: total?.count ?? 0 },
      { key: 'total_elapsed', value: this.duration(total?.elapsed) }
    ]
  }

  toolLabel (tool?: number) {
    return Number.isInteger(tool) && tool != null && tool >= 0 && tool < this.tools.length
      ? `T${tool}`
      : this.$t('multitool.no_tool').toString()
  }

  spoolAmount (tool: MultitoolTool) {
    const grams = tool.spool?.remaining_weight
    return grams != null
      ? `${Math.round(grams)} g${tool.percent !== null ? ` · ${tool.percent}%` : ''}`
      : this.$t('multitool.unknown_remaining').toString()
  }

  temperature (tool: number) {
    const { temperature, target } = getMultitoolTemperature(this.printer, tool)
    return `${temperature?.toFixed(1) ?? '—'} / ${target?.toFixed(0) ?? '—'} °C`
  }

  offset (value?: number) { return value != null && Number.isFinite(value) ? value.toFixed(3) : '—' }

  savedOffset (tool: number, axis: string) {
    const value = this.variables[`t${tool}_offset_${axis}`]
    return this.offset(typeof value === 'number' ? value : tool === (this.status?.base_tool ?? 0) ? 0 : undefined)
  }

  isCalibrated (tool: number) {
    return ['x', 'y', 'z'].every(axis => {
      const value = this.variables[`t${tool}_offset_${axis}`]
      return typeof value === 'number' && Number.isFinite(value)
    })
  }

  saveSetting<K extends keyof MultitoolConfig> (key: K, value: MultitoolConfig[K]) {
    this.$typedDispatch('config/saveByPath', { path: `uiSettings.multitool.${key}`, value, server: true })
  }

  saveExpandedSections (value: number[]) { this.saveSetting('expandedSections', value) }

  async changeTool (tool: number) {
    if (this.blockReason || !this.status) return
    const command = getMultitoolCommand(this.status, tool)
    if (!command) return
    this.pendingTool = tool
    try {
      this.addConsoleEntry(command)
      await SocketActions.printerGcodeScript(command, { wait: 'multitool.change' })
    } catch (error) {
      // SocketClient 已显示服务器返回的错误；不重试会产生机械动作的命令。
      consola.debug('Multitool command failed', error)
    } finally {
      this.pendingTool = null
    }
  }

  selectSpool (tool: number) {
    if (this.editBlockReason || !this.supportsSpoolman || !this.tools[tool]) return
    this.selectedSpoolTool = tool
    this.$typedCommit('spoolman/setDialogState', {
      show: true, spoolSelectionOnly: true, selectedSpoolId: this.tools[tool].spoolId || undefined
    })
  }

  @Watch('$typedState.spoolman.dialog')
  async onSpoolSelection (dialog: SpoolSelectionDialogState) {
    if (dialog.show || this.selectedSpoolTool === null) return
    const tool = this.selectedSpoolTool
    this.selectedSpoolTool = null
    const spoolId = dialog.selectedSpoolId ?? 0
    if (this.editBlockReason || !this.tools[tool] || this.tools[tool].spoolId === spoolId) return
    if (!Number.isSafeInteger(spoolId) || spoolId < 0) return
    const command = `SET_TOOL_SPOOL_ID TOOL=${tool} SPOOL_ID=${spoolId}`
    try {
      this.addConsoleEntry(command)
      await SocketActions.printerGcodeScript(command, { wait: 'multitool.spool' })
    } catch (error) {
      consola.debug('Multitool spool assignment failed', error)
    }
  }
}
</script>

<style lang="scss" scoped>
.multitool-status {
  gap: 8px;
}

.multitool-rack {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.multitool-tool {
  min-width: 0;
  text-align: center;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 6px;
}

.multitool-tool-current {
  border-color: var(--v-primary-base);
  box-shadow: inset 0 0 0 1px var(--v-primary-base);
}

.multitool-spool {
  width: 56px;
  height: 56px;
}

.multitool-spool-name {
  overflow-wrap: anywhere;
}
</style>

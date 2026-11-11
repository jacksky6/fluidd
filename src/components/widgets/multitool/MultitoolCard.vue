<template>
  <collapsable-card
    :title="$t('multitool.title')"
    icon="$printer3dNozzle"
    layout-path="dashboard.multitool-card"
    class="multitool-panel"
    draggable
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
          <v-switch
            v-if="supportsSpoolman"
            v-model="showSpoolman"
            :label="$t('multitool.show_spoolman')"
            hide-details
          />
        </v-card>
      </v-menu>
    </template>

    <v-card-text>
      <div class="d-flex flex-wrap align-center mb-3 multitool-status">
        <span class="multitool-current-label">
          <span
            class="multitool-status-dot"
            :class="{ mounted: hasCurrentTool }"
          />
          {{ $t('multitool.current') }} <strong>{{ currentToolLabel }}</strong>
        </span>
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
          class="multitool-tool"
          :class="{ 'multitool-tool-current': tool.current }"
        >
          <div class="multitool-tool-heading">
            <strong>T{{ tool.index }}</strong>
            <span class="multitool-tool-state">{{ $t(`multitool.${tool.current ? 'mounted' : 'standby'}`) }}</span>
          </div>
          <multitool-hotend
            :tool="tool.index"
            :mounted="tool.current"
          />
          <div class="multitool-temperature">
            {{ temperature(tool.index) }}
          </div>
          <div
            v-if="showSpoolman"
            class="multitool-spool"
            :data-spool-tool="tool.index"
          >
            <app-btn
              x-small
              text
              block
              class="multitool-spool-button"
              :disabled="!!editBlockReason"
              :title="$t('multitool.bind_spool', { tool: tool.index })"
              @click="selectSpool(tool.index)"
            >
              <v-icon
                small
                left
                :color="tool.spool?.filament.color_hex || undefined"
              >
                $filament
              </v-icon>
              <span class="text-truncate">{{ tool.spool?.filament_name || (tool.spoolId ? $t('multitool.missing_spool', { id: tool.spoolId }) : $t('multitool.no_spool')) }}</span>
            </app-btn>
            <div
              v-if="tool.spool"
              class="text-caption text--secondary"
            >
              {{ spoolAmount(tool) }}
            </div>
          </div>
          <div
            v-if="tool.loaded !== null"
            class="multitool-filament-state text-caption"
          >
            <span
              class="multitool-status-dot"
              :class="{ mounted: tool.loaded }"
            />
            {{ $t(`multitool.${tool.loaded ? 'loaded' : 'unloaded'}`) }}
          </div>
          <app-btn
            class="multitool-tool-action"
            small
            block
            outlined
            :color="tool.current ? 'success' : undefined"
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
    </v-card-text>

    <v-expansion-panels
      v-if="groups.length || stats || offsets"
      :value="settings.expandedSections"
      multiple
      flat
      class="multitool-sections"
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
          <div class="multitool-statistics">
            <div class="multitool-stat-average">
              <span class="multitool-stat-label">{{ $t('multitool.average') }}</span>
              <strong>{{ averageDuration }}</strong>
            </div>
            <div class="multitool-stat-grid">
              <div
                v-for="item in statisticItems"
                :key="item.key"
                class="multitool-stat-metric"
              >
                <span class="multitool-stat-label">{{ $t(`multitool.${item.key}`) }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>
          <div class="multitool-stage-heading">
            {{ $t(`multitool.${swapActive ? 'current_stages' : 'last_stages'}`) }}
          </div>
          <div
            class="multitool-stage-bar"
            role="img"
            :aria-label="stageSummary"
          >
            <span
              v-for="stage in stageBreakdown"
              :key="stage.key"
              :class="`multitool-stage-${stage.key}`"
              :style="{ width: `${stage.percent}%` }"
            />
          </div>
          <div class="multitool-stage-legend">
            <span
              v-for="stage in stageBreakdown"
              :key="stage.key"
            >
              <i :class="`multitool-stage-${stage.key}`" />
              {{ $t(`multitool.${stage.key}_stage`) }} {{ duration(stage.seconds) }}
              <span class="text--secondary">{{ Math.round(stage.percent) }}%</span>
            </span>
          </div>
        </v-expansion-panel-content>
      </v-expansion-panel>
      <v-expansion-panel v-if="offsets">
        <v-expansion-panel-header>{{ $t('multitool.offsets') }}</v-expansion-panel-header>
        <v-expansion-panel-content>
          <div class="multitool-offset-grid">
            <div
              v-for="tool in tools"
              :key="tool.index"
              class="multitool-offset-card"
              :class="{ current: tool.current }"
            >
              <div class="multitool-offset-heading">
                <strong>T{{ tool.index }}</strong>
                <span
                  v-if="tool.index === (status?.base_tool ?? 0)"
                  class="multitool-tag"
                >{{ $t('multitool.base') }}</span>
                <span
                  v-if="tool.current"
                  class="multitool-tag current"
                >{{ $t('multitool.mounted') }}</span>
                <span
                  v-if="tool.index !== (status?.base_tool ?? 0) && !isCalibrated(tool.index)"
                  class="multitool-offset-uncalibrated"
                >{{ $t('multitool.uncalibrated') }}</span>
              </div>
              <div class="multitool-offset-values">
                <span
                  v-for="axis in axes"
                  :key="axis"
                >
                  {{ axis.toUpperCase() }}<strong>{{ savedOffset(tool.index, axis) }}</strong>
                </span>
              </div>
            </div>
          </div>
          <div class="multitool-applied-offset text-caption text--secondary">
            <template v-if="hasAppliedOffset">
              {{ $t('multitool.applied') }} · {{ toolLabel(offsets.applied_tool) }}
              · X {{ offset(offsets.applied_x) }} Y {{ offset(offsets.applied_y) }} Z {{ offset(offsets.applied_z) }}
            </template>
            <template v-else>
              {{ $t('multitool.offsets_inactive') }}
            </template>
            <span v-if="offsets.adaptive"> · {{ $t('multitool.adaptive') }}</span>
          </div>
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
  getMultitoolGroups, getMultitoolTemperature, getMultitoolTools, getMultitoolStageBreakdown, multitoolStages,
  type MultitoolTool
} from '@/util/multitool'
import { multitoolMessages } from './locales'
import MultitoolHotend from './MultitoolHotend.vue'

@Component({
  components: { MultitoolHotend },
  i18n: { messages: multitoolMessages }
})
export default class MultitoolCard extends Mixins(StateMixin) {
  pendingTool: number | null = null
  selectedSpoolTool: number | null = null
  stages = multitoolStages
  axes = ['x', 'y', 'z']
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
  get hasCurrentTool () { return this.tools.some(tool => tool.current) }
  get hasAppliedOffset () { return this.tools.some(tool => tool.index === this.offsets?.applied_tool) }
  get swapActive () { return !!(this.status?.active || this.stats?.tc_current?.active) }
  get clampVerified () { return !this.clamp?.seeded && ['clamped', 'released'].includes(this.clamp?.state ?? '') }
  get supportsSpoolman () { return this.$typedGetters['server/componentSupport']('spoolman') }
  get showSpoolman () { return this.supportsSpoolman && !!this.settings.showSpoolman }
  set showSpoolman (value: boolean) { this.saveSetting('showSpoolman', value) }
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
    return [
      { key: 'print_count', value: print?.count ?? 0 },
      { key: 'print_elapsed', value: this.duration(print?.elapsed) },
      { key: 'total_count', value: total?.count ?? 0 },
      { key: 'total_elapsed', value: this.duration(total?.elapsed) }
    ]
  }

  get averageDuration () {
    const count = this.stats?.tc_print?.count ?? 0
    return this.duration(count > 0 ? (this.stats?.tc_print?.elapsed ?? 0) / count : 0)
  }

  get stageBreakdown () { return getMultitoolStageBreakdown(this.stats?.tc_current) }

  get stageSummary () {
    return this.stageBreakdown.map(stage =>
      `${this.$t(`multitool.${stage.key}_stage`)} ${this.duration(stage.seconds)}`
    ).join(', ')
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
    if (temperature === null && !target) return this.$t('multitool.temperature_unavailable').toString()
    return `${temperature?.toFixed(1) ?? '—'}${target ? ` / ${target.toFixed(0)}` : ''} °C`
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
    if (this.editBlockReason || !this.showSpoolman || !this.tools[tool]) return
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
.multitool-panel {
  --tc-line: rgba(128, 128, 128, 0.2);
  --tc-surface: rgba(128, 128, 128, 0.045);
  --tc-active: #48c78e;
  font-variant-numeric: tabular-nums;

  &.theme--light { --tc-active: #18794e; }
}

.multitool-status {
  gap: 8px;
}

.multitool-current-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;

  strong { font-size: 14px; }
}

.multitool-status-dot {
  display: inline-block;
  flex: 0 0 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8b929c;

  &.mounted { background: var(--tc-active); }
}

.multitool-rack {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 156px));
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--tc-line);
  border-radius: 12px;
  background:
    radial-gradient(ellipse at 50% 110%, rgba(95, 123, 150, 0.13), transparent 70%),
    linear-gradient(180deg, rgba(128, 128, 128, 0.02), rgba(128, 128, 128, 0.065));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
}

.multitool-tool {
  min-width: 0;
  padding: 10px;
  text-align: center;
  border: 1px solid var(--tc-line);
  border-radius: 9px;
  background: var(--tc-surface);
}

.multitool-tool-current {
  border-color: var(--tc-active);
  background: linear-gradient(180deg, rgba(72, 199, 142, 0.085), rgba(72, 199, 142, 0.015));
  box-shadow: 0 3px 16px rgba(0, 0, 0, 0.05);

  .multitool-tool-state { color: var(--tc-active); }
}

.multitool-tool-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  strong { font-size: 16px; }
}

.multitool-tool-state {
  font-size: 10px;
  opacity: 0.85;
}

.multitool-temperature {
  min-height: 22px;
  font-size: 12px;
  font-weight: 500;
}

.multitool-filament-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 2px 0;
}

.multitool-tool-action.app-btn {
  margin-top: 8px;
  height: 28px;
  font-size: 11px;
  letter-spacing: 0;
}

.multitool-spool-button.app-btn {
  padding: 0 2px;
  letter-spacing: 0;
}

.multitool-sections {
  border-top: 1px solid var(--tc-line);

  ::v-deep .v-expansion-panel-header {
    min-height: 42px;
    padding: 12px 16px;
    font-size: 12px;
    font-weight: 500;
  }

  ::v-deep .v-expansion-panel-content__wrap { padding: 0 16px 16px; }
}

.multitool-statistics {
  display: grid;
  grid-template-columns: minmax(105px, 0.8fr) 2fr;
  overflow: hidden;
  border: 1px solid var(--tc-line);
  border-radius: 9px;
  background: var(--tc-surface);
}

.multitool-stat-average {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 14px;

  strong {
    color: var(--tc-active);
    font-size: 28px;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
}

.multitool-stat-label {
  display: block;
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.65;
}

.multitool-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.multitool-stat-metric {
  padding: 10px 12px;
  border-left: 1px solid var(--tc-line);

  &:nth-child(n + 3) { border-top: 1px solid var(--tc-line); }
  strong { display: block; margin-top: 3px; font-size: 15px; overflow-wrap: anywhere; }
}

.multitool-stage-heading {
  margin: 14px 0 8px;
  font-size: 11px;
  opacity: 0.65;
}

.multitool-stage-bar {
  display: flex;
  height: 7px;
  overflow: hidden;
  border-radius: 5px;
  background: rgba(128, 128, 128, 0.12);
}

.multitool-stage-release { background: #58a6ff; }
.multitool-stage-pickup { background: #48c78e; }
.multitool-stage-heat_wait { background: #e8ad55; }

.multitool-stage-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 9px;
  font-size: 11px;

  > span { display: flex; align-items: center; gap: 4px; }
  i { width: 6px; height: 6px; border-radius: 2px; }
}

.multitool-offset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  gap: 10px;
}

.multitool-offset-card {
  padding: 10px;
  border: 1px solid var(--tc-line);
  border-radius: 8px;
  background: var(--tc-surface);

  &.current { border-color: var(--tc-active); }
}

.multitool-offset-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}

.multitool-tag {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(88, 166, 255, 0.12);
  color: #58a6ff;
  font-size: 10px;

  &.current { background: rgba(72, 199, 142, 0.12); color: var(--tc-active); }
}

.multitool-offset-uncalibrated { font-size: 10px; opacity: 0.55; }

.multitool-offset-values {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
  font-size: 10px;
  color: var(--v-secondary-base);

  strong { display: block; margin-top: 2px; color: var(--v-primary-base); font-size: 12px; }
}

.multitool-applied-offset { margin-top: 10px; }

@media (max-width: 400px) {
  .multitool-statistics { grid-template-columns: 1fr; }
  .multitool-stat-average { padding: 12px; border-bottom: 1px solid var(--tc-line); }
  .multitool-stat-metric:nth-child(odd) { border-left: 0; }
}
</style>

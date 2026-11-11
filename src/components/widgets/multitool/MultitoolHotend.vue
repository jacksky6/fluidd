<template>
  <svg
    class="multitool-hotend"
    :class="{ mounted }"
    viewBox="0 0 100 112"
    width="80"
    height="90"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient
        :id="metalId"
        x1="0"
        x2="1"
      >
        <stop
          offset="0"
          stop-color="#59626e"
        />
        <stop
          offset="0.25"
          stop-color="#b8c4cf"
        />
        <stop
          offset="0.43"
          stop-color="#edf2f5"
        />
        <stop
          offset="0.7"
          stop-color="#8f9ba6"
        />
        <stop
          offset="1"
          stop-color="#46515e"
        />
      </linearGradient>
      <linearGradient
        :id="brassId"
        x1="0"
        x2="1"
      >
        <stop
          offset="0"
          stop-color="#88633d"
        />
        <stop
          offset="0.4"
          stop-color="#ebc38a"
        />
        <stop
          offset="0.7"
          stop-color="#c49a62"
        />
        <stop
          offset="1"
          stop-color="#775331"
        />
      </linearGradient>
    </defs>
    <!-- 通用可更换热端示意，不代表夹紧检测或真实机械位置。 -->
    <ellipse
      class="hotend-shadow"
      cx="50"
      cy="104"
      rx="29"
      ry="5"
    />
    <ellipse
      class="hotend-halo"
      cx="50"
      cy="57"
      rx="35"
      ry="46"
    />
    <rect
      x="43"
      y="9"
      width="14"
      height="19"
      rx="3"
      :fill="metal"
      stroke="#56616c"
    />
    <rect
      x="33"
      y="25"
      width="34"
      height="9"
      rx="3"
      :fill="metal"
      stroke="#56616c"
    />
    <rect
      x="36"
      y="34"
      width="28"
      height="37"
      rx="3"
      :fill="metal"
      stroke="#56616c"
    />
    <path
      d="M36 42h28m-28 7h28m-28 7h28m-28 7h28"
      stroke="#47545f"
      stroke-opacity="0.55"
    />
    <path
      d="M40 35v34"
      stroke="#fff"
      stroke-opacity="0.4"
    />
    <rect
      x="31"
      y="70"
      width="38"
      height="12"
      rx="3"
      :fill="metal"
      stroke="#56616c"
    />
    <path
      d="M39 82h22l4 7-15 11-15-11Z"
      :fill="brass"
      stroke="#85603b"
    />
    <path
      d="m44 96 6 7 6-7"
      :fill="brass"
      stroke="#85603b"
    />
    <path
      d="M48.5 103h3"
      stroke="#292c31"
      stroke-width="2"
      stroke-linecap="round"
    />
    <path
      d="M35 73h30"
      stroke="#fff"
      stroke-opacity="0.35"
    />
  </svg>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'

@Component({})
export default class MultitoolHotend extends Vue {
  @Prop({ type: Number, required: true }) readonly tool!: number
  @Prop({ type: Boolean }) readonly mounted?: boolean

  get metalId () { return `multitool-metal-${this.tool}` }
  get brassId () { return `multitool-brass-${this.tool}` }
  get metal () { return `url(#${this.metalId})` }
  get brass () { return `url(#${this.brassId})` }
}
</script>

<style lang="scss" scoped>
.multitool-hotend {
  display: block;
  margin: 2px auto 0;
}

.hotend-shadow { fill: rgba(0, 0, 0, 0.22); }
.hotend-halo { fill: transparent; }
.mounted .hotend-halo { fill: rgba(72, 199, 142, 0.07); }
.mounted .hotend-shadow { fill: rgba(72, 199, 142, 0.18); }
</style>

<template>
  <section class="query-panel" aria-label="查询条件"><slot /></section>
</template>
<style scoped>
.query-panel { position: sticky; top: calc(var(--abis-nav-height,72px) + var(--abis-workspace-top,32px) + var(--abis-query-padding,20px) + 1px); z-index: 90; background: #fff; }
.query-panel::before { content: ''; position: absolute; bottom: 100%; left: 0; right: 0; height: calc(var(--abis-workspace-top,32px) + var(--abis-query-padding,20px) + 1px); background: #fff; pointer-events: none; }
</style>

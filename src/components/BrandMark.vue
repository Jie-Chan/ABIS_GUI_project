<template>
  <span class="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
</template>

<style scoped>
.brand-mark { display: inline-grid; grid-template-columns: repeat(2, 1fr); gap: 3px; width: 28px; height: 28px; flex-shrink: 0; }
i { background: #3478f6; border-radius: 3px; }
i:first-child { background: #659aff; }
i:last-child { background: #245bda; }
</style>

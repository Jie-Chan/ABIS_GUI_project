<script setup>
import { isMockPreview, dataSourceLabel } from '@/constants/presentation'
</script>

<template>
  <span class="source-badge" :class="{ 'source-badge--http': !isMockPreview }">{{ dataSourceLabel }}</span>
</template>

<style scoped>
.source-badge { display: inline-flex; align-items: center; white-space: nowrap; padding: 6px 11px; border: 1px solid #f4dfb7; border-radius: 6px; background: #fff6e5; color: #965c0d; font-size: 12px; font-weight: 600; line-height: 18px; }
.source-badge--http { color: #315ec1; background: #edf3ff; border-color: #d5e2ff; }
</style>

<script setup>
defineProps({ name: { type: String, default: 'monitor' }, size: { type: [Number, String], default: 20 } })

const paths = {
  monitor: ['M4 4h16v12H4z', 'M8 20h8M12 16v4'],
  threshold: ['M3 6h5m4 0h9M3 12h11m4 0h3M3 18h2m4 0h12', 'M8 3v6m6 0v6M5 15v6'],
  accounts: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21v-2a8 8 0 0 1 16 0v2Z'],
  logs: ['M6 3h8l4 4v14H6Z', 'M14 3v5h4M9 12h6m-6 4h6'],
  audits: ['M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z', 'm8 12 3 3 5-6'],
  server: ['M4 3h16v7H4zM4 14h16v7H4z', 'M7 6.5h.01M7 17.5h.01M11 6.5h6m-6 11h6'],
  check: ['m5 12 4 4L19 6'],
  alert: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v6m0 3h.01'],
  minus: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M8 12h8'],
  refresh: ['M20 7v5h-5', 'M20 12a8 8 0 1 0-2 5M20 7l-3-3'],
  lock: ['M5 10h14v11H5Z', 'M8 10V6a4 4 0 0 1 8 0v4M12 14v3'],
  database: ['M20 6c0 2-3.6 3-8 3S4 8 4 6s3.6-3 8-3 8 1 8 3Z', 'M4 6v12c0 2 3.6 3 8 3s8-1 8-3V6M4 12c0 2 3.6 3 8 3s8-1 8-3'],
  face: ['M3 8V4h4m10 0h4v4M3 16v4h4m10 0h4v-4', 'M16 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM7 18a5 5 0 0 1 10 0'],
  fingerprint: ['M4 11a8 8 0 0 1 16 0m-14 4v-4a6 6 0 0 1 12 0v3m-10 5c2-3 0-5 0-8a4 4 0 0 1 8 0v5c0 2-1 4-2 5m-3-1c2-3 1-6 1-9m7 6 1-4'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  close: ['m6 6 12 12M6 18 18 6'],
  arrow: ['m9 5 7 7-7 7'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 11v6m0-10h.01'],
}
</script>

<template>
  <svg class="ui-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(path, i) in paths[name] || paths.monitor" :key="i" :d="path" />
  </svg>
</template>

<style scoped>
.ui-icon { display: inline-block; flex-shrink: 0; vertical-align: middle; }
</style>

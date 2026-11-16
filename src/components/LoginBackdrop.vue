<script setup>
const backgroundUrl = `${import.meta.env.BASE_URL}images/login/reference-background-v2.png`
</script>

<template>
  <div class="login-backdrop" aria-hidden="true">
    <img class="background-wash" :src="backgroundUrl" alt="" />
    <img class="background-detail" :src="backgroundUrl" alt="" />
    <div class="edge-fingerprint"><img :src="backgroundUrl" alt="" /></div>
    <div class="edge-face"><img :src="backgroundUrl" alt="" /></div>
  </div>
</template>

<style scoped>
.login-backdrop { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; background: radial-gradient(ellipse at 48% 42%, #f6f8ff 0%, #f0f4fe 55%, #e7f0fe 100%); }
.background-wash, .background-detail { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; }
.background-wash { opacity: .32; }
.background-detail { mask-image: linear-gradient(to right, #000 0%, #000 69%, transparent 82%), linear-gradient(to bottom, transparent 31%, #000 44%, #000 61%, transparent 77%); mask-composite: add; }
.edge-fingerprint, .edge-face { display: none; }
@media (max-width: 767px) {
  .background-wash { opacity: .45; }
  .background-detail { display: none; }
  .edge-fingerprint, .edge-face { display: block; position: absolute; overflow: hidden; }
  .edge-fingerprint { left: 0; bottom: 0; width: 120px; height: 170px; opacity: .7; mask-image: linear-gradient(to bottom, transparent 0%, #000 55%), linear-gradient(to right, #000 0%, #000 60%, transparent 100%); mask-composite: intersect; }
  .edge-fingerprint img { position: absolute; left: -12px; bottom: -12px; width: 790px; max-width: none; height: auto; }
  .edge-face { right: 0; top: calc(50% - 230px); width: 78px; height: 460px; opacity: .6; mask-image: linear-gradient(to bottom, transparent 10%, #000 36%, #000 63%, transparent 90%), linear-gradient(to right, transparent 0%, #000 88%); mask-composite: intersect; }
  .edge-face img { position: absolute; right: -113px; top: 0; width: 736px; max-width: none; height: 460px; }
}
</style>

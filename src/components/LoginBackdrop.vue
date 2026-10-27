<template>
  <div class="login-backdrop" aria-hidden="true">
    <div class="technical-grid" />
    <svg class="biometric-network" viewBox="0 0 1600 1000" fill="none" preserveAspectRatio="xMidYMid slice">
      <defs>
        <symbol id="login-database" viewBox="0 0 24 24">
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v12c0 4 16 4 16 0V6M4 12c0 4 16 4 16 0" />
        </symbol>
        <symbol id="login-server" viewBox="0 0 24 24">
          <path d="M4 3h16v7H4zM4 14h16v7H4zM7 6h.1M7 17h.1M11 6h6M11 17h6" />
        </symbol>
        <symbol id="login-face" viewBox="0 0 24 24">
          <path d="M3 8V4h4m10 0h4v4M3 16v4h4m10 0h4v-4M16 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0M7 18a5 5 0 0 1 10 0" />
        </symbol>
      </defs>

      <g class="network-rings">
        <circle cx="-36" cy="770" r="210" /><circle cx="-36" cy="770" r="250" /><circle cx="-36" cy="770" r="325" />
        <circle cx="-24" cy="-15" r="285" /><circle cx="-24" cy="-15" r="340" />
        <circle cx="1640" cy="290" r="220" /><circle cx="1640" cy="290" r="265" />
        <path d="M1030 1000a620 620 0 0 1 620-430M1100 1000a550 550 0 0 1 550-360" />
      </g>

      <g class="fingerprint-ridges">
        <path d="M-95 875c115-24 180-118 180-220a115 115 0 0 0-230 0" />
        <path d="M-80 860c103-30 151-111 151-205a101 101 0 0 0-202 0v21" />
        <path d="M-65 844C22 812 57 740 57 655a87 87 0 0 0-174 0v35" />
        <path d="M-51 828c74-35 94-99 94-173a73 73 0 0 0-146 0v48" />
        <path d="M-36 810c57-36 65-93 65-155a59 59 0 0 0-118 0v60" />
        <path d="M-23 790c38-32 38-84 38-135a45 45 0 0 0-90 0v74" />
        <path d="M-12 769c18-28 13-72 13-114a31 31 0 0 0-62 0v77c0 30-13 60-35 80" />
        <path d="M-20 746c-2-25-5-57-5-91a6 6 0 0 0-12 0v69c0 41-18 77-48 102" />
      </g>

      <g class="network-traces">
        <path d="M176 495v76q0 20 20 20h61q20 0 20 20v58M-20 535h83q20 0 20-20v-39q0-20 20-20h73M277 736v94q0 20 20 20h46v150M90 871h94q20 0 20 20v109M337 667h44q20 0 20 20v159" />
        <path d="M1280 40v168q0 20 20 20h72M1280 288v92q0 20 20 20h60q20 0 20 20v99M1380 579v168M1440 549h56q20 0 20-20v-41h84M1450 80h-54q-20 0-20 20v63" />
      </g>

      <g class="face-mesh">
        <path d="m1610 106-84 20-47 58-24 68-35 56 32 19-4 40 25 45 59 42 78-28" />
        <path d="m1526 126 44 69 40-89m-131 78 91 11 40 63m-155-6 115-57-40 86-75-29m-35 56 110-27-78 46m-4 40 82-86 2 89-59 42m-25-45 84 3-9 84m-53-127 60 43 78 56m-30-231 40 175m-80-89 80-23" />
        <path class="scan-brackets" d="M1435 160v-24h24M1435 377v24h24" />
      </g>

      <g class="network-nodes">
        <rect x="143" y="423" width="66" height="66" rx="10" /><use href="#login-database" x="161" y="441" width="30" height="30" />
        <rect x="244" y="667" width="66" height="66" rx="10" /><use href="#login-face" x="262" y="685" width="30" height="30" />
        <rect x="310" y="850" width="66" height="66" rx="10" /><use href="#login-server" x="328" y="868" width="30" height="30" />
        <rect x="1247" y="224" width="66" height="66" rx="10" /><use href="#login-database" x="1265" y="242" width="30" height="30" />
        <rect x="1347" y="515" width="66" height="66" rx="10" /><use href="#login-server" x="1365" y="533" width="30" height="30" />
      </g>
      <g class="trace-points">
        <circle cx="83" cy="515" r="4" /><circle cx="204" cy="891" r="4" /><circle cx="277" cy="803" r="4" />
        <circle cx="176" cy="571" r="4" /><circle cx="1280" cy="96" r="4" /><circle cx="1380" cy="675" r="4" />
        <circle cx="1516" cy="488" r="4" /><circle cx="1526" cy="126" r="3" /><circle cx="1479" cy="184" r="3" />
        <circle cx="1570" cy="195" r="3" /><circle cx="1530" cy="281" r="3" /><circle cx="1550" cy="370" r="3" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.login-backdrop { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.technical-grid { position: absolute; inset: 0; background-image: linear-gradient(#b6d3fa26 1px, transparent 1px), linear-gradient(90deg, #b6d3fa26 1px, transparent 1px); background-size: 72px 72px; mask-image: linear-gradient(90deg, #000, transparent 38%, transparent 62%, #000); }
.biometric-network { width: 100%; height: 100%; color: #7eaff5; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.network-rings { opacity: .25; }
.network-traces { opacity: .45; }
.fingerprint-ridges { opacity: .42; stroke-width: 4; transform: translate(42px, 40px); }
.face-mesh { opacity: .38; }
.scan-brackets { stroke-width: 3; }
.network-nodes { fill: #f5f9ff; stroke: #8bb7fa; opacity: .65; }
.network-nodes use { fill: none; stroke-width: 1.6; }
.trace-points { fill: #91bafb; stroke: none; opacity: .65; }
@media (max-width: 1100px) { .biometric-network { opacity: .55; } }
@media (max-width: 600px) { .biometric-network { display: none; } .technical-grid { opacity: .35; } }
</style>

<template>
  <section class="magneto-local">
    <LocalMagnetometerChart />
  </section>
</template>

<script setup>
import LocalMagnetometerChart from '@/components/LocalMagnetometerChart.vue'
</script>

<style scoped>
.magneto-local {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
</style>

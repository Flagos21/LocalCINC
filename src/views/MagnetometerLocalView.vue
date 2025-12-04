<template>
  <section class="magneto-local">
    <div class="magneto-local__card">
      <LocalMagnetometerChart />
    </div>
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
  width: min(100%, 72rem);
  margin: 0 auto;
}

.magneto-local__card {
  background: #ffffff;
  border-radius: 0.85rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
  padding: 1rem;
}
</style>

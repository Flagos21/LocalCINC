<template>
  <section class="electric-field">
    <ElectricFieldChart />
  </section>
</template>

<script setup>
import ElectricFieldChart from '@/components/ElectricFieldChart.vue'
</script>

<style scoped>
.electric-field {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
</style>

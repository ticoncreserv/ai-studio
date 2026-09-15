<script setup lang="ts">
defineProps<{ customers: Array<{ id: number; name: string; city: string }> }>()
</script>

<template>
  <div class="page">
    <h1>Customers</h1>
    <ul>
      <li v-for="customer in customers" :key="customer.id">{{ customer.name }} — {{ customer.city }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
defineProps<{ plant: string }>()
</script>

<template>
  <div class="page">
    <p class="kicker">Concreserv homologation</p>
    <h1>Ready-mix portal</h1>
    <p>Preview of quotes, customers, and deliveries for plant {{ plant }}.</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ quotes: Array<{ id: number; customer: string; total: string; status: string }> }>()
</script>

<template>
  <div class="page">
    <h1>Quotes</h1>
    <table>
      <thead>
        <tr><th>Customer</th><th>Total</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr v-for="quote in quotes" :key="quote.id">
          <td>{{ quote.customer }}</td>
          <td>{{ quote.total }}</td>
          <td>{{ quote.status }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

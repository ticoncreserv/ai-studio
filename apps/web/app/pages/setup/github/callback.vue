<script setup lang="ts">
const route = useRoute();
const error = ref("");

onMounted(async () => {
  const code = String(route.query.code ?? "").trim();
  if (!code) {
    await navigateTo("/setup/github?error=code");
    return;
  }
  try {
    await $fetch("/api/setup/github/convert", { method: "POST", body: { code } });
    await navigateTo("/setup/github?created=1");
  } catch {
    error.value = "convert";
    await navigateTo("/setup/github?error=convert");
  }
});
</script>

<template>
  <main class="mesh flex min-h-screen items-center justify-center px-6">
    <p class="text-sm text-ink-500">{{ error ? error : "…" }}</p>
  </main>
</template>

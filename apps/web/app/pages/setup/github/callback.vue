<script setup lang="ts">
const route = useRoute();
const error = ref("");

onMounted(async () => {
  const code = String(route.query.code ?? "").trim();
  try {
    if (code) {
      const res = await $fetch<{ reused?: boolean }>("/api/setup/github/convert", { method: "POST", body: { code } });
      await navigateTo(res.reused ? "/setup/github?created=1&reused=1" : "/setup/github?created=1");
      return;
    }
    const setup = await $fetch<{ configured: boolean }>("/api/setup/github");
    await navigateTo(setup.configured ? "/setup/github?created=1" : "/setup/github?error=code");
  } catch {
    const setup = await $fetch<{ configured: boolean }>("/api/setup/github").catch(() => ({ configured: false }));
    if (setup.configured) {
      await navigateTo("/setup/github?created=1&reused=1");
      return;
    }
    error.value = "convert";
    await navigateTo("/setup/github?error=convert");
  }
});
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-canvas px-6">
    <p class="text-[12px] text-ink-500">{{ error ? error : "…" }}</p>
  </main>
</template>

export function useSignOut() {
  const leaving = ref(false);

  async function signOut() {
    leaving.value = true;
    try {
      await $fetch("/api/auth/logout", { method: "POST" });
    } finally {
      if (import.meta.client) {
        window.location.assign("/");
      } else {
        await navigateTo("/");
      }
    }
  }

  return { leaving, signOut };
}


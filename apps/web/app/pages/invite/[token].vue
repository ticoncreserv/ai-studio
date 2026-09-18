<script setup lang="ts">
import { fetchStatusCode, fetchStatusMessage } from "~/utils/studio-link";

const { t } = useI18n();
const route = useRoute();
const signingIn = ref(false);
const accepting = ref(false);
const ready = ref(false);
const signedIn = ref(false);
const pendingAccess = ref(false);
const preview = ref<{
  valid: boolean;
  expired: boolean;
  accepted: boolean;
  ownerLogin: string;
  role: string;
  workspaceId: string | null;
} | null>(null);
const result = ref<{ pending?: boolean; workspaceId?: string } | null>(null);
const error = ref("");

function roleLabel(role: string) {
  if (role === "spectator") return t("invite.roleSpectator");
  return t("invite.roleEditor");
}

function inviteErrorMessage(err: unknown) {
  const code = fetchStatusCode(err);
  const status = fetchStatusMessage(err);
  if (code === 404 || status === "invite not found") return t("invite.invalid");
  if (code === 410 || status === "invite expired") return t("invite.expired");
  if (code === 409 || status === "invite used") return t("invite.used");
  if (status === "own workspace") return t("invite.own");
  if (code === 401) return t("invite.signIn");
  return t("errors.generic");
}

onMounted(async () => {
  try {
    const me = await $fetch<{ user?: { accessPending?: boolean } }>("/api/me");
    signedIn.value = Boolean(me?.user);
    pendingAccess.value = Boolean(me?.user?.accessPending);
  } catch {
    signedIn.value = false;
  }
  try {
    preview.value = await $fetch(`/api/invite/${route.params.token}`);
  } catch (err) {
    error.value = inviteErrorMessage(err);
  } finally {
    ready.value = true;
  }
});

function onGithub(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  signingIn.value = true;
  const next = `/invite/${String(route.params.token)}`;
  window.location.assign(`/api/auth/github?redirect=${encodeURIComponent(next)}`);
}

async function accept() {
  accepting.value = true;
  error.value = "";
  try {
    const accepted = await $fetch<{ pending?: boolean; workspaceId?: string }>(`/api/invite/${route.params.token}`, {
      method: "POST",
    });
    result.value = accepted;
    if (accepted.pending) {
      pendingAccess.value = true;
      return;
    }
    if (accepted.workspaceId) {
      await navigateTo(`/w/${accepted.workspaceId}`);
      return;
    }
    await navigateTo("/");
  } catch (err) {
    error.value = inviteErrorMessage(err);
  } finally {
    accepting.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-screen flex-col bg-canvas">
    <header class="login-topbar">
      <span class="app-brand">
        <UiLogo :size="22" />
        <span class="app-wordmark">{{ t("app.wordmark") }}</span>
      </span>
      <AuthLoginLocale />
    </header>
    <div class="flex flex-1 items-center justify-center px-4 pb-16">
      <div class="cx-panel w-full max-w-[400px] p-5">
        <UiLogo :size="22" />
        <h1 class="mt-4 text-[15px] font-semibold text-ink-950">{{ t("invite.landingTitle") }}</h1>
        <p v-if="preview?.ownerLogin" class="mt-1 text-[12px] leading-relaxed text-ink-500">
          {{ t("invite.createdRole", { owner: preview.ownerLogin, role: roleLabel(preview.role) }) }}
        </p>
        <p v-else class="mt-1 text-[12px] leading-relaxed text-ink-500">{{ t("invite.created", { owner: "…" }) }}</p>
        <p class="mt-1 text-[11px] text-ink-400">{{ t("invite.expires") }}</p>
        <p v-if="!ready" class="mt-4 text-[12px] text-ink-400">{{ t("nav.working") }}</p>
        <template v-else-if="preview && !preview.valid">
          <p class="mt-4 text-[12.5px] text-amber-200/90">
            {{ preview.accepted ? t("invite.used") : t("invite.expired") }}
          </p>
        </template>
        <template v-else-if="!signedIn">
          <a
            class="mt-4 block"
            :href="`/api/auth/github?redirect=${encodeURIComponent(`/invite/${String(route.params.token)}`)}`"
            :aria-busy="signingIn || undefined"
            @click="onGithub"
          >
            <UiButton class="w-full" type="button" :loading="signingIn">{{ t("invite.signIn") }}</UiButton>
          </a>
        </template>
        <template v-else-if="pendingAccess || result?.pending">
          <p class="mt-4 text-[12px] text-amber-200/90">{{ t("invite.pending") }}</p>
          <a
            class="mt-3 block text-[12px] text-coral-400 hover:text-coral-300"
            href="https://github.com/ticoncreserv/app/settings/access"
            target="_blank"
            rel="noreferrer"
          >
            {{ t("invite.githubAccess") }}
          </a>
          <a class="mt-2 block text-[12px] text-coral-400 hover:text-coral-300" href="/api/auth/github">
            {{ t("invite.revalidate") }}
          </a>
        </template>
        <template v-else-if="preview?.valid">
          <UiButton class="mt-4 w-full" :loading="accepting" @click="accept">{{ t("invite.accept") }}</UiButton>
        </template>
        <p v-if="error" class="mt-3 text-[12px] text-red-400">{{ error }}</p>
      </div>
    </div>
  </main>
</template>

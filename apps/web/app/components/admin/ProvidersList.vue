<script setup lang="ts">
import { ChevronDown, ChevronUp, LogIn, LogOut, Plus, RotateCcw, Trash2, X } from "@lucide/vue";

type ProviderKeyRow = {
  ref: string;
  label: string;
  enabled: boolean;
  present: boolean;
  usable: boolean;
  failures: number;
  cooldownUntil: string | null;
  lastError: string | null;
  lastFailureKind: string | null;
  lastUsedAt: string | null;
};

type ProviderModelRow = { id: string; label: string; description?: string };

type ProviderCliAccountRow = {
  id: string;
  label: string;
  enabled: boolean;
  loggedIn: boolean;
  account: string | null;
  usable: boolean;
  failures: number;
  cooldownUntil: string | null;
  lastError: string | null;
  lastFailureKind: string | null;
  lastUsedAt: string | null;
};

type ProviderRow = {
  id: string;
  label: string;
  enabled: boolean;
  implemented: boolean;
  hasKey: boolean;
  health?: string;
  sandbox?: string;
  message?: string;
  model?: string;
  models?: ProviderModelRow[];
  keys?: ProviderKeyRow[];
  cliAccounts?: ProviderCliAccountRow[];
  cliLogin?: { accountId: string; loginUrl?: string; startedAt: number } | null;
};

const props = defineProps<{
  providers: ProviderRow[];
  keys: Record<string, string>;
  labels: Record<string, string>;
  models: Record<string, string>;
  busy: boolean;
}>();

const emit = defineEmits<{
  "update:keys": [value: Record<string, string>];
  "update:labels": [value: Record<string, string>];
  "update:models": [value: Record<string, string>];
  toggle: [id: string, enabled: boolean];
  save: [id: string];
  model: [id: string, model: string];
  key: [payload: { id: string; keyRef: string; keyEnabled?: boolean; moveKey?: "up" | "down"; resetKey?: boolean; deleteKey?: boolean }];
  cli: [payload: { id: string; addCliAccount?: boolean; cliLabel?: string; cliAccountId?: string; moveCli?: "up" | "down"; resetCli?: boolean; deleteCli?: boolean; cliEnabled?: boolean }];
  login: [id: string];
  logout: [id: string];
}>();

const { t } = useI18n();
const drafts = reactive<Record<string, string>>({});
const labelDrafts = reactive<Record<string, string>>({});
const modelDrafts = reactive<Record<string, string>>({});
const addOpen = reactive<Record<string, boolean>>({});

const keyed = computed(() => props.providers.filter((provider) => provider.implemented));
const cursor = computed(() => props.providers.find((provider) => provider.id === "cursor"));

watch(
  () => props.keys,
  (next) => {
    for (const [id, value] of Object.entries(next)) {
      if (!value) delete drafts[id];
    }
  },
  { deep: true },
);

watch(
  () => props.models,
  (next) => {
    for (const [id, value] of Object.entries(next)) modelDrafts[id] = value;
  },
  { deep: true, immediate: true },
);

watch(
  () => props.providers,
  (next) => {
    for (const provider of next) {
      if (modelDrafts[provider.id] == null) modelDrafts[provider.id] = provider.model ?? "";
    }
  },
  { deep: true, immediate: true },
);

function keyValue(id: string) {
  return drafts[id] ?? props.keys[id] ?? "";
}

function setKey(id: string, value: string) {
  drafts[id] = value;
  emit("update:keys", { ...props.keys, [id]: value });
}

function labelValue(id: string) {
  return labelDrafts[id] ?? props.labels[id] ?? "";
}

function setLabel(id: string, value: string) {
  labelDrafts[id] = value;
  emit("update:labels", { ...props.labels, [id]: value });
}

function modelValue(id: string) {
  return modelDrafts[id] ?? props.models[id] ?? "";
}

function setModel(id: string, value: string) {
  modelDrafts[id] = value;
  emit("update:models", { ...props.models, [id]: value });
}

function pickModel(id: string, value: string) {
  setModel(id, value);
  emit("model", id, value);
}

function canSave(id: string) {
  return Boolean(keyValue(id).trim()) && !props.busy;
}

function toggleAddKey(id: string) {
  addOpen[id] = !addOpen[id];
}

function saveKey(id: string) {
  emit("save", id);
  addOpen[id] = false;
}

function keyStatus(key: ProviderKeyRow) {
  if (!key.present) return t("admin.noKey");
  if (!key.enabled) return t("admin.providerKeyDisabled");
  if (!key.usable && key.failures >= 5) return t("admin.providerKeyExhausted");
  if (!key.usable) return t("admin.providerKeyCooldown");
  return t("admin.hasKey");
}

function providerDetail(provider: ProviderRow) {
  if (provider.health === "disabled" || !provider.message) return "";
  if (provider.health === "unconfigured") {
    return provider.id === "cursor" ? t("admin.providerMessage.unconfiguredCursor") : t("admin.providerMessage.unconfigured");
  }
  if (provider.health === "unavailable") return t("admin.providerMessage.binaryMissing");
  if (/cooling down|exhausted/i.test(provider.message)) {
    return provider.id === "cursor" ? t("admin.providerMessage.cursorCooldown") : t("admin.providerMessage.keysCooldown");
  }
  if (/sandbox is required/i.test(provider.message)) return t("admin.providerMessage.sandboxRequired");
  return provider.message;
}

function keyErrorText(key: ProviderKeyRow) {
  if (!key.lastError) return "";
  if (key.lastFailureKind === "auth") return t("admin.providerFailure.auth");
  if (key.lastFailureKind === "quota") return t("admin.providerFailure.quota");
  if (key.lastFailureKind === "rate_limit") return t("admin.providerFailure.rateLimit");
  return key.lastError;
}

function cliStatus(account: ProviderCliAccountRow) {
  if (!account.enabled) return t("admin.providerKeyDisabled");
  if (!account.usable && account.failures >= 5) return t("admin.providerKeyExhausted");
  if (!account.usable && account.loggedIn) return t("admin.providerKeyCooldown");
  if (account.loggedIn && account.account) return t("admin.cursorCli.signedInAs", { account: account.account });
  if (account.loggedIn) return t("admin.cursorCli.ready");
  return t("admin.cursorCli.notSignedIn");
}

function credentialLabel(provider: ProviderRow) {
  if (provider.id === "cursor" && (provider.cliAccounts ?? []).some((account) => account.loggedIn)) {
    return t("admin.cursorCli.ready");
  }
  return provider.hasKey ? t("admin.hasKey") : t("admin.noKey");
}

function addCli() {
  emit("cli", { id: "cursor", addCliAccount: true, cliLabel: labelValue("cursor").trim() || undefined });
  labelDrafts.cursor = "";
}
</script>

<template>
  <div>
    <section class="cx-section">
      <p class="cx-section-label">{{ t("admin.providersSection") }}</p>
      <p class="cx-section-note">{{ t("admin.providersHint") }}</p>
      <div class="cx-panel">
        <div v-for="provider in providers" :key="provider.id" class="cx-row cx-row-wrap cx-row-top">
          <div class="min-w-0 flex-1" :class="provider.implemented ? '' : 'opacity-70'">
            <div class="flex flex-wrap items-center gap-1.5">
              <p class="cx-row-title">{{ provider.label }}</p>
              <UiBadge v-if="!provider.implemented">{{ t("admin.comingSoon") }}</UiBadge>
              <UiBadge v-else-if="provider.health">{{ t(`admin.providerHealth.${provider.health}`) }}</UiBadge>
            </div>
            <p class="cx-row-desc">
              <span class="font-mono">{{ provider.id }}</span>
              <span v-if="provider.implemented"> · {{ credentialLabel(provider) }}</span>
              <span v-else> · {{ t("admin.providerSoonHint") }}</span>
            </p>
            <p v-if="providerDetail(provider)" class="cx-row-desc">{{ providerDetail(provider) }}</p>
          </div>
          <UiSwitch
            :model-value="provider.enabled"
            :label="`${provider.label} · ${t('admin.enabled')}`"
            @update:model-value="emit('toggle', provider.id, $event)"
          />
        </div>
      </div>
    </section>

    <section v-if="keyed.length" class="cx-section">
      <p class="cx-section-label">{{ t("admin.providerModel") }}</p>
      <p class="cx-section-note">{{ t("admin.providerModelHint") }}</p>
      <div class="cx-panel">
        <div v-for="provider in keyed" :key="provider.id" class="cx-row cx-row-wrap">
          <div class="min-w-0">
            <p class="cx-row-title">{{ provider.label }}</p>
            <p class="cx-row-desc">{{ t("admin.providerModelDefault") }}</p>
          </div>
          <UiSelect
            :model-value="modelValue(provider.id)"
            :options="provider.models ?? []"
            :placeholder="t('admin.providerModelPlaceholder')"
            :aria-label="`${provider.label} · ${t('admin.providerModel')}`"
            :disabled="busy"
            @update:model-value="pickModel(provider.id, $event)"
          />
        </div>
      </div>
    </section>

    <section v-if="cursor?.implemented" class="cx-section">
      <p class="cx-section-label">{{ t("admin.cursorCli.title") }}</p>
      <p class="cx-section-note">{{ t("admin.cursorCli.hint") }}</p>
      <div class="cx-panel">
        <div class="cx-row">
          <div class="min-w-0">
            <p class="cx-row-title">{{ cursor.label }}</p>
            <p class="cx-row-desc">{{ t("admin.cursorCli.keysFallback") }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <input
              :value="labelValue('cursor')"
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="cx-field w-[140px]"
              :placeholder="t('admin.cursorCli.labelPlaceholder')"
              :aria-label="`${cursor.label} · ${t('admin.cursorCli.add')}`"
              @input="setLabel('cursor', ($event.target as HTMLInputElement).value)"
            />
            <UiButton size="sm" variant="outline" class="shrink-0" :disabled="busy" @click="addCli">
              <Plus class="h-3.5 w-3.5" />
              {{ t("admin.cursorCli.add") }}
            </UiButton>
          </div>
        </div>
        <div v-for="(account, index) in cursor.cliAccounts ?? []" :key="account.id" class="cx-row cx-row-wrap">
          <div class="min-w-0">
            <p class="cx-row-title">{{ account.label || account.id }}</p>
            <p class="cx-row-desc">{{ cliStatus(account) }}</p>
            <p v-if="cursor.cliLogin?.accountId === account.id" class="cx-row-desc">{{ t("admin.cursorCli.signingIn") }}</p>
            <a
              v-if="cursor.cliLogin?.accountId === account.id && cursor.cliLogin.loginUrl"
              class="cx-link mt-1 inline-block text-[12px]"
              :href="cursor.cliLogin.loginUrl"
              target="_blank"
              rel="noreferrer"
            >
              {{ t("admin.cursorCli.loginUrl") }}
            </a>
          </div>
          <div class="cx-row-actions flex shrink-0 items-center gap-1">
            <UiSwitch
              :model-value="account.enabled"
              :label="`${account.id} · ${t('admin.enabled')}`"
              @update:model-value="emit('cli', { id: 'cursor', cliAccountId: account.id, cliEnabled: $event })"
            />
            <UiIconButton
              size="sm"
              :label="t('admin.moveKeyUp')"
              :disabled="busy || index === 0"
              @click="emit('cli', { id: 'cursor', cliAccountId: account.id, moveCli: 'up' })"
            >
              <ChevronUp class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton
              size="sm"
              :label="t('admin.moveKeyDown')"
              :disabled="busy || index === (cursor.cliAccounts?.length ?? 0) - 1"
              @click="emit('cli', { id: 'cursor', cliAccountId: account.id, moveCli: 'down' })"
            >
              <ChevronDown class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiButton
              v-if="!account.loggedIn"
              size="sm"
              variant="outline"
              :disabled="busy"
              @click="emit('login', account.id)"
            >
              <LogIn class="h-3.5 w-3.5" />
              {{ t("admin.cursorCli.signIn") }}
            </UiButton>
            <UiButton
              v-else
              size="sm"
              variant="outline"
              :disabled="busy"
              @click="emit('logout', account.id)"
            >
              <LogOut class="h-3.5 w-3.5" />
              {{ t("admin.cursorCli.signOut") }}
            </UiButton>
            <UiIconButton
              size="sm"
              :label="t('admin.resetKey')"
              :disabled="busy || (!account.failures && !account.cooldownUntil)"
              @click="emit('cli', { id: 'cursor', cliAccountId: account.id, resetCli: true })"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton
              size="sm"
              :label="t('admin.cursorCli.delete')"
              :disabled="busy"
              @click="emit('cli', { id: 'cursor', cliAccountId: account.id, deleteCli: true })"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </UiIconButton>
          </div>
        </div>
      </div>
    </section>

    <section v-if="keyed.length" class="cx-section">
      <p class="cx-section-label">{{ t("admin.providerKeys") }}</p>
      <p class="cx-section-note">{{ t("admin.providerKeysHint") }}</p>
      <div v-for="provider in keyed" :key="provider.id" class="cx-panel mb-3 last:mb-0">
        <div class="cx-row">
          <div class="min-w-0">
            <p class="cx-row-title">{{ provider.label }}</p>
            <p class="cx-row-desc">
              {{
                t("admin.providerKeysReady", {
                  ready: (provider.keys ?? []).filter((key) => key.usable && key.present).length,
                  total: (provider.keys ?? []).length,
                })
              }}
            </p>
          </div>
          <UiButton
            size="sm"
            variant="outline"
            class="shrink-0"
            :aria-expanded="Boolean(addOpen[provider.id])"
            @click="toggleAddKey(provider.id)"
          >
            <X v-if="addOpen[provider.id]" class="h-3.5 w-3.5" />
            <Plus v-else class="h-3.5 w-3.5" />
            {{ addOpen[provider.id] ? t("admin.cancelAddKey") : t("admin.addKey") }}
          </UiButton>
        </div>
        <div v-for="(key, index) in provider.keys ?? []" :key="key.ref" class="cx-row cx-row-wrap">
          <div class="min-w-0">
            <p class="cx-row-title">{{ key.label || key.ref }}</p>
            <p class="cx-row-desc">
              <span class="font-mono">{{ key.ref }}</span>
              · {{ keyStatus(key) }}
            </p>
            <p v-if="keyErrorText(key)" class="cx-row-desc">{{ keyErrorText(key) }}</p>
          </div>
          <div class="cx-row-actions flex shrink-0 items-center gap-1">
            <UiSwitch
              :model-value="key.enabled"
              :label="`${key.ref} · ${t('admin.enabled')}`"
              @update:model-value="emit('key', { id: provider.id, keyRef: key.ref, keyEnabled: $event })"
            />
            <UiIconButton
              size="sm"
              :label="t('admin.moveKeyUp')"
              :disabled="busy || index === 0"
              @click="emit('key', { id: provider.id, keyRef: key.ref, moveKey: 'up' })"
            >
              <ChevronUp class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton
              size="sm"
              :label="t('admin.moveKeyDown')"
              :disabled="busy || index === (provider.keys?.length ?? 0) - 1"
              @click="emit('key', { id: provider.id, keyRef: key.ref, moveKey: 'down' })"
            >
              <ChevronDown class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton
              size="sm"
              :label="t('admin.resetKey')"
              :disabled="busy || (!key.failures && !key.cooldownUntil)"
              @click="emit('key', { id: provider.id, keyRef: key.ref, resetKey: true })"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </UiIconButton>
            <UiIconButton
              size="sm"
              :label="t('admin.deleteProviderKey')"
              :disabled="busy"
              @click="emit('key', { id: provider.id, keyRef: key.ref, deleteKey: true })"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </UiIconButton>
          </div>
        </div>
        <div v-if="addOpen[provider.id]" class="cx-row cx-row-wrap">
          <div class="min-w-0">
            <p class="cx-row-title">{{ t("admin.addKey") }}</p>
            <p class="cx-row-desc">{{ t("admin.apiKeyPlaceholder") }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <input
              :value="labelValue(provider.id)"
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="cx-field w-[120px]"
              :placeholder="t('admin.providerKeyLabelPlaceholder')"
              :aria-label="`${provider.label} · ${t('admin.providerKeyLabel')}`"
              @input="setLabel(provider.id, ($event.target as HTMLInputElement).value)"
            />
            <input
              :value="keyValue(provider.id)"
              type="password"
              autocomplete="off"
              spellcheck="false"
              class="cx-field w-[170px]"
              :placeholder="t('admin.apiKeyPlaceholder')"
              :aria-label="`${provider.label} · ${t('admin.apiKey')}`"
              @input="setKey(provider.id, ($event.target as HTMLInputElement).value)"
            />
            <UiButton size="sm" variant="outline" :disabled="!canSave(provider.id)" @click="saveKey(provider.id)">
              {{ t("admin.saveProvider") }}
            </UiButton>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

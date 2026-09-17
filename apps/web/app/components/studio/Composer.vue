<script setup lang="ts">
import type { AgentMode, ProviderCapability } from "@atelier/contracts";
import {
  ArrowUp,
  ChevronRight,
  Cpu,
  ListTodo,
  MessageCircle,
  Mic,
  Paperclip,
  Plug,
  Plus,
  Sparkles,
  Wrench,
  X,
} from "@lucide/vue";
import type { StudioAttachment, StudioMcpServer, StudioSkill } from "~/types/studio";
import type { QueuedPrompt } from "~/utils/chat-events";
import { MCP_SERVER_WARN_THRESHOLD } from "~/utils/slash";
import type { SlashRow } from "~/utils/slash";

const props = defineProps<{
  modelValue: string;
  mode: AgentMode;
  recipeId: string;
  recipes: Array<{ id: string; title: string }>;
  recipesEnabled: boolean;
  spectator: boolean;
  spectatorEnabled: boolean;
  sending: boolean;
  provider: string;
  providers?: ProviderCapability[];
  placeholder: string;
  attachments: StudioAttachment[];
  mentionsOpen: boolean;
  mentionHits: Array<{ item: string; kind: string }>;
  slashOpen?: boolean;
  slashHits?: SlashRow[];
  skillChip?: string | null;
  skills?: StudioSkill[];
  mcpServers?: StudioMcpServer[];
  skillsEnabled?: boolean;
  mcpEnabled?: boolean;
  canEdit?: boolean;
  queue?: QueuedPrompt[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:mode": [value: AgentMode];
  "update:recipeId": [value: string];
  submit: [];
  cancel: [];
  mention: [name: string];
  skill: [name: string];
  "clear-skill": [];
  "close-slash": [];
  "toggle-skill": [payload: { name: string; enabled: boolean }];
  "toggle-mcp": [payload: { name: string; enabled: boolean }];
  "manage-skills": [];
  "manage-mcp": [];
  attach: [files: FileList];
  "remove-attachment": [path: string];
  "toggle-spectator": [];
  "drop-queue": [];
  "update:provider": [value: string];
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);
const field = ref<HTMLTextAreaElement | null>(null);
const paletteOpen = ref(false);
const paletteQuery = ref("");
const paletteFilter = ref<HTMLInputElement | null>(null);
const recipesOpen = ref(false);
const providersOpen = ref(false);
const skillsOpen = ref(false);
const toolsOpen = ref(false);
const slashCursor = ref(0);
const cursor = ref(0);
const listening = ref(false);
const dictationSupported = ref(false);
const queued = computed(() => props.queue ?? []);
const slashHits = computed(() => props.slashHits ?? []);
const skills = computed(() => props.skills ?? []);
const mcpServers = computed(() => props.mcpServers ?? []);
const enabledMcpCount = computed(() => mcpServers.value.filter((server) => server.enabled && !server.shadowed).length);
const canSend = computed(() => Boolean(props.modelValue.trim() || props.recipeId || props.attachments.length));
const showStop = computed(() => props.sending && !canSend.value);

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

let recognition: Recognition | null = null;

const modes = computed(() => [
  { id: "agent" as AgentMode, icon: Wrench, tint: "text-coral-400", label: t("chat.modeAgent"), desc: t("chat.modeHintAgent") },
  { id: "plan" as AgentMode, icon: ListTodo, tint: "text-amber-300/80", label: t("chat.modePlan"), desc: t("chat.modeHintPlan") },
  { id: "ask" as AgentMode, icon: MessageCircle, tint: "text-emerald-300/80", label: t("chat.modeAsk"), desc: t("chat.modeHintAsk") },
]);

const catalog = computed(() => props.providers ?? []);

const providerLabel = computed(() => {
  if (props.provider === "cursor") return t("chat.usingCursor");
  if (props.provider === "claude") return t("chat.usingClaude");
  if (props.provider === "gemini") return t("chat.usingGemini");
  if (props.provider === "grok") return t("chat.usingGrok");
  if (props.provider === "mock") return t("chat.usingMock");
  return catalog.value.find((row) => row.id === props.provider)?.label ?? props.provider;
});

const activeRecipe = computed(() => props.recipes.find((recipe) => recipe.id === props.recipeId));

const visibleModes = computed(() => {
  const selected = catalog.value.find((row) => row.id === props.provider);
  const allowed = selected?.modes ?? (["agent", "plan", "ask"] as AgentMode[]);
  const available = modes.value.filter((item) => allowed.includes(item.id));
  const needle = paletteQuery.value.trim().toLowerCase();
  if (!needle) return available;
  return available.filter((item) => `${item.label} ${item.desc}`.toLowerCase().includes(needle));
});

function resize() {
  const el = field.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
}

watch(() => props.modelValue, () => nextTick(resize));
onMounted(() => {
  resize();
  const ctor = (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown });
  dictationSupported.value = Boolean(ctor.SpeechRecognition || ctor.webkitSpeechRecognition);
});

watch(() => slashHits.value.length, () => (slashCursor.value = 0));

watch(
  () => [props.provider, props.mode] as const,
  () => {
    const selected = catalog.value.find((row) => row.id === props.provider);
    if (selected && !selected.modes.includes(props.mode)) emit("update:mode", "agent");
  },
);

function pickProvider(id: string) {
  emit("update:provider", id);
  providersOpen.value = false;
  closePalette();
}

async function togglePalette() {
  paletteOpen.value = !paletteOpen.value;
  if (!paletteOpen.value) return;
  paletteQuery.value = "";
  recipesOpen.value = false;
  providersOpen.value = false;
  skillsOpen.value = false;
  toolsOpen.value = false;
  cursor.value = 0;
  await nextTick();
  paletteFilter.value?.focus();
}

function closePalette() {
  paletteOpen.value = false;
  field.value?.focus();
}

function pickMode(value: AgentMode) {
  emit("update:mode", value);
  closePalette();
}

function pickRecipe(id: string) {
  emit("update:recipeId", id);
  closePalette();
}

function pickSkill(name: string) {
  emit("skill", name);
  closePalette();
}

function sourceLabel(source: string) {
  if (source === "repo") return t("skills.source.repo");
  if (source === "platform") return t("skills.source.platform");
  if (source === "user") return t("skills.source.user");
  return t("skills.source.agent");
}

function moveSlash(delta: number) {
  const total = slashHits.value.length;
  if (!total) return;
  slashCursor.value = (slashCursor.value + delta + total) % total;
}

function pickHighlightedSlash() {
  const target = slashHits.value[slashCursor.value];
  if (target) emit("skill", target.name);
}

function onComposerKey(event: KeyboardEvent) {
  if (props.slashOpen) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSlash(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSlash(-1);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (slashHits.value.length) pickHighlightedSlash();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      emit("close-slash");
      return;
    }
  }
  if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    emit("submit");
  }
}

function movePalette(delta: number) {
  const total = visibleModes.value.length;
  if (!total) return;
  cursor.value = (cursor.value + delta + total) % total;
}

function runHighlighted() {
  const target = visibleModes.value[cursor.value];
  if (target) pickMode(target.id);
}

function onPaste(event: ClipboardEvent) {
  const files = event.clipboardData?.files;
  if (files?.length) {
    event.preventDefault();
    emit("attach", files);
  }
}

function toggleDictation() {
  if (listening.value) {
    recognition?.stop();
    return;
  }
  const global = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = global.SpeechRecognition ?? global.webkitSpeechRecognition;
  if (!Ctor) return;
  recognition = new Ctor();
  recognition.lang = document.documentElement.lang || "en";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const transcript = [...Array.from({ length: event.results.length }, (_, i) => event.results[i]![0]!.transcript)].join(" ").trim();
    if (transcript) emit("update:modelValue", props.modelValue ? `${props.modelValue} ${transcript}` : transcript);
  };
  recognition.onend = () => (listening.value = false);
  recognition.onerror = () => (listening.value = false);
  listening.value = true;
  recognition.start();
}

onBeforeUnmount(() => recognition?.stop());
</script>

<template>
  <form class="relative shrink-0 px-2.5 pb-2.5" @submit.prevent="emit('submit')">
    <div v-if="mentionsOpen && !slashOpen" class="cx-menu absolute inset-x-2.5 bottom-full z-20 mb-1 p-1 shadow-float">
      <p v-if="!mentionHits.length" class="cx-menu-row cx-muted">{{ t("chat.noMentions") }}</p>
      <button
        v-for="hit in mentionHits"
        :key="hit.kind + hit.item"
        type="button"
        class="cx-menu-row"
        @click="emit('mention', hit.item)"
      >
        <span class="min-w-0 flex-1 truncate font-mono text-ink-800">{{ hit.item }}</span>
        <span class="cx-menu-desc shrink-0">{{ hit.kind }}</span>
      </button>
    </div>

    <div v-if="slashOpen" class="cx-menu absolute inset-x-2.5 bottom-full z-20 mb-1 p-1 shadow-float">
      <p class="px-2 py-1 text-[11px] text-ink-400">{{ t("chat.slashHint") }}</p>
      <p v-if="!slashHits.length" class="cx-menu-row cx-muted">{{ t("chat.slashEmpty") }}</p>
      <button
        v-for="(hit, index) in slashHits"
        :key="hit.source + hit.name"
        type="button"
        class="cx-menu-row"
        :data-active="index === slashCursor || undefined"
        @mouseenter="slashCursor = index"
        @click="emit('skill', hit.name)"
      >
        <span class="min-w-0 flex-1 truncate font-mono text-ink-800">/{{ hit.name }}</span>
        <span class="cx-menu-desc min-w-0 truncate">{{ hit.description }}</span>
        <span class="cx-menu-desc shrink-0">{{ sourceLabel(hit.source) }}</span>
      </button>
    </div>

    <div v-if="paletteOpen" class="cx-menu mb-1.5 p-1">
      <div class="px-2 py-1">
        <input
          ref="paletteFilter"
          v-model="paletteQuery"
          class="h-6 w-full bg-transparent text-[12.5px] text-ink-950 outline-none placeholder:text-ink-400"
          :placeholder="t('chat.paletteSearch')"
          @keydown.down.prevent="movePalette(1)"
          @keydown.up.prevent="movePalette(-1)"
          @keydown.enter.prevent="runHighlighted"
          @keydown.esc.prevent="closePalette"
        />
      </div>
      <button
        v-for="(item, index) in visibleModes"
        :key="item.id"
        type="button"
        class="cx-menu-row"
        :data-active="index === cursor || item.id === mode || undefined"
        @mouseenter="cursor = index"
        @click="pickMode(item.id)"
      >
        <component :is="item.icon" class="h-3.5 w-3.5 shrink-0" :class="item.tint" />
        <span class="cx-menu-name shrink-0">{{ item.label }}</span>
        <span class="cx-menu-desc">{{ item.desc }}</span>
      </button>
      <div class="cx-divider mx-2 my-1" />
      <button type="button" class="cx-menu-row" @click="fileInput?.click()">
        <Paperclip class="h-3.5 w-3.5 shrink-0" />
        <span class="cx-menu-name">{{ t("chat.attach") }}</span>
      </button>
      <template v-if="catalog.length > 1">
        <button
          type="button"
          class="cx-menu-row"
          :data-active="providersOpen || undefined"
          @click="providersOpen = !providersOpen"
        >
          <Cpu class="h-3.5 w-3.5 shrink-0" />
          <span class="cx-menu-name shrink-0">{{ t("chat.model") }}</span>
          <span class="cx-menu-desc">{{ providerLabel }}</span>
          <ChevronRight class="ml-auto h-3 w-3 shrink-0 text-ink-400 transition-transform" :class="providersOpen && 'rotate-90'" />
        </button>
        <button
          v-for="item in providersOpen ? catalog : []"
          :key="item.id"
          type="button"
          class="cx-menu-row cx-menu-row-sub"
          :data-active="item.id === provider || undefined"
          @click="pickProvider(item.id)"
        >
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
        </button>
      </template>
      <div v-else class="cx-menu-row">
        <Cpu class="h-3.5 w-3.5 shrink-0" />
        <span class="cx-menu-name shrink-0">{{ t("chat.model") }}</span>
        <span class="cx-menu-desc">{{ providerLabel }}</span>
      </div>
      <template v-if="recipesEnabled">
        <button type="button" class="cx-menu-row" :data-active="recipesOpen || undefined" @click="recipesOpen = !recipesOpen">
          <ListTodo class="h-3.5 w-3.5 shrink-0" />
          <span class="cx-menu-name shrink-0">{{ t("chat.recipe") }}</span>
          <span class="cx-menu-desc">{{ activeRecipe?.title ?? "" }}</span>
          <ChevronRight class="ml-auto h-3 w-3 shrink-0 text-ink-400 transition-transform" :class="recipesOpen && 'rotate-90'" />
        </button>
        <template v-if="recipesOpen">
          <button type="button" class="cx-menu-row cx-menu-row-sub" @click="pickRecipe('')">
            <span class="min-w-0 flex-1 truncate">{{ t("chat.recipeNone") }}</span>
          </button>
          <button
            v-for="recipe in recipes"
            :key="recipe.id"
            type="button"
            class="cx-menu-row cx-menu-row-sub"
            :data-active="recipe.id === recipeId || undefined"
            @click="pickRecipe(recipe.id)"
          >
            <span class="min-w-0 flex-1 truncate">{{ recipe.title }}</span>
          </button>
        </template>
      </template>
      <template v-if="skillsEnabled">
        <button type="button" class="cx-menu-row" :data-active="skillsOpen || undefined" @click="skillsOpen = !skillsOpen">
          <Sparkles class="h-3.5 w-3.5 shrink-0" />
          <span class="cx-menu-name shrink-0">{{ t("chat.skills") }}</span>
          <span class="cx-menu-desc">{{ skillChip || "" }}</span>
          <ChevronRight class="ml-auto h-3 w-3 shrink-0 text-ink-400 transition-transform" :class="skillsOpen && 'rotate-90'" />
        </button>
        <template v-if="skillsOpen">
          <div
            v-for="skill in skills.filter((row) => !row.shadowed)"
            :key="skill.source + skill.name"
            class="cx-menu-row cx-menu-row-sub"
          >
            <button type="button" class="min-w-0 flex-1 truncate text-left" @click="pickSkill(skill.name)">
              /{{ skill.name }}
            </button>
            <span class="cx-menu-desc shrink-0">{{ sourceLabel(skill.source) }}</span>
            <UiSwitch
              v-if="canEdit"
              class="ml-1"
              :model-value="skill.enabled"
              :label="skill.name"
              @update:model-value="emit('toggle-skill', { name: skill.name, enabled: $event })"
            />
          </div>
          <button type="button" class="cx-menu-row cx-menu-row-sub" @click="emit('manage-skills'); closePalette()">
            <span class="min-w-0 flex-1 truncate">{{ t("chat.manageSkills") }}</span>
          </button>
        </template>
      </template>
      <template v-if="mcpEnabled">
        <button type="button" class="cx-menu-row" :data-active="toolsOpen || undefined" @click="toolsOpen = !toolsOpen">
          <Plug class="h-3.5 w-3.5 shrink-0" />
          <span class="cx-menu-name shrink-0">{{ t("chat.tools") }}</span>
          <span class="cx-menu-desc">{{ t("mcp.enabledCount", { count: enabledMcpCount }) }}</span>
          <ChevronRight class="ml-auto h-3 w-3 shrink-0 text-ink-400 transition-transform" :class="toolsOpen && 'rotate-90'" />
        </button>
        <template v-if="toolsOpen">
          <p v-if="enabledMcpCount >= MCP_SERVER_WARN_THRESHOLD" class="px-3 py-1 text-[11px] text-amber-200/80">
            {{ t("mcp.tooMany") }}
          </p>
          <div
            v-for="server in mcpServers.filter((row) => !row.shadowed)"
            :key="server.source + server.name"
            class="cx-menu-row cx-menu-row-sub"
          >
            <span
              class="h-1.5 w-1.5 shrink-0 rounded-full"
              :class="server.enabled ? 'bg-emerald-400' : 'bg-ink-300'"
            />
            <span class="min-w-0 flex-1 truncate">{{ server.name }}</span>
            <span class="cx-menu-desc shrink-0">{{ server.transport }}</span>
            <UiSwitch
              v-if="canEdit"
              class="ml-1"
              :model-value="server.enabled"
              :label="server.name"
              @update:model-value="emit('toggle-mcp', { name: server.name, enabled: $event })"
            />
          </div>
          <button type="button" class="cx-menu-row cx-menu-row-sub" @click="emit('manage-mcp'); closePalette()">
            <span class="min-w-0 flex-1 truncate">{{ t("chat.manageMcp") }}</span>
          </button>
        </template>
      </template>
      <div v-if="spectatorEnabled" class="cx-menu-row">
        <span class="cx-menu-name">{{ spectator ? t("workspace.watching") : t("workspace.editor") }}</span>
        <UiSwitch
          class="ml-auto"
          :model-value="!spectator"
          :label="t('workspace.editor')"
          @update:model-value="emit('toggle-spectator')"
        />
      </div>
    </div>

    <div v-if="queued.length" class="cx-queue mb-1.5">
      <span class="cx-working-dots" aria-hidden="true"><i /><i /><i /></span>
      <span class="min-w-0 flex-1 truncate">
        {{ queued.length > 1 ? t("chat.queueCount", { count: queued.length }) : t("chat.queue") }}
        · {{ queued[0]?.text }}
      </span>
      <button type="button" class="text-ink-400 hover:text-ink-950" :aria-label="t('chat.discardQueue')" @click="emit('drop-queue')">
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <div class="cx-composer">
      <div v-if="attachments.length" class="flex flex-wrap gap-1 px-2 pt-2">
        <span v-for="file in attachments" :key="file.path" class="cx-pill max-w-full">
          <span class="min-w-0 truncate">{{ file.name }}</span>
          <button type="button" :aria-label="t('chat.removeAttachment')" class="text-ink-400 hover:text-ink-950" @click="emit('remove-attachment', file.path)">
            <X class="h-3 w-3" />
          </button>
        </span>
      </div>

      <div class="flex items-end gap-2 px-2 py-2">
        <button
          type="button"
          class="cx-round"
          :data-active="paletteOpen || undefined"
          :aria-label="t('chat.palette')"
          :title="t('chat.palette')"
          @click="togglePalette"
        >
          <Plus class="h-3.5 w-3.5" />
        </button>
        <textarea
          id="composer"
          ref="field"
          rows="1"
          :value="modelValue"
          :disabled="spectator"
          :placeholder="placeholder"
          @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value); resize()"
          @keydown="onComposerKey"
          @keydown.meta.enter.prevent="emit('submit')"
          @keydown.ctrl.enter.prevent="emit('submit')"
          @paste="onPaste"
        />
        <UiIconButton v-if="sending && canSend" :label="t('chat.stop')" size="sm" @click="emit('cancel')">
          <X class="h-3.5 w-3.5" />
        </UiIconButton>
        <button
          v-if="dictationSupported && !sending"
          type="button"
          class="cx-round"
          :data-tone="listening ? 'recording' : undefined"
          :aria-label="t('chat.dictate')"
          :title="t('chat.dictate')"
          @click="toggleDictation"
        >
          <Mic class="h-3.5 w-3.5" />
        </button>
        <button
          v-if="showStop"
          type="button"
          class="cx-round"
          data-tone="primary"
          :aria-label="t('chat.stop')"
          :title="t('chat.stop')"
          @click="emit('cancel')"
        >
          <span class="h-[9px] w-[9px] rounded-[1.5px] bg-current" />
        </button>
        <button
          v-else
          type="submit"
          :disabled="spectator || !canSend"
          class="cx-round"
          data-tone="primary"
          :aria-label="sending ? t('chat.queue') : t('chat.send')"
          :title="sending ? t('chat.queue') : t('chat.send')"
        >
          <ArrowUp class="h-3.5 w-3.5" />
        </button>
      </div>

      <div class="flex items-center gap-1.5 border-t border-line px-2 py-1.5">
        <div class="cx-modes">
          <button
            v-for="item in modes"
            :key="item.id"
            type="button"
            :data-active="item.id === mode || undefined"
            :title="item.desc"
            @click="emit('update:mode', item.id)"
          >
            {{ item.label }}
          </button>
        </div>
        <span class="cx-pill min-w-0" :title="t('chat.model')">
          <Cpu class="h-3 w-3 shrink-0" />
          <span class="truncate">{{ providerLabel }}</span>
        </span>
        <span v-if="skillChip" class="cx-pill min-w-0" :title="t('chat.skillChip')">
          <Sparkles class="h-3 w-3 shrink-0" />
          <span class="truncate">/{{ skillChip }}</span>
          <button type="button" :aria-label="t('chat.skillChipClear')" class="text-ink-400 hover:text-ink-950" @click="emit('clear-skill')">
            <X class="h-3 w-3" />
          </button>
        </span>
        <span v-if="activeRecipe" class="cx-pill min-w-0" :title="t('chat.recipe')">
          <span class="truncate">{{ activeRecipe.title }}</span>
          <button type="button" :aria-label="t('chat.recipeNone')" class="text-ink-400 hover:text-ink-950" @click="emit('update:recipeId', '')">
            <X class="h-3 w-3" />
          </button>
        </span>
        <input ref="fileInput" type="file" multiple class="hidden" @change="emit('attach', ($event.target as HTMLInputElement).files!)" />
        <UiIconButton class="ml-auto" :label="t('chat.attach')" size="sm" @click="fileInput?.click()">
          <Paperclip class="h-3.5 w-3.5" />
        </UiIconButton>
      </div>
    </div>
    <p v-if="spectator" class="mt-1 px-1 text-[11px] text-ink-400">{{ t("workspace.spectator") }}</p>
  </form>
</template>

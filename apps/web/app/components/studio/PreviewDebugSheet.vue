<script setup lang="ts">
import { Copy, Search } from "@lucide/vue";
import type { PreviewDebug, PreviewDebugStatement } from "~/types/studio";
import {
  barPercent,
  buildTraceTicks,
  durationShare,
  isShellView,
  sqlVerb,
} from "~/utils/preview-debug-layout";
import { isSlowPreviewRequest, type PreviewDebugAction } from "~/utils/preview-debug-prompt";

const props = defineProps<{
  open: boolean;
  debug?: PreviewDebug | null;
  pending?: boolean;
  lastError?: string;
  hasRuntimeError?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  action: [payload: { action: PreviewDebugAction; sql?: string }];
}>();

const { t } = useI18n();
const queryFilter = ref("");
const sortByDuration = ref(true);
const copiedSql = ref("");
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const hasNumbers = computed(
  () => props.debug?.timeMs != null || props.debug?.queries != null || props.debug?.memoryMb != null,
);

const emptyHint = computed(() => {
  if (props.pending) return t("preview.debugWaiting");
  if (props.debug?.missing) return t("preview.debugMissing");
  return t("preview.debugEmpty");
});

const pathLabel = computed(() => props.debug?.uri || props.debug?.inertiaUrl || "");
const axisMs = computed(
  () =>
    props.debug?.timeMs
    || props.debug?.queryMs
    || (props.debug?.statements ?? []).reduce((sum, row) => sum + (row.durationMs ?? 0), 0)
    || 1,
);

const queryTicks = computed(() =>
  buildTraceTicks(
    (props.debug?.statements ?? []).map((row) => ({
      durationMs: row.durationMs,
      startMs: row.startMs,
      label: row.sql,
    })),
    axisMs.value,
  ),
);

const phpTicks = computed(() =>
  buildTraceTicks(
    (props.debug?.measures ?? []).map((row) => ({
      durationMs: row.durationMs,
      label: row.label,
    })),
    axisMs.value,
  ),
);

const sqlShare = computed(() => durationShare(props.debug?.queryMs, props.debug?.timeMs));

const duplicateKeys = computed(() => {
  const keys = new Set<string>();
  for (const row of props.debug?.duplicates ?? []) keys.add(normalize(row.sql));
  const counts = new Map<string, number>();
  for (const row of props.debug?.statements ?? []) {
    const key = normalize(row.sql);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) if (count >= 3) keys.add(key);
  return keys;
});

const filteredStatements = computed(() => {
  const needle = queryFilter.value.trim().toLowerCase();
  const rows = [...(props.debug?.statements ?? [])].filter((row) =>
    needle ? row.sql.toLowerCase().includes(needle) : true,
  );
  if (sortByDuration.value) {
    rows.sort((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1));
  }
  return rows;
});

const maxQueryMs = computed(() =>
  Math.max(0, ...filteredStatements.value.map((row) => row.durationMs ?? 0)),
);

const appViews = computed(() =>
  (props.debug?.views ?? []).filter((row) => !isShellView(row.name, props.debug?.inertiaComponent)),
);

const showApp = computed(
  () =>
    Boolean(props.debug?.inertiaComponent)
    || Boolean(props.debug?.route)
    || Boolean(props.debug?.laravel)
    || Boolean(props.debug?.models?.length)
    || Boolean(appViews.value.length),
);

const showNPlusOne = computed(() => Boolean(props.debug?.nPlusOne));
const showSlow = computed(() => isSlowPreviewRequest(props.debug));
const showFix = computed(() => Boolean(props.lastError || props.hasRuntimeError));
const showFooter = computed(() => showNPlusOne.value || showSlow.value || showFix.value);

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase().replace(/…$/, "");
}

function isDuplicate(row: PreviewDebugStatement) {
  return duplicateKeys.value.has(normalize(row.sql));
}

function queryBar(row: PreviewDebugStatement) {
  return barPercent(row.durationMs ?? 0, maxQueryMs.value);
}

async function copySql(sql: string) {
  try {
    await navigator.clipboard.writeText(sql);
    copiedSql.value = sql;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedSql.value = "";
    }, 1200);
  } catch {
    copiedSql.value = "";
  }
}

onBeforeUnmount(() => clearTimeout(copiedTimer));
</script>

<template>
  <UiSheet :open="open" :title="t('preview.debugTitle')" @close="emit('close')">
    <div v-if="!hasNumbers" class="preview-debug-empty">{{ emptyHint }}</div>

    <div v-else class="preview-debug">
      <header class="preview-debug-hero">
        <div class="preview-debug-id">
          <p class="preview-debug-method">{{ debug?.method || t("preview.debugRequest") }}</p>
          <h3 class="preview-debug-path" :title="pathLabel">{{ pathLabel || "—" }}</h3>
          <div class="preview-debug-stamps">
            <UiBadge v-if="debug?.laravel?.environment" tone="neutral">{{ debug.laravel.environment }}</UiBadge>
            <UiBadge v-if="debug?.nPlusOne" tone="warn">{{ t("preview.nPlusOne") }}</UiBadge>
            <UiBadge v-if="debug?.exceptions?.count" tone="warn">
              {{ t("preview.debugExceptions", { count: debug.exceptions.count }) }}
            </UiBadge>
          </div>
        </div>

        <dl class="preview-debug-vitals">
          <div v-if="debug?.timeMs != null" class="preview-debug-vital">
            <dt>{{ t("preview.debugVitalTime") }}</dt>
            <dd>
              <span>{{ debug.timeMs }}</span>
              <small>ms</small>
            </dd>
          </div>
          <div v-if="debug?.queryMs != null" class="preview-debug-vital">
            <dt>{{ t("preview.debugVitalSql") }}</dt>
            <dd>
              <span>{{ debug.queryMs }}</span>
              <small>ms</small>
            </dd>
          </div>
          <div v-if="debug?.queries != null" class="preview-debug-vital">
            <dt>{{ t("preview.debugVitalQueries") }}</dt>
            <dd>
              <span>{{ debug.queries }}</span>
            </dd>
          </div>
          <div v-if="debug?.memoryMb != null" class="preview-debug-vital">
            <dt>{{ t("preview.debugVitalMemory") }}</dt>
            <dd>
              <span>{{ debug.memoryMb }}</span>
              <small>MB</small>
            </dd>
          </div>
        </dl>
        <p v-if="sqlShare != null" class="preview-debug-share">{{ t("preview.debugSqlShare", { pct: sqlShare }) }}</p>

        <div v-if="queryTicks.length || phpTicks.length" class="preview-debug-traces">
          <div v-if="queryTicks.length" class="preview-debug-trace">
            <span>{{ t("preview.debugTraceQueries") }}</span>
            <div class="preview-debug-track" :title="t('preview.debugTime', { ms: debug?.timeMs ?? 0 })">
              <i
                v-for="(tick, index) in queryTicks"
                :key="`q-${tick.label}-${index}`"
                class="preview-debug-tick preview-debug-tick-sql"
                :style="{ left: `${tick.left}%`, width: `${tick.width}%` }"
                :title="tick.label"
              />
            </div>
          </div>
          <div v-if="phpTicks.length" class="preview-debug-trace">
            <span>{{ t("preview.debugTracePhp") }}</span>
            <div class="preview-debug-track">
              <i
                v-for="(tick, index) in phpTicks"
                :key="`p-${tick.label}-${index}`"
                class="preview-debug-tick preview-debug-tick-php"
                :class="index % 2 ? 'is-alt' : undefined"
                :style="{ left: `${tick.left}%`, width: `${tick.width}%` }"
                :title="`${tick.label} · ${t('preview.debugTime', { ms: tick.durationMs })}`"
              />
            </div>
          </div>
        </div>
        <p v-if="debug?.exceptions?.message" class="preview-debug-exception">{{ debug.exceptions.message }}</p>
      </header>

      <section class="preview-debug-queries">
        <div class="preview-debug-section-head">
          <h4>{{ t("preview.debugSectionQueries") }}</h4>
          <button type="button" class="preview-debug-sort" @click="sortByDuration = !sortByDuration">
            {{ sortByDuration ? t("preview.debugSortDuration") : t("preview.debugSortOrder") }}
          </button>
        </div>
        <div class="preview-debug-filter">
          <Search class="preview-debug-filter-icon" />
          <input v-model="queryFilter" :placeholder="t('preview.debugFilterQueries')" />
        </div>
        <p v-if="!filteredStatements.length" class="preview-debug-muted">{{ t("preview.debugNoQueries") }}</p>
        <ul v-else class="preview-debug-sql-list">
          <li v-for="(row, index) in filteredStatements" :key="`${index}-${row.sql}`" class="preview-debug-sql">
            <div class="preview-debug-sql-body">
              <div class="preview-debug-sql-meta">
                <span class="preview-debug-sql-verb">{{ sqlVerb(row.sql) || "SQL" }}</span>
                <span class="preview-debug-sql-ms">
                  {{ row.durationMs != null ? t("preview.debugTime", { ms: row.durationMs }) : "—" }}
                </span>
                <span v-if="row.connection" class="preview-debug-sql-conn">{{ row.connection }}</span>
                <UiBadge v-if="isDuplicate(row)" tone="warn">{{ t("preview.nPlusOne") }}</UiBadge>
                <div class="preview-debug-sql-actions">
                  <UiIconButton :label="copiedSql === row.sql ? t('preview.debugCopied') : t('preview.debugCopySql')" size="sm" @click="copySql(row.sql)">
                    <Copy class="h-3.5 w-3.5" />
                  </UiIconButton>
                  <button type="button" class="preview-debug-ask" @click="emit('action', { action: 'query', sql: row.sql })">
                    {{ t("preview.debugAskQuery") }}
                  </button>
                </div>
              </div>
              <p class="preview-debug-sql-text" :title="row.sql">{{ row.sql }}</p>
              <div class="preview-debug-sql-meter" aria-hidden="true">
                <span :style="{ width: `${queryBar(row)}%` }" />
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="showApp" class="preview-debug-app">
        <h4>{{ t("preview.debugSectionApp") }}</h4>
        <p v-if="debug?.inertiaComponent" class="preview-debug-page">{{ debug.inertiaComponent }}</p>
        <p v-if="debug?.route?.controller" class="preview-debug-controller" :title="debug.route.controller">
          {{ debug.route.controller }}
        </p>
        <p v-if="debug?.laravel?.version" class="preview-debug-runtime">
          {{ t("preview.debugLaravel") }} {{ debug.laravel.version }}
        </p>
        <ul v-if="debug?.models?.length" class="preview-debug-chips">
          <li v-for="row in debug.models" :key="row.class">
            <span>{{ row.class.split("\\").pop() }}</span>
            <em>{{ t("preview.debugModelCount", { count: row.count }) }}</em>
          </li>
        </ul>
        <ul v-if="appViews.length" class="preview-debug-views">
          <li v-for="row in appViews" :key="row.name">{{ row.name }}</li>
        </ul>
      </section>
    </div>

    <template v-if="showFooter" #footer>
      <div class="preview-debug-footer">
        <UiButton v-if="showNPlusOne" size="sm" @click="emit('action', { action: 'nplusone' })">
          {{ t("preview.debugFixNPlusOne") }}
        </UiButton>
        <UiButton v-if="showSlow" size="sm" variant="outline" @click="emit('action', { action: 'slow' })">
          {{ t("preview.debugInvestigateSlow") }}
        </UiButton>
        <UiButton v-if="showFix" size="sm" variant="outline" @click="emit('action', { action: 'fix' })">
          {{ t("preview.debugFix") }}
        </UiButton>
      </div>
    </template>
  </UiSheet>
</template>

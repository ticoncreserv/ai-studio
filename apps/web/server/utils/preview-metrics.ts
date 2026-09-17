export const PREVIEW_METRICS_MARK = "__atelierPreviewMetrics";
export const NPLUSONE_MIN_DUPLICATES = 3;
export const DUPLICATE_SQL_LIMIT = 3;
export const SQL_TRUNCATE = 240;
export const SQL_PROMPT_TRUNCATE = 500;
export const STATEMENT_LIMIT = 80;
export const MEASURE_LIMIT = 24;
export const VIEW_LIMIT = 30;
export const MODEL_LIMIT = 20;
export const EXCEPTION_TRUNCATE = 200;

export type PreviewMetricsDuplicate = { sql: string; count: number };
export type PreviewMetricsStatement = { sql: string; durationMs?: number; connection?: string; startMs?: number };
export type PreviewMetricsMeasure = { label: string; durationMs: number };
export type PreviewMetricsView = { name: string; count?: number };
export type PreviewMetricsModel = { class: string; count: number };
export type PreviewMetricsRoute = { uri?: string; controller?: string; middleware?: string };
export type PreviewMetricsLaravel = { version?: string; environment?: string };
export type PreviewMetricsException = { count: number; message?: string };

export type PreviewMetricsSnapshot = {
  timeMs?: number;
  queries?: number;
  queryMs?: number;
  memoryMb?: number;
  nPlusOne: boolean;
  duplicates: PreviewMetricsDuplicate[];
  statements: PreviewMetricsStatement[];
  measures: PreviewMetricsMeasure[];
  views: PreviewMetricsView[];
  models: PreviewMetricsModel[];
  uri?: string;
  method?: string;
  datetime?: string;
  title?: string;
  inertiaComponent?: string;
  inertiaUrl?: string;
  route?: PreviewMetricsRoute;
  laravel?: PreviewMetricsLaravel;
  exceptions?: PreviewMetricsException;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseDurationMs(duration: unknown, durationStr?: unknown): number | undefined {
  const n = asNumber(duration);
  if (n != null) return n < 1000 ? Math.round(n * 1000) : Math.round(n);
  if (typeof durationStr !== "string") return undefined;
  const match = durationStr.trim().match(/^([\d.]+)\s*(ms|s|sec|secs|seconds)?$/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const unit = (match[2] ?? "ms").toLowerCase();
  return unit === "ms" ? Math.round(value) : Math.round(value * 1000);
}

export function parseQueryDurationMs(duration: unknown, durationStr?: unknown): number | undefined {
  if (typeof durationStr === "string") {
    const fromStr = parseDurationMs(undefined, durationStr);
    if (fromStr != null) return fromStr;
  }
  const n = asNumber(duration);
  if (n == null) return undefined;
  return Math.round(n);
}

export function parseMemoryMb(peakUsage: unknown, peakUsageStr?: unknown): number | undefined {
  const bytes = asNumber(peakUsage);
  if (bytes != null) return Math.round((bytes / (1024 * 1024)) * 10) / 10;
  if (typeof peakUsageStr !== "string") return undefined;
  const match = peakUsageStr.trim().match(/^([\d.]+)\s*(b|kb|kib|mb|mib|gb|gib)?$/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const unit = (match[2] ?? "mb").toLowerCase();
  if (unit === "b") return Math.round((value / (1024 * 1024)) * 10) / 10;
  if (unit === "kb" || unit === "kib") return Math.round((value / 1024) * 10) / 10;
  if (unit === "gb" || unit === "gib") return Math.round(value * 1024 * 10) / 10;
  return Math.round(value * 10) / 10;
}

export function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function truncateSql(sql: string, limit = SQL_TRUNCATE): string {
  const normalized = normalizeSql(sql);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}

function statementSql(row: unknown): string | undefined {
  const rec = asRecord(row);
  if (!rec) return undefined;
  const sql = rec.sql ?? rec.statement ?? rec.query;
  if (typeof sql !== "string" || !sql.trim()) return undefined;
  if (/^connection established$/i.test(sql.trim())) return undefined;
  return sql;
}

function duplicateQueries(statements: unknown, reported?: unknown): PreviewMetricsDuplicate[] {
  const counts = new Map<string, { count: number; sample: string }>();
  if (Array.isArray(statements)) {
    for (const row of statements) {
      const sql = statementSql(row);
      if (!sql) continue;
      const key = normalizeSql(sql).toLowerCase();
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { count: 1, sample: sql });
    }
  }
  const reportedN = asNumber(reported);
  const rows = [...counts.values()]
    .filter((row) => row.count >= NPLUSONE_MIN_DUPLICATES)
    .sort((a, b) => b.count - a.count)
    .slice(0, DUPLICATE_SQL_LIMIT)
    .map((row) => ({ sql: truncateSql(row.sample), count: row.count }));
  if (rows.length) return rows;
  if (reportedN && reportedN > 0) return [{ sql: "duplicate queries", count: Math.round(reportedN) }];
  return [];
}

function parseStatements(statements: unknown): PreviewMetricsStatement[] {
  if (!Array.isArray(statements)) return [];
  const rows: PreviewMetricsStatement[] = [];
  for (const row of statements) {
    if (rows.length >= STATEMENT_LIMIT) break;
    const sql = statementSql(row);
    if (!sql) continue;
    const rec = asRecord(row) ?? {};
    const durationMs = parseQueryDurationMs(rec.duration ?? rec.time, rec.duration_str);
    const startMs = parseDurationMs(rec.start, rec.start_str);
    const connection = asString(rec.connection ?? rec.connectionName);
    rows.push({
      sql: truncateSql(sql, SQL_PROMPT_TRUNCATE),
      durationMs,
      connection,
      startMs,
    });
  }
  return rows;
}

function parseMeasures(measures: unknown): PreviewMetricsMeasure[] {
  if (!Array.isArray(measures)) return [];
  const rows: PreviewMetricsMeasure[] = [];
  for (const row of measures) {
    if (rows.length >= MEASURE_LIMIT) break;
    const rec = asRecord(row);
    const label = asString(rec?.label ?? rec?.name);
    if (!label) continue;
    const durationMs = parseDurationMs(rec?.duration, rec?.duration_str);
    if (durationMs == null) continue;
    rows.push({ label, durationMs });
  }
  return rows;
}

function parseViews(raw: unknown): PreviewMetricsView[] {
  const rec = asRecord(raw);
  const templates = rec && Array.isArray(rec.templates) ? rec.templates : Array.isArray(raw) ? raw : [];
  const rows: PreviewMetricsView[] = [];
  for (const row of templates) {
    if (rows.length >= VIEW_LIMIT) break;
    if (typeof row === "string") {
      rows.push({ name: row });
      continue;
    }
    const item = asRecord(row);
    const name = asString(item?.name ?? item?.path ?? item?.view);
    if (!name) continue;
    const count = asNumber(item?.param_count ?? item?.count);
    rows.push({ name, count });
  }
  return rows;
}

function parseModels(raw: unknown): PreviewMetricsModel[] {
  const rec = asRecord(raw);
  const data = rec ? (asRecord(rec.data) ?? rec) : asRecord(raw);
  if (!data) return [];
  const rows: PreviewMetricsModel[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (rows.length >= MODEL_LIMIT) break;
    if (key === "count" || key === "data" || key === "nb_models") continue;
    const nested = asRecord(value);
    const count = asNumber(nested?.value ?? nested?.count ?? value);
    if (count == null) continue;
    rows.push({ class: key, count: Math.round(count) });
  }
  return rows.sort((a, b) => b.count - a.count);
}

function joinMiddleware(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(", ") : undefined;
  }
  return undefined;
}

function parseRoute(raw: unknown): PreviewMetricsRoute | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const uri = asString(rec.uri ?? rec.path);
  const controller = asString(rec.controller ?? rec.action);
  const middleware = joinMiddleware(rec.middleware);
  if (!uri && !controller && !middleware) return undefined;
  return { uri, controller, middleware };
}

function parseLaravel(raw: unknown): PreviewMetricsLaravel | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const tooltip = asRecord(rec.tooltip);
  const version = asString(rec.version) ?? asString(tooltip?.["Laravel Version"]);
  const environment = asString(rec.environment ?? rec.env) ?? asString(tooltip?.Environment);
  if (!version && !environment) return undefined;
  return { version, environment };
}

function parseExceptions(raw: unknown): PreviewMetricsException | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const list = Array.isArray(rec.exceptions) ? rec.exceptions : Array.isArray(rec.messages) ? rec.messages : [];
  const count = asNumber(rec.count) ?? list.length;
  if (!count) return undefined;
  const first = asRecord(list[0]);
  const message = asString(first?.message ?? first?.type);
  return {
    count: Math.round(count),
    message: message ? truncateSql(message, EXCEPTION_TRUNCATE) : undefined,
  };
}

export function parsePageContext(input: {
  title?: unknown;
  dataPage?: unknown;
  page?: unknown;
}): Pick<PreviewMetricsSnapshot, "title" | "inertiaComponent" | "inertiaUrl"> {
  const title = asString(input.title);
  let inertiaComponent: string | undefined;
  let inertiaUrl: string | undefined;
  const fromJson = (value: unknown) => {
    const rec = asRecord(value);
    if (!rec) return;
    if (!inertiaComponent) inertiaComponent = asString(rec.component);
    if (!inertiaUrl) inertiaUrl = asString(rec.url);
  };
  if (typeof input.dataPage === "string") {
    const raw = input.dataPage.trim();
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        fromJson(JSON.parse(raw) as unknown);
      } catch {
        /* ignore malformed Inertia payloads */
      }
    }
  } else {
    fromJson(input.dataPage);
  }
  fromJson(input.page);
  return { title, inertiaComponent, inertiaUrl };
}

export function parseDebugbarDataset(raw: unknown): PreviewMetricsSnapshot {
  const data = asRecord(raw) ?? {};
  const time = asRecord(data.time) ?? {};
  const memory = asRecord(data.memory) ?? {};
  const queries = asRecord(data.queries) ?? {};
  const meta = asRecord(data.__meta) ?? asRecord(data.meta) ?? {};
  const duplicates = duplicateQueries(
    queries.statements,
    queries.accumulated_duplicate_queries ?? queries.nb_duplicate_statements,
  );
  const uri = asString(meta.uri) ?? asString(data.uri);
  const method = asString(meta.method) ?? asString(data.method);
  const datetime = asString(meta.datetime);
  const queryCount = asNumber(queries.nb_statements) ?? (Array.isArray(queries.statements) ? queries.statements.length : undefined);
  const queryMs = parseQueryDurationMs(queries.accumulated_duration, queries.accumulated_duration_str);
  const statements = parseStatements(queries.statements);
  const measures = parseMeasures(time.measures);
  const views = parseViews(data.views);
  const models = parseModels(data.models);
  const route = parseRoute(data.route);
  const laravel = parseLaravel(data.laravel);
  const exceptions = parseExceptions(data.exceptions);
  return {
    timeMs: parseDurationMs(time.duration, time.duration_str),
    queries: queryCount != null ? Math.round(queryCount) : undefined,
    queryMs,
    memoryMb: parseMemoryMb(memory.peak_usage, memory.peak_usage_str),
    nPlusOne: duplicates.length > 0,
    duplicates,
    statements,
    measures,
    views,
    models,
    uri,
    method,
    datetime,
    route,
    laravel,
    exceptions,
  };
}

export function latestDebugbarDataset(bar: unknown): unknown {
  const rec = asRecord(bar);
  if (!rec) return undefined;
  const datasets = asRecord(rec.datasets);
  if (datasets) {
    const keys = Object.keys(datasets);
    if (keys.length) return datasets[keys[keys.length - 1]!];
  }
  if (Array.isArray(rec.dataMap) && rec.dataMap.length) {
    const last = rec.dataMap[rec.dataMap.length - 1];
    const row = asRecord(last);
    return row?.data ?? last;
  }
  return undefined;
}

export function previewMetricsScript(): string {
  return `(function(){
if(window.${PREVIEW_METRICS_MARK})return;
window.${PREVIEW_METRICS_MARK}=1;
function ping(p){try{parent.postMessage(p,"*");}catch(e){}}
function rec(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:null;}
function num(v){if(typeof v==="number"&&isFinite(v))return v;if(typeof v==="string"&&v.trim()){var n=Number(v);if(isFinite(n))return n;}}
function str(v){return typeof v==="string"&&v.trim()?v.trim():undefined;}
function dur(d,s){var n=num(d);if(n!=null)return n<1000?Math.round(n*1000):Math.round(n);if(typeof s!=="string")return;var m=s.trim().match(/^([\\d.]+)\\s*(ms|s|sec|secs|seconds)?$/i);if(!m)return;var v=Number(m[1]);if(!isFinite(v))return;var u=(m[2]||"ms").toLowerCase();return u==="ms"?Math.round(v):Math.round(v*1000);}
function qdur(d,s){if(typeof s==="string"){var from=dur(undefined,s);if(from!=null)return from;}var n=num(d);if(n==null)return;return Math.round(n);}
function mem(b,s){var n=num(b);if(n!=null)return Math.round((n/(1024*1024))*10)/10;if(typeof s!=="string")return;var m=s.trim().match(/^([\\d.]+)\\s*(b|kb|kib|mb|mib|gb|gib)?$/i);if(!m)return;var v=Number(m[1]);if(!isFinite(v))return;var u=(m[2]||"mb").toLowerCase();if(u==="b")return Math.round((v/(1024*1024))*10)/10;if(u==="kb"||u==="kib")return Math.round((v/1024)*10)/10;if(u==="gb"||u==="gib")return Math.round(v*1024*10)/10;return Math.round(v*10)/10;}
function norm(s){return s.replace(/\\s+/g," ").trim();}
function trunc(s,n){s=norm(s);return s.length<=n?s:s.slice(0,n-1)+"…";}
function sql(row){var r=rec(row);if(!r)return;var s=r.sql||r.statement||r.query;if(typeof s!=="string"||!s.trim())return;if(/^connection established$/i.test(s.trim()))return;return s;}
function dups(stmts,reported){var map={};if(Array.isArray(stmts)){for(var i=0;i<stmts.length;i++){var q=sql(stmts[i]);if(!q)continue;var k=norm(q).toLowerCase();if(map[k])map[k].count++;else map[k]={count:1,sample:q};}}var rows=[];for(var k in map){if(map[k].count>=${NPLUSONE_MIN_DUPLICATES})rows.push(map[k]);}rows.sort(function(a,b){return b.count-a.count;});rows=rows.slice(0,${DUPLICATE_SQL_LIMIT}).map(function(r){return{sql:trunc(r.sample,${SQL_TRUNCATE}),count:r.count};});if(rows.length)return rows;var n=num(reported);if(n&&n>0)return[{sql:"duplicate queries",count:Math.round(n)}];return[];}
function stmts(list){if(!Array.isArray(list))return[];var rows=[];for(var i=0;i<list.length&&rows.length<${STATEMENT_LIMIT};i++){var q=sql(list[i]);if(!q)continue;var r=rec(list[i])||{};rows.push({sql:trunc(q,${SQL_PROMPT_TRUNCATE}),durationMs:qdur(r.duration||r.time,r.duration_str),connection:str(r.connection||r.connectionName),startMs:dur(r.start,r.start_str)}); }return rows;}
function measures(list){if(!Array.isArray(list))return[];var rows=[];for(var i=0;i<list.length&&rows.length<${MEASURE_LIMIT};i++){var r=rec(list[i]);var label=str(r&&(r.label||r.name));if(!label)continue;var ms=dur(r&&r.duration,r&&r.duration_str);if(ms==null)continue;rows.push({label:label,durationMs:ms});}return rows;}
function views(raw){var r=rec(raw);var tpls=r&&Array.isArray(r.templates)?r.templates:Array.isArray(raw)?raw:[];var rows=[];for(var i=0;i<tpls.length&&rows.length<${VIEW_LIMIT};i++){if(typeof tpls[i]==="string"){rows.push({name:tpls[i]});continue;}var item=rec(tpls[i]);var name=str(item&&(item.name||item.path||item.view));if(!name)continue;rows.push({name:name,count:num(item&&(item.param_count||item.count))});}return rows;}
function models(raw){var r=rec(raw);var data=r?(rec(r.data)||r):rec(raw);if(!data)return[];var rows=[];for(var key in data){if(rows.length>=${MODEL_LIMIT})break;if(key==="count"||key==="data"||key==="nb_models")continue;var nested=rec(data[key]);var c=num(nested&&(nested.value||nested.count)||data[key]);if(c==null)continue;rows.push({class:key,count:Math.round(c)});}rows.sort(function(a,b){return b.count-a.count;});return rows;}
function mw(v){if(typeof v==="string"&&v.trim())return v.trim();if(Array.isArray(v)){var p=[];for(var i=0;i<v.length;i++){var s=str(v[i]);if(s)p.push(s);}return p.length?p.join(", "):undefined;}}
function route(raw){var r=rec(raw);if(!r)return;var uri=str(r.uri||r.path);var controller=str(r.controller||r.action);var middleware=mw(r.middleware);if(!uri&&!controller&&!middleware)return;return{uri:uri,controller:controller,middleware:middleware};}
function laravel(raw){var r=rec(raw);if(!r)return;var tip=rec(r.tooltip)||{};var version=str(r.version)||str(tip["Laravel Version"]);var environment=str(r.environment||r.env)||str(tip.Environment);if(!version&&!environment)return;return{version:version,environment:environment};}
function exceptions(raw){var r=rec(raw);if(!r)return;var list=Array.isArray(r.exceptions)?r.exceptions:Array.isArray(r.messages)?r.messages:[];var count=num(r.count);if(count==null)count=list.length;if(!count)return;var first=rec(list[0]);var message=str(first&&(first.message||first.type));return{count:Math.round(count),message:message?trunc(message,${EXCEPTION_TRUNCATE}):undefined};}
function page(){var title=str(document.title);var component,url;try{var el=document.querySelector("script[data-page]");var raw=el&&el.textContent;if(!raw){var node=document.querySelector("[data-page]");raw=node&&node.getAttribute("data-page");}if(raw){var json=JSON.parse(raw);if(json){component=str(json.component);url=str(json.url);}}var p=window.$page;if(p){if(!component)component=str(p.component);if(!url)url=str(p.url);}}catch(e){}return{title:title,inertiaComponent:component,inertiaUrl:url};}
function parse(raw){var data=rec(raw)||{};var time=rec(data.time)||{};var memory=rec(data.memory)||{};var queries=rec(data.queries)||{};var meta=rec(data.__meta)||rec(data.meta)||{};var duplicates=dups(queries.statements,queries.accumulated_duplicate_queries||queries.nb_duplicate_statements);var qc=num(queries.nb_statements);if(qc==null&&Array.isArray(queries.statements))qc=queries.statements.length;var ctx=page();return{timeMs:dur(time.duration,time.duration_str),queries:qc!=null?Math.round(qc):undefined,queryMs:qdur(queries.accumulated_duration,queries.accumulated_duration_str),memoryMb:mem(memory.peak_usage,memory.peak_usage_str),nPlusOne:duplicates.length>0,duplicates:duplicates,statements:stmts(queries.statements),measures:measures(time.measures),views:views(data.views),models:models(data.models),uri:str(meta.uri)||str(data.uri),method:str(meta.method)||str(data.method),datetime:str(meta.datetime),title:ctx.title,inertiaComponent:ctx.inertiaComponent,inertiaUrl:ctx.inertiaUrl,route:route(data.route),laravel:laravel(data.laravel),exceptions:exceptions(data.exceptions)};}
function latest(bar){var r=rec(bar);if(!r)return;var sets=rec(r.datasets);if(sets){var keys=Object.keys(sets);if(keys.length)return sets[keys[keys.length-1]];}if(Array.isArray(r.dataMap)&&r.dataMap.length){var last=r.dataMap[r.dataMap.length-1];var row=rec(last);return row&&row.data?row.data:last;}}
function send(ds){if(!ds)return;var snap=parse(ds);ping({type:"atelier-preview-metrics",source:"atelier-preview",timeMs:snap.timeMs,queries:snap.queries,queryMs:snap.queryMs,memoryMb:snap.memoryMb,nPlusOne:snap.nPlusOne,duplicates:snap.duplicates,statements:snap.statements,measures:snap.measures,views:snap.views,models:snap.models,uri:snap.uri,method:snap.method,datetime:snap.datetime,title:snap.title,inertiaComponent:snap.inertiaComponent,inertiaUrl:snap.inertiaUrl,route:snap.route,laravel:snap.laravel,exceptions:snap.exceptions});}
function tick(){var bar=window.phpdebugbar;if(!bar)return false;send(latest(bar));if(!bar.__atelierHooked&&typeof bar.addDataSet==="function"){bar.__atelierHooked=1;var orig=bar.addDataSet.bind(bar);bar.addDataSet=function(data,id,label){var ret=orig(data,id,label);send(data);return ret;};}return true;}
var tries=0;var timer=setInterval(function(){if(tick()){clearInterval(timer);return;}tries++;if(tries>=20){clearInterval(timer);if(!window.phpdebugbar)ping({type:"atelier-preview-metrics",source:"atelier-preview",missing:true});}},400);
document.addEventListener("inertia:finish",function(){tick();});
document.addEventListener("DOMContentLoaded",function(){tick();});
tick();
})();`.replace(/\n/g, "");
}

export function injectPreviewMetrics(html: string): string {
  if (html.includes(PREVIEW_METRICS_MARK)) return html;
  if (!/<\/body>/i.test(html)) return html;
  return html.replace(/<\/body>/i, `<script>${previewMetricsScript()}</script></body>`);
}

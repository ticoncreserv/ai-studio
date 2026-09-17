type RenderBeforePayload = {
  event?: { context?: Record<string, unknown> };
};

export function seedI18nContextForErrorRender(payload: { name: string; args: unknown[] }): void {
  if (payload.name !== "render:before") return;
  const render = payload.args.find(
    (arg): arg is RenderBeforePayload => Boolean(arg) && typeof arg === "object" && "event" in arg,
  );
  const ctx = render?.event?.context;
  if (!ctx || ctx.nuxtI18n) return;
  // Workaround: Nuxt's /__nuxt_error renderer skips the i18n request hook, and
  // @nuxtjs/i18n 10.6 render:before then throws "server context has not been set up yet".
  ctx.nuxtI18n = {
    messages: {},
    slp: {},
    localeConfigs: {},
    trackMap: {},
    vueI18nOptions: { defaultLocale: "pt-BR" },
    trackKey() {},
    async loadMessages() {
      return {};
    },
  };
}

import { seedI18nContextForErrorRender } from "../utils/i18n-error-context";

export default defineNitroPlugin((nitro) => {
  nitro.hooks.beforeEach((payload) => {
    seedI18nContextForErrorRender(payload);
  });
});

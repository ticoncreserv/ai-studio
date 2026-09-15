# Atelier

Code, filenames, comments, commit messages, API fields, and branch names are English.
User-facing copy always goes through i18n (`apps/web/i18n/locales`). English is the default locale and the key source. Portuguese (Brazil) is the first translation.

The agent reply language is not UI i18n. The rules compiler injects it from the signed-in user's locale. Generated application code stays in English.

Do not remove or refactor a workaround that has an explanatory comment unless the user explicitly asks.

Target repository for generated work: `github.com/ticoncreserv/app` (Laravel 13, Inertia, Vue). Until GitHub App secrets exist, run against `fixtures/laravel-app` and `MockProvider`.

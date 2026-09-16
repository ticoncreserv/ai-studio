# Atelier

Code, filenames, comments, commit messages, API fields, and branch names are English.
User-facing copy always goes through i18n (`apps/web/i18n/locales`). English is the key source. The default UI locale is `pt-BR`.

The agent reply language is not UI i18n. The rules compiler injects it from the signed-in user's locale. Generated application code stays in English.

Do not remove or refactor a workaround that has an explanatory comment unless the user explicitly asks.

Target repository for generated work: `github.com/ticoncreserv/app` (Laravel 13, Inertia, Vue). Provision with the GitHub App installation token onto `user/{login}/studio`. `fixtures/laravel-app`, `fixtures/acp`, and `MockProvider` are tests/eval only — never the production worktree or agent.

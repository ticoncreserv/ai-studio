import { handleGitHubWebhook } from "../../utils/github-webhook";

export default defineEventHandler(handleGitHubWebhook);

import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler((event) => {
  requirePlatformAdmin(event);
  const people = platform().listUsers();
  return {
    profiles: platform().usageProfiles(),
    users: platform()
      .listUsageSummaries()
      .map((summary) => {
        const person = people.find((row) => row.id === summary.userId);
        return { ...summary, login: person?.login ?? summary.userId, name: person?.name ?? "" };
      }),
    flags: platform().flags(),
  };
});

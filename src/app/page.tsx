import { Home } from "@/components/Home";
// The marketing website lives in src/app/(website), outside the repository; without it
// the import falls back to src/websiteFallback.
import { Landing } from "@website/Landing";
import { currentUser, SERVER_MODE } from "@/server/auth";

export default async function HomePage() {
  // Decided on the server so visitors get the homepage with the first response, not after a spinner.
  const visitor = SERVER_MODE && !(await currentUser().catch(() => null));
  return <Home visitor={visitor} landing={<Landing />} />;
}

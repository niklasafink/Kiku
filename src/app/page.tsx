import { Home } from "@/components/Home";
import { Landing } from "@website/Landing";
import { currentUser, SERVER_MODE } from "@/server/auth";

export default async function HomePage() {
  // Decided on the server so visitors get the homepage with the first response, not after a spinner.
  const visitor = SERVER_MODE && !(await currentUser().catch(() => null));
  return <Home visitor={visitor} landing={<Landing />} />;
}

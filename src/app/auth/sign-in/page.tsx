import { AuthForm } from "@/components/AuthForm";
import { returnPath } from "@/lib/offers";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" next={returnPath(typeof next === "string" ? next : null)} />;
}

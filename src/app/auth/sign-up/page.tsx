import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { returnPath } from "@/lib/offers";

export const metadata: Metadata = { title: "Registrieren | Kiku" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-up" next={returnPath(typeof next === "string" ? next : null)} />;
}

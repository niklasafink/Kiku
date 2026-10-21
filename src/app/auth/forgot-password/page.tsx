import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/PasswordReset";

export const metadata: Metadata = { title: "Passwort vergessen | Kiku" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

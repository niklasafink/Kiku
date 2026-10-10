import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/PasswordReset";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

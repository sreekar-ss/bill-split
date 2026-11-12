import type { Metadata } from "next";
import { LogoutButton } from "@/components/account/logout-button";
import { PasswordForm } from "@/components/account/password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { ThemePicker } from "@/components/account/theme-picker";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader, Section } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/server/users";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  return (
    <div className="max-w-[720px]">
      <PageHeader title="Account" />

      <div className="mb-8 flex items-center gap-3.5">
        <Avatar id={profile.id} name={profile.name} size={56} />
        <div className="min-w-0">
          <p className="truncate text-title font-semibold">{profile.name}</p>
          <p className="truncate text-body-sm text-ink-muted">{profile.email}</p>
        </div>
      </div>

      <div className="max-w-[440px]">
        <Section title="Profile">
          <ProfileForm name={profile.name} email={profile.email} defaultCurrency={profile.defaultCurrency} />
        </Section>

        <Section title="Theme">
          <ThemePicker />
        </Section>

        <Section title="Password">
          <p className="-mt-1 mb-4 text-body-sm text-ink-muted">
            Changing your password logs you out on every other phone and computer. You&apos;ll stay logged in here.
          </p>
          <PasswordForm />
        </Section>

        <div className="mt-10 border-t border-rule pt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}

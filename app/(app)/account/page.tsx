import { Download } from "lucide-react";
import type { Metadata } from "next";
import { DeleteAccountButton } from "@/components/account/delete-account";
import { EmailStatus } from "@/components/account/email-status";
import { LogoutButton } from "@/components/account/logout-button";
import { LogoutEverywhereButton } from "@/components/account/logout-everywhere";
import { PasswordForm } from "@/components/account/password-form";
import { PaymentHandlesForm } from "@/components/account/payment-handles-form";
import { ProfileForm } from "@/components/account/profile-form";
import { ThemePicker } from "@/components/account/theme-picker";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
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
          <EmailStatus verified={profile.emailVerified} email={profile.email} />
        </div>
      </div>

      <div className="max-w-[440px]">
        <Section title="Profile">
          <ProfileForm name={profile.name} email={profile.email} defaultCurrency={profile.defaultCurrency} />
        </Section>

        <Section title="Get paid faster">
          <p className="-mt-1 mb-4 text-body-sm text-ink-muted">
            Friends see these when they settle up with you. We never move money. Add any you use, and leave the rest empty.
          </p>
          <PaymentHandlesForm
            initial={{
              venmoHandle: profile.venmoHandle ?? "",
              paypalMe: profile.paypalMe ?? "",
              cashTag: profile.cashTag ?? "",
              upiId: profile.upiId ?? "",
            }}
          />
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

        <Section title="Security">
          <p className="-mt-1 mb-4 text-body-sm text-ink-muted">
            Lost a phone or used a shared computer? Log out of all devices, including this one.
          </p>
          <div className="flex flex-wrap gap-2">
            <LogoutButton />
            <LogoutEverywhereButton />
          </div>
        </Section>

        <Section title="Your data">
          <p className="-mt-1 mb-4 text-body-sm text-ink-muted">
            Get a JSON file of your profile, groups, expenses, payments and friends.
          </p>
          <a href="/api/account/export" download className={buttonVariants({ variant: "secondary" })}>
            <Download aria-hidden />
            Download my data
          </a>
        </Section>

        <Section title="Delete account" className="mt-10 border-t border-rule pt-6">
          <p className="-mt-1 mb-4 text-body-sm text-ink-muted">
            Settle up every balance first: you can&apos;t delete your account while anyone owes you or you owe them. Afterwards, your
            name shows as &ldquo;Deleted user&rdquo; in other people&apos;s history, so their totals still add up.
          </p>
          <DeleteAccountButton />
        </Section>
      </div>
    </div>
  );
}

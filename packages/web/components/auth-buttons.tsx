"use client";

import { signIn, signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

type AuthButtonsProps = {
  isSignedIn: boolean;
  userName: string | null | undefined;
};

export function AuthButtons({ isSignedIn, userName }: AuthButtonsProps) {
  if (isSignedIn) {
    return (
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{userName ?? "user"}</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => signOut()}>
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-center sm:justify-start">
      <Button type="button" onClick={() => void signIn("github")}>
        Sign in with GitHub
      </Button>
    </div>
  );
}

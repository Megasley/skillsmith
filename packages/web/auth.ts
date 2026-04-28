import type { Account, User } from "@auth/core/types";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import nextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// `next-auth` is ESM; with `moduleResolution: "bundler"` the default export
// is sometimes typed as the whole module. Runtime default is the initializer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const { handlers, signIn, signOut, auth } = (nextAuth as any)({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: "repo read:user" } },
    }),
  ],
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  callbacks: {
    authorized: async () => true,
    async jwt({
      token,
      account,
    }: {
      token: JWT;
      account: Account | null;
      user: User;
    }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (typeof token.accessToken === "string") {
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },
});

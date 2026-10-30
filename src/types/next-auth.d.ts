import "next-auth";

declare module "next-auth" {
  interface User {
    username: string;
    role: "ADMIN" | "EMPLOYEE";
  }

  interface Session {
    user: {
      id: string;
      username: string;
      role: "ADMIN" | "EMPLOYEE";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string;
    role?: "ADMIN" | "EMPLOYEE";
  }
}
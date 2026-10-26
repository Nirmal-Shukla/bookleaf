import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { UserRole } from "@/generated/prisma/client";

import { getCurrentUser, landingPathForRole } from "./authorization";

export async function getPageUser() {
  return getCurrentUser(await headers());
}

export async function requirePageRole(role: UserRole) {
  const user = await getPageUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== role) {
    redirect(landingPathForRole(user.role));
  }

  return user;
}

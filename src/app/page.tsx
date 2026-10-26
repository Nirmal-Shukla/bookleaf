import { redirect } from "next/navigation";

import { landingPathForRole } from "@/server/auth/authorization";
import { getPageUser } from "@/server/auth/page-authorization";

export const instant = false;

export default async function Home() {
  const user = await getPageUser();
  redirect(user ? landingPathForRole(user.role) : "/login");
}

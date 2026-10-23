import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession, homePath } from "@/data/session";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome(): Promise<never> {
  const session = await getSession();
  if (!session) redirect("/login");
  return redirect(homePath(session.role));
}

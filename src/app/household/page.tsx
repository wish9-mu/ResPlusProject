import { redirect } from "next/navigation";

// The household experience now lives on the landing page ("/").
// Keep this route as a permanent redirect so old links still work.
export default function HouseholdRedirect() {
  redirect("/");
}

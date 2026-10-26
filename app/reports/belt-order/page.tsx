import { redirect } from "next/navigation";

// Belt Order lives as a built-in report tab now; keep this URL working.
export default function BeltOrderRedirect() {
  redirect("/reports?tab=belt-order");
}

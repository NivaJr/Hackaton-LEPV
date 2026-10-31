import { GRADES, SUBJECTS } from "@/config/catalog";

export async function GET() {
  return Response.json({ grades: GRADES, subjects: SUBJECTS });
}

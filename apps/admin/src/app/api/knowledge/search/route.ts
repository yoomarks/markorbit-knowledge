import { handleKnowledgeSearchGet } from "@/server/knowledge-search-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleKnowledgeSearchGet;

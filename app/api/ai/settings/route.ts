import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

async function getWorkspaceContext() {
  const [workspaceId, userId] = await Promise.all([
    getCurrentWorkspaceId(),
    getCurrentUserId(),
  ]);
  if (!workspaceId || !userId) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!membership) return null;
  return { workspaceId, role: membership.role };
}

export async function GET() {
  const access = await getWorkspaceContext();
  if (!access) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: access.workspaceId },
    orderBy: { username: "asc" },
    select: {
      id: true,
      username: true,
      aiSettings: {
        select: { enabled: true, instructions: true, dailyLimit: true, language: true },
      },
    },
  });
  return NextResponse.json({
    success: true,
    data: {
      apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
      accounts: accounts.map(({ aiSettings, ...account }) => ({
        ...account,
        settings: aiSettings ?? { enabled: false, instructions: "", dailyLimit: 30, language: "uz-Latn" },
      })),
    },
  });
}

export async function POST(request: NextRequest) {
  const access = await getWorkspaceContext();
  if (!access || access.role === "MEMBER") return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  let body: {
    instagramAccountId?: string;
    enabled?: boolean;
    instructions?: string;
    dailyLimit?: number;
    language?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  if (
    !body.instagramAccountId ||
    typeof body.enabled !== "boolean" ||
    typeof body.instructions !== "string" ||
    body.instructions.length > 4000 ||
    !Number.isInteger(body.dailyLimit) ||
    (body.dailyLimit ?? 0) < 1 ||
    (body.dailyLimit ?? 0) > 500 ||
    body.language !== "uz-Latn"
  ) {
    return NextResponse.json({ success: false, error: "Invalid AI settings." }, { status: 400 });
  }
  if (body.enabled && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ success: false, error: "Gemini API key is not configured on the server." }, { status: 409 });
  }

  const account = await prisma.instagramAccount.findFirst({
    where: { id: body.instagramAccountId, workspaceId: access.workspaceId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ success: false, error: "Instagram account not found." }, { status: 404 });

  const settings = await prisma.aiSettings.upsert({
    where: { instagramAccountId: account.id },
    create: {
      instagramAccountId: account.id,
      enabled: body.enabled,
      instructions: body.instructions.trim(),
      dailyLimit: body.dailyLimit!,
      language: body.language,
    },
    update: {
      enabled: body.enabled,
      instructions: body.instructions.trim(),
      dailyLimit: body.dailyLimit!,
      language: body.language,
    },
    select: { enabled: true, instructions: true, dailyLimit: true, language: true },
  });
  return NextResponse.json({ success: true, data: settings });
}

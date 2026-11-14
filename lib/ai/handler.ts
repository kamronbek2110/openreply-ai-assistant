import { prisma } from "@/lib/db/client";
import {
  sendCommentReply,
  sendDirectMessage,
  type InstagramContext,
} from "@/lib/instagram/provider";
import { buildAssistantInstructions, addAutomatedDisclosure } from "./assistant";
import { generateGeminiReply } from "./provider";
import { splitInstagramReply } from "./split";

type Account = { id: string; instagramId: string };

async function getSettings(accountId: string) {
  const settings = await prisma.aiSettings.findUnique({
    where: { instagramAccountId: accountId },
  });
  if (!settings?.enabled || !process.env.GEMINI_API_KEY) return null;
  const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.aiMessage.deleteMany({
    where: { instagramAccountId: accountId, createdAt: { lt: retentionCutoff } },
  });
  await prisma.aiConversation.deleteMany({
    where: {
      instagramAccountId: accountId,
      lastInboundAt: { lt: retentionCutoff },
    },
  });
  return settings;
}

async function hasDailyCapacity(accountId: string, limit: number): Promise<boolean> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const sent = await prisma.aiMessage.count({
    where: {
      instagramAccountId: accountId,
      role: "ASSISTANT",
      status: "SENT",
      createdAt: { gte: start },
    },
  });
  return sent < limit;
}

function reportSkipped(reason: string, accountId: string) {
  console.info(`[AI] ${reason}; account=${accountId}`);
}

export async function replyToInboundDm({
  account,
  context,
  recipientId,
  messageId,
  messageText,
  messageTimestamp,
}: {
  account: Account;
  context: InstagramContext;
  recipientId: string;
  messageId: string;
  messageText: string;
  messageTimestamp?: number;
}): Promise<void> {
  const settings = await getSettings(account.id);
  if (!settings || !messageText.trim()) return;

  const now = new Date();
  const inboundAt = messageTimestamp ? new Date(messageTimestamp) : now;
  if (Number.isNaN(inboundAt.getTime()) || now.getTime() - inboundAt.getTime() > 24 * 60 * 60 * 1000) {
    reportSkipped("messaging window is closed", account.id);
    return;
  }
  const conversation = await prisma.aiConversation.upsert({
    where: {
      instagramAccountId_recipientId: {
        instagramAccountId: account.id,
        recipientId,
      },
    },
    create: {
      instagramAccountId: account.id,
      recipientId,
      lastInboundAt: inboundAt,
    },
    update: { lastInboundAt: inboundAt },
  });

  if (conversation.pausedUntil && conversation.pausedUntil > now) {
    reportSkipped("human handoff is active", account.id);
    return;
  }
  if (!conversation.lastInboundAt || now.getTime() - conversation.lastInboundAt.getTime() > 24 * 60 * 60 * 1000) {
    reportSkipped("messaging window is closed", account.id);
    return;
  }

  try {
    await prisma.aiMessage.create({
      data: {
        instagramAccountId: account.id,
        conversationId: conversation.id,
        eventId: `in:dm:${messageId}`,
        role: "USER",
        channel: "DM",
        status: "SENT",
        content: messageText.slice(0, 4000),
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return;
    throw error;
  }

  const assistantEventId = `out:dm:${messageId}`;
  const existingReply = await prisma.aiMessage.findUnique({ where: { eventId: assistantEventId } });
  if (existingReply) return;
  if (!(await hasDailyCapacity(account.id, settings.dailyLimit))) {
    reportSkipped("daily reply limit reached", account.id);
    return;
  }

  const history = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id, status: "SENT" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { role: true, content: true },
  });
  const isFirstReply = !history.some((item) => item.role === "ASSISTANT");
  const messages = history.reverse().map((item) => ({ role: item.role, content: item.content }));

  let claim;
  try {
    claim = await prisma.aiMessage.create({
      data: {
        instagramAccountId: account.id,
        conversationId: conversation.id,
        eventId: assistantEventId,
        role: "ASSISTANT",
        channel: "DM",
        status: "PENDING",
        content: "",
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return;
    throw error;
  }

  const generated = await generateGeminiReply({
    instructions: buildAssistantInstructions(settings.instructions, settings.language),
    messages,
  });
  if (!generated) {
    await prisma.aiMessage.update({ where: { id: claim.id }, data: { status: "FAILED" } });
    reportSkipped("provider returned no reply", account.id);
    return;
  }

  const reply = addAutomatedDisclosure(generated, isFirstReply);
  const parts = splitInstagramReply(reply);
  if (!parts.length) {
    await prisma.aiMessage.update({ where: { id: claim.id }, data: { status: "FAILED" } });
    return;
  }

  try {
    for (const part of parts) {
      await sendDirectMessage({
        context,
        instagramAccountId: account.instagramId,
        userId: recipientId,
        message: part,
      });
    }
    await prisma.aiMessage.update({
      where: { id: claim.id },
      data: { status: "SENT", content: parts.join("\n") },
    });
  } catch (error) {
    await prisma.aiMessage.update({
      where: { id: claim.id },
      data: { status: "FAILED", content: parts.join("\n").slice(0, 4000) },
    });
    console.error(`[AI] DM send failed; account=${account.id}:`, error instanceof Error ? error.message : "unknown error");
  }
}

export async function replyToCommentWithAi({
  account,
  context,
  commentId,
  commentText,
  mediaId,
}: {
  account: Account;
  context: InstagramContext;
  commentId: string;
  commentText: string;
  mediaId: string;
}): Promise<void> {
  const settings = await getSettings(account.id);
  if (!settings || !commentText.trim()) return;

  const eventId = `out:comment:${commentId}`;
  const existing = await prisma.aiMessage.findUnique({ where: { eventId } });
  if (existing) return;
  if (!(await hasDailyCapacity(account.id, settings.dailyLimit))) {
    reportSkipped("daily reply limit reached", account.id);
    return;
  }

  let claim;
  try {
    claim = await prisma.aiMessage.create({
      data: {
        instagramAccountId: account.id,
        eventId,
        role: "ASSISTANT",
        channel: "COMMENT",
        status: "PENDING",
        content: "",
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return;
    throw error;
  }

  const generated = await generateGeminiReply({
    instructions: `${buildAssistantInstructions(settings.instructions, settings.language)}\n\nYou are replying publicly under a comment. Keep the reply short, respectful, and safe for everyone to see. Identify this as an automated reply.`,
    messages: [{ role: "USER", content: commentText.slice(0, 2000) }],
    maxOutputTokens: 120,
  });
  const reply = generated ? `🤖 Avtomatik javob: ${generated}` : null;
  const parts = reply ? splitInstagramReply(reply, 1000, 1) : [];
  if (!parts.length) {
    await prisma.aiMessage.update({ where: { id: claim.id }, data: { status: "FAILED" } });
    return;
  }

  try {
    await sendCommentReply({ context, commentId, message: parts[0], postId: mediaId });
    await prisma.aiMessage.update({
      where: { id: claim.id },
      data: { status: "SENT", content: parts[0] },
    });
  } catch (error) {
    await prisma.aiMessage.update({
      where: { id: claim.id },
      data: { status: "FAILED", content: parts[0] },
    });
    console.error(`[AI] Comment reply failed; account=${account.id}:`, error instanceof Error ? error.message : "unknown error");
  }
}

export async function pauseAiForHumanReply({ accountId, recipientId }: { accountId: string; recipientId: string }): Promise<void> {
  const conversation = await prisma.aiConversation.findUnique({
    where: { instagramAccountId_recipientId: { instagramAccountId: accountId, recipientId } },
    select: { id: true },
  });
  if (!conversation) return;
  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: { pausedUntil: new Date(Date.now() + 12 * 60 * 60 * 1000) },
  });
}

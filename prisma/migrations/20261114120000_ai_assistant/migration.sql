CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "AiMessageChannel" AS ENUM ('DM', 'COMMENT');
CREATE TYPE "AiMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "instructions" TEXT NOT NULL DEFAULT '',
    "dailyLimit" INTEGER NOT NULL DEFAULT 30,
    "language" TEXT NOT NULL DEFAULT 'uz-Latn',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "pausedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "conversationId" TEXT,
    "eventId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "channel" "AiMessageChannel" NOT NULL,
    "status" "AiMessageStatus" NOT NULL DEFAULT 'PENDING',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSettings_instagramAccountId_key" ON "AiSettings"("instagramAccountId");
CREATE UNIQUE INDEX "AiConversation_instagramAccountId_recipientId_key" ON "AiConversation"("instagramAccountId", "recipientId");
CREATE INDEX "AiConversation_instagramAccountId_lastInboundAt_idx" ON "AiConversation"("instagramAccountId", "lastInboundAt");
CREATE UNIQUE INDEX "AiMessage_eventId_key" ON "AiMessage"("eventId");
CREATE INDEX "AiMessage_instagramAccountId_channel_status_createdAt_idx" ON "AiMessage"("instagramAccountId", "channel", "status", "createdAt");
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

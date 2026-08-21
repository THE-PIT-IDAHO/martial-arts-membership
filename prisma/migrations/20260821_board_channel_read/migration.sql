-- Per-member, per-channel "last read" timestamp for the Dojo Board.
-- Powers the unread-post badge on the portal Messages tab + home pill.
CREATE TABLE "MemberBoardChannelRead" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemberBoardChannelRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberBoardChannelRead_memberId_channelId_key"
  ON "MemberBoardChannelRead"("memberId", "channelId");

CREATE INDEX "MemberBoardChannelRead_memberId_idx"
  ON "MemberBoardChannelRead"("memberId");

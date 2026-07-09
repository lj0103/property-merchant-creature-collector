CREATE TABLE "GuestSession" (
    "sessionToken" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "socketId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("sessionToken")
);

CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostPlayerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "players" JSONB NOT NULL,
    "gameState" JSONB,
    "processedActionIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestSession_playerId_key" ON "GuestSession"("playerId");
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");
CREATE INDEX "Room_code_idx" ON "Room"("code");
CREATE INDEX "Room_hostPlayerId_idx" ON "Room"("hostPlayerId");
CREATE INDEX "Room_status_idx" ON "Room"("status");

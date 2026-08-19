-- CreateTable
CREATE TABLE "ProviderAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT,
    "displayName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" DATETIME,
    "scopes" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrackMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceProvider" TEXT NOT NULL,
    "sourceTrackId" TEXT NOT NULL,
    "targetProvider" TEXT NOT NULL,
    "targetTrackId" TEXT NOT NULL,
    "targetTitle" TEXT,
    "targetArtists" TEXT,
    "targetUrl" TEXT,
    "confidence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SearchCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "queryKey" TEXT NOT NULL,
    "results" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TransferJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceProvider" TEXT NOT NULL,
    "sourcePlaylistId" TEXT NOT NULL,
    "sourcePlaylistName" TEXT NOT NULL,
    "targetProvider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "targetPlaylistId" TEXT,
    "targetPlaylistName" TEXT,
    "targetPlaylistUrl" TEXT,
    "status" TEXT NOT NULL,
    "phase" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "matchedItems" INTEGER NOT NULL DEFAULT 0,
    "reviewItems" INTEGER NOT NULL DEFAULT 0,
    "unmatchedItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "addedItems" INTEGER NOT NULL DEFAULT 0,
    "skippedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "TransferItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sourceTrackId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artists" TEXT NOT NULL,
    "album" TEXT,
    "durationMs" INTEGER,
    "isrc" TEXT,
    "sourceUrl" TEXT,
    "imageUrl" TEXT,
    "targetTrackId" TEXT,
    "targetTitle" TEXT,
    "targetArtists" TEXT,
    "targetUrl" TEXT,
    "confidence" INTEGER,
    "reason" TEXT,
    "candidates" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    CONSTRAINT "TransferItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TransferJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccount_provider_key" ON "ProviderAccount"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "TrackMap_sourceProvider_sourceTrackId_targetProvider_key" ON "TrackMap"("sourceProvider", "sourceTrackId", "targetProvider");

-- CreateIndex
CREATE UNIQUE INDEX "SearchCache_provider_queryKey_key" ON "SearchCache"("provider", "queryKey");

-- CreateIndex
CREATE INDEX "TransferItem_jobId_position_idx" ON "TransferItem"("jobId", "position");

-- CreateIndex
CREATE INDEX "TransferItem_jobId_status_idx" ON "TransferItem"("jobId", "status");

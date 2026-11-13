-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "bookstackBaseUrl" TEXT NOT NULL DEFAULT 'https://documentation.xperteam.net',
    "anythingllmBaseUrl" TEXT NOT NULL DEFAULT 'https://jarvis.xperteam.net',
    "workspaceSlug" TEXT,
    "bookstackInstanceId" TEXT NOT NULL DEFAULT 'documentation.xperteam.net',
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleIntervalMin" INTEGER NOT NULL DEFAULT 60,
    "removalPolicy" TEXT NOT NULL DEFAULT 'manual_approval',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CredentialRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SourcePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT NOT NULL,
    "bookstackId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bookId" INTEGER,
    "bookName" TEXT,
    "chapterId" INTEGER,
    "chapterName" TEXT,
    "sourceUrl" TEXT,
    "sourceUpdatedAt" DATETIME,
    "contentHash" TEXT,
    "state" TEXT NOT NULL DEFAULT 'NEW',
    "lastSeenAt" DATETIME,
    "lastSyncAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TargetDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourcePageId" TEXT NOT NULL,
    "workspaceSlug" TEXT NOT NULL,
    "documentPath" TEXT NOT NULL,
    "publishedHash" TEXT,
    "indexedAt" DATETIME,
    "ownership" TEXT NOT NULL DEFAULT 'CONNECTOR_OWNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TargetDocument_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "SourcePage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "actor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "progressDone" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "phase" TEXT,
    "countersJson" TEXT NOT NULL DEFAULT '{}',
    "errorSummary" TEXT
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sourcePageId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "diagnosticCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SyncRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PendingRemoval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourcePageId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "decision" TEXT,
    "decisionReason" TEXT
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JobLock" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "leaseUntil" DATETIME NOT NULL,
    "heartbeatAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CredentialRef_kind_key" ON "CredentialRef"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePage_sourceKey_key" ON "SourcePage"("sourceKey");

-- CreateIndex
CREATE INDEX "SourcePage_state_idx" ON "SourcePage"("state");

-- CreateIndex
CREATE INDEX "SourcePage_bookId_idx" ON "SourcePage"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetDocument_sourcePageId_key" ON "TargetDocument"("sourcePageId");

-- CreateIndex
CREATE INDEX "SyncRun_status_idx" ON "SyncRun"("status");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "SyncEvent_runId_idx" ON "SyncEvent"("runId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");


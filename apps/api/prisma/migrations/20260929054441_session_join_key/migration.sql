-- AlterTable
ALTER TABLE "LiveRoom" ADD COLUMN     "joinKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requireKey" BOOLEAN NOT NULL DEFAULT true;

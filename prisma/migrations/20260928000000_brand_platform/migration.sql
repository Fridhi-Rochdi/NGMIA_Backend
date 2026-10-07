-- Persist the whole generated brand platform. Until now only the tagline and
-- description were kept; mission, voice, promise and art direction were
-- generated, paid for and thrown away, so no other generator could use them.
ALTER TABLE "brands" ADD COLUMN "mission" TEXT;
ALTER TABLE "brands" ADD COLUMN "vision" TEXT;
ALTER TABLE "brands" ADD COLUMN "personality" TEXT;
ALTER TABLE "brands" ADD COLUMN "messagingAngle" TEXT;
ALTER TABLE "brands" ADD COLUMN "voice" TEXT;
ALTER TABLE "brands" ADD COLUMN "logoConcept" TEXT;
ALTER TABLE "brands" ADD COLUMN "visualStyle" TEXT;

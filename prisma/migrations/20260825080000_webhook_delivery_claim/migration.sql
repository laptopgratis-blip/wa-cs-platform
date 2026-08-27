-- Klaim eksklusif per delivery (fix race deliverOne + retry cron).
ALTER TABLE "WebhookDelivery" ADD COLUMN "claimedAt" TIMESTAMP(3);

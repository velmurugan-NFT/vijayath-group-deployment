-- Set 10 lakh (₹10,00,000) approval limit for all existing users
UPDATE "User" SET "approvalLimit" = 1000000 WHERE "approvalLimit" = 0;

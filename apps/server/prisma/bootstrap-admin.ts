import { prisma } from "../src/lib/prisma";

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("usage: tsx prisma/bootstrap-admin.ts <email>");
    process.exit(1);
  }
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN" },
    create: { email, role: "ADMIN", displayName: "Admin", emailVerified: true },
  });
  console.log(`admin ready: ${user.email} (role ${user.role}).`);
  console.log(`enrol a passkey at /signup using this email (the account has no passkey yet).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

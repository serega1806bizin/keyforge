import { prisma } from "../src/lib/prisma";

const SCOPES = ["openid", "profile", "email", "offline_access"];

function origin(url: string | undefined, fallbackPort: number): string {
  return (url ?? `http://localhost:${fallbackPort}`).replace(/\/$/, "");
}

const CLIENTS = [
  { clientId: "sample-rp", name: "Sample RP", origin: origin(process.env["SAMPLE_RP_URL"], 4000) },
  {
    clientId: "sample-rp-2",
    name: "Sample RP 2",
    origin: origin(process.env["SAMPLE_RP_2_URL"], 4001),
  },
];

async function main(): Promise<void> {
  for (const c of CLIENTS) {
    const data = {
      name: c.name,
      redirectUris: [`${c.origin}/callback`],
      postLogoutUris: [c.origin],
      allowedScopes: SCOPES,
    };
    const client = await prisma.oidcClient.upsert({
      where: { clientId: c.clientId },
      update: data,
      create: { clientId: c.clientId, type: "PUBLIC", tokenAuthMethod: "none", ...data },
    });
    console.log(`seeded OIDC client: ${client.clientId} -> ${c.origin}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

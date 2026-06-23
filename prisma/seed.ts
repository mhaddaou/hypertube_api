import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

async function main() {
  const clientId = process.env.OAUTH_CLIENT_ID ?? 'hypertube-backoffice';
  const clientSecret = process.env.OAUTH_CLIENT_SECRET ?? 'change-me-in-env';
  const clientName = process.env.OAUTH_CLIENT_NAME ?? 'Hypertube Backoffice';
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed OAuthClient');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const clientSecretHash = await bcrypt.hash(clientSecret, 12);

  await prisma.oAuthClient.upsert({
    where: { clientId },
    update: {
      clientSecret: clientSecretHash,
      name: clientName,
    },
    create: {
      clientId,
      clientSecret: clientSecretHash,
      name: clientName,
    },
  });

  await prisma.$disconnect();

  console.log(`Seeded OAuth client "${clientId}"`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

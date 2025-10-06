import "dotenv/config";
import bcrypt from "bcrypt";

import { db, pool } from "../server/db";
import { users } from "../shared/schema";

const USERNAME = "luonghvpp03220@gmail.com";
const PLAINTEXT_PASSWORD = "Zocl00zonx";

async function seed() {
  try {
    const hashedPassword = await bcrypt.hash(PLAINTEXT_PASSWORD, 12);

    const [user] = await db
      .insert(users)
      .values({ username: USERNAME, password: hashedPassword })
      .onConflictDoUpdate({
        target: users.username,
        set: { password: hashedPassword },
      })
      .returning({ id: users.id, username: users.username });

    if (user) {
      console.log("Seeded user:", user);
    } else {
      console.log("User seed executed, no row returned");
    }
  } finally {
    await pool.end();
  }
}

seed()
  .then(() => {
    console.log("Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to seed user", error);
    process.exit(1);
  });

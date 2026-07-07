import "../src/bootstrap";
import { hash } from "bcryptjs";
import sequelize from "../src/database";
import User from "../src/models/User";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  // eslint-disable-next-line no-console
  console.error("Usage: npm run set:user-password -- email@dominio senha");
  process.exit(1);
}

const run = async (): Promise<void> => {
  await sequelize.authenticate();

  const user = await User.findOne({
    where: sequelize.where(
      sequelize.fn("LOWER", sequelize.col("email")),
      email.toLowerCase()
    )
  });

  if (!user) {
    // eslint-disable-next-line no-console
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const passwordHash = await hash(password, 8);
  await user.update({ passwordHash });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        id: user.id,
        email: user.email,
        profile: user.profile,
        companyId: user.companyId
      },
      null,
      2
    )
  );

  process.exit(0);
};

run().catch(error => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

import "../src/bootstrap";
import sequelize from "../src/database";
import User from "../src/models/User";

const email = process.argv[2] || "thiago@fortmax.com.br";

const run = async (): Promise<void> => {
  await sequelize.authenticate();
  const user = await User.findOne({
    where: sequelize.where(
      sequelize.fn("LOWER", sequelize.col("email")),
      email.toLowerCase()
    ),
    include: ["queues", "company"]
  });

  if (!user) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ found: false, email }, null, 2));
    process.exit(1);
  }

  const passwordOk = await user.checkPassword("thiago@fortmax");

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        found: true,
        id: user.id,
        email: user.email,
        name: user.name,
        profile: user.profile,
        companyId: user.companyId,
        queueCount: user.queues?.length || 0,
        queues: (user.queues || []).map(q => ({ id: q.id, name: q.name })),
        passwordMatchesThiagoFortmax: passwordOk
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

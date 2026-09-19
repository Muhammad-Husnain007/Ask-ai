import { ensureUsers, runSeed, TEST_PASSWORD } from './_helpers.js';

await runSeed('auth', async () => {
  const users = await ensureUsers();
  users.forEach((user, index) => {
    console.log(`${index + 1}. ${user.name}  ${user.email}  ${user.role}  ${user.id}`);
  });
  console.log(`password for all: ${TEST_PASSWORD}`);
});

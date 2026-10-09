require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!supabaseUrl) {
    console.error("Error: Missing SUPABASE_URL environment variable.");
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error("Error: Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
    process.exit(1);
  }
  if (!username) {
    console.error("Error: Missing ADMIN_USERNAME environment variable.");
    process.exit(1);
  }
  if (!password) {
    console.error("Error: Missing ADMIN_PASSWORD environment variable.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { data, error } = await supabase
      .from("admins")
      .insert([{ username: username, password_hash: passwordHash }])
      .select();

    if (error) {
      if (error.code === "23505") {
        console.error(`Error: Admin user "${username}" already exists.`);
        process.exit(1);
      }
      console.error("Error creating admin user:", error.message);
      process.exit(1);
    }

    console.log(`Successfully created admin user: ${username}`);
    process.exit(0);
  } catch (err) {
    console.error("Unexpected error:", err.message);
    process.exit(1);
  }
}

main();
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests must never reach real Agora or Supabase.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SECRET_KEY: "sb_secret_test",
      NEXT_PUBLIC_AGORA_APP_ID: "0123456789abcdef0123456789abcdef",
      AGORA_APP_CERTIFICATE: "fedcba9876543210fedcba9876543210",
      AGORA_CUSTOMER_ID: "test-customer",
      AGORA_CUSTOMER_SECRET: "test-secret",
    },
  },
});

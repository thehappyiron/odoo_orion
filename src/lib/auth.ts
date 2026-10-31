import { betterAuth } from "better-auth";
import { authOptions } from "./auth-config";
export { passwordValid } from "./auth-config";
export const auth = betterAuth(authOptions);

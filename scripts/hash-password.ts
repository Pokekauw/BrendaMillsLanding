import { hashPassword } from "../server/auth.js";

function secret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    if (!input.isTTY) { reject(new Error("Run this command in an interactive terminal so the password is not echoed.")); return; }
    let value = "";
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (character: string) => {
      if (character === "\u0003") { cleanup(); output.write("\n"); reject(new Error("Cancelled.")); return; }
      if (character === "\r" || character === "\n") { cleanup(); output.write("\n"); resolve(value); return; }
      if (character === "\u007f" || character === "\b") { value = value.slice(0, -1); return; }
      if (character === "\u0015") { value = ""; return; }
      if (!/[\u0000-\u001f\u007f]/.test(character)) value += character;
    };
    const cleanup = () => { input.removeListener("data", onData); input.setRawMode(false); input.pause(); };
    input.on("data", onData);
  });
}

try {
  const password = await secret("New admin password (at least 12 characters, hidden): ");
  const confirmation = await secret("Confirm password: ");
  if (password !== confirmation) throw new Error("The passwords did not match.");
  const hash = await hashPassword(password);
  console.log("\nAdd this line to your private .env file or hosting environment:\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log("\nKeep the password itself in your password manager. Never put it in VITE_* variables or commit .env.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not create password hash.");
  process.exitCode = 1;
}

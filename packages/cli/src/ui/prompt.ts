import inquirer from "inquirer";

export async function confirmContinue(message: string, defaultYes: boolean): Promise<boolean> {
  const { ok } = await inquirer.prompt<{ ok: boolean }>([
    {
      type: "confirm",
      name: "ok",
      message,
      default: defaultYes,
    },
  ]);
  return ok;
}

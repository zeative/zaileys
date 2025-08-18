import chalk from "chalk";

export const sendError = (text: string) => new Error(chalk.red(text))

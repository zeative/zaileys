import chalk from "chalk";
import figlet from "figlet";

export const displayBanner = async (text: string = "ZAILEYS") => {
  figlet(text, async (err, data) => {
    if (err) return;
    console.log(chalk.gray.italic(data));
  });
};

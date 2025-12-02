import { delay } from "baileys";
import { store } from "../Modules/store";

export const autoDisplayBanner = async () => {
  await store.spinner.start("Anjayy...");
  await delay(2000);
  await store.spinner.success("Tunggu...");
  await delay(2000);
  await store.spinner.loop();
  await store.spinner.error("Tunggu dulu...");
  await delay(2000);
  await store.spinner.loop();
};
